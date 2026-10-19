import "dotenv/config";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCipheriv, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { XMLValidator } from "fast-xml-parser";
import { lotAccountingForProduct, rebuildLotAccounting } from "./lotAccounting.js";
import { buildProductLedger } from "./productLedger.js";
import { createAutomaticSaleRollSelection, validateAutomaticSaleRollSelection } from "./rollAllocation.js";
import { normalizeDocumentFinancials, resolveDocumentInvoiceType, validateDocumentFinancials } from "./documentTotals.js";
import { gibCodeCatalog } from "./gibCodes.js";
import {
  accountingOverview,
  accountingTrialBalance,
  ensureCounterpartyAccounting,
  normalizeAccountingStore,
  upsertDocumentJournal,
} from "./accounting.js";
import { normalizeCounterparty, validateCounterparty } from "./counterparties.js";
import {
  capabilityLabels,
  normalizeProviderConnections,
  paymentProviderCatalog,
  publicProviderConnection,
  validateProviderConnectionInput,
} from "./paymentProviders.js";
import {
  externalPaymentOverview,
  importExternalPayments,
  manuallyMatchExternalPayment,
} from "./externalPayments.js";
import {
  bankTransactionSuggestions,
  createCompanyCard,
  createFinancialAccount,
  createRoutingRule,
  financialAccountDetails,
  importCardTransactions,
  importBankTransactions,
  manuallyMatchBankTransaction,
  manuallyMatchSettlement,
  normalizeReconciliationStore,
  reconciliationOverview,
} from "./paymentReconciliation.js";
import {
  applyRegistryToCounterparties,
  lookupEDocumentRegistry,
  parseEDocumentRegistry,
  registryOverview,
} from "./eInvoiceRegistry.js";
import {
  buildEDocumentDraft,
  buildGibComplianceReport,
  buildGibDocumentModel,
  buildGibQrPayload,
  buildUblTrXml,
  eDocumentOverview,
  normalizeEDocumentSettings,
  normalizeEDocumentStore,
  publicEDocumentSettings,
  queueMockEDocument,
  resolveEDocumentSupplier,
  resolveEDocumentPlan,
  resolveSourceDocumentLock,
  testEDocumentConnection,
  syncMockEDocumentStatuses,
  validateEDocumentForSending,
  validateUblTrTemplate,
} from "./eDocuments.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const DB_PATH = join(DATA_DIR, "db.json");
const CREDENTIAL_KEY_PATH = join(DATA_DIR, "payment-credentials.key");
const PORT = Number(process.env.API_PORT ?? 8787);
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID ?? "").trim();
const COMPANY_JOIN_CODE = String(process.env.ARIX_COMPANY_JOIN_CODE ?? "").trim().toUpperCase();
const AUTH_REQUIRED = process.env.ARIX_AUTH_REQUIRED === "1" || Boolean(GOOGLE_CLIENT_ID);
const SESSION_COOKIE = "arix_session";
const SESSION_TTL_MS = Math.max(60 * 60 * 1000, Number(process.env.ARIX_SESSION_TTL_HOURS ?? 168) * 60 * 60 * 1000);
const googleAuthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...String(process.env.ARIX_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean),
]);

const defaultAuthUsers = [
  { id: "arif", name: "Arif Mahmud", role: "Sahib", email: "arifmd@icloud.com", active: true, companyId: "ersa-folyo", googleSubject: null },
  { id: "ekrem", name: "Ekrem Tiryaki", role: "Rəhbər", email: "ekrem@arix.az", active: true, companyId: "ersa-folyo", googleSubject: null },
  { id: "serkan", name: "Serkan Şeremet", role: "Satış rəhbəri", email: "serkan@arix.az", active: true, companyId: "ersa-folyo", googleSubject: null },
  { id: "sami", name: "Sami", role: "Anbar əməliyyatları", email: "sami@arix.az", active: true, companyId: "ersa-folyo", googleSubject: null },
  { id: "mustafa", name: "Mustafa Yazman", role: "Maliyyə", email: "mustafa@arix.az", active: true, companyId: "ersa-folyo", googleSubject: null },
];

let credentialKeyPromise;

async function providerCredentialKey() {
  if (!credentialKeyPromise) {
    credentialKeyPromise = (async () => {
      const environmentSecret = String(process.env.ARIX_CREDENTIAL_SECRET ?? "").trim();
      if (environmentSecret) return createHash("sha256").update(environmentSecret).digest();
      try {
        const stored = await readFile(CREDENTIAL_KEY_PATH, "utf8");
        const key = Buffer.from(stored.trim(), "base64");
        if (key.length === 32) return key;
      } catch {
        // A local key is created on first credential save.
      }
      const key = randomBytes(32);
      await mkdir(DATA_DIR, { recursive: true });
      await writeFile(CREDENTIAL_KEY_PATH, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
      return key;
    })();
  }
  return credentialKeyPromise;
}

async function encryptProviderCredentials(credentials) {
  const key = await providerCredentialKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

const printForm = (title, subtitle) => ({
  title,
  subtitle,
  footerNote: "",
  footerInfo: "",
  showLogo: true,
  showMeta: true,
  showFooter: true,
  showCompanyDetails: true,
  showBankAccounts: true,
  showNotes: true,
  showStamp: true,
  xmlTemplate: "",
});

const invoiceXmlTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2 UBLTR-Invoice-2.1.xsd">
{{EXTENSIONS}}{{COMMON}}{{TYPE_CODE}}{{NOTE}}{{CURRENCY}}{{LINE_COUNT}}{{RELATED_DOCUMENTS}}{{XSLT}}{{SIGNATURE}}{{SUPPLIER}}{{CUSTOMER}}{{PAYMENT_MEANS}}{{EXCHANGE_RATE}}{{TAX_TOTAL}}{{WITHHOLDING_TOTAL}}{{MONETARY_TOTAL}}{{LINES}}
</Invoice>`;
const despatchXmlTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2 UBLTR-DespatchAdvice-2.1.xsd">
{{EXTENSIONS}}{{COMMON}}{{TYPE_CODE}}{{NOTE}}{{LINE_COUNT}}{{RELATED_DOCUMENTS}}{{XSLT}}{{SIGNATURE}}{{SUPPLIER}}{{CUSTOMER}}{{SHIPMENT}}{{LINES}}
</DespatchAdvice>`;
const arixPrintXmlTemplate = (key, orientation, slots) => `<?xml version="1.0" encoding="UTF-8"?>
<ArixPrintForm key="${key}" paper="A4" orientation="${orientation}">
${slots.map((slot) => `{{${slot}}}`).join("\n")}
</ArixPrintForm>`;
const standardPrintXmlTemplates = {
  sale: arixPrintXmlTemplate("sale", "portrait", ["HEADER", "PARTIES", "SUMMARY", "PRODUCT_TABLE", "FOOTER"]),
  orderConfirmation: arixPrintXmlTemplate("orderConfirmation", "portrait", ["HEADER", "DOCUMENT_TITLE", "PARTIES", "PRODUCT_TABLE", "TERMS", "FOOTER"]),
  proforma: arixPrintXmlTemplate("proforma", "portrait", ["HEADER", "DOCUMENT_TITLE", "PARTIES", "PRODUCT_TABLE", "TERMS", "BANK", "FOOTER"]),
  commercial: arixPrintXmlTemplate("commercial", "portrait", ["HEADER", "DOCUMENT_TITLE", "PARTIES", "PRODUCT_TABLE", "TERMS", "BANK", "FOOTER"]),
  packingList: arixPrintXmlTemplate("packingList", "portrait", ["HEADER", "DOCUMENT_TITLE", "PARTIES", "PACKING_TABLE", "PACKING_SUMMARY", "FOOTER"]),
  purchase: arixPrintXmlTemplate("purchase", "portrait", ["HEADER", "PARTIES", "SUMMARY", "PRODUCT_TABLE", "PALLET_DETAILS", "FOOTER"]),
  movement: arixPrintXmlTemplate("movement", "portrait", ["HEADER", "PARTIES", "SUMMARY", "PRODUCT_TABLE", "PALLET_DETAILS", "FOOTER"]),
  customs: arixPrintXmlTemplate("customs", "landscape", ["HEADER", "DECLARATION", "CUSTOMS_TABLE", "FOOTER"]),
  inventory: arixPrintXmlTemplate("inventory", "portrait", ["HEADER", "PARTIES", "SUMMARY", "PRODUCT_TABLE", "FOOTER"]),
  writeOff: arixPrintXmlTemplate("writeOff", "portrait", ["HEADER", "PARTIES", "SUMMARY", "PRODUCT_TABLE", "FOOTER"]),
  receipt: arixPrintXmlTemplate("receipt", "portrait", ["HEADER", "RECEIPT_DETAILS", "SIGNATURES", "FOOTER"]),
  label: arixPrintXmlTemplate("label", "portrait", ["LABEL"]),
};
const validateStandardPrintTemplate = (template, key) => {
  const source = typeof template === "string" ? template.trim() : "";
  if (!source) return { ok: false, error: "Forma XML şablonu boş ola bilməz." };
  const validation = XMLValidator.validate(source);
  if (validation !== true) return { ok: false, error: `Forma XML şablonu düzgün deyil: ${validation.err.msg}.` };
  if (!/<ArixPrintForm(?:\s|>)/.test(source) || !source.includes("</ArixPrintForm>")) return { ok: false, error: "Forma XML kök elementi ArixPrintForm olmalıdır." };
  if (!new RegExp(`key=["']${key}["']`).test(source)) return { ok: false, error: `Forma XML key dəyəri ${key} olmalıdır.` };
  if (!/\{\{[A-Z_]+\}\}/.test(source)) return { ok: false, error: "Forma XML şablonunda ən azı bir çap bloku qalmalıdır." };
  return { ok: true, error: "" };
};

const defaultPrintSettings = {
  companyName: "AriX",
  brandSubtitle: "Sənəd sistemi",
  companyLogo: "",
  companyStamp: "",
  forms: {
    sale: { ...printForm("Satış sənədi", "Məhsul və ödəniş məlumatları"), xmlTemplate: standardPrintXmlTemplates.sale },
    orderConfirmation: { ...printForm("Sipariş onay formu", "Adi satışlar üçün müştəri təsdiq forması"), xmlTemplate: standardPrintXmlTemplates.orderConfirmation },
    proforma: { ...printForm("Proforma invoice", "İxracat satışları üçün ilkin invoice"), xmlTemplate: standardPrintXmlTemplates.proforma },
    commercial: { ...printForm("Commercial invoice", "Rəsmi ixrac invoice forması"), xmlTemplate: standardPrintXmlTemplates.commercial },
    packingList: { ...printForm("Packing list", "Palet, rulo və çəki siyahısı"), xmlTemplate: standardPrintXmlTemplates.packingList },
    purchase: { ...printForm("Alış sənədi", "Təchizatçıdan alınan məhsullar"), xmlTemplate: standardPrintXmlTemplates.purchase },
    movement: { ...printForm("Yerdəyişmə sənədi", "Mağazalar arasında stok hərəkəti"), xmlTemplate: standardPrintXmlTemplates.movement },
    customs: { ...printForm("Antrepo düşüm", "Bəyannamə üzrə kap, MT, çəki, palet və rulo forması"), xmlTemplate: standardPrintXmlTemplates.customs },
    inventory: { ...printForm("İnventar siyahısı", "Faktiki və sistem qalığının müqayisəsi"), xmlTemplate: standardPrintXmlTemplates.inventory },
    writeOff: { ...printForm("Silinmə aktı", "Stokdan silinən məhsullar"), xmlTemplate: standardPrintXmlTemplates.writeOff },
    receipt: { ...printForm("Ödəniş qəbzi", "Ödəniş və kontragent məlumatları"), xmlTemplate: standardPrintXmlTemplates.receipt },
    label: { ...printForm("Məhsul etiketi", "Məhsul və barkod məlumatları"), xmlTemplate: standardPrintXmlTemplates.label },
    eInvoice: { ...printForm("e-FATURA", "TEMELFATURA ssenarisi"), xmlTemplate: invoiceXmlTemplate },
    eArchive: { ...printForm("e-ARŞİV FATURA", "EARSIVFATURA ssenarisi"), xmlTemplate: invoiceXmlTemplate },
    eDespatch: { ...printForm("e-İRSALİYE", "TEMELIRSALIYE ssenarisi"), xmlTemplate: despatchXmlTemplate },
    exportInvoice: { ...printForm("e-FATURA", "IHRACAT ssenarisi"), xmlTemplate: invoiceXmlTemplate },
  },
};

const defaultCompanySettings = {
  stockMode: "simple",
  allowNegativeStock: false,
  reserveBeforeBondedExit: true,
  rollTracking: false,
  exchangeSettings: {
    source: "tcmb",
    documentRateDay: "previousDay",
    tcmbRateType: "banknote",
    baseCurrency: "TRY",
    symbols: ["USD", "EUR", "AZN"],
    manualRates: {
      USD: 0,
      EUR: 0,
      AZN: 0,
    },
  },
  eDocumentSettings: normalizeEDocumentSettings(),
  printSettings: defaultPrintSettings,
};

const defaultStores = [
  { id: 1, key: "depo", name: "ERSA DEPO", type: "Əsas mağaza", isBonded: false, status: "active", createdAt: "2024-09-22T00:00:00.000Z" },
  { id: 2, key: "antrepo", name: "ERSA ANTREPO", type: "Anbar", isBonded: true, status: "active", createdAt: "2024-11-05T00:00:00.000Z" },
];

const seedDb = {
  products: [
    { id: 1, name: "Soft Touch Premium Beyaz", code: "00233", sku: "ERSA 510", type: "product", unit: "mt", groupId: 1, categoryIds: [1], salePrice: 5.96, cost: 3.1, warehouses: { antrepo: 50, depo: 18 }, active: true },
    { id: 2, name: "Folyo Satin İnci", code: "11011", sku: "ERSA 011", type: "product", unit: "mt", groupId: 1, categoryIds: [1], salePrice: 4.26, cost: 2.65, warehouses: { antrepo: 30, depo: 0 }, active: true },
    { id: 3, name: "HG Antrasit", code: "11204", sku: "ERSA 204", type: "product", unit: "mt", groupId: 2, categoryIds: [2], salePrice: 2.8, cost: 1.7, warehouses: { antrepo: 104, depo: 1 }, active: true },
    { id: 4, name: "Satış danışmanlığı", code: "SRV-001", sku: "", type: "service", unit: "xidmət", groupId: null, categoryIds: [], salePrice: 120, cost: 0, warehouses: { antrepo: 0, depo: 0 }, active: true }
  ],
  productGroups: [
    { id: 1, name: "Parlaq rənglər", parentId: null },
    { id: 2, name: "Mat rənglər", parentId: null }
  ],
  categories: [
    { id: 1, name: "PVC folyo" },
    { id: 2, name: "HG panel" }
  ],
  stores: defaultStores,
  counterparties: [
    { id: 1, kind: "customer", name: "ABANOZ", phone: "", email: "", address: "İstanbul", balance: 0, createdAt: "2026-05-13", owner: "Arif Mahmud" },
    { id: 2, kind: "customer", name: "Global Design", phone: "", email: "", address: "Bursa", balance: 0, createdAt: "2026-05-17", owner: "Arif Mahmud" },
    { id: 3, kind: "supplier", name: "SHANGHAI XIAOU INDUSTRY CO., LTD", phone: "", email: "", address: "CHINA", balance: 0, createdAt: "2025-01-20", owner: "Arif Mahmud" },
    { id: 4, kind: "supplier", name: "ORCHARD DECORATIVE MATERIALS (CHINA) CO., LTD.", phone: "", email: "", address: "CHINA", balance: 0, createdAt: "2025-03-12", owner: "Arif Mahmud" }
  ],
  customerPrices: [],
  documents: [],
  trash: [],
  authUsers: structuredClone(defaultAuthUsers),
  authSessions: [],
  companySettings: defaultCompanySettings,
  stockContainers: [],
  stockPallets: [],
  stockRolls: [],
  stockReservations: [],
  stockMovements: [],
  landedCostAdjustments: [],
  onlineCollections: {
    posProviders: ["PARAM POS", "Banka POSları", "Tami", "PayNKolay", "AkÖde", "Iyzico", "Moka", "Sipay", "QNBPay"],
    posTerminals: ["130403", "130404"],
    posCommissions: [
      { bank: "Axess", rates: [3.29, 6.69, 8.5, 10.29, 12.02, 13.74, 15.45, 17.14, 19.03, 20.97, 22.86, 24.75, 0, 0, 0, 0, 0, 0] },
      { bank: "bonus", rates: [3.29, 6.5, 8.35, 10.2, 12.05, 13.9, 15.8, 17.64, 19.49, 21.39, 23.23, 25.08, 0, 0, 0, 0, 0, 0] },
      { bank: "QNB", rates: [3.29, 5.77, 7.66, 9.54, 11.42, 13.31, 15.25, 17.14, 19.03, 20.97, 22.86, 24.75, 0, 0, 0, 0, 0, 0] },
      { bank: "bankKart", rates: [3.29, 5.71, 7.56, 9.44, 11.3, 13.22, 15.09, 17.01, 18.83, 20.39, 22.41, 24.43, 0, 0, 0, 0, 0, 0] },
      { bank: "maximum", rates: [3.29, 5.77, 7.66, 9.54, 11.42, 13.31, 15.25, 17.14, 19.03, 20.97, 22.86, 24.75, 0, 0, 0, 0, 0, 0] },
      { bank: "Paraf", rates: [3.29, 5.79, 7.6, 9.37, 11.12, 12.83, 14.54, 16.17, 17.78, 19.39, 20.92, 22.41, 0, 0, 0, 0, 0, 0] },
      { bank: "KuveytTürk", rates: [3.29, 6.99, 8.78, 10.53, 12.25, 13.94, 15.63, 17.25, 18.83, 20.42, 21.94, 23.41, 0, 0, 0, 0, 0, 0] },
      { bank: "WORLD", rates: [3.29, 5.77, 7.66, 9.54, 11.42, 13.31, 15.25, 17.14, 19.03, 20.97, 22.86, 24.75, 0, 0, 0, 0, 0, 0] },
      { bank: "Troy / AMEX", rates: [3.29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
    ],
    collections: [
      { id: "THS-1029", customer: "ABANOZ", document: "Satış #2332", amount: 6123.04, status: "Ödəndi", channel: "Link", pos: "PaynKolay Akbank POS", created: "2026-05-21T09:12:00+03:00", paidAt: "2026-05-21T09:18:00+03:00" },
      { id: "THS-1028", customer: "Global Design", document: "Satış #2348", amount: 2377.08, status: "Açıldı", channel: "SMS", pos: "Param Garanti POS", created: "2026-05-20T17:40:00+03:00" }
    ],
    binRules: [
      { prefix: "454360", bank: "Akbank", brand: "Visa", cardType: "Kredit", country: "TR", preferredPos: "paynkolay-akbank" },
      { prefix: "552879", bank: "Garanti BBVA", brand: "Mastercard", cardType: "Kredit", country: "TR", preferredPos: "param-garanti" },
      { prefix: "416973", bank: "Kapital Bank", brand: "Visa", cardType: "Kredit", country: "AZ", preferredPos: "paynkolay-akbank" }
    ]
  }
};

seedDb.products = [];
seedDb.productGroups = [];
seedDb.categories = [];
seedDb.counterparties = [];
seedDb.documents = [];
seedDb.onlineCollections.collections = [];

function normalizeDb(db) {
  db.companySettings = {
    ...defaultCompanySettings,
    ...(db.companySettings ?? {}),
    printSettings: {
      ...defaultPrintSettings,
      ...(db.companySettings?.printSettings ?? {}),
      forms: Object.fromEntries(
        Object.entries(defaultPrintSettings.forms).map(([key, form]) => [
          key,
          {
            ...form,
            ...(db.companySettings?.printSettings?.forms?.[key] ?? {}),
            xmlTemplate: db.companySettings?.printSettings?.forms?.[key]?.xmlTemplate?.trim() || form.xmlTemplate,
          },
        ])
      ),
    },
    exchangeSettings: {
      ...defaultCompanySettings.exchangeSettings,
      ...(db.companySettings?.exchangeSettings ?? {}),
      manualRates: {
        ...defaultCompanySettings.exchangeSettings.manualRates,
        ...(db.companySettings?.exchangeSettings?.manualRates ?? {}),
      },
      symbols: Array.isArray(db.companySettings?.exchangeSettings?.symbols)
        ? db.companySettings.exchangeSettings.symbols
        : defaultCompanySettings.exchangeSettings.symbols,
    },
  };
  normalizeEDocumentStore(db);
  normalizeAccountingStore(db);
  db.stockContainers ??= [];
  db.stockPallets ??= [];
  db.stockRolls ??= [];
  db.stockReservations ??= [];
  db.stockMovements ??= [];
  db.landedCostAdjustments ??= [];
  db.customerPrices ??= [];
  db.trash = Array.isArray(db.trash) ? db.trash : [];
  db.authUsers = Array.isArray(db.authUsers) && db.authUsers.length
    ? db.authUsers.map((user) => ({ ...user, active: user.inviteCodeHash ? user.active === true : user.active !== false, companyId: user.companyId || "ersa-folyo", googleSubject: user.googleSubject || null }))
    : structuredClone(defaultAuthUsers);
  db.authSessions = (Array.isArray(db.authSessions) ? db.authSessions : [])
    .filter((session) => new Date(session.expiresAt).getTime() > Date.now());
  db.productPriceHistory ??= [];
  db.purchaseLots ??= [];
  db.depotLots ??= [];
  db.lotCostEvents ??= [];
  db.lotRecalculations ??= [];
  db.onlineCollections = {
    posProviders: [],
    posTerminals: [],
    posCommissions: [],
    collections: [],
    binRules: [],
    providerConnections: [],
    ...(db.onlineCollections ?? {}),
  };
  db.onlineCollections.providerConnections = normalizeProviderConnections(db.onlineCollections.providerConnections);
  db.externalPayments = Array.isArray(db.externalPayments) ? db.externalPayments : [];
  normalizeReconciliationStore(db);
  db.stores = Array.isArray(db.stores) && db.stores.length
    ? db.stores.map((store, index) => ({
        id: Number(store.id) || index + 1,
        key: String(store.key || `store-${Number(store.id) || index + 1}`),
        name: String(store.name || `Mağaza ${index + 1}`),
        type: String(store.type || "Mağaza"),
        isBonded: String(store.key ?? "").toLocaleLowerCase() === "antrepo"
          || (typeof store.isBonded === "boolean"
            ? store.isBonded
            : String(store.type ?? "").toLowerCase().includes("antrepo") || String(store.name ?? "").toLowerCase().includes("antrepo")),
        status: store.status === "inactive" ? "inactive" : "active",
        createdAt: store.createdAt || new Date().toISOString(),
      }))
    : structuredClone(defaultStores);
  db.products = (db.products ?? []).map((product) => ({
    ...product,
    storePrices: Object.fromEntries(
      db.stores.map((store) => [store.name, Number(product.storePrices?.[store.name] ?? product.salePrice ?? 0)])
    ),
  }));
  return db;
}

async function ensureDb() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(DB_PATH, "utf8");
    const db = normalizeDb(JSON.parse(raw));
    await writeDb(db);
    return db;
  } catch {
    const db = normalizeDb(structuredClone(seedDb));
    await writeDb(db);
    return db;
  }
}

async function readDb() {
  const raw = await readFile(DB_PATH, "utf8");
  return normalizeDb(JSON.parse(raw));
}

async function writeDb(db) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function applyCors(req, res) {
  const origin = String(req.headers.origin ?? "").trim();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("vary", "Origin");
  }
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(body);
}

function notFound(res) {
  send(res, 404, { error: "Not found" });
}

function parseBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > limit) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function publicAuthUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    picture: user.picture || "",
    companyId: user.companyId,
    passwordChangeRequired: Boolean(user.passwordChangeRequired),
  };
}

