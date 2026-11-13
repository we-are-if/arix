import { matchChatProducts, resolvePriceAnswer, findChatCustomer, chatNormalize } from "./chatPriceQuery.js";
import { pendingApprovalItems, approvalWaitHours, describeApprovalWait } from "./approvalSla.js";

export const ASSISTANT_NAME = "AriX Asistan";

const STATUS_LABELS = {
  new: "Yeni",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  delivered: "Teslim edildi",
  fulfilled: "Tamamlandı",
  cancelled: "İptal",
};
const statusLabel = (status) => STATUS_LABELS[status] || status || "Bilinmiyor";
const money = (value, currency) => `${Number(value || 0).toLocaleString("tr-TR")} ${currency}`.trim();
const digitsOf = (value) => String(value || "").replace(/\D/g, "");
const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);
const dateLabel = (value) => {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value || "-") : date.toLocaleDateString("tr-TR");
};

const NOISE_WORDS = new Set([
  "fiyat", "fiyati", "fiyatı", "kac", "kaç", "para", "ne", "kadar", "stok", "stokta", "stoklar", "stogu", "stoğu",
  "var", "mi", "mı", "mu", "mü", "siparis", "sipariş", "durum", "durumu", "nedir", "oldur", "oldu", "bakiye", "borc",
  "borç", "alacak", "hesap", "lutfen", "lütfen", "acaba", "bana", "icin", "için", "tane", "goster", "göster",
  "soyle", "söyle", "bekleyen", "onay", "onayi", "onayı", "teslim", "sevk", "sevkiyat", "geciken", "gecikmis",
  "gecikmiş", "bugun", "bugün", "ozet", "özet", "liste", "listesi", "kacta", "kaçta", "hangi", "neler", "nelerdir",
]);

export function stripAssistantNoise(text) {
  const words = String(text || "")
    .split(/[\s,.!?;:()]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !NOISE_WORDS.has(chatNormalize(word)));
  return words.join(" ").trim();
}

export function findAssistantOrder(db, text) {
  for (const candidate of String(text || "").match(/\d{2,}/g) || []) {
    const order = (db.orderBoard || []).find((item) => digitsOf(item?.number) === candidate);
    if (order) return order;
  }
  return null;
}

const has = (text, words) => words.some((word) => chatNormalize(text).includes(chatNormalize(word)));

function orderAnswer(db, order) {
  const form = order.approvalForm;
  const lines = [
    `${order.number} · ${order.customerName || "Müşteri belirtilmemiş"} · ${statusLabel(order.status)}`,
    `Tarih: ${dateLabel(order.businessDate || order.createdAt)}`,
  ];
  if (form?.number) lines.push(`Form: ${form.number} · ${form.status === "approved" ? "Onaylandı" : form.status === "rejected" ? "Reddedildi" : form.submittedForApproval ? "Onay bekliyor" : "Taslak"}`);
  if (order.despatchNumber) lines.push(`İrsaliye: ${order.despatchNumber}`);
  if (order.withoutDespatch) lines.push("İrsaliyesiz sevk");
  return {
    text: lines.join("\n"),
    orderReference: { id: String(order.id), number: String(order.number || ""), customerName: String(order.customerName || ""), status: statusLabel(order.status) },
  };
}

function stockAnswer(db, query) {
  const matches = matchChatProducts(db.products, query);
  if (!matches.length) return { text: `“${query}” için ürün bulunamadı.` };
  const describe = (product) => {
    const warehouses = Object.entries(product.warehouses || {}).filter(([, value]) => Number(value));
    const total = warehouses.reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
    const detail = warehouses.map(([name, value]) => `${name}: ${Number(value)}`).join(" · ");
    return `${product.name} (${product.code || product.sku || "-"}) · Stok: ${total} ${product.unit || "mt"}${detail ? `\n${detail}` : ""}`;
  };
  return { text: matches.map(({ product }) => describe(product)).join("\n\n") };
}

function approvalAnswer(db) {
  const items = pendingApprovalItems(db);
  if (!items.length) return { text: "Onay bekleyen form yok." };
  const now = Date.now();
  const sorted = [...items].sort((left, right) => approvalWaitHours(right.submittedAt, now) - approvalWaitHours(left.submittedAt, now));
  const lines = sorted.slice(0, 5).map((item) => `· ${item.number || item.documentLabel} · ${item.customerName} · ${describeApprovalWait(approvalWaitHours(item.submittedAt, now))}`);
  const tail = sorted.length > 5 ? `\n… ve ${sorted.length - 5} form daha` : "";
  return { text: `${items.length} form onay bekliyor:\n${lines.join("\n")}${tail}` };
}

function overdueAnswer(db) {
  const today = dayKey();
  const pending = (db.orderBoard || []).filter((order) => {
    if (!order || order.isTest || order.isLoanReturn) return false;
    if (["delivered", "fulfilled", "cancelled"].includes(order.status)) return false;
    return String(order.businessDate || "").slice(0, 10) < today;
  });
  if (!pending.length) return { text: "Teslim edilmeyi bekleyen gecikmiş sipariş yok." };
  const lines = pending.slice(0, 5).map((order) => `· ${order.number} · ${order.customerName || "-"} · ${dateLabel(order.businessDate)} · ${statusLabel(order.status)}`);
  return { text: `${pending.length} sipariş teslim edilmedi:\n${lines.join("\n")}${pending.length > 5 ? `\n… ve ${pending.length - 5} sipariş daha` : ""}` };
}

