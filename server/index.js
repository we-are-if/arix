import "dotenv/config";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createCipheriv, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { XMLValidator } from "fast-xml-parser";
import nodemailer from "nodemailer";
import webPush from "web-push";
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
import { calculateCounterpartyAging } from "./counterpartyAging.js";
import { defaultOrderAliases, parseOrderText } from "./orderMatching.js";
import { defaultOrderCatalog } from "./orderCatalog.js";
import { createSQLiteStateStore } from "./database.js";
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

const FULL_ROLL_LENGTHS = new Set([100, 120, 130]);

function isFullRollQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && [...FULL_ROLL_LENGTHS].some((length) => Math.abs(quantity - length) < 0.000001);
}

function normalizeOrderCutAllowance(item, { infer = false } = {}) {
  const quantity = Math.max(0, Number(item?.preparedQuantity ?? item?.quantity) || 0);
  const explicitlyConfigured = item?.cutAllowanceApplied !== undefined;
  const applied = explicitlyConfigured ? item.cutAllowanceApplied === true : infer && !isFullRollQuantity(quantity);
  const pieceCount = applied ? Math.max(1, Math.trunc(Number(item?.cutPieceCount) || 1)) : 0;
  const requestedPerPiece = Number(item?.cutAllowancePerPiece);
  const perPieceMeters = applied ? Math.max(0, Math.min(5, Number.isFinite(requestedPerPiece) ? requestedPerPiece : 0.2)) : 0;
  const allowanceMeters = Number((pieceCount * perPieceMeters).toFixed(3));
  return {
    cutAllowanceApplied: applied,
    cutPieceCount: pieceCount,
    cutAllowancePerPiece: perPieceMeters,
    cutAllowanceMeters: allowanceMeters,
    stockConsumptionQuantity: Number((quantity + allowanceMeters).toFixed(3)),
  };
}
const DATA_DIR = join(__dirname, "data");
const ORDER_UPLOAD_DIR = join(DATA_DIR, "order-uploads");
const STOCK_IMPORT_DIR = join(DATA_DIR, "stock-imports");
const ORDER_ARCHIVE_ROOT = String(
  process.env.ARIX_ORDER_ARCHIVE_ROOT ?? "\\\\ERSARIF\\SharedFolder\\ErsaShare\\YURT İÇİ",
).trim();
const EXPORT_ARCHIVE_ROOT = String(
  process.env.ARIX_EXPORT_ARCHIVE_ROOT ?? "\\\\ERSARIF\\SharedFolder\\ErsaShare\\IHRACAT",
).trim();
const ARCHIVE_SYNC_TOKEN = String(process.env.ARIX_ARCHIVE_SYNC_TOKEN ?? "").trim();
const PDF_BROWSER_EXECUTABLE = String(
  process.env.ARIX_PDF_BROWSER_PATH ?? process.env.ARIX_EDGE_PATH ?? "",
).trim();
let resolvedPdfBrowserExecutable = "";
const execFileAsync = promisify(execFile);
const DB_PATH = join(DATA_DIR, "db.json");
const SQLITE_PATH = join(DATA_DIR, "arix.sqlite");
const CREDENTIAL_KEY_PATH = join(DATA_DIR, "payment-credentials.key");
const PORT = Number(process.env.API_PORT ?? 8787);
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID ?? "").trim();
const COMPANY_JOIN_CODE = String(process.env.ARIX_COMPANY_JOIN_CODE ?? "").trim().toUpperCase();
const AUTH_REQUIRED = process.env.ARIX_AUTH_REQUIRED === "1" || Boolean(GOOGLE_CLIENT_ID);
const VAPID_PUBLIC_KEY = String(process.env.ARIX_VAPID_PUBLIC_KEY ?? "").trim();
const VAPID_PRIVATE_KEY = String(process.env.ARIX_VAPID_PRIVATE_KEY ?? "").trim();
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webPush.setVapidDetails("mailto:info@arix.az", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const SESSION_COOKIE = "arix_session";
const SESSION_TTL_MS = Math.max(24 * 60 * 60 * 1000, Number(process.env.ARIX_SESSION_TTL_HOURS ?? 720) * 60 * 60 * 1000);
const SESSION_SHORT_TTL_MS = 12 * 60 * 60 * 1000;
const SMTP_HOST = String(process.env.ARIX_SMTP_HOST ?? "").trim();
const SMTP_PORT = Number(process.env.ARIX_SMTP_PORT ?? 587);
const SMTP_SECURE = process.env.ARIX_SMTP_SECURE === "1";
const SMTP_USER = String(process.env.ARIX_SMTP_USER ?? "").trim();
const SMTP_PASS = String(process.env.ARIX_SMTP_PASS ?? "");
const SMTP_FROM = String(process.env.ARIX_SMTP_FROM ?? SMTP_USER).trim();
const googleAuthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const mailTransport = SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM
  ? nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;
const mailRateLimits = new Map();
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...String(process.env.ARIX_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean),
]);
const stateStore = createSQLiteStateStore({ dataDir: DATA_DIR, jsonPath: DB_PATH, sqlitePath: SQLITE_PATH });

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
  companyName: "ERSAFOLYO MİMARLIK DEKORASYON SAN. TİC. LTD. ŞTİ.",
  brandSubtitle: "MEHMET AKİF MH. BAHARİYE CD. NO:161",
  addressLine: "KÜÇÜKÇEKMECE - İSTANBUL - 340000",
  phone: "05332315488",
  email: "info@ersafolyo.com",
  website: "ersafolyo.com",
  taxOffice: "HALKALI",
  taxNumber: "3680541461",
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

function normalizeSalesRepresentativeName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  const lookup = name.toLocaleLowerCase("tr");
  if (lookup.includes("serkan")) return "Serkan Şeremet";
  if (lookup.includes("mustafa")) return "Mustafa Yazman";
  return name;
}

function salesRepresentativeArchiveFolder(value) {
  const normalized = normalizeSalesRepresentativeName(value).toLocaleLowerCase("tr");
  if (normalized.includes("serkan")) return "Serkan";
  if (normalized.includes("mustafa")) return "Mustafa";
  return safeWindowsPathSegment(value);
}

function normalizedCustomerKey(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("tr")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
}

function exportCustomerFolder(value) {
  const key = normalizedCustomerKey(value);
  if (key.includes("RADIL EMIN")) return "ENDECOR";
  if (key.includes("HERIVA KITCHEN")) return "HERIVA KITCHEN";
  if (key.includes("MDOOR KAPAK")) return "MADOR KAPAK";
  if (key.includes("DIKEY")) return "OSCAR COMPANY";
  if (key.includes("SALEH BELED HABANA")) return "HABAN";
  if (key.includes("OZKAN COMPANY")) return "OZKAN KAPAK COMPANY";
  return safeWindowsPathSegment(value);
}

