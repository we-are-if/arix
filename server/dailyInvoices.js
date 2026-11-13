import { sameInvoiceIdentity } from "./dailyInvoiceIdentity.js";
import { randomUUID } from "node:crypto";

const cleanText = (value, maxLength = 200) => String(value ?? "").trim().slice(0, maxLength);

export function checkDailyPermission(user, permission, hasPermissionFn) {
  if (typeof hasPermissionFn === "function") return hasPermissionFn(user, permission);
  if (user?.role === "Sahib" || user?.role === "admin") return true;
  if (Array.isArray(user?.permissions)) return user.permissions.includes(permission);
  return false;
}

export function findInvoiceIndex(invoices = [], idOrNo, customer) {
  const safeCustomerLower = cleanText(customer).toLocaleLowerCase("az-AZ");
  const safeIdOrNo = cleanText(idOrNo);
  return invoices.findIndex((inv) => {
    if (inv.id && inv.id === safeIdOrNo) return true;
    if (
      inv.invoiceNo &&
      String(inv.invoiceNo).trim() === safeIdOrNo &&
      cleanText(inv.customer).toLocaleLowerCase("az-AZ") === safeCustomerLower
    ) {
      return true;
    }
    return false;
  });
}

export function reverseInvoiceEffects(current, target) {
  if (!target || target.status !== "active") return;

  const entries = current.snapshot?.state?.entries || [];
  const idSet = new Set(Array.isArray(target.linkedEntryIds) ? target.linkedEntryIds : []);
  if (idSet.size > 0) {
    for (const entry of entries) {
      if (idSet.has(entry.id)) {
        entry.invoiced = false;
        delete entry.invoiceNo;
      }
    }
  }

  const invoiceImpact =
    (Number(target.salesAmount) || 0) -
    (Number(target.returnAmount) || 0) -
    (Number(target.purchaseAmount) || 0) -
    (Number(target.paymentDeducted) || 0);

  current.snapshot.customerDebts ??= {};
  const currentDebt = Number(current.snapshot.customerDebts[target.customer] ?? target.finalDebt) || 0;
  current.snapshot.customerDebts[target.customer] = Math.round((currentDebt - invoiceImpact) * 100) / 100;

  if (Number(target.previousPastMonthSnapshot) > 0) {
    current.snapshot.pastMonthUninvoiced ??= {};
    const existingPast = Number(current.snapshot.pastMonthUninvoiced[target.customer] || 0);
    current.snapshot.pastMonthUninvoiced[target.customer] =
      Math.round((existingPast + Number(target.previousPastMonthSnapshot)) * 100) / 100;
  }
}

