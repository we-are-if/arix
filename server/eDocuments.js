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
  if (!document?.snapshot?.counterparty?.name) issues.push("Alıcı adı yoxdur.");
  if (document?.documentType === "eInvoice" && ![10, 11].includes(String(document.snapshot.counterparty.taxNumber ?? "").length)) {
    issues.push("e-Fatura üçün alıcının VKN/TCKN məlumatı olmalıdır.");
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
      counterparty: {
        id: sourceDocument.counterpartyId ?? null,
        name: sourceDocument.counterpartyName ?? "",
        taxNumber: sourceDocument.counterpartyTaxNumber ?? "",
        taxOffice: sourceDocument.counterpartyTaxOffice ?? "",
        address: sourceDocument.counterpartyAddress ?? "",
        email: sourceDocument.counterpartyEmail ?? "",
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
