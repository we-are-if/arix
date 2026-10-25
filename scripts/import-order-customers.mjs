import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { ensureCounterpartyAccounting } from "../server/accounting.js";
import { normalizeCounterparty, validateCounterparty } from "../server/counterparties.js";

const sqlitePath = process.argv[2];
const apply = process.argv.includes("--apply");
if (!sqlitePath) throw new Error("Usage: node scripts/import-order-customers.mjs <sqlite-path> [--apply]");

const database = new DatabaseSync(sqlitePath);
const row = database.prepare("SELECT data, revision FROM app_state WHERE id = 1").get();
if (!row) throw new Error("app_state kaydı bulunamadı.");

const state = JSON.parse(row.data);
state.counterparties ??= [];
state.customerPrices ??= [];
state.accounting ??= { accounts: [] };
state.accounting.accounts ??= [];

const sourceCustomers = Array.isArray(state.orderCustomers) ? state.orderCustomers : [];
const products = Array.isArray(state.products) ? state.products : [];
if (!sourceCustomers.length) throw new Error("Order müşteri listesi boş.");
if (!products.length) throw new Error("Panel ürün listesi boş.");

const clean = (value) => String(value ?? "").trim();
const canonical = (value) => clean(value).toLocaleUpperCase("tr-TR").replace(/[^A-ZÇĞİÖŞÜ0-9]/g, "");
const storeName = (needle, fallback) => {
  const found = (state.stores ?? []).find((store) =>
    canonical(`${store.key} ${store.name}`).includes(canonical(needle))
  );
  return clean(found?.name || fallback);
};
const depotStore = storeName("depo", "ERSA DEPO");
const antrepoStores = [...new Set([
  storeName("antrepo", "ERSA ANTREPO"),
  storeName("transit", "TRANSİT"),
])].filter(Boolean);

const productLookup = new Map();
for (const product of products) {
  for (const key of [product.id, product.code, product.sku, product.name]) {
    if (clean(key)) productLookup.set(canonical(key), product);
  }
}

const countryCode = (country, foreign) => {
  if (!foreign) return "TR";
  const value = canonical(country);
  const known = new Map([
    ["AZERBAYCAN", "AZ"], ["AZERBAIJAN", "AZ"], ["IRAQ", "IQ"], ["IRAK", "IQ"],
    ["GEORGIA", "GE"], ["GÜRCİSTAN", "GE"], ["RUSSIA", "RU"], ["RUSYA", "RU"],
    ["BULGARIA", "BG"], ["BULGARİSTAN", "BG"], ["ROMANIA", "RO"], ["ROMANYA", "RO"],
    ["IRAN", "IR"], ["UKRAINE", "UA"], ["UKRAYNA", "UA"], ["GERMANY", "DE"], ["ALMANYA", "DE"],
  ]);
  return known.get(value) || "XX";
};

let nextId = Math.max(0, ...state.counterparties.map((item) => Number(item.id) || 0)) + 1;
const existingBySource = new Map(state.counterparties
  .filter((item) => clean(item.orderCustomerId))
  .map((item) => [clean(item.orderCustomerId), item]));
const existingByName = new Map(state.counterparties.map((item) => [canonical(item.name), item]));
const importedIds = new Set();
const errors = [];
let created = 0;
let updated = 0;

