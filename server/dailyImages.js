import { removeSourcePreviews, SOURCE_PREVIEW_KEYS } from "./dailyPreviewRetention.js";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const imageKeys = new Set(["screenshotDataUrl", "returnScreenshotDataUrl"]);
export function createDailyImages(directory) {
  const stores = new Map(), projected = new WeakMap(), urls = new Map();
  let cachedBytes = 0;
  function store(company) {
    if (!["azartmembran", "sparexpert"].includes(company)) throw Error("Unknown image company");
    if (!stores.has(company)) {
      mkdirSync(directory, { recursive: true });
      const db = new DatabaseSync(join(directory, company + ".attachments.sqlite"));
      db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS images(hash TEXT PRIMARY KEY,mime TEXT NOT NULL,data BLOB NOT NULL)");
      stores.set(company, db);
    }
    return stores.get(company);
  }
  const error = () => Object.assign(new Error("Qaimə şəkli tapılmadı və ya başqa şirkətə aiddir."), { statusCode: 400 });
  function project(value, company) {
    if (!value || typeof value !== "object") return value;
    const cached = projected.get(value);
    if (cached?.company === company) return cached.value;
    const result = Array.isArray(value) ? value.map((v) => project(v, company)) : Object.fromEntries(Object.entries(value).filter(([key]) => company !== "azartmembran" || !SOURCE_PREVIEW_KEYS.has(key)).map(([key, v]) => {
      const match = imageKeys.has(key) && typeof v === "string" && /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(v);
      if (!match) return [key, project(v, company)];
      const known = urls.get(v);
      if (known?.company === company) return [key, known.url];
      const bytes = Buffer.from(match[2], "base64");
      const hash = createHash("sha256").update(match[1]).update(bytes).digest("hex");
      store(company).prepare("INSERT OR IGNORE INTO images(hash,mime,data) VALUES(?,?,?)").run(hash, match[1], bytes);
      const url = `/api/daily/image/${company}/${hash}`;
      if (!known) cachedBytes += v.length;
      urls.set(v, { company, url });
      while (cachedBytes > 64_000_000) { const oldest = urls.keys().next().value; cachedBytes -= oldest.length; urls.delete(oldest); }
      return [key, url];
    }));
    projected.set(value, { company, value: result });
    return result;
  }
  function hydrate(value, company) {
    if (company === "azartmembran") { removeSourcePreviews(value); return value; }
    if (!value || typeof value !== "object") return value;
    for (const [key, v] of Object.entries(value)) {
      if (imageKeys.has(key) && typeof v === "string" && v.startsWith("/api/daily/image/")) {
        const match = /^\/api\/daily\/image\/(azartmembran|sparexpert)\/([a-f0-9]{64})$/.exec(v);
        if (!match || match[1] !== company) throw error();
        const row = store(company).prepare("SELECT mime,data FROM images WHERE hash=?").get(match[2]);
        if (!row) throw error();
        value[key] = `data:${row.mime};base64,${Buffer.from(row.data).toString("base64")}`;
      } else hydrate(v, company);
    }
    return value;
  }
  function get(company, hash) {
    if (company === "azartmembran") return null;
    if (!/^[a-f0-9]{64}$/.test(hash || "")) return null;
    return store(company).prepare("SELECT mime,data FROM images WHERE hash=?").get(hash) || null;
  }
  return { project, hydrate, get, close() { for (const db of stores.values()) db.close(); } };
}
