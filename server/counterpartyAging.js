const amount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dayMs = 24 * 60 * 60 * 1000;

const addDays = (value, days) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date(0);
  date.setUTCDate(date.getUTCDate() + Math.max(0, Number(days) || 0));
  return date;
};

export function calculateCounterpartyAging(db, kind = "customer", now = new Date()) {
  const documentType = kind === "supplier" ? "purchase" : "sale";
  const parties = (db.counterparties ?? []).filter((item) => item.kind === kind);
  const partyById = new Map(parties.map((item) => [Number(item.id), item]));
  const rows = new Map(parties.map((item) => [Number(item.id), {
    counterpartyId: Number(item.id), name: item.name, current: 0, days1To30: 0, days31To60: 0,
    days61To90: 0, daysOver90: 0, total: 0, overdue: 0, openDocumentCount: 0, overdueDocumentCount: 0,
  }]));

  for (const document of db.documents ?? []) {
    if (document.type !== documentType || document.posted === false || document.excludeFromAging === true || ["canceled", "cancelled"].includes(String(document.status))) continue;
    const counterpartyId = Number(document.counterpartyId);
    const party = partyById.get(counterpartyId);
    const row = rows.get(counterpartyId);
    if (!party || !row) continue;
    const total = Math.abs(amount(document.paymentSummary?.total ?? document.total));
    const paid = Array.isArray(document.payments)
      ? document.payments.reduce((sum, payment) => sum + Math.abs(amount(payment.amount)), 0)
      : Math.abs(amount(document.paymentSummary?.paid));
    const remaining = Math.max(0, amount(document.paymentSummary?.remaining ?? total - paid));
    if (remaining <= 0.0001) continue;

    const issueDate = document.documentDate ?? document.createdAt;
    const dueDate = document.dueDate ? new Date(document.dueDate) : addDays(issueDate, party.paymentTermDays ?? 30);
    const overdueDays = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / dayMs));
    const bucket = overdueDays <= 0 ? "current" : overdueDays <= 30 ? "days1To30" : overdueDays <= 60 ? "days31To60" : overdueDays <= 90 ? "days61To90" : "daysOver90";
    row[bucket] += remaining;
    row.total += remaining;
    row.openDocumentCount += 1;
    if (overdueDays > 0) {
      row.overdue += remaining;
      row.overdueDocumentCount += 1;
    }
  }

  const data = Array.from(rows.values()).map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === "number" ? Number(value.toFixed(2)) : value])
  ));
  const totals = data.reduce((sum, row) => {
    for (const key of ["current", "days1To30", "days31To60", "days61To90", "daysOver90", "total", "overdue"]) sum[key] += Number(row[key] ?? 0);
    sum.openDocumentCount += Number(row.openDocumentCount ?? 0);
    sum.overdueDocumentCount += Number(row.overdueDocumentCount ?? 0);
    return sum;
  }, { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, daysOver90: 0, total: 0, overdue: 0, openDocumentCount: 0, overdueDocumentCount: 0 });
  return { data, totals };
}
