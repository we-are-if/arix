import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const sqlitePath = process.argv[2];
const apply = process.argv.includes("--apply");
if (!sqlitePath) throw new Error("Usage: node scripts/import-order-sales.mjs <sqlite-path> [--apply]");

const database = new DatabaseSync(sqlitePath);
const row = database.prepare("SELECT data, revision FROM app_state WHERE id = 1").get();
if (!row) throw new Error("app_state kaydı bulunamadı.");
const state = JSON.parse(row.data);
state.documents ??= [];

const clean = (value) => String(value ?? "").trim();
const canonical = (value) => clean(value).toLocaleUpperCase("tr-TR").replace(/[^A-ZÇĞİÖŞÜ0-9]/g, "");
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const panelProducts = new Map();
for (const product of state.products ?? []) {
  for (const key of [product.id, product.code, product.sku, product.name]) {
    if (clean(key)) panelProducts.set(canonical(key), product);
  }
}
const customersBySource = new Map((state.counterparties ?? [])
  .filter((item) => item.kind === "customer" && clean(item.orderCustomerId))
  .map((item) => [clean(item.orderCustomerId), item]));
const customersByName = new Map((state.counterparties ?? [])
  .filter((item) => item.kind === "customer")
  .map((item) => [canonical(item.name), item]));
const orderCustomersById = new Map((state.orderCustomers ?? []).map((item) => [clean(item.id), item]));

const sourceOrders = (state.orderBoard ?? []).filter((order) =>
  order.status === "delivered" && order.isTest !== true && !order.parentOrderId
);
const existingByOrderId = new Map(state.documents
  .filter((document) => clean(document.sourceOrderId))
  .map((document) => [clean(document.sourceOrderId), document]));
const warnings = [];
let created = 0;
let updated = 0;
let totalLines = 0;
let totalValue = 0;

