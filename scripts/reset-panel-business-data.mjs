import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const sqlitePath = process.argv[2];
const apply = process.argv.includes("--apply");
if (!sqlitePath) throw new Error("Usage: node scripts/reset-panel-business-data.mjs <sqlite-path> [--apply]");

const database = new DatabaseSync(sqlitePath);
const row = database.prepare("SELECT data, revision FROM app_state WHERE id = 1").get();
if (!row) throw new Error("app_state kaydı bulunamadı.");

const state = JSON.parse(row.data);
const storeKeys = (state.stores ?? []).map((store) => String(store.key || "").trim()).filter(Boolean);
if (!storeKeys.includes("depo")) throw new Error("ERSA DEPO mağaza anahtarı bulunamadı.");
if (!Array.isArray(state.orderCatalog) || state.orderCatalog.length === 0) throw new Error("Order ürün kataloğu boş.");

const warehouses = (depotQuantity) => Object.fromEntries(storeKeys.map((key) => [key, key === "depo" ? depotQuantity : 0]));
const now = new Date().toISOString();
const products = state.orderCatalog.map((product) => ({
  id: Number(product.id),
  name: String(product.name || "").trim(),
  code: String(product.code || product.sku || "").trim(),
  sku: String(product.sku || product.code || "").trim(),
  type: String(product.type || "product"),
  unit: String(product.unit || "mt"),
  salePrice: 0,
  cost: 0,
  purchasePrice: 0,
  warehouses: warehouses(Math.max(0, Number(product.physicalQuantity) || 0)),
  active: product.active !== false,
  createdAt: String(product.stockUpdatedAt || now),
  storePrices: {},
}));
const sourceImport = (state.stockImportHistory ?? []).find((item) => item.sourceDate) ?? {};
const openingDate = String(sourceImport.sourceDate || "2026-09-30").slice(0, 10);
const openingLines = products
  .filter((product) => Number(product.warehouses.depo) > 0)
  .map((product) => ({
    productId: product.id,
    name: product.name,
    code: product.code,
    sku: product.sku,
    unit: product.unit,
    variant: "",
    qty: Number(product.warehouses.depo),
    deliveryMode: "stock",
    price: 0,
    standardPrice: 0,
    priceSource: "openingBalance",
    priceStore: "depo",
    discount: 0,
    total: 0,
    unitCost: 0,
    costTotal: 0,
  }));
const openingDocument = {
  id: randomUUID(),
  number: `ACILIS-${openingDate.replaceAll("-", "")}-001`,
  documentNumber: `ACILIS-${openingDate.replaceAll("-", "")}-001`,
  status: "completed",
  workflowStatus: "posted",
  type: "openingBalance",
  posted: true,
  documentDate: openingDate,
  account: "ERSA DEPO",
  counterpartyId: "",
  counterpartyName: "Açılış Stoku",
  total: 0,
  payments: [],
  paymentSummary: { total: 0, paid: 0, remaining: 0 },
  lines: openingLines,
  note: `Order stoklarından aktarıldı · ${String(sourceImport.sourceName || "Stok sayım listesi")}`,
  source: "arix-order-stock-import",
  createdAt: now,
  updatedAt: now,
};

const before = {
  products: state.products?.length ?? 0,
  documents: state.documents?.length ?? 0,
  counterparties: state.counterparties?.length ?? 0,
  purchaseLots: state.purchaseLots?.length ?? 0,
  depotLots: state.depotLots?.length ?? 0,
  eDocuments: state.eDocuments?.documents?.length ?? 0,
};
const depotTotal = products.reduce((sum, product) => sum + Number(product.warehouses.depo || 0), 0);

console.log(JSON.stringify({ apply, before, after: { products: products.length, depotTotal, openingLines: openingLines.length, openingDate, storeKeys } }, null, 2));
if (!apply) {
  database.close();
  process.exit(0);
}

mkdirSync(join(dirname(sqlitePath), "backups"), { recursive: true });
const stamp = now.replace(/[:.]/g, "-");
const backupPath = join(dirname(sqlitePath), "backups", `before-panel-reset-${stamp}.sqlite`);
database.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);

state.products = products;
state.productGroups = [];
state.categories = [];
state.counterparties = [];
state.documents = [openingDocument];
state.stockContainers = [];
state.stockPallets = [];
state.stockRolls = [];
state.stockReservations = [];
state.stockMovements = [];
state.landedCostAdjustments = [];
state.customerPrices = [];
state.productPriceHistory = [];
state.purchaseLots = [];
state.depotLots = [];
state.lotCostEvents = [];
state.lotRecalculations = [];
state.lotAccountingSummary = { recalculatedAt: now, purchaseLotCount: 0, depotLotCount: 0, costEventCount: 0, unresolved: [] };
state.eDocuments = { ...(state.eDocuments ?? {}), documents: [], events: [], lastSyncAt: null };
state.accounting = { ...(state.accounting ?? {}), journals: [] };
state.onlineCollections = { ...(state.onlineCollections ?? {}), collections: [] };
state.externalPayments = [];
state.paymentSettlements = [];
state.bankTransactions = [];
state.cardTransactions = [];
state.bankImportBatches = [];
state.trash = [];

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

console.log(JSON.stringify({ ok: true, backupPath, products: products.length, depotTotal }, null, 2));