export function applyInvoiceUpsert({ current, invoice, approve = false, actor, hasPermission, strictLifecycle = false, approvalOnly = false }) {
  if (!checkDailyPermission(actor, "daily.invoices.manage", hasPermission) && !(approvalOnly && approve && checkDailyPermission(actor, "daily.invoices.approve", hasPermission))) {
    throw new Error("Qaimə idarə etmək icazəniz yoxdur.");
  }

  current.snapshot ??= {};
  current.snapshot.invoices ??= [];
  current.snapshot.customerDebts ??= {};
  current.snapshot.pastMonthUninvoiced ??= {};
  current.snapshot.state ??= {};
  current.snapshot.state.entries ??= [];
  current.audit ??= [];

  const safeInvoiceNo = cleanText(invoice.invoiceNo, 50);
  const safeCustomer = cleanText(invoice.customer, 200);
  if (!safeCustomer) throw new Error("Müştəri adı məcburidir.");

  const nowIso = new Date().toISOString();
  let record = {
    ...invoice,
    id: invoice.id ? String(invoice.id) : `inv-${Date.now()}-${randomUUID().slice(0, 6)}`,
    invoiceNo: safeInvoiceNo,
    customer: safeCustomer,
    salesAmount: Number(invoice.salesAmount) || 0,
    returnAmount: Number(invoice.returnAmount) || 0,
    purchaseAmount: Number(invoice.purchaseAmount) || 0,
    paymentDeducted: Number(invoice.paymentDeducted) || 0,
    finalDebt: Number(invoice.finalDebt) || 0,
    status: approve || invoice.status === "active" ? "active" : "draft",
    updatedAt: nowIso,
  };

  if (strictLifecycle && !cleanText(invoice.id)) throw Object.assign(new Error("Qaimənin unikal ID-si yoxdur. Yenidən açıb göndərin."), { statusCode: 400 });
  if (strictLifecycle && current.audit.some((event) => event.action === "daily_invoice_deleted" && event.entityId === record.id)) {
    throw Object.assign(new Error("Bu qaimə qalıcı silinib. Köhnə cihazdan yenidən göndərilə bilməz."), { statusCode: 409 });
  }
  let existingIdx = strictLifecycle
    ? current.snapshot.invoices.findIndex((item) => String(item.id) === record.id)
    : findInvoiceIndex(current.snapshot.invoices, record.id, record.customer);
  if (strictLifecycle && existingIdx < 0) {
    const duplicateIdx = current.snapshot.invoices.findIndex((item) => item.status !== "cancelled" && sameInvoiceIdentity(item, record) && cleanText(item.customer).toLocaleLowerCase("az-AZ") === safeCustomer.toLocaleLowerCase("az-AZ"));
    const duplicate = current.snapshot.invoices[duplicateIdx];
    if (duplicate && (record.status === "active" || duplicate.status === "draft")) {
      const fields = ["salesAmount", "returnAmount", "purchaseAmount", "items", "returnItems", "date", "note", "seller", "warehouse", "screenshotDataUrl", "returnScreenshotDataUrl"];
      if (record.status === duplicate.status && fields.every((key) => JSON.stringify(duplicate[key] ?? null) === JSON.stringify(record[key] ?? null))) return { invoice: duplicate, unchanged: true };
      throw Object.assign(new Error(`SPF-${safeInvoiceNo} bu müştəri və tarix üçün artıq mövcuddur. Mövcud qaiməni açın; yeni sənəddirsə nömrəsini dəyişin.`), { statusCode: 409 });
    }
  }
  const existing = existingIdx >= 0 ? current.snapshot.invoices[existingIdx] : null;
  if (strictLifecycle && existing?.status === "draft" && record.status === "active" && current.snapshot.invoices.some((item) => item.id !== existing.id && item.status === "active" && sameInvoiceIdentity(item, record) && cleanText(item.customer).toLocaleLowerCase("az-AZ") === safeCustomer.toLocaleLowerCase("az-AZ"))) {
    throw Object.assign(new Error(`SPF-${safeInvoiceNo} nömrəli həmin tarixə aid başqa təsdiqlənmiş qaimə var. Təkrar borc yaranmaması üçün əvvəlcə mövcud sənədi yoxlayın.`), { statusCode: 409 });
  }
  if (strictLifecycle && existing) {
    record.id = existing.id;
    for (const key of ["dailySequence", "dailySequenceDate", "fullInvoiceNo"]) {
      if (Object.hasOwn(existing, key)) record[key] = existing[key];
      else delete record[key];
    }
  }
  if (strictLifecycle && existing && (cleanText(existing.customer).toLocaleLowerCase("az-AZ") !== safeCustomer.toLocaleLowerCase("az-AZ") || cleanText(existing.invoiceNo) !== safeInvoiceNo)) throw Object.assign(new Error("Bu qaimənin müştərisi və ya nömrəsi dəyişib. Ayrı yeni qaimə yaradın."), { statusCode: 409 });
  if (strictLifecycle && existing && existing.status !== "draft" && record.status === "draft") return { invoice: existing, unchanged: true };
  if (strictLifecycle && existing?.status === "cancelled") throw new Error("Ləğv edilmiş qaiməni yenidən təsdiqləmək olmaz. Yeni qaimə yaradın.");
  if (strictLifecycle && existing?.status === record.status) {
    const fields = ["salesAmount", "returnAmount", "purchaseAmount", "items", "returnItems", "date", "note", "seller", "warehouse", "screenshotDataUrl", "returnScreenshotDataUrl"];
    if (fields.every((key) => JSON.stringify(existing[key] ?? null) === JSON.stringify(record[key] ?? null))) return { invoice: existing, unchanged: true };
  }
  if (strictLifecycle && existing && (Number(invoice.revision) || 0) !== (Number(existing.revision) || 0)) throw Object.assign(new Error("Qaimə başqa cihazda dəyişib. Yeniləyib təkrar yoxlayın."), { statusCode: 409 });
  if (strictLifecycle) record.revision = (Number(existing?.revision) || 0) + 1;

  if (record.status === "draft") {
    if (existing) {
      // Retain creation metadata
      record = {
        ...existing,
        ...record,
        id: existing.id,
        createdAt: existing.createdAt || nowIso,
        createdBy: existing.createdBy || actor.name,
      };
      current.snapshot.invoices[existingIdx] = record;
      current.audit.push({
        id: randomUUID(),
        action: "daily_invoice_updated",
        at: nowIso,
        by: actor.name,
        target: `SPF-${record.invoiceNo || "?"} · ${record.customer}`,
      });
    } else {
      record.createdAt = record.createdAt || nowIso;
      record.createdBy = record.createdBy || actor.name;
      current.snapshot.invoices.unshift(record);
      current.audit.push({
        id: randomUUID(),
        action: "daily_invoice_created",
        at: nowIso,
        by: actor.name,
        target: `SPF-${record.invoiceNo || "?"} · ${record.customer}`,
      });
    }
    return { invoice: record };
  }

  // Active / Approved Invoice
  if (!checkDailyPermission(actor, "daily.invoices.approve", hasPermission)) {
    throw new Error("Qaimə təsdiqləmək icazəniz yoxdur.");
  }

  if (existing && existing.status === "active") {
    // Update existing active invoice
    const previousDocumentImpact =
      (Number(existing.salesAmount) || 0) - (Number(existing.returnAmount) || 0) - (Number(existing.purchaseAmount) || 0);
    const updatedDocumentImpact =
      record.salesAmount - record.returnAmount - record.purchaseAmount;
    const impactDifference = updatedDocumentImpact - previousDocumentImpact;

    const currentCustomerDebt = Number(current.snapshot.customerDebts[record.customer] ?? existing.finalDebt) || 0;
    const updatedCustomerDebt = Math.round((currentCustomerDebt + impactDifference) * 100) / 100;
    const updatedFinalDebt = Math.round((Number(existing.finalDebt || 0) + impactDifference) * 100) / 100;

    record = {
      ...existing,
      ...record,
      id: existing.id,
      status: "active",
      previousDebtSnapshot: existing.previousDebtSnapshot,
      previousPastMonthSnapshot: existing.previousPastMonthSnapshot,
      paymentDeducted: existing.paymentDeducted,
      currentMonthDeducted: existing.currentMonthDeducted,
      pastMonthDeducted: existing.pastMonthDeducted,
      linkedEntryIds: existing.linkedEntryIds,
      linkedEntriesSummary: existing.linkedEntriesSummary,
      finalDebt: updatedFinalDebt,
      approvedBy: existing.approvedBy || actor.name,
      approvedAt: existing.approvedAt || nowIso,
    };

    current.snapshot.customerDebts[record.customer] = updatedCustomerDebt;
    current.snapshot.invoices[existingIdx] = record;
    current.audit.push({
      id: randomUUID(),
      action: "daily_invoice_updated",
      at: nowIso,
      by: actor.name,
      target: `SPF-${record.invoiceNo || "?"} · ${record.customer}`,
    });
    return { invoice: record };
  }

  // Transitioning draft or new to active
  const safeCustLower = safeCustomer.toLocaleLowerCase("az-AZ");
  const selectedIds = record.explicitPaymentSelection === true ? new Set(Array.isArray(record.linkedEntryIds) ? record.linkedEntryIds : []) : null;
  const pendingEntries = current.snapshot.state.entries.filter(
    (e) =>
      e.kind === "income" &&
      !e.invoiced && (!selectedIds || selectedIds.has(e.id)) &&
      cleanText(e.counterparty).toLocaleLowerCase("az-AZ") === safeCustLower
  );

  if (selectedIds && pendingEntries.length !== selectedIds.size) throw new Error("Seçilən ödənişlər dəyişib. Qaiməni yeniləyin.");
  const currentDebt = Number(current.snapshot.customerDebts[record.customer] ?? 0) || 0;
  const pastMonthPending = selectedIds && record.includePastPayment !== true ? 0 : Number(current.snapshot.pastMonthUninvoiced[record.customer] ?? record.previousPastMonthSnapshot ?? 0) || 0;
  const currentMonthPending = pendingEntries.reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);
  const totalPaymentDeducted = Math.round((currentMonthPending + pastMonthPending) * 100) / 100;

  const finalDebt =
    Math.round(
      (currentDebt +
        record.salesAmount -
        record.returnAmount -
        record.purchaseAmount -
        totalPaymentDeducted) *
        100
    ) / 100;

  const linkedEntryIds = pendingEntries.map((e) => e.id);
  const linkedEntriesSummary = pendingEntries.map((e) => ({
    id: e.id,
    date: e.date,
    amount: Math.abs(Number(e.amount) || 0),
    channel: cleanText(e.bank) || "Kassa",
    responsible: cleanText(e.responsible) || "Eşqin",
  }));

  const idSet = new Set(linkedEntryIds);
  for (const entry of current.snapshot.state.entries) {
    if (idSet.has(entry.id)) {
      entry.invoiced = true;
      entry.invoiceNo = record.invoiceNo;
    }
  }

  current.snapshot.customerDebts[record.customer] = finalDebt;
  if (pastMonthPending > 0) {
    current.snapshot.pastMonthUninvoiced[record.customer] = 0;
  }

  record = {
    ...record,
    status: "active",
    previousDebtSnapshot: currentDebt,
    previousPastMonthSnapshot: pastMonthPending,
    paymentDeducted: totalPaymentDeducted,
    currentMonthDeducted: currentMonthPending,
    pastMonthDeducted: pastMonthPending,
    finalDebt,
    linkedEntryIds,
    linkedEntriesSummary,
    approvedBy: actor.name,
    approvedAt: nowIso,
  };

  if (existingIdx >= 0) {
    current.snapshot.invoices[existingIdx] = record;
  } else {
    current.snapshot.invoices.unshift(record);
  }

  current.audit.push({
    id: randomUUID(),
    action: "daily_invoice_approved",
    at: nowIso,
    by: actor.name,
    target: `SPF-${record.invoiceNo || "?"} · ${record.customer}`,
  });

  return { invoice: record };
}

