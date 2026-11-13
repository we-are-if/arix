import { randomUUID } from "node:crypto";
import { normalizeDailyEntryCreation, dailyEntryEditFingerprint } from "./dailyApprovals.js";

export function applyDailyEntryCreation({ current, entry, actor, today }) {
  const record = normalizeDailyEntryCreation(entry);
  const entries = current.snapshot?.state?.entries;
  if (!Array.isArray(entries)) throw new Error("Gündəlik dəftər yüklənməyib.");
  const existing = entries.find((item) => String(item.id) === record.id);
  if (existing) {
    if (dailyEntryEditFingerprint(existing) !== dailyEntryEditFingerprint(record) || existing.accountId !== record.accountId || existing.targetAccountId !== record.targetAccountId || existing.expenseMethod !== record.expenseMethod) {
      throw Object.assign(new Error("Bu əməliyyat artıq başqa məlumatla saxlanılıb. Düzəlişi təsdiqə göndərin."), { statusCode: 409 });
    }
    return { entry: existing, unchanged: true };
  }
  if (record.date < today) throw Object.assign(new Error("Keçmiş tarix əməliyyatını təsdiq sorğusu ilə göndərin."), { statusCode: 409 });
  if ((current.snapshot.state.closes || []).some((close) => close.date === record.date)) throw Object.assign(new Error("Bu gün bağlanıb. Yeni əməliyyat əlavə edilə bilməz."), { statusCode: 409 });
  record.createdAt = new Date().toISOString();
  record.createdBy = String(actor.name || "AriX Daily");
  entries.push(record);
  current.audit ??= [];
  current.audit.push({ id: randomUUID(), action: "daily_entry_created", at: record.createdAt, by: record.createdBy, target: `${record.date} · ${record.counterparty}`, entityType: "entry", entityId: record.id, changes: [{ field: "Məbləğ", before: null, after: record.amount }] });
  return { entry: record };
}
