import { useEffect, useState, type SVGProps } from "react";
import { requestJson } from "../api";

const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");

export type OnlineCollectionSection =
  | "payments"
  | "new"
  | "pos"
  | "paramPos"
  | "commissions"
  | "paymentAi"
  | "transactions"
  | "transactionDetail"
  | "paymentLinks"
  | "mailSmsTracking"
  | "notifications"
  | "cardList"
  | "dealerPos"
  | "customersDealers"
  | "graphicReports"
  | "generalReports"
  | "accountDebt"
  | "accountMovements"
  | "routing"
  | "bins"
  | "pages"
  | "paymentSettings"
  | "contracts"
  | "currentAccounts"
  | "generalSettings"
  | "ntLogin"
  | "cardSettings"
  | "dynamicFields"
  | "paymentItems"
  | "binFilters"
  | "reconciliation"
  | "logs";

type VirtualPos = {
  id: string;
  name: string;
  provider: string;
  bank: string;
  status: "Aktiv" | "Test" | "Passiv";
  priority: number;
  successRate: number;
  currency: string;
  minAmount: number;
  maxAmount: number;
  secure3d: "Məcburi" | "Opsional";
  brands: string[];
  installments: number[];
};

type BinRule = {
  prefix: string;
  bank: string;
  brand: string;
  cardType: "Kredit" | "Debit";
  country: string;
  preferredPos: string;
};

type CommissionRule = {
  provider: string;
  brand: string;
  installment: number;
  rate: number;
  fixed: number;
  payer: "Müştəri" | "Firma";
};

type CollectionRow = {
  id: string;
  customer: string;
  document: string;
  amount: number;
  status: "Ödəndi" | "Göndərildi" | "Açıldı" | "Vaxtı keçdi" | "Uğursuz";
  channel: "Link" | "SMS" | "E-mail" | "QR";
  pos: string;
  created: string;
  paidAt?: string;
};

const I = {
  Search: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
    </svg>
  ),
  Sliders: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="11" cy="18" r="2" />
    </svg>
  ),
  CreditCard: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18" /><path d="M7 15h4" /><path d="M16 15h1" />
    </svg>
  ),
  Link: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
    </svg>
  ),
  Check: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12.5 10 17l9-10" />
    </svg>
  ),
  Bolt: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  ),
  Send: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" />
    </svg>
  ),
};

const posList: VirtualPos[] = [
  { id: "paynkolay-akbank", name: "PaynKolay Akbank POS", provider: "PaynKolay", bank: "Akbank", status: "Aktiv", priority: 1, successRate: 98.4, currency: "TRY/AZN/USD", minAmount: 1, maxAmount: 250000, secure3d: "Məcburi", brands: ["Visa", "Mastercard", "Troy"], installments: [1, 2, 3, 6, 9] },
  { id: "param-garanti", name: "Param Garanti POS", provider: "Param", bank: "Garanti BBVA", status: "Aktiv", priority: 2, successRate: 97.8, currency: "TRY", minAmount: 1, maxAmount: 150000, secure3d: "Məcburi", brands: ["Visa", "Mastercard"], installments: [1, 3, 6, 9, 12] },
  { id: "ziraat-direct", name: "Ziraat Direkt POS", provider: "Banka", bank: "Ziraat", status: "Test", priority: 3, successRate: 94.1, currency: "TRY", minAmount: 5, maxAmount: 100000, secure3d: "Opsional", brands: ["Visa", "Troy"], installments: [1, 2, 3, 6] },
  { id: "iyzico-yapi", name: "iyzico Yapı Kredi", provider: "iyzico", bank: "Yapı Kredi", status: "Passiv", priority: 5, successRate: 91.6, currency: "TRY/USD", minAmount: 1, maxAmount: 80000, secure3d: "Məcburi", brands: ["Visa", "Mastercard"], installments: [1, 3] },
];

const binRules: BinRule[] = [
  { prefix: "454360", bank: "Akbank", brand: "Visa", cardType: "Kredit", country: "TR", preferredPos: "paynkolay-akbank" },
  { prefix: "552879", bank: "Garanti BBVA", brand: "Mastercard", cardType: "Kredit", country: "TR", preferredPos: "param-garanti" },
  { prefix: "979200", bank: "Ziraat", brand: "Troy", cardType: "Debit", country: "TR", preferredPos: "ziraat-direct" },
  { prefix: "540667", bank: "Yapı Kredi", brand: "Mastercard", cardType: "Kredit", country: "TR", preferredPos: "param-garanti" },
  { prefix: "416973", bank: "Kapital Bank", brand: "Visa", cardType: "Kredit", country: "AZ", preferredPos: "paynkolay-akbank" },
];

const commissionRules: CommissionRule[] = [
  { provider: "PaynKolay", brand: "Visa", installment: 1, rate: 1.75, fixed: 0, payer: "Firma" },
  { provider: "PaynKolay", brand: "Visa", installment: 3, rate: 4.25, fixed: 0, payer: "Müştəri" },
  { provider: "Param", brand: "Mastercard", installment: 1, rate: 1.95, fixed: 0, payer: "Firma" },
  { provider: "Param", brand: "Mastercard", installment: 6, rate: 7.4, fixed: 0, payer: "Müştəri" },
  { provider: "Banka", brand: "Troy", installment: 1, rate: 1.35, fixed: 0, payer: "Firma" },
];

