const supportedCurrencies = new Set(["TRY", "USD", "EUR", "AZN"]);

const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);

export function normalizeCounterparty(value = {}, previous = {}) {
  const merged = { ...previous, ...value };
  const countryCode = text(merged.countryCode || "TR", 2).toUpperCase();
  const rawTaxId = text(merged.taxId, 32).toUpperCase();
  const taxId = countryCode === "TR" ? rawTaxId.replace(/\D/g, "").slice(0, 11) : rawTaxId;

  return {
    ...merged,
    kind: merged.kind === "supplier" ? "supplier" : "customer",
    type: merged.type === "person" ? "person" : "company",
    name: text(merged.name),
    authorizedName: text(merged.authorizedName),
    authorizedRole: text(merged.authorizedRole),
    phone: text(merged.phone, 40),
    phone2: text(merged.phone2, 40),
    mobile: text(merged.mobile, 40),
    fax: text(merged.fax, 40),
    email: text(merged.email, 160),
    website: text(merged.website, 200),
    taxId,
    taxOffice: text(merged.taxOffice, 120),
    iban: text(merged.iban, 64).replace(/\s/g, "").toUpperCase(),
    mersisNumber: text(merged.mersisNumber, 20).replace(/\D/g, ""),
    tradeRegistryNumber: text(merged.tradeRegistryNumber, 40),
    address: text(merged.address, 500),
    district: text(merged.district, 100),
    city: text(merged.city, 100),
    postalCode: text(merged.postalCode, 20),
    countryCode,
    country: text(merged.country || (countryCode === "TR" ? "TÜRKİYE" : ""), 100),
    currency: supportedCurrencies.has(merged.currency) ? merged.currency : "TRY",
    paymentTermDays: Math.max(0, Math.min(3650, Math.round(Number(merged.paymentTermDays) || 0))),
    groupCode: text(merged.groupCode, 40),
    specialCode1: text(merged.specialCode1, 40),
    specialCode2: text(merged.specialCode2, 40),
    department: text(merged.department, 80),
    description: text(merged.description, 1000),
    eDocumentPreference: "auto",
  };
}

export function validateCounterparty(counterparty) {
  if (!counterparty.name) return "Cari kart adı tələb olunur.";
  if (counterparty.countryCode === "TR" && counterparty.taxId && !/^\d{10}(\d)?$/.test(counterparty.taxId)) {
    return "Türkiyə cari kartında VKN 10, TCKN isə 11 rəqəm olmalıdır.";
  }
  if (counterparty.mersisNumber && counterparty.mersisNumber.length !== 16) {
    return "MERSİS nömrəsi 16 rəqəm olmalıdır.";
  }
  return "";
}
