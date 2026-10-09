const providerIds = new Set(["mock", "izibiz", "edm", "qnb"]);
const environments = new Set(["test", "production"]);

export const defaultEDocumentSettings = {
  enabled: false,
  provider: "mock",
  environment: "test",
  company: {
    title: "",
    taxNumber: "",
    taxOffice: "",
    country: "TR",
    address: "",
    city: "",
    district: "",
    postalCode: "",
    email: "",
    phone: "",
  },
  aliases: {
    sender: "",
    receiver: "",
    despatch: "",
  },
  modules: {
    eInvoice: true,
    eArchive: true,
    eDespatch: true,
    exportInvoice: true,
    storage: true,
  },
  series: {
    eInvoice: "EAR",
    eArchive: "ARS",
    eDespatch: "IRS",
    exportInvoice: "IHR",
  },
  automation: {
    detectRecipient: true,
    syncIncoming: true,
    syncIntervalMinutes: 15,
  },
};

const cleanText = (value, fallback = "") => typeof value === "string" ? value.trim() : fallback;
const cleanSeries = (value, fallback) => {
  const cleaned = cleanText(value, fallback).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  return cleaned || fallback;
};

export function normalizeEDocumentSettings(value = {}) {
  const company = value.company ?? {};
  const aliases = value.aliases ?? {};
  const modules = value.modules ?? {};
  const series = value.series ?? {};
  const automation = value.automation ?? {};
  const interval = Number(automation.syncIntervalMinutes);

  return {
    ...defaultEDocumentSettings,
    enabled: Boolean(value.enabled),
    provider: providerIds.has(value.provider) ? value.provider : defaultEDocumentSettings.provider,
    environment: environments.has(value.environment) ? value.environment : defaultEDocumentSettings.environment,
    company: {
      ...defaultEDocumentSettings.company,
      title: cleanText(company.title),
      taxNumber: cleanText(company.taxNumber).replace(/\D/g, "").slice(0, 11),
      taxOffice: cleanText(company.taxOffice),
      country: cleanText(company.country, "TR").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || "TR",
      address: cleanText(company.address),
      city: cleanText(company.city),
      district: cleanText(company.district),
      postalCode: cleanText(company.postalCode),
      email: cleanText(company.email),
      phone: cleanText(company.phone),
    },
    aliases: {
      sender: cleanText(aliases.sender),
      receiver: cleanText(aliases.receiver),
      despatch: cleanText(aliases.despatch),
    },
    modules: Object.fromEntries(
      Object.keys(defaultEDocumentSettings.modules).map((key) => [key, modules[key] === undefined ? defaultEDocumentSettings.modules[key] : Boolean(modules[key])])
    ),
    series: {
      eInvoice: cleanSeries(series.eInvoice, "EAR"),
      eArchive: cleanSeries(series.eArchive, "ARS"),
      eDespatch: cleanSeries(series.eDespatch, "IRS"),
      exportInvoice: cleanSeries(series.exportInvoice, "IHR"),
    },
    automation: {
      detectRecipient: automation.detectRecipient === undefined ? true : Boolean(automation.detectRecipient),
      syncIncoming: automation.syncIncoming === undefined ? true : Boolean(automation.syncIncoming),
      syncIntervalMinutes: Number.isFinite(interval) ? Math.min(1440, Math.max(5, Math.round(interval))) : 15,
    },
  };
}

export function normalizeEDocumentStore(db) {
  db.companySettings.eDocumentSettings = normalizeEDocumentSettings(db.companySettings.eDocumentSettings);
  db.eDocuments = {
    documents: Array.isArray(db.eDocuments?.documents) ? db.eDocuments.documents : [],
    events: Array.isArray(db.eDocuments?.events) ? db.eDocuments.events : [],
    lastSyncAt: db.eDocuments?.lastSyncAt ?? null,
  };
  return db;
}

const providerCredentialKeys = {
  izibiz: ["ARIX_IZIBIZ_USERNAME", "ARIX_IZIBIZ_PASSWORD"],
  edm: ["ARIX_EDM_USERNAME", "ARIX_EDM_PASSWORD"],
  qnb: ["ARIX_QNB_USERNAME", "ARIX_QNB_PASSWORD"],
};

export function credentialStatus(settings, environment = process.env) {
  if (settings.provider === "mock") {
    return { configured: true, source: "Daxili test adapteri", requiredKeys: [] };
  }
  const requiredKeys = providerCredentialKeys[settings.provider] ?? [];
  return {
    configured: requiredKeys.every((key) => Boolean(environment[key])),
    source: "Server mühit dəyişənləri",
    requiredKeys,
  };
}

export function publicEDocumentSettings(settings, environment = process.env) {
  const normalized = normalizeEDocumentSettings(settings);
  return { ...normalized, credentials: credentialStatus(normalized, environment) };
}

export function eDocumentOverview(db) {
  const documents = db.eDocuments?.documents ?? [];
  const statusCount = (status) => documents.filter((document) => document.status === status).length;
  return {
    total: documents.length,
    drafts: statusCount("draft"),
    processing: statusCount("processing"),
    completed: statusCount("completed"),
    failed: statusCount("failed"),
    incoming: documents.filter((document) => document.direction === "incoming").length,
    outgoing: documents.filter((document) => document.direction === "outgoing").length,
    lastSyncAt: db.eDocuments?.lastSyncAt ?? null,
  };
}

export function testEDocumentConnection(settings, environment = process.env) {
  const normalized = normalizeEDocumentSettings(settings);
  const credentials = credentialStatus(normalized, environment);
  if (normalized.provider !== "mock" && !credentials.configured) {
    return {
      ok: false,
      code: "CREDENTIALS_MISSING",
      message: "Provayder giriş məlumatları serverdə hələ təyin edilməyib.",
      credentials,
    };
  }
  return {
    ok: true,
    code: normalized.provider === "mock" ? "MOCK_READY" : "CONFIG_READY",
    message: normalized.provider === "mock"
      ? "Daxili test adapteri hazırdır. Heç bir məlumat xaricə göndərilmədi."
      : "Server ayarları hazırdır. Canlı provayder sorğusu növbəti mərhələdə aktivləşdiriləcək.",
    credentials,
  };
}

