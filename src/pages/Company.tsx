import { useEffect, useMemo, useState, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import QRCode from "qrcode";
import { requestJson } from "../api";
import AriXLogo from "../components/AriXLogo";
import { defaultPrintSettings, mergePrintSettings, printTemplateHasSlot, type PrintCompanyDetails, type PrintFormKey, type PrintSettings } from "../print/printSettings";
import EDocumentsSettings from "../components/EDocumentsSettings";
import { PaymentIntegrationSettings } from "./OnlineCollections";
import { showToast } from "../toast";
import OrderDocumentPaper from "../components/OrderDocumentPaper";
import orderDocumentStyles from "../../order-app/src/styles.css?raw";

export type CompanySection = "settings" | "employees" | "stores" | "accounts" | "loyalty" | "printForms" | "eDocuments" | "paymentIntegrations";
type StockMode = "simple" | "bondedRolls";
type ExchangeRateSource = "tcmb" | "cbar" | "frankfurter" | "manual";
type DocumentRateDay = "instant" | "previousDay" | "twoDaysBefore";
type TcmbRateType = "banknote" | "forex";
type ExchangeSettings = {
  source: ExchangeRateSource;
  documentRateDay: DocumentRateDay;
  tcmbRateType: TcmbRateType;
  baseCurrency: string;
  symbols: string[];
  manualRates: Record<string, number>;
};
type CompanySettings = {
  stockMode: StockMode;
  allowNegativeStock: boolean;
  reserveBeforeBondedExit: boolean;
  rollTracking: boolean;
  exchangeSettings: ExchangeSettings;
  printSettings: PrintSettings;
  eDocumentSettings?: { company?: Partial<PrintCompanyDetails> };
};
type CompanyStore = {
  id: number;
  key: string;
  name: string;
  type: string;
  isBonded: boolean;
  status: "active" | "inactive";
  createdAt: string;
};

const defaultCompanySettings: CompanySettings = {
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
    manualRates: { USD: 0, EUR: 0, AZN: 0 },
  },
  printSettings: defaultPrintSettings,
};

type ExchangeRatePreview = {
  source: ExchangeRateSource | "manual";
  sourceLabel: string;
  rateType?: TcmbRateType;
  sourceBaseCurrency?: string;
  date: string;
  requestedOffset: number;
  fallbackDays?: number | null;
  baseCurrency: string;
  rates: Record<string, number>;
  url?: string;
};

const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");

const mergeCompanySettings = (data?: Partial<CompanySettings>): CompanySettings => ({
  ...defaultCompanySettings,
  ...(data ?? {}),
  exchangeSettings: {
    ...defaultCompanySettings.exchangeSettings,
    ...(data?.exchangeSettings ?? {}),
    manualRates: {
      ...defaultCompanySettings.exchangeSettings.manualRates,
      ...(data?.exchangeSettings?.manualRates ?? {}),
    },
    symbols: Array.isArray(data?.exchangeSettings?.symbols)
      ? data.exchangeSettings.symbols
      : defaultCompanySettings.exchangeSettings.symbols,
  },
  printSettings: mergePrintSettings(data?.printSettings),
});

const preparePrintImage = (file: File) =>
  new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Şəkil faylı seçin."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Şəkil oxunmadı."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Şəkil açıla bilmədi."));
      image.onload = () => {
        const scale = Math.min(1, 900 / image.width, 320 / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Şəkil hazırlana bilmədi."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

const I = {
  Building: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 21h16" /><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" />
    </svg>
  ),
  User: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  Wallet: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><path d="M16 13h5" />
    </svg>
  ),
  File: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h6M10 17h4" />
    </svg>
  ),
  Eye: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  More: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
    </svg>
  ),
  Phone: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.2 19.2 0 0 1-5.9-5.9A19.7 19.7 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.7 2.6a2 2 0 0 1-.4 2.1L8.1 9.7a16 16 0 0 0 6.2 6.2l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.6 2.6.7A2 2 0 0 1 22 16.9Z" />
    </svg>
  ),
  Mail: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
    </svg>
  ),
  Plus: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Edit: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  ),
  Trash: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />
    </svg>
  ),
};

const titles: Record<CompanySection, { title: string; subtitle: string }> = {
  settings: { title: "Şirkət parametrləri", subtitle: "Rekvizitlər, vergi, valyuta və əlaqə məlumatları." },
  employees: { title: "Əməkdaşlar", subtitle: "Komanda, rollar və sistem girişləri." },
  stores: { title: "Mağazalar", subtitle: "Mağaza, anbar və satış nöqtələri." },
  accounts: { title: "Hesablar", subtitle: "Kassa, bank və mağaza hesabları." },
  loyalty: { title: "Sadiqlik", subtitle: "Endirim, bonus və müştəri sadiqliyi qaydaları." },
  printForms: { title: "Çap formaları", subtitle: "Sənəd, qəbz və etiket şablonları." },
  eDocuments: { title: "e-Belgələr", subtitle: "e-Fatura, e-Arşiv və e-İrsaliye bağlantıları." },
  paymentIntegrations: { title: "Ödəniş inteqrasiyaları", subtitle: "Xarici sistemlərdən ödənişlərin alınması və cari hesaba işlənməsi." },
};

type Employee = { id: string; name: string; role: string; phone: string; email: string; active: boolean; invitePending: boolean; passwordEnabled?: boolean; passwordChangeRequired?: boolean; permissions: string[] };
type PermissionItem = { key: string; group: string; action: string };

const permissionGroupLabels: Record<string, string> = {
  dashboard: "Ana səhifə", products: "Məhsullar və stok", documents: "Sənədlər", money: "Pul fəaliyyəti",
  counterparties: "Kontragentlər", company: "Şirkət ayarları", employees: "Əməkdaşlar", accounting: "Mühasibat", reports: "Hesabatlar", trash: "Silinənlər",
};
const permissionActionLabels: Record<string, string> = { view: "Görmək", create: "Yaratmaq", edit: "Dəyişmək", delete: "Silmək", manage: "İdarə etmək" };

type FinancialAccount = {
  id: string;
  name: string;
  type: "bank" | "cash" | "store";
  bankName: string;
  branchName: string;
  iban: string;
  accountNumber: string;
  currency: string;
  accountingCode: string;
  currentBalance: number;
  integrationMode: "api" | "open_banking" | "file" | "manual";
  status: "active" | "inactive";
};

type CompanyCard = {
  id: string;
  financialAccountId: string;
  name: string;
  kind: "credit" | "debit" | "prepaid" | "virtual";
  lastFour: string;
  holderName: string;
  network: string;
  currency: string;
  creditLimit: number;
  statementDay: number;
  paymentDay: number;
  status: "active" | "inactive";
  transactions: CardTransaction[];
};

type CardTransaction = {
  id: string;
  externalId: string;
  direction: "expense" | "refund";
  amount: number;
  currency: string;
  transactionAt: string;
  merchantName: string;
  description: string;
  installmentCount: number;
  status: "invoice_unmatched" | "matched";
};

type AccountBankTransaction = {
  id: string;
  direction: "in" | "out";
  amount: number;
  currency: string;
  bookedAt: string;
  counterpartyName: string;
  description: string;
  status: string;
  matchedDocumentTitle?: string;
  suggestions?: Array<{ documentId: string; documentType: string; title: string; counterpartyName: string; amount: number; documentDate: string; confidence: string; score: number; reason: string }>;
};

type AccountMoneyDocument = {
  id: string;
  type: "cashIn" | "cashOut" | "cashTransfer";
  documentDate?: string;
  createdAt?: string;
  counterpartyName?: string;
  category?: string;
  amount?: number;
  total?: number;
  bankMatchStatus?: "pending" | "matched";
  bankTransactionId?: string;
  linkedDocument?: string;
};

type AccountVirtualPos = {
  id: string;
  providerName: string;
  connectionLabel: string;
  merchantId: string;
  terminalId: string;
  currency: string;
  active: boolean;
  settlements: Array<{ id: string; batchReference: string; grossAmount: number; commissionAmount: number; netAmount: number; expectedSettlementAt: string; status: string }>;
  transactions: Array<{ id: string; externalId: string; amount: number; currency: string; paidAt: string; counterpartyName?: string; rawCustomerName?: string; settlementStatus?: string }>;
};

type FinancialAccountDetails = {
  account: FinancialAccount;
  bankTransactions: AccountBankTransaction[];
  moneyDocuments: AccountMoneyDocument[];
  cards: CompanyCard[];
  virtualPos: AccountVirtualPos[];
};

const printGroups: Array<{ title: string; forms: Array<{ key: PrintFormKey; label: string; description: string }> }> = [
  {
    title: "GİB e-Belgələri",
    forms: [
      { key: "eInvoice", label: "e-Fatura", description: "e-Fatura mükəlləfləri üçün rəsmi fatura" },
      { key: "eArchive", label: "e-Arşiv Fatura", description: "e-Fatura mükəlləfi olmayan alıcılar" },
      { key: "eDespatch", label: "e-İrsaliye", description: "Sevkiyyat və mal çıxışı sənədi" },
      { key: "exportInvoice", label: "İhracat e-Fatura", description: "IHRACAT ssenarili xarici satış faturası" },
    ],
  },
  {
    title: "Əməliyyat sənədləri",
    forms: [
      { key: "sale", label: "Satış sənədi", description: "Satış, məhsul və ödəniş məlumatları" },
      { key: "orderConfirmation", label: "Sipariş onay formu", description: "Adi satışlar üçün müştəri təsdiq forması" },
      { key: "proforma", label: "Proforma invoice", description: "İxracat üçün ilkin invoice, KDV-siz" },
      { key: "commercial", label: "Commercial invoice", description: "Rəsmi ixrac invoice forması" },
      { key: "packingList", label: "Packing list", description: "Göndərilən palet, rulo və çəki siyahısı" },
      { key: "purchase", label: "Alış sənədi", description: "Təchizatçıdan alış və palet detalları" },
      { key: "movement", label: "Yerdəyişmə sənədi", description: "Mağazalar arasında stok hərəkəti" },
      { key: "customs", label: "Antrepo düşüm", description: "Bəyannamə, palet və rulo siyahısı" },
    ],
  },
  {
    title: "Anbar və maliyyə",
    forms: [
      { key: "inventory", label: "İnventar siyahısı", description: "Faktiki və sistem qalığı" },
      { key: "writeOff", label: "Silinmə aktı", description: "Stokdan silinən məhsullar" },
      { key: "receipt", label: "Ödəniş qəbzi", description: "Kontragent ödəniş məlumatları" },
      { key: "label", label: "Məhsul etiketi", description: "Məhsul və barkod məlumatları" },
    ],
  },
];

const eDocumentPrintKeys: PrintFormKey[] = ["eInvoice", "eArchive", "eDespatch", "exportInvoice"];
const isEDocumentPrintKey = (key: PrintFormKey) => eDocumentPrintKeys.includes(key);

const requiredXmlSlots: Record<"invoice" | "despatch", string[]> = {
  invoice: ["EXTENSIONS", "COMMON", "TYPE_CODE", "CURRENCY", "LINE_COUNT", "XSLT", "SIGNATURE", "SUPPLIER", "CUSTOMER", "TAX_TOTAL", "MONETARY_TOTAL", "LINES"],
  despatch: ["EXTENSIONS", "COMMON", "TYPE_CODE", "LINE_COUNT", "XSLT", "SIGNATURE", "SUPPLIER", "CUSTOMER", "SHIPMENT", "LINES"],
};

const validateXmlTemplate = (key: PrintFormKey, template: string) => {
  if (!template.trim()) return { ok: false, message: "XML şablonu boş ola bilməz." };
  if (!isEDocumentPrintKey(key)) {
    const parsed = new DOMParser().parseFromString(template, "application/xml");
    if (parsed.querySelector("parsererror")) return { ok: false, message: "XML quruluşu düzgün deyil. Açılan və bağlanan teqləri yoxlayın." };
    if (parsed.documentElement.localName !== "ArixPrintForm") return { ok: false, message: "Kök element ArixPrintForm olmalıdır." };
    if (parsed.documentElement.getAttribute("key") !== key) return { ok: false, message: `Forma key dəyəri ${key} olmalıdır.` };
    if (!/\{\{[A-Z_]+\}\}/.test(template)) return { ok: false, message: "XML formasında ən azı bir çap bloku qalmalıdır." };
    return { ok: true, message: "Forma XML quruluşu düzgündür və önizləməyə tətbiq olunur." };
  }
  const kind = key === "eDespatch" ? "despatch" : "invoice";
  const missing = requiredXmlSlots[kind].filter((slot) => !template.includes(`{{${slot}}}`));
  if (missing.length > 0) return { ok: false, message: `Məcburi XML sahələri əskikdir: ${missing.join(", ")}` };
  const parsed = new DOMParser().parseFromString(template, "application/xml");
  if (parsed.querySelector("parsererror")) return { ok: false, message: "XML quruluşu düzgün deyil. Açılan və bağlanan teqləri yoxlayın." };
  const expectedRoot = kind === "despatch" ? "DespatchAdvice" : "Invoice";
  if (parsed.documentElement.localName !== expectedRoot) return { ok: false, message: `Kök element ${expectedRoot} olmalıdır.` };
  return { ok: true, message: "XML quruluşu və məcburi UBL-TR sahələri düzgündür." };
};

const toneClass = (tone: string, isDark: boolean) => {
  const dark: Record<string, string> = {
    amber: "bg-amber-400/12 text-amber-200",
    emerald: "bg-emerald-400/12 text-emerald-200",
    indigo: "bg-indigo-400/12 text-indigo-200",
    sky: "bg-sky-400/12 text-sky-200",
    violet: "bg-violet-400/12 text-violet-200",
  };
  const light: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    indigo: "bg-indigo-50 text-indigo-700",
    sky: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (isDark ? dark : light)[tone] ?? (isDark ? dark.indigo : light.indigo);
};

