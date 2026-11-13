const same = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const compact = (value, maxLength = 500) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

export function buildAuditChanges(before, after, fields) {
  const changes = [];
  for (const field of fields) {
    const beforeValue = typeof field.read === "function" ? field.read(before) : before?.[field.key];
    const afterValue = typeof field.read === "function" ? field.read(after) : after?.[field.key];
    if (same(beforeValue, afterValue)) continue;
    changes.push({
      field: field.label || field.key,
      before: compact(typeof field.format === "function" ? field.format(beforeValue) : beforeValue),
      after: compact(typeof field.format === "function" ? field.format(afterValue) : afterValue),
    });
  }
  return changes;
}

const entryFields = [
  { key: "date", label: "Tarix" },
  { key: "time", label: "Saat" },
  { key: "kind", label: "Əməliyyat növü" },
  { key: "counterparty", label: "Qarşı tərəf" },
  { key: "category", label: "Kateqoriya" },
  { key: "amount", label: "Məbləğ" },
  { key: "responsible", label: "Şəxs" },
  { key: "bank", label: "Hesab" },
  { key: "targetResponsible", label: "Qəbul edən şəxs" },
  { key: "targetBank", label: "Qəbul edən hesab" },
  { key: "note", label: "Qeyd" },
  { key: "invoiced", label: "Qaiməyə daxil edildi" },
  { key: "invoiceNo", label: "Qaimə nömrəsi" },
];

const invoiceFields = [
  { key: "status", label: "Status" },
  { key: "invoiceNo", label: "Qaimə nömrəsi" },
  { key: "date", label: "Sənəd tarixi" },
  { key: "customer", label: "Müştəri" },
  { key: "seller", label: "Satış təmsilçisi" },
  { key: "warehouse", label: "Anbar" },
  { key: "note", label: "Qeyd" },
  { key: "salesAmount", label: "Cari satış" },
  { key: "returnAmount", label: "Qaytarma" },
  { key: "purchaseAmount", label: "Alış" },
  { key: "paymentDeducted", label: "Çıxılan ödəniş" },
  { key: "finalDebt", label: "Yekun borc" },
  { key: "approvedBy", label: "Təsdiqləyən" },
  { key: "approvedAt", label: "Təsdiq vaxtı" },
  { key: "cancelledBy", label: "Ləğv edən" },
  { key: "cancelledAt", label: "Ləğv vaxtı" },
  { key: "rejectionReason", label: "Ləğv səbəbi" },
  { key: "restartedBy", label: "Başdan başladan" },
  { key: "restartedAt", label: "Başdan başlama vaxtı" },
  { key: "restartOf", label: "Əvvəlki sənəd" },
  { key: "screenshotDataUrl", label: "Mənbə şəkli", format: (value) => value ? "Var" : "Yoxdur" },
  { key: "items", label: "Məhsullar", format: (items) => {
    const rows = Array.isArray(items) ? items : [];
    const total = rows.reduce((sum, item) => sum + (Number(item?.total) || 0), 0);
    return `${rows.length} sətir · ${total.toFixed(2)}`;
  } },
  { key: "linkedEntryIds", label: "Əlaqəli ödənişlər", format: (ids) => `${Array.isArray(ids) ? ids.length : 0} əməliyyat` },
];

const entryTarget = (entry) => [entry?.date, entry?.counterparty || entry?.title].filter(Boolean).join(" · ") || String(entry?.id || "Əməliyyat");
const invoiceTarget = (invoice) => [`SPF-${invoice?.invoiceNo || "?"}`, invoice?.customer].filter(Boolean).join(" · ");

const recoverableInvoiceSnapshot = (invoice) => {
  if (!invoice || typeof invoice !== "object") return null;
  const { screenshotDataUrl, ...snapshot } = invoice;
  return {
    ...structuredClone(snapshot),
    sourceImageAvailable: Boolean(screenshotDataUrl),
  };
};

const byId = (items) => new Map((Array.isArray(items) ? items : []).map((item) => [String(item?.id), item]));

