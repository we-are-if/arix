const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const database = new DatabaseSync(process.argv[2]);
const row = database.prepare("SELECT data, revision FROM app_state WHERE id = 1").get();
const state = JSON.parse(row.data);
const now = new Date().toISOString();
const migrationKey = "duru-system-before-invoice-delivery-balance";
const documentNumber = "STK-BORC-DURU-BOOK3";
const waiting = (state.deliveryWaiting || []).find((record) => record.migrationKey === migrationKey);
const document = (state.stockDocuments || []).find((entry) => entry.documentNumber === documentNumber);

if (!waiting) throw new Error("Duru teslimat bekleyen kaydı bulunamadı.");
if (!document) throw new Error("Duru açılış borç evrakı bulunamadı.");

const normalizeCode = (value) => String(value || "").trim().toLocaleUpperCase("tr").replace(/-1$/, "");
const invoiceGroupFor = (index) => index < 2
  ? { sourceGroupId: "invoice-1", sourceGroupLabel: "Fatura 1", sourceGroupRange: "1–2. satırlar" }
  : index < 12
    ? { sourceGroupId: "invoice-2", sourceGroupLabel: "Fatura 2", sourceGroupRange: "3–12. satırlar" }
    : { sourceGroupId: "invoice-3", sourceGroupLabel: "Fatura 3", sourceGroupRange: `13–${document.lines.length}. satırlar` };
const sourceLines = (document.lines || []).map((line, index) => ({
  id: randomUUID(),
  productId: line.productId || null,
  productCode: line.productCode || "",
  productName: line.productName || "Ürün",
  quantity: Math.max(0, Number(line.quantity) || 0),
  orderedRollCount: Math.max(0, Math.trunc(Number(line.rollCount) || 0)),
  ...invoiceGroupFor(index),
}));

const findSource = (item) => sourceLines.find((line) => Number(line.productId) === Number(item.productId))
  || sourceLines.find((line) => normalizeCode(line.productCode) === normalizeCode(item.productCode));

for (const release of waiting.releases || []) {
  const order = (state.orderBoard || []).find((entry) => String(entry.id) === String(release.orderId));
  if (!order) continue;
  release.items = (order.items || []).map((item) => {
    const source = findSource(item);
    if (!source) throw new Error(`${order.number} içindeki ${item.productCode || item.productName} açılış bakiyesinde bulunamadı.`);
    return {
      ...item,
      waitingItemId: source.id,
      ...(order.status === "delivered" ? {
        deliveredQuantity: Math.max(0, Number(item.preparedQuantity ?? item.quantity) || 0),
        deliveredRollCount: Math.max(0, Math.trunc(Number(item.preparedRollCount ?? item.orderedRollCount) || 0)),
      } : {}),
    };
  });
  order.originalItems = sourceLines.map((item) => ({ ...item, preparedQuantity: null, preparedRollCount: null }));
  order.updatedAt = now;
}

waiting.items = sourceLines;
waiting.note = "Sistem kurulmadan önce faturalanmış teslimat bakiyesi · 28 ürünün tamamı eski evraktan aktarıldı";
waiting.updatedAt = now;
waiting.updatedBy = "AriX Sistem";
waiting.reconciledAt = now;
waiting.reconciledFromDocumentNumber = documentNumber;

for (const line of document.lines || []) {
  line.loanOutstanding = 0;
  line.loanOutstandingRollCount = 0;
}
document.deliveryWaitingId = waiting.id;
document.deliveryWaitingNumber = waiting.number;
document.loanBalanceMigratedAt = now;
document.loanBalanceClosedReason = "Teslimat Bekleyenler bakiyesine aktarıldı";

for (const transaction of state.stockTransactions || []) {
  if (transaction.documentNumber !== documentNumber || transaction.type !== "loan_purchase") continue;
  transaction.loanOutstanding = 0;
  transaction.loanOutstandingRollCount = 0;
  transaction.deliveryWaitingId = waiting.id;
  transaction.loanBalanceMigratedAt = now;
}

const summary = {
  products: sourceLines.length,
  quantity: sourceLines.reduce((sum, item) => sum + item.quantity, 0),
  rolls: sourceLines.reduce((sum, item) => sum + item.orderedRollCount, 0),
  deliveredQuantity: (waiting.releases || []).reduce((sum, release) => sum + (release.deliveredAt ? release.items.reduce((lineSum, item) => lineSum + (Number(item.deliveredQuantity) || 0), 0) : 0), 0),
  deliveredRolls: (waiting.releases || []).reduce((sum, release) => sum + (release.deliveredAt ? release.items.reduce((lineSum, item) => lineSum + (Number(item.deliveredRollCount) || 0), 0) : 0), 0),
  activeQuantity: (waiting.releases || []).reduce((sum, release) => sum + (!release.deliveredAt && !release.cancelledAt ? release.items.reduce((lineSum, item) => lineSum + (Number(item.preparedQuantity ?? item.quantity) || 0), 0) : 0), 0),
  activeRolls: (waiting.releases || []).reduce((sum, release) => sum + (!release.deliveredAt && !release.cancelledAt ? release.items.reduce((lineSum, item) => lineSum + (Number(item.preparedRollCount ?? item.orderedRollCount) || 0), 0) : 0), 0),
};

database.exec("BEGIN IMMEDIATE");
try {
  database.prepare("UPDATE app_state SET data = ?, revision = ?, updated_at = ? WHERE id = 1")
    .run(JSON.stringify(state), Number(row.revision) + 1, now);
  database.exec("COMMIT");
  console.log(JSON.stringify({ waitingId: waiting.id, waitingNumber: waiting.number, summary }, null, 2));
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
}
