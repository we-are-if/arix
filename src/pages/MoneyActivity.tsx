import { useEffect, useMemo, useState, type Dispatch, type SetStateAction, type SVGProps } from "react";
import { requestJson } from "../api";
import BankStatementImportDialog from "../components/BankStatementImportDialog";
import { formatAppDate, useI18n, type AppLanguage, type Translate } from "../i18n";

const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");

type MoneyKind = "income" | "expense" | "transfer" | "refund";
type MoneyStatus = "approved" | "preparing" | "cancelled";
type FilterKey = "date" | "status" | "kind" | "account" | "counterparty" | "author" | "method" | "category";
type MoneyFilters = Record<FilterKey, string>;
type MoneyRow = {
  id: number;
  date: string;
  time: string;
  kind: MoneyKind;
  status: MoneyStatus;
  document: string;
  account: string;
  counterparty: string;
  category: string;
  method: string;
  amount: number;
  author: string;
  comment: string;
  linkedDocument: string;
  relationshipType?: "debtPayment" | "landedCost";
  costAllocations?: LandedCostAllocation[];
};
type LinkedDoc = {
  id: number;
  title: string;
  type: string;
  amount: number;
  status: string;
};
type LandedCostAllocation = {
  id?: string;
  category?: string;
  amount?: number;
  containerNumber?: string;
  baseQty?: number;
  unitCost?: number;
  formula?: string;
  appliesFrom?: string;
};
type ApiDocument = {
  id?: string | number;
  type?: string;
  status?: string;
  posted?: boolean;
  documentDate?: string;
  createdAt?: string;
  account?: string;
  fromAccount?: string;
  toAccount?: string;
  counterpartyName?: string;
  category?: string;
  method?: string;
  author?: string;
  comment?: string;
  amount?: number;
  total?: number;
  linkedDocument?: string;
  relationshipType?: "debtPayment" | "landedCost";
  costAllocations?: LandedCostAllocation[];
};
type ExternalPayment = {
  id: string;
  providerName: string;
  externalId: string;
  amount: number;
  currency: string;
  paidAt: string;
  rawCustomerName?: string;
  processingStatus: "unmatched" | "matched" | "posted";
  counterpartyId?: string | number | null;
  counterpartyName?: string;
};
type ExternalPaymentOverview = { total: number; posted: number; unmatched: number; pending: number };
type BankTransaction = {
  id: string;
  financialAccountName: string;
  direction: "in" | "out";
  amount: number;
  currency: string;
  bookedAt: string;
  counterpartyName: string;
  counterpartyIban: string;
  description: string;
  status: "unmatched" | "matched" | "settlement_matched" | "ignored";
  matchedDocumentTitle?: string;
  suggestions?: Array<{ documentId: string; documentType: string; title: string; counterpartyName: string; amount: number; documentDate: string; confidence: string; score: number; reason: string }>;
};
type PaymentSettlement = { id: string; providerName: string; batchReference: string; netAmount: number; currency: string; expectedSettlementAt: string; financialAccountName: string; status: "expected" | "account_unmatched" | "settled" };
type ReconciliationOverview = { accounts: number; bankTransactions: number; bankUnmatched: number; settlementsExpected: number; settlementsAccountUnmatched: number; settlementsCompleted: number };
type BankImportBatch = { id: string; sourceName: string; sourceType: string; financialAccountName: string; rowCount: number; createdCount: number; duplicateCount: number; matchedCount: number; unmatchedCount: number; createdAt: string };

const makeUI = (isDark: boolean) => ({
  card: `rounded-2xl border ${isDark ? "glass-panel-dark" : "glass-panel"}`,
  ring: isDark ? "ring-1 ring-white/10" : "ring-1 ring-white/55",
  input: [
    "w-full h-10 px-3 rounded-xl border outline-none placeholder-slate-400",
    isDark
      ? "glass-control-dark text-slate-100 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
      : "glass-control text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25",
  ].join(" "),
  iconBtn: `w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "hover:bg-white/10" : "hover:bg-white/65"}`,
  borderSoft: isDark ? "border-white/10" : "border-white/60",
  theadSticky: `sticky top-0 z-10 ${isDark ? "bg-slate-950/35" : "bg-white/45"} backdrop-blur-xl`,
  rowHover: isDark ? "hover:bg-white/5" : "hover:bg-slate-50",
  subtle: isDark ? "text-slate-400" : "text-slate-500",
});

const I = {
  Search: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
    </svg>
  ),
  Filter: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 5h18" /><path d="M7 12h10" /><path d="M10 19h4" />
    </svg>
  ),
  X: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  Check: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12.5 10 17l9-10" />
    </svg>
  ),
  Download: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M21 21H3" />
    </svg>
  ),
  Wallet: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><path d="M16 13h5" />
    </svg>
  ),
  Edit: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  ),
  Printer: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" />
    </svg>
  ),
  Calendar: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M8 2v4M16 2v4" /><path d="M3 9h18" /><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" />
    </svg>
  ),
  Tag: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 13l-7 7-9-9V4h7l9 9z" /><circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  ),
  External: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 17 17 7" /><path d="M9 7h8v8" />
    </svg>
  ),
};

const rows: MoneyRow[] = [
  { id: 2599, date: "20 may", time: "16:42", kind: "income", status: "approved", document: "Mədaxil #2599", account: "ERSA DEPO kassası", counterparty: "ABANOZ", category: "Satış ödənişi", method: "Nağd", amount: 6123.04, author: "Arif Mahmud", comment: "Satış sifarişi bağlandı", linkedDocument: "Satış sifarişi #2332" },
  { id: 2598, date: "20 may", time: "15:10", kind: "expense", status: "approved", document: "Məxaric #2598", account: "Bank hesabı", counterparty: "SHANGHAI XIAOU INDUSTRY CO., LTD", category: "Təchizatçı ödənişi", method: "Bank", amount: -94448.5, author: "Arif Mahmud", comment: "Alış borcu üzrə ödəniş", linkedDocument: "Alış sənədi #1847" },
  { id: 2597, date: "19 may", time: "18:24", kind: "transfer", status: "approved", document: "Transfer #2597", account: "ERSA DEPO kassası", counterparty: "Bank hesabı", category: "Hesablar arası transfer", method: "Daxili", amount: 12000, author: "Ekrem Tiryaki", comment: "Kassadan banka köçürmə", linkedDocument: "Kassa orderi #602" },
  { id: 2596, date: "19 may", time: "12:05", kind: "income", status: "preparing", document: "Mədaxil #2596", account: "ERSA ANTREPO kassası", counterparty: "Global Design", category: "Avans", method: "Nağd", amount: 2377.08, author: "Arif Mahmud", comment: "Müştəri avansı", linkedDocument: "Satış sifarişi #2348" },
  { id: 2595, date: "18 may", time: "17:38", kind: "refund", status: "approved", document: "Qaytarma ödənişi #2595", account: "Bank hesabı", counterparty: "DURU PVC ORMAN ÜRÜNLERİ", category: "Qaytarma", method: "Bank", amount: -1363.2, author: "Sami", comment: "Qaytarılan sənəd üzrə", linkedDocument: "Qaytarma #117" },
  { id: 2594, date: "18 may", time: "10:16", kind: "expense", status: "cancelled", document: "Məxaric #2594", account: "Bank hesabı", counterparty: "ORCHARD DECORATIVE MATERIALS", category: "Təchizatçı ödənişi", method: "Bank", amount: -103017.6, author: "Arif Mahmud", comment: "Ləğv edilmiş ödəniş", linkedDocument: "Alış sənədi #1812" },
  { id: 2593, date: "15 may", time: "16:54", kind: "income", status: "approved", document: "Mədaxil #2593", account: "ERSA DEPO kassası", counterparty: "AKÇA KAPAK", category: "Satış ödənişi", method: "Kart", amount: 852, author: "Arif Mahmud", comment: "POS ödənişi", linkedDocument: "Satış sifarişi #2355" },
];