export function applyInvoiceAction({ current, invoiceId, action, reason, actor, payload = {}, hasPermission, strictLifecycle = false, expectedRevision }) {
  current.snapshot ??= {};
  current.snapshot.invoices ??= [];
  current.snapshot.customerDebts ??= {};
  current.snapshot.pastMonthUninvoiced ??= {};
  current.snapshot.state ??= {};
  current.snapshot.state.entries ??= [];
  current.audit ??= [];

  const idx = current.snapshot.invoices.findIndex((inv) => String(inv.id) === String(invoiceId));
  if (idx === -1) {
    throw new Error("Qaimə tapılmadı.");
  }
  const target = current.snapshot.invoices[idx];
  const nowIso = new Date().toISOString();
  if (strictLifecycle && expectedRevision != null && Number(expectedRevision) !== (Number(target.revision) || 0)) {
    throw Object.assign(new Error("Qaimə başqa cihazda dəyişib. Yeniləyib əməliyyatı təkrar yoxlayın."), { statusCode: 409 });
  }

  if (action === "approve") {
    if (!checkDailyPermission(actor, "daily.invoices.approve", hasPermission)) {
      throw new Error("Qaimə təsdiqləmək icazəniz yoxdur.");
    }
    if (strictLifecycle && target.status === "active") return { invoice: target, unchanged: true };
    if (strictLifecycle && expectedRevision != null && Number(expectedRevision) !== (Number(target.revision) || 0)) throw Object.assign(new Error("Qaimə başqa cihazda dəyişib. Yeniləyib yenidən təsdiqləyin."), { statusCode: 409 });
    if (target.status !== "draft") {
      throw new Error("Yalnız qaralama qaimələr təsdiqlənə bilər.");
    }
    return applyInvoiceUpsert({
      current,
      invoice: strictLifecycle ? target : { ...target, ...payload },
      approve: true,
      actor,
      hasPermission,
      strictLifecycle,
      approvalOnly: strictLifecycle,
    });
  }

  if (action === "cancel") {
    if (!checkDailyPermission(actor, "daily.invoices.approve", hasPermission)) {
      throw new Error("Qaimə ləğv etmək icazəniz yoxdur.");
    }
    if (target.status === "cancelled") {
      return { invoice: target };
    }
    reverseInvoiceEffects(current, target);
    const updated = {
      ...target,
      status: "cancelled",
      revision: (Number(target.revision) || 0) + 1,
      cancelledAt: nowIso,
      cancelledBy: actor.name,
      rejectionReason: cleanText(reason) || "Qaimə ləğv edildi",
    };
    current.snapshot.invoices[idx] = updated;
    current.audit.push({
      id: randomUUID(),
      action: "daily_invoice_cancelled",
      entityId: String(target.id),
      at: nowIso,
      by: actor.name,
      target: `SPF-${target.invoiceNo || "?"} · ${target.customer}`,
    });
    return { invoice: updated };
  }

  if (action === "restart") {
    if (!checkDailyPermission(actor, "daily.invoices.restart", hasPermission)) {
      throw new Error("Qaiməni başdan başlamaq icazəniz yoxdur.");
    }
    reverseInvoiceEffects(current, target);
    const updated = {
      ...target,
      status: "cancelled",
      revision: (Number(target.revision) || 0) + 1,
      cancelledAt: nowIso,
      cancelledBy: actor.name,
      rejectionReason: "Qaimə başdan başladıldı",
      restartedAt: nowIso,
      restartedBy: actor.name,
    };
    current.snapshot.invoices[idx] = updated;
    current.audit.push({
      id: randomUUID(),
      action: "daily_invoice_restarted",
      entityId: String(target.id),
      at: nowIso,
      by: actor.name,
      target: `SPF-${target.invoiceNo || "?"} · ${target.customer}`,
    });
    return { invoice: updated };
  }

  if (action === "delete") {
    if (!checkDailyPermission(actor, "daily.invoices.delete_permanent", hasPermission)) {
      throw new Error("Qaiməni birdəfəlik silmək icazəniz yoxdur.");
    }
    reverseInvoiceEffects(current, target);
    current.snapshot.invoices.splice(idx, 1);
    current.audit.push({
      id: randomUUID(),
      action: "daily_invoice_deleted",
      entityId: String(target.id),
      at: nowIso,
      by: actor.name,
      target: `SPF-${target.invoiceNo || "?"} · ${target.customer}`,
    });
    return { deletedId: invoiceId };
  }

  throw new Error(`Bilinməyən qaimə əməliyyatı: ${action}`);
}
