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
  "var", "mi", "mı", "mu", "mü", "varmi", "varmı", "siparis", "sipariş", "durum", "durumu", "nedir", "oldur", "oldu", "bakiye", "borc",
  "borç", "alacak", "hesap", "lutfen", "lütfen", "acaba", "bana", "icin", "için", "tane", "goster", "göster",
  "soyle", "söyle", "bekleyen", "onay", "onayi", "onayı", "teslim", "sevk", "sevkiyat", "geciken", "gecikmis",
  "gecikmiş", "bugun", "bugün", "ozet", "özet", "liste", "listesi", "kacta", "kaçta", "hangi", "neler", "nelerdir",
  "elimizde", "elde", "bizde", "depoda", "depomuzda", "ambarda", "antrepoda", "kaldı", "kaldi", "kalan", "metre", "metrekare", "adet", "top", "rulo",
]);

export function stripAssistantNoise(text) {
  const words = String(text || "")
    .split(/[\s,.!?;:()]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !NOISE_WORDS.has(chatNormalize(word)));
  return words.join(" ").trim();
}

export function matchAssistantProducts(products, query) {
  const normQ = chatNormalize(query);
  const cleaned = stripAssistantNoise(query);
  const normCleaned = chatNormalize(cleaned);

  // 1. Exact code, sku, or full product name in query or cleaned query
  const exact = (products || []).filter((p) => {
    if (!p || p.active === false) return false;
    const code = chatNormalize(p.code);
    const sku = chatNormalize(p.sku);
    const name = chatNormalize(p.name);
    return (code && (normQ.includes(code) || normCleaned.includes(code))) ||
           (sku && (normQ.includes(sku) || normCleaned.includes(sku))) ||
           (name && name.length >= 3 && (normQ.includes(name) || normCleaned.includes(name)));
  });
  if (exact.length) {
    return exact.sort((a, b) => (b.code?.length || 0) - (a.code?.length || 0)).slice(0, 3).map((product) => ({ product, score: 3 }));
  }

  // 2. Token / word matches (e.g. "011" matching "ERSA 011")
  const tokens = normCleaned.split(/[\s,-]+/).filter((w) => w.length >= 2);
  if (tokens.length) {
    const tokenMatched = (products || []).filter((p) => {
      if (!p || p.active === false) return false;
      const codeWords = chatNormalize(p.code).split(/[\s,-]+/);
      const skuWords = chatNormalize(p.sku).split(/[\s,-]+/);
      return tokens.some((t) => codeWords.includes(t) || skuWords.includes(t));
    });
    if (tokenMatched.length) {
      return tokenMatched.slice(0, 3).map((product) => ({ product, score: 2 }));
    }
  }

  // 3. Fallback to matchChatProducts
  const m1 = matchChatProducts(products, cleaned);
  if (m1.length) return m1;
  return matchChatProducts(products, query);
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
    `📦 ${order.number} · ${order.customerName || "Müşteri belirtilmemiş"} · ${statusLabel(order.status)}`,
    `Tarih: ${dateLabel(order.businessDate || order.createdAt)}`,
  ];

  // 1. Ürün Kalemleri
  if (order.items && order.items.length) {
    const itemSummaries = order.items.map((i) => {
      const q = i.preparedQuantity || i.quantity || i.amount || "";
      const u = i.unit || "mt";
      const rolls = i.preparedRollCount ? ` (${i.preparedRollCount} rulo)` : "";
      return `· ${i.productName || i.name || i.code || i.query}: ${q} ${u}${rolls}`;
    });
    lines.push(`Ürünler:\n${itemSummaries.join("\n")}`);
  }

  // 2. Hazırlık Bilgisi
  const preparedPerson = order.preparedBy || order.items?.find((i) => i.preparedBy)?.preparedBy;
  const preparedTime = order.preparedAt || order.readyAt || order.items?.find((i) => i.preparedAt)?.preparedAt;
  if (preparedPerson) {
    const timeStr = preparedTime ? ` (${dateLabel(preparedTime)} ${new Date(preparedTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })})` : "";
    lines.push(`Hazırlayan: ${preparedPerson}${timeStr}`);
  }

  // 3. İrsaliye
  if (order.despatchNumber) {
    lines.push(`İrsaliye: ${order.despatchNumber}${order.despatchReadyBy ? ` (${order.despatchReadyBy})` : ""}`);
  } else if (order.withoutDespatch) {
    lines.push("İrsaliye: İrsaliyesiz sevk");
  }

  // 4. Teslimat & Teslim Eden
  if (order.deliveredBy) {
    const timeStr = order.deliveredAt ? ` (${dateLabel(order.deliveredAt)} ${new Date(order.deliveredAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })})` : "";
    lines.push(`Teslim Eden: ${order.deliveredBy}${timeStr}`);
  }
  if (order.deliveryNote) {
    lines.push(`Teslimat Notu: ${order.deliveryNote}`);
  }

  // 5. Teslimat Fotoğrafları & Belgeler
  const proofs = (order.attachments || []).filter((a) => a.kind === "deliveryProof" || a.mimeType?.startsWith("image/"));
  const docs = (order.attachments || []).filter((a) => a.kind !== "deliveryProof" && !a.mimeType?.startsWith("image/"));
  if (proofs.length) {
    lines.push(`📸 Teslimat Fotoğrafı: ${proofs.length} adet mevcut (${proofs.map((p) => p.name).join(", ")})`);
  }
  if (docs.length) {
    lines.push(`📄 Ek Belgeler: ${docs.map((d) => d.name).join(", ")}`);
  }

  // 6. Onay Formu
  if (form?.number) {
    lines.push(`Onay Formu: ${form.number} · ${form.status === "approved" ? "Onaylandı" : form.status === "rejected" ? "Reddedildi" : form.submittedForApproval ? "Onay bekliyor" : "Taslak"}`);
  }

  return {
    text: lines.join("\n"),
    orderReference: { id: String(order.id), number: String(order.number || ""), customerName: String(order.customerName || ""), status: statusLabel(order.status) },
  };
}