function publicEmployee(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    phone: user.phone || "",
    active: user.active !== false,
    invitePending: Boolean(user.inviteCodeHash) && !user.googleSubject,
    googleLinked: Boolean(user.googleSubject),
    lastLoginAt: user.lastLoginAt || null,
    passwordEnabled: Boolean(user.passwordHash),
    passwordChangeRequired: Boolean(user.passwordChangeRequired),
  };
}

function passwordDigest(password, salt = randomBytes(16).toString("hex")) {
  const digest = scryptSync(String(password), salt, 64).toString("hex");
  return { salt, digest };
}

function setPassword(user, password, requireChange = false) {
  const { salt, digest } = passwordDigest(password);
  user.passwordSalt = salt;
  user.passwordHash = digest;
  user.passwordChangeRequired = requireChange;
}

function validPassword(user, password) {
  if (!user?.passwordSalt || !user?.passwordHash || !password) return false;
  const actual = Buffer.from(passwordDigest(password, user.passwordSalt).digest, "hex");
  const expected = Buffer.from(user.passwordHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createTemporaryPassword() {
  return `Ax!${randomBytes(6).toString("base64url")}`;
}

function inviteCodeHash(code) {
  return createHash("sha256").update(String(code).trim().toUpperCase()).digest("hex");
}

function createInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function canManageEmployees(user) {
  const role = String(user?.role ?? "").toLocaleLowerCase("az");
  return role === "sahib" || role === "admin" || role === "administrator" || role === "rəhbər";
}

function sessionHash(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function cookieMap(req) {
  return Object.fromEntries(String(req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return [part, ""];
      return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    }));
}

function requestAuthUser(req, db) {
  const token = cookieMap(req)[SESSION_COOKIE];
  if (!token) return null;
  const hash = sessionHash(token);
  const session = db.authSessions.find((item) => item.tokenHash === hash && new Date(item.expiresAt).getTime() > Date.now());
  if (!session) return null;
  return db.authUsers.find((user) => String(user.id) === String(session.userId) && user.active !== false) ?? null;
}

function secureRequest(req) {
  return req.headers["x-forwarded-proto"] === "https" || Boolean(req.socket?.encrypted);
}

function setSessionCookie(req, res, token, maxAgeSeconds) {
  const secure = secureRequest(req) ? "; Secure" : "";
  res.setHeader("set-cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

function createSession(req, db, user) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.authSessions = db.authSessions.filter((session) => String(session.userId) !== String(user.id) && new Date(session.expiresAt).getTime() > Date.now());
  db.authSessions.push({
    id: randomUUID(),
    userId: user.id,
    tokenHash: sessionHash(token),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ip: String(req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "").split(",")[0].trim(),
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300),
  });
  return { token, expiresAt };
}

async function handleAuth(req, res, parts) {
  const action = parts[1] ?? "config";
  const db = await readDb();

  if (req.method === "GET" && action === "config") {
    return send(res, 200, {
      data: {
        enabled: Boolean(GOOGLE_CLIENT_ID),
        required: AUTH_REQUIRED,
        googleClientId: GOOGLE_CLIENT_ID,
        demoAvailable: !AUTH_REQUIRED,
      },
    });
  }

  if (req.method === "GET" && action === "session") {
    return send(res, 200, { data: publicAuthUser(requestAuthUser(req, db)), authenticationRequired: AUTH_REQUIRED });
  }

  if (req.method === "POST" && action === "password") {
    const body = await parseBody(req);
    const email = String(body.email ?? "").trim().toLocaleLowerCase("en-US");
    const password = String(body.password ?? "");
    const user = db.authUsers.find((item) => String(item.email ?? "").trim().toLocaleLowerCase("en-US") === email);
    if (!user) return send(res, 404, { error: "Bu e-poçtla hesab tapılmadı. Qeydiyyata keçin.", registrationRequired: true });
    if (!validPassword(user, password)) return send(res, 401, { error: "E-poçt və ya şifrə yanlışdır." });
    if (user.joinPending) return send(res, 202, { pending: true });
    if (user.active === false) return send(res, 403, { error: "Hesab aktiv deyil. Şirkət sahibinin təsdiqini gözləyin." });
    user.lastLoginAt = new Date().toISOString();
    const session = createSession(req, db, user);
    await writeDb(db);
    setSessionCookie(req, res, session.token, Math.floor(SESSION_TTL_MS / 1000));
    return send(res, 200, { data: publicAuthUser(user), expiresAt: session.expiresAt.toISOString() });
  }

  if (req.method === "POST" && action === "register") {
    const body = await parseBody(req);
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLocaleLowerCase("en-US");
    const password = String(body.password ?? "");
    const companyCode = String(body.companyCode ?? "").trim().toUpperCase();
    if (!name || !email.includes("@")) return send(res, 400, { error: "Ad soyad və düzgün e-poçt məcburidir." });
    if (password.length < 8) return send(res, 400, { error: "Şifrə ən az 8 simvol olmalıdır." });
    if (!COMPANY_JOIN_CODE || companyCode !== COMPANY_JOIN_CODE) return send(res, 403, { error: "Dəvət kodu yanlışdır." });
    if (db.authUsers.some((item) => String(item.email ?? "").trim().toLocaleLowerCase("en-US") === email)) {
      return send(res, 409, { error: "Bu e-poçtla hesab və ya müraciət artıq mövcuddur." });
    }
    const user = { id: randomUUID(), name, role: "Əməkdaş", email, active: false, joinPending: true, companyId: "ersa-folyo", googleSubject: null, createdAt: new Date().toISOString() };
    setPassword(user, password, false);
    db.authUsers.push(user);
    await writeDb(db);
    return send(res, 202, { pending: true });
  }

  if (req.method === "POST" && action === "change-password") {
    const user = requestAuthUser(req, db);
    if (!user) return send(res, 401, { error: "Giriş sessiyası tələb olunur." });
    const body = await parseBody(req);
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    if (!validPassword(user, currentPassword)) return send(res, 401, { error: "Cari şifrə yanlışdır." });
    if (newPassword.length < 8) return send(res, 400, { error: "Yeni şifrə ən az 8 simvol olmalıdır." });
    setPassword(user, newPassword, false);
    await writeDb(db);
    return send(res, 200, { data: publicAuthUser(user) });
  }

  if (action === "requests") {
    const owner = requestAuthUser(req, db);
    if (!owner || String(owner.role).toLocaleLowerCase("az") !== "sahib") return send(res, 403, { error: "Yalnız şirkət sahibi təsdiq edə bilər." });
    if (req.method === "GET") return send(res, 200, { data: db.authUsers.filter((u) => u.companyId === owner.companyId && u.joinPending).map(publicEmployee) });
    if (req.method === "POST") {
      const body = await parseBody(req);
      const target = db.authUsers.find((u) => u.id === body.id && u.companyId === owner.companyId && u.joinPending);
      if (!target) return send(res, 404, { error: "Gözləyən müraciət tapılmadı." });
      if (body.approve !== true && body.approve !== false) return send(res, 400, { error: "Qərar göstərilməyib." });
      if (body.approve) { target.active = true; target.joinPending = false; }
      else db.authUsers = db.authUsers.filter((u) => u !== target);
      await writeDb(db);
      return send(res, 200, { ok: true });
    }
  }

  if (req.method === "POST" && action === "google") {
    if (!googleAuthClient || !GOOGLE_CLIENT_ID) return send(res, 503, { error: "Google girişi hələ konfiqurasiya edilməyib." });
    const body = await parseBody(req);
    const credential = String(body.credential ?? "").trim();
    if (!credential) return send(res, 400, { error: "Google giriş məlumatı yoxdur." });

    let payload;
    try {
      const ticket = await googleAuthClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return send(res, 401, { error: "Google giriş məlumatı etibarsızdır və ya müddəti bitib." });
    }
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return send(res, 401, { error: "Google hesabının e-poçtu təsdiqlənməyib." });
    }

    const email = String(payload.email).trim().toLocaleLowerCase("en-US");
    let user = db.authUsers.find((item) => String(item.googleSubject ?? "") === String(payload.sub));
    if (!user) user = db.authUsers.find((item) => String(item.email ?? "").trim().toLocaleLowerCase("en-US") === email);

    const bootstrapEmails = String(process.env.ARIX_GOOGLE_BOOTSTRAP_EMAILS ?? "")
      .split(",")
      .map((item) => item.trim().toLocaleLowerCase("en-US"))
      .filter(Boolean);
    if (!user && bootstrapEmails.includes(email)) {
      user = {
        id: `google-${payload.sub}`,
        name: String(payload.name || email),
        role: "Sahib",
        email,
        active: true,
        companyId: "ersa-folyo",
        googleSubject: String(payload.sub),
      };
      db.authUsers.push(user);
    }
    if (!user && body.companyCode) {
      if (!COMPANY_JOIN_CODE || String(body.companyCode).trim().toUpperCase() !== COMPANY_JOIN_CODE) return send(res, 403, { error: "Şirkət kodu yanlışdır." });
      user = { id: randomUUID(), name: String(payload.name || email), role: "Əməkdaş", email, active: false, joinPending: true, companyId: "ersa-folyo", googleSubject: String(payload.sub), createdAt: new Date().toISOString() };
      db.authUsers.push(user);
      await writeDb(db);
      return send(res, 202, { pending: true });
    }
    if (user?.joinPending) return send(res, 202, { pending: true });
    const inviteCode = String(body.inviteCode ?? "").trim().toUpperCase();
    if (user && user.active === false && user.inviteCodeHash && inviteCode && inviteCodeHash(inviteCode) === user.inviteCodeHash) {
      user.active = true;
      user.inviteCodeHash = null;
      user.invitedAt = null;
    }
    if (user && user.active === false && user.inviteCodeHash) {
      await writeDb(db);
      return send(res, 403, { error: inviteCode ? "Dəvət kodu düzgün deyil." : "Bu hesab üçün əməkdaş dəvət kodunu daxil edin.", inviteRequired: true });
    }
    if (!user || user.active === false) {
      return send(res, 403, { error: "Hesabınız yoxdur. Şirkət kodunu daxil edərək qeydiyyat istəyin.", registrationRequired: true });
    }
    if (user.googleSubject && String(user.googleSubject) !== String(payload.sub)) {
      return send(res, 409, { error: "Bu əməkdaş kartı başqa Google hesabına bağlıdır." });
    }

    user.googleSubject = String(payload.sub);
    user.picture = String(payload.picture ?? user.picture ?? "");
    user.lastLoginAt = new Date().toISOString();
    const session = createSession(req, db, user);
    await writeDb(db);
    setSessionCookie(req, res, session.token, Math.floor(SESSION_TTL_MS / 1000));
    return send(res, 200, { data: publicAuthUser(user), expiresAt: session.expiresAt.toISOString() });
  }

  if (req.method === "POST" && action === "demo") {
    if (AUTH_REQUIRED) return send(res, 403, { error: "Demo giriş bu mühitdə bağlıdır." });
    const body = await parseBody(req);
    const requestedEmail = String(body.email ?? "").trim().toLocaleLowerCase("en-US");
    const user = db.authUsers.find((item) => item.active !== false && String(item.email).toLocaleLowerCase("en-US") === requestedEmail)
      ?? db.authUsers.find((item) => item.active !== false);
    if (!user) return send(res, 403, { error: "Aktiv demo əməkdaş tapılmadı." });
    user.lastLoginAt = new Date().toISOString();
    const session = createSession(req, db, user);
    await writeDb(db);
    setSessionCookie(req, res, session.token, Math.floor(SESSION_TTL_MS / 1000));
    return send(res, 200, { data: publicAuthUser(user), expiresAt: session.expiresAt.toISOString() });
  }

  if (req.method === "POST" && action === "logout") {
    const token = cookieMap(req)[SESSION_COOKIE];
    if (token) db.authSessions = db.authSessions.filter((session) => session.tokenHash !== sessionHash(token));
    await writeDb(db);
    setSessionCookie(req, res, "", 0);
    return send(res, 200, { ok: true });
  }

  return notFound(res);
}

async function handleEmployees(req, res, parts) {
  const db = await readDb();
  if (!canManageEmployees(req.authUser)) return send(res, 403, { error: "Əməkdaşları idarə etmək üçün rəhbər icazəsi lazımdır." });
  const id = decodeURIComponent(parts[1] ?? "");

  if (req.method === "GET" && id === "join-code") {
    if (String(req.authUser.role).toLocaleLowerCase("az") !== "sahib") return send(res, 403, { error: "Şirkət kodunu yalnız sahib görə bilər." });
    return send(res, 200, { data: { configured: Boolean(COMPANY_JOIN_CODE), code: COMPANY_JOIN_CODE } });
  }

  if (req.method === "GET" && !id) {
    const employees = db.authUsers
      .filter((user) => user.companyId === req.authUser.companyId)
      .map(publicEmployee);
    return send(res, 200, { data: employees });
  }

  if (req.method === "POST" && !id) {
    const body = await parseBody(req);
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLocaleLowerCase("en-US");
    const role = String(body.role ?? "Əməkdaş").trim() || "Əməkdaş";
    const phone = String(body.phone ?? "").trim();
    if (!name || !email || !email.includes("@")) return send(res, 400, { error: "Ad və düzgün e-poçt məcburidir." });
    if (db.authUsers.some((user) => String(user.email).trim().toLocaleLowerCase("en-US") === email)) {
      return send(res, 409, { error: "Bu e-poçtla əməkdaş artıq mövcuddur." });
    }
    const temporaryPassword = String(body.temporaryPassword ?? "").trim() || createTemporaryPassword();
    if (temporaryPassword.length < 8) return send(res, 400, { error: "İlkin şifrə ən az 8 simvol olmalıdır." });
    const employee = {
      id: randomUUID(), name, role, email, phone, active: true,
      companyId: req.authUser.companyId, googleSubject: null,
      inviteCodeHash: null,
      invitedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    };
    setPassword(employee, temporaryPassword, true);
    db.authUsers.push(employee);
    await writeDb(db);
    return send(res, 201, { data: publicEmployee(employee), inviteCode: "", temporaryPassword });
  }

  return notFound(res);
}

function nextNumericId(items) {
  return Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1;
}

function nextEntityNumericId(db, collectionKey, entityType) {
  const activeIds = (db[collectionKey] ?? []).map((item) => Number(item.id) || 0);
  const deletedIds = (db.trash ?? [])
    .filter((entry) => entry.entityType === entityType)
    .map((entry) => Number(entry.entityId) || 0);
  return Math.max(0, ...activeIds, ...deletedIds) + 1;
}

function trashLabel(entityType, item) {
  if (entityType === "product") return String(item.name || item.code || `Məhsul #${item.id}`);
  if (entityType === "counterparty") return String(item.name || `Kontragent #${item.id}`);
  if (entityType === "store") return String(item.name || `Mağaza #${item.id}`);
  if (entityType === "document") return `${sourceDocumentTitle(item)}${item.counterpartyName ? ` · ${item.counterpartyName}` : ""}`;
  return String(item.name || item.title || item.id || "Silinmiş qeyd");
}

function trashSubtype(entityType, item) {
  if (entityType === "counterparty") return item.kind === "supplier" ? "supplier" : "customer";
  if (entityType === "product") return String(item.type || "product");
  if (entityType === "document") return String(item.type || "document");
  if (entityType === "store") return item.isBonded ? "bonded" : "store";
  return "other";
}

function trashSummary(entityType, item) {
  if (entityType === "product") {
    const stock = Object.values(item.warehouses ?? {}).reduce((sum, value) => sum + numberValue(value), 0);
    return `${item.code || item.sku || "Kodsuz"} · ${stock.toFixed(2)} ${item.unit || "əd"}`;
  }
  if (entityType === "counterparty") return [item.code, item.phone, item.email].filter(Boolean).join(" · ") || item.kind || "Kontragent";
  if (entityType === "store") return `${item.type || "Mağaza"}${item.isBonded ? " · Antrepo" : ""}`;
  if (entityType === "document") {
    const amount = numberValue(item.total ?? item.amount);
    const date = item.documentDate ?? item.createdAt;
    return `${date ? String(date).slice(0, 10) : "Tarixsiz"} · ${amount.toFixed(2)}`;
  }
  return "";
}

function moveToTrash(db, entityType, item, related = {}, deletedBy = "Arif Mahmud") {
  const entry = {
    id: randomUUID(),
    entityType,
    entityId: String(item.id),
    subtype: trashSubtype(entityType, item),
    label: trashLabel(entityType, item),
    summary: trashSummary(entityType, item),
    deletedAt: new Date().toISOString(),
    deletedBy,
    original: structuredClone(item),
    related: structuredClone(related),
  };
  db.trash.unshift(entry);
  return entry;
}

function publicTrashEntry(entry) {
  return {
    id: entry.id,
    entityType: entry.entityType,
    entityId: entry.entityId,
    subtype: entry.subtype,
    label: entry.label,
    summary: entry.summary,
    deletedAt: entry.deletedAt,
    deletedBy: entry.deletedBy,
  };
}

function matchesSearch(item, query) {
  if (!query) return true;
  return JSON.stringify(item).toLowerCase().includes(query.toLowerCase());
}

function normalizePriceValue(value) {
  if (value == null || value === "") return null;
  return numberValue(value);
}

function appendProductPriceHistory(db, entry) {
  const changes = (entry.changes ?? [])
    .map((change) => ({
      ...change,
      oldValue: normalizePriceValue(change.oldValue),
      newValue: normalizePriceValue(change.newValue),
    }))
    .filter((change) => change.oldValue !== change.newValue);
  if (changes.length === 0) return;

  db.productPriceHistory.unshift({
    id: randomUUID(),
    productId: Number(entry.productId),
    action: entry.action ?? "Qiymət dəyişikliyi",
    detail: entry.detail ?? "Məhsul qiyməti yeniləndi",
    source: entry.source ?? "productCard",
    documentId: entry.documentId ?? null,
    at: entry.at ?? new Date().toISOString(),
    changes,
  });
  db.productPriceHistory = db.productPriceHistory.slice(0, 5000);
}

async function handleProductPriceHistory(req, res, url) {
  const db = await readDb();
  if (req.method !== "GET") return notFound(res);
  const productId = Number(url.searchParams.get("productId") ?? 0);
  const data = db.productPriceHistory
    .filter((entry) => !productId || Number(entry.productId) === productId)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return send(res, 200, { data });
}

async function handleProducts(req, res, url, parts) {
  const db = await readDb();
  const id = Number(parts[1]);

  if (req.method === "GET" && parts.length === 1) {
    const q = url.searchParams.get("q") ?? "";
    return send(res, 200, { data: db.products.filter((item) => matchesSearch(item, q)) });
  }

  if (req.method === "GET" && id) {
    const product = db.products.find((item) => item.id === id);
    return product ? send(res, 200, { data: product }) : notFound(res);
  }

  if (req.method === "POST" && parts.length === 1) {
    const body = await parseBody(req);
    const product = { id: nextEntityNumericId(db, "products", "product"), active: true, createdAt: new Date().toISOString(), ...body };
    db.products.push(product);
    await writeDb(db);
    return send(res, 201, { data: product });
  }

  if (req.method === "PATCH" && id) {
    const index = db.products.findIndex((item) => item.id === id);
    if (index < 0) return notFound(res);
    const body = await parseBody(req);
    const previous = db.products[index];
    const next = { ...previous, ...body, updatedAt: new Date().toISOString() };
    const changes = [];

    if (Object.prototype.hasOwnProperty.call(body, "salePrice")) {
      changes.push({ field: "Standart satış qiyməti", oldValue: previous.salePrice, newValue: next.salePrice });
    }
    if (Object.prototype.hasOwnProperty.call(body, "purchasePrice")) {
      changes.push({ field: "Son təchizatçı alış qiyməti", oldValue: previous.purchasePrice, newValue: next.purchasePrice });
    }
    if (Object.prototype.hasOwnProperty.call(body, "cost")) {
      changes.push({ field: "Orta maya dəyəri", oldValue: previous.cost, newValue: next.cost });
    }
    if (Object.prototype.hasOwnProperty.call(body, "storePrices")) {
      const scopes = new Set([
        ...Object.keys(previous.storePrices ?? {}),
        ...Object.keys(next.storePrices ?? {}),
      ]);
      for (const scope of scopes) {
        changes.push({
          field: "Mağaza satış qiyməti",
          scope,
          oldValue: previous.storePrices?.[scope] ?? previous.salePrice,
          newValue: next.storePrices?.[scope] ?? next.salePrice,
        });
      }
    }
    if (body.cardProfile && Object.prototype.hasOwnProperty.call(body.cardProfile, "wholesalePrice")) {
      changes.push({
        field: "Topdan satış qiyməti",
        oldValue: previous.cardProfile?.wholesalePrice,
        newValue: next.cardProfile?.wholesalePrice,
      });
    }

    appendProductPriceHistory(db, {
      productId: id,
      action: "Qiymət dəyişikliyi",
      detail: "Məhsul kartından yeniləndi",
      source: "productCard",
      changes,
    });
    db.products[index] = next;
    await writeDb(db);
    return send(res, 200, { data: db.products[index] });
  }

  if (req.method === "DELETE" && id) {
    const product = db.products.find((item) => Number(item.id) === id);
    if (!product) return notFound(res);
    const totalStock = Object.values(product.warehouses ?? {}).reduce((sum, value) => sum + numberValue(value), 0);
    if (Math.abs(totalStock) > 0.0001) {
      return send(res, 409, { error: "Qalığı olan məhsul silinə bilməz. Əvvəl stoku köçürün və ya silinmə sənədi yaradın." });
    }
    const related = {
      customerPrices: db.customerPrices.filter((item) => Number(item.productId) === id),
      priceHistory: db.productPriceHistory.filter((item) => Number(item.productId) === id),
    };
    const entry = moveToTrash(db, "product", product, related, req.authUser?.name);
    db.products = db.products.filter((item) => Number(item.id) !== id);
    db.customerPrices = db.customerPrices.filter((item) => Number(item.productId) !== id);
    db.productPriceHistory = db.productPriceHistory.filter((item) => Number(item.productId) !== id);
    await writeDb(db);
    return send(res, 200, { ok: true, data: publicTrashEntry(entry) });
  }

  return notFound(res);
}

async function handleSimpleCollection(req, res, key) {
  const db = await readDb();
  if (req.method === "GET") return send(res, 200, { data: db[key] });
  if (req.method === "POST") {
    const body = await parseBody(req);
    const item = { id: nextNumericId(db[key]), ...body };
    db[key].push(item);
    await writeDb(db);
    return send(res, 201, { data: item });
  }
  return notFound(res);
}

function nextStoreKey(stores, name) {
  const base = String(name || "store")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "store";
  let key = base;
  let suffix = 2;
  while (stores.some((store) => store.key === key)) key = `${base}-${suffix++}`;
  return key;
}

async function handleStores(req, res, parts) {
  const db = await readDb();
  const id = Number(parts[1]);

  if (req.method === "GET" && parts.length === 1) {
    return send(res, 200, { data: db.stores });
  }

  if (req.method === "POST" && parts.length === 1) {
    const body = await parseBody(req);
    const name = String(body.name ?? "").trim();
    if (!name) return send(res, 400, { error: "Mağaza adı tələb olunur." });
    if (db.stores.some((store) => store.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return send(res, 409, { error: "Bu adda mağaza artıq mövcuddur." });
    }
    const item = {
      id: nextEntityNumericId(db, "stores", "store"),
      key: nextStoreKey(db.stores, name),
      name,
      type: String(body.type || "Mağaza"),
      isBonded: body.isBonded === true,
      status: body.status === "inactive" ? "inactive" : "active",
      createdAt: new Date().toISOString(),
    };
    db.stores.push(item);
    db.products = db.products.map((product) => ({
      ...product,
      warehouses: { ...(product.warehouses ?? {}), [item.key]: 0 },
      storePrices: { ...(product.storePrices ?? {}), [item.name]: Number(product.salePrice ?? 0) },
    }));
    await writeDb(db);
    return send(res, 201, { data: item });
  }

  if (req.method === "PATCH" && id) {
    const index = db.stores.findIndex((store) => Number(store.id) === id);
    if (index < 0) return notFound(res);
    const body = await parseBody(req);
    const previous = db.stores[index];
    const name = String(body.name ?? previous.name).trim();
    if (!name) return send(res, 400, { error: "Mağaza adı tələb olunur." });
    if (db.stores.some((store) => Number(store.id) !== id && store.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return send(res, 409, { error: "Bu adda mağaza artıq mövcuddur." });
    }
    const item = {
      ...previous,
      name,
      type: String(body.type ?? previous.type),
      isBonded: typeof body.isBonded === "boolean" ? body.isBonded : previous.isBonded,
      status: body.status === "inactive" ? "inactive" : body.status === "active" ? "active" : previous.status,
      updatedAt: new Date().toISOString(),
    };
    db.stores[index] = item;
    if (previous.name !== item.name) {
      db.products = db.products.map((product) => {
        const prices = { ...(product.storePrices ?? {}) };
        if (Object.prototype.hasOwnProperty.call(prices, previous.name)) {
          prices[item.name] = prices[previous.name];
          delete prices[previous.name];
        }
        return { ...product, storePrices: prices };
      });
      db.customerPrices = db.customerPrices.map((entry) => entry.store === previous.name ? { ...entry, store: item.name } : entry);
      db.documents = db.documents.map((document) => ({
        ...document,
        account: document.account === previous.name ? item.name : document.account,
        fromAccount: document.fromAccount === previous.name ? item.name : document.fromAccount,
        toAccount: document.toAccount === previous.name ? item.name : document.toAccount,
      }));
    }
    await writeDb(db);
    return send(res, 200, { data: item });
  }

  if (req.method === "DELETE" && id) {
    const store = db.stores.find((item) => Number(item.id) === id);
    if (!store) return notFound(res);
    const hasStock = db.products.some((product) => Number(product.warehouses?.[store.key] ?? 0) !== 0);
    if (hasStock) return send(res, 409, { error: "Bu mağazada qalıq var. Silməzdən əvvəl stoku köçürün." });
    const entry = moveToTrash(db, "store", store, {}, req.authUser?.name);
    db.stores = db.stores.filter((item) => Number(item.id) !== id);
    await writeDb(db);
    return send(res, 200, { ok: true, data: publicTrashEntry(entry) });
  }

  return notFound(res);
}

async function handleCounterparties(req, res, url, parts) {
  const db = await readDb();
  const id = Number(parts[1]);
  const kind = url.searchParams.get("kind");

  if (req.method === "GET" && parts.length === 1) {
    const data = kind ? db.counterparties.filter((item) => item.kind === kind) : db.counterparties;
    return send(res, 200, { data });
  }

  if (req.method === "POST" && parts.length === 1) {
    const body = await parseBody(req);
    let normalized = normalizeCounterparty(body);
    const validationError = validateCounterparty(normalized);
    if (validationError) return send(res, 400, { error: validationError });
    const registryResult = lookupEDocumentRegistry(db.eDocuments.registry, normalized.taxId);
    if (normalized.kind === "customer" && registryResult.checked) {
      normalized = {
        ...normalized,
        eInvoiceRegistered: registryResult.registered,
        eInvoiceAliases: registryResult.entry?.aliases ?? [],
        eInvoiceTitle: registryResult.entry?.title ?? "",
        eInvoiceRegistryCheckedAt: db.eDocuments.registry.importedAt,
      };
    }
    const item = ensureCounterpartyAccounting(db, { id: nextEntityNumericId(db, "counterparties", "counterparty"), createdAt: new Date().toISOString(), ...normalized });
    db.counterparties.push(item);
    await writeDb(db);
    return send(res, 201, { data: item });
  }

  if (req.method === "PATCH" && id) {
    const index = db.counterparties.findIndex((item) => item.id === id);
    if (index < 0) return notFound(res);
    const body = await parseBody(req);
    let normalized = normalizeCounterparty(body, db.counterparties[index]);
    const validationError = validateCounterparty(normalized);
    if (validationError) return send(res, 400, { error: validationError });
    const registryResult = lookupEDocumentRegistry(db.eDocuments.registry, normalized.taxId);
    if (normalized.kind === "customer" && registryResult.checked) {
      normalized = {
        ...normalized,
        eInvoiceRegistered: registryResult.registered,
        eInvoiceAliases: registryResult.entry?.aliases ?? [],
        eInvoiceTitle: registryResult.entry?.title ?? "",
        eInvoiceRegistryCheckedAt: db.eDocuments.registry.importedAt,
      };
    }
    db.counterparties[index] = ensureCounterpartyAccounting(db, { ...normalized, updatedAt: new Date().toISOString() });
    await writeDb(db);
    return send(res, 200, { data: db.counterparties[index] });
  }

  if (req.method === "DELETE" && id) {
    const counterparty = db.counterparties.find((item) => Number(item.id) === id);
    if (!counterparty) return notFound(res);
    const related = {
      customerPrices: db.customerPrices.filter((item) => Number(item.customerId) === id),
      accountingAccounts: (db.accounting?.accounts ?? []).filter((item) => Number(item.counterpartyId) === id),
    };
    const entry = moveToTrash(db, "counterparty", counterparty, related, req.authUser?.name);
    db.counterparties = db.counterparties.filter((item) => Number(item.id) !== id);
    db.customerPrices = db.customerPrices.filter((item) => Number(item.customerId) !== id);
    for (const account of db.accounting?.accounts ?? []) {
      if (Number(account.counterpartyId) === id) account.active = false;
    }
    await writeDb(db);
    return send(res, 200, { ok: true, data: publicTrashEntry(entry) });
  }

  return notFound(res);
}

async function handleAccounting(req, res, url, parts) {
  const db = await readDb();
  const section = parts[1] ?? "overview";
  if (req.method === "GET" && section === "overview") return send(res, 200, { data: accountingOverview(db) });
  if (req.method === "GET" && section === "accounts") {
    const query = String(url.searchParams.get("q") ?? "").trim().toLocaleLowerCase("tr-TR");
    const data = query
      ? db.accounting.accounts.filter((account) => [account.code, account.name].some((value) => String(value).toLocaleLowerCase("tr-TR").includes(query)))
      : db.accounting.accounts;
    return send(res, 200, { data });
  }
  if (req.method === "GET" && section === "journals") return send(res, 200, { data: db.accounting.journals });
  if (req.method === "GET" && section === "trial-balance") return send(res, 200, { data: accountingTrialBalance(db) });
  if (req.method === "GET" && section === "periods") return send(res, 200, { data: db.accounting.periods });
  if (req.method === "GET" && section === "settings") return send(res, 200, { data: db.accounting.settings });
  if (req.method === "POST" && section === "accounts") {
    const body = await parseBody(req);
    const code = String(body.code ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!code || !name) return send(res, 400, { error: "Hesab kodu və adı tələb olunur." });
    if (db.accounting.accounts.some((account) => account.code === code)) return send(res, 409, { error: "Bu hesab kodu artıq mövcuddur." });
    const parentCode = String(body.parentCode ?? code.split(".").slice(0, -1).join(".") ?? "").trim() || null;
    const account = {
      id: randomUUID(), code, name, parentCode,
      type: ["asset", "liability", "equity", "income", "expense", "memo"].includes(body.type) ? body.type : "asset",
      level: Number(body.level) || code.split(".").length,
      system: false, active: body.active !== false, createdAt: new Date().toISOString(),
    };
    db.accounting.accounts.push(account);
    db.accounting.accounts.sort((a, b) => String(a.code).localeCompare(String(b.code), "tr"));
    await writeDb(db);
    return send(res, 201, { data: account });
  }
  if (req.method === "PATCH" && section === "settings") {
    const body = await parseBody(req);
    db.accounting.settings = {
      ...db.accounting.settings,
      ...body,
      accounts: { ...db.accounting.settings.accounts, ...(body.accounts ?? {}) },
    };
    await writeDb(db);
    return send(res, 200, { data: db.accounting.settings });
  }
  return notFound(res);
}

function productStorePrice(product, store) {
  return Number(product.storePrices?.[store] ?? product.salePrice ?? 0);
}

function resolvedCustomerPrice(db, product, customerId, store) {
  const rule = customerId
    ? db.customerPrices.find((item) =>
        Number(item.customerId) === Number(customerId)
        && Number(item.productId) === Number(product.id)
        && item.store === store
      )
    : null;
  const standardPrice = productStorePrice(product, store);
  return {
    id: rule?.id ?? null,
    customerId: customerId ? Number(customerId) : null,
    productId: product.id,
    productName: product.name,
    code: product.code ?? "",
    sku: product.sku ?? "",
    unit: product.unit ?? "əd",
    store,
    standardPrice,
    customerPrice: rule ? Number(rule.price) : null,
    effectivePrice: rule ? Number(rule.price) : standardPrice,
    source: rule ? "customer" : "store",
  };
}

async function handleCustomerPrices(req, res, url, parts) {
  const db = await readDb();
  const customerId = Number(url.searchParams.get("customerId") ?? 0);
  const productId = Number(url.searchParams.get("productId") ?? 0);
  const store = url.searchParams.get("store") ?? "ERSA DEPO";

  if (req.method === "GET") {
    const products = productId
      ? db.products.filter((item) => Number(item.id) === productId)
      : db.products;
    return send(res, 200, {
      data: products.map((product) => resolvedCustomerPrice(db, product, customerId, store)),
    });
  }

  if (req.method === "POST" && parts[1] === "bulk") {
    const body = await parseBody(req);
    const customer = db.counterparties.find((item) => Number(item.id) === Number(body.customerId) && item.kind === "customer");
    if (!customer) return send(res, 404, { error: "Müştəri tapılmadı." });
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length) return send(res, 400, { error: "İmport üçün qiymət sətri tapılmadı." });

    const saved = [];
    const errors = [];
    for (const [entryIndex, entry] of entries.entries()) {
      const nextProductId = Number(entry.productId);
      const nextStore = String(entry.store ?? "ERSA DEPO");
      const price = Number(entry.price);
      const product = db.products.find((item) => Number(item.id) === nextProductId);
      if (!product || !Number.isFinite(price) || price < 0) {
        errors.push({ row: entryIndex + 1, productId: nextProductId, error: !product ? "Məhsul tapılmadı." : "Qiymət düzgün deyil." });
        continue;
      }
      const index = db.customerPrices.findIndex((item) =>
        Number(item.customerId) === Number(body.customerId)
        && Number(item.productId) === nextProductId
        && item.store === nextStore
      );
      const rule = {
        id: index >= 0 ? db.customerPrices[index].id : randomUUID(),
        customerId: Number(body.customerId),
        productId: nextProductId,
        store: nextStore,
        price,
        updatedAt: new Date().toISOString(),
      };
      if (index >= 0) db.customerPrices[index] = rule;
      else db.customerPrices.push(rule);
      saved.push(resolvedCustomerPrice(db, product, Number(body.customerId), nextStore));
    }
    await writeDb(db);
    return send(res, errors.length ? 207 : 200, { data: saved, errors });
  }

  if (req.method === "POST") {
    const body = await parseBody(req);
    const nextCustomerId = Number(body.customerId);
    const nextProductId = Number(body.productId);
    const nextStore = String(body.store ?? "ERSA DEPO");
    const price = Number(body.price);
    if (!nextCustomerId || !nextProductId || !Number.isFinite(price) || price < 0) {
      return send(res, 400, { error: "Müştəri, məhsul və düzgün qiymət tələb olunur." });
    }
    const product = db.products.find((item) => Number(item.id) === nextProductId);
    if (!product) return send(res, 404, { error: "Məhsul tapılmadı." });
    const customer = db.counterparties.find((item) => Number(item.id) === nextCustomerId && item.kind === "customer");
    if (!customer) return send(res, 404, { error: "Müştəri tapılmadı." });
    const index = db.customerPrices.findIndex((item) =>
      Number(item.customerId) === nextCustomerId
      && Number(item.productId) === nextProductId
      && item.store === nextStore
    );
    const rule = {
      id: index >= 0 ? db.customerPrices[index].id : randomUUID(),
      customerId: nextCustomerId,
      productId: nextProductId,
      store: nextStore,
      price,
      updatedAt: new Date().toISOString(),
    };
    if (index >= 0) db.customerPrices[index] = rule;
    else db.customerPrices.push(rule);
    await writeDb(db);
    return send(res, index >= 0 ? 200 : 201, {
      data: resolvedCustomerPrice(db, product, nextCustomerId, nextStore),
    });
  }

  if (req.method === "DELETE") {
    if (!customerId || !productId) {
      return send(res, 400, { error: "Müştəri və məhsul tələb olunur." });
    }
    const before = db.customerPrices.length;
    db.customerPrices = db.customerPrices.filter((item) => !(
      Number(item.customerId) === customerId
      && Number(item.productId) === productId
      && item.store === store
    ));
    if (before === db.customerPrices.length) return notFound(res);
    await writeDb(db);
    const product = db.products.find((item) => Number(item.id) === productId);
    return send(res, 200, {
      data: product ? resolvedCustomerPrice(db, product, customerId, store) : null,
    });
  }

  return notFound(res);
}

async function handleOnlineCollections(req, res, parts) {
  const db = await readDb();
  const [, section] = parts;
  if (req.method === "GET" && !section) return send(res, 200, { data: db.onlineCollections });
  if (req.method === "GET" && section === "pos") {
    return send(res, 200, {
      data: {
        providers: db.onlineCollections.posProviders,
        terminals: db.onlineCollections.posTerminals,
        commissions: db.onlineCollections.posCommissions,
      },
    });
  }
  if (req.method === "GET" && section === "collections") return send(res, 200, { data: db.onlineCollections.collections });
  if (req.method === "GET" && section === "bin-rules") return send(res, 200, { data: db.onlineCollections.binRules });
  if (req.method === "GET" && section === "providers") {
    return send(res, 200, {
      data: {
        catalog: paymentProviderCatalog,
        capabilityLabels,
        connections: db.onlineCollections.providerConnections.map(publicProviderConnection),
      },
    });
  }
  if (req.method === "POST" && section === "providers" && parts[2] === "connections") {
    const body = await parseBody(req);
    const validation = validateProviderConnectionInput(body);
    if (!validation.ok) return send(res, 400, { error: validation.error });
    const now = new Date().toISOString();
    const connection = {
      id: randomUUID(),
      providerId: validation.value.provider.id,
      label: validation.value.label,
      environment: validation.value.environment,
      status: "configured",
      credentialCipher: await encryptProviderCredentials(validation.value.credentials),
      credentialKeys: validation.value.credentialKeys,
      webhookUrl: validation.value.webhookUrl,
      lastTestedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.onlineCollections.providerConnections.unshift(connection);
    await writeDb(db);
    return send(res, 201, { data: publicProviderConnection(connection) });
  }
  if (section === "providers" && parts[2] === "connections" && parts[3]) {
    const connectionIndex = db.onlineCollections.providerConnections.findIndex((item) => item.id === parts[3]);
    if (connectionIndex < 0) return notFound(res);
    if (req.method === "DELETE") {
      const [removed] = db.onlineCollections.providerConnections.splice(connectionIndex, 1);
      await writeDb(db);
      return send(res, 200, { data: publicProviderConnection(removed) });
    }
    if (req.method === "PATCH") {
      const body = await parseBody(req);
      const current = db.onlineCollections.providerConnections[connectionIndex];
      const next = {
        ...current,
        label: String(body.label ?? current.label).trim() || current.label,
        environment: body.environment === "live" ? "live" : body.environment === "test" ? "test" : current.environment,
        status: body.status === "disabled" ? "disabled" : body.status === "configured" ? "configured" : current.status,
        webhookUrl: body.webhookUrl === undefined ? current.webhookUrl : String(body.webhookUrl).trim(),
        updatedAt: new Date().toISOString(),
      };
      if (body.credentials && typeof body.credentials === "object") {
        const credentialEntries = Object.entries(body.credentials).filter(([, value]) => String(value ?? "").trim());
        if (credentialEntries.length) {
          const credentials = Object.fromEntries(credentialEntries.map(([key, value]) => [key, String(value).trim()]));
          next.credentialCipher = await encryptProviderCredentials(credentials);
          next.credentialKeys = Object.keys(credentials);
        }
      }
      db.onlineCollections.providerConnections[connectionIndex] = next;
      await writeDb(db);
      return send(res, 200, { data: publicProviderConnection(next) });
    }
  }
  return notFound(res);
}

async function handlePaymentIntegrations(req, res, parts) {
  const db = await readDb();
  const [, section, paymentId, action] = parts;
  if (req.method === "GET" && !section) {
    return send(res, 200, {
      data: {
        overview: externalPaymentOverview(db.externalPayments),
        payments: db.externalPayments,
        connections: db.onlineCollections.providerConnections.map(publicProviderConnection),
        reconciliation: reconciliationOverview(db),
      },
    });
  }
  if (req.method === "GET" && section === "accounts") {
    if (paymentId) {
      try {
        return send(res, 200, { data: financialAccountDetails(db, paymentId) });
      } catch (error) {
        return send(res, 404, { error: error instanceof Error ? error.message : "Şirket hesabı bulunamadı." });
      }
    }
    return send(res, 200, { data: db.financialAccounts });
  }
  if (req.method === "POST" && section === "accounts" && !paymentId) {
    try {
      const account = createFinancialAccount(db, await parseBody(req));
      await writeDb(db);
      return send(res, 201, { data: account });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Hesap oluşturulamadı." });
    }
  }
  if (req.method === "DELETE" && section === "accounts" && paymentId) {
    const account = db.financialAccounts.find((item) => item.id === paymentId);
    if (!account) return notFound(res);
    const inUse = db.paymentRoutingRules.some((rule) => rule.financialAccountId === account.id)
      || db.companyCards.some((card) => card.financialAccountId === account.id)
      || db.bankTransactions.some((transaction) => transaction.financialAccountId === account.id);
    if (inUse) return send(res, 409, { error: "Hareketi veya POS kuralı bulunan hesap silinemez; pasif duruma alınmalıdır." });
    db.financialAccounts = db.financialAccounts.filter((item) => item.id !== account.id);
    await writeDb(db);
    return send(res, 200, { data: account });
  }
  if (req.method === "POST" && section === "accounts" && paymentId && action === "cards") {
    try {
      const card = createCompanyCard(db, paymentId, await parseBody(req));
      await writeDb(db);
      return send(res, 201, { data: card });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Şirket kartı oluşturulamadı." });
    }
  }
  if (req.method === "POST" && section === "cards" && paymentId && action === "transactions") {
    try {
      const body = await parseBody(req);
      const result = importCardTransactions(db, paymentId, body.transactions);
      await writeDb(db);
      return send(res, 200, { data: result });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Kart hareketleri içe aktarılamadı." });
    }
  }
  if (req.method === "GET" && section === "routing-rules") {
    return send(res, 200, { data: db.paymentRoutingRules });
  }
  if (req.method === "POST" && section === "routing-rules") {
    try {
      const rule = createRoutingRule(db, await parseBody(req));
      await writeDb(db);
      return send(res, 201, { data: rule });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Yönlendirme kuralı oluşturulamadı." });
    }
  }
  if (req.method === "DELETE" && section === "routing-rules" && paymentId) {
    const rule = db.paymentRoutingRules.find((item) => item.id === paymentId);
    if (!rule) return notFound(res);
    db.paymentRoutingRules = db.paymentRoutingRules.filter((item) => item.id !== paymentId);
    await writeDb(db);
    return send(res, 200, { data: rule });
  }
  if (req.method === "GET" && section === "settlements") {
    return send(res, 200, { data: db.paymentSettlements, overview: reconciliationOverview(db) });
  }
  if (req.method === "PATCH" && section === "settlements" && paymentId && action === "match") {
    try {
      const settlement = manuallyMatchSettlement(db, paymentId, await parseBody(req));
      settlement.paymentIds
        .map((id) => db.externalPayments.find((payment) => payment.id === id)?.ledgerDocumentId)
        .map((id) => db.documents.find((document) => document.id === id))
        .filter(Boolean)
        .forEach((document) => upsertDocumentJournal(db, document));
      await writeDb(db);
      return send(res, 200, { data: settlement, overview: reconciliationOverview(db) });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Hakediş hesabı eşleştirilemedi." });
    }
  }
  if (req.method === "GET" && section === "bank-transactions") {
    return send(res, 200, { data: db.bankTransactions.map((transaction) => ({ ...transaction, suggestions: bankTransactionSuggestions(db, transaction) })), overview: reconciliationOverview(db) });
  }
  if (req.method === "GET" && section === "bank-imports") {
    return send(res, 200, { data: db.bankImportBatches });
  }
  if (req.method === "POST" && section === "bank-transactions" && paymentId === "import") {
    try {
      const body = await parseBody(req);
      const documentIds = new Set(db.documents.map((document) => document.id));
      const result = importBankTransactions(db, body);
      db.documents.filter((document) => !documentIds.has(document.id)).forEach((document) => upsertDocumentJournal(db, document));
      await writeDb(db);
      return send(res, 200, { data: result, overview: reconciliationOverview(db) });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Banka hareketleri içe aktarılamadı." });
    }
  }
  if (req.method === "PATCH" && section === "bank-transactions" && paymentId && action === "match") {
    try {
      const transaction = manuallyMatchBankTransaction(db, paymentId, await parseBody(req));
      const document = db.documents.find((item) => item.id === transaction.documentId);
      if (document) upsertDocumentJournal(db, document);
      await writeDb(db);
      return send(res, 200, { data: transaction, overview: reconciliationOverview(db) });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Banka hareketi eşleştirilemedi." });
    }
  }
  if (req.method === "GET" && section === "payments") {
    return send(res, 200, { data: db.externalPayments, overview: externalPaymentOverview(db.externalPayments) });
  }
  if (req.method === "POST" && section === "import") {
    const body = await parseBody(req);
    const provider = paymentProviderCatalog.find((item) => item.id === String(body.providerId ?? ""));
    if (!provider || provider.availability !== "active") return send(res, 400, { error: "Aktif sağlayıcı bulunamadı." });
    const connection = body.connectionId
      ? db.onlineCollections.providerConnections.find((item) => item.id === String(body.connectionId))
      : null;
    if (body.connectionId && !connection) return send(res, 400, { error: "Sağlayıcı bağlantısı bulunamadı." });
    try {
      const result = importExternalPayments(db, {
        providerId: provider.id,
        providerName: provider.name,
        connectionId: connection?.id ?? "",
        payments: body.payments,
      });
      [...result.created, ...result.updated]
        .map((payment) => db.documents.find((document) => document.id === payment.ledgerDocumentId))
        .filter(Boolean)
        .forEach((document) => upsertDocumentJournal(db, document));
      await writeDb(db);
      return send(res, 200, { data: result, overview: externalPaymentOverview(db.externalPayments) });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Ödemeler içe aktarılamadı." });
    }
  }
  if (req.method === "PATCH" && section === "payments" && paymentId && action === "match") {
    const body = await parseBody(req);
    try {
      const payment = manuallyMatchExternalPayment(db, paymentId, body.counterpartyId);
      const document = db.documents.find((item) => item.id === payment.ledgerDocumentId);
      if (document) upsertDocumentJournal(db, document);
      await writeDb(db);
      return send(res, 200, { data: payment, overview: externalPaymentOverview(db.externalPayments) });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Ödeme eşleştirilemedi." });
    }
  }
  return notFound(res);
}

async function handleCompanySettings(req, res) {
  const db = await readDb();
  if (req.method === "GET") return send(res, 200, {
    data: {
      ...db.companySettings,
      eDocumentSettings: publicEDocumentSettings(db.companySettings.eDocumentSettings),
    },
  });
  if (req.method === "PATCH") {
    const body = await parseBody(req);
    const nextStockMode = body.stockMode === "bondedRolls" ? "bondedRolls" : body.stockMode === "simple" ? "simple" : db.companySettings.stockMode;
    const nextPrintSettings = body.printSettings
      ? {
          ...db.companySettings.printSettings,
          ...body.printSettings,
          forms: {
            ...db.companySettings.printSettings.forms,
            ...(body.printSettings.forms ?? {}),
          },
        }
      : db.companySettings.printSettings;
    for (const [formKey, form] of Object.entries(nextPrintSettings.forms ?? {})) {
      const validation = ["eInvoice", "eArchive", "eDespatch", "exportInvoice"].includes(formKey)
        ? validateUblTrTemplate(form?.xmlTemplate, formKey)
        : validateStandardPrintTemplate(form?.xmlTemplate, formKey);
      if (!validation.ok) return send(res, 400, { error: validation.error, formKey });
    }
    const nextExchangeSettings = body.exchangeSettings
      ? {
          ...db.companySettings.exchangeSettings,
          ...body.exchangeSettings,
          manualRates: {
            ...(db.companySettings.exchangeSettings?.manualRates ?? {}),
            ...(body.exchangeSettings.manualRates ?? {}),
          },
          symbols: Array.isArray(body.exchangeSettings.symbols)
            ? body.exchangeSettings.symbols
            : db.companySettings.exchangeSettings?.symbols ?? defaultCompanySettings.exchangeSettings.symbols,
        }
      : db.companySettings.exchangeSettings;
    const nextEDocumentSettings = body.eDocumentSettings
      ? normalizeEDocumentSettings({
          ...db.companySettings.eDocumentSettings,
          ...body.eDocumentSettings,
          company: { ...db.companySettings.eDocumentSettings.company, ...(body.eDocumentSettings.company ?? {}) },
          aliases: { ...db.companySettings.eDocumentSettings.aliases, ...(body.eDocumentSettings.aliases ?? {}) },
          modules: { ...db.companySettings.eDocumentSettings.modules, ...(body.eDocumentSettings.modules ?? {}) },
          series: { ...db.companySettings.eDocumentSettings.series, ...(body.eDocumentSettings.series ?? {}) },
          automation: { ...db.companySettings.eDocumentSettings.automation, ...(body.eDocumentSettings.automation ?? {}) },
        })
      : db.companySettings.eDocumentSettings;
    db.companySettings = {
      ...db.companySettings,
      ...body,
      stockMode: nextStockMode,
      rollTracking: nextStockMode === "bondedRolls",
      printSettings: nextPrintSettings,
      exchangeSettings: nextExchangeSettings,
      eDocumentSettings: nextEDocumentSettings,
      updatedAt: new Date().toISOString(),
    };
    await writeDb(db);
    return send(res, 200, {
      data: {
        ...db.companySettings,
        eDocumentSettings: publicEDocumentSettings(db.companySettings.eDocumentSettings),
      },
    });
  }
  return notFound(res);
}

function eDocumentSourceWithCounterparty(db, sourceDocument) {
  const counterparty = db.counterparties.find((item) => Number(item.id) === Number(sourceDocument?.counterpartyId));
  const registryResult = lookupEDocumentRegistry(db.eDocuments.registry, sourceDocument?.counterpartyTaxNumber ?? counterparty?.taxId);
  return {
    ...sourceDocument,
    counterpartyTaxNumber: sourceDocument?.counterpartyTaxNumber ?? counterparty?.taxId ?? "",
    counterpartyTaxOffice: sourceDocument?.counterpartyTaxOffice ?? counterparty?.taxOffice ?? "",
    counterpartyAddress: sourceDocument?.counterpartyAddress ?? counterparty?.address ?? "",
    counterpartyCity: sourceDocument?.counterpartyCity ?? counterparty?.city ?? "",
    counterpartyDistrict: sourceDocument?.counterpartyDistrict ?? counterparty?.district ?? "",
    counterpartyPostalCode: sourceDocument?.counterpartyPostalCode ?? counterparty?.postalCode ?? "",
    counterpartyCountryCode: sourceDocument?.counterpartyCountryCode ?? counterparty?.countryCode ?? "",
    counterpartyCountryName: sourceDocument?.counterpartyCountryName ?? counterparty?.countryName ?? counterparty?.country ?? "",
    counterpartyRegistrationName: sourceDocument?.counterpartyRegistrationName ?? counterparty?.registrationName ?? counterparty?.name ?? "",
    counterpartyCompanyId: sourceDocument?.counterpartyCompanyId ?? counterparty?.companyId ?? counterparty?.taxId ?? "",
    counterpartyEmail: sourceDocument?.counterpartyEmail ?? counterparty?.email ?? "",
    counterpartyPhone: sourceDocument?.counterpartyPhone ?? counterparty?.phone ?? "",
    counterpartyFax: sourceDocument?.counterpartyFax ?? counterparty?.fax ?? "",
    counterpartyAlias: sourceDocument?.counterpartyAlias ?? registryResult.entry?.aliases?.[0] ?? counterparty?.eInvoiceAliases?.[0] ?? "",
    counterpartyEDocumentPreference: sourceDocument?.counterpartyEDocumentPreference ?? counterparty?.eDocumentPreference ?? "auto",
    counterpartyEInvoiceRegistered: registryResult.checked
      ? registryResult.registered
      : sourceDocument?.counterpartyEInvoiceRegistered ?? counterparty?.eInvoiceRegistered,
    eDocumentSupplier: { ...db.companySettings.eDocumentSettings.company },
  };
}

function nextEDocumentNumber(db, documentType, settings, now = new Date()) {
  const series = settings.series?.[documentType] ?? "BEL";
  const year = now.getFullYear();
  const prefix = `${series}${year}`;
  const sequence = (db.eDocuments.documents ?? []).filter((item) => String(item.number ?? "").startsWith(prefix)).length + 1;
  return `${prefix}${String(sequence).padStart(9, "0")}`;
}

async function handleEDocuments(req, res, url, parts) {
  const db = await readDb();
  const action = parts[1];
  if (req.method === "GET" && action === "codes") {
    return send(res, 200, { data: gibCodeCatalog() });
  }
  if (req.method === "GET" && !action) {
    const sourceDocumentId = url.searchParams.get("sourceDocumentId");
    const documents = sourceDocumentId
      ? db.eDocuments.documents.filter((item) => String(item.sourceDocumentId) === String(sourceDocumentId))
      : db.eDocuments.documents;
    return send(res, 200, {
      data: documents,
      overview: eDocumentOverview(db),
      registry: registryOverview(db.eDocuments.registry),
      settings: publicEDocumentSettings(db.companySettings.eDocumentSettings),
    });
  }
  if (req.method === "GET" && action === "registry") {
    const taxNumber = url.searchParams.get("taxNumber") ?? "";
    return send(res, 200, {
      data: {
        ...registryOverview(db.eDocuments.registry),
        result: taxNumber ? lookupEDocumentRegistry(db.eDocuments.registry, taxNumber) : null,
      },
    });
  }
  if (req.method === "POST" && action === "registry" && parts[2] === "import") {
    const body = await parseBody(req, 60_000_000);
    const sourceName = String(body.sourceName ?? "gib-user-list").trim().slice(0, 200);
    const format = String(body.format ?? sourceName.split(".").pop() ?? "xml").toLowerCase() === "csv" ? "csv" : "xml";
    let entries;
    try {
      entries = parseEDocumentRegistry(body.content, format);
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? `Reyestr faylı oxunmadı: ${error.message}` : "Reyestr faylı oxunmadı." });
    }
    if (entries.length === 0) return send(res, 400, { error: "Faylda etibarlı 10 və ya 11 rəqəmli VKN/TCKN qeydi tapılmadı." });
    db.eDocuments.registry = { entries, importedAt: new Date().toISOString(), sourceName, format };
    db.counterparties = applyRegistryToCounterparties(db.counterparties, db.eDocuments.registry);
    const registeredCards = db.counterparties.filter((item) => item.kind === "customer" && item.eInvoiceRegistered === true).length;
    db.eDocuments.events.unshift({
      id: randomUUID(),
      type: "registry-import",
      count: entries.length,
      sourceName,
      createdAt: db.eDocuments.registry.importedAt,
    });
    db.eDocuments.events = db.eDocuments.events.slice(0, 200);
    await writeDb(db);
    return send(res, 200, { data: { ...registryOverview(db.eDocuments.registry), registeredCards } });
  }
  if (req.method === "POST" && action === "sync") {
    if (db.companySettings.eDocumentSettings.provider !== "mock") {
      return send(res, 501, { error: "Canlı status sinxronizasiyası seçilən provayder adapteri aktiv olduqdan sonra işləyəcək." });
    }
    const syncedAt = new Date().toISOString();
    const updated = syncMockEDocumentStatuses(db, syncedAt);
    db.eDocuments.events.unshift({ id: randomUUID(), type: "status-sync", provider: "mock", updated, createdAt: syncedAt });
    db.eDocuments.events = db.eDocuments.events.slice(0, 200);
    await writeDb(db);
    return send(res, 200, { data: db.eDocuments.documents, overview: eDocumentOverview(db), lastSyncAt: syncedAt, updated, testMode: true });
  }
  if (req.method === "GET" && action === "context") {
    const sourceDocumentId = url.searchParams.get("sourceDocumentId");
    const sourceDocument = db.documents.find((item) => String(item.id) === String(sourceDocumentId));
    if (!sourceDocument) return send(res, 404, { error: "Satış sənədi tapılmadı." });
    const counterparty = db.counterparties.find((item) => Number(item.id) === Number(sourceDocument.counterpartyId)) ?? null;
    const enrichedSource = eDocumentSourceWithCounterparty(db, sourceDocument);
    let plan;
    try {
      plan = resolveEDocumentPlan(enrichedSource, counterparty ?? {}, db.companySettings.eDocumentSettings);
    } catch (error) {
      return send(res, 409, { error: error instanceof Error ? error.message : "e-Belge planı hazırlana bilmədi." });
    }
    const relatedDocuments = db.eDocuments.documents.filter((item) => String(item.sourceDocumentId) === String(sourceDocument.id));
    const readiness = Object.fromEntries(plan.availableTypes.map((documentType) => {
      const existing = relatedDocuments.find((item) => item.documentType === documentType);
      const candidate = existing ?? buildEDocumentDraft({ id: "preview", sourceDocument: enrichedSource, documentType });
      return [documentType, validateEDocumentForSending(candidate, db.companySettings.eDocumentSettings)];
    }));
    return send(res, 200, {
      data: {
        sourceDocument: enrichedSource,
        counterparty,
        plan,
        readiness,
        documents: relatedDocuments,
        sourceLock: resolveSourceDocumentLock(db.eDocuments.documents, sourceDocument.id),
        settings: publicEDocumentSettings(db.companySettings.eDocumentSettings),
      },
    });
  }
  if (req.method === "GET" && parts[2] === "artifact") {
    const document = db.eDocuments.documents.find((item) => String(item.id) === String(action));
    if (!document) return send(res, 404, { error: "e-Belge tapılmadı." });
    try {
      const linkedIds = new Set((document.relatedEDocumentIds ?? []).map((id) => String(id)));
      const relatedDocuments = db.eDocuments.documents
        .filter((item) => {
          if (item.id === document.id || String(item.sourceDocumentId) !== String(document.sourceDocumentId)) return false;
          if (["eInvoice", "eArchive", "exportInvoice"].includes(document.documentType)) {
            if (item.documentType !== "eDespatch" || item.status !== "completed") return false;
            return linkedIds.size === 0 || linkedIds.has(String(item.id));
          }
          return item.status === "completed" && ["eInvoice", "eArchive", "exportInvoice"].includes(item.documentType);
        })
        .map((item) => ({
          documentType: item.documentType,
          number: item.number ?? "",
          issueDate: item.snapshot?.documentDate ?? item.createdAt ?? "",
        }));
      const artifactDocument = { ...document, relatedDocuments };
      const model = buildGibDocumentModel(artifactDocument, db.companySettings.eDocumentSettings);
      const qrPayload = buildGibQrPayload(artifactDocument, db.companySettings.eDocumentSettings);
      const xmlTemplate = db.companySettings?.printSettings?.forms?.[document.documentType]?.xmlTemplate ?? "";
      const xml = buildUblTrXml(artifactDocument, db.companySettings.eDocumentSettings, xmlTemplate);
      const compliance = buildGibComplianceReport(artifactDocument, db.companySettings.eDocumentSettings);
      return send(res, 200, {
        data: {
          model,
          qrPayload,
          qrText: JSON.stringify(qrPayload),
          xml,
          compliance,
          draft: document.status !== "completed",
          companyLogo: db.companySettings?.printSettings?.companyLogo ?? "",
          companyStamp: db.companySettings?.printSettings?.companyStamp ?? "",
          printSettings: db.companySettings?.printSettings ?? defaultPrintSettings,
        },
      });
    } catch (error) {
      return send(res, 409, { error: error instanceof Error ? error.message : "GİB sənədi hazırlana bilmədi." });
    }
  }
  if (req.method === "POST" && action === "connection-test") {
    const result = testEDocumentConnection(db.companySettings.eDocumentSettings);
    db.eDocuments.events.unshift({
      id: randomUUID(),
      type: "connection-test",
      provider: db.companySettings.eDocumentSettings.provider,
      environment: db.companySettings.eDocumentSettings.environment,
      ok: result.ok,
      message: result.message,
      createdAt: new Date().toISOString(),
    });
    db.eDocuments.events = db.eDocuments.events.slice(0, 200);
    await writeDb(db);
    return send(res, result.ok ? 200 : 409, { data: result });
  }
  if (req.method === "POST" && action === "drafts") {
    const body = await parseBody(req);
    const sourceDocument = db.documents.find((item) => String(item.id) === String(body.sourceDocumentId));
    if (!sourceDocument) return send(res, 404, { error: "Mənbə sənəd tapılmadı." });
    if (body.documentType !== "eDespatch" && sourceDocument.type !== "sale") {
      return send(res, 409, { error: "Fatura qaralaması yalnız satış sənədindən yaradıla bilər." });
    }
    if (body.documentType === "eDespatch") {
      const activeInvoice = db.eDocuments.documents.find((item) =>
        String(item.sourceDocumentId) === String(sourceDocument.id)
        && ["processing", "completed"].includes(item.status)
        && ["eInvoice", "eArchive", "exportInvoice"].includes(item.documentType)
      );
      if (activeInvoice) {
        return send(res, 409, { error: `${activeInvoice.number || "Fatura"} yaradıldığı üçün bu satışdan yeni e-İrsaliye hazırlana bilməz.` });
      }
    }
    const existing = db.eDocuments.documents.find((item) =>
      item.status === "draft"
      && String(item.sourceDocumentId) === String(sourceDocument.id)
      && item.documentType === body.documentType
    );
    if (existing) return send(res, 200, { data: existing, reused: true });
    let draft;
    try {
      const counterparty = db.counterparties.find((item) => Number(item.id) === Number(sourceDocument.counterpartyId)) ?? null;
      const enrichedSource = eDocumentSourceWithCounterparty(db, sourceDocument);
      const plan = resolveEDocumentPlan(enrichedSource, counterparty ?? {}, db.companySettings.eDocumentSettings);
      if (!plan.availableTypes.includes(body.documentType)) {
        return send(res, 409, { error: `Alıcının mükəlləf reyestri nəticəsinə görə ${body.documentType === "eInvoice" ? "e-Fatura" : body.documentType === "eArchive" ? "e-Arşiv" : "bu sənəd növü"} yaradıla bilməz.` });
      }
      if (body.documentType === "eInvoice" || body.documentType === "eArchive") {
        const conflictingInvoice = db.eDocuments.documents.find((item) =>
          item.status !== "failed"
          && String(item.sourceDocumentId) === String(sourceDocument.id)
          && (item.documentType === "eInvoice" || item.documentType === "eArchive")
          && item.documentType !== body.documentType
        );
        if (conflictingInvoice) {
          return send(res, 409, { error: `Bu satış üçün artıq ${conflictingInvoice.documentType === "eInvoice" ? "e-Fatura" : "e-Arşiv"} yaradılıb; e-Fatura və e-Arşiv birlikdə yaradıla bilməz.` });
        }
      }
      const requestedRelatedIds = new Set(Array.isArray(body.relatedEDocumentIds) ? body.relatedEDocumentIds.map((id) => String(id)) : []);
      const completedDespatches = db.eDocuments.documents.filter((item) =>
        String(item.sourceDocumentId) === String(sourceDocument.id)
        && item.documentType === "eDespatch"
        && item.status === "completed"
        && (requestedRelatedIds.size === 0 || requestedRelatedIds.has(String(item.id)))
      );
      const relatedEDocumentIds = ["eInvoice", "eArchive", "exportInvoice"].includes(body.documentType)
        ? completedDespatches.map((item) => item.id)
        : [];
      draft = buildEDocumentDraft({ id: randomUUID(), sourceDocument: enrichedSource, documentType: body.documentType, relatedEDocumentIds });
      draft.number = nextEDocumentNumber(db, body.documentType, db.companySettings.eDocumentSettings);
      draft.uuid = randomUUID();
      draft.gib = {
        profileId: body.documentType === "eArchive" ? "EARSIVFATURA" : body.documentType === "eDespatch" ? "TEMELIRSALIYE" : body.documentType === "exportInvoice" ? "IHRACAT" : "TEMELFATURA",
        typeCode: body.documentType === "eDespatch"
          ? "SEVK"
          : body.documentType === "exportInvoice"
            ? "ISTISNA"
            : resolveDocumentInvoiceType(enrichedSource),
      };
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Qaralama yaradıla bilmədi." });
    }
    db.eDocuments.documents.unshift(draft);
    db.eDocuments.events.unshift({
      id: randomUUID(),
      type: "draft-created",
      eDocumentId: draft.id,
      sourceDocumentId: sourceDocument.id,
      createdAt: draft.createdAt,
    });
    await writeDb(db);
    return send(res, 201, { data: draft, reused: false });
  }
  const documentId = parts[1];
  const operation = parts[2];
  if (req.method === "PATCH" && documentId && !operation) {
    const document = db.eDocuments.documents.find((item) => String(item.id) === String(documentId));
    if (!document) return send(res, 404, { error: "e-Belge tapılmadı." });
    if (document.status === "completed") return send(res, 409, { error: "Göndərilmiş e-Belge dəyişdirilə bilməz." });
    if (document.documentType === "eDespatch") {
      const completedInvoice = db.eDocuments.documents.find((item) =>
        String(item.sourceDocumentId) === String(document.sourceDocumentId)
        && ["processing", "completed"].includes(item.status)
        && ["eInvoice", "eArchive", "exportInvoice"].includes(item.documentType)
      );
      if (completedInvoice) return send(res, 409, { error: `Bu e-İrsaliye ${completedInvoice.number || "fatura"} ilə faturalanıb və artıq dəyişdirilə bilməz.` });
    }
    const body = await parseBody(req);
    const allowedProfiles = document.documentType === "eInvoice"
      ? new Set(["TEMELFATURA", "TICARIFATURA"])
      : document.documentType === "eDespatch"
        ? new Set(["TEMELIRSALIYE"])
        : document.documentType === "eArchive"
          ? new Set(["EARSIVFATURA"])
          : new Set(["IHRACAT"]);
    if (body.profileId && allowedProfiles.has(body.profileId)) {
      document.gib = { ...(document.gib ?? {}), profileId: body.profileId };
    }
    if (body.shipment && document.documentType === "eDespatch") {
      document.snapshot.shipment = {
        ...(document.snapshot.shipment ?? {}),
        actualDespatchDate: String(body.shipment.actualDespatchDate ?? "").slice(0, 10),
        actualDespatchTime: String(body.shipment.actualDespatchTime ?? "").slice(0, 8),
        carrierTaxNumber: String(body.shipment.carrierTaxNumber ?? "").replace(/\D/g, "").slice(0, 11),
        carrierName: String(body.shipment.carrierName ?? "").trim(),
        plate: String(body.shipment.plate ?? "").toUpperCase().replace(/\s/g, "").slice(0, 16),
        driverFirstName: String(body.shipment.driverFirstName ?? "").trim().slice(0, 80),
        driverLastName: String(body.shipment.driverLastName ?? "").trim().slice(0, 80),
        driverNationalId: String(body.shipment.driverNationalId ?? "").replace(/\D/g, "").slice(0, 11),
        deliveryAddress: String(body.shipment.deliveryAddress ?? "").trim().slice(0, 500),
      };
    }
    if (body.exportDetails && document.documentType === "exportInvoice") {
      const gtips = Object.fromEntries(Object.entries(body.exportDetails.gtips ?? {}).map(([key, value]) => [
        String(key).replace(/\D/g, "").slice(0, 4),
        String(value ?? "").replace(/\D/g, "").slice(0, 12),
      ]));
      document.snapshot.exportDetails = {
        ...(document.snapshot.exportDetails ?? {}),
        incoterm: String(body.exportDetails.incoterm ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3),
        transportModeCode: String(body.exportDetails.transportModeCode ?? "").replace(/\D/g, "").slice(0, 2),
        packageTypeCode: String(body.exportDetails.packageTypeCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3),
        packageId: String(body.exportDetails.packageId ?? "").trim().slice(0, 50),
        packageQuantity: Math.max(0, Number(body.exportDetails.packageQuantity ?? 0)),
        exchangeRate: Math.max(0, Number(body.exportDetails.exchangeRate ?? 0)),
        deliveryAddress: String(body.exportDetails.deliveryAddress ?? "").trim().slice(0, 500),
        countryCode: String(body.exportDetails.countryCode ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2),
        countryName: String(body.exportDetails.countryName ?? "").trim().slice(0, 100),
        city: String(body.exportDetails.city ?? "").trim().slice(0, 100),
        gtips,
      };
      document.snapshot.counterparty = {
        ...(document.snapshot.counterparty ?? {}),
        registrationName: String(body.exportDetails.registrationName ?? document.snapshot.counterparty?.name ?? "").trim().slice(0, 200),
        companyId: String(body.exportDetails.companyId ?? "").trim().slice(0, 80),
        address: String(body.exportDetails.buyerAddress ?? document.snapshot.counterparty?.address ?? "").trim().slice(0, 500),
        city: String(body.exportDetails.city ?? "").trim().slice(0, 100),
        countryCode: String(body.exportDetails.countryCode ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2),
        countryName: String(body.exportDetails.countryName ?? "").trim().slice(0, 100),
      };
      document.gib = { ...(document.gib ?? {}), profileId: "IHRACAT", typeCode: "ISTISNA" };
    }
    document.number ||= nextEDocumentNumber(db, document.documentType, db.companySettings.eDocumentSettings);
    document.uuid ||= randomUUID();
    document.updatedAt = new Date().toISOString();
    await writeDb(db);
    return send(res, 200, { data: document });
  }
  if (req.method === "POST" && documentId && operation === "send") {
    const document = db.eDocuments.documents.find((item) => String(item.id) === String(documentId));
    if (!document) return send(res, 404, { error: "e-Belge tapılmadı." });
    if (document.status === "completed") return send(res, 200, { data: document, reused: true });
    const validation = validateEDocumentForSending(document, db.companySettings.eDocumentSettings);
    if (!validation.ready) return send(res, 409, { error: validation.issues.join(" "), validation });
    if (db.companySettings.eDocumentSettings.provider !== "mock") {
      return send(res, 501, { error: "Seçilmiş provayderin canlı göndəriş adapteri hələ aktiv deyil. Test göndərişi üçün AriX Test seçin." });
    }
    const sentAt = new Date().toISOString();
    document.snapshot.supplier = resolveEDocumentSupplier(document, db.companySettings.eDocumentSettings);
    document.number ||= nextEDocumentNumber(db, document.documentType, db.companySettings.eDocumentSettings, new Date(sentAt));
    document.uuid ||= randomUUID();
    queueMockEDocument(document, sentAt);
    db.eDocuments.events.unshift({
      id: randomUUID(),
      type: "document-sent",
      eDocumentId: document.id,
      provider: "mock",
      status: document.status,
      createdAt: sentAt,
    });
    await writeDb(db);
    return send(res, 200, { data: document, testMode: true });
  }
  return notFound(res);
}

const exchangeSourceLabels = {
  tcmb: "TCMB",
  cbar: "AMB / CBAR",
  frankfurter: "Frankfurter / ECB",
  manual: "Manual",
};

const exchangeOffsetDays = {
  instant: 0,
  previousDay: 1,
  twoDaysBefore: 2,
};

function addDays(date, diff) {
  const next = new Date(date);
  next.setDate(next.getDate() + diff);
  return next;
}

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function tcmbDatePath(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}/${day}${month}${year}.xml`;
}

function cbarDatePath(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${day}.${month}.${year}`;
}

