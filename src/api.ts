type CachedResponse = { savedAt: number; payload: unknown };

const CACHE_PREFIX = "arix:last-good-api:";
const EMPTY_PREFIX = "arix:empty-api-count:";

function canCache(url: string, init: RequestInit) {
  return (
    String(init.method || "GET").toUpperCase() === "GET" &&
    url.startsWith("/api/") &&
    !url.startsWith("/api/auth/")
  );
}

function readCache<T>(url: string): T | null {
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${url}`);
    return raw ? (JSON.parse(raw) as CachedResponse).payload as T : null;
  } catch {
    return null;
  }
}

function writeCache(url: string, payload: unknown) {
  try {
    sessionStorage.setItem(
      `${CACHE_PREFIX}${url}`,
      JSON.stringify({ savedAt: Date.now(), payload } satisfies CachedResponse),
    );
  } catch {
    // Live API data remains authoritative if browser storage is full.
  }
}

function notifyConnection(usingCache: boolean, message = "") {
  window.dispatchEvent(
    new CustomEvent("arix:connection-state", { detail: { usingCache, message } }),
  );
}

function protectAgainstTransientEmpty<T>(url: string, payload: T): T {
  const cached = readCache<T>(url);
  const nextData = (payload as { data?: unknown })?.data;
  const cachedData = (cached as { data?: unknown } | null)?.data;
  if (
    Array.isArray(nextData) && nextData.length === 0 &&
    Array.isArray(cachedData) && cachedData.length > 0
  ) {
    const key = `${EMPTY_PREFIX}${url}`;
    const count = Number(sessionStorage.getItem(key) || 0) + 1;
    sessionStorage.setItem(key, String(count));
    if (count < 2) {
      notifyConnection(true, "Sunucudan boş yanıt alındı; son sağlam veriler korunuyor.");
      return cached as T;
    }
  }
  sessionStorage.removeItem(`${EMPTY_PREFIX}${url}`);
  writeCache(url, payload);
  notifyConnection(false);
  return payload;
}

export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const cacheable = canCache(url, init);
  const attempts = cacheable ? 3 : 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        credentials: init.credentials ?? "same-origin",
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.headers || {}),
        },
      });
      const text = await response.text();
      let payload: unknown = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        throw new Error("Sunucudan geçersiz yanıt alındı.");
      }
      if (response.ok)
        return cacheable ? protectAgainstTransientEmpty(url, payload as T) : payload as T;

      const message = (payload as { error?: string })?.error ?? "API request failed";
      const error = new Error(message);
      if (response.status < 500 && response.status !== 429) throw error;
      lastError = error;
    } catch (cause) {
      lastError = cause instanceof Error ? cause : new Error("Bağlantı kurulamadı.");
      if (!cacheable) throw lastError;
    }
    if (attempt + 1 < attempts)
      await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
  }

  if (cacheable) {
    const cached = readCache<T>(url);
    if (cached) {
      notifyConnection(true, "Bağlantı geçici olarak kesildi; son sağlam veriler gösteriliyor.");
      return cached;
    }
  }
  throw lastError || new Error("Bağlantı kurulamadı.");
}
