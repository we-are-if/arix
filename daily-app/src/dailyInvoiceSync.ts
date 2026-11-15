import type { InvoiceRecord } from "./qaimeParser";

export type InvoiceSyncState = "synced" | "syncing" | "queued" | "failed";

export type QueuedInvoiceAction = {
  queueId: string;
  invoiceId: string;
  action: "upsert" | "approve" | "cancel" | "restart" | "delete";
  invoice?: InvoiceRecord;
  reason?: string;
  approve?: boolean;
  createdAt: string;
  lastAttemptAt?: string;
  attemptCount: number;
  lastError?: string;
};

const QUEUE_STORAGE_KEY = "arix-daily-invoice-queue-v1";
const SYNCED_IDS_STORAGE_KEY = "arix-daily-synced-invoices-v1";

let queue: QueuedInvoiceAction[] = [];
let syncedInvoiceIds: Set<string> = new Set();
let isFlushing = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

function loadFromStorage() {
  try {
    const rawQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (rawQueue) {
      const parsed = JSON.parse(rawQueue);
      if (Array.isArray(parsed)) queue = parsed;
    }
  } catch {
    queue = [];
  }

  try {
    const rawSynced = localStorage.getItem(SYNCED_IDS_STORAGE_KEY);
    if (rawSynced) {
      const parsed = JSON.parse(rawSynced);
      if (Array.isArray(parsed)) syncedInvoiceIds = new Set(parsed);
    }
  } catch {
    syncedInvoiceIds = new Set();
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // quota exceeded or private mode
  }
  try {
    localStorage.setItem(SYNCED_IDS_STORAGE_KEY, JSON.stringify([...syncedInvoiceIds].slice(-1000)));
  } catch {
    // ignore
  }
}

// Initial load
loadFromStorage();

export function subscribeToSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markInvoiceSynced(invoiceId: string) {
  syncedInvoiceIds.add(String(invoiceId));
  queue = queue.filter((item) => String(item.invoiceId) !== String(invoiceId));
  saveToStorage();
  notifyListeners();
}

export function markInvoicesSyncedBatch(invoiceIds: string[]) {
  let changed = false;
  for (const id of invoiceIds) {
    if (!syncedInvoiceIds.has(String(id))) {
      syncedInvoiceIds.add(String(id));
      changed = true;
    }
  }
  if (changed) {
    saveToStorage();
    notifyListeners();
  }
}

export function getInvoiceSyncState(
  invoiceId: string,
  isDraft = false
): { state: InvoiceSyncState; error?: string } {
  const queuedItem = queue.find((item) => String(item.invoiceId) === String(invoiceId));
  if (queuedItem) {
    if (queuedItem.attemptCount > 0 && queuedItem.lastError) {
      return { state: "failed", error: queuedItem.lastError };
    }
    return { state: isFlushing ? "syncing" : "queued" };
  }

  if (syncedInvoiceIds.has(String(invoiceId))) {
    return { state: "synced" };
  }

  // If it's already an active invoice from the server or in memory, it is synced
  return { state: "synced" };
}

export function getPendingQueueCount(): number {
  return queue.length;
}

export function getFailedQueueCount(): number {
  return queue.filter((item) => item.attemptCount > 0 && item.lastError).length;
}