function xmlText(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function parseTcmRates(xml, symbols, rateType = "banknote") {
  const rates = {};
  for (const symbol of symbols) {
    const block = xml.match(new RegExp(`<Currency[^>]+CurrencyCode="${symbol}"[^>]*>([\\s\\S]*?)</Currency>`, "i"))?.[1] ?? "";
    if (!block) continue;
    const selling = rateType === "forex"
      ? numberValue(xmlText(block, "ForexSelling") || xmlText(block, "BanknoteSelling") || xmlText(block, "ForexBuying"))
      : numberValue(xmlText(block, "BanknoteSelling") || xmlText(block, "ForexSelling") || xmlText(block, "ForexBuying"));
    if (selling > 0) rates[symbol] = selling;
  }
  return rates;
}

function parseCbarRates(xml, symbols) {
  const rates = {};
  for (const symbol of symbols) {
    if (symbol === "AZN") {
      rates[symbol] = 1;
      continue;
    }
    const block = xml.match(new RegExp(`<Valute[^>]+Code="${symbol}"[^>]*>([\\s\\S]*?)</Valute>`, "i"))?.[1] ?? "";
    if (!block) continue;
    const nominal = numberValue(xmlText(block, "Nominal")) || 1;
    const value = numberValue(xmlText(block, "Value"));
    if (value > 0) rates[symbol] = value / nominal;
  }
  return rates;
}

function uniqueSymbols(symbols) {
  return [...new Set(symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean))];
}

