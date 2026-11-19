const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const database = new DatabaseSync(process.argv[2]);
const row = database.prepare("SELECT data, revision FROM app_state WHERE id = 1").get();
const state = JSON.parse(row.data);
state.deliveryWaiting = Array.isArray(state.deliveryWaiting) ? state.deliveryWaiting : [];

const migrationKey = "duru-system-before-invoice-delivery-balance";
if (state.deliveryWaiting.some((record) => record.migrationKey === migrationKey)) {
  console.log("Duru migration already applied.");
  process.exit(0);
}

const orderIds = [
  "a2af3720-72bb-4974-a426-d0b4b5a8625f",
  "7432cdba-86bd-4b3b-9603-aa727531913d",
  "bca92436-9d9e-4a18-ad36-9805d3d3b2a3",
];
const orders = orderIds.map((id) => state.orderBoard.find((order) => order.id === id)).filter(Boolean);
if (orders.length !== orderIds.length) throw new Error(`Expected ${orderIds.length} Duru orders, found ${orders.length}.`);

const now = new Date().toISOString();
const waitingId = randomUUID();
const waitingNumber = `TB-${String(Date.now()).slice(-7)}`;
const itemMap = new Map();
for (const order of orders) {
  for (const item of order.items || []) {
    const key = String(item.productId || item.productCode || item.productName);
    const current = itemMap.get(key) || {
      id: randomUUID(), productId: item.productId || null, productCode: item.productCode || "",
      productName: item.productName || "Ürün", quantity: 0, orderedRollCount: 0,
    };
    current.quantity += Math.max(0, Number(item.preparedQuantity ?? item.quantity) || 0);
    current.orderedRollCount += Math.max(0, Math.trunc(Number(item.preparedRollCount ?? item.orderedRollCount) || 0));
    itemMap.set(key, current);
  }
}
const waitingItems = [...itemMap.values()];
const itemByProduct = new Map(waitingItems.map((item) => [String(item.productId || item.productCode || item.productName), item]));
const firstOrder = orders[0];
const releases = orders.map((order) => {
  const releaseId = randomUUID();
  order.isLoanReturn = false;
  order.isDeferredDelivery = true;
  order.deliveryWaitingSourceId = waitingId;
  order.deliveryWaitingNumber = waitingNumber;
  order.deliveryReleaseId = releaseId;
  if (order.id !== firstOrder.id) {
    order.parentOrderId = firstOrder.id;
    order.parentOrderNumber = firstOrder.number;
  }
  order.originalItems = waitingItems.map((item) => ({ ...item, preparedQuantity: null, preparedRollCount: null }));
  order.updatedAt = now;
  order.audit = Array.isArray(order.audit) ? order.audit : [];
  order.audit.push({ id: randomUUID(), action: "legacyDeliveryBalanceMigrated", newValue: waitingNumber, by: "AriX Sistem", at: now, reason: "Sistem kurulmadan önce faturalanmış teslimat bakiyesine taşındı" });
  const items = (order.items || []).map((item) => {
    const source = itemByProduct.get(String(item.productId || item.productCode || item.productName));
    return { ...item, waitingItemId: source.id, ...(order.status === "delivered" ? { deliveredQuantity: Number(item.preparedQuantity ?? item.quantity) || 0, deliveredRollCount: Number(item.preparedRollCount ?? item.orderedRollCount) || 0 } : {}) };
  });
  return {
    id: releaseId, orderId: order.id, orderNumber: order.number, items,
    createdAt: order.createdAt || now, createdBy: order.createdBy || "AriX Sistem",
    ...(order.status === "delivered" ? {
      deliveredAt: order.deliveredAt || order.updatedAt || now,
      deliveredBy: order.deliveredBy || "AriX Sistem",
      deliveryNote: order.deliveryNote || "",
      despatchNumber: order.despatchNumber || "",
      withoutDespatch: order.withoutDespatch === true,
      attachments: (order.attachments || []).filter((attachment) => !attachment.deletedAt),
    } : {}),
  };
});

for (const movement of state.orderStockMovements || []) {
  if (!orderIds.includes(String(movement.orderId))) continue;
  movement.movementType = "sale";
  movement.loanReturnedQuantity = 0;
  movement.loanReturnedRollCount = 0;
}

state.deliveryWaiting.unshift({
  id: waitingId, number: waitingNumber, migrationKey, sourceType: "opening_balance",
  customerName: "DURU PVC ORMAN ÜRÜNLERİ", note: "Sistem kurulmadan önce faturalanmış kalan teslimatlar",
  items: waitingItems, releases, createdAt: orders[0].createdAt || now,
  createdBy: "AriX Sistem", updatedAt: now, updatedBy: "AriX Sistem",
});

database.exec("BEGIN IMMEDIATE");
try {
  database.prepare("UPDATE app_state SET data = ?, revision = ?, updated_at = ? WHERE id = 1")
    .run(JSON.stringify(state), Number(row.revision) + 1, now);
  database.exec("COMMIT");
  console.log(JSON.stringify({ waitingId, waitingNumber, orders: orders.map((order) => order.number), items: waitingItems }));
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
}