const collections: CollectionRow[] = [
  { id: "THS-1029", customer: "ABANOZ", document: "Satış #2332", amount: 6123.04, status: "Ödəndi", channel: "Link", pos: "PaynKolay Akbank POS", created: "21 may 09:12", paidAt: "21 may 09:18" },
  { id: "THS-1028", customer: "Global Design", document: "Satış #2348", amount: 2377.08, status: "Açıldı", channel: "SMS", pos: "Param Garanti POS", created: "20 may 17:40" },
  { id: "THS-1027", customer: "AKÇA KAPAK", document: "Satış #2355", amount: 852, status: "Göndərildi", channel: "E-mail", pos: "Avtomatik routing", created: "19 may 12:31" },
  { id: "THS-1026", customer: "DURU PVC ORMAN ÜRÜNLERİ", document: "Qaytarma #117", amount: 1363.2, status: "Uğursuz", channel: "QR", pos: "Ziraat Direkt POS", created: "18 may 16:02" },
];

const sectionTitles: Record<OnlineCollectionSection, string> = {
  payments: "Onlayn ödənişlər",
  new: "Ödəniş al",
  pos: "POS və routing",
  paramPos: "Param POS",
  commissions: "Taksit və komissiyalar",
  paymentAi: "Ödeme AI",
  transactions: "İşlemler",
  transactionDetail: "İşlemler detay",
  paymentLinks: "Ödeme linki listesi",
  mailSmsTracking: "Mail SMS takip",
  notifications: "Bilgilendirme mail ve SMS",
  cardList: "Kart listesi",
  dealerPos: "Bayi POS yönetimi",
  customersDealers: "Müşteriler ve bayiler",
  graphicReports: "Grafik raporlar",
  generalReports: "Genel raporlar",
  accountDebt: "Hesaplar ve borçlandırma",
  accountMovements: "Hesap hareketleri",
  routing: "Routing qaydaları",
  bins: "BIN cədvəli",
  pages: "Ödəniş səhifələri",
  paymentSettings: "Ödeme parametreleri",
  contracts: "Sözleşmeler",
  currentAccounts: "Cari hesaplar",
  generalSettings: "Genel parametreler",
  ntLogin: "NT login parametreleri",
  cardSettings: "Kart ayarları",
  dynamicFields: "Dinamik alanlar",
  paymentItems: "Ödeme kalemleri",
  binFilters: "BIN filtreleri",
  reconciliation: "Mutabakat",
  logs: "Webhook və loglar",
};

const money = (value: number) => value.toLocaleString("az-Latn-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const makeUI = (isDark: boolean) => ({
  card: `rounded-2xl border ${isDark ? "glass-panel-dark" : "glass-panel"}`,
  ring: isDark ? "ring-1 ring-white/10" : "ring-1 ring-white/55",
  border: isDark ? "border-white/10" : "border-white/60",
  soft: isDark ? "bg-white/5" : "bg-slate-50",
  subtle: isDark ? "text-slate-400" : "text-slate-500",
  input: [
    "h-10 rounded-xl border px-3 outline-none placeholder-slate-400",
    isDark ? "glass-control-dark text-slate-100 focus:border-indigo-400" : "glass-control text-slate-800 focus:border-indigo-400",
  ].join(" "),
});

export default function OnlineCollections({ section = "payments", isDark = false }: { section?: OnlineCollectionSection; isDark?: boolean }) {
  const ui = makeUI(isDark);
  const view =
    section === "paramPos" || section === "paymentAi" || section === "routing" || section === "bins" || section === "binFilters" ? "pos" :
    section === "paymentSettings" || section === "contracts" || section === "currentAccounts" || section === "generalSettings" || section === "ntLogin" || section === "cardSettings" || section === "dynamicFields" || section === "paymentItems" || section === "pages" || section === "logs" ? "settings" :
    section === "transactions" || section === "paymentLinks" || section === "mailSmsTracking" || section === "notifications" || section === "cardList" || section === "dealerPos" || section === "customersDealers" ? "payments" :
    section === "graphicReports" || section === "generalReports" || section === "accountDebt" || section === "accountMovements" || section === "reconciliation" ? "reports" :
    section;
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState(6123.04);
  const [cardPrefix, setCardPrefix] = useState("454360");
  const [installment, setInstallment] = useState(1);
  const matchedBin = binRules.find((rule) => cardPrefix.replace(/\D/g, "").startsWith(rule.prefix));
  const suggestedPos = posList.find((pos) => pos.id === matchedBin?.preferredPos) ?? posList.find((pos) => pos.status === "Aktiv")!;
  const commission = commissionRules.find((rule) => rule.provider === suggestedPos.provider && rule.brand === (matchedBin?.brand ?? "Visa") && rule.installment === installment)
    ?? commissionRules.find((rule) => rule.provider === suggestedPos.provider && rule.installment === 1);
  const commissionAmount = amount * ((commission?.rate ?? 0) / 100) + (commission?.fixed ?? 0);
  const payable = amount + (commission?.payer === "Müştəri" ? commissionAmount : 0);

  const filteredCollections = collections.filter((row) =>
    [row.id, row.customer, row.document, row.status, row.channel, row.pos].join(" ").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-0 min-w-0 flex-col gap-3">
      <div className={cx("flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between", ui.card, ui.ring)}>
        <div>
          <h1 className="text-xl font-semibold">{sectionTitles[section]}</h1>
          <p className={cx("text-sm", ui.subtle)}>Sanal POS, komissiya, BIN routing, ödəniş linkləri və hesabatlar yığcam mərkəzdə.</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative w-full sm:w-[360px]">
            <I.Search className="absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="axtarış..." className={cx(ui.input, "w-full pl-8 pr-3")} />
          </div>
          <button type="button" className={cx("flex h-10 w-10 items-center justify-center rounded-xl border", ui.border)} title="Filtr">
            <I.Sliders className="h-5 w-5" />
          </button>
          <button type="button" className="surface-primary hidden h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold sm:inline-flex">
            <I.CreditCard className="h-4 w-4" />
            Ödəniş al
          </button>
        </div>
      </div>

      {view === "new" ? (
        <NewCollection amount={amount} setAmount={setAmount} cardPrefix={cardPrefix} setCardPrefix={setCardPrefix} installment={installment} setInstallment={setInstallment} matchedBin={matchedBin} suggestedPos={suggestedPos} commission={commission} commissionAmount={commissionAmount} payable={payable} isDark={isDark} />
      ) : view === "pos" ? (
        <PosSectionModern isDark={isDark} cardPrefix={cardPrefix} setCardPrefix={setCardPrefix} matchedBin={matchedBin} suggestedPos={suggestedPos} />
      ) : view === "commissions" ? (
        <CommissionsSection isDark={isDark} />
      ) : view === "settings" ? (
        <CollectionSettingsHub isDark={isDark} />
      ) : view === "reports" ? (
        <ReconciliationSection isDark={isDark} />
      ) : (
        <PaymentsSection rows={filteredCollections} isDark={isDark} amount={amount} setAmount={setAmount} cardPrefix={cardPrefix} setCardPrefix={setCardPrefix} installment={installment} setInstallment={setInstallment} matchedBin={matchedBin} suggestedPos={suggestedPos} commission={commission} commissionAmount={commissionAmount} payable={payable} />
      )}
    </div>
  );
}