const emptyFilters: MoneyFilters = {
  date: "",
  status: "",
  kind: "",
  account: "",
  counterparty: "",
  author: "",
  method: "",
  category: "",
};

const filterLabel = (key: FilterKey, t: Translate) => t(`money.filter.${key}`);

const optionSets: Record<Exclude<FilterKey, "date">, Array<{ label: string; value: string; color?: string }>> = {
  status: [
    { label: "Təsdiqlənib", value: "approved" },
    { label: "Hazırlanır", value: "preparing" },
    { label: "Ləğv edilib", value: "cancelled" },
  ],
  kind: [
    { label: "Mədaxil", value: "income", color: "bg-emerald-500" },
    { label: "Məxaric", value: "expense", color: "bg-rose-500" },
    { label: "Transfer", value: "transfer", color: "bg-sky-500" },
    { label: "Qaytarma", value: "refund", color: "bg-amber-500" },
  ],
  account: ["ERSA DEPO kassası", "ERSA ANTREPO kassası", "Bank hesabı"].map((value) => ({ label: value, value })),
  counterparty: ["ABANOZ", "Global Design", "AKÇA KAPAK", "DURU PVC ORMAN ÜRÜNLERİ", "SHANGHAI XIAOU INDUSTRY CO., LTD", "ORCHARD DECORATIVE MATERIALS"].map((value) => ({ label: value, value })),
  author: ["Arif Mahmud", "Ekrem Tiryaki", "Sami"].map((value) => ({ label: value, value })),
  method: ["Nağd", "Bank", "Kart", "Daxili"].map((value) => ({ label: value, value })),
  category: ["Satış ödənişi", "Təchizatçı ödənişi", "Hesablar arası transfer", "Avans", "Qaytarma"].map((value) => ({ label: value, value })),
};

const linkedDocs: Record<number, LinkedDoc[]> = {
  2599: [{ id: 2332, title: "Satış sifarişi #2332", type: "Satış", amount: 6123.04, status: "Sənəd keçirilib" }],
  2598: [{ id: 1847, title: "Alış sənədi #1847", type: "Alış", amount: 94448.5, status: "Borcdan silindi" }],
  2597: [{ id: 602, title: "Kassa orderi #602", type: "Transfer", amount: 12000, status: "Tamamlandı" }],
};

void rows;
void linkedDocs;

const money = (value: number, locale = "az-Latn-AZ") =>
  value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const kindLabel = (kind: MoneyKind, t: Translate) => t(`money.${kind}`);
const statusLabel = (status: MoneyStatus, t: Translate) => t(`money.status.${status}`);

const kindTone = (kind: MoneyKind) =>
  kind === "income" ? "text-emerald-600 bg-emerald-500/12" : kind === "expense" ? "text-rose-600 bg-rose-500/12" : kind === "transfer" ? "text-sky-600 bg-sky-500/12" : "text-amber-600 bg-amber-500/12";

const moneyKindFromDocument = (type = ""): MoneyKind | null => {
  if (type === "cashIn") return "income";
  if (type === "cashOut") return "expense";
  if (type === "cashTransfer") return "transfer";
  return null;
};

const moneyRowIdFromDocument = (document: ApiDocument, index: number) => {
  const digits = String(document.id ?? "").replace(/\D/g, "");
  return Number(digits.slice(-8)) || index + 1;
};

const moneyDateParts = (createdAt: string | undefined, language: AppLanguage) => {
  const value = createdAt ? new Date(createdAt) : new Date();
  const safe = Number.isNaN(value.getTime()) ? new Date() : value;
  return {
    date: formatAppDate(safe, language),
    time: `${String(safe.getHours()).padStart(2, "0")}:${String(safe.getMinutes()).padStart(2, "0")}`,
  };
};

const moneyStatusFromDocument = (document: ApiDocument): MoneyStatus => {
  if (document.status === "cancelled") return "cancelled";
  if (document.status === "draft" || document.posted === false) return "preparing";
  return "approved";
};

const mapDocumentToMoneyRow = (document: ApiDocument, index: number, language: AppLanguage, t: Translate): MoneyRow | null => {
  const kind = moneyKindFromDocument(document.type);
  if (!kind) return null;
  const id = moneyRowIdFromDocument(document, index);
  const { date, time } = moneyDateParts(document.documentDate ?? document.createdAt, language);
  const amountBase = Number(document.amount ?? document.total ?? 0);
  const signedAmount = kind === "expense" ? -Math.abs(amountBase) : Math.abs(amountBase);
  return {
    id,
    date,
    time,
    kind,
    status: moneyStatusFromDocument(document),
    document: `${kindLabel(kind, t)} #${id}`,
    account: kind === "transfer" ? document.fromAccount ?? document.account ?? "" : document.account ?? "",
    counterparty: kind === "transfer" ? document.toAccount ?? "" : document.counterpartyName ?? "",
    category: document.category ?? "",
    method: document.method ?? "",
    amount: signedAmount,
    author: document.author ?? "Arif Mahmud",
    comment: document.comment ?? "",
    linkedDocument: document.linkedDocument ?? "",
    relationshipType: document.relationshipType ?? (document.costAllocations?.length ? "landedCost" : undefined),
    costAllocations: document.costAllocations,
  };
};