export function findInvoiceIdentityReplacements(beforeInvoices, afterInvoices) {
  const before = byId(beforeInvoices);
  return (Array.isArray(afterInvoices) ? afterInvoices : []).filter((invoice) => {
    const previous = before.get(String(invoice?.id));
    if (!previous) return false;
    const invoiceNoChanged = String(previous.invoiceNo || "").trim() !== String(invoice?.invoiceNo || "").trim();
    const customerChanged = String(previous.customer || "").trim().toLocaleLowerCase("az-AZ") !==
      String(invoice?.customer || "").trim().toLocaleLowerCase("az-AZ");
    const sourceImageChanged = String(previous.screenshotDataUrl || "") !== String(invoice?.screenshotDataUrl || "");
    return (invoiceNoChanged && customerChanged) || (sourceImageChanged && (invoiceNoChanged || customerChanged));
  });
}

export function hasInvoiceRestartChange(beforeInvoices, afterInvoices) {
  const before = byId(beforeInvoices);
  return (Array.isArray(afterInvoices) ? afterInvoices : []).some((invoice) => {
    const previous = before.get(String(invoice?.id));
    const restartSourceChanged = Boolean(invoice?.restartOf) && invoice.restartOf !== previous?.restartOf;
    const restartTimeChanged = Boolean(invoice?.restartedAt) && invoice.restartedAt !== previous?.restartedAt;
    return restartSourceChanged || restartTimeChanged;
  });
}

export function hasInvoiceApprovalChange(beforeInvoices, afterInvoices) {
  const before = byId(beforeInvoices);
  return (Array.isArray(afterInvoices) ? afterInvoices : []).some((invoice) => {
    const previous = before.get(String(invoice?.id));
    if (!previous) return invoice?.status === "active";
    if (invoice?.status !== previous?.status) return true;
    return invoice?.status === "active" && !same(previous, invoice);
  });
}