const documentTypes = new Set(["eInvoice", "eArchive", "eDespatch", "exportInvoice"]);

const moduleForDocumentType = {
  eInvoice: "eInvoice",
  eArchive: "eArchive",
  eDespatch: "eDespatch",
  exportInvoice: "exportInvoice",
};

export function resolveEDocumentPlan(sourceDocument, counterparty = {}, settings = defaultEDocumentSettings) {
  if (!sourceDocument?.id || sourceDocument.type !== "sale") {
    throw new Error("e-Belge yalnız satış sənədindən hazırlana bilər.");
  }
  const normalized = normalizeEDocumentSettings(settings);
  const isExport = sourceDocument.saleMode === "export" || sourceDocument.exportMode === true;
  if (isExport) {
    const availableTypes = ["exportInvoice", "eDespatch"].filter((type) => normalized.modules[moduleForDocumentType[type]]);
    return {
      recommendedType: availableTypes[0] ?? "exportInvoice",
      availableTypes,
      reason: "İxrac satışı üçün ihracat faturası əsas sənəddir; sevkiyyat zamanı e-İrsaliye də yaradıla bilər.",
      recipientStatus: "export",
    };
  }

  const preference = sourceDocument.counterpartyEDocumentPreference ?? counterparty.eDocumentPreference ?? "auto";
  const registered = sourceDocument.counterpartyEInvoiceRegistered ?? counterparty.eInvoiceRegistered;
  const recommendedType = preference === "eInvoice" || preference === "eArchive"
    ? preference
    : registered === true
      ? "eInvoice"
      : "eArchive";
  const availableTypes = ["eInvoice", "eArchive"].filter((type) => normalized.modules[moduleForDocumentType[type]]);
  return {
    recommendedType: availableTypes.includes(recommendedType) ? recommendedType : availableTypes[0] ?? recommendedType,
    availableTypes,
    reason: preference !== "auto"
      ? "Müştəri kartındakı e-Belge seçimi tətbiq edildi."
      : registered === true
        ? "Müştəri e-Fatura istifadəçisi kimi işarələnib."
        : "Provayder reyestri qoşulana qədər e-Arşiv təhlükəsiz başlanğıc seçimi kimi istifadə olunur.",
    recipientStatus: registered === true ? "registered" : registered === false ? "not-registered" : "unknown",
  };
}

export function validateEDocumentForSending(document, settings, environment = process.env) {
  const normalized = normalizeEDocumentSettings(settings);
  const issues = [];
  if (!normalized.enabled) issues.push("Şirkət ayarlarında e-Belge axını aktiv edilməyib.");
  if (!normalized.modules[moduleForDocumentType[document?.documentType]]) issues.push("Seçilmiş e-Belge modulu aktiv deyil.");
  if (!normalized.company.title) issues.push("Rəsmi firma adı daxil edilməyib.");
  if (![10, 11].includes(normalized.company.taxNumber.length)) issues.push("Firma VKN/TCKN məlumatı 10 və ya 11 rəqəm olmalıdır.");
  if (!normalized.company.address || !normalized.company.city) issues.push("Firma ünvanı və şəhər məlumatı daxil edilməlidir.");
  if (!document?.snapshot?.counterparty?.name) issues.push("Alıcı adı yoxdur.");
  const isExportDespatch = document?.documentType === "eDespatch" && (document.snapshot.saleMode === "export" || document.snapshot.exportMode === true);
  if (document?.documentType !== "exportInvoice" && !isExportDespatch && ![10, 11].includes(String(document.snapshot.counterparty.taxNumber ?? "").length)) {
    issues.push("Alıcının VKN/TCKN məlumatı 10 və ya 11 rəqəm olmalıdır.");
  }
  if (!document?.number || !/^[A-Z0-9]{3}\d{13}$/.test(document.number)) issues.push("GİB sənəd nömrəsi 3 simvolluq seriya, 4 rəqəm il və 9 rəqəm ardıcıllıqdan ibarət olmalıdır.");
  if (!document?.uuid) issues.push("ETTN/UUID yaradılmayıb.");
  if (document?.documentType === "eDespatch" && (!document.snapshot.shipment?.actualDespatchDate || !document.snapshot.shipment?.actualDespatchTime)) {
    issues.push("e-İrsaliye üçün faktiki sevk tarixi və saatı daxil edilməlidir.");
  }
  if (document?.documentType === "eDespatch") {
    const shipment = document.snapshot.shipment ?? {};
    const hasCarrier = [10, 11].includes(digits(shipment.carrierTaxNumber).length) && cleanText(shipment.carrierName);
    const hasDriver = digits(shipment.driverNationalId).length === 11 && cleanText(shipment.driverFirstName) && cleanText(shipment.driverLastName);
    if (!normalizePlate(shipment.plate)) issues.push("e-İrsaliye üçün nəqliyyat plakası daxil edilməlidir.");
    if (!hasCarrier && !hasDriver) issues.push("e-İrsaliye üçün daşıyıcı VKN/TCKN və adı və ya sürücü adı, soyadı və TCKN-si daxil edilməlidir.");
  }
  if (document?.documentType === "exportInvoice") {
    const buyer = document.snapshot.counterparty ?? {};
    const details = document.snapshot.exportDetails ?? {};
    if (!cleanText(buyer.registrationName ?? buyer.name)) issues.push("İxrac alıcısının rəsmi adı daxil edilməlidir.");
    if (!cleanText(buyer.address) || !cleanText(details.countryName ?? buyer.countryName)) issues.push("İxrac alıcısının ünvanı və ölkəsi daxil edilməlidir.");
    if (!cleanUpper(details.incoterm, 3)) issues.push("İxrac üçün Incoterms təslim şərti seçilməlidir.");
    if (!String(details.transportModeCode ?? "").replace(/\D/g, "")) issues.push("İxrac üçün nəqliyyat üsulu seçilməlidir.");
    if (!cleanUpper(details.packageTypeCode, 3) || Number(details.packageQuantity) <= 0) issues.push("İxrac üçün qab növü və sayı daxil edilməlidir.");
    if (String(document.snapshot.currency ?? "TRY").toUpperCase() !== "TRY" && Number(details.exchangeRate) <= 0) issues.push("Xarici valyutalı ixrac fakturası üçün TRY məzənnəsi daxil edilməlidir.");
    const lines = document.snapshot.lines ?? [];
    if (lines.some((line, index) => !normalizeGtip(details.gtips?.[String(index + 1)] ?? line.gtip))) issues.push("İxrac sənədində hər məhsul sətri üçün GTİP daxil edilməlidir.");
  }
  if ((document?.snapshot?.lines ?? []).length === 0) issues.push("Sənəddə məhsul sətri yoxdur.");
  if ((document?.snapshot?.lines ?? []).some((line) => Number(line.quantity) <= 0)) issues.push("Məhsul miqdarlarından biri düzgün deyil.");
  const credentials = credentialStatus(normalized, environment);
  if (!credentials.configured) issues.push("Provayder giriş məlumatları serverdə təyin edilməyib.");
  return { ready: issues.length === 0, issues, credentials };
}

