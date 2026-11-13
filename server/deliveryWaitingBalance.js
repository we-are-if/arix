const amount = (value) => Math.max(0, Number(value) || 0);
const rolls = (value) => Math.max(0, Math.trunc(Number(value) || 0));
const productKey = (item) => item.productId ? `product:${item.productId}` : `code:${String(item.productCode || item.code || item.productName || "").trim().toLocaleLowerCase("tr")}`;
const itemKey = (item) => String(item.id || productKey(item));
const fail = (message) => { throw Object.assign(new Error(message), { status: 409 }); };

export function summarizeDeliveryWaiting(record, orders = [], { applyMeasurementLocks = true } = {}) {
  const byOrder = new Map(orders.map((order) => [String(order.id), order]));
  const sourceByProduct = new Map((record.items || []).map((item) => [productKey(item), itemKey(item)]));
  const releases = (record.releases || []).map((release) => {
    const order = byOrder.get(String(release.orderId));
    if (release.cancelledAt || release.deliveredAt || !order || order.status !== "ready") return release;
    return { ...release, preparedAt: order.readyAt || release.preparedAt, items: (order.items || []).map((item, index) => ({ ...item, waitingItemId: item.waitingItemId || release.items?.[index]?.waitingItemId })) };
  });
  const items = (record.items || []).map((source) => {
    let releasedQuantity = 0, releasedRollCount = 0, deliveredQuantity = 0, deliveredRollCount = 0;
    let unmeasuredMeters = false, unmeasuredRolls = false;
    for (const release of releases) {
      if (release.cancelledAt) continue;
      for (const item of release.items || []) {
        if (item.waitingItemId ? String(item.waitingItemId) !== itemKey(source) : sourceByProduct.get(productKey(item)) !== itemKey(source)) continue;
        const quantity = amount(release.deliveredAt ? item.deliveredQuantity ?? item.preparedQuantity ?? item.quantity : item.preparedQuantity ?? item.quantity);
        const rollCount = rolls(release.deliveredAt ? item.deliveredRollCount ?? item.preparedRollCount ?? item.orderedRollCount ?? item.rollCount : item.preparedRollCount ?? item.orderedRollCount ?? item.rollCount);
        if (release.deliveredAt) { deliveredQuantity += quantity; deliveredRollCount += rollCount; }
        else {
          releasedQuantity += quantity; releasedRollCount += rollCount;
          if (!release.preparedAt) {
            if (amount(source.quantity) > 0 && !(quantity > 0) && rollCount > 0) unmeasuredMeters = true;
            if (rolls(source.orderedRollCount) > 0 && !(rollCount > 0) && quantity > 0) unmeasuredRolls = true;
          }
        }
      }
    }
    const meterBased = amount(source.quantity) > 0;
    const pendingMeasurement = unmeasuredMeters || (!meterBased && unmeasuredRolls);
    const remainingQuantity = applyMeasurementLocks && pendingMeasurement ? 0 : Number(Math.max(0, amount(source.quantity) - releasedQuantity - deliveredQuantity).toFixed(3));
    const remainingRollCount = (applyMeasurementLocks && (pendingMeasurement || unmeasuredRolls)) || (meterBased && remainingQuantity <= 0.000001) ? 0 : Math.max(0, rolls(source.orderedRollCount) - releasedRollCount - deliveredRollCount);
    return { ...source, releasedQuantity: Number(releasedQuantity.toFixed(3)), releasedRollCount, deliveredQuantity: Number(deliveredQuantity.toFixed(3)), deliveredRollCount, remainingQuantity, remainingRollCount, pendingMeasurement, rollMeasurementPending: unmeasuredRolls };
  });
  const outstanding = items.some((item) => amount(item.quantity) > 0 ? item.remainingQuantity > 0.000001 : item.remainingRollCount > 0);
  const active = releases.some((release) => !release.deliveredAt && !release.cancelledAt);
  return { ...record, releases, items, status: outstanding ? "waiting" : active ? "active" : "completed" };
}

export function validateDeliveryReleaseItem(source, quantity, rollCount, actual = false) {
  if (!actual && (source.pendingMeasurement || (rollCount > 0 && source.rollMeasurementPending))) fail(`${source.productName}: aktif partinin gerçek ölçüsü henüz hazırlanmadı.`);
  if (amount(source.quantity) > 0 && quantity > source.remainingQuantity + 0.000001) fail(`${source.productName} için kalan metreden fazlası seçildi.`);
  if ((!actual || !(amount(source.quantity) > 0)) && rolls(source.orderedRollCount) > 0 && source.remainingRollCount > 0 && rollCount > source.remainingRollCount) fail(`${source.productName} için kalan rulodan fazlası seçildi.`);
  if (!(source.remainingQuantity > 0 || source.remainingRollCount > 0)) fail(`${source.productName} için aktarılabilir bakiye yok.`);
}

export function syncPreparedDeliveryRelease(waiting, release, items, at, actor, orders = []) {
  if (release.deliveredAt || release.cancelledAt) fail("Teslim edilmiş veya iptal edilmiş parti değiştirilemez.");
  // Validate actual amounts against all other reservations, before changing either record.
  const other = summarizeDeliveryWaiting({ ...waiting, releases: (waiting.releases || []).filter((entry) => entry.id !== release.id) }, orders, { applyMeasurementLocks: false });
  const used = new Set();
  const next = items.map((item, index) => {
    const id = item.waitingItemId || release.items?.[index]?.waitingItemId;
    const source = other.items.find((entry) => String(entry.id) === String(id));
    if (!source || used.has(String(id))) fail("Bekleyen teslimat ürün bağlantısı eksik veya tekrarlı.");
    used.add(String(id));
    const quantity = amount(item.preparedQuantity);
    const rollCount = rolls(item.preparedRollCount);
    if (!(quantity > 0 && rollCount > 0)) fail("Hazır parti için gerçek metre ve rulo miktarı zorunludur.");
    validateDeliveryReleaseItem(source, quantity, rollCount, true);
    return { ...item, waitingItemId: source.id, preparedQuantity: quantity, preparedRollCount: rollCount };
  });
  release.requestedItems ??= structuredClone(release.items || []);
  release.items = next;
  release.preparedAt = at;
  release.preparedBy = actor;
  waiting.updatedAt = at;
  waiting.updatedBy = actor;
}
