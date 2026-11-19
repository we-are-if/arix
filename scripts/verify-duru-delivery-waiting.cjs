const { DatabaseSync } = require("node:sqlite");

const database = new DatabaseSync(process.argv[2], { readOnly: true });
const row = database.prepare("SELECT data FROM app_state WHERE id = 1").get();
const state = JSON.parse(row.data);
const waiting = (state.deliveryWaiting || []).find((record) => record.migrationKey === "duru-system-before-invoice-delivery-balance");
const document = (state.stockDocuments || []).find((entry) => entry.documentNumber === "STK-BORC-DURU-BOOK3");
if (!waiting || !document) throw new Error("Doğrulanacak Duru kayıtları bulunamadı.");

const amount = (items, quantityKey, rollKey) => ({
  quantity: items.reduce((sum, item) => sum + (Number(item[quantityKey]) || 0), 0),
  rolls: items.reduce((sum, item) => sum + (Number(item[rollKey]) || 0), 0),
});
const delivered = (waiting.releases || []).filter((release) => release.deliveredAt && !release.cancelledAt);
const active = (waiting.releases || []).filter((release) => !release.deliveredAt && !release.cancelledAt);
const result = {
  waiting: {
    number: waiting.number,
    products: waiting.items.length,
    invoiceGroups: [...new Set(waiting.items.map((item) => item.sourceGroupId).filter(Boolean))].map((id) => ({
      id,
      label: waiting.items.find((item) => item.sourceGroupId === id)?.sourceGroupLabel,
      range: waiting.items.find((item) => item.sourceGroupId === id)?.sourceGroupRange,
      products: waiting.items.filter((item) => item.sourceGroupId === id).length,
    })),
    total: amount(waiting.items, "quantity", "orderedRollCount"),
    delivered: amount(delivered.flatMap((release) => release.items || []), "deliveredQuantity", "deliveredRollCount"),
    active: amount(active.flatMap((release) => release.items || []), "preparedQuantity", "preparedRollCount"),
    releases: (waiting.releases || []).map((release) => ({ orderNumber: release.orderNumber, delivered: Boolean(release.deliveredAt), items: release.items.length })),
  },
  oldLoanDocument: {
    products: document.lines.length,
    remaining: amount(document.lines, "loanOutstanding", "loanOutstandingRollCount"),
    deliveryWaitingNumber: document.deliveryWaitingNumber,
  },
};
console.log(JSON.stringify(result, null, 2));