function findOrderCustomerByName(customers, value) {
  const requested = String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
  if (!requested) return undefined;
  const exact = (customers ?? []).find(
    (customer) => String(customer?.name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr") === requested,
  );
  if (exact) return exact;
  const prefixMatches = (customers ?? []).filter((customer) => {
    const candidate = String(customer?.name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
    return candidate.startsWith(`${requested} `) || requested.startsWith(`${candidate} `);
  });
  return prefixMatches.length === 1 ? prefixMatches[0] : undefined;
}

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
  if (db.companySettings.printSettings.companyName === "AriX") {
    db.companySettings.printSettings.companyName = defaultPrintSettings.companyName;
  }
  if (["", "Sənəd sistemi"].includes(db.companySettings.printSettings.brandSubtitle ?? "")) {
    db.companySettings.printSettings.brandSubtitle = defaultPrintSettings.brandSubtitle;
  }
  normalizeEDocumentStore(db);
  normalizeAccountingStore(db);
  db.stockContainers ??= [];
  db.stockPallets ??= [];
  db.stockRolls ??= [];
  db.stockReservations ??= [];
  db.stockMovements ??= [];
  db.landedCostAdjustments ??= [];
  db.orderBoard = Array.isArray(db.orderBoard) ? db.orderBoard : [];
  db.orderCatalog = Array.isArray(db.orderCatalog) && db.orderCatalog.length ? db.orderCatalog : structuredClone(defaultOrderCatalog);
  db.orderAliases = Array.isArray(db.orderAliases) && db.orderAliases.length ? db.orderAliases : structuredClone(defaultOrderAliases);
  db.orderCustomers = Array.isArray(db.orderCustomers) ? db.orderCustomers : [];
  db.orderDays = Array.isArray(db.orderDays) ? db.orderDays : [];
  db.orderTrash = Array.isArray(db.orderTrash) ? db.orderTrash : [];
  db.orderStockMovements = Array.isArray(db.orderStockMovements) ? db.orderStockMovements : [];
  db.pushSubscriptions = Array.isArray(db.pushSubscriptions) ? db.pushSubscriptions : [];
  for (const customer of db.orderCustomers) {
    customer.salesRepresentative = normalizeSalesRepresentativeName(customer.salesRepresentative);
    customer.salesRepresentativeUserId = String(customer.salesRepresentativeUserId ?? "").trim();
    if (customer.customerType === "foreign") {
      customer.salesRepresentative = "Ekrem Tiryaki";
      customer.salesRepresentativeUserId = "";
      customer.folderName = exportCustomerFolder(customer.name);
    }
    if (customer.customerType === "foreign" && customer.priceLists && typeof customer.priceLists === "object") {
      const depot = customer.priceLists.DEPO ?? customer.prices ?? {};
      const antrepo = customer.priceLists.ANTREPO ?? {};
      const transit = customer.priceLists.TRANSIT ?? {};
      const combined = customer.priceLists.ANTREPO_TRANSIT ?? { ...transit, ...antrepo };
      customer.priceLists = { DEPO: depot, ANTREPO_TRANSIT: combined };
      customer.prices = depot;
    }
  }
  for (const order of db.orderBoard) {
    compactUnchangedAutomaticRollovers(order);
    if (!order.businessDate) {
      const createdAt = new Date(order.createdAt || Date.now());
      order.businessDate = Number.isNaN(createdAt.getTime()) ? orderDayKey() : orderDayKey(createdAt);
    }
    if (order.approvalForm) {
      order.approvalForm.salesRepresentative = normalizeSalesRepresentativeName(order.approvalForm.salesRepresentative);
      order.approvalForm.salesRepresentativeUserId = String(order.approvalForm.salesRepresentativeUserId ?? "").trim();
      delete order.approvalForm.priceFactor;
    }
  }
  for (const parent of db.orderBoard) {
    const children = db.orderBoard.filter((item) => String(item.parentOrderId || "") === String(parent.id));
    if (children.length && (!parent.items || parent.items.length === 0)) {
      parent.status = "fulfilled";
      for (const child of children) {
        if (child.status === "preparing" && child.items?.every((item) => Number(item.preparedQuantity) > 0)) child.status = "ready";
      }
    }
  }
  db.customerPrices ??= [];
  db.trash = Array.isArray(db.trash) ? db.trash : [];
  db.authUsers = Array.isArray(db.authUsers) && db.authUsers.length
    ? db.authUsers.map((user) => ({ ...user, active: user.inviteCodeHash ? user.active === true : user.active !== false, companyId: user.companyId || "ersa-folyo", googleSubject: user.googleSubject || null }))
    : structuredClone(defaultAuthUsers);
  db.permissionMigrations ??= {};
  if (!db.permissionMigrations.salesApprovalSeparated) {
    const affectedUserIds = new Set();
    for (const user of db.authUsers) {
      if (!["satış", "satis", "sales"].includes(normalizedRole(user.role))) continue;
      if (!Array.isArray(user.permissions) || !user.permissions.includes("order_forms.approve")) continue;
      user.permissions = user.permissions.filter((permission) => permission !== "order_forms.approve");
      affectedUserIds.add(String(user.id));
    }
    if (affectedUserIds.size) {
      db.authSessions = (Array.isArray(db.authSessions) ? db.authSessions : [])
        .filter((session) => !affectedUserIds.has(String(session.userId)));
    }
    db.permissionMigrations.salesApprovalSeparated = new Date().toISOString();
  }
  if (!db.permissionMigrations.salesManagerApprovalRestored) {
    const affectedUserIds = new Set();
    for (const user of db.authUsers) {
      if (normalizedRole(user.role) !== "satış rəhbəri") continue;
      user.permissions = [...new Set([...(Array.isArray(user.permissions) ? user.permissions : ROLE_PERMISSIONS["satış rəhbəri"]), "order_forms.approve"])];
      affectedUserIds.add(String(user.id));
    }
    if (affectedUserIds.size) {
      db.authSessions = (Array.isArray(db.authSessions) ? db.authSessions : [])
        .filter((session) => !affectedUserIds.has(String(session.userId)));
    }
    db.permissionMigrations.salesManagerApprovalRestored = new Date().toISOString();
  }
  db.authSessions = (Array.isArray(db.authSessions) ? db.authSessions : [])
    .filter((session) => new Date(session.expiresAt).getTime() > Date.now());
  db.companyJoinCode = String(db.companyJoinCode || COMPANY_JOIN_CODE || createInviteCode()).trim().toUpperCase();
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
  return stateStore.initialize(seedDb, normalizeDb);
}

async function readDb() {
  return stateStore.read();
}

async function writeDb(db) {
  return stateStore.write(db);
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

function secureTokenMatches(candidate, expected) {
  const left = Buffer.from(String(candidate ?? ""));
  const right = Buffer.from(String(expected ?? ""));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function archiveSyncAuthorized(req) {
  return Boolean(ARCHIVE_SYNC_TOKEN) && secureTokenMatches(req.headers["x-arix-sync-token"], ARCHIVE_SYNC_TOKEN);
}

function isExportApprovalDocument(form) {
  return ["proforma", "commercial_invoice", "packing_list"].includes(String(form?.documentType ?? ""));
}

function archiveRelativePath(order) {
  const archive = order?.approvalForm?.archive;
  if (!archive?.path) return "";
  const isExport = isExportApprovalDocument(order.approvalForm);
  const root = resolve(isExport ? EXPORT_ARCHIVE_ROOT : ORDER_ARCHIVE_ROOT);
  const rawPath = String(archive.path);
  const file = resolve(rawPath);
  const child = relative(root, file);
  if (child && !child.startsWith("..") && resolve(root, child) === file) {
    return child.split(/[\\/]+/).filter(Boolean).join("/");
  }
  const normalized = rawPath.replaceAll("\\", "/");
  const section = isExport ? "IHRACAT" : "YURT İÇİ";
  const marker = `/${section}/`;
  const markerIndex = normalized.toLocaleUpperCase("tr").indexOf(marker.toLocaleUpperCase("tr"));
  if (markerIndex < 0) return "";
  const legacyChild = normalized.slice(markerIndex + marker.length).split("/").filter(Boolean).join("/");
  if (!legacyChild || legacyChild.split("/").some((part) => part === ".." || part === ".")) return "";
  return legacyChild;
}

function archiveStoredOnServer(order) {
  const archive = order?.approvalForm?.archive;
  if (!archive?.path) return false;
  const root = resolve(isExportApprovalDocument(order.approvalForm) ? EXPORT_ARCHIVE_ROOT : ORDER_ARCHIVE_ROOT);
  const file = resolve(String(archive.path));
  const child = relative(root, file);
  return Boolean(child && !child.startsWith("..") && resolve(root, child) === file);
}

function pathIsWithin(rootPath, filePath) {
  const root = resolve(rootPath);
  const file = resolve(filePath);
  const child = relative(root, file);
  return child === "" || (!child.startsWith("..") && resolve(root, child) === file);
}

function archiveWindowsPath(order, relativePath) {
  const root = isExportApprovalDocument(order.approvalForm)
    ? "\\\\ERSARIF\\SharedFolder\\ErsaShare\\IHRACAT"
    : "\\\\ERSARIF\\SharedFolder\\ErsaShare\\YURT İÇİ";
  return `${root}\\${relativePath.replaceAll("/", "\\")}`;
}

async function handleArchiveSync(req, res, parts) {
  if (!archiveSyncAuthorized(req)) return send(res, 401, { error: "Senkronizasyon anahtarı geçersiz." });
  const db = await readDb();
  const orderId = String(parts[1] ?? "");

  if (req.method === "GET" && parts[0] === "pending") {
    const data = (db.orderBoard ?? []).flatMap((order) => {
      const archive = order.approvalForm?.archive;
      const relativePath = archiveRelativePath(order);
      if (!archive || !relativePath) return [];
      const needsUpload = !archiveStoredOnServer(order);
      if (!needsUpload && archive.localSync?.archivedAt === archive.archivedAt) return [];
      return [{
        orderId: order.id,
        orderNumber: order.number,
        formNumber: order.approvalForm.number,
        archivedAt: archive.archivedAt,
        filename: archive.filename,
        archiveKind: isExportApprovalDocument(order.approvalForm) ? "export" : "domestic",
        relativePath,
        windowsPath: archive.windowsPath || archiveWindowsPath(order, relativePath),
        needsUpload,
      }];
    });
    return send(res, 200, { data });
  }

  const order = (db.orderBoard ?? []).find((item) => String(item.id) === orderId);
  if (!order) return notFound(res);
  const archive = order.approvalForm?.archive;
  const relativePath = archiveRelativePath(order);
  if (!archive || !relativePath) return send(res, 404, { error: "Senkronize edilecek PDF bulunamadı." });

  if (req.method === "POST" && parts[0] === "upload") {
    const body = await parseBody(req, 16_000_000);
    if (String(body.archivedAt ?? "") !== String(archive.archivedAt)) {
      return send(res, 409, { error: "PDF bu sırada değişti; güncel sürüm yeniden aktarılmalı." });
    }
    let pdf;
    try {
      pdf = Buffer.from(String(body.pdfBase64 ?? ""), "base64");
    } catch {
      return send(res, 400, { error: "PDF verisi çözülemedi." });
    }
    if (pdf.length < 100 || pdf.length > 10_000_000 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return send(res, 400, { error: "Yüklenen dosya geçerli bir PDF değil." });
    }
    const root = resolve(isExportApprovalDocument(order.approvalForm) ? EXPORT_ARCHIVE_ROOT : ORDER_ARCHIVE_ROOT);
    const destination = resolve(root, ...relativePath.split("/"));
    const destinationChild = relative(root, destination);
    if (!destinationChild || destinationChild.startsWith("..")) return send(res, 403, { error: "Arşiv hedefi geçersiz." });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(temporary, pdf, { flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      return send(res, 503, { error: `Eski PDF sunucu arşivine alınamadı: ${error.message}` });
    }
    const windowsPath = archiveWindowsPath(order, relativePath);
    archive.path = destination;
    archive.relativePath = relativePath;
    archive.windowsPath = windowsPath;
    archive.localSync = {
      archivedAt: archive.archivedAt,
      syncedAt: new Date().toISOString(),
      computer: String(body.computer ?? "").slice(0, 120),
      path: windowsPath,
    };
    await writeDb(db);
    return send(res, 200, { ok: true, data: archive.localSync });
  }

  if (req.method === "GET" && parts[0] === "file") {
    try {
      const pdf = await readFile(resolve(String(archive.path)));
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": pdf.length,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archive.filename)}`,
        "cache-control": "private, max-age=300",
      });
      return res.end(pdf);
    } catch (error) {
      return send(res, error?.code === "ENOENT" ? 404 : 503, { error: "Arşiv PDF dosyası okunamadı." });
    }
  }

  if (req.method === "POST" && parts[0] === "acknowledge") {
    const body = await parseBody(req);
    if (String(body.archivedAt ?? "") !== String(archive.archivedAt)) {
      return send(res, 409, { error: "PDF bu sırada değişti; güncel sürüm yeniden aktarılacak." });
    }
    archive.localSync = {
      archivedAt: archive.archivedAt,
      syncedAt: new Date().toISOString(),
      computer: String(body.computer ?? "").slice(0, 120),
      path: String(body.path ?? "").slice(0, 1000),
    };
    await writeDb(db);
    return send(res, 200, { ok: true, data: archive.localSync });
  }

  return notFound(res);
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

const turkishMonthNames = [
  "", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function safeWindowsPathSegment(value) {
  const segment = String(value ?? "").trim();
  if (!segment || segment === "." || segment === ".." || /[<>:"/\\|?*\u0000-\u001f]/.test(segment)) return "";
  return segment.replace(/[. ]+$/g, "").slice(0, 120);
}

function orderArchiveDateParts(date = new Date()) {
  return {
    year: String(date.getFullYear()),
    month: turkishMonthNames[date.getMonth() + 1],
    display: `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`,
  };
}

async function renderOrderApprovalPdf(html) {
  const source = String(html ?? "");
  if (!source || source.length > 5_000_000) throw new Error("PDF HTML məlumatı etibarsızdır.");
  if (/<\s*(script|iframe|object|embed|link)\b/i.test(source) || /\son[a-z]+\s*=/i.test(source)) {
    throw new Error("PDF HTML məlumatında icazəsiz element var.");
  }
  const jobDirectory = await mkdtemp(join(DATA_DIR, "approval-render-"));
  const htmlPath = join(jobDirectory, "approval.html");
  const pdfPath = join(jobDirectory, "approval.pdf");
  try {
    await writeFile(htmlPath, source, "utf8");
    const browserExecutable = await findPdfBrowserExecutable();
    const browserArguments = [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run",
      "--no-pdf-header-footer",
      `--user-data-dir=${join(jobDirectory, "profile")}`,
      `--print-to-pdf=${pdfPath}`,
      new URL(`file:///${htmlPath.replace(/\\/g, "/")}`).href,
    ];
    if (process.platform === "linux") browserArguments.unshift("--no-sandbox", "--disable-dev-shm-usage");
    await execFileAsync(browserExecutable, browserArguments, { windowsHide: true, timeout: 45_000, maxBuffer: 2_000_000 });
    const pdf = await readFile(pdfPath);
    if (!pdf.length || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("PDF tarayıcısı geçerli bir dosya oluşturamadı.");
    return pdf;
  } finally {
    await rm(jobDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function findPdfBrowserExecutable() {
  if (resolvedPdfBrowserExecutable) return resolvedPdfBrowserExecutable;
  const platformCandidates = process.platform === "win32"
    ? [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      ]
    : process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
      : [
          "/usr/bin/google-chrome-stable",
          "/usr/bin/google-chrome",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
        ];
  const candidates = [...new Set([PDF_BROWSER_EXECUTABLE, ...platformCandidates].filter(Boolean))];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      resolvedPdfBrowserExecutable = candidate;
      return candidate;
    } catch {
      // Try the next supported browser location.
    }
  }
  throw new Error(`PDF tarayıcısı bulunamadı. ARIX_PDF_BROWSER_PATH ayarını yapın. Denenen yollar: ${candidates.join(", ")}`);
}

async function handleDocumentEmail(req, res) {
  if (req.method !== "POST") return notFound(res);
  if (!mailTransport) {
    return send(res, 503, { error: "E-poçt göndərişi konfiqurasiya edilməyib. ARIX_SMTP_HOST, ARIX_SMTP_USER, ARIX_SMTP_PASS və ARIX_SMTP_FROM ayarlarını əlavə edin." });
  }
  const rateKey = String(req.authUser?.id ?? req.socket.remoteAddress ?? "anonymous");
  const now = Date.now();
  const recent = (mailRateLimits.get(rateKey) ?? []).filter((sentAt) => now - sentAt < 60_000);
  if (recent.length >= 10) return send(res, 429, { error: "Bir dəqiqədə ən çox 10 sənəd göndərilə bilər." });
  const body = await parseBody(req, 16_000_000);
  const to = String(body.to ?? "").trim();
  const subject = String(body.subject ?? "AriX sənədi").replace(/[\r\n]+/g, " ").trim().slice(0, 180);
  const filename = String(body.filename ?? "arix-document.pdf").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  const pdfBase64 = String(body.pdfBase64 ?? "").replace(/^data:application\/pdf;base64,/, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return send(res, 400, { error: "Düzgün alıcı e-poçtu daxil edin." });
  if (!pdfBase64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(pdfBase64)) return send(res, 400, { error: "PDF əlavəsi etibarsızdır." });
  const attachment = Buffer.from(pdfBase64, "base64");
  if (attachment.length === 0 || attachment.length > 10_000_000) return send(res, 413, { error: "PDF əlavəsi 10 MB-dan kiçik olmalıdır." });
  if (attachment.subarray(0, 5).toString("ascii") !== "%PDF-") return send(res, 400, { error: "Əlavə PDF formatında deyil." });
  try {
    await mailTransport.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text: "Sənəd AriX Panel üzərindən göndərildi.",
      attachments: [{ filename, content: attachment, contentType: "application/pdf" }],
    });
  } catch (error) {
    console.error("Document email delivery failed", error);
    return send(res, 502, { error: "E-poçt serveri sənədi göndərə bilmədi. SMTP ayarlarını yoxlayın." });
  }
  recent.push(now);
  mailRateLimits.set(rateKey, recent);
  return send(res, 200, { ok: true });
}

const PERMISSION_CATALOG = [
  { key: "dashboard.view", group: "dashboard", action: "view" },
  { key: "products.view", group: "products", action: "view" },
  { key: "products.manage", group: "products", action: "manage" },
  { key: "stock.adjust", group: "products", action: "stock_adjust" },
  { key: "stock.writeoff", group: "products", action: "stock_writeoff" },
  { key: "stock.transfer", group: "products", action: "stock_transfer" },
  { key: "stock.purchase", group: "products", action: "stock_purchase" },
  { key: "stock.loan_purchase", group: "products", action: "stock_loan_purchase" },
  { key: "orders.view", group: "orders", action: "view" },
  { key: "orders.view_all", group: "orders", action: "view_all" },
  { key: "orders.create", group: "orders", action: "create" },
  { key: "orders.edit", group: "orders", action: "edit" },
  { key: "orders.prepare", group: "orders", action: "prepare" },
  { key: "orders.rollback", group: "orders", action: "rollback" },
  { key: "orders.despatch", group: "orders", action: "despatch" },
  { key: "orders.deliver", group: "orders", action: "deliver" },
  { key: "orders.delete", group: "orders", action: "delete" },
  { key: "orders.days.view", group: "orders", action: "days_view" },
  { key: "orders.days.manage", group: "orders", action: "days_manage" },
  { key: "orders.audit.view", group: "orders", action: "audit_view" },
  { key: "documents.view", group: "documents", action: "view" },
  { key: "documents.create", group: "documents", action: "create" },
  { key: "documents.edit", group: "documents", action: "edit" },
  { key: "documents.delete", group: "documents", action: "delete" },
  { key: "order_forms.view", group: "order_forms", action: "view" },
  { key: "order_forms.view_all", group: "order_forms", action: "view_all" },
  { key: "order_forms.edit", group: "order_forms", action: "edit" },
  { key: "order_forms.approve", group: "order_forms", action: "approve" },
  { key: "money.view", group: "money", action: "view" },
  { key: "money.manage", group: "money", action: "manage" },
  { key: "counterparties.view", group: "counterparties", action: "view" },
  { key: "counterparties.manage", group: "counterparties", action: "manage" },
  { key: "company.view", group: "company", action: "view" },
  { key: "company.manage", group: "company", action: "manage" },
  { key: "employees.manage", group: "employees", action: "manage" },
  { key: "accounting.view", group: "accounting", action: "view" },
  { key: "accounting.manage", group: "accounting", action: "manage" },
  { key: "reports.view", group: "reports", action: "view" },
  { key: "trash.manage", group: "trash", action: "manage" },
];
const ALL_PERMISSIONS = PERMISSION_CATALOG.map((item) => item.key);
const ROLE_PERMISSIONS = {
  "sahib": ALL_PERMISSIONS,
  "admin": ALL_PERMISSIONS,
  "administrator": ALL_PERMISSIONS,
  "rəhbər": ALL_PERMISSIONS,
  "satış rəhbəri": ["dashboard.view", "products.view", "orders.view", "orders.view_all", "orders.create", "orders.edit", "orders.despatch", "documents.view", "documents.create", "documents.edit", "order_forms.view", "order_forms.view_all", "order_forms.edit", "order_forms.approve", "money.view", "counterparties.view", "counterparties.manage", "reports.view"],
  "satış": ["dashboard.view", "products.view", "orders.view", "orders.create", "orders.edit", "orders.despatch", "documents.view", "documents.create", "documents.edit", "order_forms.view", "order_forms.edit", "counterparties.view", "counterparties.manage", "reports.view"],
  "anbar əməliyyatları": ["dashboard.view", "products.view", "products.manage", "orders.view", "orders.view_all", "orders.edit", "orders.prepare", "documents.view", "documents.create", "documents.edit", "reports.view"],
  "təhvilat": ["dashboard.view", "products.view", "orders.view", "orders.view_all", "orders.deliver", "documents.view"],
  "maliyyə": ["dashboard.view", "products.view", "documents.view", "money.view", "money.manage", "counterparties.view", "company.view", "accounting.view", "accounting.manage", "reports.view"],
  "əməkdaş": ["dashboard.view", "products.view", "orders.view", "documents.view", "counterparties.view"],
};

function normalizedRole(role) {
  return String(role ?? "əməkdaş").trim().toLocaleLowerCase("az");
}

function orderWorkflowRole(user) {
  const role = normalizedRole(user?.role);
  if (role === "sahib") return "owner";
  if (["satış", "satış rəhbəri", "satis", "sales"].includes(role)) return "sales";
  if (["anbar əməliyyatları", "anbar", "anbardar", "depo", "depo görevlisi", "warehouse"].includes(role)) return "warehouse";
  if (["təhvilat", "çatdırılma", "teslimat", "delivery"].includes(role)) return "delivery";
  return "viewer";
}

function effectivePermissions(user) {
  if (!user) return AUTH_REQUIRED ? [] : ALL_PERMISSIONS;
  const role = normalizedRole(user.role);
  if (role === "sahib") return ALL_PERMISSIONS;
  const source = Array.isArray(user.permissions) ? user.permissions : (ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS["əməkdaş"]);
  return [...new Set(source.filter((permission) => ALL_PERMISSIONS.includes(permission)))];
}

function hasPermission(user, permission) {
  return effectivePermissions(user).includes(permission);
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
    permissions: effectivePermissions(user),
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
    permissions: effectivePermissions(user),
    notificationPreferences: user.notificationPreferences ?? { inApp: true, push: true, events: {} },
  };
}

function notificationAllowed(user, type, channel = "inApp") {
  const preferences = user?.notificationPreferences ?? {};
  return preferences[channel] !== false && preferences.events?.[type] !== false;
}

function addOrderNotification(db, { order, recipient, type, title, message, actor }) {
  if (order?.isTest || !recipient || recipient.active === false || String(recipient.id) === String(actor?.id || "")) return;
  db.orderNotifications ??= [];
  if (notificationAllowed(recipient, type, "inApp")) {
    const existing = db.orderNotifications.find((item) => !item.readAt && item.orderId === order.id && item.type === type && item.recipientUserId === recipient.id);
    const value = { id: existing?.id || randomUUID(), orderId: order.id, formNumber: order.approvalForm?.number || "", recipientUserId: recipient.id, recipientName: recipient.name, type, title, message, createdAt: new Date().toISOString(), createdBy: actor?.name || "AriX" };
    if (existing) Object.assign(existing, value); else db.orderNotifications.push(value);
  }
  if (VAPID_PUBLIC_KEY && notificationAllowed(recipient, type, "push")) {
    const payload = JSON.stringify({ title, body: message, orderId: order.id, type, url: "/" });
    for (const item of (db.pushSubscriptions || []).filter((entry) => entry.userId === recipient.id)) {
      void webPush.sendNotification(item.subscription, payload).catch(() => {});
    }
  }
}

function notifyUsers(db, order, users, type, title, message, actor) {
  for (const recipient of [...new Map(users.filter(Boolean).map((user) => [user.id, user])).values()]) addOrderNotification(db, { order, recipient, type, title, message, actor });
}

function addDayCloseNotification(db, { recipient, date, title, message, actor }) {
  if (!recipient || recipient.active === false) return;
  const type = "day_closed";
  const createdAt = new Date().toISOString();
  db.orderNotifications ??= [];
  if (notificationAllowed(recipient, type, "inApp")) {
    const existing = db.orderNotifications.find((item) =>
      !item.readAt && item.type === type && item.dayKey === date && item.recipientUserId === recipient.id,
    );
    const value = {
      id: existing?.id || randomUUID(), orderId: "", formNumber: "", dayKey: date,
      recipientUserId: recipient.id, recipientName: recipient.name, type, title, message,
      createdAt, createdBy: actor?.name || "AriX",
    };
    if (existing) Object.assign(existing, value); else db.orderNotifications.push(value);
  }
  if (VAPID_PUBLIC_KEY && notificationAllowed(recipient, type, "push")) {
    const payload = JSON.stringify({ title, body: message, type, dayKey: date, url: `/?day=${date}` });
    for (const item of (db.pushSubscriptions || []).filter((entry) => entry.userId === recipient.id)) {
      void webPush.sendNotification(item.subscription, payload, { TTL: 86_400, urgency: "high" }).catch(() => {});
    }
  }
}

function sendDayCloseNotifications(db, { date, nextDate, actor, automatic, orders }) {
  const delivered = orders.filter((order) => order.status === "delivered");
  const carried = orders.filter((order) => !["delivered", "fulfilled", "cancelled"].includes(order.status));
  const ready = carried.filter((order) => order.status === "ready");
  const waiting = carried.filter((order) => order.status !== "ready");
  const metrics = delivered.reduce((total, order) => {
    for (const item of order.items || []) {
      const quantity = Math.max(0, Number(item.preparedQuantity ?? item.quantity) || 0);
      const allowance = Math.max(0, Number(item.cutAllowanceMeters) || 0);
      const hasCutAllowance = item.cutAllowanceApplied === true || Number(item.cutPieceCount) > 0 || allowance > 0;
      if (hasCutAllowance) {
        total.pieces += Math.max(1, Number(item.cutPieceCount) || 0);
        total.pieceMeters += quantity;
      } else {
        total.rolls += Math.max(0, Number(item.preparedRollCount) || 0);
        total.fullMeters += quantity;
      }
      total.allowance += allowance;
      total.totalMeters += quantity + allowance;
    }
    return total;
  }, { rolls: 0, pieces: 0, fullMeters: 0, pieceMeters: 0, allowance: 0, totalMeters: 0 });
  const format = (value) => Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
  const dateLabel = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long" }).format(new Date(`${date}T12:00:00Z`));
  const nextLabel = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long" }).format(new Date(`${nextDate}T12:00:00Z`));
  const title = automatic ? `${dateLabel} iş günü otomatik kapatıldı` : `${dateLabel} iş günü kapatıldı`;
  const actorLabel = automatic ? "Sistem tarafından otomatik kapatıldı" : `${actor.name} tarafından kapatıldı`;

  for (const recipient of db.authUsers.filter((user) => user.active !== false)) {
    const role = orderWorkflowRole(recipient);
    let message = "";
    if (role === "owner") {
      message = `${actorLabel}. ${delivered.length} sipariş teslim edildi; ${ready.length} hazır, ${waiting.length} hazırlanmamış sipariş ${nextLabel} gününe devredildi. Teslim toplamı: ${format(metrics.rolls)} rulo, ${format(metrics.totalMeters)} mt.`;
    } else if (role === "warehouse" || hasPermission(recipient, "orders.prepare")) {
      message = `${actorLabel}. ${nextLabel} gününe ${ready.length} hazır ve ${waiting.length} hazırlanmayı bekleyen sipariş devredildi.`;
    } else if (role === "delivery" || hasPermission(recipient, "orders.deliver")) {
      message = `${actorLabel}. ${ready.length} hazır sipariş teslim edilmeden ${nextLabel} gününe devredildi.`;
    } else {
      const relevant = orders.filter((order) => orderActivityRecipients(db, order).some((user) => String(user.id) === String(recipient.id)));
      if (!relevant.length) continue;
      const ownDelivered = relevant.filter((order) => order.status === "delivered").length;
      const ownCarried = relevant.filter((order) => !["delivered", "fulfilled", "cancelled"].includes(order.status)).length;
      message = `${actorLabel}. Müşterilerinizden ${ownDelivered} sipariş teslim edildi, ${ownCarried} sipariş ${nextLabel} gününe devredildi.`;
    }
    addDayCloseNotification(db, { recipient, date, title, message, actor });
  }
}

function orderActivityRecipients(db, order) {
  const customer = (db.orderCustomers || []).find(
    (item) =>
      String(item.name || "").trim().toLocaleLowerCase("tr") ===
      String(order.customerName || "").trim().toLocaleLowerCase("tr"),
  );
  const ids = new Set(
    [
      order.createdByUserId,
      order.approvalForm?.salesRepresentativeUserId,
      customer?.salesRepresentativeUserId,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const names = new Set(
    [
      order.createdBy,
      order.approvalForm?.salesRepresentative,
      customer?.salesRepresentative,
    ]
      .map((value) => normalizeSalesRepresentativeName(value || ""))
      .filter(Boolean),
  );
  return db.authUsers.filter(
    (user) =>
      orderWorkflowRole(user) === "owner" ||
      ids.has(String(user.id)) ||
      names.has(normalizeSalesRepresentativeName(user.name || "")),
  );
}

function backfillTodayDeliveredNotifications(db, date = orderDayKey()) {
  let created = 0;
  for (const order of db.orderBoard || []) {
    if (order.status !== "delivered" || !order.deliveredAt) continue;
    const deliveryDate = order.businessDate || orderDayKey(new Date(order.deliveredAt));
    if (deliveryDate !== date) continue;
    const deliveredBy = String(order.deliveredBy || "Teslimat ekibi").trim();
    const actor = (db.authUsers || []).find(
      (user) =>
        normalizeSalesRepresentativeName(user.name || "") ===
        normalizeSalesRepresentativeName(deliveredBy),
    );
    for (const recipient of orderActivityRecipients(db, order)) {
      if (actor && String(recipient.id) === String(actor.id)) continue;
      const exists = (db.orderNotifications || []).some(
        (item) =>
          item.orderId === order.id &&
          item.type === "order_delivered" &&
          String(item.recipientUserId || "") === String(recipient.id),
      );
      if (exists) continue;
      addOrderNotification(db, {
        order,
        recipient,
        type: "order_delivered",
        title: "Sipariş teslim edildi",
        message: `${deliveredBy} tarafından teslim edildi · ${order.number} · ${order.customerName}`,
        actor,
      });
      created += 1;
    }
  }
  return created;
}

async function broadcastNotification(db, { title, message, type, actor }) {
  db.orderNotifications ??= [];
  db.pushSubscriptions ??= [];
  const recipients = db.authUsers.filter((user) => user.active !== false && user.companyId === actor.companyId);
  let pushed = 0;
  const invalidEndpoints = new Set();
  for (const recipient of recipients) {
    if (notificationAllowed(recipient, type, "inApp")) {
      db.orderNotifications.push({ id: randomUUID(), orderId: "", formNumber: "", recipientUserId: recipient.id, recipientName: recipient.name, type, title, message, createdAt: new Date().toISOString(), createdBy: actor.name || "AriX" });
    }
    if (!VAPID_PUBLIC_KEY || !notificationAllowed(recipient, type, "push")) continue;
    const payload = JSON.stringify({ title, body: message, type, url: "/" });
    for (const item of db.pushSubscriptions.filter((entry) => entry.userId === recipient.id)) {
      try {
        await webPush.sendNotification(item.subscription, payload, { TTL: 86_400, urgency: "high" });
        pushed += 1;
      } catch (error) {
        if ([404, 410].includes(error?.statusCode)) invalidEndpoints.add(item.endpoint);
      }
    }
  }
  if (invalidEndpoints.size) db.pushSubscriptions = db.pushSubscriptions.filter((entry) => !invalidEndpoints.has(entry.endpoint));
  return { recipients: recipients.length, pushed };
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
  return hasPermission(user, "employees.manage");
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
  const maxAge = Number.isFinite(maxAgeSeconds) ? `; Max-Age=${maxAgeSeconds}` : "";
  res.setHeader("set-cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${maxAge}${secure}`);
}

function createSession(req, db, user, remember = false) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const ttl = remember ? SESSION_TTL_MS : SESSION_SHORT_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl);
  db.authSessions = db.authSessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now());
  db.authSessions.push({
    id: randomUUID(),
    userId: user.id,
    tokenHash: sessionHash(token),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ip: String(req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "").split(",")[0].trim(),
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300),
  });
  const userSessions = db.authSessions.filter((session) => String(session.userId) === String(user.id));
  if (userSessions.length > 10) {
    const keep = new Set(userSessions.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))).slice(0, 10).map((session) => session.id));
    db.authSessions = db.authSessions.filter((session) => String(session.userId) !== String(user.id) || keep.has(session.id));
  }
  return { token, expiresAt, ttl, remember };
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
    const session = createSession(req, db, user, body.remember === true);
    await writeDb(db);
    setSessionCookie(req, res, session.token, session.remember ? Math.floor(session.ttl / 1000) : null);
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
    if (!db.companyJoinCode || companyCode !== db.companyJoinCode) return send(res, 403, { error: "Dəvət kodu yanlışdır." });
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
      if (!db.companyJoinCode || String(body.companyCode).trim().toUpperCase() !== db.companyJoinCode) return send(res, 403, { error: "Dəvət kodu yanlışdır." });
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
      return send(res, 403, { error: "Hesabınız yoxdur. Dəvət kodunu daxil edərək qeydiyyat istəyin.", registrationRequired: true });
    }
    if (user.googleSubject && String(user.googleSubject) !== String(payload.sub)) {
      return send(res, 409, { error: "Bu əməkdaş kartı başqa Google hesabına bağlıdır." });
    }

    user.googleSubject = String(payload.sub);
    user.picture = String(payload.picture ?? user.picture ?? "");
    user.lastLoginAt = new Date().toISOString();
    const session = createSession(req, db, user, body.remember === true);
    await writeDb(db);
    setSessionCookie(req, res, session.token, session.remember ? Math.floor(session.ttl / 1000) : null);
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
    const session = createSession(req, db, user, body.remember === true);
    await writeDb(db);
    setSessionCookie(req, res, session.token, session.remember ? Math.floor(session.ttl / 1000) : null);
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

  if (req.method === "GET" && id === "permission-catalog") {
    return send(res, 200, { data: PERMISSION_CATALOG, roleDefaults: ROLE_PERMISSIONS });
  }

  if (req.method === "GET" && id === "join-code") {
    if (String(req.authUser.role).toLocaleLowerCase("az") !== "sahib") return send(res, 403, { error: "Şirkət kodunu yalnız sahib görə bilər." });
    return send(res, 200, { data: { configured: Boolean(db.companyJoinCode), code: db.companyJoinCode } });
  }

  if (req.method === "PUT" && id === "join-code") {
    if (String(req.authUser.role).toLocaleLowerCase("az") !== "sahib") return send(res, 403, { error: "Dəvət kodunu yalnız sahib dəyişə bilər." });
    const body = await parseBody(req);
    const code = body.generate === true ? createInviteCode() : String(body.code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{8,24}$/.test(code)) return send(res, 400, { error: "Dəvət kodu 8-24 hərf və rəqəmdən ibarət olmalıdır." });
    db.companyJoinCode = code;
    await writeDb(db);
    return send(res, 200, { data: { configured: true, code } });
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
      permissions: ROLE_PERMISSIONS[normalizedRole(role)] ?? ROLE_PERMISSIONS["əməkdaş"],
      companyId: req.authUser.companyId, googleSubject: null,
      inviteCodeHash: null,
      invitedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    };
    setPassword(employee, temporaryPassword, true);
    db.authUsers.push(employee);
    await writeDb(db);
    return send(res, 201, { data: publicEmployee(employee), inviteCode: "", temporaryPassword });
  }

  if (req.method === "PATCH" && id) {
    const employee = db.authUsers.find((user) => String(user.id) === id && user.companyId === req.authUser.companyId);
    if (!employee) return send(res, 404, { error: "Əməkdaş tapılmadı." });
    const body = await parseBody(req);
    if (String(employee.role).toLocaleLowerCase("az") === "sahib" && String(req.authUser.role).toLocaleLowerCase("az") !== "sahib") return send(res, 403, { error: "Sahib hesabını yalnız sahib dəyişə bilər." });
    const name = String(body.name ?? employee.name).trim();
    const email = String(body.email ?? employee.email).trim().toLocaleLowerCase("en-US");
    if (!name || !email.includes("@")) return send(res, 400, { error: "Ad və düzgün e-poçt məcburidir." });
    if (db.authUsers.some((user) => user !== employee && String(user.email).trim().toLocaleLowerCase("en-US") === email)) return send(res, 409, { error: "Bu e-poçt başqa əməkdaşda istifadə olunur." });
    employee.name = name;
    employee.email = email;
    employee.phone = String(body.phone ?? employee.phone ?? "").trim();
    employee.role = String(body.role ?? employee.role).trim() || "Əməkdaş";
    if (body.notificationPreferences && typeof body.notificationPreferences === "object") {
      employee.notificationPreferences = {
        inApp: body.notificationPreferences.inApp !== false,
        push: body.notificationPreferences.push !== false,
        events: Object.fromEntries(Object.entries(body.notificationPreferences.events || {}).map(([key, value]) => [String(key), value !== false])),
      };
    }
    if (Array.isArray(body.permissions)) {
      employee.permissions = [...new Set(body.permissions.filter((permission) => ALL_PERMISSIONS.includes(permission)))];
    } else if (!Array.isArray(employee.permissions) && body.role !== undefined) {
      employee.permissions = ROLE_PERMISSIONS[normalizedRole(employee.role)] ?? ROLE_PERMISSIONS["əməkdaş"];
    }
    employee.active = body.active === undefined ? employee.active !== false : body.active === true;
    let temporaryPassword = "";
    if (body.resetPassword === true) {
      temporaryPassword = createTemporaryPassword();
      setPassword(employee, temporaryPassword, true);
      db.authSessions = db.authSessions.filter((session) => String(session.userId) !== String(employee.id));
    }
    if (employee.active === false) db.authSessions = db.authSessions.filter((session) => String(session.userId) !== String(employee.id));
    await writeDb(db);
    return send(res, 200, { data: publicEmployee(employee), temporaryPassword });
  }

  if (req.method === "DELETE" && id) {
    const employee = db.authUsers.find((user) => String(user.id) === id && user.companyId === req.authUser.companyId);
    if (!employee) return send(res, 404, { error: "Əməkdaş tapılmadı." });
    if (String(employee.id) === String(req.authUser.id)) return send(res, 400, { error: "Hazırda daxil olduğunuz hesabı silə bilməzsiniz." });
    if (String(employee.role).toLocaleLowerCase("az") === "sahib") {
      const owners = db.authUsers.filter((user) => user.companyId === employee.companyId && String(user.role).toLocaleLowerCase("az") === "sahib");
      if (owners.length <= 1) return send(res, 400, { error: "Şirkətin son sahib hesabı silinə bilməz." });
      if (String(req.authUser.role).toLocaleLowerCase("az") !== "sahib") return send(res, 403, { error: "Sahib hesabını yalnız sahib silə bilər." });
    }
    db.authUsers = db.authUsers.filter((user) => user !== employee);
    db.authSessions = db.authSessions.filter((session) => String(session.userId) !== String(employee.id));
    await writeDb(db);
    return send(res, 200, { ok: true });
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

  if (req.method === "GET" && parts[1] === "catalog" && parts.length === 2) {
    return send(res, 200, { data: db.orderCatalog.filter((item) => item.active !== false) });
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

function orderDayKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function nextOrderDayKey(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function isEffectiveClosedOrderDay(record) {
  if (!record?.closed) return false;
  if (!record.closedAt) return true;
  return orderDayKey(new Date(record.closedAt)) >= String(record.date || "");
}

function activeOrderDayKey(db) {
  let date = orderDayKey();
  for (let index = 0; index < 370; index += 1) {
    const record = db.orderDays.find((item) => item.date === date);
    if (!isEffectiveClosedOrderDay(record)) return date;
    date = nextOrderDayKey(date);
  }
  return date;
}

function orderRolloverSnapshot(order) {
  return {
    customerName: order.customerName,
    note: order.note,
    status: order.status,
    items: structuredClone(Array.isArray(order.items) ? order.items : []),
    originalItems: structuredClone(Array.isArray(order.originalItems) ? order.originalItems : []),
    createdBy: order.createdBy,
    preparedBy: order.preparedBy,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    readyAt: order.readyAt,
    history: structuredClone(Array.isArray(order.history) ? order.history : []),
    audit: structuredClone(Array.isArray(order.audit) ? order.audit : []),
    despatchReady: order.despatchReady,
    despatchNumber: order.despatchNumber,
    withoutDespatch: order.withoutDespatch,
    despatchReadyAt: order.despatchReadyAt,
    despatchReadyBy: order.despatchReadyBy,
    deliveryNote: order.deliveryNote,
    deliveredAt: order.deliveredAt,
    deliveredBy: order.deliveredBy,
    approvalForm: order.approvalForm ? structuredClone(order.approvalForm) : undefined,
  };
}

function rolloverContentFingerprint(value) {
  const snapshot = value?.snapshot ? structuredClone(value.snapshot) : orderRolloverSnapshot(value || {});
  delete snapshot.updatedAt;
  return JSON.stringify(snapshot);
}

function compactUnchangedAutomaticRollovers(order) {
  const history = Array.isArray(order.rolloverHistory) ? order.rolloverHistory : [];
  if (history.length < 2) return;
  const compacted = [];
  for (const entry of history) {
    const previous = compacted[compacted.length - 1];
    const isAutomaticContinuation = previous
      && previous.toDate === entry.fromDate
      && String(entry.by || "").toLocaleLowerCase("tr").includes("otomatik")
      && rolloverContentFingerprint(previous) === rolloverContentFingerprint(entry);
    if (isAutomaticContinuation) {
      previous.toDate = entry.toDate;
      previous.compactedAutomaticDates = [...(previous.compactedAutomaticDates || []), entry.fromDate];
      continue;
    }
    compacted.push(entry);
  }
  order.rolloverHistory = compacted;
}

function closeOrderDay(db, date, actor, { automatic = false, now = new Date(), actorUser = null } = {}) {
  const closedAt = now.toISOString();
  let record = db.orderDays.find((item) => item.date === date);
  if (!record) {
    record = { date };
    db.orderDays.push(record);
  }
  if (record.closed) return { record, carried: 0 };

  let nextDate = nextOrderDayKey(date);
  while (db.orderDays.some((item) => item.date === nextDate && isEffectiveClosedOrderDay(item))) {
    nextDate = nextOrderDayKey(nextDate);
  }
  const dayOrders = db.orderBoard.filter((order) => order.businessDate === date);
  let carried = 0;
  for (const order of db.orderBoard) {
    if (order.businessDate !== date || ["delivered", "fulfilled", "cancelled"].includes(order.status)) continue;
    order.rolloverHistory ??= [];
    const previousRollover = order.rolloverHistory[order.rolloverHistory.length - 1];
    const unchangedAutomaticContinuation = automatic
      && previousRollover?.toDate === date
      && rolloverContentFingerprint(previousRollover) === rolloverContentFingerprint(order);
    if (unchangedAutomaticContinuation) {
      previousRollover.toDate = nextDate;
      previousRollover.compactedAutomaticDates = [...(previousRollover.compactedAutomaticDates || []), date];
    } else if (!order.rolloverHistory.some((entry) => entry.fromDate === date)) {
      order.rolloverHistory.push({
        fromDate: date,
        toDate: nextDate,
        at: closedAt,
        by: actor,
        snapshot: orderRolloverSnapshot(order),
      });
    }
    order.businessDate = nextDate;
    order.updatedAt = closedAt;
    carried += 1;
  }

  record.closed = true;
  record.closedAt = closedAt;
  record.closedBy = actor;
  record.updatedAt = closedAt;
  record.updatedBy = actor;
  record.automatic = automatic;
  record.carriedCount = carried;
  record.carriedToDate = nextDate;
  sendDayCloseNotifications(db, {
    date,
    nextDate,
    actor: actorUser || { id: "system", name: actor },
    automatic,
    orders: dayOrders,
  });
  return { record, carried };
}

async function closeExpiredOrderDays() {
  return queueOrderMutation(async () => {
    const db = await readDb();
    const today = orderDayKey();
    const dates = new Set(
      db.orderBoard
        .map((order) => String(order.businessDate || ""))
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today),
    );
    for (const day of db.orderDays) {
      if (!day.closed && day.date < today) dates.add(day.date);
    }
    const yesterday = new Date(`${today}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    dates.add(yesterday.toISOString().slice(0, 10));
    let changed = false;
    for (const date of [...dates].sort()) {
      const existing = db.orderDays.find((item) => item.date === date);
      if (existing?.closed) continue;
      closeOrderDay(db, date, "Otomatik gün kapanışı", { automatic: true });
      changed = true;
    }
    if (changed) await writeDb(db);
  });
}

const orderEditorPresence = new Map();
let orderMutationQueue = Promise.resolve();

function queueOrderMutation(task) {
  const run = orderMutationQueue.then(task, task);
  orderMutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

function touchOrderEditor(orderId, user, active = true) {
  const key = String(orderId);
  const current = orderEditorPresence.get(key) || new Map();
  if (active) {
    current.set(String(user?.id || user?.name || "unknown"), { id: user?.id, name: user?.name || "Əməkdaş", at: Date.now() });
    orderEditorPresence.set(key, current);
  } else {
    current.delete(String(user?.id || user?.name || "unknown"));
    if (!current.size) orderEditorPresence.delete(key);
  }
}

function activeOrderEditors(orderId) {
  const current = orderEditorPresence.get(String(orderId));
  if (!current) return [];
  const cutoff = Date.now() - 45_000;
  for (const [key, editor] of current) {
    if (editor.at < cutoff) current.delete(key);
  }
  if (!current.size) orderEditorPresence.delete(String(orderId));
  return [...current.values()].map(({ id, name }) => ({ id, name }));
}

function orderWithPresence(order, user) {
  const result = { ...order, activeEditors: activeOrderEditors(order.id) };
  const isOwner = normalizedRole(user?.role) === "sahib";
  if (String(result.deliveryPhoto || "").startsWith("data:image/")) {
    result.deliveryPhoto = `/api/orders/delivery-photos/${order.id}`;
  }
  if (!isOwner && !hasPermission(user, "orders.audit.view")) delete result.audit;
  if (!isOwner && !hasPermission(user, "documents.view")) {
    if (hasPermission(user, "orders.deliver")) {
      result.attachments = (result.attachments || []).filter((attachment) => attachment.kind === "deliveryProof");
    } else delete result.attachments;
  }
  if (!isOwner && !hasPermission(user, "order_forms.view")) {
    delete result.approvalForm;
  } else if (!isOwner && result.approvalForm && !hasPermission(user, "order_forms.view_all")) {
    const actorId = String(user?.id || "");
    const actorName = normalizeSalesRepresentativeName(user?.name || "");
    const assignedId = String(result.approvalForm.salesRepresentativeUserId || "");
    const assignedName = normalizeSalesRepresentativeName(result.approvalForm.salesRepresentative || "");
    if (assignedId ? assignedId !== actorId : assignedName !== actorName) delete result.approvalForm;
  }
  return result;
}

async function latestTcmbRate(currency, beforeDate) {
  if (currency === "TRY") return { currency, rate: 1, date: beforeDate };
  const cursor = new Date(`${beforeDate}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const day = String(cursor.getUTCDate()).padStart(2, "0");
    const source = `https://www.tcmb.gov.tr/kurlar/${year}${month}/${day}${month}${year}.xml`;
    try {
      const response = await fetch(source, { headers: { accept: "application/xml" }, signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const xml = await response.text();
        const block = xml.match(new RegExp(`<Currency[^>]+CurrencyCode=["']${currency}["'][\\s\\S]*?<\\/Currency>`));
        const selling = block?.[0].match(/<BanknoteSelling>([^<]+)<\/BanknoteSelling>/)?.[1];
        const rate = Number(selling);
        if (Number.isFinite(rate) && rate > 0) return { currency, rate, date: `${year}-${month}-${day}`, source: "TCMB Efektif Satış" };
      }
    } catch {
      // Holidays and temporary TCMB failures fall through to the previous publication day.
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  throw new Error("TCMB-də son yayımlanan məzənnə tapılmadı.");
}

async function handleOrderBoard(req, res, url, parts) {
  const db = await readDb();
  db.orderNotifications ??= [];
  const id = String(parts[1] ?? "");
  const workflowRole = orderWorkflowRole(req.authUser);
  const canSell = workflowRole === "owner" || hasPermission(req.authUser, "orders.create") || hasPermission(req.authUser, "order_forms.edit");
  const canPrepare = workflowRole === "owner" || workflowRole === "warehouse" || hasPermission(req.authUser, "orders.prepare");
  const canDeliver = workflowRole === "owner" || hasPermission(req.authUser, "orders.deliver");

  if (req.method === "GET" && parts[1] === "print-settings") {
    const settings = db.companySettings?.printSettings ?? defaultPrintSettings;
    return send(res, 200, { data: {
      companyName: settings.companyName,
      brandSubtitle: settings.brandSubtitle,
      addressLine: settings.addressLine,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      taxOffice: settings.taxOffice,
      taxNumber: settings.taxNumber,
      companyLogo: settings.companyLogo,
      companyStamp: settings.companyStamp,
    } });
  }

  if (req.method === "GET" && parts[1] === "push-config") return send(res, 200, { data: { publicKey: VAPID_PUBLIC_KEY } });

  if (req.method === "POST" && parts[1] === "push-subscriptions") {
    const body = await parseBody(req);
    const endpoint = String(body.subscription?.endpoint || "").trim();
    if (!endpoint || !body.subscription?.keys) return send(res, 400, { error: "Bildirim aboneliği geçersizdir." });
    db.pushSubscriptions = (db.pushSubscriptions || []).filter((item) => item.endpoint !== endpoint);
    db.pushSubscriptions.push({ id: randomUUID(), endpoint, userId: req.authUser.id, subscription: body.subscription, createdAt: new Date().toISOString() });
    await writeDb(db);
    return send(res, 201, { data: { enabled: true } });
  }

  if (req.method === "POST" && parts[1] === "push-test") {
    const subscriptions = (db.pushSubscriptions || []).filter((item) => item.userId === req.authUser.id);
    let delivered = 0;
    for (const item of subscriptions) {
      try {
        await webPush.sendNotification(item.subscription, JSON.stringify({ title: "AriX bildirim testi", body: "Bu cihaz bildirim almaya hazır.", type: "test", url: "/" }));
        delivered += 1;
      } catch (error) {
        if ([404, 410].includes(error?.statusCode)) db.pushSubscriptions = db.pushSubscriptions.filter((entry) => entry.endpoint !== item.endpoint);
      }
    }
    await writeDb(db);
    return send(res, 200, { data: { delivered } });
  }

  if (req.method === "POST" && parts[1] === "notifications" && parts[2] === "broadcast") {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "employees.manage")) {
      return send(res, 403, { error: "Toplu bildirim göndermek için kullanıcı yönetimi yetkisi gerekir." });
    }
    const body = await parseBody(req);
    const isTest = body.test === true;
    const title = String(isTest ? "AriX test bildirimi" : body.title || "").trim().slice(0, 100);
    const announcement = String(isTest ? "Bildirim sistemi çalışıyor." : body.message || "").trim().slice(0, 500);
    if (!title || !announcement) return send(res, 400, { error: "Bildirim başlığı ve mesajı zorunludur." });
    const message = `${announcement} · Gönderen: ${req.authUser?.name || "AriX"}`;
    const result = await broadcastNotification(db, { title, message, type: isTest ? "broadcast_test" : "announcement", actor: req.authUser });
    await writeDb(db);
    return send(res, 201, { data: result });
  }

  if (req.method === "GET" && parts[1] === "notifications" && parts[2] === "history") {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "employees.manage")) {
      return send(res, 403, { error: "Bildirim geçmişini görmek için kullanıcı yönetimi yetkisi gerekir." });
    }
    const groups = new Map();
    for (const item of [...(db.orderNotifications || [])]
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, 1000)) {
      const timestamp = new Date(item.createdAt || 0).getTime();
      const timeBucket = Number.isFinite(timestamp) ? Math.floor(timestamp / 10_000) : 0;
      const key = [item.type, item.title, item.message, item.createdBy, item.orderId, item.dayKey, timeBucket].join("|");
      let group = groups.get(key);
      if (!group) {
        group = {
          id: item.id,
          type: item.type,
          title: item.title,
          message: item.message,
          createdAt: item.createdAt,
          createdBy: item.createdBy || "AriX",
          orderId: item.orderId || "",
          dayKey: item.dayKey || "",
          recipients: [],
          readCount: 0,
        };
        groups.set(key, group);
      }
      if (item.recipientName && !group.recipients.includes(item.recipientName)) group.recipients.push(item.recipientName);
      if (item.readAt) group.readCount += 1;
      if (String(item.createdAt) > String(group.createdAt)) group.createdAt = item.createdAt;
    }
    const data = [...groups.values()]
      .map((group) => ({ ...group, recipients: group.recipients.sort((left, right) => left.localeCompare(right, "tr")) }))
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, 100);
    return send(res, 200, { data });
  }

  if (req.method === "GET" && parts[1] === "notifications") {
    const actorId = String(req.authUser?.id || "");
    const actorName = normalizeSalesRepresentativeName(req.authUser?.name || "");
    const data = db.orderNotifications
      .filter((item) => String(item.recipientUserId || "") === actorId || normalizeSalesRepresentativeName(item.recipientName || "") === actorName)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, 50);
    return send(res, 200, { data });
  }

  if (req.method === "PATCH" && parts[1] === "notifications" && parts[2]) {
    const notification = db.orderNotifications.find((item) => String(item.id) === String(parts[2]));
    if (!notification) return notFound(res);
    const actorId = String(req.authUser?.id || "");
    const actorName = normalizeSalesRepresentativeName(req.authUser?.name || "");
    if (String(notification.recipientUserId || "") !== actorId && normalizeSalesRepresentativeName(notification.recipientName || "") !== actorName) return notFound(res);
    notification.readAt = new Date().toISOString();
    await writeDb(db);
    return send(res, 200, { data: notification });
  }

  if (req.method === "POST" && parts[1] === "notifications" && parts[2] === "read-all") {
    const actorId = String(req.authUser?.id || "");
    const actorName = normalizeSalesRepresentativeName(req.authUser?.name || "");
    const readAt = new Date().toISOString();
    let updated = 0;
    for (const notification of db.orderNotifications) {
      const belongsToActor = String(notification.recipientUserId || "") === actorId || normalizeSalesRepresentativeName(notification.recipientName || "") === actorName;
      if (belongsToActor && !notification.readAt) {
        notification.readAt = readAt;
        updated += 1;
      }
    }
    await writeDb(db);
    return send(res, 200, { data: { updated, readAt } });
  }

  if (req.method === "GET" && parts[1] === "exchange-rate") {
    const currency = String(url.searchParams.get("currency") || "USD").toUpperCase();
    if (!["TRY", "USD", "EUR"].includes(currency)) return send(res, 400, { error: "Dəstəklənməyən valyuta." });
    const requestedDate = String(url.searchParams.get("date") || new Date().toISOString().slice(0, 10));
    try { return send(res, 200, { data: await latestTcmbRate(currency, requestedDate) }); }
    catch (cause) { return send(res, 503, { error: cause instanceof Error ? cause.message : "TCMB məzənnəsi alınmadı." }); }
  }

  if (["GET", "HEAD"].includes(req.method) && parts[1] === "attachments" && parts[2]) {
    const attachmentId = String(parts[2]);
    const orders = [...(db.orderBoard || []), ...(db.orderTrash || [])];
    const attachment = orders.flatMap((order) => order.attachments || []).find((item) => String(item.id) === attachmentId);
    if (!attachment?.storageName) return notFound(res);
    if (attachment.deletedAt && normalizedRole(req.authUser?.role) !== "sahib") return notFound(res);
    try {
      const file = await readFile(join(ORDER_UPLOAD_DIR, attachment.storageName));
      const commonHeaders = {
        "content-type": attachment.mimeType || "application/octet-stream",
        "content-disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(attachment.name || "document")}`,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
        "accept-ranges": "bytes",
        etag: `"${attachment.id}-${file.length}"`,
      };
      const range = String(req.headers.range || "").match(/^bytes=(\d*)-(\d*)$/);
      if (range) {
        const requestedStart = range[1] ? Number(range[1]) : null;
        const requestedEnd = range[2] ? Number(range[2]) : null;
        const start = requestedStart ?? Math.max(0, file.length - (requestedEnd || file.length));
        const end = Math.min(file.length - 1, requestedStart === null ? file.length - 1 : (requestedEnd ?? file.length - 1));
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= file.length) {
          res.writeHead(416, { ...commonHeaders, "content-range": `bytes */${file.length}` });
          res.end();
          return;
        }
        const chunk = file.subarray(start, end + 1);
        res.writeHead(206, { ...commonHeaders, "content-length": chunk.length, "content-range": `bytes ${start}-${end}/${file.length}` });
        res.end(req.method === "HEAD" ? undefined : chunk);
        return;
      }
      res.writeHead(200, { ...commonHeaders, "content-length": file.length });
      res.end(req.method === "HEAD" ? undefined : file);
      return;
    } catch {
      return notFound(res);
    }
  }

  if (req.method === "GET" && parts[1] === "delivery-photos" && parts[2]) {
    const orderId = String(parts[2]);
    const order = [...(db.orderBoard || []), ...(db.orderTrash || [])].find((item) => String(item.id) === orderId);
    if (!order?.deliveryPhoto) return notFound(res);
    try {
      if (order.deliveryPhotoStorageName) {
        const file = await readFile(join(ORDER_UPLOAD_DIR, order.deliveryPhotoStorageName));
        res.writeHead(200, { "content-type": order.deliveryPhotoMimeType || "image/jpeg", "content-length": file.length, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" });
        res.end(file);
        return;
      }
      const match = String(order.deliveryPhoto).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return notFound(res);
      const file = Buffer.from(match[2], "base64");
      res.writeHead(200, { "content-type": match[1], "content-length": file.length, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" });
      res.end(file);
      return;
    } catch {
      return notFound(res);
    }
  }

  if (parts[1] === "day") {
    if (normalizedRole(req.authUser?.role) !== "sahib" && !hasPermission(req.authUser, req.method === "GET" ? "orders.days.view" : "orders.days.manage")) {
      return send(res, 403, { error: "Gün arxivinə baxmaq üçün icazəniz yoxdur." });
    }
    const date = String(url.searchParams.get("date") || orderDayKey()).trim();
    const existing = db.orderDays.find((item) => item.date === date);
    if (req.method === "GET") return send(res, 200, { data: existing ? { ...existing, closed: isEffectiveClosedOrderDay(existing) } : { date, closed: false } });
    if (req.method === "POST") {
      if (normalizedRole(req.authUser?.role) !== "sahib" && !hasPermission(req.authUser, "orders.days.manage")) return send(res, 403, { error: "Günü açıb bağlamaq üçün icazəniz yoxdur." });
      const body = await parseBody(req);
      const closed = body.closed === true;
      const now = new Date().toISOString();
      if (date > orderDayKey(new Date(now))) return send(res, 400, { error: "Gelecekteki bir iş günü kapatılamaz." });
      const actor = req.authUser?.name ?? "Sahib";
      let record = existing || { date };
      if (closed) {
        record = closeOrderDay(db, date, actor, { now: new Date(now), actorUser: req.authUser }).record;
      } else {
        record.closed = false;
        record.updatedAt = now;
        record.updatedBy = actor;
        record.openedAt = now;
        record.openedBy = actor;
        if (!existing) db.orderDays.push(record);
      }
      await writeDb(db);
      return send(res, 200, { data: record });
    }
    return notFound(res);
  }

  if (parts[1] === "trash") {
    if (normalizedRole(req.authUser?.role) !== "sahib" && !hasPermission(req.authUser, "trash.manage")) return send(res, 403, { error: "Silinən sifarişləri idarə etmək üçün icazəniz yoxdur." });
    db.orderTrash ??= [];
    const trashId = String(parts[2] ?? "");
    if (req.method === "GET" && !trashId) {
      return send(res, 200, { data: [...db.orderTrash].sort((left, right) => String(right.deletedAt).localeCompare(String(left.deletedAt))).map((order) => orderWithPresence(order, req.authUser)) });
    }
    if (req.method === "POST" && trashId && parts[3] === "restore") {
      const index = db.orderTrash.findIndex((item) => String(item.id) === trashId);
      if (index < 0) return notFound(res);
      const [order] = db.orderTrash.splice(index, 1);
      delete order.deletedAt;
      delete order.deletedBy;
      order.updatedAt = new Date().toISOString();
      order.audit ??= [];
      order.audit.push({ id: randomUUID(), action: "restored", by: req.authUser?.name ?? "Sahib", userId: req.authUser?.id, at: order.updatedAt });
      db.orderBoard.push(order);
      await writeDb(db);
      return send(res, 200, { data: orderWithPresence(order, req.authUser) });
    }
    if (req.method === "DELETE" && trashId) {
      const before = db.orderTrash.length;
      db.orderTrash = db.orderTrash.filter((item) => String(item.id) !== trashId);
      if (db.orderTrash.length === before) return notFound(res);
      await writeDb(db);
      return send(res, 200, { ok: true });
    }
    return notFound(res);
  }

  if (req.method === "GET" && parts[1] === "catalog" && parts[2] && parts[3] === "stock-history") {
    const productId = Number(parts[2]);
    const product = db.orderCatalog.find((item) => Number(item.id) === productId);
    if (!product) return notFound(res);
    db.stockTransactions ??= [];
    return send(res, 200, { data: db.stockTransactions.filter((item) => Number(item.productId) === productId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
  }

  if (req.method === "GET" && parts[1] === "catalog") {
    const reservedByProduct = new Map();
    for (const order of db.orderBoard.filter((item) => !item.deletedAt && ["new", "preparing", "ready"].includes(item.status))) {
      for (const item of (Array.isArray(order.items) ? order.items : [])) {
        const productId = Number(item.productId);
        if (!productId) continue;
        const allowance = normalizeOrderCutAllowance(item);
        reservedByProduct.set(productId, (reservedByProduct.get(productId) ?? 0) + allowance.stockConsumptionQuantity);
      }
    }
    return send(res, 200, { data: db.orderCatalog.map((product) => {
      const physicalQuantity = Number.isFinite(Number(product.physicalQuantity)) ? Number(product.physicalQuantity) : 0;
      const reservedQuantity = reservedByProduct.get(Number(product.id)) ?? 0;
      return { ...product, physicalQuantity, reservedQuantity, availableQuantity: physicalQuantity - reservedQuantity, rollCount: Math.max(0, Number(product.rollCount) || 0) };
    }) });
  }

  if (req.method === "POST" && parts[1] === "catalog" && parts[2] && parts[3] === "stock-transaction") {
    const productId = Number(parts[2]);
    const product = db.orderCatalog.find((item) => Number(item.id) === productId);
    if (!product) return notFound(res);
    const body = await parseBody(req, 3_000_000);
    const type = String(body.type || "");
    const permissionByType = {
      adjustment: "stock.adjust",
      writeoff: "stock.writeoff",
      transfer: "stock.transfer",
      purchase: "stock.purchase",
      loan_purchase: "stock.loan_purchase",
    };
    const requiredPermission = permissionByType[type];
    if (!requiredPermission) return send(res, 400, { error: "Geçersiz stok işlem türü." });
    if (workflowRole !== "owner" && !hasPermission(req.authUser, requiredPermission)) return send(res, 403, { error: "Bu stok işlemi için yetkiniz yok." });
    const quantity = Math.abs(Number(body.quantity));
    const rollCount = Math.abs(Math.trunc(Number(body.rollCount || 0)));
    if (type !== "transfer" && (!Number.isFinite(quantity) || quantity <= 0)) return send(res, 400, { error: "Geçerli bir metre miktarı girin." });
    if (!String(body.note || "").trim()) return send(res, 400, { error: "İşlem açıklaması zorunludur." });
    if (type === "transfer" && (!String(body.fromLocation || "").trim() || !String(body.toLocation || "").trim())) return send(res, 400, { error: "Çıkış ve hedef konumu zorunludur." });
    const beforeQuantity = Number(product.physicalQuantity || 0);
    const beforeRollCount = Number(product.rollCount || 0);
    const direction = type === "writeoff" ? -1 : type === "transfer" ? 0 : 1;
    const signedQuantity = direction * quantity;
    const signedRollCount = direction * rollCount;
    if (beforeQuantity + signedQuantity < 0 || beforeRollCount + signedRollCount < 0) return send(res, 400, { error: "İşlem stok miktarını sıfırın altına düşürüyor." });
    const now = new Date().toISOString();
    const documentNumber = `STK-${now.slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-6)}`;
    let attachment = null;
    const attachmentMatch = String(body.attachmentData || "").match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
    if (attachmentMatch) {
      const file = Buffer.from(attachmentMatch[2], "base64");
      if (file.length > 2_000_000) return send(res, 413, { error: "Stok evrakı en fazla 2 MB olabilir." });
      await mkdir(STOCK_IMPORT_DIR, { recursive: true });
      const safeName = String(body.attachmentName || "stok-evraki").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
      const archivedFile = `${documentNumber}-${safeName}`;
      await writeFile(join(STOCK_IMPORT_DIR, archivedFile), file);
      attachment = { name: safeName, mimeType: attachmentMatch[1], archivedFile, size: file.length };
    }
    product.physicalQuantity = beforeQuantity + signedQuantity;
    product.rollCount = beforeRollCount + signedRollCount;
    product.stockUpdatedAt = now;
    product.stockUpdatedBy = req.authUser?.name ?? "Kullanıcı";
    db.stockTransactions ??= [];
    const transaction = {
      id: randomUUID(), documentNumber, productId, productCode: product.code || product.sku || "", productName: product.name,
      type, quantity, rollCount, signedQuantity, signedRollCount,
      beforeQuantity, afterQuantity: product.physicalQuantity, beforeRollCount, afterRollCount: product.rollCount,
      fromLocation: String(body.fromLocation || "").trim(), toLocation: String(body.toLocation || "").trim(),
      counterparty: String(body.counterparty || "").trim(), note: String(body.note || "").trim().slice(0, 500),
      loanOutstanding: type === "loan_purchase" ? quantity : 0, attachment,
      createdAt: now, createdBy: req.authUser?.name ?? "Kullanıcı", createdByUserId: req.authUser?.id || "",
    };
    db.stockTransactions.unshift(transaction);
    await writeDb(db);
    return send(res, 201, { data: transaction, product });
  }

  if (req.method === "POST" && parts[1] === "catalog" && parts[2] === "stock-import") {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "products.manage")) return send(res, 403, { error: "Stok içe aktarma yetkiniz yok." });
    const body = await parseBody(req, 2_000_000);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return send(res, 400, { error: "Excel dosyasında stok satırı bulunamadı." });
    const errors = [];
    const updates = [];
    let created = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] ?? {};
      const code = String(row.code ?? row.sku ?? "").trim().toLocaleLowerCase("tr");
      if (!code) {
        errors.push({ row: index + 2, code: "", error: "Ürün kodu boş." });
        continue;
      }
      let product = db.orderCatalog.find((item) => [item.code, item.sku].some((value) => String(value ?? "").trim().toLocaleLowerCase("tr") === code));
      if (!product) {
        const originalCode = String(row.code ?? row.sku ?? "").trim();
        product = {
          id: db.orderCatalog.length ? Math.max(...db.orderCatalog.map((item) => Number(item.id) || 0)) + 1 : 1,
          name: String(row.name ?? originalCode).trim() || originalCode,
          code: originalCode,
          sku: originalCode,
          unit: "mt",
        };
        db.orderCatalog.push(product);
        created += 1;
      }
      const physicalQuantity = Number(row.physicalQuantity);
      const rollCount = Number(row.rollCount ?? 0);
      if (!Number.isFinite(physicalQuantity) || !Number.isFinite(rollCount) || rollCount < 0) {
        errors.push({ row: index + 2, code: row.code, error: "Metraj veya rulo sayısı geçersiz." });
        continue;
      }
      updates.push({ product, physicalQuantity, rollCount: Math.trunc(rollCount) });
    }
    if (errors.length) return send(res, 400, { error: "Excel kontrolünde hata bulundu. Hiçbir stok değiştirilmedi.", details: errors });
    const updatedAt = new Date().toISOString();
    const sourceName = String(body.sourceName || "Stok sayım dosyası.xlsx").replace(/[\\/:*?"<>|]/g, "_").slice(0, 180);
    const sourceDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.sourceDate)) ? String(body.sourceDate) : updatedAt.slice(0, 10);
    let archivedFile = "";
    const fileMatch = String(body.sourceFile || "").match(/^data:application\/(?:vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|octet-stream);base64,([A-Za-z0-9+/=]+)$/);
    if (fileMatch) {
      const file = Buffer.from(fileMatch[1], "base64");
      if (file.length > 1_500_000) return send(res, 413, { error: "Stok sayım dosyası en fazla 1,5 MB olabilir." });
      await mkdir(STOCK_IMPORT_DIR, { recursive: true });
      archivedFile = `${updatedAt.replace(/[:.]/g, "-")}-${sourceName}`;
      await writeFile(join(STOCK_IMPORT_DIR, archivedFile), file);
    }
    for (const update of updates) {
      update.product.physicalQuantity = update.physicalQuantity;
      update.product.rollCount = update.rollCount;
      update.product.stockUpdatedAt = updatedAt;
      update.product.stockUpdatedBy = req.authUser?.name ?? "Sahib";
      update.product.stockSourceDate = sourceDate;
      update.product.stockSourceName = sourceName;
    }
    db.stockImportHistory ??= [];
    const history = { id: randomUUID(), sourceName, sourceDate, archivedFile, importedAt: updatedAt, importedBy: req.authUser?.name ?? "Kullanıcı", updated: updates.length, created };
    db.stockImportHistory.unshift(history);
    db.stockImportHistory = db.stockImportHistory.slice(0, 100);
    await writeDb(db);
    return send(res, 200, { data: { updated: updates.length, created, history } });
  }

  if (req.method === "GET" && parts[1] === "catalog" && parts[2] === "stock-import-history") {
    return send(res, 200, { data: (db.stockImportHistory ?? []).slice(0, 20) });
  }

  if (req.method === "POST" && parts[1] === "catalog") {
    const body = await parseBody(req);
    const mayCreateFromOrder = body.fromOrderMatch === true && hasPermission(req.authUser, "orders.create");
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "products.manage") && !mayCreateFromOrder) return send(res, 403, { error: "Ürün oluşturma yetkiniz yok." });
    const name = String(body.name ?? "").trim();
    const code = String(body.code ?? body.sku ?? "").trim();
    if (!name) return send(res, 400, { error: "Məhsul adı məcburidir." });
    const requestedId = Number(body.id) || null;
    const duplicateCode = code && db.orderCatalog.find((item) =>
      Number(item.id) !== requestedId
      && [item.code, item.sku].some((value) => String(value ?? "").trim().toLocaleLowerCase("tr") === code.toLocaleLowerCase("tr"))
    );
    if (duplicateCode) return send(res, 409, { error: `Bu məhsul kodu artıq istifadə olunur: ${code}` });
    const existingProduct = requestedId ? db.orderCatalog.find((item) => Number(item.id) === requestedId) : null;
    const product = {
      id: requestedId || (db.orderCatalog.length ? Math.max(...db.orderCatalog.map((p) => Number(p.id) || 0)) + 1 : 1),
      name,
      code: code || `ERSA-${String(Date.now()).slice(-4)}`,
      sku: code || `ERSA-${String(Date.now()).slice(-4)}`,
      unit: String(body.unit ?? "mt").trim() || "mt",
      type: "product",
      active: body.active !== false,
      physicalQuantity: Math.max(0, Number(body.physicalQuantity ?? existingProduct?.physicalQuantity) || 0),
      rollCount: Math.max(0, Math.trunc(Number(body.rollCount ?? existingProduct?.rollCount) || 0)),
    };
    const existingIndex = db.orderCatalog.findIndex((p) => p.id === product.id);
    if (existingIndex >= 0) db.orderCatalog[existingIndex] = product;
    else db.orderCatalog.push(product);
    await writeDb(db);
    return send(res, 201, { data: product });
  }

  if (req.method === "DELETE" && parts[1] === "catalog" && parts[2]) {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "products.manage")) return send(res, 403, { error: "Məhsul kataloqunu dəyişmək icazəniz yoxdur." });
    const targetId = Number(parts[2]);
    db.orderCatalog = db.orderCatalog.filter((p) => p.id !== targetId);
    await writeDb(db);
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && parts[1] === "customers") {
    const combined = [
      ...db.orderCustomers,
      ...(db.counterparties || []).map((c) => ({ id: `cp-${c.id}`, name: c.name, phone: c.phone || "", email: c.email || "", address: c.address || "", note: "Panel kontragenti", prices: {} }))
    ];
    const seen = new Set();
    const unique = [];
    for (const item of combined) {
      const key = String(item.name || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return send(res, 200, { data: unique });
  }

  if (req.method === "POST" && parts[1] === "customers" && !parts[2]) {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "counterparties.manage")) return send(res, 403, { error: "Müştəri siyahısını dəyişmək icazəniz yoxdur." });
    const body = await parseBody(req);
    const name = String(body.name ?? "").trim();
    if (!name) return send(res, 400, { error: "Müştəri adı məcburidir." });
    const customer = {
      id: randomUUID(),
      name,
      phone: String(body.phone ?? "").trim(),
      contact: String(body.contact ?? "").trim(),
      salesRepresentative: normalizeSalesRepresentativeName(body.salesRepresentative),
      salesRepresentativeUserId: String(body.salesRepresentativeUserId ?? "").trim(),
      folderName: String(body.folderName ?? "").trim(),
      addressLine1: String(body.addressLine1 ?? "").trim(),
      addressLine2: String(body.addressLine2 ?? "").trim(),
      address: String(body.address ?? [body.addressLine1, body.addressLine2].filter(Boolean).join(" · ") ?? "").trim(),
      email: String(body.email ?? "").trim(),
      note: String(body.note ?? "").trim(),
      prices: {},
      createdAt: new Date().toISOString(),
    };
    db.orderCustomers.push(customer);
    await writeDb(db);
    return send(res, 201, { data: customer });
  }

  if (req.method === "POST" && parts[1] === "customers" && parts[2] === "import") {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "counterparties.manage")) return send(res, 403, { error: "Müştəri məlumatlarını idxal etmək icazəniz yoxdur." });
    const body = await parseBody(req);
    const entries = Array.isArray(body.entries) ? body.entries : [];
    let imported = 0;
    let prices = 0;
    for (const entry of entries) {
      const name = String(entry.name ?? "").trim();
      if (!name) continue;
      const normalizedName = name.toLocaleLowerCase("tr");
      let customer = db.orderCustomers.find((item) => String(item.name ?? "").trim().toLocaleLowerCase("tr") === normalizedName);
      const normalizedPrices = Object.fromEntries(
        Object.entries(entry.prices ?? {})
          .map(([code, price]) => [String(code).trim().toLocaleUpperCase("tr"), Number(price)])
          .filter(([code, price]) => code && Number.isFinite(price) && price >= 0),
      );
      const importedPriceLists = Object.fromEntries(
        Object.entries(entry.priceLists ?? {}).map(([listName, listPrices]) => [
          String(listName).trim().toLocaleUpperCase("tr"),
          Object.fromEntries(
            Object.entries(listPrices && typeof listPrices === "object" ? listPrices : {})
              .map(([code, price]) => [String(code).trim().toLocaleUpperCase("tr"), Number(price)])
              .filter(([code, price]) => code && Number.isFinite(price) && price > 0),
          ),
        ]),
      );
      const normalizedPriceLists = entry.customerType === "foreign"
        ? {
            DEPO: importedPriceLists.DEPO ?? normalizedPrices,
            ANTREPO_TRANSIT: importedPriceLists.ANTREPO_TRANSIT
              ?? { ...(importedPriceLists.TRANSIT ?? {}), ...(importedPriceLists.ANTREPO ?? {}) },
          }
        : importedPriceLists;
      if (!customer) {
        customer = { id: randomUUID(), name, phone: "", note: "Excel aktarımı", prices: {}, createdAt: new Date().toISOString() };
        db.orderCustomers.push(customer);
      }
      customer.contact = String(entry.contact ?? customer.contact ?? "").trim();
      customer.phone = String(entry.phone ?? customer.phone ?? "").trim();
      customer.country = String(entry.country ?? customer.country ?? "").trim();
      customer.customerType = entry.customerType === "foreign" ? "foreign" : (customer.customerType ?? "domestic");
      customer.salesRepresentative = customer.customerType === "foreign"
        ? "Ekrem Tiryaki"
        : normalizeSalesRepresentativeName(entry.salesRepresentative ?? customer.salesRepresentative);
      customer.salesRepresentativeUserId = customer.customerType === "foreign"
        ? ""
        : String(entry.salesRepresentativeUserId ?? customer.salesRepresentativeUserId ?? "").trim();
      customer.folderName = customer.customerType === "foreign"
        ? exportCustomerFolder(name)
        : String(entry.folderName ?? customer.folderName ?? "").trim();
      customer.addressLine1 = String(entry.addressLine1 ?? customer.addressLine1 ?? "").trim();
      customer.addressLine2 = String(entry.addressLine2 ?? customer.addressLine2 ?? "").trim();
      customer.address = String(entry.address ?? customer.address ?? "").trim();
      customer.prices = { ...(customer.prices ?? {}), ...normalizedPrices };
      customer.priceLists = entry.customerType === "foreign"
        ? normalizedPriceLists
        : { ...(customer.priceLists ?? {}), ...normalizedPriceLists };
      customer.updatedAt = new Date().toISOString();
      imported += 1;
      prices += Object.values(normalizedPriceLists).reduce((total, list) => total + Object.keys(list).length, 0)
        || Object.keys(normalizedPrices).length;
    }
    await writeDb(db);
    return send(res, 200, { data: { imported, prices } });
  }

  if (req.method === "PATCH" && parts[1] === "customers" && parts[2]) {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "counterparties.manage")) return send(res, 403, { error: "Müştəri məlumatlarını dəyişmək icazəniz yoxdur." });
    const customer = db.orderCustomers.find((item) => String(item.id) === String(parts[2]));
    if (!customer) return notFound(res);
    const body = await parseBody(req);
    if (body.prices && typeof body.prices === "object") {
      customer.prices = Object.fromEntries(
        Object.entries(body.prices)
          .map(([code, price]) => [String(code).trim().toLocaleUpperCase("tr"), Number(price)])
          .filter(([code, price]) => code && Number.isFinite(price) && price >= 0),
      );
    }
    if (body.priceLists && typeof body.priceLists === "object" && customer.customerType === "foreign") {
      const normalizePriceList = (list) => Object.fromEntries(
        Object.entries(list && typeof list === "object" ? list : {})
          .map(([code, price]) => [String(code).trim().toLocaleUpperCase("tr"), Number(price)])
          .filter(([code, price]) => code && Number.isFinite(price) && price >= 0),
      );
      customer.priceLists = {
        DEPO: normalizePriceList(body.priceLists.DEPO),
        ANTREPO_TRANSIT: normalizePriceList(body.priceLists.ANTREPO_TRANSIT),
      };
      customer.prices = customer.priceLists.DEPO;
    }
    if (Object.hasOwn(body, "contact")) customer.contact = String(body.contact ?? "").trim();
    if (Object.hasOwn(body, "salesRepresentative")) customer.salesRepresentative = normalizeSalesRepresentativeName(body.salesRepresentative);
    if (Object.hasOwn(body, "salesRepresentativeUserId")) customer.salesRepresentativeUserId = String(body.salesRepresentativeUserId ?? "").trim();
    if (Object.hasOwn(body, "folderName")) customer.folderName = customer.customerType === "foreign"
      ? exportCustomerFolder(customer.name)
      : String(body.folderName ?? "").trim();
    if (Object.hasOwn(body, "addressLine1")) customer.addressLine1 = String(body.addressLine1 ?? "").trim();
    if (Object.hasOwn(body, "addressLine2")) customer.addressLine2 = String(body.addressLine2 ?? "").trim();
    if (Object.hasOwn(body, "addressLine1") || Object.hasOwn(body, "addressLine2")) {
      customer.address = [customer.addressLine1, customer.addressLine2].filter(Boolean).join(" · ");
    }
    customer.updatedAt = new Date().toISOString();
    await writeDb(db);
    return send(res, 200, { data: customer });
  }

  if (req.method === "DELETE" && parts[1] === "customers" && parts[2]) {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "counterparties.manage")) return send(res, 403, { error: "Müştəri silmək icazəniz yoxdur." });
    const targetId = String(parts[2]);
    db.orderCustomers = db.orderCustomers.filter((c) => c.id !== targetId);
    await writeDb(db);
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && parts[1] === "aliases") {
    return send(res, 200, { data: db.orderAliases });
  }

  if (req.method === "GET" && parts[1] === "approval-forms") {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "order_forms.view")) {
      return send(res, 403, { error: "Sifariş formalarını görmək üçün icazəniz yoxdur." });
    }
    const canViewAll = workflowRole === "owner" || hasPermission(req.authUser, "order_forms.view_all");
    const actorId = String(req.authUser?.id || "");
    const actorName = normalizeSalesRepresentativeName(req.authUser?.name || "");
    const data = db.orderBoard
      .filter((order) => order.approvalForm && ["ready", "delivered"].includes(order.status))
      .map((order) => {
        const customerName = String(order.approvalForm?.customerName || order.customerName || "").trim().toLocaleLowerCase("tr");
        const customer = (db.orderCustomers || []).find((item) => String(item.name || "").trim().toLocaleLowerCase("tr") === customerName);
        return {
          ...order,
          approvalForm: {
            ...order.approvalForm,
            customerContact: order.approvalForm?.customerContact || customer?.contact || "",
            salesRepresentative: order.approvalForm?.salesRepresentative || customer?.salesRepresentative || "",
            salesRepresentativeUserId: order.approvalForm?.salesRepresentativeUserId || customer?.salesRepresentativeUserId || "",
          },
        };
      })
      .filter((order) => {
        if (canViewAll) return true;
        const assignedId = String(order.approvalForm?.salesRepresentativeUserId || "");
        const assignedName = normalizeSalesRepresentativeName(order.approvalForm?.salesRepresentative || "");
        return assignedId ? assignedId === actorId : Boolean(assignedName && assignedName === actorName);
      })
      .sort((left, right) => String(right.approvalForm?.updatedAt || right.updatedAt || "").localeCompare(String(left.approvalForm?.updatedAt || left.updatedAt || "")));
    return send(res, 200, { data: data.map((order) => orderWithPresence(order, req.authUser)) });
  }

  if (req.method === "POST" && parts[1] === "aliases") {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "company.manage")) return send(res, 403, { error: "Uyğunlaşdırma qaydalarını dəyişmək icazəniz yoxdur." });
    const body = await parseBody(req);
    if (Array.isArray(body.aliases)) {
      const normalizedAliases = body.aliases.map((item) => ({
        trigger: String(item?.trigger ?? "").trim().toLowerCase(),
        replacement: String(item?.replacement ?? "").trim(),
        category: String(item?.category ?? "custom").trim() || "custom",
      }));
      if (normalizedAliases.some((item) => !item.trigger || !item.replacement)) {
        return send(res, 400, { error: "Bütün qısaltmalar və əvəz olunan sözlər doldurulmalıdır." });
      }
      db.orderAliases = normalizedAliases;
    } else {
      const trigger = String(body.trigger ?? "").trim().toLowerCase();
      const replacement = String(body.replacement ?? "").trim();
      if (!trigger || !replacement) return send(res, 400, { error: "Qısaltma və əvəz olunan söz məcburidir." });
      const idx = db.orderAliases.findIndex((a) => a.trigger.toLowerCase() === trigger);
      const entry = { trigger, replacement, category: body.category || "custom" };
      if (idx >= 0) db.orderAliases[idx] = entry;
      else db.orderAliases.push(entry);
    }
    await writeDb(db);
    return send(res, 200, { data: db.orderAliases });
  }

  if (req.method === "DELETE" && parts[1] === "aliases" && parts[2]) {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "company.manage")) return send(res, 403, { error: "Uyğunlaşdırma qaydalarını silmək icazəniz yoxdur." });
    const trigger = decodeURIComponent(parts[2]).trim().toLowerCase();
    db.orderAliases = db.orderAliases.filter((a) => a.trigger.toLowerCase() !== trigger);
    await writeDb(db);
    return send(res, 200, { data: db.orderAliases });
  }

  if (req.method === "GET" && parts.length === 1) {
    const status = String(url.searchParams.get("status") ?? "");
    const canViewAllOrders = workflowRole === "owner" || workflowRole === "warehouse" || hasPermission(req.authUser, "orders.view_all");
    const actorId = String(req.authUser?.id || "");
    const actorName = normalizeSalesRepresentativeName(req.authUser?.name || "");
    const data = db.orderBoard
      .filter((order) => !status || order.status === status)
      .filter((order) => {
        if (canViewAllOrders) return true;
        if (String(order.createdByUserId || "") === actorId) return true;
        if (!order.createdByUserId && normalizeSalesRepresentativeName(order.createdBy || "") === actorName) return true;
        const assignedId = String(order.approvalForm?.salesRepresentativeUserId || "");
        const assignedName = normalizeSalesRepresentativeName(order.approvalForm?.salesRepresentative || "");
        if (assignedId ? assignedId === actorId : Boolean(assignedName && assignedName === actorName)) return true;
        const customer = findOrderCustomerByName(db.orderCustomers, order.customerName);
        const customerRepresentativeId = String(customer?.salesRepresentativeUserId || "");
        const customerRepresentativeName = normalizeSalesRepresentativeName(customer?.salesRepresentative || "");
        return customerRepresentativeId ? customerRepresentativeId === actorId : Boolean(customerRepresentativeName && customerRepresentativeName === actorName);
      })
      .filter((order) => workflowRole !== "delivery" || order.status === "delivered" || (order.status === "ready" && order.despatchReady === true))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return send(res, 200, { data: data.map((order) => orderWithPresence(order, req.authUser)) });
  }

  if (req.method === "GET" && parts[1] === "stock-movements") {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "products.view") && !hasPermission(req.authUser, "orders.audit.view")) {
      return send(res, 403, { error: "Stok hareketlerini görme yetkiniz yok." });
    }
    return send(res, 200, { data: [...db.orderStockMovements].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
  }

  if (req.method === "GET" && parts[1] === "stock-documents") {
    db.stockDocuments ??= [];
    return send(res, 200, { data: [...db.stockDocuments].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
  }

  if (req.method === "GET" && parts[1] === "access-logs") {
    if (normalizedRole(req.authUser?.role) !== "sahib") return send(res, 403, { error: "Erişim geçmişini yalnızca Sahib görebilir." });
    db.orderAccessLogs ??= [];
    return send(res, 200, { data: db.orderAccessLogs.slice(0, 1000) });
  }

  if (req.method === "POST" && parts[1] === "access-log") {
    const body = await parseBody(req);
    const action = ["page_view", "order_view", "app_open"].includes(String(body.action)) ? String(body.action) : "page_view";
    const now = new Date().toISOString();
    const forwarded = String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const remoteAddress = forwarded || String(req.socket.remoteAddress || "");
    const entry = {
      id: randomUUID(), action, page: String(body.page || "").slice(0, 80),
      orderId: String(body.orderId || "").slice(0, 80), orderNumber: String(body.orderNumber || "").slice(0, 80),
      userId: req.authUser?.id || "", userName: req.authUser?.name || "Kullanıcı", role: req.authUser?.role || "",
      ip: remoteAddress, userAgent: String(req.headers["user-agent"] || "").slice(0, 500), createdAt: now,
    };
    db.orderAccessLogs ??= [];
    const latest = db.orderAccessLogs[0];
    const duplicate = latest && latest.userId === entry.userId && latest.action === entry.action && latest.page === entry.page && latest.orderId === entry.orderId && Date.now() - new Date(latest.createdAt).getTime() < 15_000;
    if (!duplicate) db.orderAccessLogs.unshift(entry);
    db.orderAccessLogs = db.orderAccessLogs.slice(0, 5000);
    if (!duplicate) await writeDb(db);
    return send(res, 201, { data: duplicate ? latest : entry });
  }

  if (req.method === "POST" && parts[1] === "stock-documents") {
    const body = await parseBody(req, 8_000_000);
    const type = String(body.type || "");
    const permissionByType = { adjustment: "stock.adjust", writeoff: "stock.writeoff", transfer: "stock.transfer", purchase: "stock.purchase", loan_purchase: "stock.loan_purchase" };
    const requiredPermission = permissionByType[type];
    if (!requiredPermission) return send(res, 400, { error: "Geçersiz stok evrakı türü." });
    if (workflowRole !== "owner" && !hasPermission(req.authUser, requiredPermission)) return send(res, 403, { error: "Bu stok evrakını oluşturma yetkiniz yok." });
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length) return send(res, 400, { error: "Stok evrakına en az bir ürün ekleyin." });
    if (!String(body.note || "").trim()) return send(res, 400, { error: "Evrak açıklaması zorunludur." });
    if (type === "transfer" && (!String(body.fromLocation || "").trim() || !String(body.toLocation || "").trim())) return send(res, 400, { error: "Çıkış ve hedef konumu zorunludur." });
    const normalizedLines = [];
    for (const input of lines) {
      const product = db.orderCatalog.find((item) => Number(item.id) === Number(input.productId));
      if (!product) return send(res, 400, { error: "Evraktaki ürünlerden biri bulunamadı." });
      const quantity = Math.abs(Number(input.quantity || 0));
      const rollCount = Math.abs(Math.trunc(Number(input.rollCount || 0)));
      if (type !== "transfer" && !(quantity > 0 || rollCount > 0)) return send(res, 400, { error: `${product.name} için metre veya rulo girin.` });
      const direction = type === "writeoff" ? -1 : type === "transfer" ? 0 : 1;
      const beforeQuantity = Number(product.physicalQuantity || 0);
      const beforeRollCount = Number(product.rollCount || 0);
      if (beforeQuantity + direction * quantity < 0 || beforeRollCount + direction * rollCount < 0) return send(res, 400, { error: `${product.name} işlemi stoğu sıfırın altına düşürüyor.` });
      normalizedLines.push({ product, quantity, rollCount, direction, beforeQuantity, beforeRollCount });
    }
    const now = new Date().toISOString();
    const documentNumber = `STK-${now.slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-6)}`;
    const attachments = [];
    for (const [index, input] of (Array.isArray(body.attachments) ? body.attachments : []).entries()) {
      const match = String(input?.data || "").match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) continue;
      const file = Buffer.from(match[2], "base64");
      if (file.length > 2_000_000) return send(res, 413, { error: "Her stok evrakı dosyası en fazla 2 MB olabilir." });
      await mkdir(STOCK_IMPORT_DIR, { recursive: true });
      const safeName = String(input?.name || `evrak-${index + 1}`).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
      const archivedFile = `${documentNumber}-${index + 1}-${safeName}`;
      await writeFile(join(STOCK_IMPORT_DIR, archivedFile), file);
      attachments.push({ name: safeName, mimeType: match[1], archivedFile, size: file.length });
    }
    db.stockTransactions ??= [];
    const documentLines = normalizedLines.map(({ product, quantity, rollCount, direction, beforeQuantity, beforeRollCount }) => {
      product.physicalQuantity = beforeQuantity + direction * quantity;
      product.rollCount = beforeRollCount + direction * rollCount;
      product.stockUpdatedAt = now;
      product.stockUpdatedBy = req.authUser?.name ?? "Kullanıcı";
      const line = { productId: product.id, productCode: product.code || product.sku || "", productName: product.name, quantity, rollCount, signedQuantity: direction * quantity, beforeQuantity, afterQuantity: product.physicalQuantity, beforeRollCount, afterRollCount: product.rollCount };
      db.stockTransactions.unshift({ id: randomUUID(), documentNumber, type, ...line, fromLocation: String(body.fromLocation || "").trim(), toLocation: String(body.toLocation || "").trim(), counterparty: String(body.counterparty || "").trim(), note: String(body.note || "").trim(), loanOutstanding: type === "loan_purchase" ? quantity : 0, attachments, createdAt: now, createdBy: req.authUser?.name ?? "Kullanıcı", createdByUserId: req.authUser?.id || "" });
      return line;
    });
    db.stockDocuments ??= [];
    const document = { id: randomUUID(), documentNumber, type, date: String(body.date || now.slice(0, 10)), counterparty: String(body.counterparty || "").trim(), fromLocation: String(body.fromLocation || "").trim(), toLocation: String(body.toLocation || "").trim(), note: String(body.note || "").trim(), lines: documentLines, attachments, createdAt: now, createdBy: req.authUser?.name ?? "Kullanıcı", createdByUserId: req.authUser?.id || "" };
    db.stockDocuments.unshift(document);
    await writeDb(db);
    return send(res, 201, { data: document });
  }

  if (req.method === "POST" && parts[1] === "match") {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "orders.create")) return send(res, 403, { error: "Sifariş mətnini uyğunlaşdırmaq icazəniz yoxdur." });
    const body = await parseBody(req);
    return send(res, 200, { data: parseOrderText(body.text, db.orderCatalog, db.orderAliases) });
  }

  if (req.method === "POST" && parts.length === 1) {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "orders.create")) return send(res, 403, { error: "Yeni sifariş yaratmaq icazəniz yoxdur." });
    const body = await parseBody(req);
    const customerName = String(body.customerName ?? "").trim();
    const items = Array.isArray(body.items) ? body.items : parseOrderText(body.text, db.orderCatalog, db.orderAliases);
    if (!customerName) return send(res, 400, { error: "Müştəri adı məcburidir." });
    if (!items.length) return send(res, 400, { error: "Ən az bir məhsul sətri olmalıdır." });
    if (items.some((item) => !item.productId || (!(Number(item.quantity) > 0) && !(Number(item.orderedRollCount) > 0)))) return send(res, 400, { error: "Bütün məhsullar üçün metr və ya rulo miqdarı təsdiqlənməlidir." });
    const now = new Date().toISOString();
    const changeReason = String(body.reason || "").trim().slice(0, 300);
    const isTest = workflowRole === "owner" && body.isTest === true;
    const customer = findOrderCustomerByName(db.orderCustomers, customerName);
    const isExport = body.isExport === true || customer?.customerType === "foreign";
    const order = {
      id: randomUUID(),
      number: `ORD-${String(Date.now()).slice(-7)}`,
      customerName,
      note: String(body.note ?? "").trim(),
      originalText: String(body.text ?? "").trim(),
      businessDate: activeOrderDayKey(db),
      status: "new",
      isTest,
      isExport,
      items: items.map((item) => ({ ...item, ...normalizeOrderCutAllowance({ ...item, cutAllowanceApplied: false, cutPieceCount: 0, cutAllowancePerPiece: 0 }), preparedQuantity: null })),
      originalItems: items.map((item) => ({ ...item, ...normalizeOrderCutAllowance({ ...item, cutAllowanceApplied: false, cutPieceCount: 0, cutAllowancePerPiece: 0 }), preparedQuantity: null })),
      createdBy: req.authUser?.name ?? "Satışçı",
      createdByUserId: req.authUser?.id ?? null,
      createdAt: now,
      updatedAt: now,
      history: [{ status: "new", at: now, by: req.authUser?.name ?? "Satışçı" }],
      audit: [{ id: randomUUID(), action: "created", by: req.authUser?.name ?? "Satışçı", userId: req.authUser?.id, at: now }],
    };
    db.orderBoard.push(order);
    if (!isTest) notifyUsers(db, order, db.authUsers.filter((user) => orderWorkflowRole(user) === "warehouse" || hasPermission(user, "orders.prepare")), "order_created", "Yeni sipariş", `${req.authUser?.name || "Satış"} tarafından oluşturuldu · ${order.number} · ${order.customerName}`, req.authUser);
    await writeDb(db);
    return send(res, 201, { data: order });
  }

  if (req.method === "POST" && id && parts[2] === "presence") {
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    const body = await parseBody(req);
    touchOrderEditor(id, req.authUser, body.active !== false);
    return send(res, 200, { data: activeOrderEditors(id) });
  }

  if (req.method === "PATCH" && id && parts[2] === "test-mode") {
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    if (workflowRole !== "owner") return send(res, 403, { error: "Test modunu yalnız şirket sahibi değiştirebilir." });
    const body = await parseBody(req);
    const enabled = body.enabled === true;
    order.isTest = enabled;
    order.updatedAt = new Date().toISOString();
    order.audit ??= [];
    order.audit.push({ id: randomUUID(), action: enabled ? "testModeEnabled" : "testModeDisabled", by: req.authUser?.name ?? "Sahib", userId: req.authUser?.id, at: order.updatedAt });
    await writeDb(db);
    return send(res, 200, { data: orderWithPresence(order, req.authUser) });
  }

  if (req.method === "POST" && id && parts[2] === "activity") {
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    const body = await parseBody(req);
    const type = String(body.type || "");
    const activity = {
      order_editing_started: { permission: "orders.edit", title: "Sipariş düzenlenmeye başladı" },
      approval_form_preparing_started: { permission: "order_forms.edit", title: "Sipariş formu hazırlanmaya başladı" },
      approval_form_editing_started: { permission: "order_forms.edit", title: "Sipariş formu düzenlenmeye başladı" },
    }[type];
    if (!activity) return send(res, 400, { error: "Bildirim işlemi geçersiz." });
    if (workflowRole !== "owner" && !hasPermission(req.authUser, activity.permission)) {
      return send(res, 403, { error: "Bu işlemi başlatma yetkiniz yok." });
    }
    if (!order.isTest) notifyUsers(db, order, orderActivityRecipients(db, order), type, activity.title, `${req.authUser?.name || "Bir kullanıcı"} tarafından · ${order.approvalForm?.number || order.number} · ${order.customerName}`, req.authUser);
    await writeDb(db);
    return send(res, 201, { data: { sent: true } });
  }

  if (req.method === "POST" && id && parts[2] === "attachments") {
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    const body = await parseBody(req, 8_000_000);
    const kind = String(body.kind || "");
    const mayUpload = workflowRole === "owner" || hasPermission(req.authUser, "documents.create") || (kind === "deliveryProof" && canDeliver);
    if (!mayUpload) return send(res, 403, { error: "Sənəd yükləmək üçün icazəniz yoxdur." });
    const mimeType = String(body.mimeType || "").toLowerCase();
    const allowedKinds = new Set(["orderForm", "despatch", "deliveryProof"]);
    const extensions = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    if (!allowedKinds.has(kind) || !extensions[mimeType]) return send(res, 400, { error: "Yalnız PDF, JPG, PNG və WEBP yüklənə bilər." });
    const match = String(body.data || "").match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[1].toLowerCase() !== mimeType) return send(res, 400, { error: "Fayl məlumatı düzgün deyil." });
    const file = Buffer.from(match[2], "base64");
    if (!file.length || file.length > 5_000_000) return send(res, 413, { error: "Fayl ən çox 5 MB ola bilər." });
    const attachmentId = randomUUID();
    const storageName = `${order.id}-${attachmentId}.${extensions[mimeType]}`;
    await mkdir(ORDER_UPLOAD_DIR, { recursive: true });
    await writeFile(join(ORDER_UPLOAD_DIR, storageName), file);
    const now = new Date().toISOString();
    const attachment = {
      id: attachmentId,
      kind,
      name: String(body.name || `${kind}.${extensions[mimeType]}`).replace(/[\r\n]/g, " ").slice(0, 180),
      mimeType,
      size: file.length,
      storageName,
      url: `/api/orders/attachments/${attachmentId}`,
      uploadedAt: now,
      uploadedBy: req.authUser?.name ?? "Əməkdaş",
      uploadedByUserId: req.authUser?.id,
    };
    order.attachments ??= [];
    order.attachments.push(attachment);
    order.audit ??= [];
    order.audit.push({ id: randomUUID(), action: "attachmentUploaded", newValue: `${kind}: ${attachment.name}`, by: attachment.uploadedBy, userId: req.authUser?.id, at: now });
    order.updatedAt = now;
    await writeDb(db);
    return send(res, 201, { data: orderWithPresence(order, req.authUser) });
  }

  if (req.method === "POST" && id && parts[2] === "approval-form" && parts[3] === "presence") {
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    const body = await parseBody(req);
    touchOrderEditor(`approval-form:${id}`, req.authUser, body.active !== false);
    return send(res, 200, { data: { active: true } });
  }

  if (req.method === "PUT" && id && parts[2] === "approval-form") {
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    const body = await parseBody(req);
    let documentType = ["proforma", "commercial_invoice", "packing_list"].includes(String(body.documentType)) ? String(body.documentType) : "domestic";
    if (order.isExport && documentType === "domestic") documentType = "proforma";
    const canPrepareExportPacking = body.status !== "approved" && order.exportPackingRequired && documentType === "packing_list" && (workflowRole === "owner" || workflowRole === "warehouse" || hasPermission(req.authUser, "orders.prepare"));
    if (!canSell && !canPrepareExportPacking) return send(res, 403, { error: "Sifariş təsdiq formasını yalnız satış əməkdaşı hazırlaya bilər." });
    if (!["ready", "delivered"].includes(order.status) && !order.isTest && !(order.exportPackingRequired && ["commercial_invoice", "packing_list"].includes(documentType))) {
      return send(res, 409, { error: "Təsdiq formu yalnız hazır sifariş üçün yaradıla bilər." });
    }
    const actor = req.authUser?.name ?? "Satış";
    if (workflowRole !== "owner" && !canPrepareExportPacking && !hasPermission(req.authUser, body.status === "approved" ? "order_forms.approve" : "order_forms.edit")) {
      return send(res, 403, { error: body.status === "approved" ? "Sifariş formasını təsdiqləmək icazəniz yoxdur." : "Sifariş formasını dəyişmək icazəniz yoxdur." });
    }
    if (body.status === "approved" && workflowRole !== "owner") {
      const assignedUserId = String(body.salesRepresentativeUserId || order.approvalForm?.salesRepresentativeUserId || "").trim();
      const assignedName = normalizeSalesRepresentativeName(body.salesRepresentative || order.approvalForm?.salesRepresentative || "");
      const actorName = normalizeSalesRepresentativeName(actor);
      const isAssignedRepresentative = assignedUserId
        ? assignedUserId === String(req.authUser?.id || "")
        : Boolean(assignedName && actorName && assignedName === actorName);
      if (!isAssignedRepresentative) return send(res, 403, { error: "Bu formanı yalnız təyin edilmiş satış nümayəndəsi və ya şirkət sahibi təsdiqləyə bilər." });
    }
    const sourceItems = Array.isArray(order.items) ? order.items : [];
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const isExportDocument = documentType !== "domestic";
    if ((documentType === "domestic" && lines.length !== sourceItems.length) || (isExportDocument && lines.length < sourceItems.length)) {
      return send(res, 400, { error: "Formdakı məhsul sayı sifarişlə uyğun gəlmir." });
    }
    const exportUnits = new Set(["M2", "M", "ROLL", "BOX", "PCS", "KG", "SET", "PALLET"]);
    const invalidLine = lines.some((line) => {
      const values = [Number(line.unitPrice), Number(line.discountRate), Number(line.vatRate), Number(line.width || 1.42)];
      const unit = exportUnits.has(String(line.unit)) ? String(line.unit) : "M2";
      return !values.every(Number.isFinite) || values[0] < 0 || values[1] < 0 || values[1] > 100 || values[2] < 0 || values[2] > 100
        || (unit === "M2" && values[3] <= 0) || (line.manual === true && (!String(line.productName || "").trim() || !(Number(line.quantity) > 0)))
        || (unit === "BOX" && !(Number(line.unitsPerBox) > 0));
    });
    if (invalidLine) return send(res, 400, { error: "Qiymət, endirim və KDV dəyərləri düzgün deyil." });
    const normalizedLines = lines.map((line, index) => {
      const source = sourceItems[index];
      const manual = isExportDocument && (!source || line.manual === true);
      const unit = exportUnits.has(String(line.unit)) ? String(line.unit) : "M2";
      return { productId: manual ? null : (source.productId ?? null), productCode: String(manual ? line.productCode : source.productCode ?? "").trim().slice(0, 80), productName: String(manual ? line.productName : source.productName ?? "").trim().slice(0, 240), quantity: manual ? Number(line.quantity) : (Number(source.preparedQuantity ?? source.quantity) || 0), rollCount: manual ? 0 : (Number(source.preparedRollCount) > 0 ? Number(source.preparedRollCount) : (Number(source.orderedRollCount) || 0)), width: Number(line.width || 1.42), unitPrice: Number(line.unitPrice), discountRate: Number(line.discountRate), vatRate: isExportDocument ? 0 : Number(line.vatRate), unit, unitsPerBox: unit === "BOX" ? Math.max(1, Math.trunc(Number(line.unitsPerBox))) : undefined, manual, packageCount: Math.max(0, Math.trunc(Number(line.packageCount) || 0)), netWeight: Math.max(0, Number(line.netWeight) || 0), grossWeight: Math.max(0, Number(line.grossWeight) || 0), hsCode: String(line.hsCode || "").trim().slice(0, 40), countryOfOrigin: String(line.countryOfOrigin || body.countryOfOrigin || "").trim().slice(0, 160) };
    });
    const requestedCurrency = ["TRY", "USD", "EUR"].includes(String(body.currency)) ? String(body.currency) : "USD";
    const exchangeRate = isExportDocument ? 1 : Number(body.exchangeRate);
    const extraCharge = Number(body.extraCharge);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0 || !Number.isFinite(extraCharge) || extraCharge < 0) return send(res, 400, { error: "Məzənnə və əlavə xərc düzgün deyil." });
    const now = new Date().toISOString();
    const overallDiscountRate = Math.min(100, Math.max(0, Number(body.overallDiscountRate) || 0));
    const previousArchive = order.approvalForm?.archive;
    const previousForm = order.approvalForm;
    const currency = isExportDocument && requestedCurrency === "TRY" ? "USD" : requestedCurrency;
    const priceSource = body.priceSource === "ANTREPO_TRANSIT" ? "ANTREPO_TRANSIT" : "DEPO";
    const priceFactor = Number(body.priceFactor) === 0.5 ? 0.5 : 1;
    const preservedFormDate = previousForm?.date || body.date || now.slice(0, 10);
    const nextForm = { number: String(body.number || `SOF-${String(order.number).replace(/\D/g, "")}`).trim().slice(0, 60), documentType, proformaNumber: String(body.proformaNumber || `PRF-${String(order.number).replace(/\D/g, "")}`).trim().slice(0, 60), invoiceNumber: String(body.invoiceNumber || "").trim().slice(0, 80), date: String(preservedFormDate).slice(0, 10), revisionDate: String(body.revisionDate || body.date || now.slice(0, 16)).slice(0, 16), salesRepresentative: normalizeSalesRepresentativeName(body.salesRepresentative).slice(0, 160), salesRepresentativeUserId: String(body.salesRepresentativeUserId || "").trim().slice(0, 160), currency, exchangeRate, priceSource, priceFactor, vatIncluded: body.vatIncluded === true, lines: normalizedLines, overallDiscountRate, extraCharge, extraChargeLabel: String(body.extraChargeLabel || "Əlavə xərc").trim().slice(0, 100), paymentTerms: String(body.paymentTerms || "").trim().slice(0, 1000), deliveryTerms: String(body.deliveryTerms || "").trim().slice(0, 1000), note: String(body.note || "").trim().slice(0, 2000), customerName: String(body.customerName || order.customerName).trim().slice(0, 200), customerContact: String(body.customerContact || "").trim().slice(0, 160), customerAddress: String(body.customerAddress || "").trim().slice(0, 500), customerPhone: String(body.customerPhone || "").trim().slice(0, 80), customerEmail: String(body.customerEmail || "").trim().slice(0, 200), customerTaxOffice: String(body.customerTaxOffice || "").trim().slice(0, 120), customerTaxNumber: String(body.customerTaxNumber || "").trim().slice(0, 40), packageType: String(body.packageType || "").trim().slice(0, 160), productDescription: String(body.productDescription || "").trim().slice(0, 300), incoterm: String(body.incoterm || "").trim().slice(0, 200), shipmentPort: String(body.shipmentPort || "").trim().slice(0, 160), destination: String(body.destination || "").trim().slice(0, 300), countryOfOrigin: String(body.countryOfOrigin || "").trim().slice(0, 160), bankName: String(body.bankName || "").trim().slice(0, 200), swiftCode: String(body.swiftCode || "").trim().slice(0, 40), iban: String(body.iban || "").trim().slice(0, 80), buyerOrderNumber: String(body.buyerOrderNumber || "").trim().slice(0, 100), transportMode: String(body.transportMode || "ROAD").trim().slice(0, 40), vehicleContainerNumber: String(body.vehicleContainerNumber || "").trim().slice(0, 100), transportDocumentNumber: String(body.transportDocumentNumber || "").trim().slice(0, 100), loadingPlace: String(body.loadingPlace || "Istanbul / Türkiye").trim().slice(0, 160), marksAndNumbers: String(body.marksAndNumbers || "").trim().slice(0, 500), freightAmount: Math.max(0, Number(body.freightAmount) || 0), insuranceAmount: Math.max(0, Number(body.insuranceAmount) || 0), exporterDeclaration: String(body.exporterDeclaration || "").trim().slice(0, 1000), status: body.status === "approved" ? "approved" : "draft", ...(body.status === "approved" ? { approvedAt: now, approvedBy: actor } : {}), updatedAt: now, updatedBy: actor, ...(previousArchive ? { archive: previousArchive } : {}) };
    delete nextForm.priceFactor;
    if (["commercial_invoice", "packing_list"].includes(documentType)) {
      nextForm.shipmentDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.shipmentDate || "")) ? String(body.shipmentDate) : nextForm.date;
      if (body.status === "approved" && !nextForm.invoiceNumber) return send(res, 400, { error: "Commercial Invoice ve Packing List için fatura numarası zorunludur." });
    }
    if (documentType === "packing_list") {
      const totalRolls = normalizedLines.reduce((sum, line) => sum + Math.max(0, Math.trunc(Number(line.rollCount) || 0)), 0);
      const palletCount = totalRolls > 0 ? Math.ceil(totalRolls / 16) : 0;
      const base = palletCount > 0 ? Math.floor(totalRolls / palletCount) : 0;
      const remainder = palletCount > 0 ? totalRolls % palletCount : 0;
      const automaticDistribution = Array.from({ length: palletCount }, (_, index) => base + (index < remainder ? 1 : 0));
      const submittedDistribution = Array.isArray(body.palletDistribution)
        ? body.palletDistribution.map((value) => Math.max(0, Math.trunc(Number(value) || 0))).filter((value) => value > 0)
        : [];
      const palletDistribution = submittedDistribution.length ? submittedDistribution : automaticDistribution;
      const plannedRolls = palletDistribution.reduce((sum, value) => sum + value, 0);
      const allowSeventeenRollPallet = body.allowSeventeenRollPallet === true;
      if (plannedRolls !== totalRolls) return send(res, 400, { error: `Palet planı ${plannedRolls} rulo, məhsullar isə ${totalRolls} rulo ehtiva edir.` });
      const palletDetails = Array.isArray(body.palletDetails) ? body.palletDetails.slice(0, palletDistribution.length).map((detail) => ({
        grossWeight: Math.max(0, Number(detail?.grossWeight) || 0),
        tareWeight: Math.max(0, Number(detail?.tareWeight) || 0),
        lengthCm: Math.max(0, Number(detail?.lengthCm) || 0),
        widthCm: Math.max(0, Number(detail?.widthCm) || 0),
        heightCm: Math.max(0, Number(detail?.heightCm) || 0),
      })) : [];
      const invalidPalletIndex = palletDetails.length !== palletDistribution.length ? 0 : palletDetails.findIndex((detail) => detail.grossWeight <= 0 || detail.tareWeight > 20 || detail.tareWeight >= detail.grossWeight || detail.lengthCm <= 0 || detail.widthCm <= 0 || detail.heightCm <= 0);
      if (invalidPalletIndex >= 0) return send(res, 400, { error: `Palet ${invalidPalletIndex + 1} üçün brüt çəki, ən çox 20 kq dara və ölçülər tam daxil edilməlidir.` });
      nextForm.palletDistribution = palletDistribution;
      const palletAllocations = Array.isArray(body.palletAllocations) ? body.palletAllocations.slice(0, palletDistribution.length).map((entries) => Array.isArray(entries) ? entries.map((entry) => ({ lineIndex: Math.trunc(Number(entry?.lineIndex)), rolls: Math.max(0, Math.trunc(Number(entry?.rolls) || 0)), quantity: Math.max(0, Number(entry?.quantity) || 0) })).filter((entry) => entry.lineIndex >= 0 && entry.lineIndex < normalizedLines.length && entry.rolls > 0) : []) : [];
      if (palletAllocations.length) {
        const allocatedByLine = normalizedLines.map((_, lineIndex) => palletAllocations.reduce((sum, entries) => sum + entries.filter((entry) => entry.lineIndex === lineIndex).reduce((lineSum, entry) => lineSum + entry.rolls, 0), 0));
        const invalidAllocation = normalizedLines.some((line, lineIndex) => allocatedByLine[lineIndex] !== Math.max(0, Math.trunc(Number(line.rollCount) || 0)));
        if (invalidAllocation) return send(res, 400, { error: "Paletlerdeki ürün rulo dağılımı siparişle uyuşmuyor." });
        const quantityMismatch = normalizedLines.some((line, lineIndex) => Math.abs(palletAllocations.reduce((sum, entries) => sum + entries.filter((entry) => entry.lineIndex === lineIndex).reduce((lineSum, entry) => lineSum + entry.quantity, 0), 0) - Number(line.quantity || 0)) > 0.02);
        if (quantityMismatch) return send(res, 400, { error: "Paletlerdeki ürün metre toplamı sipariş miktarıyla uyuşmuyor." });
        nextForm.palletAllocations = palletAllocations;
      }
      nextForm.allowSeventeenRollPallet = allowSeventeenRollPallet;
      nextForm.palletDetails = palletDetails;
    }
    if (previousForm?.documentType !== documentType) delete nextForm.archive;
    const approvalContent = (form) => {
      if (!form) return "";
      const content = { ...form };
      delete content.status;
      delete content.approvedAt;
      delete content.approvedBy;
      delete content.updatedAt;
      delete content.updatedBy;
      delete content.archive;
      return JSON.stringify(content);
    };
    if (body.status === "approved" && previousForm?.status === "approved" && approvalContent(previousForm) === approvalContent(nextForm)) {
      return send(res, 409, { error: "Bu sipariş formu zaten onaylandı. Yeniden onaylamak için önce formda bir değişiklik yapın." });
    }
    order.approvalForm = nextForm;
    if (order.approvalForm.status === "approved" && documentType === "proforma") {
      order.exportPackingRequired = true;
      order.exportPackingStatus = "pending";
      if (order.status !== "preparing") {
        order.status = "preparing";
        order.history ??= [];
        order.history.push({ status: "preparing", at: now, by: actor, reason: "Proforma onaylandı; Packing List için palet hazırlama görevi açıldı." });
      }
    } else if (order.approvalForm.status === "approved" && documentType === "packing_list") {
      order.exportPackingRequired = false;
      order.exportPackingStatus = "ready";
      if (order.status !== "ready") {
        order.status = "ready";
        order.readyAt = now;
        order.preparedBy = actor;
        order.history ??= [];
        order.history.push({ status: "ready", at: now, by: actor, reason: "Packing List ve palet hazırlığı tamamlandı." });
      }
    }
    const pushNotification = ({ recipientUserId = "", recipientName = "", type, title, message }) => {
      const recipient = db.authUsers.find((user) => String(user.id) === String(recipientUserId)) || db.authUsers.find((user) => normalizeSalesRepresentativeName(user.name) === normalizeSalesRepresentativeName(recipientName));
      addOrderNotification(db, { order, recipient, type, title, message, actor: req.authUser });
    };
    if (!order.isTest && order.approvalForm.status === "draft") {
      const assignedUser = db.authUsers.find((user) => String(user.id) === order.approvalForm.salesRepresentativeUserId) || db.authUsers.find((user) => normalizeSalesRepresentativeName(user.name) === order.approvalForm.salesRepresentative);
      const formEventType = previousForm ? "approval_form_edited" : "approval_form_prepared";
      const formEventTitle = previousForm ? "Sipariş formu düzenlendi" : "Sipariş formu hazırlandı";
      notifyUsers(db, order, orderActivityRecipients(db, order), formEventType, formEventTitle, `${actor} tarafından · ${order.approvalForm.number} · ${order.approvalForm.customerName}`, req.authUser);
      pushNotification({ recipientUserId: assignedUser?.id || order.approvalForm.salesRepresentativeUserId, recipientName: assignedUser?.name || order.approvalForm.salesRepresentative, type: "approval_requested", title: "Sipariş formu onay bekliyor", message: `${actor} tarafından gönderildi · ${order.approvalForm.number} · ${order.approvalForm.customerName}` });
      for (const ownerUser of db.authUsers.filter((user) => orderWorkflowRole(user) === "owner")) pushNotification({ recipientUserId: ownerUser.id, recipientName: ownerUser.name, type: "approval_requested", title: "Sipariş formu onay bekliyor", message: `${actor} tarafından gönderildi · ${order.approvalForm.number} · ${order.approvalForm.customerName}` });
    } else if (!order.isTest) {
      const preparerName = previousForm?.updatedBy || order.createdBy;
      const preparer = db.authUsers.find((user) => normalizeSalesRepresentativeName(user.name) === normalizeSalesRepresentativeName(preparerName));
      pushNotification({ recipientUserId: preparer?.id || "", recipientName: preparer?.name || preparerName, type: "approval_completed", title: "Sipariş formu onaylandı", message: `${actor} tarafından onaylandı · ${order.approvalForm.number}` });
      if (documentType === "proforma") {
        notifyUsers(db, order, db.authUsers.filter((user) => orderWorkflowRole(user) === "warehouse" || hasPermission(user, "orders.prepare")), "export_packing_requested", "Palet hazırlama bekliyor", `${actor} tarafından Proforma onaylandı · ${order.number} · ${order.customerName}`, req.authUser);
      }
    }
    order.audit ??= [];
    order.audit.push({ id: randomUUID(), action: order.approvalForm.status === "approved" ? "approvalFormApproved" : "approvalFormSaved", newValue: order.approvalForm.number, by: actor, userId: req.authUser?.id, at: now });
    order.updatedAt = now;
    await writeDb(db);
    return send(res, 200, { data: orderWithPresence(order, req.authUser) });
  }

  if (req.method === "POST" && id && parts[2] === "approval-form" && parts[3] === "archive") {
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    if (!order.approvalForm) return send(res, 409, { error: "Arxivlənəcək sifariş forması tapılmadı." });
    const archiveIsApproved = order.approvalForm.status === "approved";
    const mayPreparePackingArchive = !archiveIsApproved && order.exportPackingRequired && order.approvalForm.documentType === "packing_list" && (workflowRole === "warehouse" || hasPermission(req.authUser, "orders.prepare"));
    const mayArchive = workflowRole === "owner" || mayPreparePackingArchive || hasPermission(req.authUser, archiveIsApproved ? "order_forms.approve" : "order_forms.edit");
    if (!mayArchive) return send(res, 403, { error: "Sifariş təsdiq formasını arxivləmək üçün icazəniz yoxdur." });

    const archivedCustomerName = String(order.approvalForm.customerName || order.customerName).trim();
    const customer = findOrderCustomerByName(db.orderCustomers, archivedCustomerName);
    const isExport = isExportApprovalDocument(order.approvalForm);
    const salesRepresentative = order.isTest ? "TEST" : salesRepresentativeArchiveFolder(customer?.salesRepresentative);
    const customerFolderName = order.isTest
      ? safeWindowsPathSegment(archivedCustomerName)
      : safeWindowsPathSegment(isExport ? exportCustomerFolder(customer?.name) : customer?.folderName);
    if (!customer && !order.isTest) return send(res, 409, { error: `Müşteri kartı bulunamadı: ${archivedCustomerName}. Müşteri adını karttaki adla eşleştirin.` });
    if ((!isExport && !salesRepresentative) || !customerFolderName) return send(res, 409, { error: "Müşterinin arşiv klasörü bilgileri tamamlanmalıdır." });

    const body = await parseBody(req, 8_000_000);
    let pdf;
    try {
      pdf = await renderOrderApprovalPdf(body.html);
    } catch (error) {
      return send(res, 503, { error: `PDF yazdırıla bilmədi: ${error.message}` });
    }
    if (pdf.length > 10_000_000) return send(res, 413, { error: "PDF 10 MB-dan kiçik olmalıdır." });

    const now = new Date();
    const { year, month, display } = orderArchiveDateParts(now);
    const isShipmentDocument = ["commercial_invoice", "packing_list"].includes(order.approvalForm.documentType);
    const shipmentDate = /^\d{4}-\d{2}-\d{2}$/.test(String(order.approvalForm.shipmentDate || ""))
      ? new Date(`${order.approvalForm.shipmentDate}T12:00:00`)
      : now;
    const shipmentDateParts = orderArchiveDateParts(shipmentDate);
    const formNumber = safeWindowsPathSegment(
      isExport
        ? order.approvalForm.proformaNumber
        : order.approvalForm.number,
    );
    const customerName = safeWindowsPathSegment(archivedCustomerName);
    if (!formNumber || !customerName) return send(res, 400, { error: "Form nömrəsi və müştəri adı fayl adı üçün uyğun deyil." });
    const archiveBase = isExport ? EXPORT_ARCHIVE_ROOT : ORDER_ARCHIVE_ROOT;
    const archiveRoot = resolve(archiveBase);
    const storedArchivePath = String(order.approvalForm.archive?.path || "").trim();
    const resolvedStoredArchivePath = storedArchivePath ? resolve(storedArchivePath) : "";
    const existingArchivePath = resolvedStoredArchivePath && pathIsWithin(archiveRoot, resolvedStoredArchivePath) ? storedArchivePath : "";
    const sourceFolder = order.approvalForm.priceSource === "ANTREPO_TRANSIT" ? "ANTREPO" : "DEPO";
    const exportDocumentFolder = order.approvalForm.documentType === "commercial_invoice" ? "COMMERCIAL INVOICE" : order.approvalForm.documentType === "packing_list" ? "PACKING LIST" : "PROFORMA";
    const countryFolder = safeWindowsPathSegment(customer?.country || "ÜLKE BELİRTİLMEDİ");
    const archiveDirectory = existingArchivePath
      ? dirname(existingArchivePath)
      : isExport
        ? isShipmentDocument
          ? join(EXPORT_ARCHIVE_ROOT, countryFolder, customerFolderName, "SEVKİYAT", shipmentDateParts.display)
          : join(EXPORT_ARCHIVE_ROOT, countryFolder, customerFolderName, exportDocumentFolder, year, sourceFolder, month)
        : join(ORDER_ARCHIVE_ROOT, salesRepresentative, customerFolderName, year, month);
    const filename = existingArchivePath
      ? String(order.approvalForm.archive?.filename || existingArchivePath.split(/[\\/]/).pop())
      : isExport
        ? `${customerName} - ${exportDocumentFolder} - ${isShipmentDocument ? shipmentDateParts.display : display}${isShipmentDocument ? ` - ${safeWindowsPathSegment(order.approvalForm.invoiceNumber)}` : ` - ${sourceFolder}`}.pdf`
        : `${formNumber} - ${customerName} - ${display} - Sipariş Formu.pdf`;
    const destination = existingArchivePath || join(archiveDirectory, filename);
    const temporary = join(archiveDirectory, `.${randomUUID()}.tmp`);
    const backup = join(archiveDirectory, `.${randomUUID()}.bak`);
    let replacingOwnArchive = false;

    try {
      await mkdir(archiveDirectory, { recursive: true });
      await readFile(destination);
      replacingOwnArchive = isExport || order.approvalForm.archive?.path === destination;
      if (!replacingOwnArchive) return send(res, 409, { error: `Bu PDF zaten arşivde mevcut: ${filename}` });
    } catch (error) {
      if (error?.code && error.code !== "ENOENT") {
        return send(res, 503, { error: `Arşiv klasörüne erişilemedi: ${error.message}` });
      }
    }

    try {
      await writeFile(temporary, pdf, { flag: "wx" });
      if (replacingOwnArchive) await rename(destination, backup);
      await rename(temporary, destination);
      if (replacingOwnArchive) await unlink(backup).catch(() => {});
    } catch (error) {
      await unlink(temporary).catch(() => {});
      if (replacingOwnArchive) {
        await rename(backup, destination).catch(() => {});
      }
      return send(res, 503, { error: `PDF arşive kaydedilemedi: ${error.message}` });
    }

    const archivedAt = now.toISOString();
    const relativePath = relative(resolve(archiveBase), resolve(destination)).split(/[\\/]+/).filter(Boolean).join("/");
    const windowsRoot = isExport ? "\\\\ERSARIF\\SharedFolder\\ErsaShare\\IHRACAT" : "\\\\ERSARIF\\SharedFolder\\ErsaShare\\YURT İÇİ";
    const windowsPath = `${windowsRoot}\\${relativePath.replaceAll("/", "\\")}`;
    order.approvalForm.archive = { path: destination, windowsPath, relativePath, filename, archivedAt, archivedBy: req.authUser?.name ?? "Satış", status: order.approvalForm.status };
    if (!order.isTest) notifyUsers(db, order, orderActivityRecipients(db, order), "approval_form_archived", "Sipariş formu arşivlendi", `${req.authUser?.name || "Satış"} tarafından · ${order.approvalForm.number}`, req.authUser);
    order.audit ??= [];
    order.audit.push({ id: randomUUID(), action: archiveIsApproved ? "approvalFormArchived" : "approvalFormDraftArchived", newValue: destination, by: req.authUser?.name ?? "Satış", userId: req.authUser?.id, at: archivedAt });
    order.updatedAt = archivedAt;
    await writeDb(db);
    return send(res, 201, { data: { path: windowsPath, filename, order: orderWithPresence(order, req.authUser) } });
  }

  if (req.method === "POST" && id && parts[2] === "approval-form" && parts[3] === "open-archive") {
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    const archivePath = String(order.approvalForm?.archive?.path || "").trim();
    if (!archivePath) return send(res, 409, { error: "Açılacaq arxiv faylı tapılmadı." });
    const archiveRoot = resolve(isExportApprovalDocument(order.approvalForm) ? EXPORT_ARCHIVE_ROOT : ORDER_ARCHIVE_ROOT);
    const resolvedArchivePath = resolve(archivePath);
    if (!pathIsWithin(archiveRoot, resolvedArchivePath)) {
      return send(res, 403, { error: "Arxiv yolu icazə verilən qovluğun xaricindədir." });
    }
    if (process.platform !== "win32") return send(res, 501, { error: "Qovluq açma yalnız Windows kompüterdə dəstəklənir." });
    try {
      const child = execFile("explorer.exe", ["/select,", resolvedArchivePath], { windowsHide: false });
      child.unref();
      return send(res, 200, { data: { path: archivePath } });
    } catch (error) {
      return send(res, 503, { error: `Arxiv qovluğu açıla bilmədi: ${error.message}` });
    }
  }

  if (req.method === "GET" && id && parts[2] === "approval-form" && parts[3] === "pdf") {
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    if (!order.approvalForm) return send(res, 404, { error: "Sipariş formu bulunamadı." });
    const canViewAll = workflowRole === "owner" || hasPermission(req.authUser, "order_forms.view_all");
    if (!canViewAll) {
      const actorId = String(req.authUser?.id || "");
      const actorName = normalizeSalesRepresentativeName(req.authUser?.name || "");
      const assignedId = String(order.approvalForm.salesRepresentativeUserId || "");
      const assignedName = normalizeSalesRepresentativeName(order.approvalForm.salesRepresentative || "");
      const mayView = assignedId ? assignedId === actorId : Boolean(assignedName && assignedName === actorName);
      if (!mayView) return send(res, 403, { error: "Bu sipariş formunun PDF dosyasını görme yetkiniz yok." });
    }
    const archivePath = String(order.approvalForm.archive?.path || "").trim();
    if (!archivePath) return send(res, 404, { error: "Bu form için arşivlenmiş PDF bulunamadı." });
    const archiveRoot = resolve(isExportApprovalDocument(order.approvalForm) ? EXPORT_ARCHIVE_ROOT : ORDER_ARCHIVE_ROOT);
    const resolvedArchivePath = resolve(archivePath);
    if (!pathIsWithin(archiveRoot, resolvedArchivePath)) {
      return send(res, 403, { error: "Arşiv yolu izin verilen klasörün dışında." });
    }
    try {
      const pdf = await readFile(resolvedArchivePath);
      const filename = String(order.approvalForm.archive?.filename || `${order.approvalForm.number}.pdf`).replace(/[\r\n"]/g, " ");
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": pdf.length,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      });
      return res.end(pdf);
    } catch (error) {
      if (error?.code === "ENOENT") return send(res, 404, { error: "Arşiv PDF dosyası bulunamadı." });
      return send(res, 503, { error: `Arşiv PDF dosyası açılamadı: ${error.message}` });
    }
  }

  if (req.method === "POST" && id && parts[2] === "delivery-photo") {
    if (!canDeliver) return send(res, 403, { error: "Təhvil şəkli yükləmək üçün icazəniz yoxdur." });
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    if (order.status !== "ready") return send(res, 409, { error: "Təhvil şəkli yalnız hazır sifarişə yüklənə bilər." });
    const body = await parseBody(req, 1_500_000);
    const match = String(body.data || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return send(res, 400, { error: "Təhvil şəkli düzgün deyil." });
    const file = Buffer.from(match[2], "base64");
    if (!file.length || file.length > 700_000) return send(res, 413, { error: "Sıxılmış təhvil şəkli ən çox 700 KB ola bilər." });
    const extension = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg";
    const storageName = `${order.id}-delivery-${randomUUID()}.${extension}`;
    await mkdir(ORDER_UPLOAD_DIR, { recursive: true });
    await writeFile(join(ORDER_UPLOAD_DIR, storageName), file);
    if (order.deliveryPhotoStorageName) await unlink(join(ORDER_UPLOAD_DIR, order.deliveryPhotoStorageName)).catch(() => {});
    const now = new Date().toISOString();
    order.deliveryPhoto = `/api/orders/delivery-photos/${order.id}`;
    order.deliveryPhotoStorageName = storageName;
    order.deliveryPhotoMimeType = match[1];
    order.deliveryPhotoUploadedAt = now;
    order.deliveryPhotoUploadedBy = req.authUser?.name ?? "Əməkdaş";
    order.updatedAt = now;
    order.audit ??= [];
    order.audit.push({ id: randomUUID(), action: "deliveryPhotoUploaded", by: order.deliveryPhotoUploadedBy, userId: req.authUser?.id, at: now });
    await writeDb(db);
    return send(res, 201, { data: orderWithPresence(order, req.authUser) });
  }

  if (req.method === "DELETE" && id && parts[2] === "attachments" && parts[3]) {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "documents.delete")) return send(res, 403, { error: "Sənədi silmək icazəniz yoxdur." });
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    const attachmentId = String(parts[3]);
    const attachment = (order.attachments || []).find((item) => String(item.id) === attachmentId);
    if (!attachment) return notFound(res);
    const now = new Date().toISOString();
    attachment.deletedAt = now;
    attachment.deletedBy = req.authUser?.name ?? "Sahib";
    order.audit ??= [];
    order.audit.push({ id: randomUUID(), action: "attachmentDeleted", oldValue: `${attachment.kind}: ${attachment.name}`, by: attachment.deletedBy, userId: req.authUser?.id, at: now });
    order.updatedAt = now;
    await writeDb(db);
    return send(res, 200, { data: orderWithPresence(order, req.authUser) });
  }

  if (req.method === "PATCH" && id && parts[2] === "attachments" && parts[3]) {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "documents.delete")) return send(res, 403, { error: "Sənədi geri qaytarmaq icazəniz yoxdur." });
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    const attachment = (order.attachments || []).find((item) => String(item.id) === String(parts[3]));
    if (!attachment) return notFound(res);
    const now = new Date().toISOString();
    delete attachment.deletedAt;
    delete attachment.deletedBy;
    order.audit ??= [];
    order.audit.push({ id: randomUUID(), action: "attachmentRestored", newValue: `${attachment.kind}: ${attachment.name}`, by: req.authUser?.name ?? "Sahib", userId: req.authUser?.id, at: now });
    order.updatedAt = now;
    await writeDb(db);
    return send(res, 200, { data: orderWithPresence(order, req.authUser) });
  }

  if (req.method === "PATCH" && id && parts[2] === "draft") {
    if (!canPrepare) return send(res, 403, { error: "Hazırlama məlumatlarını yalnız anbar əməkdaşı dəyişə bilər." });
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    if (order.status !== "preparing") return send(res, 409, { error: "Metraj draftı yalnız hazırlanma mərhələsində dəyişdirilə bilər." });
    const body = await parseBody(req);
    const itemIndex = Number(body.itemIndex);
    const item = order.items?.[itemIndex];
    if (!item || !Number.isInteger(itemIndex)) return send(res, 404, { error: "Məhsul sətri tapılmadı." });
    const quantityProvided = body.preparedQuantity !== undefined;
    const rollProvided = body.preparedRollCount !== undefined;
    const allowanceProvided = body.cutAllowanceApplied !== undefined || body.cutPieceCount !== undefined || body.cutAllowancePerPiece !== undefined;
    if (!quantityProvided && !rollProvided && !allowanceProvided) return send(res, 400, { error: "Dəyişdiriləcək metraj, rulo və ya kesim payı göndərilməyib." });
    const preparedQuantity = quantityProvided ? Number(body.preparedQuantity) : (Number(item.preparedQuantity) || 0);
    const preparedRollCount = rollProvided ? Number(body.preparedRollCount) : (Number(item.preparedRollCount) || 0);
    if (quantityProvided && (!Number.isFinite(preparedQuantity) || preparedQuantity <= 0)) return send(res, 400, { error: "Faktiki metraj sıfırdan böyük olmalıdır." });
    if (rollProvided && (!Number.isInteger(preparedRollCount) || preparedRollCount < 0)) return send(res, 400, { error: "Rulo sayı düzgün tam ədəd olmalıdır." });
    const previousValue = Number(item.preparedQuantity) || null;
    const previousRollCount = Number(item.preparedRollCount) || 0;
    const quantityChanged = quantityProvided && previousValue !== preparedQuantity;
    const rollChanged = rollProvided && previousRollCount !== preparedRollCount;
    const normalizedAllowance = allowanceProvided ? normalizeOrderCutAllowance({ ...item, ...body }) : null;
    const allowanceChanged = Boolean(normalizedAllowance) && (
      item.cutAllowanceApplied !== normalizedAllowance.cutAllowanceApplied ||
      Number(item.cutPieceCount || 0) !== Number(normalizedAllowance.cutPieceCount || 0) ||
      Number(item.cutAllowancePerPiece || 0) !== Number(normalizedAllowance.cutAllowancePerPiece || 0)
    );
    const now = new Date().toISOString();
    if (!quantityChanged && !rollChanged && !allowanceChanged) {
      touchOrderEditor(id, req.authUser, true);
      return send(res, 200, { data: orderWithPresence(order, req.authUser) });
    }
    if (quantityProvided) item.preparedQuantity = preparedQuantity;
    if (rollProvided) item.preparedRollCount = preparedRollCount;
    if (normalizedAllowance) Object.assign(item, normalizedAllowance);
    else if (quantityProvided) Object.assign(item, normalizeOrderCutAllowance(item));
    item.preparedBy = req.authUser?.name ?? "Anbar";
    item.preparedByUserId = req.authUser?.id;
    item.preparedAt = now;
    order.draftUpdatedAt = now;
    order.draftUpdatedBy = req.authUser?.name ?? "Anbar";
    order.audit ??= [];
    if (quantityChanged) order.audit.push({
      id: randomUUID(), action: "preparedQuantity", itemIndex, productId: item.productId,
      productName: item.productName, oldValue: previousValue, newValue: preparedQuantity,
      reason: changeReason || "Hazırlanan metre miktarı güncellendi",
      by: req.authUser?.name ?? "Anbar", userId: req.authUser?.id, at: now,
    });
    if (rollChanged) order.audit.push({
      id: randomUUID(), action: "preparedRollCount", itemIndex, productId: item.productId,
      productName: item.productName, oldValue: previousRollCount, newValue: preparedRollCount,
      reason: changeReason || "Hazırlanan rulo sayısı güncellendi",
      by: req.authUser?.name ?? "Anbar", userId: req.authUser?.id, at: now,
    });
    if (allowanceChanged) order.audit.push({
      id: randomUUID(), action: "cutAllowance", itemIndex, productId: item.productId,
      productName: item.productName, newValue: item.cutAllowanceApplied ? item.cutAllowanceMeters : 0,
      reason: changeReason || "Kesim payı bilgisi güncellendi",
      by: req.authUser?.name ?? "Anbar", userId: req.authUser?.id, at: now,
    });
    touchOrderEditor(id, req.authUser, true);
    await writeDb(db);
    return send(res, 200, { data: orderWithPresence(order, req.authUser) });
  }

  if (req.method === "POST" && id && parts[2] === "partial-ready") {
    if (!canPrepare) return send(res, 403, { error: "Hazır partiyanı yalnız anbar əməkdaşı yarada bilər." });
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    if (order.status !== "preparing") return send(res, 409, { error: "Yalnız hazırlanmaqda olan sifarişdən hazır hissə yaradıla bilər." });
    const selected = (order.items || []).filter((item) => Number(item.preparedQuantity) > 0);
    if (!selected.length) return send(res, 400, { error: "Hazıra göndərmək üçün ən az bir faktiki metraj yazın." });
    const now = new Date().toISOString();
    const actor = req.authUser?.name ?? "Anbar";
    const existingBatches = db.orderBoard.filter((item) => String(item.parentOrderId || "") === String(order.id)).length;
    const batch = {
      id: randomUUID(),
      number: `${order.number}-H${existingBatches + 1}`,
      parentOrderId: order.id,
      parentOrderNumber: order.number,
      customerName: order.customerName,
      note: order.note,
      businessDate: order.businessDate || activeOrderDayKey(db),
      status: "ready",
      items: selected.map((item) => ({ ...item, quantity: Number(item.preparedQuantity), preparedQuantity: Number(item.preparedQuantity) })),
      createdBy: order.createdBy,
      createdByUserId: order.createdByUserId || null,
      preparedBy: actor,
      createdAt: now,
      updatedAt: now,
      readyAt: now,
      history: [{ status: "ready", at: now, by: actor }],
      audit: [{ id: randomUUID(), action: "partialReadyCreated", by: actor, userId: req.authUser?.id, at: now }],
    };
    order.items = (order.items || []).flatMap((item) => {
      const prepared = Number(item.preparedQuantity) || 0;
      if (prepared <= 0) return [item];
      const remaining = Number(item.quantity) - prepared;
      if (remaining <= 0.000001) return [];
      const next = { ...item, quantity: remaining, preparedQuantity: null };
      delete next.preparedBy;
      delete next.preparedByUserId;
      delete next.preparedAt;
      delete next.preparedRollCount;
      return [next];
    });
    if (!order.items.length) {
      order.status = "fulfilled";
      order.history ??= [];
      order.history.push({ status: "fulfilled", at: now, by: actor });
    }
    order.updatedAt = now;
    order.draftUpdatedAt = now;
    order.draftUpdatedBy = actor;
    order.audit ??= [];
    order.audit.push({ id: randomUUID(), action: "partialReady", newValue: batch.number, by: actor, userId: req.authUser?.id, at: now });
    db.orderBoard.push(batch);
    await writeDb(db);
    return send(res, 200, { data: { order: orderWithPresence(order, req.authUser), batch: orderWithPresence(batch, req.authUser) } });
  }

  if (req.method === "PATCH" && id && parts[2] === "despatch") {
    if (workflowRole !== "owner" && !hasPermission(req.authUser, "orders.despatch")) return send(res, 403, { error: "İrsaliye məlumatını təsdiqləmək icazəniz yoxdur." });
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    if (order.status !== "ready") return send(res, 409, { error: "İrsaliye yalnız hazır sifariş partiyası üçün təsdiqlənə bilər." });
    const body = await parseBody(req);
    const ready = body.ready === true;
    const withoutDespatch = ready && body.withoutDespatch === true;
    const number = withoutDespatch ? "" : String(body.number ?? "").trim().slice(0, 80);
    if (ready && !withoutDespatch && !number) return send(res, 400, { error: "İrsaliye nömrəsi məcburidir." });
    const wasReady = order.despatchReady === true;
    const previousNumber = String(order.despatchNumber || "").trim();
    const wasWithoutDespatch = order.withoutDespatch === true;
    if (wasReady === ready && (!ready || (previousNumber === number && wasWithoutDespatch === withoutDespatch))) {
      return send(res, 200, { data: orderWithPresence(order, req.authUser) });
    }
    const now = new Date().toISOString();
    order.despatchReady = ready;
    order.despatchNumber = ready ? number : "";
    order.withoutDespatch = ready ? withoutDespatch : false;
    order.despatchReadyAt = ready ? now : null;
    order.despatchReadyBy = ready ? (req.authUser?.name ?? "Satış") : null;
    order.updatedAt = now;
    order.audit ??= [];
    order.audit.push({ id: randomUUID(), action: ready ? "despatchReady" : "despatchRevoked", newValue: withoutDespatch ? "İrsaliyesiz teslim" : number, by: req.authUser?.name ?? "Satış", userId: req.authUser?.id, at: now });
    if (ready && !wasReady) {
      notifyUsers(
        db,
        order,
        db.authUsers.filter((user) => hasPermission(user, "orders.deliver")),
        "despatch_ready",
        withoutDespatch ? "İrsaliyesiz teslim için hazır" : "İrsaliye hazırlandı · Teslim edilebilir",
        withoutDespatch
          ? `${req.authUser?.name || "Satış"} tarafından irsaliyesiz teslim onaylandı · ${order.number} · ${order.customerName}`
          : `${number} numaralı irsaliye ${req.authUser?.name || "Satış"} tarafından hazırlandı · ${order.number} · ${order.customerName}`,
        req.authUser,
      );
    }
    await writeDb(db);
    return send(res, 200, { data: orderWithPresence(order, req.authUser) });
  }

  if (req.method === "PATCH" && id) {
    const order = db.orderBoard.find((item) => String(item.id) === id);
    if (!order) return notFound(res);
    const body = await parseBody(req);
    const nextStatus = String(body.status ?? order.status);
    const previousStatus = order.status;
    const statusWasRolledBack = (previousStatus === "preparing" && nextStatus === "new")
      || (previousStatus === "ready" && nextStatus === "preparing");
    const rollbackReason = String(body.rollbackReason || "").trim().slice(0, 500);
    if (statusWasRolledBack && !rollbackReason) return send(res, 400, { error: "Geri gönderme nedeni zorunludur." });
    const beforeEdit = structuredClone({ customerName: order.customerName, note: order.note, items: order.items || [] });
    const now = new Date().toISOString();
    const actor = req.authUser?.name ?? "Əməkdaş";
    const allowed = { new: ["preparing", "cancelled"], preparing: ["ready", "new", "cancelled"], ready: ["delivered", "preparing"], delivered: [], cancelled: ["new"] };
    if (order.parentOrderId && order.status === "ready" && nextStatus === "preparing") {
      return send(res, 409, { error: "Hazır partiya yenidən hazırlanmağa qaytarıla bilməz. Qalan məhsullar ana sifarişdə hazırlanır." });
    }
    const isOwner = normalizedRole(req.authUser?.role) === "sahib";
    const canEditOrder = isOwner || hasPermission(req.authUser, "orders.edit");
    if (nextStatus !== order.status) {
      const isRollback = (order.status === "preparing" && nextStatus === "new")
        || (order.status === "ready" && nextStatus === "preparing");
      const canRollback = isOwner || hasPermission(req.authUser, "orders.rollback");
      const roleAllowed = (isRollback && canRollback)
        || (!isRollback && nextStatus === "preparing" && canPrepare)
        || (nextStatus === "ready" && canPrepare)
        || (!isRollback && nextStatus === "new" && canPrepare)
        || (nextStatus === "delivered" && canDeliver)
        || ((isOwner || hasPermission(req.authUser, "orders.delete")) && nextStatus === "cancelled");
      if (!roleAllowed) return send(res, 403, { error: "Bu əməliyyat hesabınızın roluna icazə verilmir." });
      if (nextStatus === "delivered" && order.despatchReady !== true) return send(res, 409, { error: "Təhvil üçün əvvəlcə irsaliye hazır olmalıdır." });
    }
    if (nextStatus !== order.status && !isOwner && !allowed[order.status]?.includes(nextStatus)) return send(res, 409, { error: "Bu mərhələ keçidi mümkün deyil." });
    const orderEdited = canEditOrder && (body.customerName !== undefined || body.note !== undefined || Array.isArray(body.items)) && nextStatus === order.status;
    if ((body.customerName !== undefined || body.note !== undefined) && !canEditOrder) return send(res, 403, { error: "Sifarişi dəyişmək icazəniz yoxdur." });
    if (canEditOrder) {
      if (body.customerName !== undefined) {
        const customerName = String(body.customerName).trim();
        if (!customerName) return send(res, 400, { error: "Müştəri adı məcburidir." });
        order.customerName = customerName;
      }
      if (body.note !== undefined) order.note = String(body.note).trim();
      if (Array.isArray(body.items)) {
        if (!body.items.length || body.items.some((item) => !item.productId || !(Number(item.quantity) > 0))) {
          return send(res, 400, { error: "Bütün məhsullar və metrajlar düzgün doldurulmalıdır." });
        }
        order.items = body.items;
      }
    }
    if (nextStatus === "ready") {
      const items = Array.isArray(body.items) ? body.items : order.items;
      if (items.some((item) => !(Number(item.preparedQuantity) > 0))) return send(res, 400, { error: "Hazır etməzdən əvvəl bütün faktiki metrajları yazın." });
      order.items = items.map((item, index) => ({ ...order.items[index], ...item, preparedRollCount: Math.max(0, Number(item.preparedRollCount) || 0) }));
    } else if (Array.isArray(body.items)) {
      order.items = body.items;
    }
    if (nextStatus !== order.status) {
      order.status = nextStatus;
      order.history ??= [];
      order.history.push({ status: nextStatus, at: now, by: actor });
      if (nextStatus === "preparing") order.preparedBy = actor;
      if (nextStatus === "ready") order.readyAt = now;
      if (previousStatus === "ready" && nextStatus === "preparing") {
        delete order.readyAt;
        order.despatchReady = false;
        order.despatchNumber = "";
        order.withoutDespatch = false;
        delete order.despatchReadyAt;
        delete order.despatchReadyBy;
      }
      if (nextStatus === "delivered") {
        const deliveryNote = String(body.deliveryNote ?? "").trim().slice(0, 500);
        if (!deliveryNote) return send(res, 400, { error: "Təhvil qeydi məcburidir." });
        const hasDeliveryProof = Boolean(order.deliveryPhoto || (order.attachments || []).some((attachment) => attachment.kind === "deliveryProof" && !attachment.deletedAt));
        if (!hasDeliveryProof) return send(res, 400, { error: "Təhvil faylı məcburidir." });
        order.deliveredAt = now;
        order.deliveredBy = actor;
        order.deliveryNote = deliveryNote;
        db.orderStockMovements ??= [];
        if (!order.isTest) for (const item of order.items || []) {
          if (item.stockMovementId) continue;
          const customerQuantity = Math.max(0, Number(item.preparedQuantity ?? item.quantity) || 0);
          const allowance = normalizeOrderCutAllowance(item);
          const product = db.orderCatalog.find((entry) => Number(entry.id) === Number(item.productId));
          const movementId = randomUUID();
          if (product) {
            product.physicalQuantity = Number(((Number(product.physicalQuantity) || 0) - allowance.stockConsumptionQuantity).toFixed(3));
            product.stockUpdatedAt = now;
            product.stockUpdatedBy = actor;
          }
          item.stockMovementId = movementId;
          item.stockPostedAt = now;
          Object.assign(item, allowance);
          db.orderStockMovements.push({
            id: movementId, orderId: order.id, orderNumber: order.number, customerName: order.customerName,
            productId: item.productId, productCode: item.productCode, productName: item.productName,
            customerQuantity, cutAllowanceQuantity: allowance.cutAllowanceMeters,
            cutPieceCount: allowance.cutPieceCount, cutAllowancePerPiece: allowance.cutAllowancePerPiece,
            stockQuantity: allowance.stockConsumptionQuantity, createdAt: now, createdBy: actor,
          });
        }
      }
      if (nextStatus === "ready") {
        notifyUsers(db, order, orderActivityRecipients(db, order), "order_ready", "Sipariş hazırlandı", `${actor} tarafından hazırlandı · ${order.number} · ${order.customerName}`, req.authUser);
      }
      if (statusWasRolledBack) {
        const previousLabel = previousStatus === "ready" ? "Hazır" : "Hazırlanıyor";
        const nextLabel = nextStatus === "preparing" ? "Hazırlanıyor" : "Yeni";
        notifyUsers(
          db,
          order,
          orderActivityRecipients(db, order),
          "order_status_returned",
          "Sipariş düzenleme için geri gönderildi",
          `${actor} tarafından geri gönderildi · ${previousLabel} → ${nextLabel} · Neden: ${rollbackReason} · ${order.number} · ${order.customerName}`,
          req.authUser,
        );
      } else if (nextStatus === "preparing") {
        notifyUsers(db, order, orderActivityRecipients(db, order), "order_preparing_started", "Sipariş hazırlanmaya başladı", `${actor} tarafından · ${order.number} · ${order.customerName}`, req.authUser);
      }
      if (nextStatus === "delivered") {
        notifyUsers(db, order, orderActivityRecipients(db, order), "order_delivered", "Sipariş teslim edildi", `${actor} tarafından teslim edildi · ${order.number} · ${order.customerName}`, req.authUser);
      }
    }
    order.audit ??= [];
    if (previousStatus !== nextStatus) {
      order.audit.push({ id: randomUUID(), action: "status", oldValue: previousStatus, newValue: nextStatus, ...(statusWasRolledBack ? { reason: rollbackReason } : {}), by: actor, userId: req.authUser?.id, at: now });
    }
    if (orderEdited) {
      const reason = String(body.editReason || "Düzenleme nedeni belirtilmedi").trim().slice(0, 300);
      if (beforeEdit.customerName !== order.customerName) order.audit.push({ id: randomUUID(), action: "customerNameEdited", oldValue: beforeEdit.customerName, newValue: order.customerName, reason, by: actor, userId: req.authUser?.id, at: now });
      if (String(beforeEdit.note || "") !== String(order.note || "")) order.audit.push({ id: randomUUID(), action: "orderNoteEdited", oldValue: beforeEdit.note || "-", newValue: order.note || "-", reason, by: actor, userId: req.authUser?.id, at: now });
      for (let index = 0; index < Math.max(beforeEdit.items.length, order.items.length); index += 1) {
        const oldItem = beforeEdit.items[index];
        const newItem = order.items[index];
        const oldSummary = oldItem ? `${oldItem.productCode || ""} ${oldItem.productName || ""} · ${Number(oldItem.quantity) || 0} mt · ${Number(oldItem.orderedRollCount) || 0} rulo` : "Satır yok";
        const newSummary = newItem ? `${newItem.productCode || ""} ${newItem.productName || ""} · ${Number(newItem.quantity) || 0} mt · ${Number(newItem.orderedRollCount) || 0} rulo` : "Satır silindi";
        if (oldSummary !== newSummary || String(oldItem?.lineNote || "") !== String(newItem?.lineNote || "")) order.audit.push({ id: randomUUID(), action: "orderItemEdited", itemIndex: index, productId: newItem?.productId || oldItem?.productId, productName: newItem?.productName || oldItem?.productName, oldValue: oldSummary, newValue: newSummary, reason, by: actor, userId: req.authUser?.id, at: now });
      }
      order.audit.push({ id: randomUUID(), action: "orderEdited", reason, by: actor, userId: req.authUser?.id, at: now });
      notifyUsers(
        db,
        order,
        orderActivityRecipients(db, order),
        "order_edited",
        "Sipariş düzenlendi",
        `${actor} tarafından düzenlendi · ${order.number} · ${order.customerName}`,
        req.authUser,
      );
    }
    if (body.saveDraft === true && order.status === "preparing") {
      order.draftUpdatedAt = now;
      order.draftUpdatedBy = actor;
      order.audit.push({ id: randomUUID(), action: "draftSaved", by: actor, userId: req.authUser?.id, at: now });
    }
    order.updatedAt = now;
    await writeDb(db);
    return send(res, 200, { data: orderWithPresence(order, req.authUser) });
  }

  if (req.method === "DELETE" && id) {
    if (normalizedRole(req.authUser?.role) !== "sahib" && !hasPermission(req.authUser, "orders.delete")) return send(res, 403, { error: "Sifarişi silmək icazəniz yoxdur." });
    const index = db.orderBoard.findIndex((item) => String(item.id) === id);
    if (index < 0) return notFound(res);
    db.orderTrash ??= [];
    const [order] = db.orderBoard.splice(index, 1);
    order.deletedAt = new Date().toISOString();
    order.deletedBy = req.authUser?.name ?? "Sahib";
    order.audit ??= [];
    order.audit.push({ id: randomUUID(), action: "deleted", by: order.deletedBy, userId: req.authUser?.id, at: order.deletedAt });
    db.orderTrash.push(order);
    orderEditorPresence.delete(String(id));
    await writeDb(db);
    return send(res, 200, { ok: true });
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

  if (req.method === "GET" && parts[1] === "aging") {
    return send(res, 200, calculateCounterpartyAging(db, kind === "supplier" ? "supplier" : "customer"));
  }

  if (req.method === "GET" && parts.length === 1) {
    const counterparties = kind ? db.counterparties.filter((item) => item.kind === kind) : db.counterparties;
    const data = counterparties.map((item) => {
      const documentType = item.kind === "supplier" ? "purchase" : "sale";
      const documents = db.documents.filter((document) =>
        document.type === documentType
        && Number(document.counterpartyId) === Number(item.id)
        && document.posted !== false
        && !["canceled", "cancelled"].includes(String(document.status))
      );
      const currencies = [...new Set(documents.map((document) => String(document.currency || "TRY")))];
      return {
        ...item,
        activityCount: documents.length,
        activityTotal: Math.round(documents.reduce((sum, document) => sum + (Number(document.total) || 0), 0) * 100) / 100,
        activityPaid: Math.round(documents.reduce((sum, document) => sum + (Number(document.paymentSummary?.paid) || 0), 0) * 100) / 100,
        activityCurrency: currencies.length === 1 ? currencies[0] : "",
      };
    });
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
for (const order of initialDb.orderBoard || []) {
  if (order.approvalForm?.status !== "approved" || order.approvalForm?.documentType !== "proforma" || order.exportPackingStatus) continue;
  const at = new Date().toISOString();
  order.exportPackingRequired = true;
  order.exportPackingStatus = "pending";
  order.status = "preparing";
  order.history ??= [];
  order.history.push({ status: "preparing", at, by: "AriX Sistem", reason: "Onaylı Proforma için Packing List palet hazırlama görevi oluşturuldu." });
  order.audit ??= [];
  order.audit.push({ id: randomUUID(), action: "exportPackingRequested", newValue: order.approvalForm.proformaNumber || order.approvalForm.number, by: "AriX Sistem", at });
  order.updatedAt = at;
}
const backfilledDeliveryNotifications = backfillTodayDeliveredNotifications(initialDb);
await writeDb(initialDb);
if (backfilledDeliveryNotifications) {
  console.log(`Backfilled ${backfilledDeliveryNotifications} delivery notifications for ${orderDayKey()}.`);
}
await closeExpiredOrderDays();

async function handleApiRequest(req, res) {
  try {
    applyCors(req, res);
    if (req.method === "OPTIONS") return send(res, 204, {});
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] !== "api") return notFound(res);
    if (parts[1] === "health") return send(res, 200, { ok: true, service: "arix-api", storage: stateStore.status(), time: new Date().toISOString() });
    if (parts[1] === "archive-sync") return await handleArchiveSync(req, res, parts.slice(2));
    if (parts[1] === "auth") return await handleAuth(req, res, parts.slice(1));

    const authDb = await readDb();
    const authUser = requestAuthUser(req, authDb);
    if (AUTH_REQUIRED && !authUser) return send(res, 401, { error: "Giriş sessiyası tələb olunur." });
    req.authUser = authUser;

    const resourcePermissions = {
      products: ["products.view", "products.manage"],
      "product-price-history": ["products.view", "products.manage"],
      "product-groups": ["products.view", "products.manage"],
      categories: ["products.view", "products.manage"],
      "stock-containers": ["products.view", "products.manage"],
      "movement-suggestions": ["products.view", "products.manage"],
      "sale-roll-suggestion": ["products.view", "products.manage"],
      "inventory-lots": ["products.view", "products.manage"],
      "product-ledger": ["products.view", "products.manage"],
      "landed-costs": ["products.view", "products.manage"],
      documents: ["documents.view", "documents.create"],
      "document-email": ["documents.view", "documents.view"],
      "e-documents": ["documents.view", "documents.edit"],
      counterparties: ["counterparties.view", "counterparties.manage"],
      "customer-prices": ["counterparties.view", "counterparties.manage"],
      stores: ["company.view", "company.manage"],
      "company-settings": ["company.view", "company.manage"],
      "payment-integrations": ["company.view", "company.manage"],
      "online-collections": ["money.view", "money.manage"],
      accounting: ["accounting.view", "accounting.manage"],
      trash: ["trash.manage", "trash.manage"],
      employees: ["employees.manage", "employees.manage"],
    };
    const permissionPair = resourcePermissions[parts[1]];
    if (parts[1] === "orders") {
      const resource = String(parts[2] || "");
      const action = String(parts[3] || "");
      let required = ["orders.view"];
      if (req.method === "GET") {
        if (resource === "notifications" && action === "history") required = ["employees.manage"];
        else if (resource === "catalog") required = ["products.view", "products.manage"];
        else if (resource === "customers") required = ["counterparties.view", "counterparties.manage"];
        else if (resource === "aliases") required = ["company.view", "company.manage"];
        else if (resource === "approval-forms") required = ["order_forms.view"];
        else if (action === "approval-form") required = ["order_forms.view"];
        else if (resource === "day") required = ["orders.days.view", "orders.days.manage"];
        else if (resource === "trash") required = ["trash.manage"];
        else if (resource === "stock-movements") required = ["products.view", "orders.audit.view"];
        else if (resource === "stock-documents") required = ["products.view", "products.manage"];
        else if (resource === "attachments") required = ["documents.view", "orders.deliver"];
        else if (resource === "exchange-rate") required = ["orders.create", "order_forms.edit"];
      } else if (resource === "notifications") required = ["orders.view"];
      else if (resource === "stock-documents") required = ["stock.adjust", "stock.writeoff", "stock.transfer", "stock.purchase", "stock.loan_purchase"];
      else if (resource === "catalog" && parts[4] === "stock-transaction") required = ["stock.adjust", "stock.writeoff", "stock.transfer", "stock.purchase", "stock.loan_purchase"];
      else if (resource === "catalog") required = ["products.manage"];
      else if (resource === "customers") required = ["counterparties.manage"];
      else if (resource === "aliases") required = ["company.manage"];
      else if (resource === "day") required = ["orders.days.manage"];
      else if (resource === "trash") required = ["trash.manage"];
      else if (!resource && req.method === "POST") required = ["orders.create"];
      else if (resource === "match") required = ["orders.create"];
      else if (action === "attachments") required = req.method === "POST" ? ["documents.create", "orders.deliver"] : ["documents.delete"];
      else if (action === "approval-form") required = ["order_forms.edit", "order_forms.approve"];
      else if (action === "delivery-photo") required = ["orders.deliver"];
      else if (action === "draft" || action === "partial-ready") required = ["orders.prepare"];
      else if (action === "despatch") required = ["orders.despatch"];
      else if (action === "presence") required = ["orders.view"];
      else if (req.method === "DELETE") required = ["orders.delete"];
      else if (req.method === "PATCH") required = ["orders.edit", "orders.prepare", "orders.rollback", "orders.deliver", "orders.delete"];
      const warehouseOrderAccess = orderWorkflowRole(authUser) === "warehouse" && (
        action === "draft" || action === "partial-ready" || action === "approval-form" || req.method === "PATCH"
      );
      if (!warehouseOrderAccess && !required.some((permission) => hasPermission(authUser, permission))) {
        return send(res, 403, { error: "Bu əməliyyat üçün icazəniz yoxdur.", permissions: required });
      }
    }
    if (permissionPair) {
      let permission = req.method === "GET" ? permissionPair[0] : permissionPair[1];
      if (parts[1] === "documents") {
        if (req.method === "PATCH" || req.method === "PUT") permission = "documents.edit";
        if (req.method === "DELETE") permission = "documents.delete";
      }
      if (!hasPermission(authUser, permission)) return send(res, 403, { error: "Bu əməliyyat üçün icazəniz yoxdur.", permission });
    }

    if (parts[1] === "products") return await handleProducts(req, res, url, parts.slice(1));
    if (parts[1] === "orders") {
      const handle = () => handleOrderBoard(req, res, url, parts.slice(1));
      return req.method === "GET" ? await handle() : await queueOrderMutation(handle);
    }
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
    if (parts[1] === "document-email") return await handleDocumentEmail(req, res);
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
}

let mutationQueue = Promise.resolve();

function enqueueMutation(task) {
  const result = mutationQueue.then(task, task);
  mutationQueue = result.catch(() => undefined);
  return result;
}

const server = createServer((req, res) => {
  const method = String(req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    void handleApiRequest(req, res);
    return;
  }
  void enqueueMutation(() => handleApiRequest(req, res));
});

server.listen(PORT, () => {
  console.log(`AriX API listening on http://localhost:${PORT}`);
});

const orderDayCloseTimer = setInterval(() => {
  void closeExpiredOrderDays().catch((error) => {
    console.error("Automatic order day close failed:", error);
  });
}, 60_000);
orderDayCloseTimer.unref();

const shutdown = () => {
  clearInterval(orderDayCloseTimer);
  server.close(() => {
    stateStore.close();
    process.exit(0);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