for (const customer of sourceCustomers) {
  const sourceId = clean(customer.id);
  const name = clean(customer.name);
  if (!sourceId || !name) {
    errors.push({ sourceId, reason: "Kimlik veya ad eksik" });
    continue;
  }
  const foreign = customer.customerType === "foreign";
  const previous = existingBySource.get(sourceId) || existingByName.get(canonical(name));
  const id = Number(previous?.id) || nextId++;
  const address = [...new Set([
    clean(customer.address), clean(customer.addressLine1), clean(customer.addressLine2),
  ].filter(Boolean))].join("\n");
  const representative = foreign ? "Ekrem Tiryaki" : clean(customer.salesRepresentative);
  const description = [
    clean(customer.note),
    customer.folderName ? `Windows klasörü: ${clean(customer.folderName)}` : "",
  ].filter(Boolean).join("\n");
  const normalized = normalizeCounterparty({
    ...previous,
    id,
    orderCustomerId: sourceId,
    sourceSystem: "arix-order",
    kind: "customer",
    type: "company",
    name,
    phone: clean(customer.phone),
    email: clean(customer.email),
    authorizedName: clean(customer.contact),
    address,
    country: clean(customer.country) || (foreign ? "" : "TÜRKİYE"),
    countryCode: countryCode(customer.country, foreign),
    currency: ["TRY", "USD", "EUR", "AZN"].includes(clean(customer.currency).toUpperCase())
      ? clean(customer.currency).toUpperCase()
      : (foreign ? "USD" : "TRY"),
    groupCode: foreign ? "YURT DISI" : "YURT ICI",
    specialCode1: representative,
    department: representative,
    description,
    orderPrices: customer.prices ?? {},
    orderPriceLists: customer.priceLists ?? {},
    orderFolderName: clean(customer.folderName),
    orderSalesRepresentativeUserId: clean(customer.salesRepresentativeUserId),
    status: "Aktif",
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const validationError = validateCounterparty(normalized);
  if (validationError) {
    errors.push({ sourceId, reason: validationError });
    continue;
  }
  const saved = ensureCounterpartyAccounting(state, normalized);
  const index = state.counterparties.findIndex((item) => Number(item.id) === id);
  if (index >= 0) {
    state.counterparties[index] = saved;
    updated += 1;
  } else {
    state.counterparties.push(saved);
    created += 1;
  }
  existingBySource.set(sourceId, saved);
  existingByName.set(canonical(name), saved);
  importedIds.add(id);
}

state.customerPrices = state.customerPrices.filter((rule) => !importedIds.has(Number(rule.customerId)));
let priceRules = 0;
let unmatchedPrices = 0;
const unmatchedProductKeys = new Set();
const addPrices = (customerId, prices, stores) => {
  for (const [productKey, rawPrice] of Object.entries(prices ?? {})) {
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price < 0) continue;
    const product = productLookup.get(canonical(productKey));
    if (!product) {
      unmatchedPrices += 1;
      unmatchedProductKeys.add(clean(productKey));
      continue;
    }
    for (const store of stores) {
      state.customerPrices.push({
        id: randomUUID(), customerId, productId: Number(product.id), store, price,
        sourceSystem: "arix-order", updatedAt: new Date().toISOString(),
      });
      priceRules += 1;
    }
  }
};

for (const customer of sourceCustomers) {
  const panelCustomer = existingBySource.get(clean(customer.id));
  if (!panelCustomer) continue;
  const depotPrices = customer.customerType === "foreign"
    ? (customer.priceLists?.DEPO ?? customer.prices ?? {})
    : (customer.prices ?? {});
  addPrices(Number(panelCustomer.id), depotPrices, [depotStore]);
  if (customer.customerType === "foreign") {
    const otherPrices = customer.priceLists?.ANTREPO_TRANSIT
      ?? { ...(customer.priceLists?.TRANSIT ?? {}), ...(customer.priceLists?.ANTREPO ?? {}) };
    addPrices(Number(panelCustomer.id), otherPrices, antrepoStores);
  }
}

const result = {
  apply,
  sourceCustomers: sourceCustomers.length,
  domestic: sourceCustomers.filter((item) => item.customerType !== "foreign").length,
  foreign: sourceCustomers.filter((item) => item.customerType === "foreign").length,
  created,
  updated,
  panelCustomers: state.counterparties.filter((item) => item.kind === "customer").length,
  priceRules,
  unmatchedPrices,
  unmatchedProductKeys: [...unmatchedProductKeys].slice(0, 50),
  unmatchedCandidates: [...unmatchedProductKeys].map((key) => ({
    key,
    candidates: products
      .filter((product) => canonical(product.code).includes(canonical(key).slice(0, 7)))
      .slice(0, 5)
      .map((product) => product.code),
  })),
  errors,
  stores: { depot: depotStore, antrepoTransit: antrepoStores },
};
console.log(JSON.stringify(result, null, 2));

if (!apply) {
  database.close();
  process.exit(errors.length ? 2 : 0);
}
if (errors.length) throw new Error(`${errors.length} müşteri doğrulanamadı; veri yazılmadı.`);

const now = new Date().toISOString();
mkdirSync(join(dirname(sqlitePath), "backups"), { recursive: true });
const backupPath = join(dirname(sqlitePath), "backups", `before-customer-import-${now.replace(/[:.]/g, "-")}.sqlite`);
database.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
database.exec("BEGIN IMMEDIATE");
try {
  database.prepare("UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1")
    .run(JSON.stringify(state), now);
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
} finally {
  database.close();
}
console.log(JSON.stringify({ ok: true, backupPath, revision: Number(row.revision) + 1 }, null, 2));