function stockAnswer(db, query) {
  const matches = matchAssistantProducts(db.products, query);
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

export function answerCustomerProductShipment(db, question) {
  const normQ = chatNormalize(question);
  const isShipmentQuery = has(normQ, [
    "gitmis mi", "gitmiş mi", "gitti mi", "sevk edildi mi", "sevk oldu mu", "cikti mi", "çıktı mı",
    "gonderildi mi", "gönderildi mi", "verildi mi", "aldi mi", "aldı mı", "siparis var mi", "sipariş var mı",
    "siparis verdiler mi", "sipariş verdiler mi"
  ]);
  if (!isShipmentQuery) return null;

  const bestCust = findChatCustomer(db, question);
  if (!bestCust) return null;

  const products = matchAssistantProducts(db.products, question).map((m) => m.product);

  const orders = (db.orderBoard || [])
    .filter((o) => chatNormalize(o.customerName) === chatNormalize(bestCust.name))
    .sort((a, b) => String(b.businessDate || b.createdAt).localeCompare(String(a.businessDate || a.createdAt)));

  if (!orders.length) {
    return { text: `${bestCust.name} firmasına ait sistemde herhangi bir sipariş veya sevkiyat kaydı bulunamadı.` };
  }

  if (products.length) {
    const targetProduct = products[0];
    const targetCode = chatNormalize(targetProduct.code);
    const targetSku = chatNormalize(targetProduct.sku);
    const targetName = chatNormalize(targetProduct.name);

    const matchedOrders = [];
    for (const order of orders) {
      for (const item of order.items || []) {
        const itemCode = chatNormalize(item.code || item.sku || "");
        const itemName = chatNormalize(item.productName || item.name || "");
        if ((targetCode && itemCode.includes(targetCode)) ||
            (targetSku && itemCode.includes(targetSku)) ||
            (targetName && itemName.includes(targetName)) ||
            (targetName && targetName.includes(itemName) && itemName.length > 4)) {
          matchedOrders.push({ order, item });
        }
      }
    }

    if (matchedOrders.length) {
      const lines = matchedOrders.slice(0, 3).map(({ order, item }) => {
        const qty = item.quantity || item.qty || item.amount || "";
        const unit = item.unit || "mt";
        return `· Sipariş ${order.number} (${dateLabel(order.businessDate || order.createdAt)}): ${qty} ${unit} — ${statusLabel(order.status)}`;
      });
      return {
        text: `Evet, ${bestCust.name} firmasına ${targetProduct.name} (${targetProduct.code || targetProduct.sku || ""}) kaydı bulunmaktadır:\n${lines.join("\n")}`
      };
    } else {
      const recentItems = [];
      for (const o of orders.slice(0, 3)) {
        for (const i of o.items || []) {
          const iname = i.productName || i.name || i.code;
          if (iname && !recentItems.includes(iname)) recentItems.push(iname);
        }
      }
      const recentDesc = recentItems.slice(0, 3).join(", ");
      return {
        text: `Hayır, ${bestCust.name} firmasının geçmiş sipariş ve sevkiyatlarında ${targetProduct.name} (${targetProduct.code || targetProduct.sku || ""}) bulunmuyor.${recentDesc ? `\nSon sevk edilen ürünler: ${recentDesc}.` : ""}`
      };
    }
  }

  return null;
}

export function answerOperationalQuery(db, question) {
  const normQ = chatNormalize(question);

  const asksPreparation = [
    "kim hazirladi", "kim hazirlamis", "hazirlayan kim", "kim kesti", "kesen kim", "hazirlik durumu"
  ].some((w) => normQ.includes(w));

  const asksDelivery = [
    "kim teslim etti", "kim teslim etmis", "teslim eden kim", "teslimatci kim", "teslimatci", "kime teslim edildi", "teslimat saati", "teslimat notu"
  ].some((w) => normQ.includes(w));

  const asksDespatch = [
    "irsaliye", "irsaliyesi", "irsaliye no", "irsaliye numarasi", "irsaliye kesildi mi", "irsaliye var mi"
  ].some((w) => normQ.includes(w));

  const asksPhoto = [
    "teslimat resmi", "teslimat fotografi", "fotografi var mi", "resmi var mi", "fotograf", "kanit", "resim", "teslim kaniti"
  ].some((w) => normQ.includes(w));

  if (!asksPreparation && !asksDelivery && !asksDespatch && !asksPhoto) return null;

  // Find order either by order number or by customer name
  let order = findAssistantOrder(db, question);
  if (!order) {
    const cust = findChatCustomer(db, question);
    if (cust) {
      order = (db.orderBoard || [])
        .filter((o) => chatNormalize(o.customerName) === chatNormalize(cust.name))
        .sort((a, b) => String(b.businessDate || b.createdAt).localeCompare(String(a.businessDate || a.createdAt)))[0];
    }
  }

  if (!order) return null;

  const prep = order.preparedBy || order.items?.find((i) => i.preparedBy)?.preparedBy;
  const prepTime = order.preparedAt || order.readyAt;
  const deliv = order.deliveredBy;
  const delivTime = order.deliveredAt;
  const desp = order.despatchNumber || (order.withoutDespatch ? "İrsaliyesiz sevk" : null);
  const proofs = (order.attachments || []).filter((a) => a.kind === "deliveryProof" || a.mimeType?.startsWith("image/"));

  if (asksPreparation) {
    if (prep) {
      const timeStr = prepTime ? ` (${dateLabel(prepTime)} ${new Date(prepTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })})` : "";
      return { text: `📦 ${order.number} (${order.customerName}):\nBu siparişi hazırlayan: ${prep}${timeStr}` };
    }
    return { text: `📦 ${order.number} (${order.customerName}):\nHazırlayan personel bilgisi henüz sisteme girilmemiş (Durum: ${statusLabel(order.status)}).` };
  }

  if (asksDelivery) {
    if (deliv) {
      const timeStr = delivTime ? ` (${dateLabel(delivTime)} ${new Date(delivTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })})` : "";
      const noteStr = order.deliveryNote ? `\nTeslimat notu: ${order.deliveryNote}` : "";
      return { text: `🚚 ${order.number} (${order.customerName}):\nTeslim eden: ${deliv}${timeStr}${noteStr}` };
    }
    return { text: `🚚 ${order.number} (${order.customerName}):\nBu sipariş henüz teslim edilmemiş (Durum: ${statusLabel(order.status)}).` };
  }

  if (asksDespatch) {
    if (desp) {
      return { text: `📄 ${order.number} (${order.customerName}):\nİrsaliye Numarası: ${desp}${order.despatchReadyBy ? ` (${order.despatchReadyBy})` : ""}` };
    }
    return { text: `📄 ${order.number} (${order.customerName}):\nİrsaliye henüz kesilmemiş (Durum: ${statusLabel(order.status)}).` };
  }

  if (asksPhoto) {
    if (proofs.length) {
      const proofNames = proofs.map((p) => `· ${p.name}`).join("\n");
      return { text: `📸 ${order.number} (${order.customerName}) için ${proofs.length} adet teslimat kanıt fotoğrafı mevcut:\n${proofNames}` };
    }
    return { text: `📸 ${order.number} (${order.customerName}) için henüz yüklenmiş bir teslimat fotoğrafı bulunmuyor.` };
  }

  return null;
}

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

  if (canOrders) {
    const operationalAnswer = answerOperationalQuery(db, question);
    if (operationalAnswer) return operationalAnswer;
  }

  if (canOrders && canCustomers) {
    const shipmentAnswer = answerCustomerProductShipment(db, question);
    if (shipmentAnswer) return shipmentAnswer;
  }

  const order = canOrders ? findAssistantOrder(db, question) : null;
  const asksStock = has(normalized, [
    "stok", "stokta", "stogu", "stoğu", "stoklar", "mevcut",
    "elimizde", "elde", "bizde", "depoda",
    "kaldı", "kaldi", "kalan",
    "ne kadar var", "kac var", "kaç var",
    "kac metre", "kaç metre", "kac adet", "kaç adet"
  ]);
  const asksPrice = !asksStock && (
    has(normalized, ["fiyat", "fiyati", "fiyatı", "kac para", "kaç para", "tutar", "tutari", "tutarı", "qiymet", "qiymət"]) ||
    (has(normalized, ["ne kadar", "kac", "kaç"]) && !has(normalized, ["var", "kaldı", "kaldi", "elimizde", "depoda"]))
  );
  if (order && !asksPrice && !asksStock) return orderAnswer(db, order);

  if (asksStock) {
    if (!canProducts) return { text: "Stok bilgisini görmek için ürün görüntüleme izniniz olmalı." };
    return stockAnswer(db, cleaned || question);
  }
  if (asksPrice) {
    if (!canProducts) return { text: "Fiyat bilgisini görmek için ürün görüntüleme izniniz olmalı." };
    return resolvePriceAnswer(db, cleaned || question, { allowed: true });
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

export function buildOllamaContext(db, user, question, permissions = {}) {
  const canProducts = permissions.products !== false;
  const canOrders = permissions.orders !== false;
  const canCustomers = permissions.customers !== false;
  const currency = String(db.companySettings?.profile?.currencySymbol || db.companySettings?.profile?.baseCurrency || "₺");
  const today = dayKey();
  const normalized = chatNormalize(question);

  const sections = [];
  sections.push(`Bugünün Tarihi: ${dateLabel(today)}`);
  sections.push(`Para Birimi: ${currency}`);

  // 1. Matched Customer & their order items
  if (canCustomers) {
    const matchedCustomer = findChatCustomer(db, question);
    if (matchedCustomer) {
      const cOrders = canOrders
        ? (db.orderBoard || [])
            .filter((o) => chatNormalize(o.customerName) === chatNormalize(matchedCustomer.name))
            .slice(-6)
            .reverse()
            .map((o) => {
              const items = (o.items || []).map((i) => `${i.productName || i.name || i.code || i.query} (${i.preparedQuantity || i.quantity || i.amount || "?"} ${i.unit || "mt"}${i.preparedRollCount ? `, ${i.preparedRollCount} rulo` : ""})`).join(", ");
              const prep = o.preparedBy || o.items?.find((i) => i.preparedBy)?.preparedBy || "-";
              const deliv = o.deliveredBy ? `${o.deliveredBy} (${dateLabel(o.deliveredAt)})` : "Teslim edilmedi";
              const desp = o.despatchNumber || (o.withoutDespatch ? "İrsaliyesiz" : "-");
              const proofs = (o.attachments || []).filter((a) => a.kind === "deliveryProof" || a.mimeType?.startsWith("image/")).length;
              return `Sipariş ${o.number} [Durum: ${statusLabel(o.status)}, Tarih: ${dateLabel(o.businessDate || o.createdAt)}]:
    Ürünler: ${items || "Kalem yok"}
    Hazırlayan: ${prep} | Teslim Eden: ${deliv} | İrsaliye: ${desp} | Teslimat Kanıt Fotoğrafı: ${proofs} adet`;
            })
        : [];
      sections.push(`Müşteri Kaydı:
- Adı: ${matchedCustomer.name}
- Bakiye: ${money(matchedCustomer.balance, currency)}
- Son Sipariş ve Sevkiyat Detayları:
${cOrders.map((o) => `  · ${o}`).join("\n") || "  Kayıt yok"}`);
    }
  }

  // 2. Matched Products
  if (canProducts) {
    const matchedProducts = matchAssistantProducts(db.products, question).slice(0, 5).map(({ product }) => product);

    if (matchedProducts.length) {
      const prodLines = matchedProducts.map((p) => {
        const warehouses = Object.entries(p.warehouses || {}).filter(([, v]) => Number(v));
        const total = warehouses.reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
        const whDesc = warehouses.map(([wName, wQty]) => `${wName}: ${Number(wQty)}`).join(", ");
        return `- ${p.name} (Kod: ${p.code || p.sku || "-"}): Fiyat: ${money(p.salePrice, currency)}, Toplam Stok: ${total} ${p.unit || "mt"}${whDesc ? ` [${whDesc}]` : ""}`;
      });
      sections.push(`Ürün ve Stok Bilgileri:\n${prodLines.join("\n")}`);
    }
  }

  // 3. Matched Orders
  if (canOrders) {
    const digits = question.match(/\d{2,}/g) || [];
    const matchedOrders = (db.orderBoard || []).filter((o) => {
      const oDigits = digitsOf(o?.number);
      return digits.some((d) => oDigits === d) || (o?.number && normalized.includes(chatNormalize(o.number)));
    }).slice(0, 3);

    if (matchedOrders.length) {
      const ordLines = matchedOrders.map((o) => {
        const prep = o.preparedBy || o.items?.find((i) => i.preparedBy)?.preparedBy || "-";
        const deliv = o.deliveredBy ? `${o.deliveredBy} (${dateLabel(o.deliveredAt)})` : "Teslim edilmedi";
        const desp = o.despatchNumber || (o.withoutDespatch ? "İrsaliyesiz" : "-");
        const proofs = (o.attachments || []).filter((a) => a.kind === "deliveryProof" || a.mimeType?.startsWith("image/")).length;
        const items = (o.items || []).map((i) => `${i.productName || i.name || i.code}: ${i.preparedQuantity || i.quantity || "?"} ${i.unit || "mt"}`).join(", ");
        return `- Sipariş ${o.number} (${o.customerName}): Durum: ${statusLabel(o.status)}, Tarih: ${dateLabel(o.businessDate || o.createdAt)}
  Ürünler: ${items}
  Hazırlayan: ${prep} | Teslim Eden: ${deliv} | İrsaliye: ${desp} | Fotoğraf: ${proofs} adet`;
      });
      sections.push(`Sipariş Detayı:\n${ordLines.join("\n")}`);
    }

    // General order stats
    const todays = (db.orderBoard || []).filter((o) => String(o.businessDate || o.createdAt || "").slice(0, 10) === today && !o.isTest);
    const pendingAppr = pendingApprovalItems(db);
    const overdue = (db.orderBoard || []).filter((o) => !["delivered", "fulfilled", "cancelled"].includes(o.status) && String(o.businessDate || "").slice(0, 10) < today);

    sections.push(`Genel Sipariş Durumu:\n- Bugün açılan sipariş sayısı: ${todays.length}\n- Onay bekleyen form sayısı: ${pendingAppr.length}\n- Teslim edilmeyi bekleyen gecikmiş sipariş sayısı: ${overdue.length}`);
  }

  return sections.join("\n\n");
}

export async function queryOllamaAssistant(db, user, question, permissions = {}) {
  const ollamaHost = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:3b";

  const contextText = buildOllamaContext(db, user, question, permissions);
  const systemPrompt = `Sen AriX ERP ve Sipariş Yönetim Sistemi bünyesinde çalışan yapay zeka asistanısın (AriX Asistan).
Şirketin tüm sipariş, depo hazırlık, sevkiyat, irsaliye, teslimatçı, teslimat kanıt fotoğrafı, stok ve cari kayıtlarına tam hâkimsin.
Kullanıcıya (Adı: ${user?.name || "Kullanıcı"}) şirket içi operasyonlarda yardımcı oluyorsun.

Şirket Anlık Sistem Kayıtları:
${contextText}

Talimatlar:
1. Kullanıcı siparişin kim tarafından hazırlandığını, kimin teslim ettiğini, irsaliye numarasını, teslimat fotoğraflarını, ürün stoklarını veya müşteri bakiyelerini sorduğunda yukarıdaki anlık verilere dayanarak Türkçe, kısa, samimi, net ve net bir dille yanıtla.
2. Eğer sorulan bilgi yukarıdaki kayıtlarda varsa doğrudan ve net bir şekilde ver.
3. Gereksiz giriş-çıkış veya felsefe yapma, doğrudan soruya cevap ver.`;

  const res = await fetch(`${ollamaHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(18000),
    body: JSON.stringify({
      model: ollamaModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      stream: false,
      options: {
        temperature: 0.2,
        top_p: 0.9,
      },
    }),
  });

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  const raw = String(data?.message?.content || data?.response || "").trim();
  return raw.replace(/^(?:AriX Asistan|Asistan)\s*:\s*/i, "").trim();
}

export async function answerAssistantAsync(db, user, text, permissions = {}) {
  const question = String(text || "").trim();
  const normalized = chatNormalize(question);

  if (!question) return { text: ASSISTANT_HELP };
  if (has(normalized, ["yardim", "yardım", "ne yapabilirsin", "komut", "help", "neler sorabilirim"])) {
    return { text: ASSISTANT_HELP };
  }

  // 1. Fast deterministic rule-based check
  const baseAnswer = answerAssistant(db, user, question, permissions);
  const isFallback = baseAnswer?.text?.startsWith("Bunu anlayamadım") || baseAnswer?.text?.includes("için ürün bulunamadı");
  const isGreeting = ["merhaba", "selam", "hey", "kimsin"].includes(normalized);

  if (!isFallback && !isGreeting) {
    return baseAnswer;
  }

  // 2. Ollama intelligent reasoning
  try {
    const aiAnswer = await queryOllamaAssistant(db, user, question, permissions);
    if (aiAnswer) {
      return { text: aiAnswer };
    }
  } catch (err) {
    // If Ollama is offline or times out, fallback seamlessly
  }

  return baseAnswer;
}