function normalizeRatesToBase(data, targetBaseCurrency, requestedSymbols) {
  const sourceBaseCurrency = String(data.baseCurrency || "").toUpperCase();
  const baseCurrency = String(targetBaseCurrency || sourceBaseCurrency).toUpperCase();
  const sourceRates = {
    ...data.rates,
    [sourceBaseCurrency]: 1,
  };
  const baseToSource = sourceRates[baseCurrency];
  if (!baseToSource || !Number.isFinite(baseToSource) || baseToSource <= 0) {
    return {
      ...data,
      sourceBaseCurrency,
      baseCurrency: sourceBaseCurrency,
    };
  }
  const rates = {};
  for (const symbol of requestedSymbols) {
    const normalizedSymbol = String(symbol).trim().toUpperCase();
    if (!normalizedSymbol) continue;
    if (normalizedSymbol === baseCurrency) {
      rates[normalizedSymbol] = 1;
      continue;
    }
    const symbolToSource = sourceRates[normalizedSymbol];
    if (symbolToSource && Number.isFinite(symbolToSource) && symbolToSource > 0) {
      rates[normalizedSymbol] = symbolToSource / baseToSource;
    }
  }
  return {
    ...data,
    sourceBaseCurrency,
    baseCurrency,
    rates,
  };
}

