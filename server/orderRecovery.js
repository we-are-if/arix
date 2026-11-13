function fail(message) { throw Object.assign(new Error(message), { status: 409 }); }

export function removeLoanReturn(order) {
  if (!order.isLoanReturn) fail("Bu sipariş zaten normal sipariş.");
  if (!["new", "preparing", "ready"].includes(order.status) || order.deliveredAt || order.mergedIntoOrderId || order.mergedOrderIds?.length || order.hasPartialDelivery) {
    fail("Yalnız teslim edilmemiş, aktif siparişin borç iadesi kaldırılabilir. Teslim edilmiş işlem stok ve bakiye kontrolü gerektirir.");
  }
  order.isLoanReturn = false;
}

export function undoReadyMerge(orders, order) {
  if (order.status !== "ready" || order.deliveredAt || order.archivedAt || order.hasPartialDelivery || order.mergeUndoneAt) fail("Yalnız teslim edilmemiş hazır birleşik sipariş ayrılabilir.");
  const ids = order.mergeSourceOrderIds?.length ? order.mergeSourceOrderIds : order.mergedOrderIds;
  if (!ids?.length) fail("Birleştirme kaynağı bulunamadı.");
  const sources = ids.map((id) => orders.find((source) => source.id === id));
  if (sources.some((source) => !source || source.status !== "fulfilled" || source.mergedIntoOrderId !== order.id || source.lockedAt || source.archivedAt)) fail("Kaynak siparişlerden biri değişmiş, kilitlenmiş veya bulunamıyor.");
  if (orders.some((child) => child.parentOrderId === order.id || child.partialDeliverySourceId === order.id)) fail("Birleşik siparişten parti ayrılmış; otomatik geri alma yapılamaz.");
  const sourceItems = sources.flatMap((source) => source.items || []);
  if (JSON.stringify(order.items) !== JSON.stringify(sourceItems)) fail("Birleştirmeden sonra ürünler değişmiş. Miktarları korumak için otomatik geri alma durduruldu.");
  if (sources.some((source) => Boolean(source.isLoanReturn) !== Boolean(order.isLoanReturn) || Boolean(source.isTest) !== Boolean(order.isTest))) fail("İşlem türü değişmiş; kaynak siparişler kontrol edilmeden ayrılamaz.");
  for (const source of sources) {
    source.status = "ready";
    delete source.mergedIntoOrderId;
    delete source.mergedIntoOrderNumber;
  }
  order.status = "cancelled";
  return sources;
}
