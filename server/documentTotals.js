const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const rate = (value) => Math.min(100, Math.max(0, Number(value) || 0));

const taxableDocumentTypes = new Set(["sale", "purchase", "saleReturn", "purchaseReturn"]);

export function calculateDocumentTotals(document, products = []) {
  const isTaxable = taxableDocumentTypes.has(document.type);
  const isExport = document.type === "sale" && (document.saleMode === "export" || document.exportMode === true);
  const productsById = new Map(products.map((product) => [Number(product.id), product]));
  let subtotal = 0;
  let discountTotal = 0;
  let taxExclusiveTotal = 0;
  let taxTotal = 0;
  let withholdingTotal = 0;

  const lines = (document.lines ?? []).map((sourceLine) => {
    const line = { ...sourceLine };
    const product = productsById.get(Number(line.productId));
    const quantity = Math.max(0, Number(line.qty ?? line.quantity) || 0);
    const unitPrice = Math.max(0, Number(line.price ?? line.unitPrice) || 0);
    const grossAmount = money(quantity * unitPrice);
    const discountAmount = Math.min(grossAmount, Math.max(0, Number(line.discountAmount ?? line.discount) || 0));
    const taxableAmount = money(grossAmount - discountAmount);
    const productTaxRate = product?.taxFree || product?.cardProfile?.taxFree
      ? 0
      : product?.taxRate ?? product?.cardProfile?.taxRate;
    const taxRate = isTaxable && !isExport ? rate(line.taxRate ?? line.vatRate ?? productTaxRate ?? 20) : 0;
    const taxAmount = money(taxableAmount * taxRate / 100);
    const withholdingRate = taxAmount > 0 ? rate(line.withholdingRate) : 0;
    const withholdingAmount = money(taxAmount * withholdingRate / 100);
    const payableAmount = money(taxableAmount + taxAmount - withholdingAmount);

    subtotal += grossAmount;
    discountTotal += discountAmount;
    taxExclusiveTotal += taxableAmount;
    taxTotal += taxAmount;
    withholdingTotal += withholdingAmount;

    return {
      ...line,
      qty: quantity,
      price: unitPrice,
      discount: discountAmount,
      discountAmount,
      taxRate,
      taxAmount,
      withholdingRate,
      withholdingCode: withholdingRate > 0 ? String(line.withholdingCode ?? "").replace(/\D/g, "").slice(0, 3) : "",
      withholdingAmount,
      total: taxableAmount,
      payableAmount,
    };
  });

  const roundedTaxExclusive = money(taxExclusiveTotal);
  const roundedTax = money(taxTotal);
  const roundedWithholding = money(withholdingTotal);
  const taxInclusiveTotal = money(roundedTaxExclusive + roundedTax);
  const payableTotal = money(taxInclusiveTotal - roundedWithholding);

  return {
    lines,
    subtotal: money(subtotal),
    discountTotal: money(discountTotal),
    taxExclusiveTotal: roundedTaxExclusive,
    taxTotal: roundedTax,
    withholdingTotal: roundedWithholding,
    taxInclusiveTotal,
    payableTotal,
  };
}

export function normalizeDocumentFinancials(db, document) {
  if (!taxableDocumentTypes.has(document.type)) return document;
  const totals = calculateDocumentTotals(document, db.products ?? []);
  document.lines = totals.lines;
  document.subtotal = totals.subtotal;
  document.discountTotal = totals.discountTotal;
  document.taxExclusiveTotal = totals.taxExclusiveTotal;
  document.taxTotal = totals.taxTotal;
  document.withholdingTotal = totals.withholdingTotal;
  document.taxInclusiveTotal = totals.taxInclusiveTotal;
  document.total = totals.payableTotal;
  if (document.paymentSummary) {
    const paid = Math.max(0, Number(document.paymentSummary.paid) || 0);
    document.paymentSummary = {
      ...document.paymentSummary,
      total: totals.payableTotal,
      paid: money(paid),
      remaining: money(Math.max(0, totals.payableTotal - paid)),
      status: paid >= totals.payableTotal && totals.payableTotal > 0
        ? "Tam ödənilib"
        : paid > 0
          ? "Qismən ödənilib"
          : "Ödənilməyib",
    };
  }
  return document;
}

export function validateDocumentFinancials(document) {
  if (!taxableDocumentTypes.has(document.type)) return "";
  for (const [index, line] of (document.lines ?? []).entries()) {
    if ((Number(line.withholdingRate) || 0) > 0 && !/^\d{3}$/.test(String(line.withholdingCode ?? ""))) {
      return `${index + 1}-ci sətirdə tevkifat üçün 3 rəqəmli GİB kodu tələb olunur.`;
    }
  }
  return "";
}