function isTcmPublishedForToday(date) {
  const turkeyTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const [hour, minute] = turkeyTime.split(":").map(Number);
  return hour > 15 || (hour === 15 && minute >= 30);
}

function tcmbStartOffset(dayMode, offset) {
  if (dayMode === "instant") return isTcmPublishedForToday(new Date()) ? 0 : 1;
  return offset;
}

async function fetchTcmRates(symbols, offset, rateType = "banknote") {
  const today = new Date();
  for (let extra = 0; extra < 8; extra += 1) {
    const date = addDays(today, -(offset + extra));
    const url = offset + extra === 0
      ? "https://www.tcmb.gov.tr/kurlar/today.xml"
      : `https://www.tcmb.gov.tr/kurlar/${tcmbDatePath(date)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const xml = await response.text();
      const rates = parseTcmRates(xml, symbols, rateType);
      if (Object.keys(rates).length > 0) {
        return {
          source: "tcmb",
          sourceLabel: exchangeSourceLabels.tcmb,
          rateType,
          date: ymd(date),
          requestedOffset: offset,
          fallbackDays: extra,
          baseCurrency: "TRY",
          rates,
          url,
        };
      }
    } catch {
      // Try the previous available TCMB day.
    }
  }
  throw new Error("TCMB məzənnələri alınmadı.");
}

async function fetchCbarRates(symbols, offset) {
  const today = new Date();
  for (let extra = 0; extra < 8; extra += 1) {
    const date = addDays(today, -(offset + extra));
    const url = `https://cbar.az/currencies/${cbarDatePath(date)}.xml`;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const xml = await response.text();
      const rates = parseCbarRates(xml, symbols);
      if (Object.keys(rates).length > 0) {
        return {
          source: "cbar",
          sourceLabel: exchangeSourceLabels.cbar,
          date: ymd(date),
          requestedOffset: offset,
          fallbackDays: extra,
          baseCurrency: "AZN",
          rates,
          url,
        };
      }
    } catch {
      // Try the previous available AMB/CBAR day.
    }
  }
  throw new Error("AMB məzənnələri alınmadı.");
}

