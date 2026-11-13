export const APPROVAL_SLA_DEFAULTS = { warnHours: 4, criticalHours: 24 };

export function approvalSlaLimits(env = process.env) {
  const read = (key, fallback) => {
    const value = Number(env[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const warnHours = read("ARIX_APPROVAL_SLA_WARN_HOURS", APPROVAL_SLA_DEFAULTS.warnHours);
  const criticalHours = read("ARIX_APPROVAL_SLA_CRITICAL_HOURS", APPROVAL_SLA_DEFAULTS.criticalHours);
  return { warnHours, criticalHours: Math.max(warnHours, criticalHours) };
}

export function approvalWaitHours(submittedAt, now = Date.now()) {
  const at = new Date(submittedAt || 0).getTime();
  if (!Number.isFinite(at) || !at) return 0;
  return Math.max(0, (now - at) / 3_600_000);
}

export function approvalSlaLevel(hours, limits = APPROVAL_SLA_DEFAULTS) {
  if (hours >= (Number(limits?.criticalHours) || APPROVAL_SLA_DEFAULTS.criticalHours)) return "critical";
  if (hours >= (Number(limits?.warnHours) || APPROVAL_SLA_DEFAULTS.warnHours)) return "warn";
  return "ok";
}

export function describeApprovalWait(hours) {
  const minutes = Math.max(0, Math.round(Number(hours || 0) * 60));
  if (minutes < 60) return `${minutes} dk`;
  const days = Math.floor(minutes / 1440);
  if (days >= 1) return `${days} gün ${Math.floor((minutes % 1440) / 60)} sa`;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}

// A form is pending while it is submitted but still in draft state. Export documents
// keep their own copy under exportDocuments, so the same document can appear twice.
export function pendingApprovalItems(db) {
  const items = [];
  const seen = new Set();
  for (const order of db?.orderBoard || []) {
    if (!order || order.isTest || order.isLoanReturn) continue;
    const forms = [];
    const root = order.approvalForm;
    if (root) forms.push({ form: root, documentType: String(root.documentType || "domestic") });
    if (root?.exportDocuments && typeof root.exportDocuments === "object") {
      for (const [documentType, form] of Object.entries(root.exportDocuments)) {
        if (form) forms.push({ form, documentType });
      }
    }
    for (const { form, documentType } of forms) {
      if (!form || form.status !== "draft" || form.submittedForApproval !== true || !form.submittedAt) continue;
      const key = `${order.id}:${documentType}:${form.number || ""}:${form.submittedAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        order,
        form,
        documentType,
        key,
        number: String(form.number || ""),
        customerName: String(form.customerName || order.customerName || ""),
        documentLabel: documentType === "commercial_invoice" ? "Commercial Invoice" : documentType === "packing_list" ? "Packing List" : documentType === "proforma" ? "Proforma" : "Sipariş formu",
        submittedAt: form.submittedAt,
        submittedBy: String(form.submittedBy || form.preparedBy || ""),
        submittedByUserId: String(form.preparedByUserId || ""),
        assigneeUserId: String(form.salesRepresentativeUserId || ""),
      });
    }
  }
  return items;
}