export function buildDailySnapshotAudit({ before, after, actorName, at, idFactory }) {
  const makeId = typeof idFactory === "function" ? idFactory : () => `${Date.now()}-${Math.random()}`;
  const rows = [];
  const push = (action, target, options = {}) => rows.push({
    id: makeId(),
    action,
    at,
    by: actorName,
    target,
    ...options,
  });

  if (!before?.state && after?.state) {
    push("daily_snapshot_initialized", "AriX Daily", {
      entityType: "snapshot",
      details: "İlkin Daily məlumat paketi yaradıldı.",
    });
    return rows;
  }

  const beforeEntries = byId(before?.state?.entries);
  const afterEntries = byId(after?.state?.entries);
  for (const [id, entry] of afterEntries) {
    const previous = beforeEntries.get(id);
    if (!previous) {
      push("daily_entry_created", entryTarget(entry), {
        entityType: "entry",
        entityId: id,
        details: `${entry?.category || entry?.title || "Əməliyyat"} · ${Number(entry?.amount || 0).toFixed(2)}`,
      });
      continue;
    }
    const changes = buildAuditChanges(previous, entry, entryFields);
    if (!changes.length) continue;
    const invoiceOnly = changes.every((change) => ["Qaiməyə daxil edildi", "Qaimə nömrəsi"].includes(change.field));
    push(invoiceOnly ? "daily_entry_invoice_link_changed" : "daily_entry_updated", entryTarget(entry), {
      entityType: "entry",
      entityId: id,
      changes,
    });
  }
  for (const [id, entry] of beforeEntries) {
    if (!afterEntries.has(id)) push("daily_entry_deleted", entryTarget(entry), {
      entityType: "entry",
      entityId: id,
      details: `${entry?.category || entry?.title || "Əməliyyat"} · ${Number(entry?.amount || 0).toFixed(2)}`,
    });
  }

  const beforeInvoices = byId(before?.invoices);
  const afterInvoices = byId(after?.invoices);
  for (const [id, invoice] of afterInvoices) {
    const previous = beforeInvoices.get(id);
    if (!previous) {
      const action = invoice?.restartOf
        ? "daily_invoice_restart_copy_created"
        : invoice?.status === "active" ? "daily_invoice_approved" : "daily_invoice_created";
      push(action, invoiceTarget(invoice), {
        entityType: "invoice",
        entityId: id,
        details: `${invoice?.status || "draft"} · ${Number(invoice?.salesAmount || 0).toFixed(2)} AZN`,
        documentSnapshot: recoverableInvoiceSnapshot(invoice),
      });
      continue;
    }
    const changes = buildAuditChanges(previous, invoice, invoiceFields);
    if (!changes.length) continue;
    let action = "daily_invoice_updated";
    if (invoice?.restartedAt && invoice.restartedAt !== previous?.restartedAt) action = "daily_invoice_restarted";
    else if (previous?.status !== invoice?.status && invoice?.status === "active") action = "daily_invoice_approved";
    else if (previous?.status !== invoice?.status && invoice?.status === "cancelled") action = "daily_invoice_cancelled";
    push(action, invoiceTarget(invoice), {
      entityType: "invoice",
      entityId: id,
      changes,
      documentBefore: recoverableInvoiceSnapshot(previous),
      documentAfter: recoverableInvoiceSnapshot(invoice),
    });
  }
  for (const [id, invoice] of beforeInvoices) {
    if (!afterInvoices.has(id)) push("daily_invoice_permanently_deleted", invoiceTarget(invoice), {
      entityType: "invoice",
      entityId: id,
      details: `${invoice?.status || "draft"} · ${Number(invoice?.salesAmount || 0).toFixed(2)} AZN`,
      documentSnapshot: recoverableInvoiceSnapshot(invoice),
    });
  }

  const beforeCloses = byId(before?.state?.closes);
  const afterCloses = byId(after?.state?.closes);
  for (const [id, close] of afterCloses) {
    const previous = beforeCloses.get(id);
    if (!previous) push("daily_day_closed", close?.date || id, { entityType: "day-close", entityId: id });
    else if (!same(previous, close)) push("daily_day_close_updated", close?.date || id, {
      entityType: "day-close",
      entityId: id,
      changes: [{ field: "Gün bağlanışı", before: compact(previous), after: compact(close) }],
    });
  }
  for (const [id, close] of beforeCloses) {
    if (!afterCloses.has(id)) push("daily_day_reopened", close?.date || id, { entityType: "day-close", entityId: id });
  }

  const addBalanceAudits = (beforeBalances, afterBalances, action, label, entityType) => {
    const names = new Set([...Object.keys(beforeBalances || {}), ...Object.keys(afterBalances || {})]);
    for (const name of names) {
      const beforeValue = beforeBalances?.[name];
      const afterValue = afterBalances?.[name];
      if (same(beforeValue, afterValue)) continue;
      push(action, name, {
        entityType,
        entityId: name,
        changes: [{ field: label, before: compact(beforeValue ?? 0), after: compact(afterValue ?? 0) }],
      });
    }
  };
  addBalanceAudits(before?.customerDebts, after?.customerDebts, "daily_customer_debt_changed", "Müştəri borcu", "customer");
  addBalanceAudits(before?.pastMonthUninvoiced, after?.pastMonthUninvoiced, "daily_past_month_balance_changed", "Əvvəlki aydan qalan", "customer");

  const directoryFields = [
    ["peopleList", "Şəxslər"],
    ["channelList", "Kassa və banklar"],
    ["categoryList", "Kateqoriyalar"],
    ["customerList", "Müştərilər"],
  ];
  for (const [key, label] of directoryFields) {
    const beforeList = Array.isArray(before?.[key]) ? before[key] : [];
    const afterList = Array.isArray(after?.[key]) ? after[key] : [];
    if (same(beforeList, afterList)) continue;
    const beforeSet = new Set(beforeList);
    const afterSet = new Set(afterList);
    const added = afterList.filter((item) => !beforeSet.has(item));
    const removed = beforeList.filter((item) => !afterSet.has(item));
    push("daily_directory_changed", label, {
      entityType: "directory",
      entityId: key,
      details: [added.length ? `Əlavə: ${added.join(", ")}` : "", removed.length ? `Silindi: ${removed.join(", ")}` : ""].filter(Boolean).join(" · "),
    });
  }

  if (!same(before?.rules || {}, after?.rules || {})) push("daily_rules_changed", "Hesablama qaydaları", {
    entityType: "settings",
    entityId: "rules",
    changes: [{ field: "Qaydalar", before: compact(before?.rules || {}), after: compact(after?.rules || {}) }],
  });

  if (!same(before?.cardLimitSettings || null, after?.cardLimitSettings || null)) push("daily_card_limit_settings_changed", "Kart limitləri", {
    entityType: "settings",
    entityId: "card-limit-settings",
    changes: [{ field: "Bank limitləri və təsir qaydaları", before: compact(before?.cardLimitSettings || {}), after: compact(after?.cardLimitSettings || {}) }],
  });

  return rows;
}
