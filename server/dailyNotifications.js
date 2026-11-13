import { randomUUID } from "node:crypto";
import { stageDailyPush } from "./dailyPushOutbox.js";

// Change detection only needs identities/statuses, never invoice screenshots.
const noticeBaseline = (snapshot) => ({
  state: {
    entries: (snapshot?.state?.entries || []).map(({ id }) => ({ id })),
    closes: (snapshot?.state?.closes || []).map(({ date }) => ({ date })),
  },
  invoices: (snapshot?.invoices || []).map(({ id, status }) => ({ id, status })),
});

export const DAILY_NOTICE_CATEGORIES = ["income", "expense", "supplier", "transfer", "invoice", "approval", "day_close"];
export function dailyNoticeCategory(item) {
  if (item.type === "daily_day_closed") return "day_close";
  if (item.preferenceCategory) return item.preferenceCategory;
  if (item.type?.startsWith("daily_invoice_")) return "invoice";
  if (item.type?.startsWith("daily_entry_request_")) return "approval";
  if (item.type === "daily_payment_created") {
    if (item.title?.startsWith("Mədaxil")) return "income";
    if (item.title?.startsWith("Məxaric")) return "expense";
    if (item.title?.startsWith("Köçürmə")) return "transfer";
  }
}
export function allowsDailyNotice(current, userId, item) {
  const category = dailyNoticeCategory(item);
  return !category || !(current.dailyNoticePreferences?.[String(userId)] || []).includes(category);
}

// Opt in explicitly: other companies keep their existing store and notification flow.
export function withAzartNotifications({ store, current, companyId, enableSparexpert = false, actor, hasPermission, sendPush, onPushError = () => {} }) {
  const spare = companyId === "sparexpert" && enableSparexpert;
  if (companyId !== "azartmembran" && !spare) return store;
  let before = noticeBaseline(current.snapshot);
  return {
    async write(next, { deferPush = false } = {}) {
      const events = buildAzartNotificationEvents(before, next.snapshot, { spare });
      const notifications = [];
      for (const event of events) {
        const seen = new Set();
        for (const user of next.authUsers || []) {
          if (!user?.id || user.active === false || seen.has(String(user.id))) continue;
          if (!hasPermission(user, "daily.view") || !allowsDailyNotice(next, user.id, event)) continue;
          if (event.type.startsWith("daily_invoice_") &&
              !hasPermission(user, event.type === "daily_invoice_draft_pending" ? "daily.invoices.approve" : "daily.invoices.view")) continue;
          seen.add(String(user.id));
          const actorName = String(actor.name || "").trim();
          notifications.push({ ...event, title: actorName ? `${event.title} (${actorName})` : event.title, id: randomUUID(), recipientUserId: user.id,
            companyId, createdAt: new Date().toISOString(), createdBy: actor.name, readAt: null });
        }
      }
      next.notifications = [...(next.notifications || []), ...notifications].slice(-500);
      if (store.supportsAtomicPush) {
        for (const notification of notifications) stageDailyPush(next, { ...notification, body: notification.message });
      }
      // Commit the operation and its in-app notifications together before sending push.
      const result = await store.write(next);
      before = noticeBaseline(next.snapshot);
      if (store.supportsAtomicPush) return result;
      const pushDelivery = Promise.allSettled(notifications.map(async (notification) => {
        try {
          await sendPush(next, { ...notification, body: notification.message });
        } catch (error) {
          onPushError(error);
        }
      }));
      if (!deferPush) await pushDelivery;
      return result;
    },
  };
}

export function buildAzartNotificationEvents(before, after, { spare = false } = {}) {
  const events = [];
  const previousEntries = new Map((before?.state?.entries || []).map((entry) => [String(entry.id), entry]));
  for (const entry of after?.state?.entries || []) {
    if (!entry.id || previousEntries.has(String(entry.id)) || !["income", "expense", "transfer"].includes(entry.kind)) continue;
    const amount = Math.abs(Number(entry.amount));
    if (!Number.isFinite(amount) || amount <= 0 || (entry.kind !== "expense" && Number(entry.amount) < 0)) continue;
    const label = { income: "Mədaxil", expense: "Məxaric", transfer: "Köçürmə" }[entry.kind];
    const preferenceCategory = !spare && entry.kind === "expense" && String(entry.category || "").toLocaleLowerCase("az").includes("təch") ? "supplier" : entry.kind;
    events.push({ type: "daily_payment_created", preferenceCategory, relatedId: String(entry.id), title: `${label} qeydə alındı`,
      message: [entry.counterparty || entry.title || entry.category, `${amount.toFixed(2)} AZN`, entry.bank, entry.date].filter(Boolean).join(" · ") });
  }
  const previousInvoices = new Map((before?.invoices || []).map((invoice) => [String(invoice.id), invoice]));
  for (const invoice of spare ? [] : after?.invoices || []) {
    if (!invoice.id) continue;
    const previous = previousInvoices.get(String(invoice.id));
    const approved = invoice.status === "active" && previous?.status !== "active";
    const pending = invoice.status === "draft" && previous?.status !== "draft";
    if (!approved && !pending) continue;
    events.push({ type: approved ? "daily_invoice_approved" : "daily_invoice_draft_pending",
      relatedId: String(invoice.id), title: approved ? "Qaimə təsdiqləndi" : "Yeni qaimə təsdiq gözləyir",
      message: [`SPF-${invoice.invoiceNo || "?"}`, invoice.customer, approved ? invoice.approvedBy : null].filter(Boolean).join(" · ") });
  }
  const closedDates = new Set((before?.state?.closes || []).map((record) => record.date));
  const money = new Intl.NumberFormat("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  for (const record of after?.state?.closes || []) {
    if (closedDates.has(record.date) || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || "")) continue;
    const t = record.notificationTotals;
    if (!t || ![t.income, t.expense, t.supplier, t.ending].every(Number.isFinite)) continue;
    closedDates.add(record.date);
    const date = new Date(`${record.date}T12:00:00Z`);
    if (!Number.isFinite(date.getTime())) continue;
    const day = new Intl.DateTimeFormat("az-AZ", { day: "numeric", month: "long", timeZone: "Asia/Baku" }).format(date);
    events.push({ type: "daily_day_closed", relatedId: record.date, title: `${day} · Gün bağlandı`,
      message: `Mədaxil: ${money.format(t.income)} ₼ · Məxaric: ${money.format(t.expense)} ₼${spare ? "" : `\nTəchizatçıya ödəniş: ${money.format(t.supplier)} ₼`} · Son qalıq: ${money.format(t.ending)} ₼` });
  }
  return events;
}
