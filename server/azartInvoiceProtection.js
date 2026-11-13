export function normalizeDailyCompanyId(value) {
  return String(value || "").trim().toLocaleLowerCase("en-US") === "sparexpert" ? "sparexpert" : "azartmembran";
}

export function protectAzartInvoiceSnapshot(before, incoming) {
  const stored = Array.isArray(before.invoices) ? before.invoices : [];
  const submitted = Array.isArray(incoming.invoices) ? incoming.invoices : [];
  const byId = new Map(stored.map((invoice) => [String(invoice.id), invoice]));
  const affected = new Set();
  const submittedIds = new Set(submitted.map((invoice) => String(invoice.id)));
  for (const invoice of stored) {
    const candidate = submitted.find((item) => String(item.id) === String(invoice.id));
    if (!candidate || JSON.stringify(candidate) !== JSON.stringify(invoice)) {
      affected.add(invoice.customer);
      if (candidate?.customer) affected.add(candidate.customer);
    }
  }
  for (const invoice of submitted) if (!byId.has(String(invoice.id)) && invoice.status !== "draft") affected.add(invoice.customer);
  const next = { ...incoming, invoices: [
    ...submitted.map((invoice) => {
      const prior = byId.get(String(invoice.id));
      if (!prior) return invoice.status === "draft" ? invoice : null;
      return invoice.printedAt && String(invoice.printedAt) > String(prior.printedAt || "") ? { ...prior, printedAt: invoice.printedAt } : prior;
    }).filter(Boolean),
    ...stored.filter((invoice) => !submittedIds.has(String(invoice.id))),
  ] };
  next.invoices = [...new Map(next.invoices.map((invoice) => [String(invoice.id), invoice])).values()];
  next.customerDebts = { ...(incoming.customerDebts || {}) };
  next.pastMonthUninvoiced = { ...(incoming.pastMonthUninvoiced || {}) };
  for (const customer of affected) {
    for (const key of ["customerDebts", "pastMonthUninvoiced"]) {
      if (Object.hasOwn(before[key] || {}, customer)) next[key][customer] = before[key][customer];
      else delete next[key][customer];
    }
  }
  const linked = new Set(stored.filter((invoice) => invoice.status === "active").flatMap((invoice) => invoice.linkedEntryIds || []));
  const priorEntries = new Map((before.state?.entries || []).map((entry) => [entry.id, entry]));
  next.state = { ...(incoming.state || {}), entries: (incoming.state?.entries || []).map((entry) => {
    const prior = priorEntries.get(entry.id);
    return linked.has(entry.id) && prior ? { ...entry, invoiced: prior.invoiced, invoiceNo: prior.invoiceNo } : entry;
  }) };
  return next;
}

export function invoiceResponseEffects(current, invoice, previous) {
  const ids = new Set([...(invoice?.linkedEntryIds || []), ...(previous?.linkedEntryIds || [])]);
  return {
    customer: invoice.customer,
    customerDebt: current.snapshot.customerDebts?.[invoice.customer],
    pastMonthUninvoiced: current.snapshot.pastMonthUninvoiced?.[invoice.customer],
    entries: (current.snapshot.state?.entries || []).filter((entry) => ids.has(entry.id)).map((entry) => ({ id: entry.id, invoiced: entry.invoiced, invoiceNo: entry.invoiceNo })),
  };
}
