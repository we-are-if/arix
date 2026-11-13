import { postSystemMessage } from "./teamChat.js";
import { productStorePrice } from "./customerPricing.js";

export const chatNormalize = (value) => String(value || "")
  .toLocaleLowerCase("tr")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replaceAll("ı", "i")
  .replace(/\s+/g, " ")
  .trim();

// Rank: exact code/sku, then prefix, then name contains. Only active products answer.
export function matchChatProducts(products, query, limit = 3) {
  const term = chatNormalize(query);
  if (!term) return [];
  const score = (product) => {
    const code = chatNormalize(product?.code);
    const sku = chatNormalize(product?.sku);
    const name = chatNormalize(product?.name);
    if (code === term || sku === term) return 3;
    if ((code && code.startsWith(term)) || (sku && sku.startsWith(term))) return 2;
    if (name.includes(term)) return 1;
    return 0;
  };
  return (products || [])
    .filter((product) => product && product.active !== false)
    .map((product) => ({ product, score: score(product) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || String(left.product.name).localeCompare(String(right.product.name), "tr"))
    .slice(0, Math.max(1, Number(limit) || 3));
}

export function findChatCustomer(db, query) {
  const needle = chatNormalize(query);
  if (!needle) return null;
  let best = null;
  for (const item of db.counterparties || []) {
    if (item?.kind && item.kind !== "customer") continue;
    const name = chatNormalize(item?.name);
    if (!name || !needle.includes(name)) continue;
    if (!best || name.length > chatNormalize(best.name).length) best = item;
  }
  return best;
}

function stripCustomerWords(query, customer) {
  const words = new Set(chatNormalize(customer?.name).split(" ").filter(Boolean));
  return String(query || "").split(/\s+/).filter((word) => !words.has(chatNormalize(word))).join(" ").trim();
}

const money = (value, currency) => `${Number(value || 0).toLocaleString("tr-TR")} ${currency}`.trim();

const stockOf = (product) => Object.values(product.warehouses || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

function customerPriceLine(db, product, customer, currency) {
  const rules = (db.customerPrices || []).filter((rule) =>
    Number(rule.customerId) === Number(customer.id) && Number(rule.productId) === Number(product.id)
  );
  if (rules.length) {
    const parts = rules.map((rule) => `${money(rule.price, currency)}${rule.store ? ` (${rule.store})` : ""}`);
    return `${customer.name} fiyatı: ${parts.join(" · ")}`;
  }
  const store = (db.stores || []).map((item) => item.name).find(Boolean);
  const fallback = store ? productStorePrice(product, store) : product.salePrice;
  return `${customer.name} için özel fiyat tanımlı değil · liste fiyatı: ${money(fallback, currency)}`;
}

export function resolvePriceAnswer(db, query, { allowed = true } = {}) {
  if (!allowed) return { text: "Fiyat için ürünleri görüntüleme izniniz gerekiyor." };
  const customer = findChatCustomer(db, query);
  const term = (customer ? stripCustomerWords(query, customer) : String(query || "")).trim();
  if (!term) {
    return { text: customer ? `Ürün kodu veya adı da yazın (örn. ${customer.name} 00233).` : "Kullanım: /fiyat 00233 · /fiyat 00233 Abanoz" };
  }
  const currency = String(db.companySettings?.profile?.currencySymbol || db.companySettings?.profile?.baseCurrency || "");
  const matches = matchChatProducts(db.products, term);
  if (!matches.length) return { text: `“${term}” için ürün bulunamadı.` };

  const describe = (product) => {
    const stockText = `Stok: ${stockOf(product)} ${product.unit || "mt"}`;
    if (!customer) return `Liste fiyatı: ${money(product.salePrice, currency)} · ${stockText}`;
    return `${customerPriceLine(db, product, customer, currency)} · ${stockText}`;
  };

  if (matches.length === 1) {
    const product = matches[0].product;
    return {
      text: `${product.name} (${product.code || product.sku || "-"}) · ${describe(product)}`,
      productReference: {
        id: String(product.id),
        name: String(product.name || ""),
        code: String(product.code || product.sku || ""),
        stock: stockOf(product),
        unit: String(product.unit || "mt"),
        currency,
      },
    };
  }
  const lines = matches.map(({ product }) => `${product.name} (${product.code || product.sku || "-"}) · ${describe(product)}`).join("\n");
  return { text: `${matches.length} ürün:\n${lines}` };
}

export function chatPriceAnswer(db, channelId, query, allowed) {
  return postSystemMessage(db, channelId, resolvePriceAnswer(db, query, { allowed }));
}