export function buildEDocumentDraft({ id, sourceDocument, documentType, createdAt = new Date().toISOString() }) {
  if (!sourceDocument?.id) throw new Error("Mənbə sənəd tapılmadı.");
  if (!documentTypes.has(documentType)) throw new Error("e-Belge növü düzgün deyil.");

  const lines = Array.isArray(sourceDocument.lines) ? sourceDocument.lines : [];
  return {
    id,
    documentType,
    direction: "outgoing",
    status: "draft",
    number: null,
    uuid: null,
    sourceDocumentId: sourceDocument.id,
    sourceRevision: sourceDocument.updatedAt ?? sourceDocument.createdAt ?? createdAt,
    counterpartyId: sourceDocument.counterpartyId ?? null,
    counterpartyName: sourceDocument.counterpartyName ?? "",
    createdAt,
    updatedAt: createdAt,
    snapshot: {
      documentDate: sourceDocument.documentDate ?? sourceDocument.createdAt ?? createdAt,
      saleMode: sourceDocument.saleMode ?? "regular",
      exportMode: sourceDocument.exportMode === true,
      account: sourceDocument.account ?? "",
      currency: sourceDocument.currency ?? "TRY",
      total: Number(sourceDocument.total ?? sourceDocument.paymentSummary?.total ?? 0),
      taxTotal: Number(sourceDocument.taxTotal ?? 0),
      discountTotal: Number(sourceDocument.discountTotal ?? 0),
      supplier: sourceDocument.eDocumentSupplier ? { ...sourceDocument.eDocumentSupplier } : null,
      counterparty: {
        id: sourceDocument.counterpartyId ?? null,
        name: sourceDocument.counterpartyName ?? "",
        taxNumber: sourceDocument.counterpartyTaxNumber ?? "",
        taxOffice: sourceDocument.counterpartyTaxOffice ?? "",
        address: sourceDocument.counterpartyAddress ?? "",
        city: sourceDocument.counterpartyCity ?? "",
        district: sourceDocument.counterpartyDistrict ?? "",
        postalCode: sourceDocument.counterpartyPostalCode ?? "",
        countryCode: sourceDocument.counterpartyCountryCode ?? "",
        countryName: sourceDocument.counterpartyCountryName ?? "",
        registrationName: sourceDocument.counterpartyRegistrationName ?? sourceDocument.counterpartyName ?? "",
        companyId: sourceDocument.counterpartyCompanyId ?? sourceDocument.counterpartyTaxNumber ?? "",
        email: sourceDocument.counterpartyEmail ?? "",
        phone: sourceDocument.counterpartyPhone ?? "",
      },
      shipment: {
        actualDespatchDate: sourceDocument.shipment?.actualDespatchDate ?? "",
        actualDespatchTime: sourceDocument.shipment?.actualDespatchTime ?? "",
        carrierTaxNumber: sourceDocument.shipment?.carrierTaxNumber ?? "",
        carrierName: sourceDocument.shipment?.carrierName ?? "",
        plate: sourceDocument.shipment?.plate ?? "",
        driverFirstName: sourceDocument.shipment?.driverFirstName ?? "",
        driverLastName: sourceDocument.shipment?.driverLastName ?? "",
        driverNationalId: sourceDocument.shipment?.driverNationalId ?? "",
        deliveryAddress: sourceDocument.shipment?.deliveryAddress ?? sourceDocument.counterpartyAddress ?? "",
      },
      exportDetails: {
        incoterm: sourceDocument.exportDetails?.incoterm ?? "",
        transportModeCode: sourceDocument.exportDetails?.transportModeCode ?? "",
        packageTypeCode: sourceDocument.exportDetails?.packageTypeCode ?? "",
        packageId: sourceDocument.exportDetails?.packageId ?? "",
        packageQuantity: Number(sourceDocument.exportDetails?.packageQuantity ?? 0),
        exchangeRate: Number(sourceDocument.exportDetails?.exchangeRate ?? sourceDocument.exchangeRate ?? 0),
        deliveryAddress: sourceDocument.exportDetails?.deliveryAddress ?? sourceDocument.counterpartyAddress ?? "",
        countryCode: sourceDocument.exportDetails?.countryCode ?? sourceDocument.counterpartyCountryCode ?? "",
        countryName: sourceDocument.exportDetails?.countryName ?? sourceDocument.counterpartyCountryName ?? "",
        city: sourceDocument.exportDetails?.city ?? sourceDocument.counterpartyCity ?? "",
        gtips: { ...(sourceDocument.exportDetails?.gtips ?? {}) },
      },
      lines: lines.map((line) => ({
        productId: line.productId ?? line.id ?? null,
        name: line.name ?? line.productName ?? "",
        code: line.code ?? line.sku ?? "",
        quantity: Number(line.qty ?? line.quantity ?? 0),
        unit: line.unit ?? "",
        unitPrice: Number(line.price ?? line.unitPrice ?? 0),
        discount: Number(line.discount ?? 0),
        taxRate: Number(line.taxRate ?? line.vatRate ?? 0),
        total: Number(line.total ?? 0),
        gtip: String(line.gtip ?? line.customsCode ?? ""),
      })),
    },
  };
}