async function fetchFrankfurterRates(symbols, offset) {
  const date = ymd(addDays(new Date(), -offset));
  const wanted = symbols.filter((symbol) => symbol !== "TRY");
  const url = `https://api.frankfurter.app/${date}?from=TRY&to=${encodeURIComponent(wanted.join(","))}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Alternativ məzənnə mənbəyi cavab vermədi.");
  const payload = await response.json();
  const rates = {};
  for (const symbol of wanted) {
    const inverse = Number(payload.rates?.[symbol]);
    if (Number.isFinite(inverse) && inverse > 0) rates[symbol] = 1 / inverse;
  }
  return {
    source: "frankfurter",
    sourceLabel: exchangeSourceLabels.frankfurter,
    date: payload.date ?? date,
    requestedOffset: offset,
    fallbackDays: payload.date === date ? 0 : null,
    baseCurrency: "TRY",
    rates,
    url,
  };
}

async function handleExchangeRates(req, res, url) {
  if (req.method !== "GET") return notFound(res);
  const db = await readDb();
  const settings = {
    ...defaultCompanySettings.exchangeSettings,
    ...(db.companySettings?.exchangeSettings ?? {}),
  };
  const source = url.searchParams.get("source") || settings.source || "tcmb";
  const dayMode = url.searchParams.get("dayMode") || settings.documentRateDay || "previousDay";
  const tcmbRateType = url.searchParams.get("tcmbRateType") || settings.tcmbRateType || "banknote";
  const baseCurrency = String(url.searchParams.get("baseCurrency") || settings.baseCurrency || "TRY").toUpperCase();
  const offset = Number(url.searchParams.get("offset") ?? exchangeOffsetDays[dayMode] ?? 1);
  const symbols = uniqueSymbols(url.searchParams.get("symbols")?.split(",") ?? settings.symbols ?? ["USD", "EUR", "AZN"]);
  const fetchSymbols = uniqueSymbols([...symbols, baseCurrency]);
  try {
    if (source === "manual") {
      const manualRates = { ...(settings.manualRates ?? {}) };
      for (const symbol of symbols) {
        if (symbol === baseCurrency) manualRates[symbol] = 1;
      }
      return send(res, 200, {
        data: {
          source: "manual",
          sourceLabel: exchangeSourceLabels.manual,
          date: ymd(new Date()),
          requestedOffset: offset,
          fallbackDays: 0,
          sourceBaseCurrency: baseCurrency,
          baseCurrency,
          rates: manualRates,
          url: "",
        },
      });
    }
    const effectiveOffset = source === "tcmb" ? tcmbStartOffset(dayMode, offset) : offset;
    const data = source === "frankfurter"
      ? await fetchFrankfurterRates(fetchSymbols, effectiveOffset)
      : source === "cbar"
        ? await fetchCbarRates(fetchSymbols, effectiveOffset)
        : await fetchTcmRates(fetchSymbols, effectiveOffset, tcmbRateType);
    return send(res, 200, { data: normalizeRatesToBase(data, baseCurrency, symbols) });
  } catch (error) {
    return send(res, 502, { error: error instanceof Error ? error.message : "Məzənnə alınmadı." });
  }
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function collectDocumentContainers(db) {
  const containers = [];
  for (const document of db.documents ?? []) {
    if (document.type !== "purchase") continue;
    const bondedContainers = Array.isArray(document.bondedStock?.containers) ? document.bondedStock.containers : [];
    for (const container of bondedContainers) {
      const number = String(container.number ?? "").trim();
      if (!number) continue;
      let qty = 0;
      let netKg = 0;
      let grossKg = 0;
      let rollCount = 0;
      const productIds = new Set();
      const productQuantities = {};
      for (const pallet of container.pallets ?? []) {
        for (const roll of pallet.rolls ?? []) {
          const rollQty = numberValue(roll.qty);
          qty += rollQty;
          netKg += numberValue(roll.netKg);
          grossKg += numberValue(roll.grossKg);
          rollCount += 1;
          if (roll.productId) {
            const productId = Number(roll.productId);
            productIds.add(productId);
            productQuantities[productId] = numberValue(productQuantities[productId]) + rollQty;
          }
        }
      }
      containers.push({
        key: `${document.id}:${number}`,
        number,
        documentId: document.id,
        documentDate: document.documentDate ?? document.createdAt,
        invoice: container.invoice ?? "",
        customsStatus: container.customsStatus ?? "",
        palletCount: Array.isArray(container.pallets) ? container.pallets.length : 0,
        rollCount,
        qty,
        netKg,
        grossKg,
        productIds: Array.from(productIds),
        productQuantities,
      });
    }
  }
  return containers;
}

function palletAvailability(pallet, options = {}) {
  const excludeRollIds = options.excludeRollIds ?? new Set();
  const currentMovementDocumentId = String(options.currentMovementDocumentId ?? "");
  const palletRolls = Array.isArray(pallet.rolls) ? pallet.rolls : [];
  const rolls = palletRolls.filter((roll) => {
    if (excludeRollIds.has(String(roll.id))) return false;
    const status = String(roll.status ?? "");
    const belongsToCurrentDocument = currentMovementDocumentId
      && String(roll.movementDocumentId ?? "") === currentMovementDocumentId;
    return belongsToCurrentDocument || !["reserved", "moved", "exported"].includes(status);
  });
  const productIds = new Set(rolls.map((roll) => Number(roll.productId)).filter(Boolean));
  const hasExcludedRolls = palletRolls.some((roll) => excludeRollIds.has(String(roll.id)));
  const palletStatus = hasExcludedRolls
    ? "open"
    : pallet.palletStatus === "open" || pallet.palletStatus === "closed"
    ? pallet.palletStatus
    : productIds.size > 1
      ? "open"
      : "closed";
  return { rolls, productIds, palletStatus, mixed: productIds.size > 1 };
}

function collectAvailableStockUnits(db, options = {}) {
  const containers = [];
  for (const document of db.documents ?? []) {
    if (document.type !== "purchase" || document.posted === false) continue;
    for (const container of document.bondedStock?.containers ?? []) {
      if (container.customsStatus && container.customsStatus !== "bonded") continue;
      const pallets = [];
      for (const pallet of container.pallets ?? []) {
        const availability = palletAvailability(pallet, options);
        if (availability.rolls.length === 0) continue;
        pallets.push({
          id: pallet.id,
          number: pallet.number,
          status: availability.palletStatus,
          mixed: availability.mixed,
          rolls: availability.rolls.map((roll) => ({
            ...roll,
            qtyValue: numberValue(roll.qty),
            productId: Number(roll.productId),
          })),
        });
      }
      if (pallets.length === 0) continue;
      containers.push({
        key: `${document.id}:${container.number}`,
        documentId: document.id,
        declaration: container.invoice || container.number || "",
        number: container.number || "",
        pallets,
      });
    }
  }
  return containers;
}

function groupMovementSelection(containers, selectedRolls) {
  const grouped = [];
  for (const container of containers) {
    const selectedInContainer = selectedRolls.filter((item) => item.containerKey === container.key);
    if (selectedInContainer.length === 0) continue;
    const pallets = container.pallets
      .map((pallet) => {
        const rolls = selectedInContainer.filter((item) => item.palletId === pallet.id);
        if (rolls.length === 0) return null;
        return {
          id: pallet.id,
          number: pallet.number,
          status: pallet.status,
          mixed: pallet.mixed,
          fullPallet: rolls.length === pallet.rolls.length,
          selectedQty: rolls.reduce((sum, roll) => sum + roll.qty, 0),
          rollCount: rolls.length,
          rolls,
        };
      })
      .filter(Boolean);
    grouped.push({
      key: container.key,
      documentId: container.documentId,
      declaration: container.declaration,
      number: container.number,
      selectedQty: pallets.reduce((sum, pallet) => sum + pallet.selectedQty, 0),
      palletCount: pallets.length,
      rollCount: pallets.reduce((sum, pallet) => sum + pallet.rollCount, 0),
      pallets,
    });
  }
  return grouped;
}

function movementSelectionWithFullPallets(db, document) {
  const selection = document.movementSelection;
  if (!selection?.containers?.length) return selection;
  return {
    ...selection,
    containers: selection.containers.map((selectedContainer) => {
      const sourceDocument = db.documents.find((item) => String(item.id) === String(selectedContainer.documentId));
      const sourceContainer = sourceDocument?.bondedStock?.containers?.find((item) =>
        String(item.id) === String(selectedContainer.key)
        || String(item.number) === String(selectedContainer.number)
        || `${sourceDocument?.id}:${item.number}` === String(selectedContainer.key)
      );
      return {
        ...selectedContainer,
        pallets: (selectedContainer.pallets ?? []).map((selectedPallet) => {
          const sourcePallet = sourceContainer?.pallets?.find((item) => String(item.id) === String(selectedPallet.id));
          const selectedIds = new Set((selectedPallet.rolls ?? []).map((roll) => String(roll.rollId ?? roll.id)));
          const sourceRolls = sourcePallet?.rolls ?? [];
          return {
            ...selectedPallet,
            fullPallet: sourceRolls.length > 0 && sourceRolls.every((roll) => selectedIds.has(String(roll.id))),
          };
        }),
      };
    }),
  };
}

function buildMovementAlternative(containers, lines, strategyId, allowPartial = false) {
  const selectedRolls = [];
  let openRolls = 0;
  let mixedRolls = 0;
  let closedPallets = 0;

  for (const line of lines) {
    const lineMode = line.mode === "fullPallet" ? "fullPallet" : line.mode === "rollCount" ? "rollCount" : "meters";
    let remaining = Math.max(0, numberValue(line.qty));
    if (remaining <= 0) continue;

    if (lineMode === "fullPallet") {
      const requestedPallets = Math.max(1, Math.floor(remaining));
      let selectedPallets = 0;
      const pallets = containers
        .flatMap((container) => container.pallets.map((pallet) => ({ container, pallet })))
        .filter(({ pallet }) => pallet.status === "closed" && pallet.rolls.length > 0 && pallet.rolls.every((roll) => roll.productId === line.productId))
        .sort((a, b) => a.container.key.localeCompare(b.container.key));
      for (const { container, pallet } of pallets) {
        if (selectedPallets >= requestedPallets) break;
        selectedPallets += 1;
        closedPallets += 1;
        for (const roll of pallet.rolls) {
          selectedRolls.push({
            sourceDocumentId: container.documentId,
            containerKey: container.key,
            containerNumber: container.number,
            declaration: container.declaration,
            palletId: pallet.id,
            palletNumber: pallet.number,
            palletStatus: pallet.status,
            rollId: roll.id,
            rollNo: roll.rollNo,
            productId: roll.productId,
            qty: roll.qtyValue,
            width: roll.width,
            thickness: roll.thickness,
            netKg: roll.netKg,
            grossKg: roll.grossKg,
          });
        }
      }
      if (selectedPallets < requestedPallets && !allowPartial) return null;
    } else {
      const rolls = containers
        .flatMap((container) => container.pallets.flatMap((pallet) => pallet.rolls
          .filter((roll) => roll.productId === line.productId)
          .map((roll) => ({ container, pallet, roll }))))
        .sort((a, b) => {
          const aPriority = (a.pallet.status === "open" ? 0 : 20) + (a.pallet.mixed ? 0 : 5);
          const bPriority = (b.pallet.status === "open" ? 0 : 20) + (b.pallet.mixed ? 0 : 5);
          return aPriority - bPriority || Math.abs(a.roll.qtyValue - remaining) - Math.abs(b.roll.qtyValue - remaining);
        });
      for (const { container, pallet, roll } of rolls) {
        if (remaining <= 0) break;
        if (pallet.mixed) mixedRolls += 1;
        else if (pallet.status === "open") openRolls += 1;
        selectedRolls.push({
          sourceDocumentId: container.documentId,
          containerKey: container.key,
          containerNumber: container.number,
          declaration: container.declaration,
          palletId: pallet.id,
          palletNumber: pallet.number,
          palletStatus: pallet.status,
          rollId: roll.id,
          rollNo: roll.rollNo,
          productId: roll.productId,
          qty: roll.qtyValue,
          width: roll.width,
          thickness: roll.thickness,
          netKg: roll.netKg,
          grossKg: roll.grossKg,
        });
        remaining -= lineMode === "rollCount" ? 1 : roll.qtyValue;
      }
    }
    if (lineMode !== "fullPallet" && remaining > 0 && !allowPartial) return null;
  }

  if (selectedRolls.length === 0) return null;

  const lineResults = lines.map((line) => {
    const lineRolls = selectedRolls.filter((roll) => roll.productId === line.productId);
    const selectedQty = lineRolls.reduce((sum, roll) => sum + roll.qty, 0);
    const selectedRollCount = lineRolls.length;
    const selectedPalletCount = new Set(lineRolls.map((roll) => `${roll.containerKey}:${roll.palletId}`)).size;
    const requested = numberValue(line.qty);
    const complete = line.mode === "fullPallet"
      ? selectedPalletCount >= Math.max(1, Math.floor(requested))
      : line.mode === "rollCount"
        ? selectedRollCount >= Math.max(1, Math.floor(requested))
        : selectedQty >= requested;
    return {
      ...line,
      selectedQty,
      selectedRollCount,
      selectedPalletCount,
      shortageQty: line.mode === "meters" ? Math.max(0, requested - selectedQty) : 0,
      shortageRollCount: line.mode === "rollCount" ? Math.max(0, Math.floor(requested) - selectedRollCount) : 0,
      shortagePalletCount: line.mode === "fullPallet" ? Math.max(0, Math.floor(requested) - selectedPalletCount) : 0,
      complete,
    };
  });
  const incomplete = lineResults.some((line) => !line.complete);
  if (incomplete && !allowPartial) return null;

  const requestedQty = lines
    .filter((line) => line.mode === "meters")
    .reduce((sum, line) => sum + numberValue(line.qty), 0);
  const selectedQty = selectedRolls.reduce((sum, roll) => sum + roll.qty, 0);
  const overage = lines.reduce((sum, line) => {
    if (line.mode !== "meters") return sum;
    const lineSelected = selectedRolls.filter((roll) => roll.productId === line.productId).reduce((total, roll) => total + roll.qty, 0);
    return sum + Math.max(0, lineSelected - numberValue(line.qty));
  }, 0);
  const grouped = groupMovementSelection(containers, selectedRolls);
  const declarationCount = new Set(grouped.map((container) => container.declaration || container.number)).size;
  const palletCount = new Set(selectedRolls.map((roll) => `${roll.containerKey}:${roll.palletId}`)).size;
  const fulfillmentRatio = lineResults.reduce((sum, line) => {
    const requested = Math.max(1, numberValue(line.qty));
    const fulfilled = line.mode === "fullPallet"
      ? line.selectedPalletCount
      : line.mode === "rollCount"
        ? line.selectedRollCount
        : Math.min(requested, line.selectedQty);
    return sum + Math.min(1, fulfilled / requested);
  }, 0) / Math.max(1, lineResults.length);
  const score = (incomplete ? 1000000000 + Math.round((1 - fulfillmentRatio) * 1000000000) : 0)
    + declarationCount * 100000
    + grouped.length * 10000
    + overage * 10
    + palletCount;
  const oneDeclaration = declarationCount === 1;
  const declarationLabel = oneDeclaration ? grouped[0]?.declaration || grouped[0]?.number : "";
  const modeSet = new Set(lines.map((line) => line.mode));
  const mode = modeSet.size > 1 ? "mixed" : lines[0]?.mode ?? "meters";
  const reasons = [];
  const rollSources = [];
  if (openRolls > 0) rollSources.push(`${openRolls} rulo açıq paletlərdən`);
  if (mixedRolls > 0) rollSources.push(`${mixedRolls} rulo qarışıq paletlərdən`);
  if (rollSources.length > 0) reasons.push(`${rollSources.join(", ")} seçildi.`);
  if (closedPallets > 0) reasons.push(`${closedPallets} bağlı palet seçildi; açıq paletlərə toxunulmadı.`);
  if (incomplete) reasons.push("Tələb tam qarşılanmır; mövcud stokun ən yaxın miqdarı göstərilir.");
  return {
    id: strategyId,
    mode,
    title: oneDeclaration ? `Eyni bəyannamə · ${declarationLabel}` : `${declarationCount} bəyannaməli seçim`,
    reason: reasons.join(" "),
    declarationCount,
    containerCount: grouped.length,
    palletCount,
    rollCount: selectedRolls.length,
    requestedQty,
    selectedQty,
    overage,
    incomplete,
    shortageCount: lineResults.filter((line) => !line.complete).length,
    score,
    containers: grouped,
    lines: lineResults,
  };
}

function createMovementSuggestions(db, body) {
  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((line) => ({
      productId: Number(line.productId),
      qty: numberValue(line.qty),
      name: String(line.name ?? ""),
      mode: line.mode === "fullPallet" ? "fullPallet" : line.mode === "rollCount" ? "rollCount" : "meters",
    }))
    .filter((line) => line.productId && line.qty > 0);
  if (lines.length === 0) return [];
  const excludeRollIds = new Set((Array.isArray(body.excludeRollIds) ? body.excludeRollIds : []).map(String));
  const allContainers = collectAvailableStockUnits(db, {
    excludeRollIds,
    currentMovementDocumentId: body.currentMovementDocumentId,
  });
  const alternatives = [];

  for (const container of allContainers) {
    const alternative = buildMovementAlternative([container], lines, `single:${container.key}`);
    if (alternative) alternatives.push(alternative);
  }
  const allAlternative = buildMovementAlternative(allContainers, lines, "combined");
  if (allAlternative) alternatives.push(allAlternative);

  if (alternatives.length === 0) {
    for (const container of allContainers) {
      const alternative = buildMovementAlternative([container], lines, `partial:single:${container.key}`, true);
      if (alternative) alternatives.push(alternative);
    }
    const allPartialAlternative = buildMovementAlternative(allContainers, lines, "partial:combined", true);
    if (allPartialAlternative) alternatives.push(allPartialAlternative);
  }

  const unique = new Map();
  alternatives
    .sort((a, b) => a.score - b.score)
    .forEach((alternative) => {
      const fingerprint = alternative.containers
        .flatMap((container) => container.pallets.flatMap((pallet) => pallet.rolls.map((roll) => roll.rollId)))
        .sort()
        .join(":");
      if (!unique.has(fingerprint)) unique.set(fingerprint, alternative);
    });
  return Array.from(unique.values()).slice(0, 3).map((alternative, index) => ({
    ...alternative,
    recommended: index === 0,
  }));
}

function markMovementSelection(db, document) {
  const selectedContainers = document.movementSelection?.containers;
  const isTrackedExit = document.type === "movement" || (document.type === "sale" && (document.saleMode === "export" || document.exportMode));
  if (!isTrackedExit || !Array.isArray(selectedContainers)) return;
  const status = document.posted === false ? "reserved" : document.type === "sale" ? "exported" : "moved";
  for (const selectedContainer of selectedContainers) {
    const source = db.documents.find((item) => String(item.id) === String(selectedContainer.documentId));
    const container = source?.bondedStock?.containers?.find((item) => String(item.number) === String(selectedContainer.number));
    if (!container) continue;
    for (const selectedPallet of selectedContainer.pallets ?? []) {
      const pallet = container.pallets?.find((item) => String(item.id) === String(selectedPallet.id));
      if (!pallet) continue;
      for (const selectedRoll of selectedPallet.rolls ?? []) {
        const roll = pallet.rolls?.find((item) => String(item.id) === String(selectedRoll.rollId));
        if (!roll) continue;
        roll.status = status;
        roll.movementDocumentId = document.id;
        roll.movedTo = document.type === "sale" ? document.counterpartyName ?? "İxracat" : document.toAccount ?? "";
      }
      if (pallet.rolls?.every((roll) => ["moved", "exported"].includes(String(roll.status ?? "")))) pallet.palletStatus = document.type === "sale" ? "exported" : "moved";
      else if (pallet.rolls?.some((roll) => ["reserved", "moved", "exported"].includes(String(roll.status ?? "")))) pallet.palletStatus = "open";
    }
  }
}

function refreshPalletMovementStatus(pallet) {
  const rolls = Array.isArray(pallet.rolls) ? pallet.rolls : [];
  if (rolls.length > 0 && rolls.every((roll) => ["moved", "exported"].includes(String(roll.status ?? "")))) {
    pallet.palletStatus = "moved";
    return;
  }
  if (rolls.some((roll) => ["reserved", "moved", "exported"].includes(String(roll.status ?? "")))) {
    pallet.palletStatus = "open";
    return;
  }
  const productIds = new Set(rolls.map((roll) => Number(roll.productId)).filter(Boolean));
  pallet.palletStatus = productIds.size > 1 ? "open" : "closed";
}

function releaseMovementSelection(db, document) {
  const isTrackedExit = document?.type === "movement" || (document?.type === "sale" && (document.saleMode === "export" || document.exportMode));
  if (!isTrackedExit) return;
  for (const selectedContainer of document.movementSelection?.containers ?? []) {
    const source = db.documents.find((item) => String(item.id) === String(selectedContainer.documentId));
    const container = source?.bondedStock?.containers?.find((item) => String(item.number) === String(selectedContainer.number));
    if (!container) continue;
    for (const selectedPallet of selectedContainer.pallets ?? []) {
      const pallet = container.pallets?.find((item) => String(item.id) === String(selectedPallet.id));
      if (!pallet) continue;
      for (const selectedRoll of selectedPallet.rolls ?? []) {
        const roll = pallet.rolls?.find((item) => String(item.id) === String(selectedRoll.rollId));
        if (!roll || String(roll.movementDocumentId ?? "") !== String(document.id)) continue;
        roll.status = "available";
        delete roll.movementDocumentId;
        delete roll.movedTo;
      }
      refreshPalletMovementStatus(pallet);
    }
  }
}

function reverseMovementStock(db, document) {
  if (document?.posted === false) return;
  if (document?.type === "sale" && (document.saleMode === "export" || document.exportMode)) {
    const account = normalizeWarehouse(db, document.account);
    for (const line of document.lines ?? []) {
      const product = db.products.find((item) => Number(item.id) === Number(line.productId));
      const qty = numberValue(line.qty);
      if (!product || product.type === "service" || qty <= 0) continue;
      changeStock(product, account, qty);
    }
    return;
  }
  if (document?.type !== "movement") return;
  const from = normalizeWarehouse(db, document.fromAccount ?? document.account);
  const to = normalizeWarehouse(db, document.toAccount ?? "ERSA ANTREPO");
  for (const line of document.lines ?? []) {
    const product = db.products.find((item) => Number(item.id) === Number(line.productId));
    const qty = numberValue(line.qty);
    if (!product || product.type === "service" || qty <= 0) continue;
    changeStock(product, to, -qty);
    changeStock(product, from, qty);
  }
}

function reverseRegularSaleStock(db, document) {
  if (document?.posted === false || document?.type !== "sale" || document.saleMode === "export" || document.exportMode) return;
  const account = normalizeWarehouse(db, document.account);
  for (const line of document.lines ?? []) {
    const product = db.products.find((item) => Number(item.id) === Number(line.productId));
    const qty = numberValue(line.qty);
    if (!product || product.type === "service" || qty <= 0) continue;
    changeStock(product, account, qty);
  }
  for (const measurement of document.rollMeasurements ?? []) {
    const product = db.products.find((item) => Number(item.id) === Number(measurement.productId));
    if (!product || product.type === "service") continue;
    changeStock(product, account, -numberValue(measurement.variance));
  }
}

function hasMovementSelection(document) {
  return Array.isArray(document?.movementSelection?.containers) && document.movementSelection.containers.length > 0;
}

function validateMovementSelection(db, document) {
  const isTrackedExit = document?.type === "movement" || (document?.type === "sale" && (document.saleMode === "export" || document.exportMode));
  if (!isTrackedExit || !hasMovementSelection(document)) return { ok: true };
  for (const selectedContainer of document.movementSelection.containers) {
    const source = db.documents.find((item) => String(item.id) === String(selectedContainer.documentId));
    const container = source?.bondedStock?.containers?.find((item) =>
      String(item.number) === String(selectedContainer.number)
      || String(item.id) === String(selectedContainer.key)
      || `${source?.id}:${item.number}` === String(selectedContainer.key)
    );
    if (!container) return { ok: false, error: `Seçilmiş konteyner tapılmadı: ${selectedContainer.number ?? selectedContainer.key}` };
    for (const selectedPallet of selectedContainer.pallets ?? []) {
      const pallet = container.pallets?.find((item) => String(item.id) === String(selectedPallet.id));
      if (!pallet) return { ok: false, error: `Seçilmiş palet tapılmadı: ${selectedPallet.number ?? selectedPallet.id}` };
      for (const selectedRoll of selectedPallet.rolls ?? []) {
        const roll = pallet.rolls?.find((item) => String(item.id) === String(selectedRoll.rollId ?? selectedRoll.id));
        if (!roll) return { ok: false, error: `Seçilmiş rulo tapılmadı: ${selectedRoll.rollNo ?? selectedRoll.rollId}` };
        const status = String(roll.status ?? "");
        const belongsToDocument = String(roll.movementDocumentId ?? "") === String(document.id ?? "");
        if (["reserved", "moved", "exported"].includes(status) && !belongsToDocument) {
          return { ok: false, error: `${roll.rollNo ?? "Rulo"} başqa sənəddə istifadə olunub` };
        }
      }
    }
  }
  return { ok: true };
}

function createTestMovementPurchases(db) {
  const batch = "smart-movement-v2";
  const obsoleteDocuments = db.documents.filter((document) =>
    String(document.testBatch ?? "").startsWith("smart-movement-") && document.testBatch !== batch
  );
  for (const document of obsoleteDocuments) {
    const warehouse = normalizeWarehouse(db, document.account);
    for (const line of document.lines ?? []) {
      const product = db.products.find((item) => Number(item.id) === Number(line.productId));
      if (!product) continue;
      const current = productStock(product, warehouse);
      product.warehouses[warehouse] = Math.max(0, current - numberValue(line.qty));
    }
  }
  if (obsoleteDocuments.length > 0) {
    const obsoleteIds = new Set(obsoleteDocuments.map((document) => String(document.id)));
    db.documents = db.documents.filter((document) =>
      !obsoleteIds.has(String(document.id)) && !obsoleteIds.has(String(document.linkedDocumentId ?? ""))
    );
  }
  const existing = db.documents.filter((document) => document.testBatch === batch);
  if (existing.length >= 10) return existing;
  const testProductNames = [
    "HG Beyaz Parlaq",
    "HG Beyaz Mat",
    "HG Antrasit",
    "HG Kumsal",
    "HG Fume",
    "HG Siyah",
    "Soft Touch Beyaz",
    "Soft Touch Koyu Vizon",
    "Soft Touch Aciq Gri",
    "Folyo Satin Inci",
    "Folyo Satin Beyaz",
    "Folyo Satin Kaya Gri",
  ];
  for (const [index, name] of testProductNames.entries()) {
    if (db.products.some((product) => product.name === name)) continue;
    db.products.push({
      id: nextNumericId(db.products),
      name,
      code: `TEST-${String(index + 1).padStart(3, "0")}`,
      sku: `ARIX-${String(index + 1).padStart(3, "0")}`,
      type: "product",
      unit: "mt",
      salePrice: Number((3.2 + index * 0.15).toFixed(2)),
      cost: Number((1.8 + index * 0.1).toFixed(2)),
      warehouses: { antrepo: 0, depo: 0 },
      active: true,
      testBatch: batch,
      createdAt: new Date().toISOString(),
    });
  }
  const products = db.products.filter((product) => product.type !== "service").slice(0, 12);
  const productSets = [
    [0, 1, 2],
    [0, 1, 3],
    [2, 3, 4],
    [3, 4, 5],
    [5, 6, 7],
    [6, 7, 8],
    [8, 9, 10],
    [9, 10, 11],
    [0, 6, 11],
    [2, 5, 9],
  ];
  let supplier = db.counterparties.find((item) => item.kind === "supplier");
  if (!supplier) {
    supplier = {
      id: nextNumericId(db.counterparties),
      kind: "supplier",
      name: "ARIX TEST TƏCHİZATÇI",
      phone: "",
      email: "",
      address: "TEST",
      balance: 0,
      owner: "Arif Mahmud",
      testBatch: batch,
      createdAt: new Date().toISOString(),
    };
    db.counterparties.push(supplier);
  }
  const created = [];

  for (let documentIndex = existing.length; documentIndex < 10; documentIndex += 1) {
    const containerProducts = productSets[documentIndex].map((productIndex) => products[productIndex]).filter(Boolean);
    const lineTotals = new Map();
    const pallets = Array.from({ length: 16 }, (_, palletIndex) => {
      const isOpenMixed = palletIndex < 4;
      const closedProduct = containerProducts[(palletIndex - 4 + containerProducts.length) % containerProducts.length];
      const rolls = Array.from({ length: 16 }, (_, rollIndex) => {
        const product = isOpenMixed
          ? containerProducts[rollIndex % containerProducts.length]
          : closedProduct;
        const qty = [100, 110, 120][(documentIndex + palletIndex + rollIndex) % 3];
        lineTotals.set(product.id, (lineTotals.get(product.id) ?? 0) + qty);
        return {
          id: randomUUID(),
          productId: product.id,
          rollNo: `T${String(documentIndex + 1).padStart(2, "0")}-P${String(palletIndex + 1).padStart(2, "0")}-R${String(rollIndex + 1).padStart(2, "0")}`,
          width: String([1220, 1250, 1400][rollIndex % 3]),
          thickness: String([0.3, 0.35][rollIndex % 2]),
          qty: String(qty),
          netKg: "",
          grossKg: "",
          status: "available",
        };
      });
      return {
        id: randomUUID(),
        number: `${isOpenMixed ? "Açıq qarışıq" : "Bağlı"} palet ${String(palletIndex + 1).padStart(2, "0")}`,
        palletStatus: isOpenMixed ? "open" : "closed",
        rolls,
      };
    });
    const lines = Array.from(lineTotals.entries()).map(([productId, qty]) => {
      const product = products.find((item) => item.id === productId);
      return {
        productId,
        name: product?.name ?? "",
        code: product?.code ?? "",
        sku: product?.sku ?? "",
        unit: product?.unit ?? "mt",
        variant: "Standart",
        qty,
        price: Number(product?.cost ?? 0),
        discount: 0,
        total: qty * Number(product?.cost ?? 0),
      };
    });
    const document = {
      id: randomUUID(),
      type: "purchase",
      posted: true,
      status: "posted",
      workflowStatus: "closed",
      documentDate: new Date(2026, 4, 1 + documentIndex, 9, 0).toISOString(),
      createdAt: new Date().toISOString(),
      account: "ERSA ANTREPO",
      counterpartyId: supplier?.id ?? null,
      counterpartyName: supplier?.name ?? "TEST TƏCHİZATÇI",
      author: "Arif Mahmud",
      total: lines.reduce((sum, line) => sum + line.total, 0),
      lines,
      testBatch: batch,
      testLabel: `Ağıllı yerdəyişmə testi ${documentIndex + 1}`,
      bondedStock: {
        mode: "container-pallet-roll",
        destination: "ERSA ANTREPO",
        containers: [{
          id: randomUUID(),
          number: `TEST-CONT-${String(documentIndex + 1).padStart(3, "0")}`,
          invoice: `BƏY-2026-${String(documentIndex + 1).padStart(3, "0")}`,
          customsStatus: "bonded",
          pallets,
        }],
        summary: {
          containerCount: 1,
          palletCount: 16,
          rollCount: 256,
          qty: lines.reduce((sum, line) => sum + line.qty, 0),
          netKg: 0,
          grossKg: 0,
        },
      },
    };
    const result = applyDocumentStock(db, document);
    if (!result.ok) throw new Error(result.error);
    db.documents.unshift(document);
    created.push(document);
  }
  return [...created, ...existing];
}

async function handleMovementSuggestions(req, res) {
  const db = await readDb();
  if (req.method !== "POST") return notFound(res);
  const body = await parseBody(req);
  return send(res, 200, { data: createMovementSuggestions(db, body) });
}

async function handleSaleRollSuggestion(req, res) {
  const db = await readDb();
  if (req.method !== "POST") return notFound(res);
  const body = await parseBody(req);
  const trackedLines = (Array.isArray(body.lines) ? body.lines : []).filter((line) => {
    const product = db.products.find((item) => Number(item.id) === Number(line.productId));
    return product && product.type !== "service";
  });
  return send(res, 200, { data: createAutomaticSaleRollSelection(db, { ...body, lines: trackedLines }) });
}

async function handleTestMovementPurchases(req, res) {
  const db = await readDb();
  if (req.method !== "POST") return notFound(res);
  const documents = createTestMovementPurchases(db);
  await writeDb(db);
  return send(res, 201, {
    count: documents.length,
    data: documents.map((document) => ({ id: document.id, label: document.testLabel, container: document.bondedStock?.containers?.[0]?.number })),
  });
}

function applyLandedCost(db, document) {
  const link = document.costLink;
  if (document.posted === false) return [];
  if (document.type !== "cashOut" || !link?.enabled) return [];
  const amount = Math.abs(numberValue(document.amount ?? document.total));
  if (amount <= 0) return [];

  const linkedContainers = Array.isArray(link.containers) ? link.containers : [];
  const linkedKeys = new Set([
    ...(Array.isArray(link.containerKeys) ? link.containerKeys : []),
    ...linkedContainers.map((item) => String(item.key ?? "")).filter(Boolean),
  ]);
  const linkedNumbers = new Set(linkedContainers.map((item) => String(item.number ?? "")).filter(Boolean));
  const containers = collectDocumentContainers(db).filter((container) =>
    linkedKeys.has(container.key) || linkedNumbers.has(container.number)
  );
  const totalQty = containers.reduce((sum, container) => sum + Math.max(0, container.qty), 0);
  if (containers.length === 0 || totalQty <= 0) return [];

  const category = String(link.category ?? document.category ?? "Maya xərci");
  const adjustments = containers.map((container) => {
    const ratio = container.qty / totalQty;
    const allocatedAmount = Number((amount * ratio).toFixed(4));
    const unitCost = container.qty > 0 ? Number((allocatedAmount / container.qty).toFixed(6)) : 0;
    const productAllocations = Object.entries(container.productQuantities ?? {}).map(([productId, productQty]) => {
      const qtyValue = numberValue(productQty);
      const productAmount = container.qty > 0 ? Number((allocatedAmount * (qtyValue / container.qty)).toFixed(4)) : 0;
      return {
        productId: Number(productId),
        qty: qtyValue,
        amount: productAmount,
        unitCost: qtyValue > 0 ? Number((productAmount / qtyValue).toFixed(6)) : 0,
      };
    });
    return {
      id: randomUUID(),
      documentId: document.id,
      sourceDocumentType: document.type,
      documentDate: document.documentDate ?? document.createdAt,
      category,
      amount: allocatedAmount,
      totalExpense: amount,
      ratio: Number(ratio.toFixed(6)),
      containerKey: container.key,
      containerNumber: container.number,
      purchaseDocumentId: container.documentId,
      baseQty: container.qty,
      netKg: container.netKg,
      grossKg: container.grossKg,
      unitCost,
      productAllocations,
      formula: `${allocatedAmount.toFixed(2)} / ${container.qty.toFixed(2)} = ${unitCost.toFixed(4)}`,
      appliesFrom: document.documentDate ?? document.createdAt,
      createdAt: new Date().toISOString(),
    };
  });
  document.costAllocations = adjustments;
  document.relationshipType = "landedCost";
  db.landedCostAdjustments.unshift(...adjustments);
  const affectedPurchaseIds = new Set(adjustments.map((item) => String(item.purchaseDocumentId)));
  for (const purchaseId of affectedPurchaseIds) {
    const purchaseDocument = db.documents.find((item) => String(item.id) === purchaseId && item.type === "purchase");
    if (!purchaseDocument) continue;
    for (const line of purchaseDocument.lines ?? []) {
      const productId = Number(line.productId);
      const lineQty = numberValue(line.qty);
      const extraAmount = db.landedCostAdjustments
        .filter((item) => String(item.purchaseDocumentId) === purchaseId)
        .flatMap((item) => item.productAllocations ?? [])
        .filter((item) => Number(item.productId) === productId)
        .reduce((sum, item) => sum + numberValue(item.amount), 0);
      const directPurchasePrice = numberValue(line.directPurchasePrice ?? line.price);
      const additionalUnitCost = lineQty > 0 ? extraAmount / lineQty : 0;
      line.directPurchasePrice = directPurchasePrice;
      line.additionalUnitCost = Number(additionalUnitCost.toFixed(6));
      line.unitCost = Number((directPurchasePrice + additionalUnitCost).toFixed(6));
      line.costTotal = Number((lineQty * line.unitCost).toFixed(4));
    }
  }
  const newExpenseByProduct = new Map();
  adjustments.flatMap((item) => item.productAllocations ?? []).forEach((item) => {
    const productId = Number(item.productId);
    newExpenseByProduct.set(productId, (newExpenseByProduct.get(productId) ?? 0) + numberValue(item.amount));
  });
  for (const [productId, expenseAmount] of newExpenseByProduct) {
    const product = db.products.find((item) => Number(item.id) === Number(productId));
    if (!product) continue;
    const stockQty = productTotalStock(product);
    if (stockQty <= 0) continue;
    const previousCost = product.cost;
    product.cost = Number((numberValue(product.cost ?? product.purchasePrice) + expenseAmount / stockQty).toFixed(6));
    appendProductPriceHistory(db, {
      productId,
      action: "Maya dəyəri yeniləndi",
      detail: `${category} · ${String(document.id ?? "").slice(0, 8)}`,
      source: "landedCost",
      documentId: document.id,
      at: document.documentDate ?? document.createdAt,
      changes: [
        { field: "Orta maya dəyəri", oldValue: previousCost, newValue: product.cost },
      ],
    });
  }
  return adjustments;
}

function paymentDirectionForDocument(type) {
  if (type === "sale" || type === "purchaseReturn") return "in";
  if (type === "purchase" || type === "saleReturn") return "out";
  return "";
}

function sourceDocumentTitle(document) {
  const title = document.type === "purchase"
    ? "Alış sənədi"
    : document.type === "sale"
      ? "Satış sənədi"
      : document.type === "purchaseReturn"
        ? "Alış qaytarması"
        : document.type === "saleReturn"
          ? "Satış qaytarması"
          : "Sənəd";
  return `${title} #${String(document.id ?? "").slice(0, 8)}`;
}

