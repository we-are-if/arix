// Called within the company's serialized mutation, before duplicate validation.
export function upsertSequencedInvoice(options, upsert, dayKey) {
  const { current } = options;
  const rows = current.snapshot?.invoices || [];
  const previous = rows.find((row) => String(row.id) === String(options.invoice.id));
  const { dailySequence: ignoredSequence, dailySequenceDate: ignoredDate,
    fullInvoiceNo: ignoredNumber, documentCustomer: ignoredCustomer, ...invoice } = options.invoice;
  let sequence = previous?.dailySequence;
  let date = previous?.dailySequenceDate;
  if (!previous) {
    date = dayKey();
    const sameDay = rows.filter((row) => row.dailySequenceDate
      ? row.dailySequenceDate === date
      : Number.isFinite(Date.parse(row.createdAt || '')) && dayKey(new Date(row.createdAt)) === date);
    sequence = Math.max(Number(current.azartInvoiceDayCounters?.[date]) || 0,
      sameDay.length, ...sameDay.map((row) => Number(row.dailySequence) || 0)) + 1;
  }
  if (sequence) {
    invoice.dailySequence = sequence;
    invoice.dailySequenceDate = date;
    invoice.fullInvoiceNo = `${String(invoice.invoiceNo || '').trim().slice(0, 50)}-${String(sequence).padStart(3, '0')}`;
  }
  const result = upsert({ ...options, invoice });
  if (result.unchanged) return result;
  if (!previous && sequence) current.azartInvoiceDayCounters = {
    ...current.azartInvoiceDayCounters, [date]: sequence,
  };
  if (previous?.documentCustomer) result.invoice.documentCustomer = previous.documentCustomer;
  return result;
}
