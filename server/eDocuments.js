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
  if (document?.documentType !== "exportInvoice" && ![10, 11].includes(String(document.snapshot.counterparty.taxNumber ?? "").length)) {
    issues.push("Alıcının VKN/TCKN məlumatı 10 və ya 11 rəqəm olmalıdır.");
  }
  if (!document?.number || !/^[A-Z0-9]{3}\d{13}$/.test(document.number)) issues.push("GİB sənəd nömrəsi 3 simvolluq seriya, 4 rəqəm il və 9 rəqəm ardıcıllıqdan ibarət olmalıdır.");
  if (!document?.uuid) issues.push("ETTN/UUID yaradılmayıb.");
  if (document?.documentType === "eDespatch" && (!document.snapshot.shipment?.actualDespatchDate || !document.snapshot.shipment?.actualDespatchTime)) {
    issues.push("e-İrsaliye üçün faktiki sevk tarixi və saatı daxil edilməlidir.");
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
        email: sourceDocument.counterpartyEmail ?? "",
      },
      shipment: {
        actualDespatchDate: sourceDocument.shipment?.actualDespatchDate ?? "",
        actualDespatchTime: sourceDocument.shipment?.actualDespatchTime ?? "",
        carrierTaxNumber: sourceDocument.shipment?.carrierTaxNumber ?? "",
        carrierName: sourceDocument.shipment?.carrierName ?? "",
        plate: sourceDocument.shipment?.plate ?? "",
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
  exportInvoice: "SATIS",
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

export function buildGibDocumentModel(document, settings = defaultEDocumentSettings) {
  if (!document?.snapshot) throw new Error("e-Belge snapshot-u tapılmadı.");
  const normalized = normalizeEDocumentSettings(settings);
  const snapshot = document.snapshot;
  const issue = dateParts(snapshot.documentDate ?? document.createdAt);
  const supplier = snapshot.supplier ?? normalized.company;
  const buyer = snapshot.counterparty ?? {};
  const currency = String(snapshot.currency ?? "TRY").toUpperCase().slice(0, 3) || "TRY";
  const profileId = document.gib?.profileId ?? gibProfiles[document.documentType] ?? "TEMELFATURA";
  const typeCode = document.gib?.typeCode ?? gibTypeCodes[document.documentType] ?? "SATIS";
  const lines = (snapshot.lines ?? []).map((line, index) => {
    const extensionAmount = lineAmount(line);
    const taxRate = decimal(line.taxRate);
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
    };
  });
  const goodsTotal = decimal(lines.reduce((sum, line) => sum + line.extensionAmount, 0));
  const calculatedTaxTotal = decimal(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const taxTotal = decimal(Number(snapshot.taxTotal) || calculatedTaxTotal);
  const taxInclusive = decimal(goodsTotal + taxTotal);
  const payable = decimal(Number(snapshot.total) || taxInclusive);
  const taxBreakdown = [...new Set(lines.map((line) => line.taxRate))].map((rate) => {
    const taxableAmount = decimal(lines.filter((line) => line.taxRate === rate).reduce((sum, line) => sum + line.extensionAmount, 0));
    return { rate, taxableAmount, taxAmount: decimal(taxableAmount * rate / 100) };
  });

  return {
    standard: "UBL-TR",
    ublVersion: "2.1",
    customizationId: "TR1.2",
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
      taxNumber: document.documentType === "exportInvoice" ? "1460415308" : digits(buyer.taxNumber),
      originalTaxNumber: digits(buyer.taxNumber),
      taxOffice: buyer.taxOffice ?? "",
      address: buyer.address ?? "",
      email: buyer.email ?? "",
    },
    shipment: { ...(snapshot.shipment ?? {}) },
    lines,
    totals: { goodsTotal, taxTotal, taxInclusive, payable, discountTotal: decimal(snapshot.discountTotal) },
    taxBreakdown,
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
    avkntckn: model.buyer.taxNumber,
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

function invoicePartyXml(tag, party) {
  return `<cac:${tag}><cac:Party><cbc:WebsiteURI></cbc:WebsiteURI><cac:PartyIdentification><cbc:ID schemeID="${partyIdScheme(party.taxNumber)}">${xmlEscape(party.taxNumber)}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>${xmlEscape(party.title ?? party.name)}</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>${xmlEscape(party.address)}</cbc:StreetName><cbc:CitySubdivisionName>${xmlEscape(party.district)}</cbc:CitySubdivisionName><cbc:CityName>${xmlEscape(party.city)}</cbc:CityName><cbc:PostalZone>${xmlEscape(party.postalCode)}</cbc:PostalZone><cac:Country><cbc:Name>${xmlEscape(party.country ?? "TR")}</cbc:Name></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${xmlEscape(party.taxOffice)}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme><cac:Contact><cbc:Telephone>${xmlEscape(party.phone)}</cbc:Telephone><cbc:ElectronicMail>${xmlEscape(party.email)}</cbc:ElectronicMail></cac:Contact></cac:Party></cac:${tag}>`;
}

export function buildUblTrXml(document, settings = defaultEDocumentSettings) {
  const model = buildGibDocumentModel(document, settings);
  const common = `<cbc:UBLVersionID>${model.ublVersion}</cbc:UBLVersionID><cbc:CustomizationID>${model.customizationId}</cbc:CustomizationID><cbc:ProfileID>${model.profileId}</cbc:ProfileID><cbc:ID>${xmlEscape(model.number)}</cbc:ID><cbc:CopyIndicator>false</cbc:CopyIndicator><cbc:UUID>${xmlEscape(model.uuid)}</cbc:UUID><cbc:IssueDate>${model.issueDate}</cbc:IssueDate><cbc:IssueTime>${model.issueTime}</cbc:IssueTime>`;

  if (document.documentType === "eDespatch") {
    const lines = model.lines.map((line) => `<cac:DespatchLine><cbc:ID>${line.id}</cbc:ID><cbc:DeliveredQuantity unitCode="${line.unitCode}">${line.quantity}</cbc:DeliveredQuantity><cac:Item><cbc:Name>${xmlEscape(line.name)}</cbc:Name><cac:SellersItemIdentification><cbc:ID>${xmlEscape(line.code)}</cbc:ID></cac:SellersItemIdentification></cac:Item></cac:DespatchLine>`).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2 UBLTR-DespatchAdvice-2.1.xsd">${common}<cbc:DespatchAdviceTypeCode>${model.typeCode}</cbc:DespatchAdviceTypeCode><cbc:LineCountNumeric>${model.lines.length}</cbc:LineCountNumeric>${invoicePartyXml("DespatchSupplierParty", model.supplier)}${invoicePartyXml("DeliveryCustomerParty", { ...model.buyer, title: model.buyer.name })}<cac:Shipment><cbc:ID>${xmlEscape(model.uuid)}</cbc:ID><cac:Delivery><cac:Despatch><cbc:ActualDespatchDate>${xmlEscape(model.shipment.actualDespatchDate || model.issueDate)}</cbc:ActualDespatchDate><cbc:ActualDespatchTime>${xmlEscape(model.shipment.actualDespatchTime || model.issueTime)}</cbc:ActualDespatchTime></cac:Despatch></cac:Delivery></cac:Shipment>${lines}</DespatchAdvice>`;
  }

  const taxSubtotals = model.taxBreakdown.map((tax) => `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="${model.currency}">${decimalText(tax.taxableAmount)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${model.currency}">${decimalText(tax.taxAmount)}</cbc:TaxAmount><cbc:Percent>${tax.rate}</cbc:Percent><cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`).join("");
  const lines = model.lines.map((line) => `<cac:InvoiceLine><cbc:ID>${line.id}</cbc:ID><cbc:InvoicedQuantity unitCode="${line.unitCode}">${line.quantity}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="${model.currency}">${decimalText(line.extensionAmount)}</cbc:LineExtensionAmount><cac:TaxTotal><cbc:TaxAmount currencyID="${model.currency}">${decimalText(line.taxAmount)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="${model.currency}">${decimalText(line.extensionAmount)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${model.currency}">${decimalText(line.taxAmount)}</cbc:TaxAmount><cbc:Percent>${line.taxRate}</cbc:Percent><cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal><cac:Item><cbc:Name>${xmlEscape(line.name)}</cbc:Name><cac:SellersItemIdentification><cbc:ID>${xmlEscape(line.code)}</cbc:ID></cac:SellersItemIdentification></cac:Item><cac:Price><cbc:PriceAmount currencyID="${model.currency}">${decimalText(line.unitPrice)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2 UBLTR-Invoice-2.1.xsd">${common}<cbc:InvoiceTypeCode>${model.typeCode}</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>${model.currency}</cbc:DocumentCurrencyCode><cbc:LineCountNumeric>${model.lines.length}</cbc:LineCountNumeric>${invoicePartyXml("AccountingSupplierParty", model.supplier)}${invoicePartyXml("AccountingCustomerParty", { ...model.buyer, title: model.buyer.name })}<cac:TaxTotal><cbc:TaxAmount currencyID="${model.currency}">${decimalText(model.totals.taxTotal)}</cbc:TaxAmount>${taxSubtotals}</cac:TaxTotal><cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="${model.currency}">${decimalText(model.totals.goodsTotal)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="${model.currency}">${decimalText(model.totals.goodsTotal)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="${model.currency}">${decimalText(model.totals.taxInclusive)}</cbc:TaxInclusiveAmount><cbc:AllowanceTotalAmount currencyID="${model.currency}">${decimalText(model.totals.discountTotal)}</cbc:AllowanceTotalAmount><cbc:PayableAmount currencyID="${model.currency}">${decimalText(model.totals.payable)}</cbc:PayableAmount></cac:LegalMonetaryTotal>${lines}</Invoice>`;
}