function customerAnswer(db, customer, currency) {
  const orders = (db.orderBoard || []).filter((order) => chatNormalize(order.customerName) === chatNormalize(customer.name)).slice(-3).reverse();
  const lines = [`${customer.name} · bakiye: ${money(customer.balance, currency)}`];
  if (orders.length) lines.push(`Son siparişler: ${orders.map((order) => `${order.number} (${statusLabel(order.status)})`).join(", ")}`);
  return { text: lines.join("\n") };
}

function summaryAnswer(db, currency) {
  const today = dayKey();
  const todays = (db.orderBoard || []).filter((order) => String(order.businessDate || order.createdAt || "").slice(0, 10) === today && !order.isTest);
  const counts = todays.reduce((result, order) => {
    const key = statusLabel(order.status);
    result.set(key, (result.get(key) || 0) + 1);
    return result;
  }, new Map());
  const pending = pendingApprovalItems(db);
  const overdue = (db.orderBoard || []).filter((order) => !["delivered", "fulfilled", "cancelled"].includes(order.status) && String(order.businessDate || "").slice(0, 10) < today).length;
  const lines = [
    `Bugün ${todays.length} sipariş: ${[...counts.entries()].map(([label, count]) => `${count} ${label.toLowerCase()}`).join(" · ") || "kayıt yok"}`,
    `Onay bekleyen: ${pending.length} form`,
    `Teslim edilmeyi bekleyen: ${overdue} sipariş`,
  ];
  if (todays.length) {
    const revenue = todays.reduce((sum, order) => sum + Number(order.total || order.grandTotal || 0), 0);
    if (revenue) lines.push(`Bugünkü toplam: ${money(revenue, currency)}`);
  }
  return { text: lines.join("\n") };
}

export const ASSISTANT_HELP = [
  "Merhaba, ben AriX Asistan. Şunları sorabilirsin:",
  "· 00233 stok — ürün stok durumu",
  "· 00233 fiyat — liste fiyatı",
  "· Abanoz 00233 fiyat — müşteriye özel fiyat",
  "· ORD-1042 — sipariş durumu",
  "· onay bekleyen — onay kuyruğu",
  "· Abanoz bakiye — müşteri bakiyesi",
  "· geciken sevkiyat — teslim edilmeyi bekleyenler",
  "· bugün — günün özeti",
].join("\n");

export function answerAssistant(db, user, text, permissions = {}) {
  const canProducts = permissions.products !== false;
  const canOrders = permissions.orders !== false;
  const canCustomers = permissions.customers !== false;
  const currency = String(db.companySettings?.profile?.currencySymbol || db.companySettings?.profile?.baseCurrency || "");
  const question = String(text || "").trim();
  const cleaned = stripAssistantNoise(question);
  const normalized = chatNormalize(question);

  if (!question) return { text: ASSISTANT_HELP };
  if (has(normalized, ["yardim", "yardım", "ne yapabilirsin", "komut", "help", "neler sorabilirim"]) || ["merhaba", "selam", "hey", "kimsin"].includes(normalized)) {
    return { text: ASSISTANT_HELP };
  }

  const order = canOrders ? findAssistantOrder(db, question) : null;
  const asksPrice = has(normalized, ["fiyat", "kac para", "kaç para", "ne kadar"]);
  const asksStock = has(normalized, ["stok", "stokta", "stogu", "stoğu", "mevcut"]);
  if (order && !asksPrice && !asksStock) return orderAnswer(db, order);

  if (asksPrice) {
    if (!canProducts) return { text: "Fiyat bilgisini görmek için ürün görüntüleme izniniz olmalı." };
    return resolvePriceAnswer(db, cleaned || question, { allowed: true });
  }
  if (asksStock) {
    if (!canProducts) return { text: "Stok bilgisini görmek için ürün görüntüleme izniniz olmalı." };
    return stockAnswer(db, cleaned || question);
  }
  if (has(normalized, ["onay", "bekleyen form", "onaylanmayan"])) {
    if (!canOrders) return { text: "Onay listesini görmek için sipariş görüntüleme izniniz olmalı." };
    return approvalAnswer(db);
  }
  if (has(normalized, ["geciken", "gecikmis", "gecikmiş", "teslim edilmedi", "sevk edilmedi", "bekleyen sevkiyat"])) {
    if (!canOrders) return { text: "Sipariş listesini görmek için sipariş görüntüleme izniniz olmalı." };
    return overdueAnswer(db);
  }
  if (has(normalized, ["bakiye", "borc", "borç", "alacak", "hesap"])) {
    if (!canCustomers) return { text: "Müşteri bakiyesini görmek için cari görüntüleme izniniz olmalı." };
    const customer = findChatCustomer(db, question);
    if (!customer) return { text: "Hangi müşteri? Örnek: “Abanoz bakiye”." };
    return customerAnswer(db, customer, currency);
  }
  if (has(normalized, ["bugun", "bugün", "ozet", "özet", "gunluk", "günlük"])) {
    if (!canOrders) return { text: "Gün özetini görmek için sipariş görüntüleme izniniz olmalı." };
    return summaryAnswer(db, currency);
  }

  // A bare customer or product name is usually a lookup request
  const customer = canCustomers ? findChatCustomer(db, question) : null;
  if (customer && !cleaned) return customerAnswer(db, customer, currency);
  if (canProducts && cleaned) {
    const products = matchChatProducts(db.products, cleaned);
    if (products.length === 1) return stockAnswer(db, cleaned);
  }
  return { text: `Bunu anlayamadım.\n\n${ASSISTANT_HELP}` };
}