const gibProfiles = {
  eInvoice: "TEMELFATURA",
  eArchive: "EARSIVFATURA",
  eDespatch: "TEMELIRSALIYE",
  exportInvoice: "IHRACAT",
};

const gibTypeCodes = {
  eInvoice: "SATIS",
  eArchive: "SATIS",
  eDespatch: "SEVK",
  exportInvoice: "ISTISNA",
};

const customizationIds = {
  eInvoice: "TR1.2",
  eArchive: "TR1.2",
  exportInvoice: "TR1.2",
  eDespatch: "TR1.2.1",
};

const customsAuthority = {
  title: "GÜMRÜK VE TİCARET BAKANLIĞI",
  taxNumber: "1460415308",
  taxOffice: "Ulus",
  country: "TR",
  countryName: "Türkiye",
  address: "Üniversiteler Mahallesi Dumlupınar Bulvarı 151",
  city: "Ankara",
  district: "Çankaya",
  postalCode: "",
  email: "",
  phone: "",
};

const unitCodes = {
  mt: "MTR",
  m: "MTR",
  metre: "MTR",
  meter: "MTR",
  "m²": "MTK",
  m2: "MTK",
  kg: "KGM",
  rulo: "NIU",
  ədəd: "NIU",
  adet: "NIU",
  pcs: "NIU",
};

const decimal = (value) => Number(Number(value ?? 0).toFixed(2));
const decimalText = (value) => decimal(value).toFixed(2);
const digits = (value) => String(value ?? "").replace(/\D/g, "");
const xmlEscape = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function dateParts(value) {
  const date = value ? new Date(value) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    date: safe.toISOString().slice(0, 10),
    time: safe.toISOString().slice(11, 19),
  };
}

function partyIdScheme(value) {
  return digits(value).length === 11 ? "TCKN" : "VKN";
}

function lineAmount(line) {
  const explicit = Number(line.total);
  if (Number.isFinite(explicit) && explicit > 0) return decimal(explicit);
  const gross = Number(line.quantity ?? 0) * Number(line.unitPrice ?? 0);
  return decimal(gross * (1 - Number(line.discount ?? 0) / 100));
}

const cleanUpper = (value, maxLength = 64) => cleanText(String(value ?? "")).toUpperCase().slice(0, maxLength);

function normalizeGtip(value) {
  return String(value ?? "").replace(/[^0-9]/g, "").slice(0, 12);
}

function normalizePlate(value) {
  return cleanUpper(value, 16).replace(/\s/g, "");
}