for (const order of sourceOrders) {
  const sourceOrderId = clean(order.id);
  const orderCustomer = orderCustomersById.get(clean(order.customerId));
  const counterparty = customersBySource.get(clean(order.customerId || orderCustomer?.id))
    || customersByName.get(canonical(order.customerName));
  if (!counterparty) {
    warnings.push({ order: clean(order.number), reason: "Müşteri eşleşmedi" });
    continue;
  }

  const form = order.approvalForm ?? {};
  const foreign = orderCustomer?.customerType === "foreign" || form.documentType === "proforma"
    || form.documentType === "commercial_invoice" || form.documentType === "packing_list";
  const sourceCurrency = ["TRY", "USD", "EUR", "AZN"].includes(clean(form.currency).toUpperCase())
    ? clean(form.currency).toUpperCase()
    : (foreign ? "USD" : "TRY");
  const exchangeRate = Math.max(0, Number(form.exchangeRate) || 0);
  const currency = foreign ? sourceCurrency : "TRY";
  const conversion = foreign || sourceCurrency === "TRY" ? 1 : exchangeRate;
  const formLinesByProduct = new Map((form.lines ?? [])
    .filter((line) => line.manual !== true)
    .map((line) => [canonical(line.productId || line.productCode || line.productName), line]));
  const formLinesByCode = new Map((form.lines ?? []).map((line) => [canonical(line.productCode || line.productName), line]));
  const overallDiscountRate = Math.max(0, Math.min(100, Number(form.overallDiscountRate) || 0));
  const items = Array.isArray(order.items) ? order.items : [];
  const lines = [];

  for (const item of items) {
    const product = panelProducts.get(canonical(item.productId))
      || panelProducts.get(canonical(item.productCode))
      || panelProducts.get(canonical(item.productName));
    if (!product) {
      warnings.push({ order: clean(order.number), product: clean(item.productCode || item.productName), reason: "Ürün eşleşmedi" });
      continue;
    }
    const formLine = formLinesByProduct.get(canonical(item.productId))
      || formLinesByCode.get(canonical(item.productCode || item.productName))
      || {};
    const quantity = Math.max(0, Number(item.preparedQuantity ?? item.quantity) || 0);
    const width = Math.max(0, Number(formLine.width) || 1.42);
    const sourceUnitPrice = Math.max(0, Number(formLine.unitPrice) || 0);
    const billableFactor = clean(formLine.unit || "M2").toUpperCase() === "M2" ? width : 1;
    const price = money(sourceUnitPrice * billableFactor * conversion);
    const gross = money(quantity * price);
    const lineDiscountRate = Math.max(0, Math.min(100, Number(formLine.discountRate) || 0));
    const afterLineDiscount = gross * (1 - lineDiscountRate / 100);
    const discount = money(gross - afterLineDiscount * (1 - overallDiscountRate / 100));
    const taxRate = foreign || form.vatIncluded === true ? 0 : Math.max(0, Number(formLine.vatRate) || 20);
    lines.push({
      productId: Number(product.id), name: product.name, code: product.code, sku: product.sku,
      unit: product.unit || "mt", qty: quantity, price, discount, discountAmount: discount,
      taxRate, vatRate: taxRate, total: money(gross - discount), width,
      orderedQuantity: Math.max(0, Number(item.quantity) || 0),
      preparedRollCount: Math.max(0, Number(item.preparedRollCount) || 0),
      cutAllowanceMeters: Math.max(0, Number(item.cutAllowanceMeters) || 0),
      sourceUnitPrice, sourceCurrency,
    });
  }
  if (!lines.length) {
    warnings.push({ order: clean(order.number), reason: "Aktarılabilir ürün satırı yok" });
    continue;
  }

  const subtotal = money(lines.reduce((sum, line) => sum + line.qty * line.price, 0));
  const discountTotal = money(lines.reduce((sum, line) => sum + line.discount, 0));
  const taxExclusiveTotal = money(subtotal - discountTotal);
  const taxTotal = money(lines.reduce((sum, line) => sum + line.total * line.taxRate / 100, 0));
  const extraCharge = money((Number(form.extraCharge) || 0) * conversion);
  const total = money(taxExclusiveTotal + taxTotal + extraCharge);
  const deliveredAt = clean(order.deliveredAt || form.approvedAt || order.updatedAt || order.createdAt);
  const documentDate = /^\d{4}-\d{2}-\d{2}/.test(deliveredAt) ? deliveredAt.slice(0, 10) : clean(form.date).slice(0, 10);
  const existing = existingByOrderId.get(sourceOrderId);
  const document = {
    ...(existing ?? {}),
    id: existing?.id || randomUUID(),
    type: "sale",
    saleMode: foreign ? "export" : "regular",
    exportMode: foreign,
    status: "completed",
    posted: true,
    historicalImport: true,
    stockAlreadyAppliedInOrder: true,
    excludeFromAging: true,
    sourceSystem: "arix-order",
    sourceOrderId,
    number: clean(form.number || order.number),
    documentNumber: clean(form.number || order.number),
    orderNumber: clean(order.number),
    documentDate,
    createdAt: clean(order.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    account: foreign && form.priceSource === "ANTREPO_TRANSIT" ? "Elit" : "ERSA DEPO",
    counterpartyId: Number(counterparty.id),
    counterpartyName: counterparty.name,
    counterpartyAddress: clean(form.customerAddress || counterparty.address),
    currency,
    sourceCurrency,
    exchangeRate,
    lines,
    subtotal,
    discountTotal,
    taxExclusiveTotal,
    taxTotal,
    withholdingTotal: 0,
    taxInclusiveTotal: total,
    total,
    extraCharge,
    extraChargeLabel: clean(form.extraChargeLabel),
    payments: [],
    paymentSummary: { total, paid: 0, remaining: 0, status: "Geçmiş bakiye aktarılmadı" },
    author: clean(order.createdBy),
    salesRepresentative: clean(form.salesRepresentative || orderCustomer?.salesRepresentative),
    deliveredAt: clean(order.deliveredAt),
    deliveredBy: clean(order.deliveredBy),
    deliveryNote: clean(order.deliveryNote),
    despatchNumber: clean(order.despatchNumber),
    despatchReadyAt: clean(order.despatchReadyAt),
    despatchReadyBy: clean(order.despatchReadyBy),
    paymentTerms: clean(form.paymentTerms),
    deliveryTerms: clean(form.deliveryTerms),
    note: clean(form.note || order.note),
    approvalFormSnapshot: structuredClone(form),
    orderAuditSnapshot: structuredClone(order.audit ?? []),
    printFormMode: foreign ? "proforma" : "orderConfirmation",
    printLayoutSource: "arix-order",
  };
  const index = state.documents.findIndex((item) => String(item.id) === String(document.id));
  if (index >= 0) {
    state.documents[index] = document;
    updated += 1;
  } else {
    state.documents.push(document);
    created += 1;
  }
  existingByOrderId.set(sourceOrderId, document);
  totalLines += lines.length;
  totalValue += total;
}

const result = {
  apply,
  deliveredOrders: sourceOrders.length,
  created,
  updated,
  importedSales: state.documents.filter((item) => item.type === "sale" && item.sourceSystem === "arix-order").length,
  totalLines,
  totalValue: money(totalValue),
  warningCount: warnings.length,
  warnings: warnings.slice(0, 50),
};
console.log(JSON.stringify(result, null, 2));
if (!apply) {
  database.close();
  process.exit(0);
}

const now = new Date().toISOString();
mkdirSync(join(dirname(sqlitePath), "backups"), { recursive: true });
const backupPath = join(dirname(sqlitePath), "backups", `before-order-sales-import-${now.replace(/[:.]/g, "-")}.sqlite`);
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
