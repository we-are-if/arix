const { DatabaseSync } = require("node:sqlite");

const database = new DatabaseSync(process.argv[2], { readOnly: true });
const row = database.prepare("SELECT data FROM app_state WHERE id = 1").get();
const state = JSON.parse(row.data);
for (const [collection, values] of Object.entries(state)) {
  if (!Array.isArray(values)) continue;
  for (const value of values) {
    const name = String(value.customerName || value.counterpartyName || value.counterparty || value.name || "");
    if (!/duru/i.test(name)) continue;
    console.log(JSON.stringify({
      collection,
      id: value.id,
      number: value.number,
      type: value.type,
      status: value.status,
      isLoanReturn: value.isLoanReturn,
      customerName: value.customerName,
      counterpartyName: value.counterpartyName,
      counterparty: value.counterparty,
      documentNumber: value.documentNumber,
      movementType: value.movementType,
      loanOutstanding: value.loanOutstanding,
      loanOutstandingRollCount: value.loanOutstandingRollCount,
      createdAt: value.createdAt,
      items: (value.items || value.lines || []).map((item) => ({
        productId: item.productId,
        productCode: item.productCode || item.code,
        productName: item.productName || item.name,
        quantity: item.quantity ?? item.qty,
        orderedRollCount: item.orderedRollCount,
        preparedQuantity: item.preparedQuantity,
        preparedRollCount: item.preparedRollCount,
        loanOutstanding: item.loanOutstanding,
        loanOutstandingRollCount: item.loanOutstandingRollCount,
        loanReturnedQuantity: item.loanReturnedQuantity,
        loanReturnedRollCount: item.loanReturnedRollCount,
      })),
    }));
  }
}
