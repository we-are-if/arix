export function isReadOnlyApprovalPreview(method, action, subaction) {
  return method === "POST" && action === "approval-form" && subaction === "preview-pdf";
}

export function collapseMergedApprovalRows(rows) {
  const coveredSources = new Set();
  for (const order of rows) {
    if (!order.approvalForm || order.mergedIntoOrderId || order.mergeUndoneAt) continue;
    for (const revision of order.approvalForm.revisions || []) {
      if (revision.sourceOrderId) coveredSources.add(revision.sourceOrderId);
    }
  }
  // Hide a source row only when its document is accessible in a final row's menu.
  return rows.filter((order) => !order.mergedIntoOrderId || !coveredSources.has(order.id));
}

export function sortApprovalHistory(entries) {
  const rank = (entry) => entry.sourceOrderId ? 3 : entry.status === "rejected" ? 2 : entry.isCurrent ? 0 : 1;
  return [...entries].sort((a, b) => rank(a) - rank(b) || String(b.createdAt).localeCompare(String(a.createdAt)) || String(a.id).localeCompare(String(b.id)));
}

export function mergedApprovalHistory(order, orders, canView = () => true) {
  const found = new Map();
  const visited = new Set([order.id]);
  const pending = [...(order.mergeSourceOrderIds || []), ...(order.mergedOrderIds || [])];
  const byId = new Map(orders.map((source) => [source.id, source]));
  while (pending.length) {
    const id = pending.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const source = byId.get(id);
    if (!source) continue;
    pending.push(...(source.mergeSourceOrderIds || []), ...(source.mergedOrderIds || []));
    if (!source.approvalForm || !canView(source)) continue;
    const root = source.approvalForm;
    for (const current of [root, ...Object.values(root.exportDocuments || {})]) {
      if (!current) continue;
      const documentType = current.documentType || "domestic";
      const { revisions, exportDocuments, ...snapshot } = structuredClone(current);
      found.set(`${id}:${documentType}`, {
        id: `merged-${id}-${documentType}`, sourceOrderId: id, sourceOrderNumber: source.number,
        documentType, status: current.status,
        createdAt: current.updatedAt || current.rejectedAt || current.approvedAt || current.preparedAt || current.date,
        createdBy: current.updatedBy || current.rejectedBy || current.approvedBy || current.preparedBy || "AriX",
        reason: current.rejectionReason || "Birleştirme öncesi form", form: snapshot,
      });
    }
  }
  return sortApprovalHistory([...found.values()]);
}
