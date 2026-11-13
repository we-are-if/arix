const ENTRY_KINDS = new Set(["income", "expense", "transfer"]);
const ENTRY_CHANGE_ACTIONS = new Set(["update", "delete", "create_backdated"]);

const cleanText = (value, maxLength = 200) => String(value ?? "").trim().slice(0, maxLength);

const normalizeAmount = (kind, value) => {
  const amount = Math.abs(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Məbləğ sıfırdan böyük olmalıdır.");
  return kind === "expense" ? -amount : amount;
};

export function dailyEntryEditFingerprint(entry) {
  return JSON.stringify({
    date: cleanText(entry?.date, 10),
    time: cleanText(entry?.time, 8),
    kind: cleanText(entry?.kind, 20),
    title: cleanText(entry?.title, 160),
    counterparty: cleanText(entry?.counterparty, 200),
    category: cleanText(entry?.category, 120),
    amount: Number(entry?.amount) || 0,
    responsible: cleanText(entry?.responsible, 120),
    targetResponsible: cleanText(entry?.targetResponsible, 120),
    bank: cleanText(entry?.bank, 120),
    targetBank: cleanText(entry?.targetBank, 120),
    note: cleanText(entry?.note, 1000),
    expenseMethod: cleanText(entry?.expenseMethod, 20),
  });
}

export function normalizeDailyEntryChange(currentEntry, proposedEntry) {
  if (!currentEntry || typeof currentEntry !== "object") throw new Error("Düzəldiləcək əməliyyat tapılmadı.");
  if (!proposedEntry || typeof proposedEntry !== "object") throw new Error("Düzəliş məlumatı düzgün deyil.");

  const kind = cleanText(proposedEntry.kind, 20);
  if (!ENTRY_KINDS.has(kind)) throw new Error("Əməliyyat növü düzgün deyil.");

  const responsible = cleanText(proposedEntry.responsible, 120);
  const bank = cleanText(proposedEntry.bank, 120);
  if (!responsible || !bank) throw new Error("Şəxs və hesab/kanal məcburidir.");

  const category = kind === "transfer"
    ? "Hesablararası köçürmə"
    : cleanText(proposedEntry.category, 120);
  if (!category) throw new Error("Kateqoriya seçilməlidir.");

  const targetResponsible = kind === "transfer" ? cleanText(proposedEntry.targetResponsible, 120) : "";
  const targetBank = kind === "transfer" ? cleanText(proposedEntry.targetBank, 120) : "";
  const targetAccountId = kind === "transfer" ? cleanText(proposedEntry.targetAccountId, 220) : "";
  if (kind === "transfer" && (!targetResponsible || !targetBank || !targetAccountId)) {
    throw new Error("Köçürmənin giriş şəxsi və hesabı məcburidir.");
  }

  const normalized = {
    ...currentEntry,
    date: /^\d{4}-\d{2}-\d{2}$/.test(cleanText(proposedEntry.date, 10))
      ? cleanText(proposedEntry.date, 10)
      : cleanText(currentEntry.date, 10),
    time: cleanText(proposedEntry.time, 8) || cleanText(currentEntry.time, 8),
    kind,
    title: kind === "income" ? "Mədaxil" : kind === "expense" ? "Məxaric" : cleanText(proposedEntry.title, 160),
    counterparty: kind === "transfer"
      ? cleanText(proposedEntry.counterparty, 200) || `${targetResponsible} · ${targetBank}`
      : cleanText(proposedEntry.counterparty, 200) || "Qeyd edilməyib",
    category,
    amount: normalizeAmount(kind, proposedEntry.amount),
    accountId: cleanText(proposedEntry.accountId, 220),
    targetAccountId: targetAccountId || undefined,
    responsible,
    targetResponsible: targetResponsible || undefined,
    bank,
    targetBank: targetBank || undefined,
    note: cleanText(proposedEntry.note, 1000),
    expenseMethod: kind === "expense" && bank.toLocaleLowerCase("az-AZ") !== "kassa" && ["online", "same_bank", "diff_bank", "cash_out"].includes(proposedEntry.expenseMethod)
      ? proposedEntry.expenseMethod : undefined,
    id: String(currentEntry.id),
    invoiced: currentEntry.invoiced === true,
    invoiceNo: currentEntry.invoiceNo,
  };
  if (!normalized.accountId) throw new Error("Hesab məlumatı yoxdur.");
  return normalized;
}

export function normalizeDailyEntryCreation(proposedEntry) {
  if (!proposedEntry || typeof proposedEntry !== "object") throw new Error("Yeni əməliyyat məlumatı düzgün deyil.");
  const id = cleanText(proposedEntry.id, 160);
  const date = cleanText(proposedEntry.date, 10);
  if (!id) throw new Error("Yeni əməliyyat identifikatoru yoxdur.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Əməliyyat tarixi düzgün deyil.");
  return normalizeDailyEntryChange({ ...proposedEntry, id, date, invoiced: false, invoiceNo: undefined }, proposedEntry);
}

export function createDailyEntryChangeRequest({ id, action = "update", currentEntry, proposedEntry, actor, reason = "", now = new Date().toISOString() }) {
  const normalizedAction = cleanText(action, 30) || "update";
  if (!ENTRY_CHANGE_ACTIONS.has(normalizedAction)) throw new Error("Sorğu əməliyyatı düzgün deyil.");

  let original = null;
  let proposed = null;
  if (normalizedAction === "create_backdated") {
    proposed = normalizeDailyEntryCreation(proposedEntry);
  } else {
    if (!currentEntry || typeof currentEntry !== "object") throw new Error("Əməliyyat tapılmadı.");
    original = structuredClone(currentEntry);
    if (normalizedAction === "update") {
      proposed = normalizeDailyEntryChange(currentEntry, proposedEntry);
      if (dailyEntryEditFingerprint(currentEntry) === dailyEntryEditFingerprint(proposed)) {
        throw new Error("Dəyişiklik tapılmadı.");
      }
    }
  }

  return {
    id,
    action: normalizedAction,
    entryId: String(currentEntry?.id || proposed?.id || ""),
    status: "pending",
    originalEntry: original,
    proposedEntry: proposed,
    reason: cleanText(reason, 500),
    requestedAt: now,
    requestedById: String(actor?.id || ""),
    requestedBy: cleanText(actor?.name || "AriX Daily", 120),
    resolvedAt: null,
    resolvedById: null,
    resolvedBy: null,
    resolutionNote: "",
  };
}

export function applyDailyEntryChange(snapshot, request, actor, now = new Date().toISOString()) {
  if (!snapshot?.state || !Array.isArray(snapshot.state.entries)) throw new Error("Daily məlumat paketi tapılmadı.");
  if (!request || request.status !== "pending") throw new Error("Bu əməliyyat sorğusu artıq bağlanıb.");
  const action = ENTRY_CHANGE_ACTIONS.has(request.action) ? request.action : "update";
  const nextSnapshot = structuredClone(snapshot);

  if (action === "create_backdated") {
    const nextEntry = {
      ...normalizeDailyEntryCreation(request.proposedEntry),
      createdAt: now,
      createdBy: cleanText(actor?.name || "AriX Daily", 120),
    };
    if (nextSnapshot.state.entries.some((entry) => String(entry.id) === String(nextEntry.id))) {
      throw new Error("Bu əməliyyat artıq dəftərdə mövcuddur.");
    }
    nextSnapshot.state.entries.push(nextEntry);
    return { snapshot: nextSnapshot, entry: nextEntry, action };
  }

  const entryIndex = snapshot.state.entries.findIndex((entry) => String(entry.id) === String(request.entryId));
  if (entryIndex < 0) throw new Error(action === "delete" ? "Silinəcək əməliyyat tapılmadı." : "Düzəldiləcək əməliyyat tapılmadı.");
  const currentEntry = snapshot.state.entries[entryIndex];
  if (dailyEntryEditFingerprint(currentEntry) !== dailyEntryEditFingerprint(request.originalEntry)) {
    throw new Error("Əməliyyat sorğudan sonra dəyişib. Yeni sorğu yaradılmalıdır.");
  }

  if (action === "delete") {
    const [deletedEntry] = nextSnapshot.state.entries.splice(entryIndex, 1);
    return { snapshot: nextSnapshot, entry: deletedEntry, action };
  }

  const nextEntry = {
    ...normalizeDailyEntryChange(currentEntry, request.proposedEntry),
    editedAt: now,
    editedBy: cleanText(actor?.name || "AriX Daily", 120),
  };
  nextSnapshot.state.entries[entryIndex] = nextEntry;
  return { snapshot: nextSnapshot, entry: nextEntry, action };
}
