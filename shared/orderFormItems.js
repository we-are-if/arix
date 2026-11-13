const code = (value) => String(value || "").trim().toLocaleUpperCase("tr");
const normName = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("tr");

export function mergeFormWarning(orders) {
  const blocked = orders.flatMap((order) => {
    const root = order.approvalForm;
    if (!root) return [];
    const forms = [root, ...Object.values(root.exportDocuments || {})];
    const active = forms.filter((form) => form && !["rejected", "cancelled", "canceled"].includes(form.status));
    if (!active.length) return [];
    const numbers = [...new Set(active.map((form) => form.number).filter(Boolean))];
    return [`${order.number || "Sipariş"}${numbers.length ? ` (${numbers.join(", ")})` : ""}`];
  });
  return blocked.length ? `Önce sipariş formunu iptal edin. Bekleyen veya onaylı formu olan siparişler birleştirilemez: ${blocked.join(" · ")}. Formu açıp Reddet / İptal işlemini kullanın; eski belge geçmişte korunur.` : "";
}

export function orderLineMatchesItem(line, item) {
  if (!line || !item) return false;
  if (line.productId != null && item.productId != null && String(line.productId) === String(item.productId)) {
    return true;
  }
  if (code(line.productCode) && code(line.productCode) === code(item.productCode)) {
    return true;
  }
  const isItemManual = Boolean(item.manual || item.productId == null);
  const isLineManual = Boolean(line.manual || line.productId == null);
  if (isItemManual && isLineManual && normName(line.productName) && normName(line.productName) === normName(item.productName)) {
    return true;
  }
  return false;
}

// A product may occur more than once after a merge. Consume each source row once.
export function matchOrderFormItems(lines, items) {
  const used = new Set();
  return lines.map((line) => {
    const ref = line.sourceItemRef;
    if (ref && Number.isInteger(ref.index) && !used.has(ref.index)) {
      const source = items[ref.index];
      if (source && (source.manual || source.productId == null) && line.manual === true
        && String(source.productCode || "") === ref.code && String(source.productName || "") === ref.name) {
        used.add(ref.index);
        return ref.index;
      }
    }
    const candidates = items.map((item, index) => ({ item, index }))
      .filter(({ item, index }) => !used.has(index) && orderLineMatchesItem(line, item));
    const exact = candidates.find(({ item }) => Math.abs(Number(line.quantity || 0) - Number(item.preparedQuantity ?? item.quantity ?? item.orderedRollCount ?? 0)) < 0.001);
    const index = (exact || candidates[0])?.index ?? -1;
    if (index >= 0) {
      used.add(index);
      return index;
    }
    if (line.manual) return -1;
    return -1;
  });
}
