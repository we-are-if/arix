import {
  findTaxExemption,
  findWithholding,
  incotermCodeSet,
  invoiceTypeCodeSet,
  packageTypeCodeSet,
  transportModeCodeSet,
} from "./gibCodes.js";

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const rate = (value) => Math.min(100, Math.max(0, Number(value) || 0));

const taxableDocumentTypes = new Set(["sale", "purchase", "saleReturn", "purchaseReturn"]);

const cleanCode = (value, length) => String(value ?? "").trim().toUpperCase().slice(0, length);

export function resolveDocumentInvoiceType(document) {
  const isReturn = document.type === "saleReturn" || document.type === "purchaseReturn";
  const isExport = document.type === "sale" && (document.saleMode === "export" || document.exportMode === true);
  const requested = cleanCode(document.invoiceDetails?.typeCode, 24);
  const hasWithholding = (document.lines ?? []).some((line) => Number(line.withholdingRate) > 0);
  const exemptionCodes = (document.lines ?? []).map((line) => String(line.taxExemptionCode ?? "")).filter(Boolean);
  if (isExport) return "ISTISNA";
  if (requested && requested !== "AUTO" && invoiceTypeCodeSet.has(requested)) return requested;
  if (isReturn) return hasWithholding ? "TEVKIFATIADE" : "IADE";
  if (exemptionCodes.some((code) => /^70[1-4]$/.test(code))) return "IHRACKAYITLI";
  if (exemptionCodes.some((code) => /^8(0[1-9]|1[0-2])$/.test(code))) return "OZELMATRAH";
  if (exemptionCodes.length > 0) return "ISTISNA";
  if (hasWithholding) return "TEVKIFAT";
  return "SATIS";
}

function normalizeInvoiceDetails(document) {
  const source = document.invoiceDetails ?? {};
  const typeCode = cleanCode(source.typeCode, 24);
  const packageTypeCode = cleanCode(source.packageTypeCode, 3);
  const transportModeCode = String(source.transportModeCode ?? "").replace(/\D/g, "").slice(0, 2);
  const incoterm = cleanCode(source.incoterm, 3);
  document.invoiceDetails = {
    typeCode: typeCode === "AUTO" || invoiceTypeCodeSet.has(typeCode) ? typeCode || "AUTO" : "AUTO",
    resolvedTypeCode: "",
    packageTypeCode: packageTypeCodeSet.has(packageTypeCode) ? packageTypeCode : "",
    packageId: String(source.packageId ?? "").trim().slice(0, 50),
    packageQuantity: Math.max(0, Number(source.packageQuantity) || 0),
    transportModeCode: transportModeCodeSet.has(transportModeCode) ? transportModeCode : "",
    incoterm: incotermCodeSet.has(incoterm) ? incoterm : "",
    exchangeRate: Math.max(0, Number(source.exchangeRate) || 0),
  };
  document.invoiceDetails.resolvedTypeCode = resolveDocumentInvoiceType(document);
}

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
    const withholding = taxAmount > 0 ? findWithholding(line.withholdingCode) : null;
    const withholdingRate = withholding ? withholding.rate : taxAmount > 0 ? rate(line.withholdingRate) : 0;
    const withholdingAmount = money(taxAmount * withholdingRate / 100);
    const exemption = taxRate === 0 ? findTaxExemption(line.taxExemptionCode) : null;
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
      taxExemptionCode: exemption?.code ?? "",
      taxExemptionReason: exemption?.name ?? "",
      gtip: String(line.gtip ?? "").replace(/\D/g, "").slice(0, 12),
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
  normalizeInvoiceDetails(document);
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
  const isExport = document.type === "sale" && (document.saleMode === "export" || document.exportMode === true);
  for (const [index, line] of (document.lines ?? []).entries()) {
    if ((Number(line.withholdingRate) || 0) > 0 && !findWithholding(line.withholdingCode)) {
      return `${index + 1}-ci sətirdə etibarlı GİB tevkifat kodu tələb olunur.`;
    }
    if (!isExport && Number(line.taxRate) === 0 && !findTaxExemption(line.taxExemptionCode)) {
      return `${index + 1}-ci sətirdə 0% KDV üçün GİB istisna/işlem kodu tələb olunur.`;
    }
    if (Number(line.taxRate) > 0 && line.taxExemptionCode) {
      return `${index + 1}-ci sətirdə KDV istisnası seçilibsə KDV faizi 0 olmalıdır.`;
    }
  }
  const resolvedType = resolveDocumentInvoiceType(document);
  const exemptionCodes = (document.lines ?? []).map((line) => String(line.taxExemptionCode ?? ""));
  if (resolvedType === "ISTISNA" && !isExport && !exemptionCodes.some((code) => findTaxExemption(code))) return "İstisna faturası üçün ən az bir istisna kodu seçilməlidir.";
  if (resolvedType === "TEVKIFAT" && !(document.lines ?? []).some((line) => Number(line.withholdingRate) > 0)) return "Tevkifat faturası üçün ən az bir tevkifatlı sətir olmalıdır.";
  if (resolvedType === "IHRACKAYITLI" && !exemptionCodes.some((code) => /^70[1-4]$/.test(code))) return "İhraç kayıtlı fatura üçün 701-704 kodlarından biri seçilməlidir.";
  if (resolvedType === "OZELMATRAH" && !exemptionCodes.some((code) => /^8(0[1-9]|1[0-2])$/.test(code))) return "Özel matrah faturası üçün 801-812 kodlarından biri seçilməlidir.";
  return "";
}