export function buildGibDocumentModel(document, settings = defaultEDocumentSettings) {
  if (!document?.snapshot) throw new Error("e-Belge snapshot-u tapılmadı.");
  const normalized = normalizeEDocumentSettings(settings);
  const snapshot = document.snapshot;
  const issue = dateParts(snapshot.documentDate ?? document.createdAt);
  const supplier = snapshot.supplier ?? normalized.company;
  const buyer = snapshot.counterparty ?? {};
  const isExport = document.documentType === "exportInvoice";
  const isExportDespatch = document.documentType === "eDespatch" && (snapshot.saleMode === "export" || snapshot.exportMode === true);
  const currency = String(snapshot.currency ?? "TRY").toUpperCase().slice(0, 3) || "TRY";
  const profileId = isExport
    ? "IHRACAT"
    : document.documentType === "eDespatch"
      ? "TEMELIRSALIYE"
      : document.documentType === "eArchive"
        ? "EARSIVFATURA"
        : document.gib?.profileId ?? gibProfiles[document.documentType] ?? "TEMELFATURA";
  const typeCode = isExport
    ? "ISTISNA"
    : document.documentType === "eDespatch"
      ? "SEVK"
      : document.gib?.typeCode ?? gibTypeCodes[document.documentType] ?? "SATIS";
  const lines = (snapshot.lines ?? []).map((line, index) => {
    const extensionAmount = lineAmount(line);
    const taxRate = isExport ? 0 : decimal(line.taxRate);
    return {
      id: String(index + 1),
      name: String(line.name ?? ""),
      code: String(line.code ?? ""),
      quantity: decimal(line.quantity),
      unit: String(line.unit ?? ""),
      unitCode: unitCodes[String(line.unit ?? "").toLowerCase()] ?? "C62",
      unitPrice: decimal(line.unitPrice),
      discountRate: decimal(line.discount),
      taxRate,
      extensionAmount,
      taxAmount: decimal(extensionAmount * taxRate / 100),
      gtip: normalizeGtip(snapshot.exportDetails?.gtips?.[String(index + 1)] ?? line.gtip),
    };
  });
  const goodsTotal = decimal(lines.reduce((sum, line) => sum + line.extensionAmount, 0));
  const calculatedTaxTotal = decimal(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const taxTotal = isExport ? 0 : decimal(Number(snapshot.taxTotal) || calculatedTaxTotal);
  const taxInclusive = decimal(goodsTotal + taxTotal);
  const payable = isExport ? goodsTotal : decimal(Number(snapshot.total) || taxInclusive);
  const taxBreakdown = [...new Set(lines.map((line) => line.taxRate))].map((rate) => {
    const taxableAmount = decimal(lines.filter((line) => line.taxRate === rate).reduce((sum, line) => sum + line.extensionAmount, 0));
    return { rate, taxableAmount, taxAmount: decimal(taxableAmount * rate / 100) };
  });

  return {
    standard: "UBL-TR",
    ublVersion: "2.1",
    customizationId: customizationIds[document.documentType] ?? "TR1.2",
    documentType: document.documentType,
    profileId,
    typeCode,
    number: document.number ?? "",
    uuid: document.uuid ?? "",
    issueDate: issue.date,
    issueTime: issue.time,
    currency,
    supplier: {
      title: supplier.title ?? "",
      taxNumber: digits(supplier.taxNumber),
      taxOffice: supplier.taxOffice ?? "",
      country: supplier.country ?? "TR",
      address: supplier.address ?? "",
      city: supplier.city ?? "",
      district: supplier.district ?? "",
      postalCode: supplier.postalCode ?? "",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
    },
    buyer: {
      name: buyer.name ?? "",
      taxNumber: isExportDespatch ? "2222222222" : digits(buyer.taxNumber),
      originalTaxNumber: digits(buyer.taxNumber),
      taxOffice: buyer.taxOffice ?? "",
      address: buyer.address ?? "",
      city: buyer.city ?? snapshot.exportDetails?.city ?? "",
      district: buyer.district ?? "",
      postalCode: buyer.postalCode ?? "",
      countryCode: cleanUpper(buyer.countryCode ?? snapshot.exportDetails?.countryCode, 2),
      countryName: buyer.countryName ?? snapshot.exportDetails?.countryName ?? "",
      registrationName: buyer.registrationName ?? buyer.name ?? "",
      companyId: buyer.companyId ?? buyer.taxNumber ?? "",
      email: buyer.email ?? "",
      phone: buyer.phone ?? "",
    },
    accountingCustomer: isExport ? customsAuthority : null,
    shipment: {
      ...(snapshot.shipment ?? {}),
      plate: normalizePlate(snapshot.shipment?.plate),
      driverNationalId: digits(snapshot.shipment?.driverNationalId).slice(0, 11),
    },
    exportDetails: {
      ...(snapshot.exportDetails ?? {}),
      incoterm: cleanUpper(snapshot.exportDetails?.incoterm, 3),
      transportModeCode: String(snapshot.exportDetails?.transportModeCode ?? "").replace(/\D/g, "").slice(0, 2),
      packageTypeCode: cleanUpper(snapshot.exportDetails?.packageTypeCode, 3),
      packageId: cleanText(snapshot.exportDetails?.packageId),
      packageQuantity: Math.max(0, Number(snapshot.exportDetails?.packageQuantity ?? 0)),
      exchangeRate: Math.max(0, Number(snapshot.exportDetails?.exchangeRate ?? 0)),
    },
    lines,
    totals: { goodsTotal, taxTotal, taxInclusive, payable, discountTotal: decimal(snapshot.discountTotal) },
    taxBreakdown,
    taxExemption: isExport ? { code: "301", reason: "11/1-a Mal ihracatı" } : null,
    standards: {
      ublTr: document.documentType === "eDespatch" ? "UBL-TR 1.2.1 e-İrsaliye" : "UBL-TR 1.2 Fatura",
      qr: "GİB Karekod Standardı v1.2",
      signature: "XAdES-BES",
    },
  };
}

export function buildGibQrPayload(document, settings = defaultEDocumentSettings) {
  const model = buildGibDocumentModel(document, settings);
  if (document.documentType === "eDespatch") {
    return {
      vkntckn: model.supplier.taxNumber,
      avkntckn: model.buyer.taxNumber,
      senaryo: model.profileId,
      tip: model.typeCode,
      tarih: model.issueDate,
      no: model.number,
      ettn: model.uuid,
      sevktarihi: model.shipment.actualDespatchDate || model.issueDate,
      sevkzamani: model.shipment.actualDespatchTime || model.issueTime,
      ...(model.shipment.carrierTaxNumber ? { tasiyicivkn: digits(model.shipment.carrierTaxNumber) } : {}),
      ...(model.shipment.plate ? { plaka: String(model.shipment.plate).toUpperCase().replace(/\s/g, "") } : {}),
    };
  }

  const payload = {
    vkntckn: model.supplier.taxNumber,
    avkntckn: model.accountingCustomer?.taxNumber ?? model.buyer.taxNumber,
    senaryo: model.profileId,
    tip: model.typeCode,
    tarih: model.issueDate,
    no: model.number,
    ettn: model.uuid,
    parabirimi: model.currency,
    malhizmettoplam: decimalText(model.totals.goodsTotal),
  };
  for (const tax of model.taxBreakdown) {
    payload[`kdvmatrah(${tax.rate})`] = decimalText(tax.taxableAmount);
    payload[`hesaplanankdv(${tax.rate})`] = decimalText(tax.taxAmount);
  }
  payload.vergidahil = decimalText(model.totals.taxInclusive);
  payload.odenecek = decimalText(model.totals.payable);
  return payload;
}

function postalAddressXml(party, overrideAddress = "") {
  const countryCode = cleanUpper(party.countryCode ?? party.country, 2);
  const countryName = cleanText(party.countryName ?? party.country ?? (countryCode === "TR" ? "Türkiye" : ""));
  return `<cac:PostalAddress><cbc:StreetName>${xmlEscape(overrideAddress || party.address)}</cbc:StreetName><cbc:CitySubdivisionName>${xmlEscape(party.district)}</cbc:CitySubdivisionName><cbc:CityName>${xmlEscape(party.city)}</cbc:CityName><cbc:PostalZone>${xmlEscape(party.postalCode)}</cbc:PostalZone><cac:Country>${countryCode ? `<cbc:IdentificationCode>${xmlEscape(countryCode)}</cbc:IdentificationCode>` : ""}<cbc:Name>${xmlEscape(countryName)}</cbc:Name></cac:Country></cac:PostalAddress>`;
}

function deliveryAddressXml(party, overrideAddress = "") {
  return postalAddressXml(party, overrideAddress)
    .replace(/^<cac:PostalAddress>/, "<cac:DeliveryAddress>")
    .replace(/<\/cac:PostalAddress>$/, "</cac:DeliveryAddress>");
}

function partyXml(tag, party, options = {}) {
  const title = party.title ?? party.name ?? party.registrationName ?? "";
  const identification = options.exportBuyer
    ? `<cac:PartyIdentification><cbc:ID schemeID="PARTYTYPE">EXPORT</cbc:ID></cac:PartyIdentification>`
    : `<cac:PartyIdentification><cbc:ID schemeID="${partyIdScheme(party.taxNumber)}">${xmlEscape(party.taxNumber)}</cbc:ID></cac:PartyIdentification>`;
  const tax = options.exportBuyer ? "" : `<cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${xmlEscape(party.taxOffice)}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>`;
  const legal = options.exportBuyer
    ? `<cac:PartyLegalEntity><cbc:RegistrationName>${xmlEscape(party.registrationName || title)}</cbc:RegistrationName><cbc:CompanyID>${xmlEscape(party.companyId)}</cbc:CompanyID></cac:PartyLegalEntity>`
    : "";
  return `<cac:${tag}><cac:Party>${identification}<cac:PartyName><cbc:Name>${xmlEscape(title)}</cbc:Name></cac:PartyName>${postalAddressXml(party)}${tax}${legal}<cac:Contact><cbc:Telephone>${xmlEscape(party.phone)}</cbc:Telephone><cbc:ElectronicMail>${xmlEscape(party.email)}</cbc:ElectronicMail></cac:Contact></cac:Party></cac:${tag}>`;
}

function signatureReferenceXml(model) {
  return `<cac:Signature><cbc:ID schemeID="${partyIdScheme(model.supplier.taxNumber)}">${xmlEscape(model.supplier.taxNumber)}</cbc:ID><cac:SignatoryParty><cac:PartyIdentification><cbc:ID schemeID="${partyIdScheme(model.supplier.taxNumber)}">${xmlEscape(model.supplier.taxNumber)}</cbc:ID></cac:PartyIdentification><cac:PostalAddress>${postalAddressXml(model.supplier).replace(/^<cac:PostalAddress>|<\/cac:PostalAddress>$/g, "")}</cac:PostalAddress></cac:SignatoryParty><cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#Signature</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment></cac:Signature>`;
}

function draftXslt(model) {
  const heading = model.documentType === "eDespatch" ? "e-İRSALİYE" : model.documentType === "eArchive" ? "e-ARŞİV FATURA" : model.documentType === "exportInvoice" ? "İHRACAT FATURASI" : "e-FATURA";
  return `<?xml version="1.0" encoding="UTF-8"?><xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:output method="html" encoding="UTF-8"/><xsl:template match="/"><html><head><meta charset="UTF-8"/><title>${heading}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:32px}h1{text-align:center;color:#285f6c}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #ccd5df;padding:7px;text-align:left}th{background:#eef3f7}.meta{display:grid;grid-template-columns:180px 1fr;gap:6px;max-width:760px;margin:auto}.label{font-weight:bold;color:#64748b}</style></head><body><h1>${heading}</h1><div class="meta"><span class="label">Belge No</span><span><xsl:value-of select="/*/*[local-name()='ID'][1]"/></span><span class="label">ETTN</span><span><xsl:value-of select="/*/*[local-name()='UUID']"/></span><span class="label">Tarih</span><span><xsl:value-of select="/*/*[local-name()='IssueDate']"/></span><span class="label">Senaryo</span><span><xsl:value-of select="/*/*[local-name()='ProfileID']"/></span></div><table><thead><tr><th>XML alanı</th><th>Değer</th></tr></thead><tbody><xsl:for-each select="//*[not(*) and normalize-space(.)!='']"><tr><td><xsl:value-of select="name()"/></td><td><xsl:value-of select="."/></td></tr></xsl:for-each></tbody></table></body></html></xsl:template></xsl:stylesheet>`;
}

function xsltReferenceXml(model) {
  const encoded = Buffer.from(draftXslt(model), "utf8").toString("base64");
  const filename = model.documentType === "eDespatch" ? "irsaliye.xslt" : "general.xslt";
  return `<cac:AdditionalDocumentReference><cbc:ID>${xmlEscape(model.uuid)}</cbc:ID><cbc:IssueDate>${model.issueDate}</cbc:IssueDate><cbc:DocumentTypeCode>XSLT</cbc:DocumentTypeCode><cac:Attachment><cbc:EmbeddedDocumentBinaryObject characterSetCode="UTF-8" encodingCode="Base64" filename="${filename}" mimeCode="application/xml">${encoded}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>`;
}

function commonXml(model) {
  return `<cbc:UBLVersionID>${model.ublVersion}</cbc:UBLVersionID><cbc:CustomizationID>${model.customizationId}</cbc:CustomizationID><cbc:ProfileID>${model.profileId}</cbc:ProfileID><cbc:ID>${xmlEscape(model.number)}</cbc:ID><cbc:CopyIndicator>false</cbc:CopyIndicator><cbc:UUID>${xmlEscape(model.uuid)}</cbc:UUID><cbc:IssueDate>${model.issueDate}</cbc:IssueDate><cbc:IssueTime>${model.issueTime}</cbc:IssueTime>`;
}

function unsignedExtensionXml() {
  return `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><arix:UnsignedDraft xmlns:arix="urn:arix:draft">true</arix:UnsignedDraft></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>`;
}

function taxCategoryXml(model, rate) {
  const exemption = model.taxExemption
    ? `<cbc:TaxExemptionReasonCode>${model.taxExemption.code}</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>${xmlEscape(model.taxExemption.reason)}</cbc:TaxExemptionReason>`
    : "";
  return `<cac:TaxCategory>${exemption}<cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>`;
}

function taxSubtotalXml(model, taxableAmount, taxAmount, rate) {
  return `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="${model.currency}">${decimalText(taxableAmount)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${model.currency}">${decimalText(taxAmount)}</cbc:TaxAmount><cbc:Percent>${decimalText(rate)}</cbc:Percent>${taxCategoryXml(model, rate)}</cac:TaxSubtotal>`;
}

function exportDeliveryXml(model, line) {
  const details = model.exportDetails;
  const deliveryParty = { ...model.buyer, address: details.deliveryAddress || model.buyer.address, city: details.city || model.buyer.city, countryCode: details.countryCode || model.buyer.countryCode, countryName: details.countryName || model.buyer.countryName };
  return `<cac:Delivery>${deliveryAddressXml(deliveryParty, details.deliveryAddress)}<cac:DeliveryTerms><cbc:ID schemeID="INCOTERMS">${xmlEscape(details.incoterm)}</cbc:ID></cac:DeliveryTerms><cac:Shipment><cbc:ID></cbc:ID><cac:GoodsItem><cbc:RequiredCustomsID>${xmlEscape(line.gtip)}</cbc:RequiredCustomsID></cac:GoodsItem><cac:ShipmentStage><cbc:TransportModeCode>${xmlEscape(details.transportModeCode)}</cbc:TransportModeCode></cac:ShipmentStage><cac:TransportHandlingUnit><cac:ActualPackage><cbc:ID>${xmlEscape(details.packageId)}</cbc:ID><cbc:Quantity>${decimalText(details.packageQuantity)}</cbc:Quantity><cbc:PackagingTypeCode>${xmlEscape(details.packageTypeCode)}</cbc:PackagingTypeCode></cac:ActualPackage></cac:TransportHandlingUnit></cac:Shipment></cac:Delivery>`;
}

function invoiceLineXml(model, line) {
  return `<cac:InvoiceLine><cbc:ID>${line.id}</cbc:ID><cbc:InvoicedQuantity unitCode="${line.unitCode}">${line.quantity}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="${model.currency}">${decimalText(line.extensionAmount)}</cbc:LineExtensionAmount>${model.documentType === "exportInvoice" ? exportDeliveryXml(model, line) : ""}<cac:TaxTotal><cbc:TaxAmount currencyID="${model.currency}">${decimalText(line.taxAmount)}</cbc:TaxAmount>${taxSubtotalXml(model, line.extensionAmount, line.taxAmount, line.taxRate)}</cac:TaxTotal><cac:Item><cbc:Name>${xmlEscape(line.name)}</cbc:Name><cac:SellersItemIdentification><cbc:ID>${xmlEscape(line.code)}</cbc:ID></cac:SellersItemIdentification></cac:Item><cac:Price><cbc:PriceAmount currencyID="${model.currency}">${decimalText(line.unitPrice)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
}

function despatchShipmentXml(model) {
  const shipment = model.shipment;
  const carrier = shipment.carrierTaxNumber
    ? `<cac:CarrierParty><cac:PartyIdentification><cbc:ID schemeID="${partyIdScheme(shipment.carrierTaxNumber)}">${xmlEscape(digits(shipment.carrierTaxNumber))}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>${xmlEscape(shipment.carrierName)}</cbc:Name></cac:PartyName>${postalAddressXml({})}</cac:CarrierParty>`
    : "";
  const driver = shipment.driverNationalId
    ? `<cac:DriverPerson><cbc:FirstName>${xmlEscape(shipment.driverFirstName)}</cbc:FirstName><cbc:FamilyName>${xmlEscape(shipment.driverLastName)}</cbc:FamilyName><cbc:Title>Şoför</cbc:Title><cbc:NationalityID>${xmlEscape(shipment.driverNationalId)}</cbc:NationalityID></cac:DriverPerson>`
    : "";
  return `<cac:Shipment><cbc:ID>${xmlEscape(model.uuid)}</cbc:ID><cac:ShipmentStage><cac:TransportMeans><cac:RoadTransport><cbc:LicensePlateID schemeID="PLAKA">${xmlEscape(shipment.plate)}</cbc:LicensePlateID></cac:RoadTransport></cac:TransportMeans>${driver}</cac:ShipmentStage><cac:Delivery>${shipment.deliveryAddress ? deliveryAddressXml({ ...model.buyer, address: shipment.deliveryAddress }) : ""}${carrier}<cac:Despatch><cbc:ActualDespatchDate>${xmlEscape(shipment.actualDespatchDate || model.issueDate)}</cbc:ActualDespatchDate><cbc:ActualDespatchTime>${xmlEscape(shipment.actualDespatchTime || model.issueTime)}</cbc:ActualDespatchTime></cac:Despatch></cac:Delivery></cac:Shipment>`;
}

export function buildUblTrXml(document, settings = defaultEDocumentSettings) {
  const model = buildGibDocumentModel(document, settings);
  const namespace = document.documentType === "eDespatch"
    ? "urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
    : "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
  const root = document.documentType === "eDespatch" ? "DespatchAdvice" : "Invoice";
  const schema = document.documentType === "eDespatch" ? "UBLTR-DespatchAdvice-2.1.xsd" : "UBLTR-Invoice-2.1.xsd";
  const opening = `<?xml version="1.0" encoding="UTF-8"?><${root} xmlns="${namespace}" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${namespace} ${schema}">`;

  if (document.documentType === "eDespatch") {
    const lines = model.lines.map((line) => `<cac:DespatchLine><cbc:ID>${line.id}</cbc:ID><cbc:DeliveredQuantity unitCode="${line.unitCode}">${line.quantity}</cbc:DeliveredQuantity><cac:OrderLineReference><cbc:LineID>${line.id}</cbc:LineID></cac:OrderLineReference><cac:Item><cbc:Name>${xmlEscape(line.name)}</cbc:Name><cac:SellersItemIdentification><cbc:ID>${xmlEscape(line.code)}</cbc:ID></cac:SellersItemIdentification></cac:Item><cac:Shipment><cbc:ID></cbc:ID></cac:Shipment></cac:DespatchLine>`).join("");
    return `${opening}${unsignedExtensionXml()}${commonXml(model)}<cbc:DespatchAdviceTypeCode>${model.typeCode}</cbc:DespatchAdviceTypeCode><cbc:LineCountNumeric>${model.lines.length}</cbc:LineCountNumeric>${xsltReferenceXml(model)}${signatureReferenceXml(model)}${partyXml("DespatchSupplierParty", model.supplier)}${partyXml("DeliveryCustomerParty", { ...model.buyer, title: model.buyer.name })}${despatchShipmentXml(model)}${lines}</DespatchAdvice>`;
  }

  const taxSubtotals = model.taxBreakdown.map((tax) => taxSubtotalXml(model, tax.taxableAmount, tax.taxAmount, tax.rate)).join("");
  const exchangeRate = model.currency !== "TRY" && model.exportDetails?.exchangeRate > 0
    ? `<cac:PricingExchangeRate><cbc:SourceCurrencyCode>${model.currency}</cbc:SourceCurrencyCode><cbc:TargetCurrencyCode>TRY</cbc:TargetCurrencyCode><cbc:CalculationRate>${model.exportDetails.exchangeRate}</cbc:CalculationRate></cac:PricingExchangeRate>`
    : "";
  const customerXml = model.documentType === "exportInvoice"
    ? `${partyXml("AccountingCustomerParty", model.accountingCustomer)}${partyXml("BuyerCustomerParty", model.buyer, { exportBuyer: true })}`
    : partyXml("AccountingCustomerParty", { ...model.buyer, title: model.buyer.name });
  const lines = model.lines.map((line) => invoiceLineXml(model, line)).join("");
  return `${opening}${unsignedExtensionXml()}${commonXml(model)}<cbc:InvoiceTypeCode>${model.typeCode}</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>${model.currency}</cbc:DocumentCurrencyCode><cbc:LineCountNumeric>${model.lines.length}</cbc:LineCountNumeric>${xsltReferenceXml(model)}${signatureReferenceXml(model)}${partyXml("AccountingSupplierParty", model.supplier)}${customerXml}${exchangeRate}<cac:TaxTotal><cbc:TaxAmount currencyID="${model.currency}">${decimalText(model.totals.taxTotal)}</cbc:TaxAmount>${taxSubtotals}</cac:TaxTotal><cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="${model.currency}">${decimalText(model.totals.goodsTotal)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="${model.currency}">${decimalText(model.totals.goodsTotal)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="${model.currency}">${decimalText(model.totals.taxInclusive)}</cbc:TaxInclusiveAmount><cbc:AllowanceTotalAmount currencyID="${model.currency}">${decimalText(model.totals.discountTotal)}</cbc:AllowanceTotalAmount><cbc:PayableAmount currencyID="${model.currency}">${decimalText(model.totals.payable)}</cbc:PayableAmount></cac:LegalMonetaryTotal>${lines}</Invoice>`;
}

export function buildGibComplianceReport(document, settings = defaultEDocumentSettings) {
  const model = buildGibDocumentModel(document, settings);
  const xml = buildUblTrXml(document, settings);
  const checks = [
    { id: "ubl-version", label: "UBL versiyası", ok: model.ublVersion === "2.1", detail: `UBL ${model.ublVersion}` },
    { id: "customization", label: "UBL-TR profili", ok: model.customizationId === (model.documentType === "eDespatch" ? "TR1.2.1" : "TR1.2"), detail: model.customizationId },
    { id: "identity", label: "Sənəd nömrəsi və ETTN", ok: /^[A-Z0-9]{3}\d{13}$/.test(model.number) && Boolean(model.uuid), detail: model.number || "Əskik" },
    { id: "xslt", label: "XML içində XSLT görünüşü", ok: xml.includes("DocumentTypeCode>XSLT") && xml.includes("EmbeddedDocumentBinaryObject"), detail: "Base64 XSLT" },
    { id: "signature", label: "İmza referansı", ok: xml.includes("<cac:Signature>") && xml.includes("#Signature"), detail: "XAdES-BES provayder imzası gözlənilir" },
  ];
  if (model.documentType === "exportInvoice") {
    checks.push(
      { id: "export-profile", label: "İxrac ssenarisi", ok: model.profileId === "IHRACAT" && model.typeCode === "ISTISNA", detail: `${model.profileId} / ${model.typeCode}` },
      { id: "export-tax", label: "İxrac KDV istisnası", ok: model.taxExemption?.code === "301" && model.totals.taxTotal === 0, detail: "301 · 11/1-a" },
      { id: "export-customs", label: "Gömrük və xarici alıcı", ok: xml.includes(customsAuthority.taxNumber) && xml.includes('schemeID="PARTYTYPE">EXPORT'), detail: "AccountingCustomer + BuyerCustomer" },
      { id: "export-logistics", label: "GTİP və logistika", ok: model.lines.every((line) => Boolean(line.gtip)) && Boolean(model.exportDetails.incoterm && model.exportDetails.transportModeCode && model.exportDetails.packageTypeCode), detail: "GTİP · Incoterms · qab · nəqliyyat" },
    );
  }
  if (model.documentType === "eDespatch") {
    checks.push(
      { id: "despatch-time", label: "Faktiki sevk vaxtı", ok: Boolean(model.shipment.actualDespatchDate && model.shipment.actualDespatchTime), detail: `${model.shipment.actualDespatchDate || "-"} ${model.shipment.actualDespatchTime || "-"}` },
      { id: "despatch-transport", label: "Nəqliyyat və sürücü/daşıyıcı", ok: Boolean(model.shipment.plate && (model.shipment.driverNationalId || model.shipment.carrierTaxNumber)), detail: model.shipment.plate || "Əskik" },
    );
  }
  return {
    standard: model.standards,
    checks,
    passed: checks.filter((check) => check.ok).length,
    total: checks.length,
    readyForSigning: checks.every((check) => check.ok),
    signatureState: document.status === "completed" && document.provider !== "mock" ? "provider-signed" : "unsigned-draft",
  };
}