function applyDebtPayment(db, document) {
  const link = document.documentLink;
  if (document.posted === false || !link?.enabled || link.type !== "debtPayment") return { ok: true };
  if (!["cashIn", "cashOut"].includes(document.type)) return { ok: false, error: "Borc ödənişi yalnız mədaxil və məxaric sənədindən yaradıla bilər." };

  const source = db.documents.find((item) => String(item.id) === String(link.documentId));
  if (!source) return { ok: false, error: "Əlaqələndiriləcək sənəd tapılmadı." };

  const direction = paymentDirectionForDocument(source.type);
  const moneyDirection = document.type === "cashIn" ? "in" : "out";
  if (!direction || direction !== moneyDirection) return { ok: false, error: "Pul hərəkətinin istiqaməti seçilən sənədə uyğun deyil." };

  const amount = Math.abs(numberValue(document.amount ?? document.total));
  const total = Math.abs(numberValue(source.paymentSummary?.total ?? source.total));
  const existingPayments = Array.isArray(source.payments) ? source.payments : [];
  const paid = existingPayments.reduce((sum, payment) => sum + Math.abs(numberValue(payment.amount)), 0);
  const remaining = Math.max(0, total - paid);
  if (amount <= 0) return { ok: false, error: "Ödəniş məbləği düzgün deyil." };
  if (amount > remaining + 0.0001) return { ok: false, error: `Ödəniş qalıq borcdan çoxdur: ${remaining.toFixed(2)}` };

  source.payments = [
    ...existingPayments,
    {
      account: document.account,
      method: document.method,
      amount,
      date: document.documentDate ?? document.createdAt,
      note: document.comment ?? "",
      direction,
      externalDocumentId: document.id,
    },
  ];
  const nextPaid = paid + amount;
  source.paymentSummary = {
    total,
    paid: nextPaid,
    remaining: Math.max(0, total - nextPaid),
    status: nextPaid >= total ? "Tam ödənilib" : nextPaid > 0 ? "Qismən ödənilib" : "Ödənilməyib",
  };
  source.updatedAt = new Date().toISOString();

  document.linkedDocumentId = source.id;
  document.linkedDocument = sourceDocumentTitle(source);
  document.relationshipType = "debtPayment";
  document.counterpartyId ??= source.counterpartyId ?? null;
  document.counterpartyName ||= source.counterpartyName ?? "";
  document.category ||= direction === "in" ? "Sənəd ödənişi" : "Təchizatçı ödənişi";
  return { ok: true, source };
}

function createPaymentDocuments(sourceDocument) {
  const payments = Array.isArray(sourceDocument.payments) ? sourceDocument.payments : [];
  const direction = paymentDirectionForDocument(sourceDocument.type);
  if (!direction) return [];
  return payments
    .map((payment, index) => {
      if (payment.externalDocumentId) return null;
      const amount = Math.abs(numberValue(payment.amount));
      if (amount <= 0) return null;
      const isIn = String(payment.direction ?? direction) === "in";
      const sourceTitle = sourceDocument.type === "purchase"
        ? "Alış sənədi"
        : sourceDocument.type === "sale"
          ? "Satış sənədi"
          : sourceDocument.type === "purchaseReturn"
            ? "Alışın geriqaytarması"
            : "Satışın geriqaytarması";
      return {
        id: randomUUID(),
        status: sourceDocument.status,
        posted: sourceDocument.posted,
        createdAt: new Date().toISOString(),
        type: isIn ? "cashIn" : "cashOut",
        documentDate: payment.date ?? sourceDocument.documentDate ?? sourceDocument.createdAt,
        account: payment.account ?? sourceDocument.account,
        counterpartyId: sourceDocument.counterpartyId ?? null,
        counterpartyName: sourceDocument.counterpartyName ?? "",
        category: isIn ? "Sənəd ödənişi" : "Təchizatçı ödənişi",
        method: payment.method ?? "",
        amount,
        total: amount,
        author: sourceDocument.author ?? "Arif Mahmud",
        comment: payment.note ?? "",
        linkedDocument: `${sourceTitle} #${String(sourceDocument.id).slice(0, 8)}`,
        linkedDocumentId: sourceDocument.id,
        paymentIndex: index + 1,
        generatedFromPayment: true,
      };
    })
    .filter(Boolean);
}

function refreshDocumentPaymentSummary(document) {
  const total = Math.abs(numberValue(document.paymentSummary?.total ?? document.total));
  const payments = Array.isArray(document.payments) ? document.payments : [];
  const paid = payments.reduce((sum, payment) => sum + Math.abs(numberValue(payment.amount)), 0);
  document.paymentSummary = {
    total,
    paid,
    remaining: Math.max(0, total - paid),
    status: paid >= total && total > 0 ? "Tam ödənilib" : paid > 0 ? "Qismən ödənilib" : "Ödənilməyib",
  };
  document.updatedAt = new Date().toISOString();
}

function validateDocumentRemoval(db, document) {
  if (document.posted === false) return { ok: true };
  if (document.type === "movement") {
    const to = normalizeWarehouse(db, document.toAccount ?? "ERSA ANTREPO");
    for (const line of document.lines ?? []) {
      const product = db.products.find((item) => Number(item.id) === Number(line.productId));
      if (!product || product.type === "service") continue;
      const qty = numberValue(line.qty);
      if (productStock(product, to) + 0.0001 < qty) {
        return { ok: false, error: `${product.name} məhsulunun sonrakı hərəkətləri var. ${to.toUpperCase()} qalığı sənədi silmək üçün kifayət etmir.` };
      }
    }
  }
  if (["purchase", "saleReturn", "openingBalance"].includes(document.type)) {
    const account = normalizeWarehouse(db, document.account);
    for (const line of document.lines ?? []) {
      const product = db.products.find((item) => Number(item.id) === Number(line.productId));
      if (!product || product.type === "service") continue;
      const qty = numberValue(line.qty);
      if (productStock(product, account) + 0.0001 < qty) {
        return { ok: false, error: `${product.name} məhsulunun bu alışdan sonra çıxışı var. Əvvəl sonrakı sənədləri düzəldin.` };
      }
    }
  }
  return { ok: true };
}

function reverseDocumentEffects(db, document) {
  const validation = validateDocumentRemoval(db, document);
  if (!validation.ok) return validation;

  if (document.type === "movement" || (document.type === "sale" && (document.saleMode === "export" || document.exportMode))) {
    reverseMovementStock(db, document);
    releaseMovementSelection(db, document);
  } else if (document.type === "sale") {
    reverseRegularSaleStock(db, document);
  } else if (document.posted !== false && ["purchase", "saleReturn", "openingBalance"].includes(document.type)) {
    const account = normalizeWarehouse(db, document.account);
    for (const line of document.lines ?? []) {
      const product = db.products.find((item) => Number(item.id) === Number(line.productId));
      if (!product || product.type === "service") continue;
      changeStock(product, account, -numberValue(line.qty));
    }
  } else if (document.posted !== false && ["writeOff", "purchaseReturn"].includes(document.type)) {
    const account = normalizeWarehouse(db, document.account);
    for (const line of document.lines ?? []) {
      const product = db.products.find((item) => Number(item.id) === Number(line.productId));
      if (!product || product.type === "service") continue;
      changeStock(product, account, numberValue(line.qty));
    }
  }

  if (document.relationshipType === "debtPayment" && document.linkedDocumentId) {
    const source = db.documents.find((item) => String(item.id) === String(document.linkedDocumentId));
    if (source) {
      source.payments = (source.payments ?? []).filter((payment) => String(payment.externalDocumentId ?? "") !== String(document.id));
      refreshDocumentPaymentSummary(source);
    }
  } else if (document.generatedFromPayment && document.linkedDocumentId) {
    const source = db.documents.find((item) => String(item.id) === String(document.linkedDocumentId));
    if (source && Number(document.paymentIndex) > 0) {
      source.payments = (source.payments ?? []).filter((_, index) => index !== Number(document.paymentIndex) - 1);
      refreshDocumentPaymentSummary(source);
    }
  }

  db.landedCostAdjustments = db.landedCostAdjustments.filter((item) => String(item.documentId) !== String(document.id));
  db.accounting.journals = db.accounting.journals.filter((journal) => String(journal.sourceDocumentId) !== String(document.id));
  return { ok: true };
}

function restoreDocumentEffects(db, document) {
  const stockResult = applyDocumentStock(db, document);
  if (!stockResult.ok) return stockResult;
  markMovementSelection(db, document);

  if (document.relationshipType === "debtPayment") {
    const paymentResult = applyDebtPayment(db, document);
    if (!paymentResult.ok) return paymentResult;
  } else if (document.generatedFromPayment && document.linkedDocumentId) {
    const source = db.documents.find((item) => String(item.id) === String(document.linkedDocumentId));
    if (source) {
      const payments = [...(source.payments ?? [])];
      const index = Math.max(0, Number(document.paymentIndex || payments.length + 1) - 1);
      payments.splice(index, 0, {
        account: document.account,
        method: document.method,
        amount: Math.abs(numberValue(document.amount ?? document.total)),
        date: document.documentDate ?? document.createdAt,
        note: document.comment ?? "",
        direction: document.type === "cashIn" ? "in" : "out",
      });
      source.payments = payments;
      refreshDocumentPaymentSummary(source);
    }
  }

  applyLandedCost(db, document);
  upsertDocumentJournal(db, document);
  return { ok: true };
}