export default function Company({ section, isDark = false }: { section: CompanySection; isDark?: boolean }) {
  const meta = titles[section];
  const border = isDark ? "border-white/10" : "border-white/60";
  const card = isDark ? "glass-panel-dark text-slate-100" : "glass-panel text-slate-900";
  const soft = isDark ? "bg-white/5" : "bg-white/55";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const input = cx("h-11 min-w-0 w-full rounded-xl border px-3 outline-none", border, isDark ? "bg-white/5 text-slate-100" : "bg-white/75 text-slate-800");
  const [companyStores, setCompanyStores] = useState<CompanyStore[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeError, setEmployeeError] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [companyJoinCode, setCompanyJoinCode] = useState("");
  const loadEmployees = async () => {
    try {
      const [payload, joinPayload] = await Promise.all([
        requestJson<{ data: Employee[] }>("/api/employees"),
        requestJson<{ data: { configured: boolean; code: string } }>("/api/employees/join-code").catch(() => ({ data: { configured: false, code: "" } })),
      ]);
      setEmployees(payload.data);
      setCompanyJoinCode(joinPayload.data.code);
      setEmployeeError("");
    } catch (error) { setEmployeeError(error instanceof Error ? error.message : "Əməkdaşlar yüklənmədi."); }
  };
  useEffect(() => { if (section === "employees") void loadEmployees(); }, [section]);
  const createEmployee = async (details: { name: string; email: string; role: string; phone: string; temporaryPassword?: string }) => {
    try {
      const payload = await requestJson<{ inviteCode: string; temporaryPassword: string }>("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details) });
      setInviteCode(payload.inviteCode);
      setTemporaryPassword(payload.temporaryPassword);
      await loadEmployees();
    } catch (error) { setEmployeeError(error instanceof Error ? error.message : "Əməkdaş yaradıla bilmədi."); throw error; }
  };

  const loadStores = async () => {
    try {
      const payload = await requestJson<{ data: CompanyStore[] }>("/api/stores");
      setCompanyStores(Array.isArray(payload.data) ? payload.data : []);
    } catch {
      // Preserve the last successful store list during connection loss.
    }
  };

  useEffect(() => {
    if (section !== "stores") return;
    void loadStores();
  }, [section]);

  const stats = useMemo(() => {
    if (section === "employees") return [{ label: "Cəmi əməkdaş", value: String(employees.length) }, { label: "Aktiv", value: String(employees.filter((item) => item.active).length) }, { label: "Dəvət gözləyən", value: String(employees.filter((item) => item.invitePending).length) }];
    if (section === "stores") return [
      { label: "Mağaza", value: String(companyStores.filter((store) => !store.isBonded).length) },
      { label: "Antrepo", value: String(companyStores.filter((store) => store.isBonded).length) },
      { label: "Aktiv nöqtə", value: String(companyStores.filter((store) => store.status === "active").length) },
    ];
    if (section === "accounts") return [];
    if (section === "printForms") {
      const templateCount = printGroups.reduce((total, group) => total + group.forms.length, 0);
      return [{ label: "Şablon", value: String(templateCount) }, { label: "Aktiv", value: String(templateCount) }, { label: "Qrup", value: String(printGroups.length) }];
    }
    if (section === "eDocuments") return [{ label: "Mühit", value: "Test" }, { label: "Provayder", value: "AriX Test" }, { label: "Modul", value: "5" }];
    if (section === "paymentIntegrations") return [];
    return [{ label: "Profil", value: "Hazır" }, { label: "Valyuta", value: "AZN" }, { label: "Ölkə", value: "Azərbaycan" }];
  }, [companyStores, employees, section]);

  const stockModes: { id: StockMode; title: string; subtitle: string; points: string[] }[] = [
    {
      id: "simple",
      title: "Sadə stok",
      subtitle: "Palet və rulo izləməsi olmayan firmalar üçün klassik anbar qalığı.",
      points: ["Məhsul üzrə ümumi miqdar", "Antrepo və depo balansı", "Satışda miqdar birbaşa azalır"],
    },
    {
      id: "bondedRolls",
      title: "Antrepo / rulo izləmə",
      subtitle: "Konteyner, palet və tam rulo seçimi ilə gömrük anbarı axını.",
      points: ["Konteyner → palet → rulo strukturu", "Rezerv → depoya çəkim / ixrac", "Net və gross kilo izləmə"],
    },
  ];

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-0 min-w-0 flex-col space-y-4 overflow-hidden" data-stock-mode-count={stockModes.length}>
      <div className={cx("shrink-0 rounded-2xl border p-4", border, card)}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className={cx("text-xs font-semibold uppercase tracking-wide", subtle)}>Şirkət / {meta.title}</div>
            <h1 className="mt-1 text-2xl font-semibold">{meta.title}</h1>
            <p className={cx("mt-1 text-sm", subtle)}>{meta.subtitle}</p>
          </div>
          {section !== "settings" && section !== "accounts" && section !== "printForms" && section !== "eDocuments" && section !== "paymentIntegrations" && (
            <button
              type="button"
              onClick={() => {
                if (section === "stores") window.dispatchEvent(new Event("arix:create-store"));
                if (section === "employees") window.dispatchEvent(new Event("arix:create-employee"));
              }}
              className="surface-primary h-10 rounded-xl px-4 text-sm font-semibold"
            >
              Yarat
            </button>
          )}
        </div>
      </div>

      {stats.length > 0 && (
        <div className="grid shrink-0 gap-3 md:grid-cols-3">
          {stats.map((item) => (
            <div key={item.label} className={cx("rounded-2xl border p-4", border, card)}>
              <div className={cx("text-xs font-semibold", subtle)}>{item.label}</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {section === "settings" && <SettingsView border={border} card={card} subtle={subtle} input={input} />}
      {section === "printForms" && <PrintFormsView border={border} card={card} soft={soft} subtle={subtle} input={input} isDark={isDark} />}
      {section !== "settings" && section !== "printForms" && (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl pb-4 [scrollbar-gutter:stable]">
          {section === "employees" && <EmployeesView employees={employees} error={employeeError} inviteCode={inviteCode} temporaryPassword={temporaryPassword} companyJoinCode={companyJoinCode} onCreate={createEmployee} onChanged={loadEmployees} border={border} card={card} soft={soft} subtle={subtle} isDark={isDark} />}
          {section === "stores" && <StoresView stores={companyStores} onChanged={loadStores} border={border} card={card} soft={soft} subtle={subtle} input={input} />}
          {section === "accounts" && <AccountsView border={border} card={card} soft={soft} subtle={subtle} />}
          {section === "loyalty" && <LoyaltyView border={border} card={card} soft={soft} subtle={subtle} />}
          {section === "eDocuments" && <EDocumentsSettings border={border} card={card} subtle={subtle} input={input} isDark={isDark} />}
          {section === "paymentIntegrations" && <PaymentIntegrationSettings isDark={isDark} />}
        </div>
      )}
    </div>
  );
}

function SettingsView({ border, card, subtle, input }: { border: string; card: string; subtle: string; input: string }) {
  const [settings, setSettings] = useState<CompanySettings>(defaultCompanySettings);
  const [saving, setSaving] = useState(false);
  const [ratePreview, setRatePreview] = useState<ExchangeRatePreview | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateMessage, setRateMessage] = useState("");

  useEffect(() => {
    let alive = true;
    requestJson<{ data: CompanySettings }>("/api/company-settings")
      .then((payload) => {
        if (alive) setSettings(mergeCompanySettings(payload.data));
      })
      .catch(() => {
        /* keep defaults when API is unavailable */
      });
    return () => {
      alive = false;
    };
  }, []);

  const saveStockMode = async (stockMode: StockMode) => {
    const nextSettings = {
      ...settings,
      stockMode,
      rollTracking: stockMode === "bondedRolls",
      reserveBeforeBondedExit: stockMode === "bondedRolls" ? true : settings.reserveBeforeBondedExit,
    };
    setSettings(nextSettings);
    setSaving(true);
    try {
      const payload = await requestJson<{ data: CompanySettings }>("/api/company-settings", {
        method: "PATCH",
        body: JSON.stringify(nextSettings),
      });
      setSettings(mergeCompanySettings(payload.data));
      window.dispatchEvent(new CustomEvent("arix:company-settings-updated", { detail: payload.data }));
    } catch {
      /* optimistic UI remains; next save will retry */
    } finally {
      setSaving(false);
    }
  };

  const saveExchangeSettings = async (exchangeSettings = settings.exchangeSettings) => {
    const nextSettings = { ...settings, exchangeSettings };
    setSettings(nextSettings);
    setSaving(true);
    setRateMessage("");
    try {
      const payload = await requestJson<{ data: CompanySettings }>("/api/company-settings", {
        method: "PATCH",
        body: JSON.stringify({ exchangeSettings }),
      });
      setSettings(mergeCompanySettings(payload.data));
      setRateMessage("Məzənnə ayarları saxlandı.");
      window.dispatchEvent(new CustomEvent("arix:company-settings-updated", { detail: payload.data }));
    } catch (error) {
      setRateMessage(error instanceof Error ? error.message : "Məzənnə ayarları saxlanmadı.");
    } finally {
      setSaving(false);
    }
  };

  const loadExchangePreview = async (exchangeSettings = settings.exchangeSettings, options: { silent?: boolean } = {}) => {
    if (exchangeSettings.source === "manual") {
      setRateLoading(false);
      setRatePreview({
        source: "manual",
        sourceLabel: "Manual",
        date: new Date().toISOString().slice(0, 10),
        requestedOffset: 0,
        fallbackDays: 0,
        sourceBaseCurrency: exchangeSettings.baseCurrency,
        baseCurrency: exchangeSettings.baseCurrency,
        rates: {
          ...exchangeSettings.manualRates,
          [exchangeSettings.baseCurrency]: 1,
        },
        url: "",
      });
      if (!options.silent) setRateMessage("Manual kurslar göstərilir.");
      return;
    }
    setRateLoading(true);
    if (!options.silent) setRateMessage("");
    try {
      const params = new URLSearchParams({
        source: exchangeSettings.source,
        dayMode: exchangeSettings.documentRateDay,
        tcmbRateType: exchangeSettings.tcmbRateType,
        baseCurrency: exchangeSettings.baseCurrency,
        symbols: exchangeSettings.symbols.join(","),
      });
      const payload = await requestJson<{ data: ExchangeRatePreview }>(`/api/exchange-rates?${params.toString()}`);
      setRatePreview(payload.data);
      if (!options.silent) setRateMessage(`${payload.data.sourceLabel} kursu alındı: ${payload.data.date}`);
    } catch (error) {
      if (!options.silent) setRateMessage(error instanceof Error ? error.message : "Məzənnə alınmadı.");
    } finally {
      setRateLoading(false);
    }
  };

  useEffect(() => {
    const current = settings.exchangeSettings;
    if (!current.symbols.length) {
      setRatePreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void loadExchangePreview(current, { silent: true });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    settings.exchangeSettings.source,
    settings.exchangeSettings.documentRateDay,
    settings.exchangeSettings.tcmbRateType,
    settings.exchangeSettings.baseCurrency,
    settings.exchangeSettings.symbols.join(","),
    settings.exchangeSettings.manualRates,
  ]);

  const updateExchangeSettings = (patch: Partial<ExchangeSettings>) => {
    setSettings((current) => ({
      ...current,
      exchangeSettings: {
        ...current.exchangeSettings,
        ...patch,
      },
    }));
  };

  const updateManualRate = (symbol: string, value: string) => {
    const numeric = Number(value.replace(",", "."));
    updateExchangeSettings({
      manualRates: {
        ...settings.exchangeSettings.manualRates,
        [symbol]: Number.isFinite(numeric) ? numeric : 0,
      },
    });
  };

  const stockModes: { id: StockMode; title: string; subtitle: string; points: string[] }[] = [
    {
      id: "simple",
      title: "Sadə stok",
      subtitle: "Palet və rulo izləməsi olmayan firmalar üçün klassik anbar qalığı.",
      points: ["Məhsul üzrə ümumi miqdar", "Antrepo və depo balansı", "Satışda miqdar birbaşa azalır"],
    },
    {
      id: "bondedRolls",
      title: "Antrepo / rulo izləmə",
      subtitle: "Konteyner, palet və tam rulo seçimi ilə gömrük anbarı axını.",
      points: ["Konteyner → palet → rulo strukturu", "Rezerv → depoya çəkim / ixrac", "Net və gross kilo izləmə"],
    },
  ];
  const tabs = ["Əsaslar", "Rekvizitlər", "Vergilər", "Email hesabı", "Məlumatlar"];
  return (
    <div className={cx("min-h-0 flex-1 overflow-y-auto rounded-2xl border p-5 [scrollbar-gutter:stable]", border, card)}>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-3xl font-semibold">AriX</h2>
          <p className={cx("mt-1 text-sm", subtle)}>Yaradıldı 22 sentyabr 2024</p>
        </div>
        <div className={cx("text-right text-3xl font-semibold", subtle)}>
          Şirkət
          <div className="mt-1 text-sm font-medium">ID 66f01208b6f19c57377baaea</div>
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab, index) => (
          <button key={tab} type="button" className={cx("h-10 rounded-xl px-4 text-sm font-semibold", index === 0 ? "surface-nav-active text-indigo-700" : "hover:bg-white/50")}>
            {tab}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Təşkilatın adı" className="lg:col-span-2"><input className={input} defaultValue="AriX" /></Field>
        <Field label="Ölkə"><select className={input} defaultValue="Azərbaycan"><option>Azərbaycan</option><option>Türkiyə</option></select></Field>
        <Field label="Əsas valyuta"><select className={input} defaultValue="AZN"><option>AZN</option><option>USD</option><option>TRY</option></select></Field>
        <Field label="Valyuta göstər" className="lg:col-span-2"><input className={input} defaultValue="₼" /></Field>
        <Field label="Çəki mallarının prefiks barkodu" className="lg:col-span-2"><input className={input} defaultValue="21" /></Field>
        <Field label="Telefon" className="lg:col-span-2"><input className={input} defaultValue="+994 50 000 00 00" /></Field>
        <Field label="E-poçt" className="lg:col-span-2"><input className={input} placeholder="mail@arix.az" /></Field>
        <Field label="Sayt" className="lg:col-span-2"><input className={input} placeholder="www.example.com" /></Field>
      </div>
      <div className={cx("mt-6 rounded-2xl border p-4", border, card)}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-lg font-semibold">Valyuta məzənnələri</div>
            <p className={cx("mt-1 text-sm", subtle)}>
              Sənədlərdə istifadə olunacaq kurs mənbəyini və tarix qaydasını seçin.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadExchangePreview()}
              disabled={rateLoading}
              className={cx("h-10 rounded-xl border px-4 text-sm font-semibold", border, rateLoading ? "opacity-60" : "hover:bg-white/50")}
            >
              {rateLoading ? "Yoxlanılır..." : "Kursu yoxla"}
            </button>
            <button
              type="button"
              onClick={() => void saveExchangeSettings()}
              disabled={saving}
              className="surface-primary h-10 rounded-xl px-4 text-sm font-semibold"
            >
              Saxla
            </button>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div>
              <div className={cx("mb-2 text-sm font-semibold", subtle)}>Kurs mənbəyi</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { id: "tcmb" as const, title: "TCMB", subtitle: "Türkiyə Mərkəzi Bankı" },
                  { id: "cbar" as const, title: "AMB / CBAR", subtitle: "Azərbaycan Mərkəzi Bankı" },
                  { id: "frankfurter" as const, title: "ECB", subtitle: "Frankfurter alternativ" },
                  { id: "manual" as const, title: "Manual", subtitle: "Kursu əllə yaz" },
                ].map((source) => {
                  const active = settings.exchangeSettings.source === source.id;
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => updateExchangeSettings({ source: source.id })}
                      className={cx(
                        "rounded-2xl border p-3 text-left transition",
                        active ? "border-indigo-400 bg-indigo-500/10 text-indigo-700 shadow-sm" : cx(border, "hover:bg-white/50")
                      )}
                    >
                      <div className="text-sm font-semibold">{source.title}</div>
                      <div className={cx("mt-1 text-xs", subtle)}>{source.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            {settings.exchangeSettings.source === "tcmb" ? (
              <div>
                <div className={cx("mb-2 text-sm font-semibold", subtle)}>TCMB kurs tipi</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { id: "banknote" as const, title: "Banknote / effektiv", subtitle: "Efektiv satış kursu, məsələn 46.4253" },
                    { id: "forex" as const, title: "Forex", subtitle: "Döviz satış kursu, məsələn 46.3557" },
                  ].map((rateType) => {
                    const active = settings.exchangeSettings.tcmbRateType === rateType.id;
                    return (
                      <button
                        key={rateType.id}
                        type="button"
                        onClick={() => updateExchangeSettings({ tcmbRateType: rateType.id })}
                        className={cx(
                          "rounded-2xl border p-3 text-left transition",
                          active ? "border-indigo-400 bg-indigo-500/10 text-indigo-700 shadow-sm" : cx(border, "hover:bg-white/50")
                        )}
                      >
                        <div className="text-sm font-semibold">{rateType.title}</div>
                        <div className={cx("mt-1 text-xs", subtle)}>{rateType.subtitle}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div>
              <div className={cx("mb-2 text-sm font-semibold", subtle)}>Sənəddə kurs günü</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { id: "instant" as const, title: "Anlıq", subtitle: "Bugünkü kurs" },
                  { id: "previousDay" as const, title: "1 gün əvvəl", subtitle: "Standart sənəd kursu" },
                  { id: "twoDaysBefore" as const, title: "2 gün əvvəl", subtitle: "Gecikməli hesablama" },
                ].map((day) => {
                  const active = settings.exchangeSettings.documentRateDay === day.id;
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => updateExchangeSettings({ documentRateDay: day.id })}
                      className={cx(
                        "rounded-2xl border p-3 text-left transition",
                        active ? "border-indigo-400 bg-indigo-500/10 text-indigo-700 shadow-sm" : cx(border, "hover:bg-white/50")
                      )}
                    >
                      <div className="text-sm font-semibold">{day.title}</div>
                      <div className={cx("mt-1 text-xs", subtle)}>{day.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[0.45fr_1fr]">
              <Field label="Baza valyuta">
                <select
                  className={input}
                  value={settings.exchangeSettings.baseCurrency}
                  onChange={(event) => updateExchangeSettings({ baseCurrency: event.target.value })}
                >
                  <option value="TRY">TRY</option>
                  <option value="AZN">AZN</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </Field>
              <Field label="İzlənən valyutalar">
                <input
                  className={input}
                  value={settings.exchangeSettings.symbols.join(", ")}
                  onChange={(event) =>
                    updateExchangeSettings({
                      symbols: event.target.value
                        .split(",")
                        .map((symbol) => symbol.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                  placeholder="USD, EUR, AZN"
                />
              </Field>
            </div>
          </div>
          <div className={cx("rounded-2xl border p-4", border, card)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Kurs ön baxışı</div>
                <p className={cx("mt-1 text-xs", subtle)}>
                  {ratePreview ? `${ratePreview.sourceLabel} · ${ratePreview.date}` : "Yoxlama ilə real kurslar görünəcək."}
                </p>
              </div>
              <span className={cx("rounded-full px-3 py-1 text-xs font-semibold", settings.exchangeSettings.source === "manual" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                {settings.exchangeSettings.source === "manual" ? "Manual" : "Online"}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {settings.exchangeSettings.symbols.map((symbol) => {
                const rate = settings.exchangeSettings.source === "manual"
                  ? settings.exchangeSettings.manualRates[symbol] ?? 0
                  : ratePreview?.rates?.[symbol] ?? 0;
                return (
                  <div key={symbol} className={cx("flex items-center gap-3 rounded-xl border px-3 py-2", border)}>
                    <div className="w-14 text-sm font-semibold">{symbol}</div>
                    {settings.exchangeSettings.source === "manual" ? (
                      <input
                        className={cx(input, "h-9 flex-1 text-right")}
                        value={settings.exchangeSettings.manualRates[symbol] ?? ""}
                        onChange={(event) => updateManualRate(symbol, event.target.value)}
                        placeholder="0.0000"
                      />
                    ) : (
                      <div className="flex-1 text-right text-sm font-semibold">
                        {rate ? rate.toLocaleString("tr-TR", { maximumFractionDigits: 4 }) : "-"}
                      </div>
                    )}
                    <div className={cx("text-xs", subtle)}>{settings.exchangeSettings.baseCurrency}</div>
                  </div>
                );
              })}
            </div>
            {rateMessage ? (
              <div className={cx("mt-3 text-sm", rateMessage.includes("alınmadı") || rateMessage.includes("saxlanmadı") ? "text-rose-600" : "text-emerald-600")}>
                {rateMessage}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-6">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-lg font-semibold">Stok modeli</div>
            <p className={cx("text-sm", subtle)}>Firma tipinə görə stokun necə izlənəcəyini seçin.</p>
          </div>
          <span className={cx("text-xs", subtle)}>{saving ? "Saxlanılır..." : "Seçim avtomatik tətbiq olunur"}</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {stockModes.map((mode) => {
            const active = settings.stockMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => void saveStockMode(mode.id)}
                className={cx(
                  "rounded-2xl border p-4 text-left transition",
                  active
                    ? "border-indigo-400 bg-indigo-500/10 shadow-sm shadow-indigo-500/15"
                    : cx(border, "hover:bg-white/45")
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">{mode.title}</div>
                    <p className={cx("mt-1 text-sm leading-5", subtle)}>{mode.subtitle}</p>
                  </div>
                  <span className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs", active ? "border-indigo-500 bg-indigo-600 text-white" : border)}>
                    {active ? "✓" : ""}
                  </span>
                </div>
                <div className="mt-4 grid gap-2">
                  {mode.points.map((point) => (
                    <div key={point} className={cx("flex items-center gap-2 text-sm", subtle)}>
                      <span className={cx("h-1.5 w-1.5 rounded-full", active ? "bg-indigo-500" : "bg-slate-400")} />
                      {point}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" className="surface-primary mt-6 h-11 rounded-xl px-6 text-sm font-semibold">Saxlamaq</button>
    </div>
  );
}

function EmployeesView({ employees, error, inviteCode, temporaryPassword, companyJoinCode, onCreate, onChanged, border, card, soft, subtle, isDark }: { employees: Employee[]; error: string; inviteCode: string; temporaryPassword: string; companyJoinCode: string; onCreate: (details: { name: string; email: string; role: string; phone: string; temporaryPassword?: string }) => Promise<void>; onChanged: () => Promise<void>; border: string; card: string; soft: string; subtle: string; isDark: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [requests, setRequests] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [requestError, setRequestError] = useState("");
  const refreshRequests = async () => { try { const result = await requestJson<{ data: typeof requests }>("/api/auth/requests"); setRequests(result.data); setRequestError(""); } catch { /* preserve last successful list */ } };
  useEffect(() => { void refreshRequests(); }, []);
  useEffect(() => {
    const open = () => setShowForm(true);
    window.addEventListener("arix:create-employee", open);
    return () => window.removeEventListener("arix:create-employee", open);
  }, []);
  const decide = async (id: string, approve: boolean) => {
    try { await requestJson("/api/auth/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, approve }) }); await refreshRequests(); window.dispatchEvent(new Event("arix:employee-requests-changed")); }
    catch (reason) { setRequestError(reason instanceof Error ? reason.message : "Xəta baş verdi"); }
  };
  const [form, setForm] = useState({ name: "", email: "", role: "Əməkdaş", phone: "", temporaryPassword: "" });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "Əməkdaş", phone: "", active: true, permissions: [] as string[] });
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionItem[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<Record<string, string[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [joinCodeEditorOpen, setJoinCodeEditorOpen] = useState(false);
  const [joinCodeDraft, setJoinCodeDraft] = useState(companyJoinCode);
  const [actionMessage, setActionMessage] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const inputClass = cx("h-11 w-full rounded-xl border px-3 outline-none", border, isDark ? "bg-white/5 text-slate-100" : "bg-white text-slate-900");
  useEffect(() => { setJoinCodeDraft(companyJoinCode); }, [companyJoinCode]);
  useEffect(() => {
    requestJson<{ data: PermissionItem[]; roleDefaults: Record<string, string[]> }>("/api/employees/permission-catalog")
      .then((payload) => { setPermissionCatalog(payload.data); setRoleDefaults(payload.roleDefaults); })
      .catch(() => { setPermissionCatalog([]); });
  }, []);
  const saveJoinCode = async (generate = false) => {
    try {
      const payload = await requestJson<{ data: { code: string } }>("/api/employees/join-code", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(generate ? { generate: true } : { code: joinCodeDraft }) });
      setJoinCodeDraft(payload.data.code); setJoinCodeEditorOpen(false); setActionMessage("Dəvət kodu yeniləndi."); await onChanged();
    } catch (reason) { setActionMessage(reason instanceof Error ? reason.message : "Dəvət kodu yenilənmədi."); }
  };
  const openEdit = (employee: Employee) => { setEditing(employee); setEditForm({ name: employee.name, email: employee.email, role: employee.role, phone: employee.phone, active: employee.active, permissions: employee.permissions ?? [] }); setResetPassword(""); setActionMessage(""); };
  const setEditRole = (role: string) => setEditForm((current) => ({ ...current, role, permissions: roleDefaults[role.toLocaleLowerCase("az")] ?? current.permissions }));
  const togglePermission = (permission: string) => setEditForm((current) => ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission] }));
  const saveEmployee = async (withPasswordReset = false) => {
    if (!editing) return;
    setSaving(true); setActionMessage("");
    try {
      const payload = await requestJson<{ temporaryPassword?: string }>(`/api/employees/${encodeURIComponent(editing.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...editForm, resetPassword: withPasswordReset }) });
      if (payload.temporaryPassword) setResetPassword(payload.temporaryPassword);
      await onChanged();
      if (!withPasswordReset) setEditing(null);
    } catch (reason) { setActionMessage(reason instanceof Error ? reason.message : "Əməkdaş yenilənmədi."); }
    finally { setSaving(false); }
  };
  const deleteEmployee = async () => {
    if (!deleteTarget) return;
    setSaving(true); setActionMessage("");
    try { await requestJson(`/api/employees/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" }); setDeleteTarget(null); await onChanged(); }
    catch (reason) { setActionMessage(reason instanceof Error ? reason.message : "Əməkdaş silinmədi."); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      {(error || requestError || actionMessage) && <div role="alert" className={cx("rounded-xl p-3 text-sm", error || requestError ? "bg-rose-500/10 text-rose-600" : "bg-indigo-500/10 text-indigo-600")}>{error || requestError || actionMessage}</div>}
      <div className="grid gap-3 xl:grid-cols-[1fr_1.4fr]">
        {companyJoinCode && <div className={cx("rounded-2xl border p-5", border, card)}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold">Şirkət dəvət kodu</div><div className="mt-3 select-all font-mono text-2xl font-semibold tracking-[0.18em]">{companyJoinCode}</div></div><button type="button" onClick={() => setJoinCodeEditorOpen(true)} title="Dəvət kodunu dəyiş" className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", border)}><I.Edit className="h-4 w-4" /></button></div><div className={cx("mt-2 text-xs", subtle)}>Öz qeydiyyatını edən əməkdaş bu kodu yazır, sonra sizin təsdiqinizi gözləyir.</div><button type="button" onClick={() => void saveJoinCode(true)} className="mt-4 text-sm font-semibold text-indigo-600">Yeni təsadüfi kod yarat</button></div>}
        <div className={cx("rounded-2xl border p-5", border, card)}><div className="flex items-center justify-between"><div><div className="font-semibold">Təsdiq gözləyən müraciətlər</div><div className={cx("mt-1 text-sm", subtle)}>{requests.length ? `${requests.length} müraciət qərar gözləyir` : "Yeni müraciət yoxdur"}</div></div>{requests.length > 0 && <span className="rounded-full bg-amber-500/12 px-3 py-1 text-sm font-semibold text-amber-600">{requests.length}</span>}</div>
          {requests.map((item) => <div key={item.id} className={cx("mt-3 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center", border, soft)}><div className="min-w-0 flex-1"><div className="truncate font-semibold">{item.name}</div><div className={cx("truncate text-sm", subtle)}>{item.email}</div></div><div className="flex gap-2"><button onClick={() => void decide(item.id, true)} className="surface-primary rounded-lg px-4 py-2 text-sm font-semibold">Təsdiqlə</button><button onClick={() => void decide(item.id, false)} className={cx("rounded-lg border px-4 py-2 text-sm", border)}>Rədd et</button></div></div>)}
        </div>
      </div>
      {temporaryPassword && <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4"><div className="font-semibold text-emerald-700">Əməkdaş yaradıldı</div><div className="mt-2 text-sm">İlkin şifrə yalnız indi göstərilir: <strong className="select-all font-mono text-base">{temporaryPassword}</strong></div><div className="mt-1 text-xs">İlk girişdə əməkdaş bu şifrəni dəyişməlidir. {inviteCode && `Dəvət kodu: ${inviteCode}`}</div></div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {employees.map((employee) => <div key={employee.email} className={cx("rounded-2xl border p-4", border, card)}><div className="flex items-start gap-3"><div className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", toneClass("indigo", isDark))}><I.User className="h-6 w-6" /></div><div className="min-w-0 flex-1"><div className="truncate font-semibold">{employee.name}</div><div className={cx("truncate text-sm", subtle)}>{employee.role}</div></div><span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", employee.active ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-500/10 text-slate-500")}>{employee.active ? "Aktiv" : "Deaktiv"}</span></div><div className={cx("mt-4 space-y-2 border-t pt-3 text-sm", border)}><div className="flex min-w-0 items-center gap-2"><I.Mail className="h-4 w-4 shrink-0 text-indigo-500" /><span className="truncate">{employee.email}</span></div>{employee.phone && <div className="flex items-center gap-2"><I.Phone className="h-4 w-4 text-indigo-500" />{employee.phone}</div>}<div className={cx("text-xs", subtle)}>{employee.passwordChangeRequired ? "İlkin şifrə dəyişdirilməlidir" : employee.passwordEnabled ? "Şifrə ilə giriş aktivdir" : "Google ilə giriş"}</div></div><div className={cx("mt-3 flex justify-end gap-2 border-t pt-3", border)}><button type="button" onClick={() => openEdit(employee)} title="Əməkdaşı redaktə et" className={cx("flex h-9 w-9 items-center justify-center rounded-xl border text-indigo-600", border)}><I.Edit className="h-4 w-4" /></button><button type="button" onClick={() => setDeleteTarget(employee)} title="Əməkdaşı sil" className={cx("flex h-9 w-9 items-center justify-center rounded-xl border text-rose-600", border)}><I.Trash className="h-4 w-4" /></button></div></div>)}
      </div>
      {joinCodeEditorOpen && createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center p-4"><button type="button" aria-label="Bağla" onClick={() => setJoinCodeEditorOpen(false)} className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" /><div className={cx("relative z-10 w-full max-w-md rounded-3xl border p-6 shadow-2xl", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900")}><h2 className="text-xl font-semibold">Dəvət kodunu dəyiş</h2><p className={cx("mt-1 text-sm", subtle)}>Köhnə kod dərhal etibarsız olacaq. Kod 8-24 hərf və rəqəmdən ibarət olmalıdır.</p><input value={joinCodeDraft} onChange={(event) => setJoinCodeDraft(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} minLength={8} maxLength={24} className={cx(inputClass, "mt-5 text-center font-mono tracking-[0.18em]")} /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setJoinCodeEditorOpen(false)} className={cx("h-11 rounded-xl border px-5 text-sm font-semibold", border)}>Ləğv et</button><button type="button" onClick={() => void saveJoinCode(false)} className="surface-primary h-11 rounded-xl px-5 text-sm font-semibold">Saxla</button></div></div></div>, document.body)}
      {editing && createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center p-4"><button type="button" aria-label="Bağla" onClick={() => setEditing(null)} className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" /><div className={cx("relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border p-6 shadow-2xl", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900")}><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">Əməkdaşı redaktə et</h2><p className={cx("mt-1 text-sm", subtle)}>Məlumatları, rolu və giriş statusunu idarə edin.</p></div><button type="button" onClick={() => setEditing(null)} className={cx("flex h-9 w-9 items-center justify-center rounded-xl border text-xl", border)}>×</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Ad soyad<input className={cx(inputClass, "mt-1.5")} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label><label className="text-sm font-medium">Rol<select className={cx(inputClass, "mt-1.5")} value={editForm.role} onChange={(e) => setEditRole(e.target.value)}><option>Əməkdaş</option><option>Rəhbər</option><option>Satış rəhbəri</option><option>Satış</option><option>Anbar əməliyyatları</option><option>Təhvilat</option><option>Maliyyə</option><option>Sahib</option></select></label><label className="text-sm font-medium sm:col-span-2">E-poçt<input type="email" className={cx(inputClass, "mt-1.5")} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></label><label className="text-sm font-medium">Telefon<input className={cx(inputClass, "mt-1.5")} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></label><label className="flex items-center gap-3 pt-6 text-sm font-medium"><input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} className="h-5 w-5 accent-indigo-600" />Aktiv giriş</label></div><div className={cx("mt-5 rounded-2xl border p-4", border)}><div className="font-semibold">Bölmə icazələri</div><p className={cx("mt-1 text-xs", subtle)}>Rol standartını dəyişə və hər icazəni ayrıca seçə bilərsiniz.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.keys(permissionGroupLabels).map((group) => <div key={group} className={cx("rounded-xl border p-3", border, soft)}><div className="mb-2 text-sm font-semibold">{permissionGroupLabels[group] ?? group}</div><div className="space-y-2">{permissionCatalog.filter((item) => item.group === group).map((item) => <label key={item.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.permissions.includes(item.key)} onChange={() => togglePermission(item.key)} className="h-4 w-4 accent-indigo-600" />{permissionActionLabels[item.action] ?? item.action}</label>)}</div></div>)}</div></div>{resetPassword && <div className="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm">Yeni ilkin şifrə: <strong className="select-all font-mono">{resetPassword}</strong></div>}<div className="mt-6 flex flex-wrap justify-between gap-2"><button type="button" onClick={() => void saveEmployee(true)} className={cx("h-11 rounded-xl border px-4 text-sm font-semibold", border)}>Şifrəni sıfırla</button><div className="flex gap-2"><button type="button" onClick={() => setEditing(null)} className={cx("h-11 rounded-xl border px-5 text-sm font-semibold", border)}>Ləğv et</button><button type="button" disabled={saving} onClick={() => void saveEmployee(false)} className="surface-primary h-11 rounded-xl px-5 text-sm font-semibold disabled:opacity-60">Saxla</button></div></div></div></div>, document.body)}
      {deleteTarget && createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center p-4"><button type="button" aria-label="Bağla" onClick={() => setDeleteTarget(null)} className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" /><div className={cx("relative z-10 w-full max-w-md rounded-3xl border p-6 shadow-2xl", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900")}><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600"><I.Trash className="h-6 w-6" /></div><h2 className="mt-4 text-xl font-semibold">Əməkdaşı silmək?</h2><p className={cx("mt-2 text-sm", subtle)}>{deleteTarget.name} sistemə giriş imkanını itirəcək və aktiv sessiyaları bağlanacaq.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className={cx("h-11 rounded-xl border px-5 text-sm font-semibold", border)}>Ləğv et</button><button type="button" disabled={saving} onClick={() => void deleteEmployee()} className="h-11 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white disabled:opacity-60">Sil</button></div></div></div>, document.body)}
      {showForm && createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center p-4"><button type="button" aria-label="Bağla" onClick={() => setShowForm(false)} className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" /><form onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await onCreate(form); setShowForm(false); setForm({ name: "", email: "", role: "Əməkdaş", phone: "", temporaryPassword: "" }); } catch { /* Error is shown by the parent view. */ } finally { setSaving(false); } }} className={cx("relative z-10 w-full max-w-lg rounded-3xl border p-6 shadow-2xl", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900")}><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">Yeni əməkdaş</h2><p className={cx("mt-1 text-sm", subtle)}>Giriş məlumatlarını yaradın. Boş saxlanılan ilkin şifrə avtomatik hazırlanacaq.</p></div><button type="button" onClick={() => setShowForm(false)} className={cx("flex h-9 w-9 items-center justify-center rounded-xl border text-xl", border)}>×</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Ad soyad<input required className={cx(inputClass, "mt-1.5")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label className="text-sm font-medium">Rol<select className={cx(inputClass, "mt-1.5")} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>Əməkdaş</option><option>Rəhbər</option><option>Satış rəhbəri</option><option>Satış</option><option>Anbar əməliyyatları</option><option>Təhvilat</option><option>Maliyyə</option></select></label><label className="text-sm font-medium sm:col-span-2">E-poçt<input required type="email" className={cx(inputClass, "mt-1.5")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label className="text-sm font-medium">Telefon<input className={cx(inputClass, "mt-1.5")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label className="text-sm font-medium">İlkin şifrə<input minLength={8} type="text" placeholder="Avtomatik yaradılsın" className={cx(inputClass, "mt-1.5")} value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} /></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className={cx("h-11 rounded-xl border px-5 text-sm font-semibold", border)}>Ləğv et</button><button disabled={saving} className="surface-primary h-11 rounded-xl px-5 text-sm font-semibold disabled:opacity-60">{saving ? "Saxlanılır..." : "Saxla"}</button></div></form></div>, document.body)}
    </div>
  );
}

function StoresView({ stores, onChanged, border, card, soft, subtle, input }: {
  stores: CompanyStore[];
  onChanged: () => Promise<void>;
  border: string;
  card: string;
  soft: string;
  subtle: string;
  input: string;
}) {
  const [editing, setEditing] = useState<CompanyStore | null | "new">(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("Mağaza");
  const [isBonded, setIsBonded] = useState(false);
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<CompanyStore | null>(null);
  const [deleteMessage, setDeleteMessage] = useState("");

  const openEditor = (store?: CompanyStore) => {
    setEditing(store ?? "new");
    setName(store?.name ?? "");
    setType(store?.type ?? "Mağaza");
    setIsBonded(store?.isBonded ?? false);
    setStatus(store?.status ?? "active");
    setMessage("");
  };

  useEffect(() => {
    const open = () => openEditor();
    window.addEventListener("arix:create-store", open);
    return () => window.removeEventListener("arix:create-store", open);
  }, []);

  const save = async () => {
    if (!name.trim()) {
      setMessage("Mağaza adını yazın.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const current = editing !== "new" ? editing : null;
      await requestJson(current ? `/api/stores/${current.id}` : "/api/stores", {
        method: current ? "PATCH" : "POST",
        body: JSON.stringify({ name: name.trim(), type, isBonded, status }),
      });
      await onChanged();
      window.dispatchEvent(new Event("arix:stores-updated"));
      setEditing(null);
      showToast(current ? "Mağaza yeniləndi." : "Mağaza yaradıldı.", { tone: "success", title: "Mağazalar" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Mağaza saxlanılmadı.";
      setMessage(errorMessage);
      showToast(errorMessage, { tone: "error", title: "Mağazalar" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (store: CompanyStore) => {
    setSaving(true);
    setDeleteMessage("");
    try {
      await requestJson(`/api/stores/${store.id}`, { method: "DELETE" });
      await onChanged();
      window.dispatchEvent(new Event("arix:stores-updated"));
      setDeleting(null);
      showToast("Mağaza silinənlərə göndərildi.", { tone: "success", title: "Mağazalar" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Mağaza silinmədi.";
      setDeleteMessage(errorMessage);
      showToast(errorMessage, { tone: "error", title: "Mağazalar" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <CreateTile border={border} soft={soft} label="Mağaza yarat" onClick={() => openEditor()} />
        {stores.map((store) => (
          <StoreCard
            key={store.id}
            item={{
              name: store.name,
              type: store.isBonded ? `${store.type} · Antrepo` : store.type,
              date: new Date(store.createdAt).toLocaleDateString("az-Latn-AZ", { day: "numeric", month: "long", year: "numeric" }),
              status: store.status === "active" ? "Aktiv" : "Deaktiv",
            }}
            onEdit={() => openEditor(store)}
            onDelete={() => { setDeleting(store); setDeleteMessage(""); }}
            border={border}
            card={card}
            soft={soft}
            subtle={subtle}
          />
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm" onMouseDown={() => setEditing(null)}>
          <div className={cx("w-full max-w-lg rounded-2xl border p-5 shadow-2xl", border, card)} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{editing === "new" ? "Mağaza yarat" : "Mağazanı redaktə et"}</h2>
                <p className={cx("mt-1 text-sm", subtle)}>Ad dəyişdikdə məhsul siyahısı və qiymətlər avtomatik yenilənir.</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className={cx("rounded-lg px-2 py-1 text-xl", subtle)} aria-label="Bağla">×</button>
            </div>
            <div className="mt-5 space-y-4">
              <Field label="Ad"><input autoFocus className={input} value={name} onChange={(event) => setName(event.target.value)} /></Field>
              <Field label="Növ">
                <select className={input} value={type} onChange={(event) => setType(event.target.value)}>
                  <option value="Əsas mağaza">Əsas mağaza</option>
                  <option value="Mağaza">Mağaza</option>
                  <option value="Anbar">Anbar</option>
                  <option value="Satış nöqtəsi">Satış nöqtəsi</option>
                </select>
              </Field>
              <Field label="Status">
                <select className={input} value={status} onChange={(event) => setStatus(event.target.value as "active" | "inactive")}>
                  <option value="active">Aktiv</option>
                  <option value="inactive">Deaktiv</option>
                </select>
              </Field>
              <button
                type="button"
                role="switch"
                aria-checked={isBonded}
                onClick={() => setIsBonded((current) => !current)}
                className={cx("flex w-full items-center justify-between rounded-xl border p-3 text-left", border, soft)}
              >
                <span>
                  <span className="block text-sm font-semibold">Antrepo</span>
                  <span className={cx("mt-0.5 block text-xs", subtle)}>Gömrük nəzarətində saxlanan stok nöqtəsi</span>
                </span>
                <span className={cx("relative h-6 w-11 rounded-full transition-colors", isBonded ? "bg-indigo-600" : "bg-slate-300")}>
                  <span className={cx("absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform", isBonded ? "translate-x-6" : "translate-x-1")} />
                </span>
              </button>
              {message && <div className="text-sm text-rose-600">{message}</div>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={cx("h-10 rounded-xl border px-4 text-sm font-semibold", border)}>İmtina et</button>
              <button type="button" onClick={() => void save()} disabled={saving} className="surface-primary h-10 rounded-xl px-5 text-sm font-semibold disabled:opacity-60">
                {saving ? "Saxlanılır..." : "Saxla"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm" onMouseDown={() => setDeleting(null)}>
          <div className={cx("w-full max-w-md rounded-2xl border p-5 shadow-2xl", border, card)} onMouseDown={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-semibold">Mağaza silinsin?</h2>
            <p className={cx("mt-2 text-sm leading-6", subtle)}>
              <strong className="text-slate-800">{deleting.name}</strong> sistemdən silinəcək. Mağazada qalıq varsa sistem silməyə icazə verməyəcək.
            </p>
            {deleteMessage && <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{deleteMessage}</div>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(null)} className={cx("h-10 rounded-xl border px-4 text-sm font-semibold", border)}>İmtina et</button>
              <button type="button" onClick={() => void remove(deleting)} disabled={saving} className="h-10 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? "Silinir..." : "Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AccountsView({ border, card, soft, subtle }: { border: string; card: string; soft: string; subtle: string }) {
  const emptyForm = { name: "", type: "bank" as FinancialAccount["type"], bankName: "", branchName: "", iban: "", accountNumber: "", currency: "TRY", accountingCode: "102", openingBalance: "0", integrationMode: "manual" as FinancialAccount["integrationMode"] };
  const emptyCardForm = { name: "", kind: "credit" as CompanyCard["kind"], lastFour: "", holderName: "", network: "Visa", currency: "TRY", creditLimit: "0", statementDay: "", paymentDay: "" };
  const emptyMovementForm = { merchantName: "", amount: "", direction: "expense" as CardTransaction["direction"], description: "", transactionAt: new Date().toISOString().slice(0, 16), installmentCount: "1" };
  const [items, setItems] = useState<FinancialAccount[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [details, setDetails] = useState<FinancialAccountDetails | null>(null);
  const [detailMode, setDetailMode] = useState<"bank" | "cards" | "pos">("bank");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [selectedBankTransactionId, setSelectedBankTransactionId] = useState("");
  const [cardCreating, setCardCreating] = useState(false);
  const [cardForm, setCardForm] = useState(emptyCardForm);
  const [movementCreating, setMovementCreating] = useState(false);
  const [movementForm, setMovementForm] = useState(emptyMovementForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const load = async () => {
    try {
      const payload = await requestJson<{ data: FinancialAccount[] }>("/api/payment-integrations/accounts");
      setItems(payload.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hesaplar yüklenemedi.");
    }
  };
  useEffect(() => { void load(); }, []);
  const loadDetails = async (accountId: string) => {
    setMessage("");
    try {
      const payload = await requestJson<{ data: FinancialAccountDetails }>(`/api/payment-integrations/accounts/${accountId}`);
      setDetails(payload.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hesap detayı yüklenemedi.");
    }
  };
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await requestJson("/api/payment-integrations/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, openingBalance: Number(form.openingBalance) || 0 }),
      });
      setForm(emptyForm);
      setCreating(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hesap kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };
  const saveCard = async () => {
    if (!details) return;
    setSaving(true);
    setMessage("");
    try {
      await requestJson(`/api/payment-integrations/accounts/${details.account.id}/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...cardForm,
          creditLimit: Number(cardForm.creditLimit) || 0,
          statementDay: Number(cardForm.statementDay) || 0,
          paymentDay: Number(cardForm.paymentDay) || 0,
        }),
      });
      setCardCreating(false);
      setCardForm({ ...emptyCardForm, currency: details.account.currency });
      await loadDetails(details.account.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kart kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };
  const saveCardMovement = async () => {
    if (!details || !selectedChildId) return;
    setSaving(true);
    setMessage("");
    try {
      await requestJson(`/api/payment-integrations/cards/${selectedChildId}/transactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactions: [{
          ...movementForm,
          externalId: `MANUAL-${Date.now()}`,
          amount: Number(movementForm.amount) || 0,
          installmentCount: Number(movementForm.installmentCount) || 1,
        }] }),
      });
      setMovementCreating(false);
      setMovementForm(emptyMovementForm);
      await loadDetails(details.account.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kart hareketi kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };
  const acceptBankSuggestion = async (transactionId: string, documentId: string) => {
    if (!details) return;
    setSaving(true);
    setMessage("");
    try {
      await requestJson(`/api/payment-integrations/bank-transactions/${transactionId}/match`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchType: "document", documentId }),
      });
      setSelectedBankTransactionId("");
      await loadDetails(details.account.id);
      window.dispatchEvent(new Event("arix:documents-updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Eşleştirme onaylanamadı.");
    } finally {
      setSaving(false);
    }
  };
  const money = (value: number, currency: string) => `${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const dateTime = (value: string) => value ? new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const typeLabel = (type: FinancialAccount["type"]) => type === "bank" ? "Banka hesabı" : type === "cash" ? "Kasa" : "Mağaza hesabı";
  const integrationLabel = (mode: FinancialAccount["integrationMode"]) => mode === "api" ? "Doğrudan banka API" : mode === "open_banking" ? "Açık bankacılık" : mode === "file" ? "Ekstre dosyası" : "Manuel";
  const kindLabel = (kind: CompanyCard["kind"]) => ({ credit: "Kredi kartı", debit: "Banka kartı", prepaid: "Ön ödemeli", virtual: "Sanal kart" }[kind]);
  const activeCard = details?.cards.find((item) => item.id === selectedChildId) ?? details?.cards[0];
  const activePos = details?.virtualPos.find((item) => item.id === selectedChildId) ?? details?.virtualPos[0];
  const selectedBankTransaction = details?.bankTransactions.find((item) => item.id === selectedBankTransactionId);
  return (
    <div className="space-y-4">
      {!details ? (
        <>
          <div className={cx("flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between", border, card)}>
            <div>
              <h2 className="text-lg font-semibold">Şirket hesapları</h2>
              <p className={cx("mt-1 text-sm", subtle)}>Bir bankaya girerek hesap hareketlerini, bağlı kartları ve sanal POS'ları birlikte izleyin.</p>
            </div>
            <button type="button" onClick={() => setCreating(true)} className="surface-primary h-10 rounded-xl px-4 text-sm font-semibold">Hesap oluştur</button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((account) => (
              <button key={account.id} type="button" onClick={() => { setDetailMode("bank"); setSelectedChildId(""); void loadDetails(account.id); }} className={cx("rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md", border, card)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="text-xs font-semibold uppercase text-indigo-600">{typeLabel(account.type)}</div><h3 className="mt-1 truncate text-lg font-semibold">{account.name}</h3><div className={cx("mt-1 text-sm", subtle)}>{account.bankName || "Şirket içi hesap"}{account.branchName ? ` · ${account.branchName}` : ""}</div></div>
                  <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", account.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{account.status === "active" ? "Aktif" : "Pasif"}</span>
                </div>
                <div className={cx("mt-4 rounded-xl border p-3", border, soft)}><div className="text-xs text-slate-500">Güncel bakiye</div><div className="mt-1 text-2xl font-semibold tabular-nums">{money(account.currentBalance, account.currency)}</div></div>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm"><span className={cx("truncate", subtle)}>{account.iban || integrationLabel(account.integrationMode)}</span><span className="font-semibold text-indigo-600">Detayları aç →</span></div>
              </button>
            ))}
            {!items.length && <div className={cx("rounded-2xl border p-8 text-center text-sm", border, soft, subtle)}>Henüz şirket hesabı oluşturulmadı.</div>}
          </div>
        </>
      ) : (
        <>
          <div className={cx("rounded-2xl border p-4", border, card)}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => { setDetails(null); setSelectedChildId(""); }} className={cx("h-10 w-10 shrink-0 rounded-xl border text-lg", border)} aria-label="Hesaplara dön">←</button><div className="min-w-0"><div className="text-xs font-semibold uppercase text-indigo-600">{typeLabel(details.account.type)}</div><h2 className="truncate text-xl font-semibold">{details.account.name}</h2><p className={cx("truncate text-sm", subtle)}>{details.account.iban || details.account.bankName || "Şirket içi hesap"}</p></div></div>
              <div className="text-left lg:text-right"><div className={cx("text-xs", subtle)}>Güncel bakiye</div><div className="text-2xl font-semibold tabular-nums">{money(details.account.currentBalance, details.account.currency)}</div></div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([['bank', `Hesap hareketleri · ${details.bankTransactions.length}`], ['cards', `Kartlar · ${details.cards.length}`], ['pos', `Sanal POS · ${details.virtualPos.length}`]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => { setDetailMode(key); setSelectedChildId(""); }} className={cx("min-h-11 rounded-xl border px-3 text-sm font-semibold", border, detailMode === key ? "bg-indigo-600 text-white" : soft)}>{label}</button>)}
            </div>
          </div>

          {detailMode === "bank" && <div className="space-y-4">
            <div className={cx("overflow-hidden rounded-2xl border", border, card)}>
              <div className="border-b px-4 py-3"><div className="font-semibold">Banka hesabı hareketleri</div><div className={cx("mt-1 text-xs", subtle)}>Eşleşmeyen harekete tıklayarak sistemin fatura ve ödeme önerilerini inceleyin.</div></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm"><thead className={soft}><tr><th className="px-4 py-3 text-left">Tarih</th><th className="px-4 py-3 text-left">Açıklama</th><th className="px-4 py-3 text-left">Karşı taraf</th><th className="px-4 py-3 text-left">Durum</th><th className="px-4 py-3 text-right">Tutar</th><th className="w-28 px-4 py-3" /></tr></thead><tbody>{details.bankTransactions.map((transaction) => <tr key={transaction.id} className="border-t"><td className="px-4 py-3 whitespace-nowrap">{dateTime(transaction.bookedAt)}</td><td className="max-w-[280px] truncate px-4 py-3">{transaction.description || "Banka hareketi"}</td><td className="px-4 py-3">{transaction.counterpartyName || "—"}</td><td className="px-4 py-3"><span className={cx("rounded-full px-2 py-1 text-xs font-semibold", transaction.status === "unmatched" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>{transaction.status === "unmatched" ? `${transaction.suggestions?.length || 0} öneri` : transaction.matchedDocumentTitle || "Eşleşti"}</span></td><td className={cx("px-4 py-3 text-right font-semibold tabular-nums", transaction.direction === "in" ? "text-emerald-600" : "text-rose-600")}>{transaction.direction === "in" ? "+" : "-"}{money(transaction.amount, transaction.currency)}</td><td className="px-4 py-3 text-right">{transaction.status === "unmatched" && <button type="button" onClick={() => setSelectedBankTransactionId(selectedBankTransactionId === transaction.id ? "" : transaction.id)} className={cx("h-8 rounded-lg border px-3 text-xs font-semibold", border)}>{selectedBankTransactionId === transaction.id ? "Kapat" : "İncele"}</button>}</td></tr>)}</tbody></table>{!details.bankTransactions.length && <div className={cx("p-8 text-center text-sm", subtle)}>Bu hesaba ait banka hareketi henüz yok.</div>}</div>
            </div>

            {selectedBankTransaction && selectedBankTransaction.status === "unmatched" && <div className={cx("rounded-2xl border p-4", border, card)}><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">Olası eşleşmeler</h3><p className={cx("mt-1 text-sm", subtle)}>{selectedBankTransaction.counterpartyName || selectedBankTransaction.description} · {money(selectedBankTransaction.amount, selectedBankTransaction.currency)}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Onay bekliyor</span></div><div className="mt-4 grid gap-3">{selectedBankTransaction.suggestions?.map((suggestion) => <div key={suggestion.documentId} className={cx("flex flex-col gap-3 rounded-xl border p-3 md:flex-row md:items-center", border, soft)}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-indigo-600">{suggestion.title}</span><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">%{Math.min(100, suggestion.score)} uyğun</span></div><div className={cx("mt-1 text-sm", subtle)}>{suggestion.counterpartyName || "Karşı taraf belirtilmedi"} · {dateTime(suggestion.documentDate)}</div><div className={cx("mt-1 text-xs", subtle)}>{suggestion.reason}</div></div><div className="text-right"><div className="font-semibold tabular-nums">{money(suggestion.amount, selectedBankTransaction.currency)}</div><button type="button" onClick={() => void acceptBankSuggestion(selectedBankTransaction.id, suggestion.documentId)} disabled={saving} className="surface-primary mt-2 h-9 rounded-lg px-3 text-xs font-semibold disabled:opacity-50">{saving ? "Bağlanıyor..." : "Eşleşmeyi kabul et"}</button></div></div>)}{!selectedBankTransaction.suggestions?.length && <div className={cx("rounded-xl border p-4 text-sm", border, soft, subtle)}>Uygun fatura veya bekleyen ödeme bulunamadı. Bu hareketi Pul fəaliyyəti ekranından tedarikçi, gider veya hesap transferi olarak işleyebilirsiniz.</div>}</div></div>}

            <div className={cx("overflow-hidden rounded-2xl border", border, card)}><div className="border-b px-4 py-3"><div className="font-semibold">Kayıtlı ödemeler ve giderler</div><div className={cx("mt-1 text-xs", subtle)}>Bu hesaptan oluşturulan ödemeler banka ekstresiyle eşleşene kadar beklemede kalır.</div></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className={soft}><tr><th className="px-4 py-3 text-left">Tarih</th><th className="px-4 py-3 text-left">Belge</th><th className="px-4 py-3 text-left">Karşı taraf / kategori</th><th className="px-4 py-3 text-left">Banka durumu</th><th className="px-4 py-3 text-right">Tutar</th></tr></thead><tbody>{(details.moneyDocuments ?? []).map((document) => <tr key={document.id} className="border-t"><td className="px-4 py-3 whitespace-nowrap">{dateTime(document.documentDate || document.createdAt || "")}</td><td className="px-4 py-3 font-semibold text-indigo-600">{document.type === "cashOut" ? "Məxaric" : document.type === "cashIn" ? "Mədaxil" : "Transfer"} #{String(document.id).slice(0, 8)}</td><td className="px-4 py-3">{document.counterpartyName || document.category || "—"}{document.linkedDocument ? <div className={cx("mt-1 text-xs", subtle)}>{document.linkedDocument}</div> : null}</td><td className="px-4 py-3"><span className={cx("rounded-full px-2 py-1 text-xs font-semibold", document.bankTransactionId || document.bankMatchStatus === "matched" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{document.bankTransactionId || document.bankMatchStatus === "matched" ? "Ekstreyle eşleşti" : "Banka hareketi bekleniyor"}</span></td><td className={cx("px-4 py-3 text-right font-semibold", document.type === "cashIn" ? "text-emerald-600" : "text-rose-600")}>{document.type === "cashIn" ? "+" : "-"}{money(Number(document.amount ?? document.total ?? 0), details.account.currency)}</td></tr>)}</tbody></table>{!(details.moneyDocuments ?? []).length && <div className={cx("p-8 text-center text-sm", subtle)}>Bu hesaptan oluşturulmuş ödeme veya gider yok.</div>}</div></div>
          </div>}

          {detailMode === "cards" && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Şirket kartları</h3><p className={cx("text-sm", subtle)}>Kart harcaması fatura eşleşene kadar belge bekler; banka bakiyesini ayrıca düşürmez.</p></div><button type="button" onClick={() => { setCardForm({ ...emptyCardForm, currency: details.account.currency }); setCardCreating(true); }} className="surface-primary h-10 rounded-xl px-4 text-sm font-semibold">Kart ekle</button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{details.cards.map((companyCard) => <button key={companyCard.id} type="button" onClick={() => setSelectedChildId(companyCard.id)} className={cx("rounded-2xl border p-4 text-left", border, activeCard?.id === companyCard.id ? "ring-2 ring-indigo-500" : card)}><div className="flex justify-between gap-2"><span className="text-xs font-semibold uppercase text-indigo-600">{kindLabel(companyCard.kind)}</span><span className={cx("text-xs", subtle)}>•••• {companyCard.lastFour}</span></div><div className="mt-4 text-lg font-semibold">{companyCard.name}</div><div className={cx("mt-1 text-sm", subtle)}>{companyCard.holderName || "Kart sahibi belirtilmedi"}</div></button>)}{!details.cards.length && <div className={cx("rounded-2xl border p-8 text-center text-sm md:col-span-2", border, soft, subtle)}>Bu banka hesabına bağlı kart yok.</div>}</div>{activeCard && <div className={cx("overflow-hidden rounded-2xl border", border, card)}><div className="flex items-center justify-between border-b px-4 py-3"><div><div className="font-semibold">{activeCard.name} hareketleri</div><div className={cx("text-xs", subtle)}>{kindLabel(activeCard.kind)} · •••• {activeCard.lastFour}</div></div><button type="button" onClick={() => { setSelectedChildId(activeCard.id); setMovementCreating(true); }} className={cx("h-9 rounded-xl border px-3 text-sm font-semibold", border)}>Hareket ekle / test et</button></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className={soft}><tr><th className="px-4 py-3 text-left">Tarih</th><th className="px-4 py-3 text-left">İş yeri</th><th className="px-4 py-3 text-left">Açıklama</th><th className="px-4 py-3 text-left">Belge</th><th className="px-4 py-3 text-right">Tutar</th></tr></thead><tbody>{activeCard.transactions.map((transaction) => <tr key={transaction.id} className="border-t"><td className="px-4 py-3 whitespace-nowrap">{dateTime(transaction.transactionAt)}</td><td className="px-4 py-3 font-medium">{transaction.merchantName || "—"}</td><td className="max-w-[280px] truncate px-4 py-3">{transaction.description || (transaction.installmentCount > 1 ? `${transaction.installmentCount} taksit` : "Kart işlemi")}</td><td className="px-4 py-3"><span className={cx("rounded-full px-2 py-1 text-xs font-semibold", transaction.status === "matched" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{transaction.status === "matched" ? "Eşleşti" : "Fatura bekliyor"}</span></td><td className={cx("px-4 py-3 text-right font-semibold", transaction.direction === "refund" ? "text-emerald-600" : "text-rose-600")}>{transaction.direction === "refund" ? "+" : "-"}{money(transaction.amount, transaction.currency)}</td></tr>)}</tbody></table>{!activeCard.transactions.length && <div className={cx("p-8 text-center text-sm", subtle)}>Bu karta ait hareket henüz yok.</div>}</div></div>}</div>}

          {detailMode === "pos" && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Sanal POS'lar</h3><p className={cx("text-sm", subtle)}>Bu hesaba yatacak şekilde eşleştirilmiş tahsilat kanalları.</p></div><a href="/company/payment-integrations" className={cx("flex h-10 items-center rounded-xl border px-4 text-sm font-semibold", border)}>Eşleştirmeleri yönet</a></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{details.virtualPos.map((pos) => <button key={pos.id} type="button" onClick={() => setSelectedChildId(pos.id)} className={cx("rounded-2xl border p-4 text-left", border, activePos?.id === pos.id ? "ring-2 ring-indigo-500" : card)}><div className="flex justify-between gap-2"><span className="text-xs font-semibold uppercase text-indigo-600">Sanal POS</span><span className={cx("text-xs", subtle)}>{pos.currency}</span></div><div className="mt-4 text-lg font-semibold">{pos.providerName}</div><div className={cx("mt-1 truncate text-sm", subtle)}>{pos.connectionLabel || pos.merchantId || pos.terminalId}</div></button>)}{!details.virtualPos.length && <div className={cx("rounded-2xl border p-8 text-center text-sm md:col-span-2", border, soft, subtle)}>Bu banka hesabına yönlendirilmiş sanal POS yok.</div>}</div>{activePos && <div className={cx("overflow-hidden rounded-2xl border", border, card)}><div className="border-b px-4 py-3"><div className="font-semibold">{activePos.providerName} hareketleri</div><div className={cx("text-xs", subtle)}>Üye iş yeri {activePos.merchantId || "—"} · Terminal {activePos.terminalId || "—"}</div></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className={soft}><tr><th className="px-4 py-3 text-left">Tarih</th><th className="px-4 py-3 text-left">İşlem</th><th className="px-4 py-3 text-left">Müşteri</th><th className="px-4 py-3 text-left">Hakediş</th><th className="px-4 py-3 text-right">Tutar</th></tr></thead><tbody>{activePos.transactions.map((transaction) => <tr key={transaction.id} className="border-t"><td className="px-4 py-3 whitespace-nowrap">{dateTime(transaction.paidAt)}</td><td className="px-4 py-3 font-medium">{transaction.externalId}</td><td className="px-4 py-3">{transaction.counterpartyName || transaction.rawCustomerName || "—"}</td><td className="px-4 py-3">{transaction.settlementStatus === "settled" ? "Bankaya geçti" : "Bekliyor"}</td><td className="px-4 py-3 text-right font-semibold text-emerald-600">+{money(transaction.amount, transaction.currency)}</td></tr>)}</tbody></table>{!activePos.transactions.length && <div className={cx("p-8 text-center text-sm", subtle)}>Bu sanal POS'a ait tahsilat henüz yok.</div>}</div></div>}</div>}
        </>
      )}

      {message && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>}

      {creating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={() => setCreating(false)}>
          <div className={cx("w-full max-w-2xl rounded-2xl border p-5 shadow-2xl", border, card)} onMouseDown={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-semibold">Şirket hesabı oluştur</h2>
            <p className={cx("mt-1 text-sm", subtle)}>Banka entegrasyonu sonradan bağlanabilir; hesap ve IBAN değişmeden kalır.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">Hesap adı<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label>
              <label className="text-sm font-semibold">Tür<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as FinancialAccount["type"] })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)}><option value="bank">Banka hesabı</option><option value="cash">Kasa</option><option value="store">Mağaza hesabı</option></select></label>
              <label className="text-sm font-semibold">Banka<input value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label>
              <label className="text-sm font-semibold">Şube<input value={form.branchName} onChange={(event) => setForm({ ...form, branchName: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label>
              <label className="text-sm font-semibold sm:col-span-2">IBAN<input value={form.iban} onChange={(event) => setForm({ ...form, iban: event.target.value.toUpperCase() })} placeholder="TR..." className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label>
              <label className="text-sm font-semibold">Para birimi<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)}><option>TRY</option><option>USD</option><option>EUR</option><option>AZN</option></select></label>
              <label className="text-sm font-semibold">Açılış bakiyesi<input type="number" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 text-right font-normal", border, soft)} /></label>
              <label className="text-sm font-semibold">Muhasebe kodu<input value={form.accountingCode} onChange={(event) => setForm({ ...form, accountingCode: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label>
              <label className="text-sm font-semibold">Hareket kaynağı<select value={form.integrationMode} onChange={(event) => setForm({ ...form, integrationMode: event.target.value as FinancialAccount["integrationMode"] })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)}><option value="manual">Manuel</option><option value="file">Ekstre dosyası</option><option value="api">Doğrudan banka API</option><option value="open_banking">Açık bankacılık</option></select></label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className={cx("h-10 rounded-xl border px-4 text-sm font-semibold", border)}>Vazgeç</button><button type="button" onClick={() => void save()} disabled={saving || !form.name} className="surface-primary h-10 rounded-xl px-5 text-sm font-semibold disabled:opacity-50">{saving ? "Kaydediliyor..." : "Kaydet"}</button></div>
          </div>
        </div>
      )}

      {cardCreating && details && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={() => setCardCreating(false)}><div className={cx("w-full max-w-2xl rounded-2xl border p-5 shadow-2xl", border, card)} onMouseDown={(event) => event.stopPropagation()}><h2 className="text-xl font-semibold">{details.account.name} hesabına kart ekle</h2><p className={cx("mt-1 text-sm", subtle)}>Kart yalnızca ödeme aracıdır; banka hesabının bakiyesiyle karışmaz.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Kart adı<input value={cardForm.name} onChange={(event) => setCardForm({ ...cardForm, name: event.target.value })} placeholder="Seyahat kartı" className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label><label className="text-sm font-semibold">Kart türü<select value={cardForm.kind} onChange={(event) => setCardForm({ ...cardForm, kind: event.target.value as CompanyCard["kind"] })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)}><option value="credit">Kredi kartı</option><option value="debit">Banka kartı</option><option value="prepaid">Ön ödemeli kart</option><option value="virtual">Sanal kart</option></select></label><label className="text-sm font-semibold">Son dört hane<input value={cardForm.lastFour} onChange={(event) => setCardForm({ ...cardForm, lastFour: event.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="1234" inputMode="numeric" className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label><label className="text-sm font-semibold">Kart sahibi<input value={cardForm.holderName} onChange={(event) => setCardForm({ ...cardForm, holderName: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label><label className="text-sm font-semibold">Kart ağı<input value={cardForm.network} onChange={(event) => setCardForm({ ...cardForm, network: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label><label className="text-sm font-semibold">Limit<input type="number" value={cardForm.creditLimit} onChange={(event) => setCardForm({ ...cardForm, creditLimit: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 text-right font-normal", border, soft)} /></label><label className="text-sm font-semibold">Hesap kesim günü<input type="number" min="1" max="31" value={cardForm.statementDay} onChange={(event) => setCardForm({ ...cardForm, statementDay: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label><label className="text-sm font-semibold">Son ödeme günü<input type="number" min="1" max="31" value={cardForm.paymentDay} onChange={(event) => setCardForm({ ...cardForm, paymentDay: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCardCreating(false)} className={cx("h-10 rounded-xl border px-4 text-sm font-semibold", border)}>Vazgeç</button><button type="button" onClick={() => void saveCard()} disabled={saving || !cardForm.name || cardForm.lastFour.length !== 4} className="surface-primary h-10 rounded-xl px-5 text-sm font-semibold disabled:opacity-50">{saving ? "Kaydediliyor..." : "Kartı kaydet"}</button></div></div></div>
      )}

      {movementCreating && activeCard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={() => setMovementCreating(false)}><div className={cx("w-full max-w-xl rounded-2xl border p-5 shadow-2xl", border, card)} onMouseDown={(event) => event.stopPropagation()}><h2 className="text-xl font-semibold">Kart hareketi ekle</h2><p className={cx("mt-1 text-sm", subtle)}>{activeCard.name} · •••• {activeCard.lastFour}. Gerçek bağlantıda bu bilgiler bankadan gelir.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">İş yeri<input value={movementForm.merchantName} onChange={(event) => setMovementForm({ ...movementForm, merchantName: event.target.value })} placeholder="Otel adı" className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label><label className="text-sm font-semibold">İşlem türü<select value={movementForm.direction} onChange={(event) => setMovementForm({ ...movementForm, direction: event.target.value as CardTransaction["direction"] })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)}><option value="expense">Harcama</option><option value="refund">İade</option></select></label><label className="text-sm font-semibold">Tutar<input type="number" value={movementForm.amount} onChange={(event) => setMovementForm({ ...movementForm, amount: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 text-right font-normal", border, soft)} /></label><label className="text-sm font-semibold">Tarih / saat<input type="datetime-local" value={movementForm.transactionAt} onChange={(event) => setMovementForm({ ...movementForm, transactionAt: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label><label className="text-sm font-semibold">Taksit<input type="number" min="1" value={movementForm.installmentCount} onChange={(event) => setMovementForm({ ...movementForm, installmentCount: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label><label className="text-sm font-semibold">Açıklama<input value={movementForm.description} onChange={(event) => setMovementForm({ ...movementForm, description: event.target.value })} className={cx("mt-2 h-10 w-full rounded-xl border px-3 font-normal", border, soft)} /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setMovementCreating(false)} className={cx("h-10 rounded-xl border px-4 text-sm font-semibold", border)}>Vazgeç</button><button type="button" onClick={() => void saveCardMovement()} disabled={saving || !movementForm.merchantName || !(Number(movementForm.amount) > 0)} className="surface-primary h-10 rounded-xl px-5 text-sm font-semibold disabled:opacity-50">{saving ? "Kaydediliyor..." : "Hareketi ekle"}</button></div></div></div>
      )}
    </div>
  );
}

function LoyaltyView({ border, card, soft, subtle }: { border: string; card: string; soft: string; subtle: string }) {
  const rules = ["Müştəri qrupu üzrə endirim", "Bonus yığım faizi", "Kart səviyyələri", "Doğum günü kuponu"];
  return (
    <div className={cx("rounded-2xl border p-4", border, card)}>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className={cx("rounded-2xl border p-4", border, soft)}>
          <div className="text-lg font-semibold">Endirim sistemi</div>
          <p className={cx("mt-1 text-sm", subtle)}>Satış zamanı avtomatik endirim və kampaniya qaydaları.</p>
          <button type="button" className="mt-4 h-10 rounded-xl border border-emerald-400 px-4 text-sm font-semibold text-emerald-600">Aktiv et</button>
        </div>
        <div className={cx("rounded-2xl border p-4", border, soft)}>
          <div className="text-lg font-semibold">Bonus sistemi</div>
          <p className={cx("mt-1 text-sm", subtle)}>Hər alışdan bonus hesabına faiz köçürmə.</p>
          <button type="button" className="mt-4 h-10 rounded-xl border border-indigo-400 px-4 text-sm font-semibold text-indigo-600">Qayda yarat</button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {rules.map((rule) => (
          <div key={rule} className={cx("flex items-center justify-between rounded-xl border px-3 py-3", border, soft)}>
            <span className="text-sm font-medium">{rule}</span>
            <span className={cx("text-xs", subtle)}>Hazırlanır</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrintFormsView({
  border,
  card,
  soft,
  subtle,
  input,
  isDark,
}: {
  border: string;
  card: string;
  soft: string;
  subtle: string;
  input: string;
  isDark: boolean;
}) {
  const [settings, setSettings] = useState<PrintSettings>(defaultPrintSettings);
  const [selected, setSelected] = useState<PrintFormKey>("eInvoice");
  const [editorMode, setEditorMode] = useState<"visual" | "xml">("visual");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const activeForm = settings.forms[selected];
  const xmlValidation = validateXmlTemplate(selected, activeForm.xmlTemplate);

  useEffect(() => {
    let alive = true;
    requestJson<{ data: CompanySettings }>("/api/company-settings")
      .then((payload) => {
        if (alive) setSettings(mergePrintSettings(payload.data?.printSettings, payload.data?.eDocumentSettings?.company));
      })
      .catch(() => {
        if (alive) setMessage("Parametrlər yüklənmədi. Standart şablon göstərilir.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const updateForm = (patch: Partial<typeof activeForm>) => {
    setSettings((current) => ({
      ...current,
      forms: {
        ...current.forms,
        [selected]: { ...current.forms[selected], ...patch },
      },
    }));
    setMessage("");
  };

  const updateCompanyDetails = (patch: Partial<PrintCompanyDetails>) => {
    setSettings((current) => ({
      ...current,
      companyDetails: { ...current.companyDetails, ...patch },
    }));
    setMessage("");
  };

  const save = async () => {
    const invalidXml = (Object.keys(settings.forms) as PrintFormKey[])
      .map((key) => ({ key, validation: validateXmlTemplate(key, settings.forms[key].xmlTemplate) }))
      .find((item) => !item.validation.ok);
    if (invalidXml) {
      setSelected(invalidXml.key);
      setEditorMode("xml");
      setMessage(invalidXml.validation.message);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const { companyDetails, ...printSettings } = settings;
      const payload = await requestJson<{ data: CompanySettings }>("/api/company-settings", {
        method: "PATCH",
        body: JSON.stringify({
          printSettings,
          eDocumentSettings: { company: companyDetails },
        }),
      });
      const next = mergePrintSettings(payload.data?.printSettings, payload.data?.eDocumentSettings?.company);
      setSettings(next);
      window.dispatchEvent(new CustomEvent("arix:company-settings-updated", { detail: payload.data }));
      window.dispatchEvent(new CustomEvent("arix:print-settings-updated", { detail: next }));
      setMessage("Çap forması saxlanıldı.");
      showToast("Çap forması saxlanıldı.", { tone: "success", title: "Çap formaları" });
    } catch {
      setMessage("Saxlama zamanı xəta baş verdi.");
      showToast("Saxlama zamanı xəta baş verdi.", { tone: "error", title: "Çap formaları" });
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage("");
    try {
      const companyLogo = await preparePrintImage(file);
      if (companyLogo.length > 850_000) {
        setMessage("Loqo faylı çox böyükdür. Daha yığcam şəkil seçin.");
        return;
      }
      setSettings((current) => ({ ...current, companyLogo }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Loqo yüklənmədi.");
    }
  };

  const uploadStamp = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage("");
    try {
      const companyStamp = await preparePrintImage(file);
      if (companyStamp.length > 850_000) {
        setMessage("Kaşe faylı çox böyükdür. Daha yığcam şəkil seçin.");
        return;
      }
      setSettings((current) => ({ ...current, companyStamp }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kaşe yüklənmədi.");
    }
  };

  return (
    <div className={cx("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border", border, card)}>
      <div className={cx("flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between", border)}>
        <div>
          <h2 className="text-lg font-semibold">Vahid çap dizaynı</h2>
          <p className={cx("mt-1 text-sm", subtle)}>Sənəd başlığını, aşağı qeydi və görünən məlumatları idarə edin.</p>
        </div>
        <button type="button" onClick={() => void save()} disabled={saving} className={cx("surface-primary h-11 rounded-xl px-5 text-sm font-semibold", saving && "opacity-60")}>
          {saving ? "Saxlanılır..." : "Dəyişiklikləri saxla"}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className={cx("min-h-0 overflow-y-auto border-b p-3 [scrollbar-gutter:stable] lg:border-b-0 lg:border-r", border)}>
          <div className="space-y-5">
            {printGroups.map((group) => (
              <div key={group.title}>
                <div className={cx("mb-2 px-2 text-xs font-semibold", subtle)}>{group.title}</div>
                <div className="space-y-1">
                  {group.forms.map((form) => {
                    const active = selected === form.key;
                    return (
                      <button
                        key={form.key}
                        type="button"
                        onClick={() => {
                          setSelected(form.key);
                        }}
                        className={cx(
                          "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition",
                          active ? "surface-nav-active text-indigo-700" : isDark ? "hover:bg-white/5" : "hover:bg-slate-50"
                        )}
                      >
                        <I.File className={cx("mt-0.5 h-5 w-5 shrink-0", active ? "text-indigo-600" : subtle)} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{form.label}</span>
                          <span className={cx("mt-0.5 block text-xs leading-4", active ? "text-indigo-500" : subtle)}>{form.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-h-0 min-w-0 overflow-y-auto p-4 [scrollbar-gutter:stable] lg:p-5">
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0 space-y-5">
              <section>
                <div className="mb-3">
                  <h3 className="text-base font-semibold">Brend məlumatları</h3>
                  <p className={cx("mt-1 text-sm", subtle)}>Bu məlumatlar bütün çap formalarında ortaq istifadə olunur.</p>
                </div>
                <div className={cx("mb-3 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center", border, soft)}>
                  <div className="flex h-16 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-2">
                    {settings.companyLogo ? (
                      <img src={settings.companyLogo} alt="Şirkət loqosu" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div className="flex items-center gap-2 text-slate-500">
                        <AriXLogo className="h-8 w-8" />
                        <span className="text-xs font-semibold">Standart AriX</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">Şirkət loqosu</div>
                    <p className={cx("mt-1 text-xs", subtle)}>PNG, JPG və ya WebP. Loqo sənədlərin başlığında görünəcək.</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <label className="surface-primary inline-flex h-10 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold">
                      {settings.companyLogo ? "Dəyiş" : "Loqo yüklə"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void uploadLogo(event)} />
                    </label>
                    {settings.companyLogo && (
                      <button type="button" onClick={() => setSettings((current) => ({ ...current, companyLogo: "" }))} className="h-10 rounded-xl border border-rose-300 px-3 text-sm font-semibold text-rose-600">
                        Sil
                      </button>
                    )}
                  </div>
                </div>
                <div className={cx("mb-3 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center", border, soft)}>
                  <div className="flex h-20 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-2">
                    {settings.companyStamp ? (
                      <img src={settings.companyStamp} alt="Şirkət kaşesi və imzası" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-center text-xs font-semibold text-slate-400">Kaşe / İmza</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">E-Arşiv kaşe və imzası</div>
                    <p className={cx("mt-1 text-xs", subtle)}>PNG, JPG və ya WebP. Yükləndikdə e-Arşiv sənədinin sonunda sağ tərəfdə görünəcək.</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <label className="surface-primary inline-flex h-10 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold">
                      {settings.companyStamp ? "Dəyiş" : "Kaşe yüklə"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void uploadStamp(event)} />
                    </label>
                    {settings.companyStamp && (
                      <button type="button" onClick={() => setSettings((current) => ({ ...current, companyStamp: "" }))} className="h-10 rounded-xl border border-rose-300 px-3 text-sm font-semibold text-rose-600">
                        Sil
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Şirkət adı">
                    <input value={settings.companyName} onChange={(event) => setSettings((current) => ({ ...current, companyName: event.target.value }))} className={input} />
                  </Field>
                  <Field label="Loqo alt yazısı">
                    <input value={settings.brandSubtitle} onChange={(event) => setSettings((current) => ({ ...current, brandSubtitle: event.target.value }))} className={input} />
                  </Field>
                </div>
              </section>

              <section className={cx("border-t pt-5", border)}>
                <div className="mb-3">
                  <h3 className="text-base font-semibold">Şirkət rekvizitləri</h3>
                  <p className={cx("mt-1 text-sm", subtle)}>Bu məlumatlar e-Belgələr ilə ortaqdır və çapda loqoların altında göstərilir.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Rəsmi şirkət adı">
                    <input value={settings.companyDetails.title} onChange={(event) => updateCompanyDetails({ title: event.target.value })} className={input} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="VKN / TCKN">
                      <input value={settings.companyDetails.taxNumber} onChange={(event) => updateCompanyDetails({ taxNumber: event.target.value.replace(/\D/g, "").slice(0, 11) })} className={input} inputMode="numeric" />
                    </Field>
                    <Field label="Vergi dairəsi">
                      <input value={settings.companyDetails.taxOffice} onChange={(event) => updateCompanyDetails({ taxOffice: event.target.value })} className={input} />
                    </Field>
                  </div>
                  <Field label="Telefon">
                    <input value={settings.companyDetails.phone} onChange={(event) => updateCompanyDetails({ phone: event.target.value })} className={input} />
                  </Field>
                  <Field label="Faks">
                    <input value={settings.companyDetails.fax} onChange={(event) => updateCompanyDetails({ fax: event.target.value })} className={input} />
                  </Field>
                  <Field label="E-poçt">
                    <input value={settings.companyDetails.email} onChange={(event) => updateCompanyDetails({ email: event.target.value })} className={input} type="email" />
                  </Field>
                  <Field label="Veb-sayt">
                    <input value={settings.companyDetails.website} onChange={(event) => updateCompanyDetails({ website: event.target.value })} className={input} placeholder="https://..." />
                  </Field>
                  <Field label="Ölkə kodu">
                    <input value={settings.companyDetails.country} onChange={(event) => updateCompanyDetails({ country: event.target.value.toUpperCase().slice(0, 2) })} className={input} placeholder="TR" />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Rəsmi ünvan">
                      <input value={settings.companyDetails.address} onChange={(event) => updateCompanyDetails({ address: event.target.value })} className={input} />
                    </Field>
                  </div>
                  <Field label="Şəhər">
                    <input value={settings.companyDetails.city} onChange={(event) => updateCompanyDetails({ city: event.target.value })} className={input} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Rayon">
                      <input value={settings.companyDetails.district} onChange={(event) => updateCompanyDetails({ district: event.target.value })} className={input} />
                    </Field>
                    <Field label="Poçt indeksi">
                      <input value={settings.companyDetails.postalCode} onChange={(event) => updateCompanyDetails({ postalCode: event.target.value })} className={input} />
                    </Field>
                  </div>
                </div>
              </section>

              <section className={cx("border-t pt-5", border)}>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold">{printGroups.flatMap((group) => group.forms).find((form) => form.key === selected)?.label}</h3>
                    <p className={cx("mt-1 text-sm", subtle)}>Bu sahələr yalnız seçilmiş sənəd növünə tətbiq olunur.</p>
                  </div>
                  <div className={cx("grid shrink-0 grid-cols-2 rounded-xl border p-1", border, soft)}>
                    <button type="button" onClick={() => setEditorMode("visual")} className={cx("h-8 rounded-lg px-3 text-xs font-semibold", editorMode === "visual" && "bg-white text-indigo-700 shadow-sm")}>Vizual A4</button>
                    <button type="button" onClick={() => setEditorMode("xml")} className={cx("h-8 rounded-lg px-3 text-xs font-semibold", editorMode === "xml" && "bg-white text-indigo-700 shadow-sm")}>{isEDocumentPrintKey(selected) ? "UBL-TR XML" : "Forma XML"}</button>
                  </div>
                </div>
                {editorMode === "xml" ? (
                  <div className="space-y-3">
                    <div className={cx("rounded-xl border p-3 text-xs leading-5", border, soft)}>
                      {isEDocumentPrintKey(selected)
                        ? "Mötərizə içindəki UBL blokları real sənəd məlumatları ilə avtomatik doldurulur. Məcburi blokları silmədən əlavə XML teqləri və sıralamanı dəyişə bilərsiniz."
                        : "Mötərizə içindəki bloklar real çap hissələridir. Bloku sildikdə həmin hissə önizləmədən və real çapdan çıxır; XML sırasını və səhifə xüsusiyyətlərini dəyişə bilərsiniz."}
                    </div>
                    <Field label="XML şablonu">
                      <textarea
                        value={activeForm.xmlTemplate}
                        onChange={(event) => updateForm({ xmlTemplate: event.target.value })}
                        spellCheck={false}
                        className={cx(input, "min-h-[520px] resize-y whitespace-pre font-mono text-xs leading-5")}
                      />
                    </Field>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className={cx("text-xs font-semibold", xmlValidation.ok ? "text-emerald-600" : "text-rose-600")}>{xmlValidation.message}</span>
                      <button type="button" onClick={() => updateForm({ xmlTemplate: defaultPrintSettings.forms[selected].xmlTemplate })} className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700">Standart XML-ə qaytar</button>
                    </div>
                  </div>
                ) : <div className="grid gap-3">
                  <Field label="Sənəd başlığı">
                    <input value={activeForm.title} onChange={(event) => updateForm({ title: event.target.value })} className={input} />
                  </Field>
                  <Field label="Başlıq altında açıqlama">
                    <input value={activeForm.subtitle} onChange={(event) => updateForm({ subtitle: event.target.value })} className={input} />
                  </Field>
                  <Field label="Aşağı hissədə qısa məlumat">
                    <input value={activeForm.footerInfo} onChange={(event) => updateForm({ footerInfo: event.target.value })} className={input} placeholder="Telefon · e-poçt · sayt və ya vergi məlumatı" />
                  </Field>
                  <Field label="Sənəd alt qeydi">
                    <textarea
                      value={activeForm.footerNote}
                      onChange={(event) => updateForm({ footerNote: event.target.value })}
                      className={cx(input, "min-h-28 resize-y py-3")}
                      placeholder="Şərtlər, hüquqi qeyd, çatdırılma məlumatı və ya imza qeydi..."
                    />
                  </Field>
                </div>}
              </section>

              <section className={cx("border-t pt-5", border)}>
                <h3 className="mb-3 text-base font-semibold">Görünüş</h3>
                {isEDocumentPrintKey(selected) ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <PrintToggle label="Şirkət loqosu" checked={activeForm.showLogo} onChange={(checked) => updateForm({ showLogo: checked })} border={border} soft={soft} />
                      <PrintToggle label="Şirkət rekvizitləri" checked={activeForm.showCompanyDetails} onChange={(checked) => updateForm({ showCompanyDetails: checked })} border={border} soft={soft} />
                      <PrintToggle label="Bank hesabları" checked={activeForm.showBankAccounts} onChange={(checked) => updateForm({ showBankAccounts: checked })} border={border} soft={soft} />
                      <PrintToggle label="Açıqlama cədvəli" checked={activeForm.showNotes} onChange={(checked) => updateForm({ showNotes: checked })} border={border} soft={soft} />
                      {selected === "eArchive" && <PrintToggle label="Kaşe və imza" checked={activeForm.showStamp} onChange={(checked) => updateForm({ showStamp: checked })} border={border} soft={soft} />}
                      <PrintToggle label="Xüsusi alt qeyd" checked={activeForm.showFooter} onChange={(checked) => updateForm({ showFooter: checked })} border={border} soft={soft} />
                    </div>
                    <p className={cx("mt-2 text-xs", subtle)}>
                      GİB loqosu, karekod, alıcı, sənəd məlumatları və məhsul cədvəli məcburi olduğu üçün həmişə göstərilir.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <PrintToggle label="Ortada şirkət loqosu" checked={activeForm.showLogo} onChange={(checked) => updateForm({ showLogo: checked })} border={border} soft={soft} />
                      <PrintToggle label="Sənəd məlumatları" checked={activeForm.showMeta} onChange={(checked) => updateForm({ showMeta: checked })} border={border} soft={soft} />
                      <PrintToggle label="Aşağı hissə" checked={activeForm.showFooter} onChange={(checked) => updateForm({ showFooter: checked })} border={border} soft={soft} />
                    </div>
                    <p className={cx("mt-2 text-xs", subtle)}>
                      AriX loqosu solda sabit qalır. Yüklənmiş şirkət loqosu sənəd başlığının ortasında göstərilir.
                    </p>
                  </>
                )}
              </section>
              <div className={cx("flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between", border)}>
                <div className={cx("text-sm", message ? (message.includes("xəta") ? "text-rose-600" : "text-emerald-600") : subtle)}>
                  {message || "Loqo və çap forması dəyişiklikləri saxlanmağa hazırdır."}
                </div>
                <button type="button" onClick={() => void save()} disabled={saving} className={cx("surface-primary h-11 shrink-0 rounded-xl px-6 text-sm font-semibold", saving && "opacity-60")}>
                  {saving ? "Saxlanılır..." : "Loqonu və dizaynı saxla"}
                </button>
              </div>
            </div>

            <PrintFormPreview settings={settings} formKey={selected} form={activeForm} subtle={subtle} editorMode={editorMode} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintToggle({ label, checked, onChange, border, soft }: { label: string; checked: boolean; onChange: (checked: boolean) => void; border: string; soft: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={cx("flex h-11 items-center justify-between rounded-xl border px-3 text-sm font-semibold", border, soft)}>
      {label}
      <span className={cx("flex h-5 w-9 items-center rounded-full p-0.5 transition", checked ? "bg-indigo-600" : "bg-slate-300")}>
        <span className={cx("h-4 w-4 rounded-full bg-white transition", checked && "translate-x-4")} />
      </span>
    </button>
  );
}

function PrintFormPreview({ settings, formKey, form, subtle, editorMode }: { settings: PrintSettings; formKey: PrintFormKey; form: PrintSettings["forms"][PrintFormKey]; subtle: string; editorMode: "visual" | "xml" }) {
  if (editorMode === "xml") return <XmlTemplatePreview formKey={formKey} template={form.xmlTemplate} subtle={subtle} />;
  if (isEDocumentPrintKey(formKey)) {
    return <GibPrintFormPreview settings={settings} formKey={formKey} form={form} subtle={subtle} />;
  }
  return <StandardPrintFormPreview settings={settings} formKey={formKey} form={form} subtle={subtle} />;
}

function XmlTemplatePreview({ formKey, template, subtle }: { formKey: PrintFormKey; template: string; subtle: string }) {
  const validation = validateXmlTemplate(formKey, template);
  return (
    <aside className="min-w-0 max-w-full xl:sticky xl:top-4 xl:self-start">
      <div className={cx("mb-2 text-xs font-semibold", subtle)}>XML forma önizləməsi</div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#0b1020] shadow-sm">
        <div className={cx("border-b border-white/10 px-3 py-2 text-xs font-semibold", validation.ok ? "text-emerald-300" : "text-rose-300")}>{validation.message}</div>
        <pre className="h-[650px] overflow-auto whitespace-pre p-4 text-[10px] leading-4 text-slate-200">{template}</pre>
      </div>
    </aside>
  );
}

function StandardPrintFormPreview({ settings, formKey, form, subtle }: { settings: PrintSettings; formKey: PrintFormKey; form: PrintSettings["forms"][PrintFormKey]; subtle: string }) {
  const [fullSize, setFullSize] = useState(false);
  const landscape = formKey === "customs";
  const pageWidth = landscape ? "297mm" : "210mm";
  const scale = landscape ? 0.35 : 0.5;
  return (
    <aside className="min-w-0 max-w-full xl:sticky xl:top-4 xl:self-start">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className={cx("text-xs font-semibold", subtle)}>Real {landscape ? "A4 üfüqi" : "A4"} önizləmə</div>
        <button type="button" onClick={() => setFullSize(true)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Tam ölçüdə bax</button>
      </div>
      <div className={cx("max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm", landscape ? "h-[105mm]" : "h-[148.5mm]") }>
        <div className="origin-top-left" style={{ width: pageWidth, transform: `scale(${scale})` }}>
          <StandardPrintPage settings={settings} formKey={formKey} form={form} />
        </div>
      </div>
      {fullSize && createPortal(
        <div className="fixed inset-0 z-[180] flex flex-col bg-slate-950/70" role="dialog" aria-modal="true" aria-label={`${form.title} A4 önizləmə`}>
          <div className="flex items-center justify-between border-b border-white/10 bg-slate-950 px-4 py-3 text-white">
            <div><div className="text-xs text-slate-400">Çap forması · real {landscape ? "A4 üfüqi" : "A4"}</div><div className="mt-0.5 font-semibold">{form.title}</div></div>
            <button type="button" onClick={() => setFullSize(false)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-xl" aria-label="Bağla">×</button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto min-w-max shadow-2xl" style={{ width: pageWidth }}><StandardPrintPage settings={settings} formKey={formKey} form={form} /></div>
          </div>
        </div>,
        document.body,
      )}
    </aside>
  );
}

const sampleProducts = [
  { name: "HG Beyaz Parlaq", variant: "Standart", barcode: "00001000001", sku: "ERSA 510", qty: 300, price: 2.9, discount: 0, total: 870 },
  { name: "Folyo Satin İnci", variant: "Standart", barcode: "00011000011", sku: "ERSA 011", qty: 240, price: 4.26, discount: 0, total: 1022.4 },
  { name: "Soft Touch Kaya Gri", variant: "Standart", barcode: "00007000007", sku: "ERSA 513", qty: 100, price: 5.11, discount: 25, total: 486 },
];

function StandardPrintPage({ settings, formKey, form }: { settings: PrintSettings; formKey: PrintFormKey; form: PrintSettings["forms"][PrintFormKey] }) {
  const isExport = ["orderConfirmation", "proforma", "commercial", "packingList"].includes(formKey);
  const landscape = formKey === "customs";
  if (isExport) return <ExportDocumentPreview settings={settings} formKey={formKey} form={form} />;
  return (
    <article className={cx("bg-white text-[9px] leading-tight text-slate-900", landscape ? "min-h-[210mm] w-[297mm] p-[9mm]" : "min-h-[297mm] w-[210mm] p-[11mm]") }>
      {printTemplateHasSlot(form, "HEADER") && <ArixPreviewHeader settings={settings} form={form} />}
      {formKey === "label" ? <ProductLabelPreview settings={settings} form={form} />
        : formKey === "receipt" ? <ReceiptPreview form={form} />
          : formKey === "customs" ? <CustomsPreview form={form} />
            : <OperationDocumentPreview formKey={formKey} form={form} />}
      {printTemplateHasSlot(form, "FOOTER") && <ArixPreviewFooter settings={settings} form={form} />}
    </article>
  );
}

function ArixPreviewHeader({ settings, form }: { settings: PrintSettings; form: PrintSettings["forms"][PrintFormKey] }) {
  return (
    <header className="mb-3 grid grid-cols-[1fr_auto_1fr] items-start gap-4 border-b border-slate-300 pb-3">
      <div className="flex items-center gap-2"><AriXLogo className="h-10 w-10" /><div><div className="text-[14px] font-semibold">AriX</div><div className="text-[8px] text-slate-500">Sənəd sistemi</div></div></div>
      <div className="flex h-12 min-w-28 items-center justify-center">{form.showLogo && settings.companyLogo && <img src={settings.companyLogo} alt="Şirkət loqosu" className="max-h-12 max-w-32 object-contain" />}</div>
      <div className="text-right"><div className="text-[15px] font-semibold">{form.title}</div><div className="mt-1 text-[9px] text-slate-500">{form.subtitle}</div></div>
      {form.showMeta && <div className="col-span-3 grid grid-cols-4 overflow-hidden rounded border border-slate-200 bg-slate-50"><PreviewCell label="Sənəd" value="#6253536" /><PreviewCell label="Tarix" value="14.10.2026, 12:47" /><PreviewCell label="Status" value="Gözləyir" /><PreviewCell label="Mənbə" value="ERSA DEPO" /></div>}
    </header>
  );
}

function PreviewCell({ label, value }: { label: string; value: string }) {
  return <div className="border-r border-slate-200 px-2 py-1.5 last:border-r-0"><span className="block text-[7px] text-slate-500">{label}</span><strong className="mt-0.5 block truncate text-[9px]">{value}</strong></div>;
}

function OperationDocumentPreview({ formKey, form }: { formKey: PrintFormKey; form: PrintSettings["forms"][PrintFormKey] }) {
  const senderLabel = formKey === "purchase" ? "Təchizatçı" : "Göndərən";
  const recipientLabel = formKey === "purchase" ? "Qəbul edən mağaza" : "Qəbul edən";
  const totals = sampleProducts.reduce((sum, item) => sum + item.total, 0);
  return <>
    {printTemplateHasSlot(form, "PARTIES") && <div className="mb-2 grid grid-cols-3 gap-2"><PreviewInfo label={senderLabel} value={formKey === "purchase" ? "ARIX TEST TƏCHİZATÇI" : "ERSA DEPO"} /><PreviewInfo label={recipientLabel} value={formKey === "sale" ? "Nümunə müştəri" : "ERSA ANTREPO"} /><PreviewInfo label="Müəllif" value="Arif Mahmud" /></div>}
    {printTemplateHasSlot(form, "SUMMARY") && <div className="mb-4 grid grid-cols-4 gap-2"><PreviewInfo label="Məbləğ" value={`${totals.toFixed(2)} ₼`} align /><PreviewInfo label="Ödənilib" value="500.00 ₼" align /><PreviewInfo label="Qalıq" value={`${(totals - 500).toFixed(2)} ₼`} align /><PreviewInfo label="Fiscal" value="Gözləyir" align /></div>}
    {printTemplateHasSlot(form, "PRODUCT_TABLE") && <><SectionTitle title={formKey === "inventory" ? "Faktiki və sistem qalığı" : formKey === "writeOff" ? "Silinən məhsullar" : "Məhsullar"} /><table className="w-full border-collapse text-[8px]"><thead><tr className="bg-slate-100">{["Ad", "Variasiya", "Bar-kod", "Artikul", "Miqdar", "Qiymət", "Endirim", "Ümumi"].map((head) => <th key={head} className="border border-slate-300 p-1 text-left">{head}</th>)}</tr></thead><tbody>{sampleProducts.map((item) => <tr key={item.sku}>{[item.name, item.variant, item.barcode, item.sku, `${item.qty} mt`, item.price.toFixed(2), item.discount.toFixed(2), item.total.toFixed(2)].map((value, index) => <td key={index} className={cx("whitespace-nowrap border border-slate-300 p-1", index >= 4 && "text-right")}>{value}</td>)}</tr>)}</tbody><tfoot><tr className="bg-slate-50 font-bold"><td colSpan={4} className="border border-slate-300 p-1 text-right">Ümumi nəticə</td><td className="border border-slate-300 p-1 text-right">640 mt</td><td colSpan={2} className="border border-slate-300 p-1" /><td className="border border-slate-300 p-1 text-right">{totals.toFixed(2)}</td></tr></tfoot></table></>}
    {printTemplateHasSlot(form, "PALLET_DETAILS") && <><SectionTitle title="Konteyner və palet məlumatları" /><div className="rounded border border-slate-300"><div className="flex justify-between bg-slate-100 p-2"><strong>HIST-CONT-1-006779</strong><span>2 palet · 6 rulo · 640 mt</span></div><div className="grid grid-cols-4 border-t border-slate-200 p-2"><span>Palet P-001</span><span>3 rulo</span><span>320 mt</span><span className="text-right">Bəyannamə: IM-2026-14</span></div></div></>}
  </>;
}

function PreviewInfo({ label, value, align = false }: { label: string; value: string; align?: boolean }) {
  return <div className="rounded border border-slate-200 bg-white px-2.5 py-2"><span className="block text-[7px] text-slate-500">{label}</span><strong className={cx("mt-1 block truncate text-[9px]", align && "text-right text-[11px]")}>{value}</strong></div>;
}

function SectionTitle({ title }: { title: string }) {
  return <div className="my-3 flex items-center gap-2 text-[10px] font-semibold"><span>{title}</span><span className="h-px flex-1 bg-slate-300" /></div>;
}

function ExportDocumentPreview({ settings, formKey, form }: { settings: PrintSettings; formKey: PrintFormKey; form: PrintSettings["forms"][PrintFormKey] }) {
  const packing = formKey === "packingList";
  const domestic = formKey === "orderConfirmation";
  const kind = domestic ? "domestic" : formKey === "commercial" ? "commercial_invoice" : packing ? "packing_list" : "proforma";
  const documentNo = packing ? "PL-2026-014" : domestic ? "SOF-9137308" : formKey === "proforma" ? "PI-2026-002" : "CI-2026-014";
  const paper = <OrderDocumentPaper
    form={{
      number: documentNo,
      documentType: kind,
      proformaNumber: documentNo,
      invoiceNumber: formKey === "commercial" ? "EXP2026000148" : "",
      shipmentDate: "25.10.2026",
      date: "25.10.2026",
      salesRepresentative: domestic ? "Mustafa Yazman" : "Ekrem Tiryaki",
      currency: domestic ? "TRY" : "EUR",
      exchangeRate: 1,
      vatIncluded: false,
      lines: sampleProducts.map((item, index) => ({
        productId: index + 1,
        productCode: item.sku,
        productName: item.name,
        quantity: item.qty,
        rollCount: index + 2,
        width: 1.42,
        unitPrice: item.price,
        discountRate: 0,
        vatRate: domestic ? 20 : 0,
        netWeight: item.qty * 1.55,
        grossWeight: item.qty * 1.65,
        countryOfOrigin: "CHINA",
      })),
      overallDiscountRate: 0,
      extraCharge: 0,
      extraChargeLabel: "Nakliye / ek ücret",
      paymentTerms: domestic ? "Sipariş onayında peşin ödeme" : "Bank transfer",
      deliveryTerms: domestic ? "Depo teslim" : "FCA Istanbul / Turkey",
      note: form.footerNote,
      status: "draft",
      customerName: domestic ? "AKYÜZ GRUP" : "SAMPLE IMPORT GmbH",
      customerContact: domestic ? "Mustafa Yazman" : "Purchasing Department",
      customerAddress: domestic ? "İstanbul · Türkiye" : "Berlin · Germany",
      customerPhone: "+49 30 000 00 00",
      customerEmail: "purchasing@example.com",
      packageType: "STANDARD EXPORT PACKAGING",
      productDescription: "PVC FOIL",
      incoterm: "FCA Istanbul",
      shipmentPort: "ISTANBUL / TURKEY",
      destination: "Berlin / Germany",
      countryOfOrigin: "CHINA",
      bankName: "ALBARAKA TÜRK",
      swiftCode: "BTFHTRISXXX",
      iban: "TR56 0020 3000 0998 7324 0000 02",
      transportMode: "ROAD",
      loadingPlace: "Istanbul",
      exporterDeclaration: "We hereby certify that this invoice is true and correct.",
    }}
    order={{ number: "ORD-9137308", customerName: domestic ? "AKYÜZ GRUP" : "SAMPLE IMPORT GmbH" }}
    printSettings={{
      companyName: settings.companyName,
      brandSubtitle: settings.brandSubtitle,
      addressLine: settings.companyDetails.address,
      phone: settings.companyDetails.phone,
      email: settings.companyDetails.email,
      website: settings.companyDetails.website,
      taxOffice: settings.companyDetails.taxOffice,
      taxNumber: settings.companyDetails.taxNumber,
      companyLogo: settings.companyLogo,
      companyStamp: settings.companyStamp,
    }}
    pdfExport
  />;
  const source = `<!doctype html><html><head><meta charset="utf-8"><style>${orderDocumentStyles}html,body{margin:0;background:#fff}body{padding:3.5mm 0;box-sizing:border-box}.approval-paper.pdf-export{margin:0 auto!important}</style></head><body>${renderToStaticMarkup(paper)}</body></html>`;
  return <iframe title={`${form.title} A4 önizleme`} srcDoc={source} className="h-[297mm] w-[210mm] border-0 bg-white" />;
}

function CustomsPreview({ form }: { form: PrintSettings["forms"][PrintFormKey] }) {
  return <>{printTemplateHasSlot(form, "DECLARATION") && <div className="mb-2 border border-slate-300 border-l-[3px] border-l-indigo-600 bg-slate-50 p-2 font-semibold">Bəyannamə · IM-2026-000143 · Konteyner HIST-CONT-1-006779</div>}{printTemplateHasSlot(form, "CUSTOMS_TABLE") && <table className="w-full border-collapse text-[8px]"><thead><tr className="bg-slate-100">{["No", "Ürün", "Kod", "Kap", "MT", "Birim Fiyat", "Toplam Fiyat", "Net Weight", "Gross Weight", "Palet", "Rulo"].map((x) => <th key={x} className="border border-slate-300 p-1.5">{x}</th>)}</tr></thead><tbody>{sampleProducts.map((item, i) => <tr key={item.sku}>{[i + 1, item.name, item.sku, `${i + 2} kap`, `${item.qty} mt`, `$${item.price.toFixed(2)}`, `$${item.total.toFixed(2)}`, `${(item.qty * 1.55).toFixed(2)} kg`, `${(item.qty * 1.65).toFixed(2)} kg`, `P-${i + 1}`, i === 0 ? "full" : `${i + 1}-${i + 3}`].map((x, j) => <td key={j} className={cx("whitespace-nowrap border border-slate-300 p-1.5", j >= 3 && j <= 8 && "text-right")}>{x}</td>)}</tr>)}</tbody><tfoot><tr className="bg-slate-100 font-bold"><td colSpan={3} className="border p-1.5 text-right">TOPLAM</td><td className="border p-1.5">9 kap</td><td className="border p-1.5 text-right">640 mt</td><td /><td className="border p-1.5 text-right">$2,378.40</td><td className="border p-1.5 text-right">992 kg</td><td className="border p-1.5 text-right">1,056 kg</td><td colSpan={2} /></tr></tfoot></table>}{form.footerNote && <div className="mt-4 text-slate-500">{form.footerNote}</div>}</>;
}

function ReceiptPreview({ form }: { form: PrintSettings["forms"][PrintFormKey] }) {
  return <div className="mx-auto mt-8 max-w-[145mm] rounded border border-slate-300 p-5">{printTemplateHasSlot(form, "RECEIPT_DETAILS") && <><div className="grid grid-cols-2 gap-y-4"><PreviewInfo label="Qəbz №" value="PAY-2026-00418" /><PreviewInfo label="Tarix / saat" value="14.10.2026 · 12:47" /><PreviewInfo label="Kontragent" value="Nümunə müştəri" /><PreviewInfo label="Hesab" value="Kassa №1" /><PreviewInfo label="Ödəniş növü" value="Bank köçürməsi" /><PreviewInfo label="Məbləğ" value="2,378.40 ₼" align /></div><div className="mt-8 border-t border-slate-300 pt-3"><b>Açıqlama</b><div className="mt-2 text-slate-500">{form.footerNote || "Satış sənədi üzrə ödəniş."}</div></div></>}{printTemplateHasSlot(form, "SIGNATURES") && <div className="mt-16 grid grid-cols-2 gap-20 text-center"><span className="border-t pt-2">Təhvil verən</span><span className="border-t pt-2">Təhvil alan</span></div>}</div>;
}

function ProductLabelPreview({ settings, form }: { settings: PrintSettings; form: PrintSettings["forms"][PrintFormKey] }) {
  if (!printTemplateHasSlot(form, "LABEL")) return null;
  return <div className="mx-auto mt-12 grid max-w-[160mm] grid-cols-2 gap-5">{[1, 2, 3, 4].map((item) => <div key={item} className="flex h-[55mm] flex-col justify-between border-2 border-slate-900 p-4"><div className="flex items-start justify-between"><div><div className="text-[16px] font-bold">HG Beyaz Parlaq</div><div className="mt-1 text-[11px]">ERSA 510 · TEST-001</div></div><strong>{settings.companyName}</strong></div><div className="text-center font-mono text-[22px] tracking-[4px]">|||| ||| ||||</div><div className="flex justify-between text-[10px]"><span>00001000001</span><span>100 mt</span></div></div>)}</div>;
}

function ArixPreviewFooter({ settings, form }: { settings: PrintSettings; form: PrintSettings["forms"][PrintFormKey] }) {
  if (!form.showFooter) return null;
  return <footer className="mt-8 flex items-end justify-between border-t border-slate-300 pt-2 text-[8px] text-slate-500"><div><strong className="text-indigo-600">{settings.companyName || "AriX"}</strong>{form.footerInfo && <span> · {form.footerInfo}</span>}{form.footerNote && <div className="mt-1 max-w-[130mm] whitespace-pre-line">{form.footerNote}</div>}</div><span>Sənəd № ARX-2026-001</span></footer>;
}

function GibPrintFormPreview({ settings, formKey, form, subtle }: { settings: PrintSettings; formKey: PrintFormKey; form: PrintSettings["forms"][PrintFormKey]; subtle: string }) {
  const [fullSize, setFullSize] = useState(false);
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(JSON.stringify({ vkn: settings.companyDetails.taxNumber || "1234567890", no: "ARX2026000000001", ettn: "DEMO-ETTN-2026", tip: formKey }), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
      color: { dark: "#111827", light: "#ffffff" },
    }).then((url) => { if (active) setQrUrl(url); });
    return () => { active = false; };
  }, [formKey, settings.companyDetails.taxNumber]);

  return (
    <aside className="min-w-0 max-w-full xl:sticky xl:top-4 xl:self-start">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className={cx("text-xs font-semibold", subtle)}>Real A4 önizləmə</div>
        <button type="button" onClick={() => setFullSize(true)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Tam ölçüdə bax
        </button>
      </div>
      <div className="h-[148.5mm] max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
        <div className="w-[210mm] origin-top-left scale-50">
          <GibPrintPage settings={settings} formKey={formKey} form={form} qrUrl={qrUrl} />
        </div>
      </div>
      {fullSize && createPortal(
        <div className="fixed inset-0 z-[180] flex flex-col bg-slate-950/70" role="dialog" aria-modal="true" aria-label={`${form.title} A4 önizləmə`}>
          <div className="flex items-center justify-between border-b border-white/10 bg-slate-950 px-4 py-3 text-white">
            <div><div className="text-xs text-slate-400">Çap forması · real A4</div><div className="mt-0.5 font-semibold">{form.title}</div></div>
            <button type="button" onClick={() => setFullSize(false)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-xl" aria-label="Bağla">×</button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto w-[210mm] min-w-[210mm] shadow-2xl">
              <GibPrintPage settings={settings} formKey={formKey} form={form} qrUrl={qrUrl} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </aside>
  );
}

function GibPrintPage({ settings, formKey, form, qrUrl }: { settings: PrintSettings; formKey: PrintFormKey; form: PrintSettings["forms"][PrintFormKey]; qrUrl: string }) {
  const company = settings.companyDetails;
  const isDespatch = formKey === "eDespatch";
  const isExport = formKey === "exportInvoice";
  const isArchive = formKey === "eArchive";
  const documentLabel = isDespatch ? "İrsaliye" : "Fatura";
  const scenario = isDespatch ? "TEMELIRSALIYE" : isExport ? "IHRACAT" : isArchive ? "EARSIVFATURA" : "TEMELFATURA";
  const number = isDespatch ? "ERS20260000001348" : "ERF20260000001179";
  const address = [company.address, company.district, company.city, company.postalCode].filter(Boolean).join(" · ");
  const lines = [
    { code: "ERSA 513", name: "SOFT TOUCH KAYA GRİ", quantity: 300, unit: "Metre Tül", price: 243.9017, tax: 20 },
    { code: "ERSA 600", name: "FOLYOLU SEDEF METAL", quantity: 240, unit: "Metre Tül", price: 202.09, tax: 20 },
    { code: "ERSA 801", name: "DARK PASİFİC", quantity: 100, unit: "Metre Tül", price: 181.1841, tax: 20 },
  ];
  const goodsTotal = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
  const taxTotal = goodsTotal * 0.2;
  const money = (value: number) => `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

  return (
    <article data-no-i18n className="min-h-[297mm] w-[210mm] bg-white p-[8mm] text-[9px] leading-tight text-slate-900">
      <div className={cx("grid items-center gap-4 border-b-2 border-slate-900 pb-2", form.showLogo && settings.companyLogo ? "grid-cols-4" : "grid-cols-3")}>
        {form.showLogo && settings.companyLogo && <div className="flex h-20 items-center justify-center"><img src={settings.companyLogo} alt="Şirket logosu" className="max-h-16 max-w-36 object-contain" /></div>}
        <div className="flex h-20 flex-col items-center justify-center text-center"><AriXLogo className="h-11 w-11" /><div className="mt-0.5 text-[10px] font-medium text-slate-700">AriX</div></div>
        <div className="flex h-20 flex-col items-center justify-center text-center">
          <img src={isDespatch ? "/gib/e-irsaliye.jpg" : "/gib/e-fatura.jpg"} alt="Gelir İdaresi Başkanlığı" className="h-13 w-16 object-contain" />
          <div className="mt-0.5 text-[9px] font-bold text-slate-800">{form.title}</div>
        </div>
        <div className="flex h-20 items-center justify-center">{qrUrl ? <img src={qrUrl} alt="GİB karekod" className="h-20 w-20" /> : <div className="h-20 w-20 border" />}</div>
      </div>

      {form.showCompanyDetails && (
        <div className="grid grid-cols-[1.35fr_1fr] gap-5 border-b border-slate-300 py-2.5">
          <div><div className="text-[15px] font-bold leading-5">{company.title || settings.companyName || "Firma adı"}</div><div className="mt-1.5 leading-4 text-slate-600">{address || "Firma adresi"}</div></div>
          <div className="leading-4"><div><b>Vergi dairesi:</b> {company.taxOffice || "-"}</div><div><b>VKN/TCKN:</b> {company.taxNumber || "-"}</div>{company.phone && <div className="text-slate-600">Tel: {company.phone}</div>}{company.fax && <div className="text-slate-600">Faks: {company.fax}</div>}{company.website && <div className="text-slate-600">Web: {company.website}</div>}{company.email && <div className="text-slate-600">E-posta: {company.email}</div>}</div>
        </div>
      )}

      <div className="mt-2.5 grid grid-cols-2 gap-4">
        <section><div className="text-[8px] font-bold uppercase text-slate-500">Alıcı</div><div className="mt-0.5 text-[11px] font-bold">Örnek müşteri şirketi</div><div className="mt-1 leading-4 text-slate-600">İstanbul · Türkiye</div><div className="mt-1"><b>VKN/TCKN:</b> 1234567890</div><div><b>Vergi dairesi:</b> HALKALI</div></section>
        <section className="ml-auto w-full min-w-64 border-l border-t border-slate-300">
          <GibPreviewMeta label="ETTN" value="F102107D-F6A9-40DB-89EA-FF8D0D62D67F" small />
          <GibPreviewMeta label="Özelleştirme no" value="TR1.2" /><GibPreviewMeta label="Senaryo" value={scenario} /><GibPreviewMeta label={`${documentLabel} tipi`} value={isDespatch ? "SEVK" : "SATIS"} /><GibPreviewMeta label={`${documentLabel} no`} value={number} /><GibPreviewMeta label={`${documentLabel} tarihi`} value="14-10-2026" /><GibPreviewMeta label="Oluşturma zamanı" value="12:02:36" />
          {!isDespatch && <GibPreviewMeta label="Para birimi" value="TRY" />}
        </section>
      </div>

      {isDespatch && <div className="mt-2.5 grid grid-cols-2 border-l border-t border-slate-300 bg-slate-50"><GibPreviewMeta label="Fiili sevk tarihi" value="14-10-2026" /><GibPreviewMeta label="Fiili sevk zamanı" value="12:15:00" /><GibPreviewMeta label="Taşıyıcı" value="Örnek Lojistik" /><GibPreviewMeta label="Taşıyıcı VKN / Plaka" value="1234567890 · 34 ARX 26" /><GibPreviewMeta label="Sürücü" value="Mehmet Yılmaz" /><GibPreviewMeta label="Sürücü TCKN" value="11111111111" /></div>}
      {isExport && <div className="mt-2.5 grid grid-cols-2 border-l border-t border-slate-300 bg-slate-50"><GibPreviewMeta label="Gümrük alıcısı" value="T.C. Ticaret Bakanlığı" /><GibPreviewMeta label="Yurt dışı alıcı" value="Sample Import GmbH" /><GibPreviewMeta label="Incoterms" value="CIF" /><GibPreviewMeta label="Taşıma şekli" value="1 · Deniz yolu" /><GibPreviewMeta label="Kap" value="CT · CONT-2026 · 12" /><GibPreviewMeta label="KDV istisnası" value="301 · Mal ihracatı" /></div>}

      <table className="mt-3.5 w-full border-collapse text-[8px] leading-tight">
        <thead><tr className="bg-slate-900 text-white"><th className="border border-slate-700 px-1 py-0.5 text-left">#</th><th className="border border-slate-700 px-1 py-0.5 text-left">Mal / Hizmet</th><th className="border border-slate-700 px-1 py-0.5 text-left">Kod</th>{isExport && <th className="border border-slate-700 px-1 py-0.5 text-left">GTİP</th>}<th className="border border-slate-700 px-1 py-0.5 text-right">Miktar</th>{isDespatch ? <><th className="border border-slate-700 px-1 py-0.5 text-left">Etiket numarası</th><th className="border border-slate-700 px-1 py-0.5 text-right">Sonra gönderilecek</th></> : <><th className="border border-slate-700 px-1 py-0.5 text-right">Birim fiyat</th><th className="border border-slate-700 px-1 py-0.5 text-right">KDV oranı</th><th className="border border-slate-700 px-1 py-0.5 text-right">KDV tutarı</th><th className="border border-slate-700 px-1 py-0.5 text-right">Tutar</th></>}</tr></thead>
        <tbody>{lines.map((line, index) => <tr key={line.code}><td className="border border-slate-300 px-1 py-0.5">{index + 1}</td><td className="whitespace-nowrap border border-slate-300 px-1 py-0.5 font-medium">{line.name}</td><td className="border border-slate-300 px-1 py-0.5">{line.code}</td>{isExport && <td className="border border-slate-300 px-1 py-0.5">3920.49.10.00.00</td>}<td className="whitespace-nowrap border border-slate-300 px-1 py-0.5 text-right">{line.quantity} {line.unit}</td>{isDespatch ? <><td className="border border-slate-300 px-1 py-0.5">RL-{index + 1}</td><td className="border border-slate-300 px-1 py-0.5 text-right">-</td></> : <><td className="border border-slate-300 px-1 py-0.5 text-right">{money(line.price)}</td><td className="border border-slate-300 px-1 py-0.5 text-right">%{line.tax}</td><td className="border border-slate-300 px-1 py-0.5 text-right">{money(line.quantity * line.price * .2)}</td><td className="border border-slate-300 px-1 py-0.5 text-right font-semibold">{money(line.quantity * line.price)}</td></>}</tr>)}</tbody>
      </table>

      {!isDespatch && <div className="mt-3 ml-auto w-full max-w-80 space-y-1 border-t-2 border-slate-900 pt-2"><GibPreviewTotal label="Mal / hizmet toplamı" value={money(goodsTotal)} /><GibPreviewTotal label="Toplam iskonto" value={money(0)} /><GibPreviewTotal label="Hesaplanan KDV (%20)" value={money(taxTotal)} /><GibPreviewTotal label="Vergiler dahil toplam" value={money(goodsTotal + taxTotal)} /><GibPreviewTotal label="Ödenecek tutar" value={money(goodsTotal + taxTotal)} strong /></div>}

      {isDespatch && <><section className="mt-4"><div className="mb-1 text-[10px] font-bold">İlgili Dokümanlar</div><div className="grid grid-cols-3 border-l border-t border-slate-300 bg-slate-100 font-semibold"><span className="border-b border-r border-slate-300 p-1">Doküman no</span><span className="border-b border-r border-slate-300 p-1">Tarih</span><span className="border-b border-r border-slate-300 p-1">Doküman tipi</span><span className="border-b border-r border-slate-300 p-1">SAT-2026-001</span><span className="border-b border-r border-slate-300 p-1">14-10-2026</span><span className="border-b border-r border-slate-300 p-1">SİPARİŞ</span></div></section><div className="mt-4 grid grid-cols-2 border border-slate-300"><section className="border-r border-slate-300 p-2"><b>Açıklamalar</b><div className="mt-1">Asıl alıcı: Örnek müşteri şirketi</div><div>İstanbul · Türkiye</div></section><section className="p-2"><b>Taşıyıcı Bilgileri</b><div className="mt-1">Araç plakası: 34 ARX 26</div><div>Şoför: Mehmet Yılmaz</div></section></div></>}

      {!isDespatch && form.showBankAccounts && company.bankAccounts?.length > 0 && <section className="mt-4"><div className="mb-1 text-[10px] font-bold">Banka Hesapları</div><table className="w-full border-collapse"><thead><tr className="bg-slate-100"><th className="border border-slate-300 p-1 text-left">Banka</th><th className="border border-slate-300 p-1 text-left">Para birimi</th><th className="border border-slate-300 p-1 text-left">IBAN</th></tr></thead><tbody>{company.bankAccounts.map((account) => <tr key={`${account.bank}-${account.currency}-${account.iban}`}><td className="border border-slate-300 p-1">{account.bank}</td><td className="border border-slate-300 p-1">{account.currency}</td><td className="border border-slate-300 p-1">{account.iban}</td></tr>)}</tbody></table></section>}
      {form.showNotes && <section className="mt-4 border border-slate-300"><div className="grid grid-cols-[110px_1fr]"><div className="border-r border-slate-300 bg-slate-100 p-1 font-bold">{isDespatch ? "İrsaliye Açıklaması" : "Fatura Açıklaması"}</div><div className="whitespace-pre-line p-1">{form.footerNote || "Belgeye ait açıklama burada gösterilir."}</div></div></section>}
      {isArchive && form.showStamp && settings.companyStamp && <section className="mt-4 flex justify-end"><div className="w-[65mm] text-center"><div className="text-[8px] font-semibold uppercase text-slate-500">Kaşe / İmza</div><div className="flex h-[44mm] items-center justify-center"><img src={settings.companyStamp} alt="Kaşe ve imza" className="max-h-[44mm] max-w-[65mm] object-contain" /></div></div></section>}
      {form.showFooter && form.footerInfo && <footer className="mt-4 flex justify-between border-t border-slate-300 pt-1 text-[8px] text-slate-500"><span>{form.footerInfo}</span><span>{number}</span></footer>}
    </article>
  );
}

function GibPreviewMeta({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return <div className="grid min-w-0 grid-cols-[96px_1fr] gap-1.5 border-b border-r border-slate-300 px-1.5 py-0.5"><span className="whitespace-nowrap font-semibold text-slate-500">{label}</span><span className={small ? "break-all text-[8px]" : "min-w-0 break-words"}>{value}</span></div>;
}

function GibPreviewTotal({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={cx("flex items-center justify-between gap-4", strong && "border-t border-slate-400 pt-1 text-[10px] font-bold")}><span>{label}</span><span>{value}</span></div>;
}

function StoreCard({ item, onEdit, onDelete, border, card, soft, subtle }: {
  item: { name: string; type: string; date: string; balance?: string; status?: string };
  onEdit?: () => void;
  onDelete?: () => void;
  border: string;
  card: string;
  soft: string;
  subtle: string;
}) {
  return (
    <div className={cx("overflow-hidden rounded-2xl border", border, card)}>
      <div className={cx("border-b px-4 py-3 text-sm font-semibold", border, soft)}>{item.type}</div>
      <div className="flex items-start gap-4 p-5">
        <div className={cx("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl", soft)}>
          {item.type.includes("Kassa") ? <I.Wallet className="h-9 w-9 text-slate-400" /> : <I.Building className="h-9 w-9 text-slate-400" />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold text-indigo-600">{item.name}</div>
          <div className={cx("mt-1 text-sm", subtle)}>Yaradıldı {item.date}</div>
          {item.status && <div className={cx("mt-1 text-sm", item.status === "Aktiv" ? "text-emerald-600" : subtle)}>{item.status}</div>}
          {item.balance && <div className={cx("mt-1 text-sm", subtle)}>Balans {item.balance}</div>}
        </div>
      </div>
      <div className={cx("grid grid-cols-[1fr_72px] border-t p-3", border, soft)}>
        <button type="button" onClick={onEdit} disabled={!onEdit} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-400 text-sm font-semibold text-emerald-600 disabled:opacity-40"><I.Edit className="h-4 w-4" />Redaktə</button>
        <button type="button" onClick={onDelete} disabled={!onDelete} className="ml-2 inline-flex h-10 items-center justify-center rounded-xl border border-rose-400 text-rose-600 disabled:opacity-40"><I.Trash className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function CreateTile({ border, soft, label, onClick }: { border: string; soft: string; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx("flex min-h-[190px] items-center justify-center rounded-2xl border border-dashed transition hover:border-indigo-300", border, soft)}>
      <span className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white/60 px-4 py-3 text-sm font-semibold text-indigo-600">
        <I.Plus className="h-4 w-4" />
        {label}
      </span>
    </button>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cx("block min-w-0", className)}>
      <span className="mb-1 block text-sm font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
