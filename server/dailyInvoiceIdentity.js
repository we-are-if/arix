function invoiceDay(value) {
  const text = String(value || "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);
  const local = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(text);
  const day = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : local ? `${local[3]}-${local[2]}-${local[1]}` : null;
  if (!day) return null;
  const date = new Date(day + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}
export function sameInvoiceDay(left, right) {
  const a = invoiceDay(left.date), b = invoiceDay(right.date);
  // Unknown dates must not bypass duplicate protection.
  return !a || !b || a === b;
}

export function sameInvoiceIdentity(left, right) {
  if (String(left.invoiceNo || '').trim() !== String(right.invoiceNo || '').trim()) return false;
  const a = Number(left.dailySequence), b = Number(right.dailySequence);
  if (a > 0 || b > 0) {
    return a > 0 && b > 0 && a === b &&
      (left.dailySequenceDate && right.dailySequenceDate
        ? left.dailySequenceDate === right.dailySequenceDate : sameInvoiceDay(left, right));
  }
  return sameInvoiceDay(left, right);
}