export default function MoneyActivity({ isDark = false }: { isDark?: boolean }) {
  const { language, locale, t } = useI18n();
  const ui = makeUI(isDark);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<MoneyFilters>(emptyFilters);
  const [visibleFilters, setVisibleFilters] = useState<FilterKey[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [selectedRow, setSelectedRow] = useState<MoneyRow | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<LinkedDoc | null>(null);
  const [moneyRows, setMoneyRows] = useState<MoneyRow[]>([]);
  const [rowDocuments, setRowDocuments] = useState<Record<number, LinkedDoc[]>>({});
  const [externalPayments, setExternalPayments] = useState<ExternalPayment[]>([]);
  const [externalOverview, setExternalOverview] = useState<ExternalPaymentOverview>({ total: 0, posted: 0, unmatched: 0, pending: 0 });
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [settlements, setSettlements] = useState<PaymentSettlement[]>([]);
  const [reconciliationOverview, setReconciliationOverview] = useState<ReconciliationOverview>({ accounts: 0, bankTransactions: 0, bankUnmatched: 0, settlementsExpected: 0, settlementsAccountUnmatched: 0, settlementsCompleted: 0 });
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    let cancelled = false;
    const loadMoneyActivity = async () => {
      const [payload, externalPayload, bankPayload, settlementPayload] = await Promise.all([
        requestJson<{ data: ApiDocument[] }>("/api/documents"),
        requestJson<{ data: ExternalPayment[]; overview?: ExternalPaymentOverview }>("/api/payment-integrations/payments"),
        requestJson<{ data: BankTransaction[]; overview?: ReconciliationOverview }>("/api/payment-integrations/bank-transactions"),
        requestJson<{ data: PaymentSettlement[]; overview?: ReconciliationOverview }>("/api/payment-integrations/settlements"),
      ]);
      if (cancelled || !Array.isArray(payload.data)) return;
      const nextRows: MoneyRow[] = [];
      const nextDocs: Record<number, LinkedDoc[]> = {};
      payload.data.forEach((document, index) => {
        const row = mapDocumentToMoneyRow(document, index, language, t);
        if (!row) return;
        nextRows.push(row);
        if (row.linkedDocument) {
          nextDocs[row.id] = [{ id: row.id, title: row.linkedDocument, type: kindLabel(row.kind, t), amount: Math.abs(row.amount), status: statusLabel(row.status, t) }];
        }
      });
      setMoneyRows(nextRows);
      setRowDocuments(nextDocs);
      setExternalPayments(Array.isArray(externalPayload.data) ? externalPayload.data : []);
      setExternalOverview(externalPayload.overview ?? { total: 0, posted: 0, unmatched: 0, pending: 0 });
      setBankTransactions(Array.isArray(bankPayload.data) ? bankPayload.data : []);
      setSettlements(Array.isArray(settlementPayload.data) ? settlementPayload.data : []);
      setReconciliationOverview(bankPayload.overview ?? settlementPayload.overview ?? { accounts: 0, bankTransactions: 0, bankUnmatched: 0, settlementsExpected: 0, settlementsAccountUnmatched: 0, settlementsCompleted: 0 });
    };
    void loadMoneyActivity().catch(() => {
      // Preserve the last successful financial snapshot during connection loss.
    });
    window.addEventListener("arix:documents-updated", loadMoneyActivity);
    return () => {
      cancelled = true;
      window.removeEventListener("arix:documents-updated", loadMoneyActivity);
    };
  }, [language, locale, t]);

  const liveOptionSets = useMemo(() => {
    const values = (key: keyof MoneyRow) =>
      Array.from(new Set(moneyRows.map((row) => String(row[key] ?? "")).filter(Boolean))).map((value) => ({ label: value, value }));
    return {
      ...optionSets,
      status: [
        { label: t("money.status.approved"), value: "approved" },
        { label: t("money.status.preparing"), value: "preparing" },
        { label: t("money.status.cancelled"), value: "cancelled" },
      ],
      kind: [
        { label: t("money.income"), value: "income", color: "bg-emerald-500" },
        { label: t("money.expense"), value: "expense", color: "bg-rose-500" },
        { label: t("money.transfer"), value: "transfer", color: "bg-sky-500" },
        { label: t("money.refund"), value: "refund", color: "bg-amber-500" },
      ],
      account: values("account"),
      counterparty: values("counterparty"),
      author: values("author"),
      method: values("method"),
      category: values("category"),
    };
  }, [language, moneyRows, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return moneyRows.filter((row) => {
      const matchesFilter = (Object.keys(filters) as FilterKey[]).every((key) => {
        if (!filters[key]) return true;
        if (key === "kind") return row.kind === filters.kind;
        return String(row[key]).toLowerCase() === filters[key].toLowerCase();
      });
      const matchesQuery =
        !q ||
        [row.document, row.account, row.counterparty, row.category, row.method, row.author, row.comment, row.linkedDocument].some((value) =>
          value.toLowerCase().includes(q)
        );
      return matchesFilter && matchesQuery;
    });
  }, [filters, moneyRows, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, MoneyRow[]>();
    for (const row of filtered) map.set(row.date, [...(map.get(row.date) ?? []), row]);
    return Array.from(map.entries());
  }, [filtered]);
  const incomeTotal = filtered.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
  const expenseTotal = filtered.filter((row) => row.amount < 0).reduce((sum, row) => sum + Math.abs(row.amount), 0);

  return (
    <>
    <div className="flex min-h-[calc(100dvh-12rem)] min-w-0 flex-col gap-3 md:h-[calc(100vh-8rem)] md:min-h-0">
        <div className={cx("relative z-30 flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between", ui.card, ui.ring)}>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-[440px]">
              <I.Search className="absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("money.search")}
                className={cx(ui.input, "pl-8 pr-12")}
              />
              <button
                type="button"
                onClick={() => setFilterOpen((value) => !value)}
                className={cx("absolute right-1 top-1/2 flex h-8 w-10 -translate-y-1/2 items-center justify-center rounded-lg", isDark ? "hover:bg-white/10" : "hover:bg-white/65")}
                aria-label={t("action.filters")}
                aria-expanded={filterOpen}
              >
                <I.Filter className="h-5 w-5 text-slate-500" />
                {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
              </button>
              {filterOpen && (
                <MoneyFilterPanel
                  filters={filters}
                  setFilters={setFilters}
                  visibleFilters={visibleFilters}
                  setVisibleFilters={setVisibleFilters}
                  activeFilter={activeFilter}
                  setActiveFilter={setActiveFilter}
                  optionSets={liveOptionSets}
                  isDark={isDark}
                />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <SummaryPill label={t("money.income")} value={incomeTotal} tone="emerald" />
            <SummaryPill label={t("money.expense")} value={expenseTotal} tone="rose" />
            <button type="button" className={cx(ui.iconBtn, "border", ui.borderSoft)} title={t("action.export")}>
              <I.Download className={cx("h-5 w-5", isDark ? "text-slate-200" : "text-slate-700")} />
            </button>
          </div>
        </div>

        {externalPayments.length > 0 && (
          <ExternalPaymentsPanel
            payments={externalPayments}
            overview={externalOverview}
            isDark={isDark}
            onChanged={() => window.dispatchEvent(new Event("arix:documents-updated"))}
          />
        )}

        <BankReconciliationPanel
          transactions={bankTransactions}
          settlements={settlements}
          overview={reconciliationOverview}
          isDark={isDark}
          onChanged={() => window.dispatchEvent(new Event("arix:documents-updated"))}
        />

        <div className={cx("flex min-h-0 flex-1 flex-col overflow-hidden", ui.card, ui.ring)}>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-3 p-3 md:hidden">
            {grouped.map(([date, dateRows]) => (
              <div key={date} className="space-y-2">
                <div className={cx("px-1 text-sm font-semibold", ui.subtle)}>{date}</div>
                {dateRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedRow(row)}
                    className={cx("w-full rounded-2xl border p-3 text-left transition", ui.borderSoft, isDark ? "bg-white/5 hover:bg-white/10" : "bg-white hover:bg-slate-50")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cx("h-2.5 w-2.5 rounded-full", row.status === "cancelled" ? "bg-rose-500" : row.status === "preparing" ? "bg-amber-500" : row.amount < 0 ? "bg-rose-500" : "bg-emerald-500")} />
                          <span className="truncate text-sm font-semibold">{row.document}</span>
                        </div>
                        <div className={cx("mt-1 truncate text-xs", ui.subtle)}>{row.account} · {row.counterparty || t("money.noCounterparty")}</div>
                        {row.linkedDocument && <div className="mt-1 truncate text-xs font-medium text-indigo-600">{row.linkedDocument}</div>}
                      </div>
                      <div className={cx("shrink-0 text-right text-sm font-semibold tabular-nums", row.amount < 0 ? "text-rose-600" : "text-emerald-600")}>
                        {row.amount < 0 ? "-" : "+"}{money(Math.abs(row.amount), locale)} ₼
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", kindTone(row.kind))}>{kindLabel(row.kind, t)}</span>
                      <span className={cx("rounded-full px-2.5 py-1 text-xs", isDark ? "bg-white/7 text-slate-300" : "bg-slate-100 text-slate-600")}>{statusLabel(row.status, t)}</span>
                      {row.category && <span className={cx("rounded-full px-2.5 py-1 text-xs", isDark ? "bg-white/7 text-slate-300" : "bg-slate-100 text-slate-600")}>{row.category}</span>}
                      {row.costAllocations && row.costAllocations.length > 0 && <span className="rounded-full bg-indigo-500/12 px-2.5 py-1 text-xs font-semibold text-indigo-600">{t("money.landedCostLinked")}</span>}
                      <span className={cx("ml-auto text-xs tabular-nums", ui.subtle)}>{row.time}</span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && <div className={cx("rounded-2xl border p-4 text-center text-sm", ui.borderSoft, ui.subtle)}>{t("money.noneFound")}</div>}
          </div>
          <div className="hidden min-h-full md:block">
          <table className="w-full min-w-[1540px] border-separate border-spacing-0 text-[13px]">
              <thead className={ui.theadSticky}>
                <tr className={cx("text-xs font-semibold", ui.subtle)}>
                  <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>{t("money.column.status")}</th>
                  <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>{t("money.column.document")}</th>
                  <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>{t("money.column.dateTime")}</th>
                  <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>{t("money.column.account")}</th>
                  <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>{t("money.column.counterparty")}</th>
                  <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>{t("money.column.category")}</th>
                  <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>{t("money.column.linkedDocument")}</th>
                  <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>{t("money.column.method")}</th>
                  <th className={cx("border-b px-4 py-3 text-right", ui.borderSoft)}>{t("money.column.amount")}</th>
                  <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>{t("money.column.author")}</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([date, dateRows]) => (
                  <MoneyGroup key={date} date={date} rows={dateRows} isDark={isDark} border={ui.borderSoft} rowHover={ui.rowHover} onOpen={setSelectedRow} />
                ))}
              </tbody>
          </table>
          </div>
        </div>

          <div className={cx("flex h-11 items-center justify-between border-t px-4 text-sm", ui.borderSoft)}>
            <div className={ui.subtle}>{filtered.length} {t("money.operationsShown")}</div>
            <div className={cx("text-sm font-medium tabular-nums", isDark ? "text-slate-200" : "text-slate-700")}>
              {t("money.balance")}: {money(incomeTotal - expenseTotal, locale)} ₼
            </div>
          </div>
        </div>
      </div>

      {selectedRow && (
        <MoneyDetailPanel
          row={selectedRow}
          docs={rowDocuments[selectedRow.id] ?? []}
          isDark={isDark}
          onClose={() => {
            setSelectedRow(null);
            setSelectedDoc(null);
          }}
          onDocOpen={setSelectedDoc}
        />
      )}
      {selectedDoc && <LinkedDocumentPreview doc={selectedDoc} isDark={isDark} onClose={() => setSelectedDoc(null)} />}
    </>
  );
}

function BankReconciliationPanel({
  transactions,
  settlements,
  overview,
  isDark,
  onChanged,
}: {
  transactions: BankTransaction[];
  settlements: PaymentSettlement[];
  overview: ReconciliationOverview;
  isDark: boolean;
  onChanged: () => void;
}) {
  const unmatched = transactions.filter((item) => item.status === "unmatched");
  const pendingSettlements = settlements.filter((item) => item.status !== "settled");
  const [expanded, setExpanded] = useState(true);
  const [counterparties, setCounterparties] = useState<Array<{ id: string | number; name: string; kind: "customer" | "supplier" }>>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; currency?: string }>>([]);
  const [choices, setChoices] = useState<Record<string, { matchType: string; value: string; remember: boolean }>>({});
  const [message, setMessage] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [statementImportOpen, setStatementImportOpen] = useState(false);
  const [importBatches, setImportBatches] = useState<BankImportBatch[]>([]);
  const [importForm, setImportForm] = useState({ financialAccountId: "", direction: "in", amount: "", counterpartyName: "", counterpartyIban: "", description: "" });
  const [settlementChoices, setSettlementChoices] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!expanded) return;
    Promise.all([
      requestJson<{ data: Array<{ id: string | number; name: string; kind: "customer" | "supplier" }> }>("/api/counterparties"),
      requestJson<{ data: Array<{ id: string; name: string; currency?: string }> }>("/api/payment-integrations/accounts"),
      requestJson<{ data: BankImportBatch[] }>("/api/payment-integrations/bank-imports"),
    ]).then(([counterpartyPayload, accountPayload, batchPayload]) => {
      setCounterparties(counterpartyPayload.data ?? []);
      setAccounts(accountPayload.data ?? []);
      setImportBatches(batchPayload.data ?? []);
    }).catch(() => undefined);
  }, [expanded]);
  const updateChoice = (id: string, patch: Partial<{ matchType: string; value: string; remember: boolean }>) => setChoices((current) => ({ ...current, [id]: { matchType: current[id]?.matchType ?? "counterparty", value: current[id]?.value ?? "", remember: current[id]?.remember ?? true, ...patch } }));
  const match = async (transaction: BankTransaction) => {
    const suggestedDocumentId = transaction.suggestions?.[0]?.documentId ?? "";
    const choice = choices[transaction.id] ?? { matchType: suggestedDocumentId ? "document" : "counterparty", value: suggestedDocumentId, remember: true };
    setMessage("");
    try {
      const body = choice.matchType === "document"
        ? { matchType: "document", documentId: choice.value }
        : choice.matchType === "counterparty"
        ? { matchType: "counterparty", counterpartyId: choice.value, remember: choice.remember }
        : choice.matchType === "transfer"
          ? { matchType: "transfer", targetAccountId: choice.value }
          : choice.matchType === "expense"
            ? { matchType: "expense", category: choice.value || "Diğer gider" }
            : { matchType: "ignore" };
      await requestJson(`/api/payment-integrations/bank-transactions/${transaction.id}/match`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hareket eşleştirilemedi.");
    }
  };
  const importMovement = async () => {
    setMessage("");
    try {
      const account = accounts.find((item) => item.id === importForm.financialAccountId);
      await requestJson("/api/payment-integrations/bank-transactions/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          financialAccountId: importForm.financialAccountId,
          transactions: [{
            transactionId: `MAN-${Date.now()}`,
            amount: (importForm.direction === "out" ? -1 : 1) * Math.abs(Number(importForm.amount) || 0),
            currency: account?.currency || "TRY",
            date: new Date().toISOString(),
            counterpartyName: importForm.counterpartyName,
            counterpartyIban: importForm.counterpartyIban,
            description: importForm.description,
          }],
        }),
      });
      setImportForm({ financialAccountId: "", direction: "in", amount: "", counterpartyName: "", counterpartyIban: "", description: "" });
      setImportOpen(false);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Banka hareketi içe aktarılamadı.");
    }
  };
  const matchSettlementAccount = async (settlement: PaymentSettlement) => {
    const financialAccountId = settlementChoices[settlement.id];
    if (!financialAccountId) return;
    setMessage("");
    try {
      await requestJson(`/api/payment-integrations/settlements/${settlement.id}/match`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ financialAccountId, remember: true }) });
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hakediş hesabı eşleştirilemedi.");
    }
  };
  const statementImported = () => {
    onChanged();
    requestJson<{ data: BankImportBatch[] }>("/api/payment-integrations/bank-imports")
      .then((payload) => setImportBatches(payload.data ?? []))
      .catch(() => undefined);
  };
  return (
    <>
    <section className={cx("shrink-0 overflow-hidden rounded-2xl border", isDark ? "border-white/10 bg-white/5" : "border-white/70 bg-white/65")}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
        <button type="button" onClick={() => setExpanded((value) => !value)} className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left">
        <span className="font-semibold">Banka ve hakediş mutabakatı</span>
        <span className="rounded-full bg-rose-500/12 px-2.5 py-1 text-xs font-semibold text-rose-700">Eşleşmeyen {overview.bankUnmatched}</span>
        <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-xs font-semibold text-amber-700">Hakediş bekleyen {overview.settlementsExpected}</span>
        <span className="rounded-full bg-indigo-500/12 px-2.5 py-1 text-xs font-semibold text-indigo-700">Hesabı bulunamayan {overview.settlementsAccountUnmatched}</span>
        <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-semibold text-emerald-700">Tamamlanan {overview.settlementsCompleted}</span>
        <span className="ml-auto text-xs text-slate-500">{expanded ? "Daralt" : "Aç"}</span>
        </button>
        <button type="button" onClick={() => { setExpanded(true); setImportOpen((value) => !value); }} className={cx("h-9 rounded-lg border px-3 text-xs font-semibold", isDark ? "border-white/10 hover:bg-white/10" : "border-slate-200 hover:bg-white")}>Tek hareket ekle</button>
        <button type="button" onClick={() => setStatementImportOpen(true)} className="surface-primary h-9 rounded-lg px-3 text-xs font-semibold">Ekstre içe aktar</button>
      </div>
      {expanded && (
        <div className={cx("grid gap-4 border-t p-4 xl:grid-cols-2", isDark ? "border-white/10" : "border-slate-200/70")}>
          {importOpen && <div className={cx("grid gap-2 rounded-xl border p-3 sm:grid-cols-2 xl:col-span-2 xl:grid-cols-4", isDark ? "border-white/10" : "border-slate-200")}><select value={importForm.financialAccountId} onChange={(event) => setImportForm({ ...importForm, financialAccountId: event.target.value })} className={cx("h-9 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")}><option value="">Şirket hesabı</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="grid grid-cols-[100px_1fr] gap-2"><select value={importForm.direction} onChange={(event) => setImportForm({ ...importForm, direction: event.target.value })} className={cx("h-9 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")}><option value="in">Gelen</option><option value="out">Giden</option></select><input type="number" value={importForm.amount} onChange={(event) => setImportForm({ ...importForm, amount: event.target.value })} placeholder="Tutar" className={cx("h-9 min-w-0 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")} /></div><input value={importForm.counterpartyName} onChange={(event) => setImportForm({ ...importForm, counterpartyName: event.target.value })} placeholder="Gönderen / alıcı" className={cx("h-9 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")} /><input value={importForm.counterpartyIban} onChange={(event) => setImportForm({ ...importForm, counterpartyIban: event.target.value.toUpperCase() })} placeholder="Karşı taraf IBAN" className={cx("h-9 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")} /><input value={importForm.description} onChange={(event) => setImportForm({ ...importForm, description: event.target.value })} placeholder="Banka açıklaması" className={cx("h-9 rounded-lg border px-2 text-sm xl:col-span-3", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")} /><button type="button" onClick={() => void importMovement()} disabled={!importForm.financialAccountId || !Number(importForm.amount)} className="surface-primary h-9 rounded-lg px-3 text-xs font-semibold disabled:opacity-50">İçe aktar</button></div>}
          <div>
            <h3 className="text-sm font-semibold">Eşleşmeyen banka hareketleri</h3>
            <p className="mt-1 text-xs text-slate-500">Bir defa eşleştirilen IBAN sonraki hareketlerde otomatik tanınır.</p>
            <div className="mt-3 space-y-2">
              {unmatched.slice(0, 6).map((transaction) => {
                const suggestedDocumentId = transaction.suggestions?.[0]?.documentId ?? "";
                const choice = choices[transaction.id] ?? { matchType: suggestedDocumentId ? "document" : "counterparty", value: suggestedDocumentId, remember: true };
                const validCounterparties = counterparties.filter((item) => item.kind === (transaction.direction === "in" ? "customer" : "supplier"));
                return (
                  <div key={transaction.id} className={cx("rounded-xl border p-3", isDark ? "border-white/10" : "border-slate-200")}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold">{transaction.counterpartyName || transaction.description || "İsimsiz hareket"}</div><div className="mt-1 truncate text-xs text-slate-500">{transaction.financialAccountName} · {transaction.counterpartyIban || "IBAN yok"}</div></div><div className={cx("shrink-0 text-sm font-semibold", transaction.direction === "in" ? "text-emerald-600" : "text-rose-600")}>{transaction.direction === "in" ? "+" : "-"}{transaction.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {transaction.currency}</div></div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
                      <select value={choice.matchType} onChange={(event) => updateChoice(transaction.id, { matchType: event.target.value, value: event.target.value === "document" ? suggestedDocumentId : "" })} className={cx("h-9 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")}>{transaction.suggestions?.length ? <option value="document">Önerilen belge</option> : null}<option value="counterparty">{transaction.direction === "in" ? "Müşteri" : "Tedarikçi"}</option>{transaction.direction === "out" && <option value="expense">Gider</option>}<option value="transfer">Hesap transferi</option><option value="ignore">Yok say</option></select>
                      {choice.matchType === "document" ? <select value={choice.value} onChange={(event) => updateChoice(transaction.id, { value: event.target.value })} className={cx("h-9 min-w-0 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")}><option value="">Belge seçin</option>{transaction.suggestions?.map((suggestion) => <option key={suggestion.documentId} value={suggestion.documentId}>{suggestion.title} · %{Math.min(100, suggestion.score)} · {suggestion.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</option>)}</select> : choice.matchType === "counterparty" ? <select value={choice.value} onChange={(event) => updateChoice(transaction.id, { value: event.target.value })} className={cx("h-9 min-w-0 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")}><option value="">Seçin</option>{validCounterparties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : choice.matchType === "transfer" ? <select value={choice.value} onChange={(event) => updateChoice(transaction.id, { value: event.target.value })} className={cx("h-9 min-w-0 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")}><option value="">Hedef hesap</option>{accounts.filter((item) => item.name !== transaction.financialAccountName).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : choice.matchType === "expense" ? <input value={choice.value} onChange={(event) => updateChoice(transaction.id, { value: event.target.value })} placeholder="Gider kategorisi" className={cx("h-9 min-w-0 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")} /> : <div />}
                      <button type="button" onClick={() => void match(transaction)} disabled={choice.matchType !== "ignore" && !choice.value} className="surface-primary h-9 rounded-lg px-3 text-xs font-semibold disabled:opacity-50">{choice.matchType === "document" ? "Kabul et" : "İşle"}</button>
                    </div>
                    {choice.matchType === "document" && transaction.suggestions?.find((item) => item.documentId === choice.value) && <div className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">{transaction.suggestions.find((item) => item.documentId === choice.value)?.reason}</div>}
                    {choice.matchType === "counterparty" && transaction.counterpartyIban && <label className="mt-2 flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={choice.remember} onChange={(event) => updateChoice(transaction.id, { remember: event.target.checked })} />Bu IBAN eşleştirmesini hatırla</label>}
                  </div>
                );
              })}
              {!unmatched.length && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">Eşleşmeyen banka hareketi yok.</div>}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Bekleyen POS hakedişleri</h3>
            <p className="mt-1 text-xs text-slate-500">Banka hareketi geldiğinde batch veya net tutar/valör ile otomatik kapanır.</p>
            <div className="mt-3 space-y-2">{pendingSettlements.slice(0, 8).map((item) => <div key={item.id} className={cx("rounded-xl border p-3", isDark ? "border-white/10" : "border-slate-200")}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold">{item.providerName} · {item.batchReference}</div><div className="mt-1 text-xs text-slate-500">{item.financialAccountName || "Hedef hesap eşleşmedi"} · {new Date(item.expectedSettlementAt).toLocaleDateString("tr-TR")}</div></div><div className="text-right"><div className="text-sm font-semibold">{item.netAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {item.currency}</div><div className={cx("mt-1 text-xs font-semibold", item.status === "account_unmatched" ? "text-rose-600" : "text-amber-600")}>{item.status === "account_unmatched" ? "Hesap gerekli" : "Bankaya geçmesi bekleniyor"}</div></div></div>{item.status === "account_unmatched" && <div className="mt-3 flex gap-2"><select value={settlementChoices[item.id] ?? ""} onChange={(event) => setSettlementChoices((current) => ({ ...current, [item.id]: event.target.value }))} className={cx("h-9 min-w-0 flex-1 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")}><option value="">Hakediş hesabı seçin</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><button type="button" onClick={() => void matchSettlementAccount(item)} disabled={!settlementChoices[item.id]} className="surface-primary h-9 rounded-lg px-3 text-xs font-semibold disabled:opacity-50">Eşleştir ve hatırla</button></div>}</div>)}{!pendingSettlements.length && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">Bekleyen hakediş yok.</div>}</div>
          </div>
          {importBatches.length > 0 && <div className="xl:col-span-2"><h3 className="text-sm font-semibold">Son ekstre yüklemeleri</h3><div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{importBatches.slice(0, 6).map((batch) => <div key={batch.id} className={cx("rounded-xl border p-3", isDark ? "border-white/10" : "border-slate-200")}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold">{batch.sourceName}</div><div className="mt-1 text-xs text-slate-500">{batch.financialAccountName} · {new Date(batch.createdAt).toLocaleString("tr-TR")}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase text-slate-600">{batch.sourceType}</span></div><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{batch.createdCount} yeni</span><span>{batch.duplicateCount} mükerrer</span><span>{batch.matchedCount} eşleşen</span><span>{batch.unmatchedCount} bekleyen</span></div></div>)}</div></div>}
          {message && <div className="text-sm text-rose-600 xl:col-span-2">{message}</div>}
        </div>
      )}
    </section>
    {statementImportOpen && <BankStatementImportDialog accounts={accounts} isDark={isDark} onClose={() => setStatementImportOpen(false)} onImported={statementImported} />}
    </>
  );
}

function ExternalPaymentsPanel({
  payments,
  overview,
  isDark,
  onChanged,
}: {
  payments: ExternalPayment[];
  overview: ExternalPaymentOverview;
  isDark: boolean;
  onChanged: () => void;
}) {
  const unmatched = payments.filter((item) => item.processingStatus === "unmatched");
  const [customers, setCustomers] = useState<Array<{ id: string | number; name: string }>>([]);
  const [selection, setSelection] = useState<Record<string, string>>( {} );
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!unmatched.length) return;
    requestJson<{ data: Array<{ id: string | number; name: string; kind?: string }> }>("/api/counterparties?kind=customer")
      .then((payload) => setCustomers((payload.data ?? []).filter((item) => item.kind !== "supplier")))
      .catch(() => setCustomers([]));
  }, [unmatched.length]);
  const match = async (payment: ExternalPayment) => {
    const counterpartyId = selection[payment.id];
    if (!counterpartyId) return;
    setSavingId(payment.id);
    setError("");
    try {
      await requestJson(`/api/payment-integrations/payments/${payment.id}/match`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ counterpartyId }),
      });
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ödeme eşleştirilemedi.");
    } finally {
      setSavingId("");
    }
  };
  return (
    <section className={cx("shrink-0 overflow-hidden rounded-2xl border", isDark ? "border-white/10 bg-white/5" : "border-white/70 bg-white/65")}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
        <span className="font-semibold">Harici tahsilatlar</span>
        <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-semibold text-emerald-700">İşlenen {overview.posted}</span>
        <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-xs font-semibold text-amber-700">Eşleşmeyen {overview.unmatched}</span>
        <span className="rounded-full bg-sky-500/12 px-2.5 py-1 text-xs font-semibold text-sky-700">Bekleyen {overview.pending}</span>
      </div>
      {unmatched.length > 0 && (
        <div className={cx("border-t px-4 py-3", isDark ? "border-white/10" : "border-slate-200/70")}>
          <div className="mb-2 text-xs text-amber-700">Bu ödemeler müşteri kesinleşmeden cari hesaba işlenmez.</div>
          <div className="grid gap-2 xl:grid-cols-2">
            {unmatched.slice(0, 4).map((payment) => (
              <div key={payment.id} className={cx("flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center", isDark ? "border-white/10" : "border-slate-200")}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{payment.rawCustomerName || payment.externalId}</div>
                  <div className="text-xs text-slate-500">{payment.providerName} · {payment.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {payment.currency}</div>
                </div>
                <select value={selection[payment.id] ?? ""} onChange={(event) => setSelection((current) => ({ ...current, [payment.id]: event.target.value }))} className={cx("h-9 min-w-48 rounded-lg border px-2 text-sm", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")}>
                  <option value="">Müşteri seç</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
                <button type="button" disabled={!selection[payment.id] || savingId === payment.id} onClick={() => match(payment)} className="surface-primary h-9 rounded-lg px-3 text-xs font-semibold disabled:opacity-50">Eşleştir</button>
              </div>
            ))}
          </div>
          {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
        </div>
      )}
    </section>
  );
}

function MoneyFilterPanel({
  filters,
  setFilters,
  visibleFilters,
  setVisibleFilters,
  activeFilter,
  setActiveFilter,
  optionSets,
  isDark,
}: {
  filters: MoneyFilters;
  setFilters: Dispatch<SetStateAction<MoneyFilters>>;
  visibleFilters: FilterKey[];
  setVisibleFilters: Dispatch<SetStateAction<FilterKey[]>>;
  activeFilter: FilterKey | null;
  setActiveFilter: (key: FilterKey | null) => void;
  optionSets: Record<Exclude<FilterKey, "date">, Array<{ label: string; value: string; color?: string }>>;
  isDark: boolean;
}) {
  const { t } = useI18n();
  const border = isDark ? "border-white/10" : "border-white/60";
  const surface = isDark ? "glass-control-dark" : "glass-control";
  const dropdown = isDark ? "glass-panel-dark ring-1 ring-white/10" : "glass-panel ring-1 ring-white/55";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const fieldKeys: FilterKey[] = ["date", "status", "kind", "account", "counterparty", "author", "method", "category"];
  const availableKeys = fieldKeys.filter((key) => !visibleFilters.includes(key));
  const setValue = (key: FilterKey, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setActiveFilter(null);
  };
  const removeCondition = (key: FilterKey) => {
    setFilters((current) => ({ ...current, [key]: "" }));
    setVisibleFilters((current) => current.filter((item) => item !== key));
    if (activeFilter === key) setActiveFilter(null);
  };

  return (
    <div className={cx("surface-popover absolute left-0 top-12 z-50 w-[560px] max-w-[calc(100vw-3rem)] rounded-2xl p-4 shadow-xl", isDark ? "glass-panel-dark ring-1 ring-white/10" : "glass-panel ring-1 ring-white/55")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className={cx("text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{t("money.filter.title")}</div>
          <div className={cx("text-xs", subtle)}>{t("money.filter.description")}</div>
        </div>
        <select
          value=""
          disabled={availableKeys.length === 0}
          onChange={(event) => {
            if (!event.target.value) return;
            const key = event.target.value as FilterKey;
            setVisibleFilters((current) => current.includes(key) ? current : [...current, key]);
            setActiveFilter(key);
          }}
          className={cx("h-10 min-w-44 rounded-xl border px-3 text-sm outline-none", border, surface)}
        >
          <option value="">{availableKeys.length ? t("action.addCondition") : t("money.filter.allAdded")}</option>
          {availableKeys.map((key) => <option key={key} value={key}>{filterLabel(key, t)}</option>)}
        </select>
      </div>

      {visibleFilters.length === 0 ? (
        <div className={cx("rounded-xl border p-3 text-sm", border, isDark ? "bg-slate-900/35 text-slate-400" : "bg-slate-50/70 text-slate-500")}>{t("money.filter.empty")}</div>
      ) : (
        <div className="space-y-2">
          {visibleFilters.map((key) => (
            <div key={key} className={cx("relative rounded-xl border p-3", border, isDark ? "bg-slate-900/35" : "bg-slate-50/70")}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className={cx("text-base font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{filterLabel(key, t)}</div>
                <button type="button" onClick={() => removeCondition(key)} className={cx("rounded-lg px-2 py-1 text-xs", isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-500 hover:bg-white")}>{t("action.remove")}</button>
              </div>
              <div className="relative grid grid-cols-[1fr_1fr] items-center gap-3">
                <select className={cx("h-9 rounded-lg border px-3 text-sm outline-none", border, isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800")}>
                  <option>{t("money.filter.equals")}</option>
                  <option>{t("money.filter.includes")}</option>
                </select>
                <button
                  type="button"
                  onClick={() => setActiveFilter(activeFilter === key ? null : key)}
                  className={cx("flex h-9 min-w-0 items-center justify-between border-0 border-b bg-transparent px-2 text-left text-sm outline-none", isDark ? "border-slate-600 hover:border-slate-400" : "border-slate-300 hover:border-slate-500")}
                >
                  <span className={cx("truncate", filters[key] ? isDark ? "text-slate-100" : "text-slate-800" : "text-slate-400")}>{key === "kind" && filters.kind ? kindLabel(filters.kind as MoneyKind, t) : key === "status" && filters.status ? statusLabel(filters.status as MoneyStatus, t) : filters[key] || t("money.filter.choose")}</span>
                  <span className={subtle}>▾</span>
                </button>
                {activeFilter === key && (
                  <div className={cx("surface-popover absolute left-0 top-11 z-50 min-w-full overflow-hidden rounded-xl p-2 shadow-xl", dropdown, key === "date" ? "w-[720px] max-w-[calc(100vw-4rem)]" : "w-72")}>
                    {key === "date" ? (
                      <DateFilterPanel onPick={(value) => setValue("date", value)} isDark={isDark} />
                    ) : (
                      <OptionList options={optionSets[key]} value={filters[key]} onPick={(value) => setValue(key, value)} isDark={isDark} />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setFilters(emptyFilters);
            setVisibleFilters([]);
            setActiveFilter(null);
          }}
          className={cx("h-9 rounded-xl px-3 text-sm", isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-white/70")}
        >
          {t("action.clearFilters")}
        </button>
        <div className={cx("text-xs", subtle)}>{t("money.filter.instant")}</div>
      </div>
    </div>
  );
}

function OptionList({ options, value, onPick, isDark }: { options: Array<{ label: string; value: string; color?: string }>; value: string; onPick: (value: string) => void; isDark: boolean }) {
  return (
    <div className="max-h-[340px] space-y-1 overflow-y-auto">
      {options.map((option) => (
        <button
          key={`${option.label}-${option.value}`}
          type="button"
          onClick={() => onPick(option.value)}
          className={cx("flex h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-sm", value === option.value ? isDark ? "surface-nav-active text-slate-100" : "surface-nav-active text-indigo-700" : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-700 hover:bg-white/70")}
        >
          <span className="flex items-center gap-2">{option.color && <span className={cx("h-3 w-3 rounded-full", option.color)} />}{option.label}</span>
          {value === option.value && <I.Check className="h-4 w-4" />}
        </button>
      ))}
    </div>
  );
}

function DateFilterPanel({ onPick, isDark }: { onPick: (value: string) => void; isDark: boolean }) {
  const quick = ["Bugün", "Dünən", "7 gün", "30 gün", "Bu ay", "Keçən ay", "Rüb"];
  const daysMay = Array.from({ length: 31 }, (_, index) => index + 1);
  const daysJune = Array.from({ length: 30 }, (_, index) => index + 1);
  const dayClass = (day: number) =>
    cx("flex h-8 w-8 items-center justify-center rounded-lg text-sm", day === 14 || day === 20 ? "bg-indigo-600 text-white" : day > 14 && day < 20 ? isDark ? "bg-indigo-500/15 text-indigo-100" : "bg-indigo-50 text-indigo-700" : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-600 hover:bg-white/70");

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-[150px_1fr_1fr]">
        <div className={cx("border-r pr-2", isDark ? "border-white/10" : "border-slate-200")}>
          {quick.map((item) => (
            <button key={item} type="button" onClick={() => onPick(item)} className={cx("block h-10 w-full rounded-xl px-3 text-left text-sm", isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-600 hover:bg-white/70")}>{item}</button>
          ))}
        </div>
        {[
          ["May 2026", daysMay],
          ["İyun 2026", daysJune],
        ].map(([title, days]) => (
          <div key={String(title)}>
            <div className={cx("mb-2 text-center text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-700")}>{String(title)}</div>
            <div className={cx("mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium", isDark ? "text-slate-400" : "text-slate-500")}>
              {["B.e", "Ç.a", "Ç", "C.a", "C", "Ş", "B"].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {(days as number[]).map((day) => (
                <button key={day} type="button" onClick={() => onPick(`${day} ${String(title).split(" ")[0]}`)} className={dayClass(day)}>{day}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={cx("mt-4 flex items-center justify-between border-t pt-3 text-sm", isDark ? "border-white/10 text-slate-300" : "border-slate-200 text-slate-600")}>
        <span className="font-medium">2026-05-14 - 2026-05-20 (7 gün)</span>
        <button type="button" onClick={() => onPick("14 May - 20 May")} className="surface-primary h-9 rounded-xl px-4 text-sm">Seç</button>
      </div>
    </div>
  );
}

function MoneyGroup({ date, rows, isDark, border, rowHover, onOpen }: { date: string; rows: MoneyRow[]; isDark: boolean; border: string; rowHover: string; onOpen: (row: MoneyRow) => void }) {
  const { locale, t } = useI18n();
  return (
    <>
      <tr>
        <td colSpan={10} className={cx("border-b px-4 py-3 text-lg font-semibold", border, isDark ? "text-slate-100" : "text-slate-800")}>{date}</td>
      </tr>
      {rows.map((row) => (
        <tr key={row.id} className={cx("group cursor-pointer transition", rowHover)} onClick={() => onOpen(row)}>
          <td className={cx("border-b px-4 py-3", border)}>
            <div className="flex items-center gap-3">
              <span className={cx("h-8 w-1 rounded-full", row.status === "cancelled" ? "bg-rose-500" : row.status === "preparing" ? "bg-amber-500" : row.amount < 0 ? "bg-rose-500" : "bg-emerald-500")} />
              <span className={cx("flex h-7 w-7 items-center justify-center rounded-full", isDark ? "bg-white/10 text-indigo-200" : "bg-indigo-50 text-indigo-600")}>
                <I.Check className="h-4 w-4" />
              </span>
            </div>
          </td>
          <td className={cx("border-b px-4 py-3", border)}>
            <div className="font-medium text-indigo-600">{row.document}</div>
            <div className={cx("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{kindLabel(row.kind, t)} · {statusLabel(row.status, t)}</div>
          </td>
          <td className={cx("border-b px-4 py-3 tabular-nums", border)}>{row.time}</td>
          <td className={cx("border-b px-4 py-3 text-indigo-600", border)}>{row.account}</td>
          <td className={cx("border-b px-4 py-3 text-indigo-600", border)}>{row.counterparty}</td>
          <td className={cx("border-b px-4 py-3", border)}>{row.category}</td>
          <td className={cx("border-b px-4 py-3 text-indigo-600", border)}>{row.linkedDocument || "—"}</td>
          <td className={cx("border-b px-4 py-3", border)}>{row.method}</td>
          <td className={cx("border-b px-4 py-3 text-right font-semibold tabular-nums", border, row.amount < 0 ? "text-rose-600" : "text-emerald-600")}>{row.amount < 0 ? "-" : "+"}{money(Math.abs(row.amount), locale)}</td>
          <td className={cx("border-b px-4 py-3 text-indigo-600", border)}>{row.author}</td>
        </tr>
      ))}
    </>
  );
}

function MoneyDetailPanel({ row, docs, isDark, onClose, onDocOpen }: { row: MoneyRow; docs: LinkedDoc[]; isDark: boolean; onClose: () => void; onDocOpen: (doc: LinkedDoc) => void }) {
  const { locale, t } = useI18n();
  const border = isDark ? "border-white/10" : "border-slate-200";
  const panel = isDark ? "bg-slate-950/92 text-slate-100 ring-white/10" : "bg-white/92 text-slate-900 ring-slate-200";
  const soft = isDark ? "bg-white/7" : "bg-slate-50";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-md">
      <section className={cx("flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[26px] shadow-2xl ring-1", panel)}>
        <div className={cx("flex items-center justify-between gap-3 border-b p-3", border)}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className={cx("flex h-11 w-11 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")} aria-label={t("action.close")}><I.X className="h-5 w-5" /></button>
            <button type="button" className="surface-primary inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold"><I.Edit className="h-4 w-4" />{t("action.edit")}</button>
            <button type="button" className={cx("flex h-11 w-11 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")} title={t("action.print")}><I.Printer className="h-5 w-5" /></button>
            <button type="button" className={cx("flex h-11 w-11 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")} title={t("action.export")}><I.Download className="h-5 w-5" /></button>
          </div>
          <button type="button" className="h-11 rounded-xl border border-rose-300 px-5 text-sm font-semibold text-rose-600 hover:bg-rose-50">{t("action.delete")}</button>
        </div>

        <div className="min-h-0 overflow-auto p-5">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-semibold tracking-normal">{row.document}</h2>
                <span className={cx("rounded-full px-3 py-1 text-sm font-medium", kindTone(row.kind))}>{kindLabel(row.kind, t)}</span>
              </div>
              <div className={cx("mt-2 flex flex-wrap items-center gap-2 text-sm", subtle)}>
                <span className={cx("inline-flex items-center gap-2 rounded-xl border px-3 py-2", border, soft)}><I.Calendar className="h-4 w-4" />{row.date}, {row.time}</span>
                <span className={cx("rounded-xl border px-3 py-2", border, soft)}>{statusLabel(row.status, t)}</span>
                <span className={cx("rounded-xl border px-3 py-2", border, soft)}>{row.method}</span>
              </div>
            </div>
            <div className={cx("grid min-w-[280px] gap-2 rounded-2xl border p-4", border, soft)}>
              <SummaryLine label={t("money.column.amount")} value={`${row.amount < 0 ? "-" : "+"}${money(Math.abs(row.amount), locale)} ₼`} danger={row.amount < 0} success={row.amount > 0} />
              <SummaryLine label="Kateqoriya" value={row.category} />
              <SummaryLine label="Müəllif" value={row.author} />
            </div>
          </div>

          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <InfoTile label="Hesab" value={row.account} isDark={isDark} />
            <InfoTile label="Kontragent" value={row.counterparty} isDark={isDark} />
            <InfoTile label="Şərh" value={row.comment} isDark={isDark} />
          </div>

          {row.linkedDocument && (
            <div className={cx("mb-6 grid gap-3 rounded-2xl border p-4 sm:grid-cols-2", border, soft)}>
              <InfoTile label="Bağlı sənəd" value={row.linkedDocument} isDark={isDark} />
              <InfoTile
                label="Əlaqə növü"
                value={row.relationshipType === "landedCost" ? "Maya xərci" : row.relationshipType === "debtPayment" ? "Borc ödənişi" : "Sənəd əlaqəsi"}
                isDark={isDark}
              />
            </div>
          )}

          {row.costAllocations && row.costAllocations.length > 0 && (
            <>
              <SectionTitle title="Sənədə bağlı maya xərci" isDark={isDark} />
              <div className={cx("mb-8 overflow-hidden rounded-2xl border", border)}>
                <table className="w-full min-w-[780px] text-sm">
                  <thead className={isDark ? "bg-white/5 text-slate-400" : "bg-slate-50 text-slate-500"}>
                    <tr>
                      <th className="px-4 py-3 text-left">Konteyner</th>
                      <th className="px-4 py-3 text-left">Xərc</th>
                      <th className="px-4 py-3 text-right">Miqdar</th>
                      <th className="px-4 py-3 text-right">Pay</th>
                      <th className="px-4 py-3 text-right">Vahid maya</th>
                      <th className="px-4 py-3 text-left">Formula</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.costAllocations.map((item, index) => (
                      <tr key={item.id ?? index} className={cx("border-t", border)}>
                        <td className="px-4 py-3 font-semibold">{item.containerNumber}</td>
                        <td className="px-4 py-3">{item.category}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{Number(item.baseQty ?? 0).toLocaleString("az-Latn-AZ")}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(Number(item.amount ?? 0), locale)} ₼</td>
                        <td className="px-4 py-3 text-right tabular-nums">{Number(item.unitCost ?? 0).toFixed(4)} ₼</td>
                        <td className={cx("px-4 py-3 text-xs", subtle)}>{item.formula}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <SectionTitle title="Bağlı sənədlər" isDark={isDark} />
          <div className={cx("mb-8 overflow-hidden rounded-2xl border", border)}>
            <table className="w-full min-w-[720px] text-sm">
              <thead className={isDark ? "bg-white/5 text-slate-400" : "bg-slate-50 text-slate-500"}>
                <tr>
                  <th className="px-4 py-3 text-left">Sənəd</th>
                  <th className="px-4 py-3 text-left">Tip</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Məbləğ</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id} className={cx("border-t", border, isDark ? "hover:bg-white/5" : "hover:bg-slate-50")}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => onDocOpen(doc)} className="inline-flex items-center gap-2 font-medium text-indigo-600 hover:text-indigo-500">
                        <I.Tag className="h-4 w-4 text-slate-400" />{doc.title}<I.External className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="px-4 py-3">{doc.type}</td>
                    <td className="px-4 py-3">{doc.status}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(doc.amount, locale)} ₼</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <SectionTitle title="Hesab hərəkəti" isDark={isDark} />
          <div className="grid gap-3 md:grid-cols-3">
            <InfoTile label="Əvvəlki balans" value={`${money(42180.2, locale)} ₼`} isDark={isDark} />
            <InfoTile label="Bu əməliyyat" value={`${row.amount < 0 ? "-" : "+"}${money(Math.abs(row.amount), locale)} ₼`} isDark={isDark} />
            <InfoTile label="Son balans" value={`${money(42180.2 + row.amount, locale)} ₼`} isDark={isDark} />
          </div>
        </div>
      </section>
    </div>
  );
}

function LinkedDocumentPreview({ doc, isDark, onClose }: { doc: LinkedDoc; isDark: boolean; onClose: () => void }) {
  const { locale } = useI18n();
  const border = isDark ? "border-white/10" : "border-slate-200";
  const panel = isDark ? "bg-slate-950/95 text-slate-100 ring-white/10" : "bg-white text-slate-900 ring-slate-200";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-sm">
      <section className={cx("w-full max-w-xl overflow-hidden rounded-[24px] shadow-2xl ring-1", panel)}>
        <div className={cx("flex items-center justify-between border-b p-4", border)}>
          <div className="flex items-center gap-3">
            <span className={cx("flex h-11 w-11 items-center justify-center rounded-2xl", isDark ? "bg-white/10 text-indigo-200" : "bg-indigo-50 text-indigo-600")}><I.Tag className="h-6 w-6" /></span>
            <div>
              <h3 className="text-lg font-semibold">{doc.title}</h3>
              <p className={cx("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{doc.type} · {doc.status}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={cx("flex h-10 w-10 items-center justify-center rounded-xl border", border)} aria-label="Sənəd kartını bağla"><I.X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <InfoTile label="Sənəd nömrəsi" value={`#${doc.id}`} isDark={isDark} />
          <InfoTile label="Məbləğ" value={`${money(doc.amount, locale)} ₼`} isDark={isDark} />
          <InfoTile label="Status" value={doc.status} isDark={isDark} />
          <InfoTile label="Tip" value={doc.type} isDark={isDark} />
        </div>
      </section>
    </div>
  );
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: "emerald" | "rose" }) {
  const { locale } = useI18n();
  return (
    <div className={cx("hidden h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold tabular-nums sm:flex", tone === "emerald" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
      <span>{label}</span>
      <span>{money(value, locale)} ₼</span>
    </div>
  );
}

function InfoTile({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div className={cx("rounded-2xl border p-3", isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>
      <div className={cx("text-xs font-medium", isDark ? "text-slate-400" : "text-slate-500")}>{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function SummaryLine({ label, value, danger = false, success = false }: { label: string; value: string; danger?: boolean; success?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={cx("font-semibold tabular-nums", danger && "text-rose-600", success && "text-emerald-600")}>{value}</span>
    </div>
  );
}

function SectionTitle({ title, isDark }: { title: string; isDark: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <div className={cx("h-px flex-1", isDark ? "bg-white/10" : "bg-slate-200")} />
      <h3 className="text-base font-bold uppercase tracking-wide">{title}</h3>
      <div className={cx("h-px flex-1", isDark ? "bg-white/10" : "bg-slate-200")} />
    </div>
  );
}