async function handleDocuments(req, res) {
  const db = await readDb();
  if (req.method === "GET") {
    return send(res, 200, {
      data: db.documents.map((document) => document.movementSelection?.containers?.length
        ? { ...document, movementSelection: movementSelectionWithFullPallets(db, document) }
        : document),
    });
  }
  if (req.method === "PATCH") {
    const id = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname.split("/").filter(Boolean)[2];
    const index = db.documents.findIndex((item) => String(item.id) === String(id));
    if (index < 0) return notFound(res);
    const body = await parseBody(req);
    if (body.financialAccountId) {
      const financialAccount = db.financialAccounts.find((item) => item.id === String(body.financialAccountId) && item.status !== "inactive");
      if (!financialAccount) return send(res, 400, { error: "Seçilen şirket hesabı bulunamadı." });
      body.account = financialAccount.name;
      if (["cashIn", "cashOut"].includes(body.type ?? db.documents[index]?.type) && !body.bankTransactionId) body.bankMatchStatus = "pending";
    }
    const previousDocument = db.documents[index];
    const sourceLock = resolveSourceDocumentLock(db.eDocuments.documents, previousDocument.id);
    if (previousDocument.type === "sale" && sourceLock.locked) {
      return send(res, 409, { error: sourceLock.reason, lock: sourceLock });
    }
    const updatedDocument = {
      ...previousDocument,
      ...body,
      id: previousDocument.id,
      updatedAt: new Date().toISOString(),
    };
    normalizeDocumentFinancials(db, updatedDocument);
    const financialError = validateDocumentFinancials(updatedDocument);
    if (financialError) return send(res, 400, { error: financialError });
    if (updatedDocument.type === "sale" && updatedDocument.saleMode !== "export" && !updatedDocument.exportMode && db.companySettings?.stockMode === "bondedRolls") {
      const rollResult = validateAutomaticSaleRollSelection(db, updatedDocument);
      if (!rollResult.ok) return send(res, 409, { error: rollResult.error });
      updatedDocument.rollSelection = rollResult.selection;
      updatedDocument.rollMeasurements = rollResult.measurements;
    }
    if (previousDocument.type === "movement" || (previousDocument.type === "sale" && (previousDocument.saleMode === "export" || previousDocument.exportMode))) {
      reverseMovementStock(db, previousDocument);
      releaseMovementSelection(db, previousDocument);
      const stockResult = applyDocumentStock(db, updatedDocument);
      if (!stockResult.ok) return send(res, 409, { error: stockResult.error });
      markMovementSelection(db, updatedDocument);
    } else if (previousDocument.type === "sale" && previousDocument.saleMode !== "export" && !previousDocument.exportMode) {
      reverseRegularSaleStock(db, previousDocument);
      const stockResult = applyDocumentStock(db, updatedDocument);
      if (!stockResult.ok) return send(res, 409, { error: stockResult.error });
    }
    const replacedPaymentIds = db.documents
      .filter((item) => item.generatedFromPayment && String(item.linkedDocumentId) === String(id))
      .map((item) => String(item.id));
    db.documents = db.documents.filter((item) => !(item.generatedFromPayment && String(item.linkedDocumentId) === String(id)));
    db.accounting.journals = db.accounting.journals.filter((journal) => !replacedPaymentIds.includes(String(journal.sourceDocumentId)));
    const sourceIndex = db.documents.findIndex((item) => String(item.id) === String(id));
    db.documents[sourceIndex] = updatedDocument;
    const paymentDocuments = createPaymentDocuments(updatedDocument);
    db.documents.unshift(...paymentDocuments);
    const journal = upsertDocumentJournal(db, updatedDocument);
    paymentDocuments.forEach((paymentDocument) => upsertDocumentJournal(db, paymentDocument));
    rebuildLotAccounting(db, {
      sourceDocumentId: updatedDocument.id,
      effectiveFrom: updatedDocument.documentDate ?? updatedDocument.createdAt,
      reason: "Sənəd redaktəsindən sonra partiya mayası yenidən hesablandı",
    });
    await writeDb(db);
    return send(res, 200, { data: updatedDocument, payments: paymentDocuments, journal });
  }
  if (req.method === "POST") {
    const body = await parseBody(req);
    if (body.financialAccountId) {
      const financialAccount = db.financialAccounts.find((item) => item.id === String(body.financialAccountId) && item.status !== "inactive");
      if (!financialAccount) return send(res, 400, { error: "Seçilen şirket hesabı bulunamadı." });
      body.account = financialAccount.name;
      if (["cashIn", "cashOut"].includes(body.type) && !body.bankTransactionId) body.bankMatchStatus = "pending";
    }
    const document = {
      id: randomUUID(),
      status: body.posted === false ? "draft" : "posted",
      createdAt: new Date().toISOString(),
      ...body,
    };
    normalizeDocumentFinancials(db, document);
    const financialError = validateDocumentFinancials(document);
    if (financialError) return send(res, 400, { error: financialError });
    if (document.type === "sale" && document.saleMode !== "export" && !document.exportMode && db.companySettings?.stockMode === "bondedRolls") {
      const rollResult = validateAutomaticSaleRollSelection(db, document);
      if (!rollResult.ok) return send(res, 409, { error: rollResult.error });
      document.rollSelection = rollResult.selection;
      document.rollMeasurements = rollResult.measurements;
    }
    const stockResult = applyDocumentStock(db, document);
    if (!stockResult.ok) return send(res, 409, { error: stockResult.error });
    markMovementSelection(db, document);
    const debtPaymentResult = applyDebtPayment(db, document);
    if (!debtPaymentResult.ok) return send(res, 409, { error: debtPaymentResult.error });
    applyLandedCost(db, document);
    const paymentDocuments = createPaymentDocuments(document);
    db.documents.unshift(...paymentDocuments, document);
    const journal = upsertDocumentJournal(db, document);
    paymentDocuments.forEach((paymentDocument) => upsertDocumentJournal(db, paymentDocument));
    rebuildLotAccounting(db, {
      sourceDocumentId: document.id,
      effectiveFrom: document.documentDate ?? document.createdAt,
      reason: "Yeni sənəddən sonra partiya mayası yenidən hesablandı",
    });
    await writeDb(db);
    return send(res, 201, { data: document, payments: paymentDocuments, products: stockResult.products, journal });
  }
  if (req.method === "DELETE") {
    const id = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname.split("/").filter(Boolean)[2];
    const document = db.documents.find((item) => String(item.id) === String(id));
    if (!document) return notFound(res);
    const sourceLock = resolveSourceDocumentLock(db.eDocuments.documents, document.id);
    if (sourceLock.locked) return send(res, 409, { error: sourceLock.reason, lock: sourceLock });
    const reverseResult = reverseDocumentEffects(db, document);
    if (!reverseResult.ok) return send(res, 409, { error: reverseResult.error });
    const relatedDocuments = db.documents.filter((item) => item.generatedFromPayment && String(item.linkedDocumentId) === String(document.id));
    const relatedIds = new Set(relatedDocuments.map((item) => String(item.id)));
    const entry = moveToTrash(db, "document", document, { documents: relatedDocuments }, req.authUser?.name);
    db.documents = db.documents.filter((item) => String(item.id) !== String(document.id) && !relatedIds.has(String(item.id)));
    db.accounting.journals = db.accounting.journals.filter((journal) => !relatedIds.has(String(journal.sourceDocumentId)));
    rebuildLotAccounting(db, {
      sourceDocumentId: document.id,
      effectiveFrom: document.documentDate ?? document.createdAt,
      reason: "Sənəd səbətə köçürüldükdən sonra yenidən hesablandı",
    });
    await writeDb(db);
    return send(res, 200, { ok: true, data: publicTrashEntry(entry) });
  }
  return notFound(res);
}

async function handleTrash(req, res, url, parts) {
  const db = await readDb();
  const id = parts[1];
  const action = parts[2];

  if (req.method === "GET" && parts.length === 1) {
    const type = String(url.searchParams.get("type") ?? "").trim();
    const query = String(url.searchParams.get("q") ?? "").trim().toLocaleLowerCase("az-Latn-AZ");
    const data = db.trash
      .filter((entry) => !type || entry.entityType === type || entry.subtype === type)
      .filter((entry) => !query || [entry.label, entry.summary, entry.entityId, entry.deletedBy]
        .some((value) => String(value ?? "").toLocaleLowerCase("az-Latn-AZ").includes(query)))
      .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)))
      .map(publicTrashEntry);
    return send(res, 200, { data });
  }

  if (req.method === "PATCH" && id && action === "restore") {
    const working = structuredClone(db);
    const entryIndex = working.trash.findIndex((item) => String(item.id) === String(id));
    if (entryIndex < 0) return notFound(res);
    const entry = working.trash[entryIndex];
    const original = structuredClone(entry.original);

    if (entry.entityType === "product") {
      if (working.products.some((item) => Number(item.id) === Number(original.id))) {
        return send(res, 409, { error: "Bu məhsul ID-si artıq istifadə olunur." });
      }
      working.products.push(original);
      const priceIds = new Set(working.customerPrices.map((item) => String(item.id)));
      working.customerPrices.push(...(entry.related?.customerPrices ?? []).filter((item) => !priceIds.has(String(item.id))));
      const historyIds = new Set(working.productPriceHistory.map((item) => String(item.id)));
      working.productPriceHistory.push(...(entry.related?.priceHistory ?? []).filter((item) => !historyIds.has(String(item.id))));
    } else if (entry.entityType === "counterparty") {
      if (working.counterparties.some((item) => Number(item.id) === Number(original.id))) {
        return send(res, 409, { error: "Bu kontragent ID-si artıq istifadə olunur." });
      }
      working.counterparties.push(original);
      const priceIds = new Set(working.customerPrices.map((item) => String(item.id)));
      working.customerPrices.push(...(entry.related?.customerPrices ?? []).filter((item) => !priceIds.has(String(item.id))));
      for (const restoredAccount of entry.related?.accountingAccounts ?? []) {
        const accountIndex = working.accounting.accounts.findIndex((item) => String(item.id) === String(restoredAccount.id));
        if (accountIndex >= 0) working.accounting.accounts[accountIndex] = restoredAccount;
        else working.accounting.accounts.push(restoredAccount);
      }
    } else if (entry.entityType === "store") {
      if (working.stores.some((item) => Number(item.id) === Number(original.id) || item.key === original.key || item.name === original.name)) {
        return send(res, 409, { error: "Eyni mağaza artıq mövcuddur." });
      }
      working.stores.push(original);
      working.products = working.products.map((product) => ({
        ...product,
        warehouses: { ...(product.warehouses ?? {}), [original.key]: numberValue(product.warehouses?.[original.key]) },
        storePrices: { ...(product.storePrices ?? {}), [original.name]: numberValue(product.storePrices?.[original.name] ?? product.salePrice) },
      }));
    } else if (entry.entityType === "document") {
      if (working.documents.some((item) => String(item.id) === String(original.id))) {
        return send(res, 409, { error: "Bu sənəd artıq mövcuddur." });
      }
      working.documents.unshift(original);
      const restoreResult = restoreDocumentEffects(working, original);
      if (!restoreResult.ok) return send(res, 409, { error: restoreResult.error });
      for (const relatedDocument of entry.related?.documents ?? []) {
        if (working.documents.some((item) => String(item.id) === String(relatedDocument.id))) continue;
        working.documents.unshift(relatedDocument);
        upsertDocumentJournal(working, relatedDocument);
      }
      rebuildLotAccounting(working, {
        sourceDocumentId: original.id,
        effectiveFrom: original.documentDate ?? original.createdAt,
        reason: "Sənəd səbətdən bərpa edildikdən sonra yenidən hesablandı",
      });
    } else {
      return send(res, 400, { error: "Bu qeyd növü hələ bərpa edilmir." });
    }

    working.trash.splice(entryIndex, 1);
    await writeDb(working);
    return send(res, 200, { ok: true, data: publicTrashEntry(entry) });
  }

  if (req.method === "DELETE" && id) {
    const before = db.trash.length;
    db.trash = db.trash.filter((entry) => String(entry.id) !== String(id));
    if (db.trash.length === before) return notFound(res);
    await writeDb(db);
    return send(res, 200, { ok: true });
  }

  return notFound(res);
}

async function handleStockContainers(req, res) {
  const db = await readDb();
  if (req.method !== "GET") return notFound(res);
  return send(res, 200, { data: collectDocumentContainers(db) });
}

async function handleLandedCosts(req, res) {
  const db = await readDb();
  if (req.method !== "GET") return notFound(res);
  return send(res, 200, { data: db.landedCostAdjustments });
}

async function handleInventoryLots(req, res, url) {
  const db = await readDb();
  if (req.method !== "GET") return notFound(res);
  const productId = Number(url.searchParams.get("productId") ?? 0);
  if (!productId) {
    return send(res, 200, {
      data: {
        purchaseLots: db.purchaseLots,
        depotLots: db.depotLots,
        costEvents: db.lotCostEvents,
        recalculations: db.lotRecalculations,
        summary: db.lotAccountingSummary,
      },
    });
  }
  return send(res, 200, { data: lotAccountingForProduct(db, productId) });
}

async function handleProductLedger(req, res, url) {
  if (req.method !== "GET") return notFound(res);
  const productId = Number(url.searchParams.get("productId") ?? 0);
  if (!productId) return send(res, 400, { error: "productId tələb olunur" });
  const db = await readDb();
  return send(res, 200, { data: buildProductLedger(db, productId) });
}

function normalizeWarehouse(db, value) {
  const text = String(value ?? "").trim().toLocaleLowerCase();
  const store = (db.stores ?? []).find((item) =>
    String(item.name ?? "").trim().toLocaleLowerCase() === text
    || String(item.key ?? "").trim().toLocaleLowerCase() === text
  );
  if (store) return store.key;
  if (!text) return "depo";
  if (text.includes("antrepo")) return "antrepo";
  if (text.includes("depo")) return "depo";
  return String(value ?? "depo");
}

function productStock(product, warehouse) {
  return Number(product.warehouses?.[warehouse] ?? 0);
}

function productTotalStock(product) {
  return Object.values(product.warehouses ?? {}).reduce((sum, value) => sum + Math.max(0, numberValue(value)), 0);
}

function changeStock(product, warehouse, diff) {
  product.warehouses = product.warehouses ?? { antrepo: 0, depo: 0 };
  product.warehouses[warehouse] = Number(product.warehouses[warehouse] ?? 0) + diff;
}

function applyDocumentStock(db, document) {
  if (document.posted === false) return { ok: true, products: [] };
  const lines = Array.isArray(document.lines) ? document.lines : [];
  const kind = document.type;
  const selectionValidation = validateMovementSelection(db, document);
  if (!selectionValidation.ok) return selectionValidation;
  const stockHandledByRollSelection = hasMovementSelection(document)
    && (kind === "movement" || (kind === "sale" && (document.saleMode === "export" || document.exportMode)));
  const account = normalizeWarehouse(db, document.account);
  const from = normalizeWarehouse(db, document.fromAccount ?? document.account);
  const to = normalizeWarehouse(db, document.toAccount ?? "ERSA ANTREPO");
  const touched = [];

  if (kind === "sale" && document.saleMode !== "export" && !document.exportMode) {
    for (const measurement of document.rollMeasurements ?? []) {
      const product = db.products.find((item) => Number(item.id) === Number(measurement.productId));
      if (!product || product.type === "service") continue;
      changeStock(product, account, numberValue(measurement.variance));
      touched.push(product);
    }
  }

  for (const line of lines) {
    const product = db.products.find((item) => Number(item.id) === Number(line.productId));
    if (!product) return { ok: false, error: `Ürün tapılmadı: ${line.productId}` };
    if (product.type === "service") continue;
    const qty = Number(line.qty ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: `${product.name} üçün miqdar düzgün deyil` };

    if (kind === "purchase") {
      const previousQty = productTotalStock(product);
      const previousPurchasePrice = product.purchasePrice;
      const previousCost = product.cost;
      const directPurchasePrice = numberValue(line.price);
      const additionalUnitCost = numberValue(line.additionalUnitCost);
      const unitCost = directPurchasePrice + additionalUnitCost;
      const previousUnitCost = numberValue(product.cost ?? product.purchasePrice ?? directPurchasePrice);
      line.directPurchasePrice = directPurchasePrice;
      line.additionalUnitCost = additionalUnitCost;
      line.unitCost = unitCost;
      line.costTotal = Number((qty * unitCost).toFixed(4));
      product.purchasePrice = directPurchasePrice;
      product.cost = previousQty + qty > 0
        ? Number(((previousQty * previousUnitCost + qty * unitCost) / (previousQty + qty)).toFixed(6))
        : unitCost;
      appendProductPriceHistory(db, {
        productId: product.id,
        action: "Alış qiyməti yeniləndi",
        detail: `${document.counterpartyName || "Təchizatçı"} · ${String(document.id ?? "").slice(0, 8)}`,
        source: "purchase",
        documentId: document.id,
        at: document.documentDate ?? document.createdAt,
        changes: [
          { field: "Son təchizatçı alış qiyməti", oldValue: previousPurchasePrice, newValue: product.purchasePrice },
          { field: "Orta maya dəyəri", oldValue: previousCost, newValue: product.cost },
        ],
      });
    }

    if (kind === "sale") {
      const unitCost = numberValue(line.unitCost ?? product.cost ?? product.purchasePrice);
      const revenue = Math.max(0, numberValue(line.total) || qty * numberValue(line.price) - numberValue(line.discount));
      const costTotal = qty * unitCost;
      line.unitCost = unitCost;
      line.costTotal = Number(costTotal.toFixed(4));
      line.grossProfit = Number((revenue - costTotal).toFixed(4));
      line.marginPercent = revenue > 0 ? Number((((revenue - costTotal) / revenue) * 100).toFixed(4)) : 0;
    }

    if (stockHandledByRollSelection && kind === "sale") {
      changeStock(product, account, -qty);
    } else if (stockHandledByRollSelection && kind === "movement") {
      changeStock(product, from, -qty);
      changeStock(product, to, qty);
    } else if (kind === "sale" || kind === "writeOff" || kind === "purchaseReturn") {
      if (productStock(product, account) < qty) {
        return { ok: false, error: `${product.name} üçün ${account.toUpperCase()} stok yetərsizdir` };
      }
      changeStock(product, account, -qty);
    } else if (kind === "purchase" || kind === "saleReturn" || kind === "openingBalance") {
      changeStock(product, account, qty);
    } else if (kind === "movement") {
      if (productStock(product, from) < qty) {
        return { ok: false, error: `${product.name} üçün ${from.toUpperCase()} stok yetərsizdir` };
      }
      changeStock(product, from, -qty);
      changeStock(product, to, qty);
    }
    touched.push(product);
  }

  return { ok: true, products: touched };
}

const initialDb = await ensureDb();
rebuildLotAccounting(initialDb, { recordAudit: false });
await writeDb(initialDb);

const server = createServer(async (req, res) => {
  try {
    applyCors(req, res);
    if (req.method === "OPTIONS") return send(res, 204, {});
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] !== "api") return notFound(res);
    if (parts[1] === "health") return send(res, 200, { ok: true, service: "arix-api", time: new Date().toISOString() });
    if (parts[1] === "auth") return await handleAuth(req, res, parts.slice(1));

    const authDb = await readDb();
    const authUser = requestAuthUser(req, authDb);
    if (AUTH_REQUIRED && !authUser) return send(res, 401, { error: "Giriş sessiyası tələb olunur." });
    req.authUser = authUser;

    if (parts[1] === "products") return await handleProducts(req, res, url, parts.slice(1));
    if (parts[1] === "employees") return await handleEmployees(req, res, parts.slice(1));
    if (parts[1] === "product-price-history") return await handleProductPriceHistory(req, res, url);
    if (parts[1] === "product-groups") return await handleSimpleCollection(req, res, "productGroups");
    if (parts[1] === "categories") return await handleSimpleCollection(req, res, "categories");
    if (parts[1] === "stores") return await handleStores(req, res, parts.slice(1));
    if (parts[1] === "counterparties") return await handleCounterparties(req, res, url, parts.slice(1));
    if (parts[1] === "accounting") return await handleAccounting(req, res, url, parts.slice(1));
    if (parts[1] === "customer-prices") return await handleCustomerPrices(req, res, url, parts.slice(1));
    if (parts[1] === "online-collections") return await handleOnlineCollections(req, res, parts.slice(1));
    if (parts[1] === "payment-integrations") return await handlePaymentIntegrations(req, res, parts.slice(1));
    if (parts[1] === "company-settings") return await handleCompanySettings(req, res);
    if (parts[1] === "e-documents") return await handleEDocuments(req, res, url, parts.slice(1));
    if (parts[1] === "exchange-rates") return await handleExchangeRates(req, res, url);
    if (parts[1] === "documents") return await handleDocuments(req, res);
    if (parts[1] === "trash") return await handleTrash(req, res, url, parts.slice(1));
    if (parts[1] === "stock-containers") return await handleStockContainers(req, res);
    if (parts[1] === "movement-suggestions") return await handleMovementSuggestions(req, res);
    if (parts[1] === "sale-roll-suggestion") return await handleSaleRollSuggestion(req, res);
    if (parts[1] === "test-data" && parts[2] === "movement-purchases") return await handleTestMovementPurchases(req, res);
    if (parts[1] === "landed-costs") return await handleLandedCosts(req, res);
    if (parts[1] === "inventory-lots") return await handleInventoryLots(req, res, url);
    if (parts[1] === "product-ledger") return await handleProductLedger(req, res, url);

    return notFound(res);
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`AriX API listening on http://localhost:${PORT}`);
});