async function executeMutation(item: QueuedInvoiceAction): Promise<{ ok: boolean; revision?: number; data?: any; error?: string }> {
  const targetId = encodeURIComponent(String(item.invoiceId || ""));

  try {
    if (item.action === "upsert") {
      const response = await fetch("/api/daily/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice: item.invoice, approve: Boolean(item.approve) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, error: payload.error || `HTTP ${response.status}` };
      }
      return { ok: true, revision: payload.revision, data: payload.data };
    }

    if (item.action === "approve") {
      const response = await fetch(`/api/daily/invoices/${targetId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, error: payload.error || `HTTP ${response.status}` };
      }
      return { ok: true, revision: payload.revision, data: payload.data };
    }

    if (item.action === "cancel") {
      const response = await fetch(`/api/daily/invoices/${targetId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", reason: item.reason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, error: payload.error || `HTTP ${response.status}` };
      }
      return { ok: true, revision: payload.revision, data: payload.data };
    }

    if (item.action === "restart") {
      const response = await fetch(`/api/daily/invoices/${targetId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restart" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, error: payload.error || `HTTP ${response.status}` };
      }
      return { ok: true, revision: payload.revision, data: payload.data };
    }

    if (item.action === "delete") {
      const response = await fetch(`/api/daily/invoices/${targetId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, error: payload.error || `HTTP ${response.status}` };
      }
      return { ok: true, revision: payload.revision, data: payload.data };
    }

    return { ok: false, error: "Bilinməyən əməliyyat növü" };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Şəbəkə xətası" };
  }
}

export async function flushQueue(
  onSuccessCallback?: (result: { item: QueuedInvoiceAction; data: any; revision?: number }) => void
): Promise<void> {
  if (isFlushing || queue.length === 0) return;
  isFlushing = true;
  notifyListeners();

  try {
    const pendingItems = [...queue];
    for (const item of pendingItems) {
      item.lastAttemptAt = new Date().toISOString();
      item.attemptCount = (item.attemptCount || 0) + 1;

      const result = await executeMutation(item);
      if (result.ok) {
        queue = queue.filter((q) => q.queueId !== item.queueId);
        syncedInvoiceIds.add(String(item.invoiceId));
        saveToStorage();
        if (onSuccessCallback) {
          onSuccessCallback({ item, data: result.data, revision: result.revision });
        }
      } else {
        item.lastError = result.error;
        saveToStorage();
        // If it was a fatal client validation error (e.g. 403 Forbidden or 400 Bad Request),
        // we keep the error visible to the user so they can review or retry.
        // If offline (network error), stop trying the rest of the queue right now.
        if (result.error?.includes("Şəbəkə") || result.error?.includes("Failed to fetch")) {
          break;
        }
      }
    }
  } finally {
    isFlushing = false;
    notifyListeners();
  }
}

export async function enqueueInvoiceMutation(
  mutation: Omit<QueuedInvoiceAction, "queueId" | "createdAt" | "attemptCount">,
  onSuccessCallback?: (result: { item: QueuedInvoiceAction; data: any; revision?: number }) => void
): Promise<{ ok: boolean; data?: any; error?: string }> {
  // Replace any existing queued action for this invoice
  queue = queue.filter((item) => String(item.invoiceId) !== String(mutation.invoiceId));

  const queuedItem: QueuedInvoiceAction = {
    ...mutation,
    queueId: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
  };

  queue.push(queuedItem);
  saveToStorage();
  notifyListeners();

  // Try immediate execution
  queuedItem.lastAttemptAt = new Date().toISOString();
  queuedItem.attemptCount = 1;

  const result = await executeMutation(queuedItem);
  if (result.ok) {
    queue = queue.filter((q) => q.queueId !== queuedItem.queueId);
    syncedInvoiceIds.add(String(queuedItem.invoiceId));
    saveToStorage();
    notifyListeners();
    if (onSuccessCallback) {
      onSuccessCallback({ item: queuedItem, data: result.data, revision: result.revision });
    }
    return { ok: true, data: result.data };
  }

  queuedItem.lastError = result.error;
  saveToStorage();
  notifyListeners();
  return { ok: false, error: result.error };
}

export async function retryInvoiceSync(
  invoiceId: string,
  onSuccessCallback?: (result: { item: QueuedInvoiceAction; data: any; revision?: number }) => void
): Promise<boolean> {
  const item = queue.find((q) => String(q.invoiceId) === String(invoiceId));
  if (!item) return true;

  item.lastAttemptAt = new Date().toISOString();
  item.attemptCount += 1;
  notifyListeners();

  const result = await executeMutation(item);
  if (result.ok) {
    queue = queue.filter((q) => q.queueId !== item.queueId);
    syncedInvoiceIds.add(String(item.invoiceId));
    saveToStorage();
    notifyListeners();
    if (onSuccessCallback) {
      onSuccessCallback({ item, data: result.data, revision: result.revision });
    }
    return true;
  }

  item.lastError = result.error;
  saveToStorage();
  notifyListeners();
  return false;
}

// Background auto-retry timer
if (typeof window !== "undefined") {
  window.setInterval(() => {
    if (queue.length > 0 && !isFlushing) {
      void flushQueue();
    }
  }, 5000);

  window.addEventListener("online", () => {
    if (queue.length > 0) {
      void flushQueue();
    }
  });
}

export const wasInvoiceSynced = (id: string) => syncedInvoiceIds.has(String(id));