function NewCollection({
  amount,
  setAmount,
  cardPrefix,
  setCardPrefix,
  installment,
  setInstallment,
  matchedBin,
  suggestedPos,
  commission,
  commissionAmount,
  payable,
  isDark,
}: {
  amount: number;
  setAmount: (value: number) => void;
  cardPrefix: string;
  setCardPrefix: (value: string) => void;
  installment: number;
  setInstallment: (value: number) => void;
  matchedBin?: BinRule;
  suggestedPos: VirtualPos;
  commission?: CommissionRule;
  commissionAmount: number;
  payable: number;
  isDark: boolean;
}) {
  const ui = makeUI(isDark);
  const installments = suggestedPos.installments;
  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className={cx("min-h-0 overflow-auto p-4", ui.card, ui.ring)}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Müştəri" value="ABANOZ" isDark={isDark} />
          <Field label="Bağlı sənəd / borc" value="Satış #2332 · 6,123.04 ₼" isDark={isDark} />
          <label className="block">
            <span className={cx("mb-2 block text-sm font-semibold", ui.subtle)}>Tahsilat məbləği</span>
            <input type="number" value={amount} onChange={(event) => setAmount(Number(event.target.value) || 0)} className={cx(ui.input, "w-full text-right text-lg tabular-nums")} />
          </label>
          <label className="block">
            <span className={cx("mb-2 block text-sm font-semibold", ui.subtle)}>Kart BIN / ilk 6-8 rəqəm</span>
            <input value={cardPrefix} onChange={(event) => setCardPrefix(event.target.value)} placeholder="454360" className={cx(ui.input, "w-full tracking-widest")} />
          </label>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <InfoCard title="Kart" value={matchedBin ? `${matchedBin.bank} · ${matchedBin.brand}` : "BIN tanınmadı"} caption={matchedBin ? `${matchedBin.cardType} · ${matchedBin.country}` : "Manual POS seçilə bilər"} tone="indigo" isDark={isDark} />
          <InfoCard title="Seçilən POS" value={suggestedPos.name} caption={`${suggestedPos.provider} · uğur ${suggestedPos.successRate}%`} tone="emerald" isDark={isDark} />
          <InfoCard title="3D Secure" value={suggestedPos.secure3d} caption={`Limit ${money(suggestedPos.minAmount)} - ${money(suggestedPos.maxAmount)}`} tone="sky" isDark={isDark} />
        </div>

        <div className={cx("mt-5 rounded-2xl border p-4", ui.border, ui.soft)}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Taksit və komissiya</h3>
              <p className={cx("text-sm", ui.subtle)}>Seçilən POS-a görə uyğun taksitlər və komissiya hesablanır.</p>
            </div>
            <select value={installment} onChange={(event) => setInstallment(Number(event.target.value))} className={cx(ui.input, "w-40")}>
              {installments.map((item) => <option key={item} value={item}>{item === 1 ? "Tek çekim" : `${item} taksit`}</option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Komissiya" value={`${money(commissionAmount)} ₼`} />
            <Summary label="Komissiya faizi" value={`%${commission?.rate ?? 0}`} />
            <Summary label="Ödənəcək" value={`${money(payable)} ₼`} strong />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {["Link", "SMS", "E-mail", "QR"].map((channel) => (
            <button key={channel} type="button" className={cx("flex h-12 items-center justify-center gap-2 rounded-xl border font-semibold", ui.border, isDark ? "hover:bg-white/10" : "hover:bg-white")}>
              <I.Send className="h-4 w-4" />
              {channel}
            </button>
          ))}
        </div>
      </div>

      <div className={cx("p-4", ui.card, ui.ring)}>
        <h3 className="font-semibold">Routing qərarı</h3>
        <div className="mt-4 space-y-3">
          <RouteStep label="BIN oxundu" value={matchedBin?.prefix ?? "manual"} done />
          <RouteStep label="Kart brand" value={matchedBin?.brand ?? "bilinmir"} done={!!matchedBin} />
          <RouteStep label="Qayda" value={matchedBin ? "BIN üstünlüyü" : "Fallback POS"} done />
          <RouteStep label="POS" value={suggestedPos.name} done />
          <RouteStep label="Komissiya" value={`${money(commissionAmount)} ₼`} done />
        </div>
      </div>
    </div>
  );
}

function PaymentsSection({
  rows,
  isDark,
  amount,
  setAmount,
  cardPrefix,
  setCardPrefix,
  installment,
  setInstallment,
  matchedBin,
  suggestedPos,
  commission,
  commissionAmount,
  payable,
}: {
  rows: CollectionRow[];
  isDark: boolean;
  amount: number;
  setAmount: (value: number) => void;
  cardPrefix: string;
  setCardPrefix: (value: string) => void;
  installment: number;
  setInstallment: (value: number) => void;
  matchedBin?: BinRule;
  suggestedPos: VirtualPos;
  commission?: CommissionRule;
  commissionAmount: number;
  payable: number;
}) {
  const ui = makeUI(isDark);
  const paidTotal = rows.filter((row) => row.status === "Ödəndi").reduce((sum, row) => sum + row.amount, 0);
  return (
    <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Bu gün ödənən" value={`${money(paidTotal)} ₼`} caption="POS + link" isDark={isDark} />
          <MetricCard label="Açıq linklər" value={String(rows.filter((row) => row.status === "Açıldı").length)} caption="Müştəri gözlənir" isDark={isDark} />
          <MetricCard label="Orta komissiya" value="%1.85" caption="Firma payı" isDark={isDark} />
          <MetricCard label="Uğurlu keçid" value="97.9%" caption="Son 30 gün" isDark={isDark} />
        </div>
        <div className={cx("min-h-0 flex-1 overflow-hidden", ui.card, ui.ring)}>
          <DataTable
            isDark={isDark}
            headers={["Ödəniş", "Müştəri", "Sənəd", "Kanal", "POS", "Status", "Məbləğ", "Tarix"]}
            rows={rows.map((row) => [
              row.id,
              row.customer,
              row.document,
              row.channel,
              row.pos,
              <StatusBadge key="status" status={row.status} />,
              `${money(row.amount)} ₼`,
              row.paidAt ?? row.created,
            ])}
          />
        </div>
      </div>
      <div className={cx("min-h-0 overflow-auto p-4", ui.card, ui.ring)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Sürətli ödəniş al</h3>
            <p className={cx("text-sm", ui.subtle)}>Kartı və məbləği yaz, sistem POS və taksiti təklif etsin.</p>
          </div>
          <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-600">AriX routing</span>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className={cx("mb-2 block text-sm font-semibold", ui.subtle)}>Məbləğ</span>
            <input type="number" value={amount} onChange={(event) => setAmount(Number(event.target.value) || 0)} className={cx(ui.input, "w-full text-right text-lg tabular-nums")} />
          </label>
          <label className="block">
            <span className={cx("mb-2 block text-sm font-semibold", ui.subtle)}>Kart BIN</span>
            <input value={cardPrefix} onChange={(event) => setCardPrefix(event.target.value)} placeholder="454360" className={cx(ui.input, "w-full tracking-widest")} />
          </label>
          <label className="block">
            <span className={cx("mb-2 block text-sm font-semibold", ui.subtle)}>Taksit</span>
            <select value={installment} onChange={(event) => setInstallment(Number(event.target.value))} className={cx(ui.input, "w-full")}>
              {suggestedPos.installments.map((item) => <option key={item} value={item}>{item === 1 ? "Tək çəkim" : `${item} taksit`}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-2">
          <MiniDecision label="Kart" value={matchedBin ? `${matchedBin.bank} · ${matchedBin.brand}` : "BIN tanınmadı"} />
          <MiniDecision label="POS" value={suggestedPos.name} />
          <MiniDecision label="Komissiya" value={`%${commission?.rate ?? 0} · ${money(commissionAmount)} ₼`} />
          <MiniDecision label="Müştəri ödəyəcək" value={`${money(payable)} ₼`} strong />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {["Link", "SMS", "E-mail", "QR"].map((channel) => (
            <button key={channel} type="button" className={cx("flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold", ui.border, isDark ? "hover:bg-white/10" : "hover:bg-white")}>
              <I.Send className="h-4 w-4" />
              {channel}
            </button>
          ))}
        </div>
        <button type="button" className="surface-primary mt-3 h-11 w-full rounded-xl text-sm font-semibold">
          Ödəniş linki yarat
        </button>
      </div>
    </div>
  );
}

function PosSection({ isDark }: { isDark: boolean }) {
  return (
    <DataShell isDark={isDark}>
      <DataTable
        isDark={isDark}
        headers={["POS", "Provayder", "Bank", "Status", "Prioritet", "Uğur", "Valyuta", "Taksitlər", "3D"]}
        rows={posList.map((pos) => [pos.name, pos.provider, pos.bank, <StatusBadge key="status" status={pos.status} />, pos.priority, `%${pos.successRate}`, pos.currency, pos.installments.join(", "), pos.secure3d])}
      />
    </DataShell>
  );
}

void PosSection;

const posProviderTabs = ["PARAM POS", "Banka POSları", "Tami", "PayNKolay", "AkÖde", "Iyzico", "Moka", "Sipay", "QNBPay"];
const posTerminalTabs = ["130403", "130404"];
const posCommissionRows = [
  { bank: "Axess", logoClass: "text-orange-600", rates: [3.29, 6.69, 8.5, 10.29, 12.02, 13.74, 15.45, 17.14, 19.03, 20.97, 22.86, 24.75, 0, 0, 0, 0, 0, 0] },
  { bank: "bonus", logoClass: "text-emerald-600", rates: [3.29, 6.5, 8.35, 10.2, 12.05, 13.9, 15.8, 17.64, 19.49, 21.39, 23.23, 25.08, 0, 0, 0, 0, 0, 0] },
  { bank: "QNB", logoClass: "text-indigo-700", rates: [3.29, 5.77, 7.66, 9.54, 11.42, 13.31, 15.25, 17.14, 19.03, 20.97, 22.86, 24.75, 0, 0, 0, 0, 0, 0] },
  { bank: "bankKart", logoClass: "text-rose-600", rates: [3.29, 5.71, 7.56, 9.44, 11.3, 13.22, 15.09, 17.01, 18.83, 20.39, 22.41, 24.43, 0, 0, 0, 0, 0, 0] },
  { bank: "maximum", logoClass: "text-fuchsia-600", rates: [3.29, 5.77, 7.66, 9.54, 11.42, 13.31, 15.25, 17.14, 19.03, 20.97, 22.86, 24.75, 0, 0, 0, 0, 0, 0] },
  { bank: "Paraf", logoClass: "text-sky-500", rates: [3.29, 5.79, 7.6, 9.37, 11.12, 12.83, 14.54, 16.17, 17.78, 19.39, 20.92, 22.41, 0, 0, 0, 0, 0, 0] },
  { bank: "KuveytTürk", logoClass: "text-emerald-700", rates: [3.29, 6.99, 8.78, 10.53, 12.25, 13.94, 15.63, 17.25, 18.83, 20.42, 21.94, 23.41, 0, 0, 0, 0, 0, 0] },
  { bank: "WORLD", logoClass: "text-purple-700", rates: [3.29, 5.77, 7.66, 9.54, 11.42, 13.31, 15.25, 17.14, 19.03, 20.97, 22.86, 24.75, 0, 0, 0, 0, 0, 0] },
  { bank: "Troy / AMEX", logoClass: "text-blue-700", rates: [3.29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
];

const posLogoClasses: Record<string, string> = {
  Axess: "text-orange-600",
  bonus: "text-emerald-600",
  QNB: "text-indigo-700",
  bankKart: "text-rose-600",
  maximum: "text-fuchsia-600",
  Paraf: "text-sky-500",
  KuveytTürk: "text-emerald-700",
  WORLD: "text-purple-700",
  "Troy / AMEX": "text-blue-700",
};

function PosSectionModern({
  isDark,
  cardPrefix,
  setCardPrefix,
  matchedBin,
  suggestedPos,
}: {
  isDark: boolean;
  cardPrefix: string;
  setCardPrefix: (value: string) => void;
  matchedBin?: BinRule;
  suggestedPos: VirtualPos;
}) {
  const ui = makeUI(isDark);
  return (
    <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="grid gap-3 lg:grid-cols-4">
          {posList.map((pos) => (
            <div key={pos.id} className={cx("rounded-2xl border p-4", ui.border, isDark ? "bg-white/5" : "bg-white/75")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{pos.name}</div>
                  <div className={cx("mt-1 text-xs", ui.subtle)}>{pos.provider} · {pos.bank}</div>
                </div>
                <StatusBadge status={pos.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <MiniDecision label="Uğur" value={`%${pos.successRate}`} />
                <MiniDecision label="Prioritet" value={String(pos.priority)} />
                <MiniDecision label="Valyuta" value={pos.currency} />
                <MiniDecision label="3D" value={pos.secure3d} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {pos.installments.map((item) => (
                  <span key={item} className={cx("rounded-full px-2 py-1 text-xs font-semibold", isDark ? "bg-white/10 text-slate-200" : "bg-indigo-50 text-indigo-700")}>
                    {item === 1 ? "Tək" : `${item}x`}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={cx("min-h-0 flex-1 overflow-auto rounded-2xl border p-4", ui.border, isDark ? "bg-white/5" : "bg-white/75")}>
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Routing qaydaları</h3>
              <p className={cx("text-sm", ui.subtle)}>Kart BIN, valyuta, taksit və komissiyaya görə ən uyğun POS seçilir.</p>
            </div>
            <button type="button" className="surface-primary h-10 rounded-xl px-4 text-sm font-semibold">POS əlavə et</button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {[
              ["BIN üstünlüyü", "Kartın ilk 6-8 rəqəmi tanınırsa həmin banka uyğun POS seçilir."],
              ["Komissiya optimizasiyası", "Eyni taksit dəstəyi varsa daha aşağı komissiyalı POS önə keçir."],
              ["Fallback", "POS passivdirsə və ya limit uyğun deyilsə növbəti aktiv POS seçilir."],
              ["3D Secure", "Riskli kart və böyük məbləğlərdə 3D məcburi saxlanır."],
            ].map(([title, text]) => (
              <div key={title} className={cx("rounded-xl border p-3", ui.border, isDark ? "bg-slate-950/20" : "bg-slate-50")}>
                <div className="font-semibold">{title}</div>
                <p className={cx("mt-1 text-sm", ui.subtle)}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={cx("min-h-0 overflow-auto p-4", ui.card, ui.ring)}>
        <h3 className="text-lg font-semibold">BIN test</h3>
        <p className={cx("mt-1 text-sm", ui.subtle)}>Kart yazıldıqda sistem hansı POS-a gedəcəyini göstərir.</p>
        <label className="mt-4 block">
          <span className={cx("mb-2 block text-sm font-semibold", ui.subtle)}>Kart BIN</span>
          <input value={cardPrefix} onChange={(event) => setCardPrefix(event.target.value)} className={cx(ui.input, "w-full tracking-widest")} />
        </label>
        <div className="mt-4 space-y-2">
          <MiniDecision label="Bank" value={matchedBin?.bank ?? "Tanınmadı"} />
          <MiniDecision label="Kart" value={matchedBin ? `${matchedBin.brand} · ${matchedBin.cardType}` : "Manual seçim"} />
          <MiniDecision label="Ölkə" value={matchedBin?.country ?? "-"} />
          <MiniDecision label="Seçilən POS" value={suggestedPos.name} strong />
        </div>
        <div className={cx("mt-4 rounded-2xl border p-3", ui.border, ui.soft)}>
          <div className="text-sm font-semibold">Bu bölməyə köçürülənlər</div>
          <div className={cx("mt-2 space-y-1 text-sm", ui.subtle)}>
            <div>Param POS məlumatları</div>
            <div>Ödəniş AI / routing qaydaları</div>
            <div>BIN filtrləri və BIN cədvəli</div>
            <div>Bayi POS üstünlükləri</div>
          </div>
        </div>
      </div>
    </div>
  );
  const [provider, setProvider] = useState(posProviderTabs[0]);
  const [terminal, setTerminal] = useState(posTerminalTabs[0]);
  const [posData, setPosData] = useState({
    providers: posProviderTabs,
    terminals: posTerminalTabs,
    commissions: posCommissionRows,
  });

  useEffect(() => {
    let cancelled = false;
    requestJson<{ data?: { providers?: string[]; terminals?: string[]; commissions?: Array<{ bank: string; rates: number[] }> } }>("/api/online-collections/pos")
      .then((payload) => {
        if (cancelled) return;
        const data = payload.data ?? {};
        const providers = Array.isArray(data.providers) && data.providers.length > 0 ? data.providers : posProviderTabs;
        const terminals = Array.isArray(data.terminals) && data.terminals.length > 0 ? data.terminals : posTerminalTabs;
        const commissions = Array.isArray(data.commissions) && data.commissions.length > 0
          ? data.commissions.map((row: { bank: string; rates: number[] }) => ({
              ...row,
              logoClass: posLogoClasses[row.bank] ?? "text-slate-700",
            }))
          : posCommissionRows;
        setPosData({ providers, terminals, commissions });
        setProvider((current) => providers.includes(current) ? current : providers[0]);
        setTerminal((current) => terminals.includes(current) ? current : terminals[0]);
      })
      .catch(() => {
        if (!cancelled) setPosData({ providers: posProviderTabs, terminals: posTerminalTabs, commissions: posCommissionRows });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={cx("min-h-0 flex-1 overflow-hidden", ui.card, ui.ring)}>
      <div className={cx("flex h-full min-h-0 flex-col", isDark ? "bg-slate-950/20" : "bg-slate-50/45")}>
        <div className={cx("border-b px-4 pt-4", ui.border)}>
          <div className="flex flex-wrap gap-5">
            {posData.providers.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setProvider(tab)}
                className={cx(
                  "relative h-11 px-1 text-sm font-semibold transition",
                  provider === tab ? "text-orange-600" : isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {tab === "PARAM POS" ? (
                  <span className="inline-flex items-center gap-1 text-[11px] tracking-[0.22em]">
                    PARAM<span className="rounded bg-teal-500 px-1 py-0.5 text-[8px] font-bold tracking-normal text-white">POS</span>
                  </span>
                ) : tab}
                {provider === tab && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-orange-500" />}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className={cx("min-w-[1500px] overflow-hidden rounded-2xl border", isDark ? "border-white/10 bg-slate-900/55" : "border-slate-200 bg-white")}>
            <div className={cx("flex border-b", isDark ? "border-white/10" : "border-slate-200")}>
              {posData.terminals.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTerminal(tab)}
                  className={cx(
                    "relative h-14 px-6 text-sm font-semibold transition",
                    terminal === tab ? "text-orange-600" : isDark ? "text-slate-400 hover:text-slate-100" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {tab}
                  {terminal === tab && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-orange-500" />}
                </button>
              ))}
            </div>

            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className={isDark ? "bg-slate-950/50 text-slate-300" : "bg-white text-slate-900"}>
                  <th className="w-20 px-4 py-4 text-left font-bold"></th>
                  <th className="w-44 px-4 py-4 text-left font-bold">BANKA ADI</th>
                  <th className="w-36 px-4 py-4 text-left font-bold">AÇIQLAMA</th>
                  {Array.from({ length: 18 }, (_, index) => (
                    <th key={index + 1} className="px-4 py-4 text-center font-bold">{index + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={isDark ? "bg-teal-950/20" : "bg-teal-50/55"}>
                {posData.commissions.map((row) => (
                  <tr key={row.bank} className={cx("transition", isDark ? "hover:bg-white/5" : "hover:bg-white/70")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button type="button" className="text-slate-500 transition hover:text-orange-600" title="Düzəliş et">
                          <span className="text-base">✎</span>
                        </button>
                        <button
                          type="button"
                          className={cx("flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold", isDark ? "border-teal-400/30 text-teal-200" : "border-teal-100 bg-white text-teal-600")}
                          title="Komissiya"
                        >
                          %
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cx("text-base font-black tracking-tight", row.logoClass)}>{row.bank}</span>
                    </td>
                    <td className={cx("px-4 py-3", isDark ? "text-slate-400" : "text-slate-500")}></td>
                    {row.rates.map((rate, index) => (
                      <td key={`${row.bank}-${index}`} className={cx("px-4 py-3 text-center font-semibold", isDark ? "text-slate-300" : "text-slate-600")}>
                        % {rate.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={cx("flex items-center justify-end gap-3 border-t px-5 py-5 text-sm", isDark ? "border-white/10 text-slate-400" : "border-slate-100 text-slate-500")}>
              <span>1 - 9 (Toplam 9 Kayıt)</span>
              <button type="button" className="text-slate-300">‹</button>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-teal-400 text-teal-600">1</span>
              <button type="button" className="text-slate-400">›</button>
              <button type="button" className={cx("rounded-full border px-3 py-1", isDark ? "border-white/10" : "border-slate-200")}>10 / sayfa⌄</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollectionSettingsHub({ isDark }: { isDark: boolean }) {
  const ui = makeUI(isDark);
  const cards = [
    { title: "Ödəniş səhifələri", value: "3 aktiv", text: "Logo, dil, tema, 3D Secure və müştəriyə görünən sahələr." },
    { title: "Bildirişlər", value: "SMS + e-mail", text: "Link göndərildi, açıldı, ödəndi, uğursuz oldu axınları." },
    { title: "Müqavilələr", value: "2 provayder", text: "PaynKolay, Param və bank POS müqavilə məlumatları." },
    { title: "Webhook və GİB", value: "Canlı", text: "Ödəniş statusu ERP sənədlərinə və pul fəaliyyətinə düşür." },
    { title: "Kart ayarları", value: "BIN + 3D", text: "Kart saxlanması, token, risk limiti və 3D məcburiyyəti." },
    { title: "Dinamik sahələr", value: "5 sahə", text: "Ödəniş formunda VÖEN, sənəd no, bayi kodu kimi sahələr." },
  ];
  return (
    <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className={cx("min-h-0 overflow-auto p-4", ui.card, ui.ring)}>
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Onlayn ödəniş parametrləri</h3>
            <p className={cx("text-sm", ui.subtle)}>Əvvəl sidebar-da dağınıq olan ayarlar burada yığcam idarə olunur.</p>
          </div>
          <button type="button" className="surface-primary h-10 rounded-xl px-4 text-sm font-semibold">Yeni qayda</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <div key={card.title} className={cx("rounded-2xl border p-4", ui.border, isDark ? "bg-white/5" : "bg-slate-50/80")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{card.title}</div>
                  <p className={cx("mt-1 text-sm", ui.subtle)}>{card.text}</p>
                </div>
                <span className="shrink-0 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-600">{card.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={cx("min-h-0 overflow-auto p-4", ui.card, ui.ring)}>
        <h3 className="text-lg font-semibold">Ödəniş axını</h3>
        <div className="mt-4 space-y-3">
          <RouteStep label="Link yaradılır" value="Satış sənədi və ya manual məbləğdən" done />
          <RouteStep label="Müştəri kartı yazır" value="BIN oxunur, POS seçilir" done />
          <RouteStep label="Taksit və komissiya" value="Firma/müştəri payı hesablanır" done />
          <RouteStep label="Ödəniş təsdiqlənir" value="Pul fəaliyyəti və sənədə bağlanır" done />
          <RouteStep label="Üzləşdirmə" value="Provayder hesabatı ilə ERP tutuşdurulur" done />
        </div>
      </div>
    </div>
  );
}

function CommissionsSection({ isDark }: { isDark: boolean }) {
  return (
    <DataShell isDark={isDark}>
      <DataTable
        isDark={isDark}
        headers={["Provayder", "Kart", "Taksit", "Faiz", "Sabit", "Ödəyən"]}
        rows={commissionRules.map((rule) => [rule.provider, rule.brand, rule.installment === 1 ? "Tek çekim" : `${rule.installment} taksit`, `%${rule.rate}`, `${money(rule.fixed)} ₼`, rule.payer])}
      />
    </DataShell>
  );
}

function RoutingSection({ isDark, cardPrefix, setCardPrefix, matchedBin, suggestedPos }: { isDark: boolean; cardPrefix: string; setCardPrefix: (value: string) => void; matchedBin?: BinRule; suggestedPos: VirtualPos }) {
  const ui = makeUI(isDark);
  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className={cx("p-4", ui.card, ui.ring)}>
        <label>
          <span className={cx("mb-2 block text-sm font-semibold", ui.subtle)}>Kart BIN testi</span>
          <input value={cardPrefix} onChange={(event) => setCardPrefix(event.target.value)} className={cx(ui.input, "w-full tracking-widest")} />
        </label>
        <div className="mt-4 space-y-3">
          <InfoCard title="Bank" value={matchedBin?.bank ?? "Tanınmadı"} caption={matchedBin?.brand ?? "Manual seçim"} tone="indigo" isDark={isDark} />
          <InfoCard title="Uyğun POS" value={suggestedPos.name} caption={`${suggestedPos.provider} · prioritet ${suggestedPos.priority}`} tone="emerald" isDark={isDark} />
          <InfoCard title="Fallback" value="Aktiv POS + ən az komissiya" caption="BIN tapılmadıqda işləyir" tone="sky" isDark={isDark} />
        </div>
      </div>
      <DataShell isDark={isDark}>
        <DataTable
          isDark={isDark}
          headers={["Sıra", "Şərt", "Qərar", "Aktiv"]}
          rows={[
            ["1", "BIN qaydası varsa", "preferredPos seç", <I.Check key="c" className="h-4 w-4 text-emerald-600" />],
            ["2", "POS passivdirsə", "növbəti aktiv POS", <I.Check key="c" className="h-4 w-4 text-emerald-600" />],
            ["3", "Taksit dəstəyi yoxdursa", "alternativ POS", <I.Check key="c" className="h-4 w-4 text-emerald-600" />],
            ["4", "Komissiya fərqi > 1.5%", "ən ucuz POS-a yönləndir", <I.Check key="c" className="h-4 w-4 text-emerald-600" />],
          ]}
        />
      </DataShell>
    </div>
  );
}

function BinSection({ isDark }: { isDark: boolean }) {
  return (
    <DataShell isDark={isDark}>
      <DataTable
        isDark={isDark}
        headers={["BIN", "Bank", "Brand", "Tip", "Ölkə", "Preferred POS"]}
        rows={binRules.map((rule) => [rule.prefix, rule.bank, rule.brand, rule.cardType, rule.country, posList.find((pos) => pos.id === rule.preferredPos)?.name ?? rule.preferredPos])}
      />
    </DataShell>
  );
}

function PagesSection({ isDark }: { isDark: boolean }) {
  return (
    <DataShell isDark={isDark}>
      <DataTable
        isDark={isDark}
        headers={["Səhifə", "Dil", "3D Secure", "Logo", "Tema", "Status"]}
        rows={[
          ["Standart tahsilat", "AZ/TR/EN", "Məcburi", "AriX", "Açıq", <StatusBadge key="s" status="Aktiv" />],
          ["Bayi tahsilatı", "TR", "Məcburi", "Bayi logo", "Açıq", <StatusBadge key="s" status="Aktiv" />],
          ["Üyeliksiz ödeme", "TR/EN", "Opsional", "AriX", "Minimal", <StatusBadge key="s" status="Test" />],
        ]}
      />
    </DataShell>
  );
}

void RoutingSection;
void BinSection;
void PagesSection;

function ReconciliationSection({ isDark }: { isDark: boolean }) {
  return (
    <DataShell isDark={isDark}>
      <DataTable
        isDark={isDark}
        headers={["Tarix", "Provayder", "ERP", "Banka", "Fərq", "Status"]}
        rows={[
          ["21 may", "PaynKolay", "6,123.04 ₼", "6,123.04 ₼", "0.00 ₼", <StatusBadge key="s" status="Uyğun" />],
          ["20 may", "Param", "2,377.08 ₼", "2,371.20 ₼", "-5.88 ₼", <StatusBadge key="s" status="Fərq var" />],
          ["18 may", "Ziraat", "1,363.20 ₼", "0.00 ₼", "-1,363.20 ₼", <StatusBadge key="s" status="Gözləyir" />],
        ]}
      />
    </DataShell>
  );
}

function LogsSection({ isDark }: { isDark: boolean }) {
  return (
    <DataShell isDark={isDark}>
      <DataTable
        isDark={isDark}
        headers={["Saat", "Provayder", "Event", "Tahsilat", "HTTP", "Mesaj"]}
        rows={[
          ["09:18:22", "PaynKolay", "payment.succeeded", "THS-1029", "200", "ERP tahsilatı yaradıldı"],
          ["17:41:03", "Param", "link.opened", "THS-1028", "200", "Müştəri ödeme səhifəsini açdı"],
          ["16:03:44", "Ziraat", "payment.failed", "THS-1026", "422", "3D doğrulama uğursuz"],
        ]}
      />
    </DataShell>
  );
}

void LogsSection;

function DataShell({ isDark, children }: { isDark: boolean; children: React.ReactNode }) {
  const ui = makeUI(isDark);
  return <div className={cx("min-h-0 flex-1 overflow-hidden", ui.card, ui.ring)}>{children}</div>;
}

function DataTable({ headers, rows, isDark }: { headers: string[]; rows: Array<Array<React.ReactNode>>; isDark: boolean }) {
  const ui = makeUI(isDark);
  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
        <thead className={isDark ? "bg-slate-950/35 text-slate-400" : "bg-white/45 text-slate-500"}>
          <tr>
            {headers.map((header) => <th key={header} className={cx("border-b px-4 py-3 text-left text-xs font-semibold", ui.border)}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className={isDark ? "hover:bg-white/5" : "hover:bg-slate-50"}>
              {row.map((cell, cellIndex) => <td key={cellIndex} className={cx("border-b px-4 py-3", ui.border)}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  const ui = makeUI(isDark);
  return (
    <label className="block">
      <span className={cx("mb-2 block text-sm font-semibold", ui.subtle)}>{label}</span>
      <div className={cx("flex h-11 items-center rounded-xl border px-3 font-medium", ui.border, ui.soft)}>{value}</div>
    </label>
  );
}

function InfoCard({ title, value, caption, tone, isDark }: { title: string; value: string; caption: string; tone: "indigo" | "emerald" | "sky"; isDark: boolean }) {
  const toneClass = tone === "emerald" ? "text-emerald-600 bg-emerald-500/12" : tone === "sky" ? "text-sky-600 bg-sky-500/12" : "text-indigo-600 bg-indigo-500/12";
  return (
    <div className={cx("rounded-2xl border p-4", isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>
      <div className={cx("mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl", toneClass)}><I.Bolt className="h-5 w-5" /></div>
      <div className="font-semibold">{value}</div>
      <div className={cx("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{title} · {caption}</div>
    </div>
  );
}

function MetricCard({ label, value, caption, isDark }: { label: string; value: string; caption: string; isDark: boolean }) {
  return (
    <div className={cx("rounded-2xl border p-4", isDark ? "border-white/10 bg-white/5" : "border-white/60 bg-white/80")}>
      <div className={cx("text-xs font-semibold", isDark ? "text-slate-400" : "text-slate-500")}>{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className={cx("mt-1 text-xs", isDark ? "text-slate-500" : "text-slate-500")}>{caption}</div>
    </div>
  );
}

function MiniDecision({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
      <span className="min-w-0 text-slate-500">{label}</span>
      <span className={cx("truncate text-right tabular-nums", strong ? "font-semibold text-indigo-700" : "font-semibold text-slate-900")}>{value}</span>
    </div>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-white/70 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cx("mt-1 tabular-nums", strong ? "text-xl font-semibold text-indigo-700" : "font-semibold")}>{value}</div>
    </div>
  );
}

function RouteStep({ label, value, done }: { label: string; value: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cx("flex h-8 w-8 items-center justify-center rounded-full", done ? "bg-emerald-500/12 text-emerald-600" : "bg-slate-100 text-slate-400")}>
        <I.Check className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-slate-500">{value}</span>
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    ["Ödəndi", "Aktiv", "Uyğun"].includes(status)
      ? "bg-emerald-500/12 text-emerald-700"
      : ["Uğursuz", "Vaxtı keçdi", "Passiv", "Fərq var"].includes(status)
        ? "bg-rose-500/12 text-rose-700"
        : ["Test", "Gözləyir", "Açıldı"].includes(status)
          ? "bg-amber-500/12 text-amber-700"
          : "bg-indigo-500/12 text-indigo-700";
  return <span className={cx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", cls)}>{status}</span>;
}
