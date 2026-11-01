import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Columns2,
  CreditCard,
  ChevronDown,
  Globe2,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  Maximize2,
  Minimize2,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Tags,
  Trash2,
  Users,
  WalletCards,
  X,
  FileText,
} from "lucide-react";
import AriXLogo from "./AriXLogo";
import CustomersCrmView from "./CustomersCrmView";
import InvoiceAttachmentView from "./InvoiceAttachmentView";
import DailyManagementView from "./DailyManagementView";
import type { InvoiceRecord } from "./qaimeParser";
import type { DailySession } from "./App";
import {
  IMPORTED_ACCOUNTS,
  IMPORTED_BANKS,
  IMPORTED_CARD_REPORT,
  IMPORTED_CATEGORIES,
  IMPORTED_CUSTOMERS,
  IMPORTED_CUSTOMER_DEBTS,
  IMPORTED_DAY_METRICS,
  IMPORTED_ENTRIES,
  IMPORTED_PAST_MONTH_UNINVOICED,
  IMPORTED_PEOPLE,
  IMPORTED_PIVOT_REPORTS,
  IMPORTED_RECONCILIATION,
  IMPORTED_WEEKLY_CHARTS,
} from "./importedData";

type View = "daily" | "invoices" | "accounts" | "reports" | "cashboxes" | "categories" | "people" | "customers" | "settings" | "management";
type EntryKind = "income" | "expense" | "transfer";
type Currency = "TRY" | "AZN" | "USD";
type Account = {
  id: string;
  name: string;
  type: "cash" | "bank" | "card" | "currency";
  currency: Currency;
  opening: number;
  person?: string;
  channel?: string;
};
type Entry = {
  id: string;
  date: string;
  time: string;
  kind: EntryKind;
  title: string;
  counterparty: string;
  category: string;
  amount: number;
  accountId: string;
  targetAccountId?: string;
  responsible?: string;
  targetResponsible?: string;
  bank?: string;
  targetBank?: string;
  note?: string;
  invoiced?: boolean;
  invoiceNo?: string;
};
type EntryDraft = {
  amount: string;
  person: string;
  channel: string;
  targetPerson: string;
  targetChannel: string;
  counterparty: string;
  category: string;
  note: string;
};
type CloseRecord = { date: string; actuals: Record<string, number>; note: string; closedAt: string };
type DailyState = { entries: Entry[]; closes: CloseRecord[] };
type ReconciliationRow = readonly [string, number, number, number, number];

type DayMetric = { kassa: number; kartTo: number; cloudshop: number; note: string };
type CalculationRules = {
  autoSupplierEnabled: boolean;
  autoSupplierAccounts: string[];
  internalTransferMode: "net_received" | "expense_column";
  showDayCheckMetrics: boolean;
  hideZeroPlaceholderCards: boolean;
};

type DailySnapshot = {
  version: 1;
  state: DailyState;
  peopleList: string[];
  channelList: string[];
  categoryList: string[];
  customerList: string[];
  rules: CalculationRules;
  customerDebts: Record<string, number>;
  pastMonthUninvoiced: Record<string, number>;
  invoices: InvoiceRecord[];
};

type DailyApiResponse = {
  data: DailySnapshot | null;
  revision: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
};
type DailyNotification = { id: string; title: string; message: string; createdAt: string; createdBy?: string; readAt?: string | null };

const STORAGE_KEY = "arix-daily-imported-v4";
const RULES_STORAGE_KEY = "arix-daily-calc-rules-v1";
const ACCOUNTS = IMPORTED_ACCOUNTS as unknown as Account[];
const RECONCILIATION_BY_DATE = IMPORTED_RECONCILIATION as unknown as Record<string, ReconciliationRow[]>;
const DAY_METRICS_BY_DATE = IMPORTED_DAY_METRICS as unknown as Record<string, DayMetric>;

const DEFAULT_RULES: CalculationRules = {
  autoSupplierEnabled: true,
  autoSupplierAccounts: ["Emil", "Xəqan", "T1", "T2", "T3", "T4"],
  internalTransferMode: "net_received",
  showDayCheckMetrics: true,
  hideZeroPlaceholderCards: true,
};

const loadRules = (): CalculationRules => {
  try {
    const saved = localStorage.getItem(RULES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        return { ...DEFAULT_RULES, ...parsed };
      }
    }
  } catch {
    // Use default rules when storage is unavailable
  }
  return DEFAULT_RULES;
};

const isPlaceholderCard = (name: string) => /^(Kart\s+X\d+|K\.X\d+|T\d+)$/i.test(name.trim());

const normalizePersonName = (raw?: string) => {
  const value = (raw ?? "").trim();
  if (!value) return "Eşqin";
  if (/^K\.X(\d+)$/i.test(value)) return value.replace(/^K\.X/i, "Kart X");
  if (/^K\./i.test(value)) return value.replace(/^K\.\s*/i, "").trim();
  return value;
};

const resolveEntryPerson = (entry: Pick<Entry, "responsible" | "accountId">, fallbackAccount?: Account) => {
  const raw = entry.responsible?.trim() || fallbackAccount?.name || "";
  return normalizePersonName(raw);
};

const resolveEntryChannel = (entry: Pick<Entry, "bank" | "responsible" | "accountId">, fallbackAccount?: Account) => {
  const bank = entry.bank?.trim();
  if (bank) return bank;
  const rawResponsible = entry.responsible?.trim() || fallbackAccount?.name || "";
  if (/^K\./i.test(rawResponsible) || fallbackAccount?.type === "card") return "Kart";
  return "Kassa";
};

const pairAccountId = (person: string, channel: string) =>
  `pair:${encodeURIComponent(normalizePersonName(person))}:${encodeURIComponent(channel.trim() || "Kassa")}`;

const findAccountForPersonChannel = (person: string, channel: string): Account => {
  const cleanPerson = normalizePersonName(person);
  const cleanChannel = channel.trim() || "Kassa";
  const isCash = cleanChannel.toLocaleLowerCase("az-AZ") === "kassa";
  return {
    id: pairAccountId(cleanPerson, cleanChannel),
    name: `${cleanPerson} · ${cleanChannel}`,
    type: isCash ? "cash" : "bank",
    currency: "AZN",
    opening: 0,
    person: cleanPerson,
    channel: cleanChannel,
  };
};

const migrateManualAccountIds = (dailyState: DailyState): DailyState => ({
  ...dailyState,
  entries: dailyState.entries.map((entry) => {
    if (entry.id.startsWith("sheet-")) return entry;
    const source = findAccountForPersonChannel(resolveEntryPerson(entry), resolveEntryChannel(entry));
    const target = entry.kind === "transfer"
      ? findAccountForPersonChannel(entry.targetResponsible || entry.responsible || "Eşqin", entry.targetBank || "Kassa")
      : undefined;
    return { ...entry, accountId: source.id, targetAccountId: target?.id };
  }),
});

const DEFAULT_PEOPLE = Array.from(
  new Set(
    IMPORTED_PEOPLE
      .filter((name) => !isPlaceholderCard(name))
      .map((name) => normalizePersonName(name))
      .filter(Boolean)
  )
);
const DEFAULT_CHANNELS = Array.from(
  new Set([
    "Kassa",
    ...IMPORTED_BANKS,
    ...IMPORTED_CARD_REPORT.map((item) => item.bank),
  ])
);
const DEFAULT_CATEGORIES = Array.from(new Set([...IMPORTED_CATEGORIES]));
const DEFAULT_CUSTOMERS = Array.from(
  new Set(IMPORTED_CUSTOMERS.map((item) => item.name).filter(Boolean))
);

const loadDirectory = (storageKey: string, initialItems: string[]): string[] => {
  try {
    const saved = localStorage.getItem(`arix-daily-directory-${storageKey}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
    }
  } catch {
    // Keep default directory items when browser storage is unavailable.
  }
  return Array.from(new Set(initialItems.filter(Boolean)));
};

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const todayKey = dateKey(new Date());
const timeNow = () => `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
const shiftDate = (key: string, days: number) => {
  const value = new Date(`${key}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dateKey(value);
};
const dateLabel = (key: string, options: Intl.DateTimeFormatOptions) => {
  const value = new Date(`${key}T12:00:00`);
  const months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
  const weekdays = ["Bazar", "B.e.", "Ç.a.", "Ç.", "C.a.", "C.", "Ş."];
  if (options.weekday && !options.day) return weekdays[value.getDay()];
  const parts = [options.day ? value.getDate() : null, options.month ? months[value.getMonth()] : null, options.year ? value.getFullYear() : null].filter((part) => part != null);
  return `${parts.join(" ")}${options.weekday ? `, ${weekdays[value.getDay()]}` : ""}`;
};
const formatMoney = (value: number, currency: Currency) => {
  const [whole, decimal] = Math.abs(value).toFixed(2).split(".");
  const amount = `${value < 0 ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimal}`;
  if (currency === "AZN") return `${amount} ₼`;
  if (currency === "USD") return `$${amount}`;
  return `${amount} ₺`;
};
const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");

const seedEntries = (): Entry[] => IMPORTED_ENTRIES.map((entry) => ({ ...entry })) as Entry[];

const loadState = (): DailyState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return migrateManualAccountIds(JSON.parse(saved) as DailyState);
  } catch {
    // The prototype remains usable when browser storage is unavailable.
  }
  return migrateManualAccountIds({ entries: seedEntries(), closes: [] });
};

const accountIcon = (account: Account) => {
  if (account.type === "cash") return Banknote;
  if (account.type === "bank") return Landmark;
  if (account.type === "card") return CreditCard;
  return CircleDollarSign;
};

function PanelIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16v14H4z" />
      <path d="M9 5v14" />
    </svg>
  );
}

function ViewTabs({ view, onChange, onCreate, createDisabled, collapsed }: { view: View; onChange: (view: View) => void; onCreate: () => void; createDisabled?: boolean; collapsed?: boolean }) {
  const iconSize = collapsed ? 22 : 19;
  return <nav className="page-tabs" aria-label="Daily bölmələri">
    <button className={view === "daily" ? "active" : ""} title={collapsed ? "Gündəlik dəftər" : undefined} onClick={() => onChange("daily")}><BookOpen size={iconSize} /><span>Gündəlik dəftər</span></button>
    <button className={view === "invoices" ? "active" : ""} title={collapsed ? "Qaimələr" : undefined} onClick={() => onChange("invoices")}><FileText size={iconSize} /><span>Qaimələr</span></button>
    <button className="mobile-create-entry" aria-label="Yeni əməliyyat yarat" title="Yeni əməliyyat" onClick={onCreate} disabled={createDisabled}><Plus size={24} /><span>Yarat</span></button>
    <button className={view === "customers" ? "active" : ""} title={collapsed ? "Müştərilər" : undefined} onClick={() => onChange("customers")}><Users size={iconSize} /><span>Müştərilər</span></button>
    <button className={view === "accounts" ? "active" : ""} title={collapsed ? "Hesablar" : undefined} onClick={() => onChange("accounts")}><WalletCards size={iconSize} /><span>Hesablar</span></button>
    <button className={cx("desktop-reports-tab", view === "reports" && "active")} title={collapsed ? "Hesabatlar" : undefined} onClick={() => onChange("reports")}><BarChart3 size={iconSize} /><span>Hesabatlar</span></button>
  </nav>;
}

export default function DailyWorkspace({ session, onLogout }: { session: DailySession; onLogout: () => void }) {
  const [theme, setTheme] = useState<"light" | "dark">(() => localStorage.getItem("arix-daily-theme") === "dark" ? "dark" : "light");
  const [view, setView] = useState<View>("daily");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("arix-daily-sidebar-collapsed") === "1");
  const [managementOpen, setManagementOpen] = useState(() => localStorage.getItem("arix-daily-management-open") !== "0");
  const [topMenu, setTopMenu] = useState<"language" | "notifications" | "profile" | null>(null);
  const [notifications, setNotifications] = useState<DailyNotification[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [state, setState] = useState<DailyState>(loadState);
  const [peopleList, setPeopleList] = useState<string[]>(() => loadDirectory("people-v2", DEFAULT_PEOPLE));
  const [channelList, setChannelList] = useState<string[]>(() => loadDirectory("cashboxes-v3", DEFAULT_CHANNELS));
  const [categoryList, setCategoryList] = useState<string[]>(() => loadDirectory("categories", DEFAULT_CATEGORIES));
  const [customerList, setCustomerList] = useState<string[]>(() => loadDirectory("customers-v1", DEFAULT_CUSTOMERS));
  const [rules, setRules] = useState<CalculationRules>(loadRules);
  const [customerDebts, setCustomerDebts] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("arix-daily-customer-debts-v1");
      if (saved) return JSON.parse(saved) as Record<string, number>;
    } catch {
      // ignore
    }
    return { ...(IMPORTED_CUSTOMER_DEBTS as unknown as Record<string, number>) };
  });
  const [pastMonthUninvoiced, setPastMonthUninvoiced] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("arix-daily-past-month-v1");
      if (saved) return JSON.parse(saved) as Record<string, number>;
    } catch {
      // ignore
    }
    return { ...(IMPORTED_PAST_MONTH_UNINVOICED as unknown as Record<string, number>) };
  });
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => {
    try {
      const saved = localStorage.getItem("arix-daily-invoices-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as InvoiceRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    // Realistic default sample form so the approval table is pre-populated
    return [
      {
        id: "inv-seed-32609",
        invoiceNo: "32609",
        date: "31.10.2026",
        customer: "Membran Group",
        seller: "Arif Mahmud",
        warehouse: "ANAnas",
        note: "Topdan membran satışı",
        salesAmount: 872.7,
        returnAmount: 0,
        purchaseAmount: 0,
        previousDebtSnapshot: 2450.0,
        previousPastMonthSnapshot: 0,
        paymentDeducted: 0,
        currentMonthDeducted: 0,
        pastMonthDeducted: 0,
        finalDebt: 3322.7,
        linkedEntryIds: [],
        linkedEntriesSummary: [],
        items: [
          { no: 1, name: "Bute Kapuçino C1402", code: "C1402", unit: "metr", quantity: 6.1, price: 11.0, discount: 0, total: 67.1 },
          { no: 2, name: "Patine Bej G581 C1806", code: "C1806", unit: "metr", quantity: 1.6, price: 12.0, discount: 0, total: 19.2 },
          { no: 3, name: "Soft Moment Gri Folyolu C1870", code: "C1870", unit: "metr", quantity: 21.4, price: 15.0, discount: 0, total: 321.0 },
          { no: 4, name: "Patine Silver G572 ES 707", code: "ES 707", unit: "metr", quantity: 6.1, price: 12.0, discount: 0, total: 73.2 },
          { no: 5, name: "HG Aytaşı G545 ES HG 00138", code: "ES HG 00138", unit: "metr", quantity: 9.2, price: 13.0, discount: 0, total: 119.6 },
          { no: 6, name: "Süper Mat Kapuçino G569_1 ES SM 228", code: "ES SM 228", unit: "metr", quantity: 1.8, price: 16.0, discount: 0, total: 28.8 },
          { no: 7, name: "Soft Touch İnci Gri G455 ERSA 516", code: "ERSA 516", unit: "metr", quantity: 12.2, price: 16.0, discount: 0, total: 195.2 },
          { no: 8, name: "Wenge G19 C1442", code: "C1442", unit: "metr", quantity: 3.05, price: 12.0, discount: 0, total: 36.6 },
          { no: 9, name: "Soft Pink Panter Folyolu C1874", code: "C1874", unit: "metr", quantity: 0.8, price: 15.0, discount: 0, total: 12.0 },
        ],
        status: "draft",
        createdAt: "2026-10-31T09:00:00.000Z",
      },
    ];
  });
  const [syncStatus, setSyncStatus] = useState<"loading" | "saved" | "saving" | "offline" | "conflict">("loading");
  const syncRevisionRef = useRef<number | null>(null);
  const syncReadyRef = useRef(false);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [selectedCrmCustomer, setSelectedCrmCustomer] = useState<string | null>(null);
  const [externalInvoiceCustomer, setExternalInvoiceCustomer] = useState<string | null>(null);
  const [externalEditingInvoice, setExternalEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [reconciliationQuery, setReconciliationQuery] = useState("");
  const [compactPanel, setCompactPanel] = useState<"operations" | "summary">("operations");
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    const saved = Number(localStorage.getItem("arix-daily-split-ratio"));
    return Number.isFinite(saved) && saved >= 28 && saved <= 74 ? saved : 58;
  });
  const [focusMode, setFocusMode] = useState<"split" | "operations" | "summary">("split");
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const bookLayoutRef = useRef<HTMLElement | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [kind, setKind] = useState<EntryKind>("income");
  const [draft, setDraft] = useState<EntryDraft>({
    amount: "",
    person: DEFAULT_PEOPLE[1] ?? "Eşqin",
    channel: DEFAULT_CHANNELS[0] ?? "Kassa",
    targetPerson: DEFAULT_PEOPLE[1] ?? "Eşqin",
    targetChannel: DEFAULT_CHANNELS[1] ?? "Kapital Bank",
    counterparty: "",
    category: "",
    note: "",
  });

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("arix-daily-theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("arix-daily-sidebar-collapsed", sidebarCollapsed ? "1" : "0"); }, [sidebarCollapsed]);
  useEffect(() => { localStorage.setItem("arix-daily-management-open", managementOpen ? "1" : "0"); }, [managementOpen]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => { localStorage.setItem("arix-daily-directory-people-v2", JSON.stringify(peopleList)); }, [peopleList]);
  useEffect(() => { localStorage.setItem("arix-daily-directory-cashboxes-v3", JSON.stringify(channelList)); }, [channelList]);
  useEffect(() => { localStorage.setItem("arix-daily-directory-categories", JSON.stringify(categoryList)); }, [categoryList]);
  useEffect(() => { localStorage.setItem("arix-daily-directory-customers-v1", JSON.stringify(customerList)); }, [customerList]);
  useEffect(() => { localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules)); }, [rules]);
  useEffect(() => { localStorage.setItem("arix-daily-customer-debts-v1", JSON.stringify(customerDebts)); }, [customerDebts]);
  useEffect(() => { localStorage.setItem("arix-daily-past-month-v1", JSON.stringify(pastMonthUninvoiced)); }, [pastMonthUninvoiced]);
  useEffect(() => { localStorage.setItem("arix-daily-invoices-v1", JSON.stringify(invoices)); }, [invoices]);

  useEffect(() => {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
    if (new URLSearchParams(window.location.search).get("panel") !== "summary") return;
    const frame = window.requestAnimationFrame(() => {
      const layout = bookLayoutRef.current;
      if (layout) layout.scrollLeft = layout.scrollWidth;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (view !== "daily") return;

    const updateMobileLedgerHeight = () => {
      const layout = bookLayoutRef.current;
      const mobileNav = document.querySelector<HTMLElement>(".sidebar");
      if (!layout || !mobileNav || window.innerWidth > 760) {
        layout?.style.removeProperty("--mobile-ledger-height");
        return;
      }

      const available = Math.floor(mobileNav.getBoundingClientRect().top - layout.getBoundingClientRect().top - 8);
      if (available > 240) layout.style.setProperty("--mobile-ledger-height", `${available}px`);
    };

    const frame = window.requestAnimationFrame(updateMobileLedgerHeight);
    const delayed = window.setTimeout(updateMobileLedgerHeight, 250);
    const observer = new ResizeObserver(updateMobileLedgerHeight);
    const summary = document.querySelector<HTMLElement>(".summary-grid");
    if (summary) observer.observe(summary);
    const viewport = window.visualViewport;
    window.addEventListener("resize", updateMobileLedgerHeight);
    viewport?.addEventListener("resize", updateMobileLedgerHeight);
    void document.fonts?.ready.then(updateMobileLedgerHeight);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayed);
      observer.disconnect();
      window.removeEventListener("resize", updateMobileLedgerHeight);
      viewport?.removeEventListener("resize", updateMobileLedgerHeight);
    };
  }, [view, selectedDate]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/daily", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Daily API ${response.status}`);
        return response.json() as Promise<DailyApiResponse>;
      })
      .then((payload) => {
        if (cancelled) return;
        if (payload.data) {
          const remote = payload.data;
          setState(migrateManualAccountIds(remote.state));
          setPeopleList(remote.peopleList);
          setChannelList(remote.channelList);
          setCategoryList(remote.categoryList);
          setCustomerList(remote.customerList);
          setRules({ ...DEFAULT_RULES, ...remote.rules });
          setCustomerDebts(remote.customerDebts);
          setPastMonthUninvoiced(remote.pastMonthUninvoiced);
          setInvoices(remote.invoices);
        }
        syncRevisionRef.current = payload.revision;
        syncReadyRef.current = true;
        setSyncStatus("saved");
      })
      .catch(() => {
        if (cancelled) return;
        syncReadyRef.current = false;
        setSyncStatus("offline");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadNotifications = () => void fetch("/api/daily/notifications", { credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((payload: { data?: DailyNotification[] }) => { if (!cancelled) setNotifications(payload.data || []); })
      .catch(() => undefined);
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const markNotificationRead = async (notification: DailyNotification) => {
    if (notification.readAt) return;
    await fetch(`/api/daily/notifications/${notification.id}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
  };

  useEffect(() => {
    if (!syncReadyRef.current || syncRevisionRef.current == null) return;
    const snapshot: DailySnapshot = {
      version: 1,
      state,
      peopleList,
      channelList,
      categoryList,
      customerList,
      rules,
      customerDebts,
      pastMonthUninvoiced,
      invoices,
    };
    const timer = window.setTimeout(() => {
      syncQueueRef.current = syncQueueRef.current.then(async () => {
        const baseRevision = syncRevisionRef.current;
        if (baseRevision == null) return;
        setSyncStatus("saving");
        try {
          const response = await fetch("/api/daily", {
            method: "PUT",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ baseRevision, snapshot }),
          });
          if (response.status === 409) {
            setSyncStatus("conflict");
            syncReadyRef.current = false;
            return;
          }
          if (!response.ok) throw new Error(`Daily API ${response.status}`);
          const payload = await response.json() as DailyApiResponse;
          syncRevisionRef.current = payload.revision;
          setSyncStatus("saved");
        } catch {
          setSyncStatus("offline");
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state, peopleList, channelList, categoryList, customerList, rules, customerDebts, pastMonthUninvoiced, invoices]);

  const toggleEntryInvoiced = (entryId: string) => {
    setState((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.id === entryId ? { ...entry, invoiced: !entry.invoiced } : entry
      ),
    }));
  };

  const confirmInvoice = (record: InvoiceRecord) => {
    if (!can("daily.invoices.manage")) return;
    // Handle draft save/update without changing ledger or debt
    if (record.status === "draft") {
      setInvoices((current) => {
        const existingIdx = current.findIndex(
          (inv) =>
            inv.id === record.id ||
            (inv.status === "draft" &&
              inv.invoiceNo === record.invoiceNo &&
              inv.customer.toLocaleLowerCase("az-AZ") === record.customer.toLocaleLowerCase("az-AZ"))
        );
        if (existingIdx >= 0) {
          const next = [...current];
          next[existingIdx] = { ...current[existingIdx], ...record, id: current[existingIdx].id };
          return next;
        }
        return [record, ...current];
      });
      return;
    }

    const existingActive = invoices.find(
      (inv) =>
        inv.status === "active" &&
        (inv.id === record.id ||
          (inv.invoiceNo === record.invoiceNo &&
            inv.customer.toLocaleLowerCase("az-AZ") === record.customer.toLocaleLowerCase("az-AZ")))
    );

    if (existingActive) {
      const previousDocumentImpact =
        existingActive.salesAmount - existingActive.returnAmount - existingActive.purchaseAmount;
      const updatedDocumentImpact = record.salesAmount - record.returnAmount - record.purchaseAmount;
      const impactDifference = updatedDocumentImpact - previousDocumentImpact;
      const currentCustomerDebt = customerDebts[record.customer] ?? existingActive.finalDebt;
      const updatedCustomerDebt = Math.round((currentCustomerDebt + impactDifference) * 100) / 100;
      const updatedFinalDebt = Math.round((existingActive.finalDebt + impactDifference) * 100) / 100;
      const updatedRecord: InvoiceRecord = {
        ...existingActive,
        ...record,
        id: existingActive.id,
        status: "active",
        previousDebtSnapshot: existingActive.previousDebtSnapshot,
        previousPastMonthSnapshot: existingActive.previousPastMonthSnapshot,
        paymentDeducted: existingActive.paymentDeducted,
        currentMonthDeducted: existingActive.currentMonthDeducted,
        pastMonthDeducted: existingActive.pastMonthDeducted,
        linkedEntryIds: existingActive.linkedEntryIds,
        linkedEntriesSummary: existingActive.linkedEntriesSummary,
        finalDebt: updatedFinalDebt,
      };
      setCustomerDebts((current) => ({
        ...current,
        [record.customer]: updatedCustomerDebt,
      }));
      setInvoices((current) =>
        current.map((inv) => (inv.id === existingActive.id ? updatedRecord : inv))
      );
      return;
    }

    const idSet = new Set(record.linkedEntryIds);
    setState((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        idSet.has(entry.id)
          ? { ...entry, invoiced: true, invoiceNo: record.invoiceNo }
          : entry
      ),
    }));
    setCustomerDebts((current) => ({
      ...current,
      [record.customer]: record.finalDebt,
    }));
    if (record.pastMonthDeducted > 0) {
      setPastMonthUninvoiced((current) => ({
        ...current,
        [record.customer]: 0,
      }));
    }
    setInvoices((current) => {
      const existingDraftIdx = current.findIndex((inv) => inv.id === record.id && inv.status === "draft");
      if (existingDraftIdx >= 0) {
        const next = [...current];
        next[existingDraftIdx] = record;
        return next;
      }
      return [record, ...current];
    });
  };

  const approveInvoice = (invoiceId: string) => {
    if (!can("daily.invoices.approve")) return;
    const target = invoices.find((inv) => inv.id === invoiceId);
    if (!target || target.status !== "draft") return;

    const currentDebt = customerDebts[target.customer] ?? target.previousDebtSnapshot;
    const pastMonthPending = pastMonthUninvoiced[target.customer] ?? target.previousPastMonthSnapshot;
    const pendingEntries = state.entries.filter(
      (e) =>
        e.kind === "income" &&
        !e.invoiced &&
        e.counterparty.trim().toLocaleLowerCase("az-AZ") === target.customer.trim().toLocaleLowerCase("az-AZ")
    );
    const currentMonthPending = pendingEntries.reduce((sum, e) => sum + Math.abs(e.amount), 0);
    const totalPaymentDeducted = Math.round((currentMonthPending + pastMonthPending) * 100) / 100;
    const finalDebt =
      Math.round(
        (currentDebt +
          target.salesAmount -
          target.returnAmount -
          target.purchaseAmount -
          totalPaymentDeducted) *
          100
      ) / 100;

    const linkedEntryIds = pendingEntries.map((e) => e.id);
    const linkedEntriesSummary = pendingEntries.map((e) => ({
      id: e.id,
      date: e.date,
      amount: Math.abs(e.amount),
      channel: e.bank?.trim() || "Kassa",
      responsible: e.responsible?.trim() || "Eşqin",
    }));

    const idSet = new Set(linkedEntryIds);
    setState((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        idSet.has(entry.id)
          ? { ...entry, invoiced: true, invoiceNo: target.invoiceNo }
          : entry
      ),
    }));
    setCustomerDebts((current) => ({
      ...current,
      [target.customer]: finalDebt,
    }));
    if (pastMonthPending > 0) {
      setPastMonthUninvoiced((current) => ({
        ...current,
        [target.customer]: 0,
      }));
    }
    const nowIso = new Date().toISOString();
    setInvoices((current) =>
      current.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              status: "active",
              previousDebtSnapshot: currentDebt,
              previousPastMonthSnapshot: pastMonthPending,
              paymentDeducted: totalPaymentDeducted,
              currentMonthDeducted: currentMonthPending,
              pastMonthDeducted: pastMonthPending,
              finalDebt,
              linkedEntryIds,
              linkedEntriesSummary,
              approvedBy: "Arif Mahmud",
              approvedAt: nowIso,
            }
          : inv
      )
    );
  };

  const cancelInvoice = (invoiceId: string) => {
    if (!can("daily.invoices.approve")) return;
    const target = invoices.find((inv) => inv.id === invoiceId);
    if (!target || target.status === "cancelled") return;
    if (target.status === "active") {
      const idSet = new Set(target.linkedEntryIds);
      setState((current) => ({
        ...current,
        entries: current.entries.map((entry) =>
          idSet.has(entry.id)
            ? { ...entry, invoiced: false, invoiceNo: undefined }
            : entry
        ),
      }));
      const invoiceImpact =
        target.salesAmount -
        target.returnAmount -
        target.purchaseAmount -
        target.paymentDeducted;
      setCustomerDebts((current) => ({
        ...current,
        [target.customer]: Math.round(((current[target.customer] ?? target.finalDebt) - invoiceImpact) * 100) / 100,
      }));
      setPastMonthUninvoiced((current) => ({
        ...current,
        [target.customer]: Math.round(((current[target.customer] ?? 0) + target.previousPastMonthSnapshot) * 100) / 100,
      }));
    }
    setInvoices((current) =>
      current.map((inv) =>
        inv.id === invoiceId
          ? { ...inv, status: "cancelled", cancelledAt: new Date().toISOString() }
          : inv
      )
    );
  };

  const addNewCustomer = (name: string, initialDebt: number) => {
    const clean = name.trim();
    if (!clean) return;
    setCustomerList((current) =>
      current.some((c) => c.toLocaleLowerCase("az-AZ") === clean.toLocaleLowerCase("az-AZ"))
        ? current
        : [clean, ...current]
    );
    setCustomerDebts((current) => ({
      ...current,
      [clean]: initialDebt,
    }));
  };

  const updateCustomerDebt = (customer: string, newDebt: number) => {
    setCustomerDebts((current) => ({
      ...current,
      [customer]: newDebt,
    }));
  };

  const resetAllInvoices = () => {
    const initialInvoicedById = new Map<string, boolean>(
      IMPORTED_ENTRIES.map((item) => [String(item.id), Boolean((item as { invoiced?: boolean }).invoiced)])
    );
    setState((current) => ({
      ...current,
      entries: current.entries.map((entry) => ({
        ...entry,
        invoiced: initialInvoicedById.get(entry.id) ?? false,
        invoiceNo: undefined,
      })),
    }));
    setCustomerDebts({ ...IMPORTED_CUSTOMER_DEBTS });
    setPastMonthUninvoiced({ ...IMPORTED_PAST_MONTH_UNINVOICED });
    setInvoices([]);
    localStorage.removeItem("arix-daily-customer-debts-v1");
    localStorage.removeItem("arix-daily-past-month-v1");
    localStorage.removeItem("arix-daily-invoices-v1");
  };

  const isAutoSupplierCollector = (name: string) => {
    if (!rules.autoSupplierEnabled) return false;
    const clean = name.trim().toLocaleLowerCase("az-AZ");
    return rules.autoSupplierAccounts.some((acc) => acc.trim().toLocaleLowerCase("az-AZ") === clean);
  };
  useEffect(() => { localStorage.setItem("arix-daily-split-ratio", String(Math.round(splitRatio))); }, [splitRatio]);

  const startSplitDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    const container = bookLayoutRef.current;
    if (!container) return;
    setFocusMode("split");
    setIsDraggingSplit(true);
    const onMove = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(74, Math.max(28, Math.round(pct)));
      setSplitRatio(clamped);
    };
    const onUp = () => {
      setIsDraggingSplit(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const closeRecord = state.closes.find((record) => record.date === selectedDate);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(selectedDate, index - 3)), [selectedDate]);
  const dayEntries = useMemo(() => state.entries
    .filter((entry) => entry.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time)), [selectedDate, state.entries]);
  const accountCatalog = useMemo(() => {
    const accounts = new Map(ACCOUNTS.map((account) => [account.id, account]));
    for (const entry of state.entries) {
      if (entry.id.startsWith("sheet-")) continue;
      const source = findAccountForPersonChannel(resolveEntryPerson(entry), resolveEntryChannel(entry));
      accounts.set(source.id, source);
      if (entry.kind === "transfer") {
        const target = findAccountForPersonChannel(entry.targetResponsible || entry.responsible || "Eşqin", entry.targetBank || "Kassa");
        accounts.set(target.id, target);
      }
    }
    return [...accounts.values()];
  }, [state.entries]);

  const balanceAt = (account: Account, endDate: string, beforeDay = false) => {
    if (isAutoSupplierCollector(account.name)) return 0;
    const cutoff = beforeDay ? shiftDate(endDate, -1) : endDate;
    const snapshotDate = Object.keys(RECONCILIATION_BY_DATE)
      .filter((key) => key <= cutoff && RECONCILIATION_BY_DATE[key].some(([name]) => name === account.name))
      .sort((a, b) => b.localeCompare(a))[0];
    const snapshot = snapshotDate ? RECONCILIATION_BY_DATE[snapshotDate].find(([name]) => name === account.name) : undefined;
    const base = snapshot ? snapshot[1] + snapshot[2] - snapshot[3] - snapshot[4] : account.opening;
    const after = snapshotDate ?? "0000-00-00";
    return state.entries.reduce((total, entry) => {
      const inRange = !entry.id.startsWith("sheet-") && entry.date > after && entry.date <= cutoff;
      if (!inRange) return total;
      const amt = Math.abs(entry.amount);
      if (entry.kind === "income" && entry.accountId === account.id) return total + amt;
      if (entry.kind === "expense" && entry.accountId === account.id) return total - amt;
      if (entry.kind === "transfer" && entry.accountId === account.id) return total - amt;
      if (entry.kind === "transfer" && entry.targetAccountId === account.id) return total + amt;
      return total;
    }, base);
  };

  const reconciliationRows = useMemo<ReconciliationRow[]>(() => {
    const baseSnapshot = (RECONCILIATION_BY_DATE[selectedDate] ?? []) as ReconciliationRow[];
    const manualToday = dayEntries.filter((entry) => !entry.id.startsWith("sheet-"));
    const manualBefore = state.entries.filter((entry) => !entry.id.startsWith("sheet-") && entry.date < selectedDate);

    const pairAccounts = accountCatalog.filter((account) => account.id.startsWith("pair:"));
    const baseRows: Array<[string, number, number, number, number]> = baseSnapshot.length
      ? [
          ...baseSnapshot.map(([name, rec, prev, exp, sup]) => [name, rec, prev, exp, sup] as [string, number, number, number, number]),
          ...pairAccounts.map((account) => [account.name, 0, balanceAt(account, selectedDate, true), 0, 0] as [string, number, number, number, number]),
        ]
      : accountCatalog.map((acc) => [acc.name, 0, balanceAt(acc, selectedDate, true), 0, 0]);

    return baseRows.map(([name, baseRec, basePrev, baseExp, baseSup]) => {
      const account = accountCatalog.find((acc) => acc.name === name);
      if (!account) return [name, baseRec, basePrev, baseExp, baseSup] as const;

      const autoCollector = isAutoSupplierCollector(name);
      const prevDelta = !autoCollector && baseSnapshot.length
        ? manualBefore.reduce((delta, entry) => {
            const amt = Math.abs(entry.amount);
            if (entry.kind === "income" && entry.accountId === account.id) return delta + amt;
            if (entry.kind === "expense" && entry.accountId === account.id) return delta - amt;
            if (entry.kind === "transfer" && entry.accountId === account.id) return delta - amt;
            if (entry.kind === "transfer" && entry.targetAccountId === account.id) return delta + amt;
            return delta;
          }, 0)
        : 0;

      let rec = baseRec;
      let exp = baseExp;
      let sup = baseSup;
      for (const entry of manualToday) {
        const amt = Math.abs(entry.amount);
        const isSupplier = entry.category.toLocaleLowerCase("az-AZ").includes("təch");
        if (entry.kind === "income" && entry.accountId === account.id) rec += amt;
        if (entry.kind === "transfer" && entry.targetAccountId === account.id) rec += amt;
        if (entry.kind === "transfer" && entry.accountId === account.id) {
          if (rules.internalTransferMode === "net_received") rec -= amt;
          else exp += amt;
        }
        if (entry.kind === "expense" && entry.accountId === account.id) {
          if (isSupplier) sup += amt;
          else exp += amt;
        }
      }
      // Sheet rule (X7:X12): Selected Kassa accounts automatically transfer (Vəsait qəbulu - Xərc) to Təchizatçıya ödəniş so Cari qalıq = 0
      if (autoCollector) {
        sup = Math.max(0, rec - exp);
        return [name, rec, 0, exp, sup] as const;
      }
      // If user disabled auto-TÖ on an account that had auto-TÖ in the static snapshot (Emil, Xəqan, T1..T4), restore manual supplier payments only
      const wasDefaultAuto = /^(Emil|Xəqan|T1|T2|T3|T4)$/i.test(name.trim());
      if (wasDefaultAuto && !autoCollector) {
        const explicitSup = dayEntries
          .filter((e) => e.kind === "expense" && e.accountId === account.id && e.category.toLocaleLowerCase("az-AZ").includes("təch"))
          .reduce((s, e) => s + Math.abs(e.amount), 0);
        return [name, rec, basePrev + prevDelta, exp, explicitSup] as const;
      }
      return [name, rec, basePrev + prevDelta, exp, sup] as const;
    });
  }, [selectedDate, dayEntries, state.entries, rules, accountCatalog]);

  const daySummary = useMemo(() => {
    return reconciliationRows.reduce((totals, [, received, previous, expense, supplier]) => ({
      income: totals.income + received,
      expense: totals.expense + expense + supplier,
      opening: totals.opening + previous,
      expected: totals.expected + received + previous - expense - supplier,
    }), { income: 0, expense: 0, opening: 0, expected: 0 });
  }, [reconciliationRows]);

  const reconciliationTotals = reconciliationRows.reduce((totals, [, received, previous, expense, supplier]) => ({
    received: totals.received + received,
    previous: totals.previous + previous,
    expense: totals.expense + expense,
    supplier: totals.supplier + supplier,
  }), { received: 0, previous: 0, expense: 0, supplier: 0 });
  const visibleReconciliationRows = reconciliationRows.filter(([name, received, previous, expense, supplier]) => {
    const queryNorm = reconciliationQuery.trim().toLocaleLowerCase("az-AZ");
    if (!queryNorm && rules.hideZeroPlaceholderCards && isPlaceholderCard(name) && received === 0 && previous === 0 && expense === 0 && supplier === 0) {
      return false;
    }
    if (!queryNorm) return true;
    const cleanName = normalizePersonName(name);
    const channelLabel = /^K\./i.test(name) ? "Kart / Bank" : "Kassa";
    return `${name} ${cleanName} ${channelLabel}`.toLocaleLowerCase("az-AZ").includes(queryNorm);
  });

  const visibleEntries = dayEntries.filter((entry) => {
    const normalized = query.trim().toLocaleLowerCase("az-AZ");
    const account = accountCatalog.find((item) => item.id === entry.accountId);
    const personLabel = resolveEntryPerson(entry, account);
    const channelLabel = resolveEntryChannel(entry, account);
    const matchesQuery = !normalized || `${entry.title} ${entry.counterparty} ${entry.category} ${personLabel} ${channelLabel} ${entry.responsible ?? ""} ${entry.bank ?? ""} ${entry.note ?? ""}`.toLocaleLowerCase("az-AZ").includes(normalized);
    const matchesAccount = !accountFilter || entry.accountId === accountFilter || entry.targetAccountId === accountFilter;
    return matchesQuery && matchesAccount;
  });

  const openEntry = (nextKind: EntryKind) => {
    if (closeRecord) return;
    setKind(nextKind);
    const defaultPerson = peopleList.find((p) => p !== "Ümumi") ?? peopleList[0] ?? "Eşqin";
    const defaultChannel = channelList[0] ?? "Kassa";
    const secondChannel = channelList.find((c) => c !== defaultChannel) ?? defaultChannel;
    setDraft({
      amount: "",
      person: defaultPerson,
      channel: defaultChannel,
      targetPerson: defaultPerson,
      targetChannel: secondChannel,
      counterparty: "",
      category: nextKind === "income" ? (categoryList[0] ?? "Vəsait qəbulu") : (categoryList[1] ?? "Ödəniş"),
      note: "",
    });
    setEntryOpen(true);
  };

  const saveEntry = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(draft.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || !draft.person || !draft.channel) return;
    const sourceAccount = findAccountForPersonChannel(draft.person, draft.channel);
    const targetAccount = kind === "transfer" ? findAccountForPersonChannel(draft.targetPerson, draft.targetChannel) : undefined;
    const title = kind === "transfer"
      ? `${draft.person} (${draft.channel}) → ${draft.targetPerson} (${draft.targetChannel})`
      : kind === "income"
        ? "Mədaxil"
        : "Məxaric";
    const entry: Entry = {
      id: crypto.randomUUID(),
      date: selectedDate,
      time: timeNow(),
      kind,
      title,
      counterparty: kind === "transfer" ? `${draft.targetPerson} · ${draft.targetChannel}` : draft.counterparty.trim() || "Qeyd edilməyib",
      category: kind === "transfer" ? "Hesablararası köçürmə" : draft.category.trim() || (kind === "income" ? "Vəsait qəbulu" : "Digər xərc"),
      amount: kind === "expense" ? -Math.abs(amount) : Math.abs(amount),
      accountId: sourceAccount.id,
      targetAccountId: kind === "transfer" ? targetAccount?.id : undefined,
      responsible: draft.person.trim(),
      targetResponsible: kind === "transfer" ? draft.targetPerson.trim() : undefined,
      bank: draft.channel.trim(),
      targetBank: kind === "transfer" ? draft.targetChannel.trim() : undefined,
      note: draft.note.trim(),
      invoiced: false,
    };
    setState((current) => ({ ...current, entries: [...current.entries, entry] }));
    setEntryOpen(false);
  };

  const quickActions = [
    { kind: "income" as const, label: "Mədaxil", Icon: ArrowDownLeft },
    { kind: "expense" as const, label: "Məxaric", Icon: ArrowUpRight },
    { kind: "transfer" as const, label: "Köçürmə", Icon: ArrowLeftRight },
  ];

  const dayMetrics = useMemo<DayMetric>(() => {
    const baseMetric = DAY_METRICS_BY_DATE[selectedDate];
    const esqinRow = reconciliationRows.find(([name]) => name === "Eşqin");
    const kassa = esqinRow ? esqinRow[1] - esqinRow[3] : baseMetric?.kassa ?? 0;
    const kartTo = -reconciliationRows
      .filter(([name]) => /^K\./i.test(name) || /^Kart/i.test(name))
      .reduce((sum, [, , , , sup]) => sum + sup, 0);
    const cloudshop = reconciliationTotals.received - reconciliationTotals.expense;
    return {
      kassa,
      kartTo,
      cloudshop,
      note: baseMetric?.note ?? "",
    };
  }, [selectedDate, reconciliationRows, reconciliationTotals]);
  const hasDayMetrics = Boolean(
    rules.showDayCheckMetrics &&
      dayMetrics &&
      (dayMetrics.kassa !== 0 || dayMetrics.kartTo !== 0 || dayMetrics.cloudshop !== 0 || dayMetrics.note?.trim())
  );

  const can = (permission: string) => session.role.toLocaleLowerCase("az") === "sahib" || Boolean(session.permissions?.includes(permission));
  const canManageSystem = can("daily.users.manage") || can("daily.notifications.manage");
  const managementActive = view === "cashboxes" || view === "categories" || view === "people" || view === "customers" || view === "settings" || view === "management";
  const navIconSize = sidebarCollapsed ? 22 : 19;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <AriXLogo className="arix-logo" />
          <b>AriX Daily</b>
        </div>
        <div className="topbar-actions">
          <div className="topbar-menu-wrap">
            <button className="topbar-option" onClick={() => setTopMenu(topMenu === "language" ? null : "language")}>
              <Globe2 size={18} />
              <span className="hide-xs">Azərbaycanca</span>
              <span className="show-xs">AZ</span>
              <ChevronDown size={14} className={topMenu === "language" ? "rotated" : ""} />
            </button>
            {topMenu === "language" && (
              <div className="top-popover language-popover">
                <button className="lang-item active" onClick={() => setTopMenu(null)}>
                  <span className="lang-badge">AZ</span>
                  <strong>Azərbaycanca</strong>
                  <Check size={15} />
                </button>
                <small>Türk və ingilis dili sonrakı mərhələdə əlavə olunacaq.</small>
              </div>
            )}
          </div>
          <button className="topbar-option theme-option" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Mövzunu dəyiş">
            {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
            <span>{theme === "dark" ? "Dark" : "Light"}</span>
          </button>
          <div className="topbar-menu-wrap">
            <button className="icon-button notification-button" aria-label="Bildirişlər" onClick={() => setTopMenu(topMenu === "notifications" ? null : "notifications")}>
              <Bell size={18} />
              {notifications.some((item) => !item.readAt) && <i />}
            </button>
            {topMenu === "notifications" && (
              <div className="top-popover notification-popover">
                <div className="notification-popover-head"><b>Bildirişlər</b><small>{notifications.filter((item) => !item.readAt).length} oxunmamış</small></div>
                {notifications.slice(0, 5).map((notification) => <button type="button" key={notification.id} className={cx("notification-item", !notification.readAt && "unread")} onClick={() => void markNotificationRead(notification)}>
                  <Bell size={15} />
                  <span><strong>{notification.title}</strong><small>{notification.message}</small><time>{new Date(notification.createdAt).toLocaleString("az-AZ")}</time></span>
                </button>)}
                {notifications.length === 0 && <div className="notification-empty">Yeni bildiriş yoxdur.</div>}
                <article>
                  {syncStatus === "saved" ? <Check size={16} /> : syncStatus === "conflict" ? <X size={16} /> : <ArrowLeftRight size={16} />}
                  <span>
                    <strong>{syncStatus === "saved" ? "Sunucuda saxlanıldı" : syncStatus === "saving" ? "Saxlanılır" : syncStatus === "conflict" ? "Senkronizasiya toqquşması" : syncStatus === "offline" ? "Yalnız bu cihazda" : "Sunucuya bağlanılır"}</strong>
                    <small>{syncStatus === "conflict" ? "Başqa cihazdakı yeni məlumatı silməmək üçün avtomatik qeyd dayandırıldı." : syncStatus === "offline" ? "Bağlantı bərpa ediləndə səhifəni yeniləyin." : "Daily məlumatları ayrıca SQLite bazasında qorunur."}</small>
                  </span>
                </article>
                {canManageSystem && <button className="notification-manage-link" onClick={() => { setView("management"); setTopMenu(null); }}><ShieldCheck size={15} /> Bildirişləri idarə et</button>}
              </div>
            )}
          </div>
          <div className="topbar-menu-wrap">
            <button className="top-profile" onClick={() => setTopMenu(topMenu === "profile" ? null : "profile")}>
              <span className="profile-avatar">{session.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
              <b>
                {session.name}
                <small>{session.role}</small>
              </b>
              <ChevronDown size={15} className={topMenu === "profile" ? "rotated" : ""} />
            </button>
            {topMenu === "profile" && (
              <div className="top-popover profile-popover">
                <div className="profile-card">
                  <span className="profile-avatar lg">{session.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
                  <div>
                    <b>{session.name}</b>
                    {session.email && <small>{session.email}</small>}
                    <small>{session.role}</small>
                  </div>
                </div>
                <button className="profile-action" onClick={() => { setView("settings"); setTopMenu(null); }}>
                  <Settings size={15} />
                  <span>Tənzimləmələr</span>
                </button>
                <button className="profile-action" onClick={() => void onLogout()}>
                  <LockKeyhole size={15} />
                  <span>Çıxış et</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={cx("workspace", sidebarCollapsed && "sidebar-collapsed")}>
        <aside className="sidebar-shell">
          <div className="sidebar">
            <nav className="sidebar-nav">
              <button
                className="sidebar-primary"
                title={sidebarCollapsed ? "Yeni əməliyyat" : undefined}
                onClick={() => openEntry("income")}
                disabled={Boolean(closeRecord) || !can("daily.entries.create")}
              >
                <Plus size={sidebarCollapsed ? 22 : 19} />
                <span>Yeni əməliyyat</span>
              </button>
              <ViewTabs view={view} onChange={setView} onCreate={() => openEntry("income")} createDisabled={Boolean(closeRecord) || !can("daily.entries.create")} collapsed={sidebarCollapsed} />
              <div className="sidebar-group">
                <button
                  type="button"
                  className={cx("sidebar-parent", managementActive && "active")}
                  title={sidebarCollapsed ? "Şirkət və sorğu" : undefined}
                  onClick={() => setManagementOpen((v) => !v)}
                  aria-expanded={managementOpen}
                >
                  <Settings size={navIconSize} />
                  <span>İdarəetmə</span>
                  <ChevronDown size={15} className={cx("parent-chevron", managementOpen && "rotated")} />
                </button>
                {managementOpen && (
                  <div className="sidebar-subitems">
                    {can("daily.directories.manage") && <button className={view === "cashboxes" ? "active" : ""} title={sidebarCollapsed ? "Hesab və kanallar" : undefined} onClick={() => setView("cashboxes")}><Landmark size={16} /><span>Hesab və kanallar</span></button>}
                    {can("daily.directories.manage") && <button className={view === "people" ? "active" : ""} title={sidebarCollapsed ? "Şəxslər" : undefined} onClick={() => setView("people")}><Users size={16} /><span>Şəxslər</span></button>}
                    <button className={view === "customers" ? "active" : ""} title={sidebarCollapsed ? "Müştərilər (Baza)" : undefined} onClick={() => setView("customers")}><LayoutDashboard size={16} /><span>Müştərilər</span></button>
                    {can("daily.directories.manage") && <button className={view === "categories" ? "active" : ""} title={sidebarCollapsed ? "Kateqoriyalar" : undefined} onClick={() => setView("categories")}><Tags size={16} /><span>Kateqoriyalar</span></button>}
                    {can("daily.settings.manage") && <button className={view === "settings" ? "active" : ""} title={sidebarCollapsed ? "Tənzimləmələr" : undefined} onClick={() => setView("settings")}><Settings size={16} /><span>Tənzimləmələr</span></button>}
                    {canManageSystem && <button className={view === "management" ? "active" : ""} title={sidebarCollapsed ? "İstifadəçilər və bildirişlər" : undefined} onClick={() => setView("management")}><ShieldCheck size={16} /><span>İstifadəçilər və bildirişlər</span></button>}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="sidebar-collapse"
                title={sidebarCollapsed ? "Menyunu genişləndir" : "Menyunu daralt"}
                onClick={() => setSidebarCollapsed((value) => !value)}
              >
                <PanelIcon size={sidebarCollapsed ? 22 : 19} />
                <span>Daralt</span>
              </button>
            </nav>
          </div>
        </aside>
        <main>
          {view === "daily" && <>
            {closeRecord && <div className="closed-banner"><LockKeyhole size={18} /><div><b>Bu gün bağlanıb</b><span>{new Date(closeRecord.closedAt).toLocaleString("az-AZ")} tarixində təsdiqlənib.</span></div></div>}

            <section className="date-strip date-strip-primary" aria-label="Tarix seçimi">
              <button className="date-arrow" onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} aria-label="Əvvəlki gün"><ChevronLeft size={18} /></button>
              <div className="date-list">{dates.map((key, index) => {
                const distance = Math.abs(index - 3);
                return <button key={key} className={cx(key === selectedDate && "selected", key === todayKey && "today", `date-distance-${distance}`)} onClick={() => { setSelectedDate(key); setAccountFilter(null); }}><small>{key === selectedDate ? "SEÇİLMİŞ GÜN" : key === todayKey ? "BU GÜN" : dateLabel(key, { weekday: "short" })}</small><b>{dateLabel(key, { day: "numeric" })} {dateLabel(key, { month: "short" })}</b><span>{dateLabel(key, { weekday: "short" })}</span></button>;
              })}</div>
              <button className="date-arrow" onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} aria-label="Növbəti gün"><ChevronRight size={18} /></button>
            </section>

            <section className="summary-grid">
              <article><i><WalletCards size={22} /></i><div><span>Günün əvvəli</span><b>{formatMoney(daySummary.opening, "AZN")}</b><small>AZN hesabları</small></div></article>
              <article className="income"><i><ArrowDownLeft size={22} /></i><div><span>Ümumi mədaxil</span><b>+{formatMoney(daySummary.income, "AZN")}</b><small>{dayEntries.filter((entry) => entry.kind === "income").length} əməliyyat</small></div></article>
              <article className="expense"><i><ArrowUpRight size={22} /></i><div><span>Ümumi məxaric</span><b>−{formatMoney(daySummary.expense, "AZN")}</b><small>{dayEntries.filter((entry) => entry.kind === "expense").length} əməliyyat</small></div></article>
              <article className="expected"><i><CircleDollarSign size={22} /></i><div><span>Günün sonu qalığı</span><b>{formatMoney(daySummary.expected, "AZN")}</b><small>Köçürmələr yekunu dəyişmir</small></div></article>
            </section>

            <nav className="compact-panel-switch" aria-label="Gündəlik panel keçidi">
              <button onClick={() => setCompactPanel("operations")} disabled={compactPanel === "operations"} aria-label="Günün əməliyyatlarına keç"><ChevronLeft size={18} /></button>
              <div><small>{compactPanel === "operations" ? "1 / 2" : "2 / 2"}</small><b>{compactPanel === "operations" ? "Günün əməliyyatları" : "Hesab xülasəsi"}</b></div>
              <button onClick={() => setCompactPanel("summary")} disabled={compactPanel === "summary"} aria-label="Hesab xülasəsinə keç"><ChevronRight size={18} /></button>
            </nav>
            <section
              ref={bookLayoutRef}
              className={cx(
                "daily-book-layout",
                `compact-${compactPanel}`,
                `focus-${focusMode}`,
                isDraggingSplit && "is-resizing",
              )}
              style={{
                "--left-panel-fr": `${splitRatio}fr`,
                "--right-panel-fr": `${100 - splitRatio}fr`,
              } as React.CSSProperties}
            >
              <div className="ledger-panel operation-ledger">
                <div className="ledger-toolbar">
                  <div className="ledger-title">
                    <div>
                      <div className="panel-title-row"><h2>Günün əməliyyatları</h2><em>{visibleEntries.length} qeyd</em></div>
                      <small>Bütün mədaxil və məxariclər vaxt sırası ilə</small>
                    </div>
                  </div>
                  <div className="ledger-toolbar-actions">
                    <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Əməliyyatlarda axtar" /></label>
                    <button className="day-close-button" onClick={() => setCloseOpen(true)} disabled={Boolean(closeRecord) || !can("daily.day.close")}><LockKeyhole size={15} />{closeRecord ? "Gün bağlanıb" : "Günü bağla"}</button>
                    <button
                      type="button"
                      className={cx("panel-expand-btn", (focusMode === "operations" || splitRatio >= 68) && "active")}
                      title={focusMode === "operations" ? "İki panel görünüşünə qayıt" : splitRatio >= 68 ? "Tam ekran genişləndir (100%)" : "Günün əməliyyatlarını genişləndir (70% / 30%)"}
                      onClick={() => {
                        if (focusMode === "operations") {
                          setFocusMode("split");
                          setSplitRatio(58);
                        } else if (splitRatio >= 68) {
                          setFocusMode("operations");
                        } else {
                          setFocusMode("split");
                          setSplitRatio(70);
                        }
                      }}
                    >
                      {focusMode === "operations" ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </button>
                  </div>
                </div>
                <div className="quick-actions">{quickActions.map(({ kind: actionKind, label, Icon }) => <button key={actionKind} onClick={() => openEntry(actionKind)} disabled={Boolean(closeRecord) || !can("daily.entries.create")} className={actionKind}><Icon size={17} />{label}</button>)}</div>
                <div className="operation-head"><span>№</span><span>Saat</span><span>Məbləğ</span><span>Əməliyyat növü</span><span>Kateqoriya</span><span>Qarşı tərəf</span><span>Şəxs</span><span>Hesab / Kanal</span><span>Açıqlama</span></div>
                <div className="operation-list">{visibleEntries.length === 0 ? <div className="empty-state"><CalendarDays size={28} /><b>Bu gün əməliyyat yoxdur</b><span>Yeni mədaxil və ya məxaric əlavə edə bilərsiniz.</span></div> : visibleEntries.map((entry, index) => {
                  const account = accountCatalog.find((item) => item.id === entry.accountId) ?? ACCOUNTS[0];
                  const personLabel = entry.kind === "transfer" && entry.targetResponsible
                    ? `${resolveEntryPerson(entry, account)} → ${normalizePersonName(entry.targetResponsible)}`
                    : resolveEntryPerson(entry, account);
                  const channelLabel = entry.kind === "transfer" && entry.targetBank
                    ? `${resolveEntryChannel(entry, account)} → ${entry.targetBank}`
                    : resolveEntryChannel(entry, account);
                  return <article key={entry.id} className={`operation-row ${entry.kind}`}>
                    <div className="operation-mobile-content">
                      <div className="operation-mobile-column amount-column">
                        <strong>{formatMoney(entry.amount, account.currency)}</strong>
                        <span className={`mobile-kind ${entry.kind}`}>
                          {entry.kind === "income" ? <ArrowDownLeft size={11} /> : entry.kind === "expense" ? <ArrowUpRight size={11} /> : <ArrowLeftRight size={11} />}
                          {entry.kind === "income" ? "Mədaxil" : entry.kind === "expense" ? "Məxaric" : "Köçürmə"}
                        </span>
                      </div>
                      <div className="operation-mobile-column party-column">
                        <b>{entry.counterparty || "—"}</b>
                        <span>{entry.category || "—"}</span>
                      </div>
                      <div className="operation-mobile-column account-column">
                        <b>{personLabel}</b>
                        <span>{channelLabel}<time>{entry.time || "—"}</time></span>
                      </div>
                    </div>
                    <span className="operation-no">{index + 1}</span>
                    <span className="operation-time">{entry.time || "—"}</span>
                    <strong className="operation-amount">{formatMoney(entry.amount, account.currency)}</strong>
                    <span><i className={`kind-badge ${entry.kind}`}>{entry.kind === "income" ? <ArrowDownLeft size={13} /> : entry.kind === "expense" ? <ArrowUpRight size={13} /> : <ArrowLeftRight size={13} />}{entry.kind === "income" ? "Mədaxil" : entry.kind === "expense" ? "Məxaric" : "Köçürmə"}</i></span>
                    <span data-label="Kateqoriya" className="wrap-cell" title={entry.category}>{entry.category}</span>
                    <span data-label="Kontragent" className="operation-party wrap-cell" title={entry.counterparty}>{entry.counterparty}</span>
                    <span data-label="Şəxs" title={personLabel}>{personLabel}</span>
                    <span data-label="Hesab / Kanal" title={channelLabel}><i className={cx("channel-pill", channelLabel.toLocaleLowerCase("az-AZ") === "kassa" ? "cash" : "bank")}>{channelLabel}</i></span>
                    <span data-label="Şərh" className="wrap-cell" title={entry.note || ""}>{entry.note || "—"}</span>
                  </article>;
                })}</div>
              </div>

              <div
                className="panel-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Panellərin ölçüsünü dəyiş"
                title="Sürüşdürərək ölçünü dəyişin (İki dəfə kliklədikdə sıfırlanır)"
                onPointerDown={startSplitDrag}
                onDoubleClick={() => { setFocusMode("split"); setSplitRatio(58); }}
              >
                <div className="resizer-pill">
                  <button
                    type="button"
                    title="Hesab xülasəsini genişləndir (32% / 68%)"
                    className={splitRatio <= 36 ? "active" : ""}
                    onClick={() => { setFocusMode("split"); setSplitRatio(32); }}
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    type="button"
                    title="Tarazla (58% / 42%)"
                    className={splitRatio > 36 && splitRatio < 66 ? "active" : ""}
                    onClick={() => { setFocusMode("split"); setSplitRatio(58); }}
                  >
                    <Columns2 size={12} />
                  </button>
                  <button
                    type="button"
                    title="Günün əməliyyatlarını genişləndir (70% / 30%)"
                    className={splitRatio >= 66 ? "active" : ""}
                    onClick={() => { setFocusMode("split"); setSplitRatio(70); }}
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>

              <section className="reconciliation-panel">
              <div className="reconciliation-toolbar">
                <div className="reconciliation-title">
                  <div>
                    <div className="panel-title-row"><h2>Hesab xülasəsi</h2><em>{visibleReconciliationRows.length} hesab</em></div>
                    <small>Şəxs və kanal üzrə cari qalıq və hərəkət</small>
                  </div>
                </div>
                <div className="reconciliation-toolbar-actions">
                  <label className="reconciliation-search"><Search size={16} /><input value={reconciliationQuery} onChange={(event) => setReconciliationQuery(event.target.value)} placeholder="Şəxs və ya hesab axtar..." /></label>
                  <button
                    type="button"
                    className="panel-expand-btn"
                    title="Hesablama qaydalarını idarə et (Avto TÖ, Köçürmə və s.)"
                    onClick={() => setView("settings")}
                  >
                    <Settings size={15} />
                  </button>
                  <button
                    type="button"
                    className={cx("panel-expand-btn", (focusMode === "summary" || splitRatio <= 36) && "active")}
                    title={focusMode === "summary" ? "İki panel görünüşünə qayıt" : splitRatio <= 36 ? "Tam ekran genişləndir (100%)" : "Hesab xülasəsini genişləndir (32% / 68%)"}
                    onClick={() => {
                      if (focusMode === "summary") {
                        setFocusMode("split");
                        setSplitRatio(58);
                      } else if (splitRatio <= 36) {
                        setFocusMode("summary");
                      } else {
                        setFocusMode("split");
                        setSplitRatio(32);
                      }
                    }}
                  >
                    {focusMode === "summary" ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </div>
              </div>
              <div className="reconciliation-table">
                <div className="reconciliation-head"><span>Şəxs / Hesab</span><span>Cari qalıq</span><span>Vəsait qəbulu</span><span>Əvvəldən qalıq</span><span>Xərc</span><span>Təchizatçıya ödəniş</span></div>
                <div className="reconciliation-mobile-head" aria-hidden="true">
                  <span>Ad / Hesab</span>
                  <span>Cari qalıq</span>
                  <span>Əvvəldən qalıq</span>
                  <span>Vəsait qəbulu</span>
                  <span>Xərc</span>
                  <span>Təchizatçı öd.</span>
                </div>
                <div className="reconciliation-body">{visibleReconciliationRows.map(([name, received, previous, expense, supplier]) => {
                  const current = received + previous - expense - supplier;
                  const isCard = /^K\./i.test(name) || /^Kart/i.test(name);
                  const autoTo = isAutoSupplierCollector(name);
                  const cleanName = normalizePersonName(name);
                  const badgeText = isCard ? "Kart / Bank" : autoTo ? "Kassa · Avto TÖ" : "Kassa";
                  return <article key={name}>
                    <div className="reconciliation-mobile-content">
                      <div className="reconciliation-mobile-identity"><b>{cleanName}</b><small>{badgeText}</small></div>
                      <strong>{formatMoney(current, "AZN")}</strong>
                      <span>{formatMoney(previous, "AZN")}</span>
                      <span>{formatMoney(received, "AZN")}</span>
                      <span className={expense ? "outflow" : ""}>{formatMoney(expense, "AZN")}</span>
                      <span className={supplier ? "outflow" : ""}>{formatMoney(supplier, "AZN")}</span>
                    </div>
                    <b title={`${cleanName} (${badgeText}${autoTo ? " — Vəsait qəbulu avtomatik təchizatçı ödənişinə silinir" : ""})`}><span className="recon-person">{cleanName}</span> <small className={cx("recon-badge", isCard ? "bank" : "cash")}>{badgeText}</small></b><strong>{formatMoney(current, "AZN")}</strong><span data-label="Vəsait qəbulu">{formatMoney(received, "AZN")}</span><span data-label="Əvvəldən qalıq">{formatMoney(previous, "AZN")}</span><span data-label="Xərc" className={expense ? "outflow" : ""}>{formatMoney(expense, "AZN")}</span><span data-label="Təchizatçı" className={supplier ? "outflow" : ""}>{formatMoney(supplier, "AZN")}</span>
                  </article>;
                })}</div>
              </div>
              {hasDayMetrics && dayMetrics && (
                <div className="day-metrics-strip" aria-label="Günün yoxlama göstəriciləri">
                  <div className="day-metric-item">
                    <span>Kassa fərqi / qalıq</span>
                    <b className={dayMetrics.kassa < 0 ? "negative" : "positive"}>{formatMoney(dayMetrics.kassa, "AZN")}</b>
                  </div>
                  <div className="day-metric-item">
                    <span>Kart TÖ</span>
                    <b className={dayMetrics.kartTo < 0 ? "negative" : ""}>{formatMoney(dayMetrics.kartTo, "AZN")}</b>
                  </div>
                  <div className="day-metric-item">
                    <span>Cloudshop</span>
                    <b className={dayMetrics.cloudshop < 0 ? "negative" : "positive"}>{formatMoney(dayMetrics.cloudshop, "AZN")}</b>
                  </div>
                  {dayMetrics.note?.trim() && (
                    <div className="day-metric-note">
                      <span>Qeyd:</span>
                      <p>{dayMetrics.note}</p>
                    </div>
                  )}
                </div>
              )}
              </section>
            </section>
          </>}

          {view === "invoices" && (
            <InvoiceAttachmentView
              entries={state.entries}
              customerDebts={customerDebts}
              pastMonthUninvoiced={pastMonthUninvoiced}
              invoices={invoices}
              knownCustomers={customerList}
              formatMoney={formatMoney}
              onConfirmInvoice={confirmInvoice}
              onApproveInvoice={approveInvoice}
              onCancelInvoice={cancelInvoice}
              onUpdateCustomerDebt={updateCustomerDebt}
              onToggleEntryInvoiced={toggleEntryInvoiced}
              onResetAllInvoices={resetAllInvoices}
              onOpenCustomerProfile={(custName) => {
                setSelectedCrmCustomer(custName);
                setView("customers");
              }}
              externalSelectedCustomer={externalInvoiceCustomer}
              externalEditingInvoice={externalEditingInvoice}
              onClearExternalEditing={() => {
                setExternalInvoiceCustomer(null);
                setExternalEditingInvoice(null);
              }}
            />
          )}
          {view === "accounts" && <AccountsView state={state} accounts={accountCatalog} balanceAt={balanceAt} />}
          {view === "reports" && <ReportsView state={state} />}
          {view === "cashboxes" && can("daily.directories.manage") && <DirectoryView items={channelList} setItems={setChannelList} eyebrow="HESAB VƏ KANALLAR" title="Kassa və bank hesabları" description="Şəxslərdən ayrıca saxlanılan ödəniş kanalları (Kassa, Kapital Bank, ABB, Leobank və s.). Eyni şəxs bir neçə kanaldan istifadə edə bilər." />}
          {view === "categories" && can("daily.directories.manage") && <DirectoryView items={categoryList} setItems={setCategoryList} eyebrow="KATEQORİYALAR" title="Əməliyyat kateqoriyaları" description="Mədaxil və məxaric qeydlərində istifadə olunan kateqoriyalar." />}
          {view === "people" && can("daily.directories.manage") && <DirectoryView items={peopleList} setItems={setPeopleList} eyebrow="ŞƏXSLƏR" title="Hesab sahibləri və məsul şəxslər" description="Hesab və ya bank adına görə təkrarlanmayan vahid şəxs siyahısı. Hər bir şəxs həm Kassa, həm də müxtəlif bank hesabları ilə əməliyyat apara bilər." />}
          {view === "customers" && (
            <CustomersCrmView
              entries={state.entries}
              customerDebts={customerDebts}
              pastMonthUninvoiced={pastMonthUninvoiced}
              invoices={invoices}
              knownCustomers={customerList}
              selectedCustomerName={selectedCrmCustomer}
              onSelectCustomerName={setSelectedCrmCustomer}
              formatMoney={formatMoney}
              onUpdateCustomerDebt={updateCustomerDebt}
              onToggleEntryInvoiced={toggleEntryInvoiced}
              onApproveInvoice={approveInvoice}
              onCancelInvoice={cancelInvoice}
              onCreateInvoiceForCustomer={(customerName) => {
                setExternalInvoiceCustomer(customerName);
                setExternalEditingInvoice(null);
                setView("invoices");
              }}
              onOpenInvoiceInBuilder={(invoiceToEdit) => {
                setExternalInvoiceCustomer(invoiceToEdit.customer);
                setExternalEditingInvoice(invoiceToEdit);
                setView("invoices");
              }}
              onAddCustomer={addNewCustomer}
            />
          )}
          {view === "settings" && can("daily.settings.manage") && <SettingsView
            theme={theme}
            setTheme={setTheme}
            rules={rules}
            setRules={setRules}
            peopleList={peopleList}
            onResetRules={() => setRules(DEFAULT_RULES)}
            onReset={() => {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.removeItem(RULES_STORAGE_KEY);
              localStorage.removeItem("arix-daily-directory-people-v2");
              localStorage.removeItem("arix-daily-directory-cashboxes-v3");
              localStorage.removeItem("arix-daily-directory-categories");
              localStorage.removeItem("arix-daily-directory-customers-v1");
              localStorage.removeItem("arix-daily-customer-debts-v1");
              localStorage.removeItem("arix-daily-past-month-v1");
              localStorage.removeItem("arix-daily-invoices-v1");
              window.location.reload();
            }}
          />}
          {view === "management" && canManageSystem && <DailyManagementView session={session} />}
        </main>
      </div>

      {entryOpen && <EntryDialog kind={kind} setKind={setKind} draft={draft} setDraft={setDraft} people={peopleList} channels={channelList} categories={categoryList} customers={customerList} onClose={() => setEntryOpen(false)} onSubmit={saveEntry} />}
      {closeOpen && !closeRecord && <CloseDialog date={selectedDate} accounts={accountCatalog} balanceAt={balanceAt} onClose={() => setCloseOpen(false)} onSave={(actuals, note) => { setState((current) => ({ ...current, closes: [...current.closes.filter((item) => item.date !== selectedDate), { date: selectedDate, actuals, note, closedAt: new Date().toISOString() }] })); setCloseOpen(false); }} />}
    </div>
  );
}

function DirectoryView({ items, setItems, eyebrow, title, description }: { items: string[]; setItems: React.Dispatch<React.SetStateAction<string[]>>; eyebrow: string; title: string; description: string }) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const visible = items.filter((item) => item.toLocaleLowerCase("az-AZ").includes(query.trim().toLocaleLowerCase("az-AZ")));
  const addItem = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || items.some((item) => item.toLocaleLowerCase("az-AZ") === value.toLocaleLowerCase("az-AZ"))) return;
    setItems((current) => [...current, value]);
    setDraft("");
  };
  return <><section className="page-heading directory-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><em>{items.length} qeyd</em></section><section className="directory-panel"><div className="directory-toolbar"><label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Siyahıda axtar" /></label><form onSubmit={addItem}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Yeni ad daxil edin" /><button className="primary-button" type="submit"><Plus size={16} />Əlavə et</button></form></div><div className="directory-list">{visible.map((item, index) => <article key={`${item}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><b>{item}</b><button onClick={() => setItems((current) => current.filter((value) => value !== item))} aria-label={`${item} sil`}><Trash2 size={16} /></button></article>)}</div></section></>;
}

function SettingsView({
  theme,
  setTheme,
  rules,
  setRules,
  peopleList,
  onResetRules,
  onReset,
}: {
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  rules: CalculationRules;
  setRules: React.Dispatch<React.SetStateAction<CalculationRules>>;
  peopleList: string[];
  onResetRules: () => void;
  onReset: () => void;
}) {
  const candidateAccounts = useMemo(() => {
    const kassaNames = ACCOUNTS
      .filter((acc) => !/^K\./i.test(acc.name) && !/^Kart/i.test(acc.name) && acc.name !== "Ümumi")
      .map((acc) => acc.name);
    const cleanPeople = peopleList.filter((p) => p !== "Ümumi");
    return Array.from(new Set([...kassaNames, ...cleanPeople, "T1", "T2", "T3", "T4"]));
  }, [peopleList]);

  const toggleAutoAccount = (personName: string) => {
    setRules((current) => {
      const exists = current.autoSupplierAccounts.some(
        (item) => item.toLocaleLowerCase("az-AZ") === personName.toLocaleLowerCase("az-AZ")
      );
      const nextList = exists
        ? current.autoSupplierAccounts.filter(
            (item) => item.toLocaleLowerCase("az-AZ") !== personName.toLocaleLowerCase("az-AZ")
          )
        : [...current.autoSupplierAccounts, personName];
      return { ...current, autoSupplierAccounts: nextList };
    });
  };

  return (
    <>
      <section className="page-heading page-heading-split">
        <div>
          <span className="eyebrow">TƏNZİMLƏMƏLƏR VƏ QAYDALAR</span>
          <h1>Hesablama qaydaları və tənzimləmələr</h1>
          <p>Google Sheet-dən gətirilən avtomatik hesablama düsturlarını, Avto TÖ şəxslərini və yoxlama qaydalarını buradan idarə edin.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onResetRules}>
          Standart Sheet qaydalarını bərpa et
        </button>
      </section>

      <section className="rules-management-panel">
        <div className="rules-panel-header">
          <div>
            <h2>Hesablama qaydaları (Google Sheet düsturları)</h2>
            <small>Dəyişikliklər dərhal Gündəlik dəftər və Hesab xülasəsi cədvəllərinə tətbiq olunur</small>
          </div>
          <em>Aktiv qaydalar</em>
        </div>

        <div className="rules-grid">
          {/* Rule 1: Auto Supplier Payment */}
          <article className="rule-card">
            <div className="rule-card-top">
              <div>
                <span className="rule-formula-tag">Düstur: X = −(R + V)</span>
                <h3>1. Avtomatik Təchizatçıya Ödəniş (Avto TÖ)</h3>
                <p>
                  Seçilmiş şəxslərin <b>Kassa</b> hesabına daxil olan <b>Vəsait qəbulu (R)</b> məbləğindən həmin şəxsin gün ərzində etdiyi <b>Xərc (V)</b> çıxılır və qalan məbləğ avtomatik olaraq <b>Təchizatçıya ödəniş (X)</b> sütununa yazılır. Nəticədə həmin şəxsin gün sonu <b>Cari qalığı 0,00 ₼</b> olur.
                </p>
              </div>
              <button
                type="button"
                className={cx("rule-toggle-btn", rules.autoSupplierEnabled && "active")}
                onClick={() => setRules((c) => ({ ...c, autoSupplierEnabled: !c.autoSupplierEnabled }))}
              >
                {rules.autoSupplierEnabled ? "Aktivdir" : "Deaktivdir"}
              </button>
            </div>

            <div className="rule-accounts-selector">
              <small>Avto TÖ tətbiq olunan Kassa hesabları (klikləyərək aktiv/deaktiv edin):</small>
              <div className="rule-chips-wrap">
                {candidateAccounts.map((person) => {
                  const isSelected = rules.autoSupplierAccounts.some(
                    (item) => item.toLocaleLowerCase("az-AZ") === person.toLocaleLowerCase("az-AZ")
                  );
                  return (
                    <button
                      key={person}
                      type="button"
                      disabled={!rules.autoSupplierEnabled}
                      className={cx("rule-person-chip", isSelected && "selected")}
                      onClick={() => toggleAutoAccount(person)}
                    >
                      {isSelected && <Check size={13} />}
                      <span>{person}</span>
                      <small>{isSelected ? "Avto TÖ" : "Normal"}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          </article>

          {/* Rule 2: Internal Transfer Rule */}
          <article className="rule-card">
            <div className="rule-card-top">
              <div>
                <span className="rule-formula-tag">Düstur: R = Vəsait qəbulu + Gələn Köçürmə − Çıxan Köçürmə</span>
                <h3>2. Daxili Köçürmə (Hesablararası Köçürmə) qaydası</h3>
                <p>
                  Bir kartdan və ya kassadan digər hesaba pul köçürüldükdə, bu məbləğ şirkət xaricinə çıxan xərc olmadığı üçün <b>Xərc</b> sütununu şişirtməməlidir. Google Sheet qaydasına əsasən göndərən hesabın <b>Vəsait qəbulu</b> sütunundan çıxılır, alan hesabın <b>Vəsait qəbulu</b> sütununa əlavə edilir.
                </p>
              </div>
            </div>
            <div className="rule-mode-switch">
              <button
                type="button"
                className={rules.internalTransferMode === "net_received" ? "active" : ""}
                onClick={() => setRules((c) => ({ ...c, internalTransferMode: "net_received" }))}
              >
                <b>Vəsait qəbulu daxilində tənzimlə (Sheet qaydası)</b>
                <small>Göndərəndən (−), alana (+) Vəsait qəbulu sütununda hesablanır</small>
              </button>
              <button
                type="button"
                className={rules.internalTransferMode === "expense_column" ? "active" : ""}
                onClick={() => setRules((c) => ({ ...c, internalTransferMode: "expense_column" }))}
              >
                <b>Çıxışı Xərc sütununda göstər</b>
                <small>Göndərən hesabda Xərc, alan hesabda Vəsait qəbulu kimi göstərilir</small>
              </button>
            </div>
          </article>

          {/* Rule 3: Bottom Check Metrics */}
          <article className="rule-card">
            <div className="rule-card-top">
              <div>
                <span className="rule-formula-tag">Alt zolaq</span>
                <h3>3. Gün sonu yoxlama zolağı (Kassa, Kart TÖ, Cloudshop)</h3>
                <p>
                  Hesab xülasəsi cədvəlinin altında əsas kassa xalis hərəkətini (<b>Kassa</b>), kart hesablarından edilən təchizatçı ödənişlərini (<b>Kart TÖ</b>) və ümumi yığım ilə xərc fərqini (<b>Cloudshop</b>) göstərən məlumat zolağını aktiv və ya deaktiv edin.
                </p>
              </div>
              <button
                type="button"
                className={cx("rule-toggle-btn", rules.showDayCheckMetrics && "active")}
                onClick={() => setRules((c) => ({ ...c, showDayCheckMetrics: !c.showDayCheckMetrics }))}
              >
                {rules.showDayCheckMetrics ? "Göstərilir" : "Gizlidir"}
              </button>
            </div>
          </article>

          {/* Rule 4: Placeholder Cards Visibility */}
          <article className="rule-card">
            <div className="rule-card-top">
              <div>
                <span className="rule-formula-tag">Görünüş qaydası</span>
                <h3>4. Boş ehtiyat kartların (Kart X5..X20, T1..T4) gizlədilməsi</h3>
                <p>
                  Seçilmiş gündə heç bir dövriyyəsi və qalığı olmayan (`0,00 ₼`) ehtiyat kart sətirlərini <b>Hesab xülasəsi</b> cədvəlində avtomatik gizlədir ki, cədvəl yalnız aktiv hesabları göstərsin.
                </p>
              </div>
              <button
                type="button"
                className={cx("rule-toggle-btn", rules.hideZeroPlaceholderCards && "active")}
                onClick={() => setRules((c) => ({ ...c, hideZeroPlaceholderCards: !c.hideZeroPlaceholderCards }))}
              >
                {rules.hideZeroPlaceholderCards ? "Gizlədilir" : "Hamısı görünür"}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section className="settings-panel">
        <article>
          <div>
            <b>Görünüş rejimi</b>
            <span>İşıqlı və qaranlıq görünüş arasında keçid edin.</span>
          </div>
          <button className="secondary-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            {theme === "light" ? "Qaranlıq" : "İşıqlı"} rejim
          </button>
        </article>
        <article>
          <div>
            <b>Mənbə məlumatları</b>
            <span>Google Sheet-dən 825 əməliyyat, 35 günlük hesab xülasəsi, 7 bank üzrə Kart Hesabatı, Qrafik/Cədvəl hesabatları və 237 müştəri bazası gətirilib.</span>
          </div>
          <button className="secondary-button danger-button" onClick={onReset}>
            <Trash2 size={17} />
            Yerli dəyişiklikləri sıfırla
          </button>
        </article>
      </section>
    </>
  );
}

function EntryDialog({ kind, setKind, draft, setDraft, people, channels, categories, customers, onClose, onSubmit }: {
  kind: EntryKind;
  setKind: (value: EntryKind) => void;
  draft: EntryDraft;
  setDraft: React.Dispatch<React.SetStateAction<EntryDraft>>;
  people: string[];
  channels: string[];
  categories: string[];
  customers: string[];
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const selectablePeople = people.filter((person) => person !== "Ümumi");
  const personOptions = selectablePeople.length ? selectablePeople : DEFAULT_PEOPLE;
  const channelOptions = channels.length ? channels : DEFAULT_CHANNELS;
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={onSubmit}>
        <div className="modal-heading">
          <div><span>YENİ ƏMƏLİYYAT</span><h2>Dəftərə qeyd əlavə et</h2></div>
          <button type="button" className="icon-button" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="kind-switch">
          {(["income", "expense", "transfer"] as EntryKind[]).map((value) => (
            <button type="button" key={value} onClick={() => setKind(value)} className={kind === value ? `active ${value}` : ""}>
              {value === "income" ? "Mədaxil" : value === "expense" ? "Məxaric" : "Köçürmə"}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label className="full">
            <span>Məbləğ</span>
            <div className="amount-field">
              <input autoFocus inputMode="decimal" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="0,00" required />
              <b>AZN</b>
            </div>
          </label>
          <label>
            <span>{kind === "transfer" ? "Çıxış: Şəxs" : "Şəxs (Hesab sahibi / məsul)"}</span>
            <select value={draft.person} onChange={(event) => setDraft((current) => ({ ...current, person: event.target.value }))}>
              {personOptions.map((person) => <option key={person} value={person}>{person}</option>)}
            </select>
          </label>
          <label>
            <span>{kind === "transfer" ? "Çıxış: Hesab / Kanal" : "Hesab / Kanal"}</span>
            <select value={draft.channel} onChange={(event) => setDraft((current) => ({ ...current, channel: event.target.value }))}>
              {channelOptions.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
            </select>
          </label>
          {kind === "transfer" ? (
            <>
              <label>
                <span>Giriş: Şəxs</span>
                <select value={draft.targetPerson} onChange={(event) => setDraft((current) => ({ ...current, targetPerson: event.target.value }))}>
                  {personOptions.map((person) => <option key={person} value={person}>{person}</option>)}
                </select>
              </label>
              <label>
                <span>Giriş: Hesab / Kanal</span>
                <select value={draft.targetChannel} onChange={(event) => setDraft((current) => ({ ...current, targetChannel: event.target.value }))}>
                  {channelOptions.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                <span>Qarşı tərəf (Kontragent)</span>
                <input list="daily-customers-list" value={draft.counterparty} onChange={(event) => setDraft((current) => ({ ...current, counterparty: event.target.value }))} placeholder="Müştəri, təchizatçı və ya şəxs" />
                <datalist id="daily-customers-list">
                  {customers.map((customer) => <option key={customer} value={customer} />)}
                </datalist>
              </label>
              <label>
                <span>Kateqoriya</span>
                <input list="daily-categories-list" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} placeholder={kind === "income" ? "Vəsait qəbulu, avans..." : "Ödəniş, əməkhaqqı, yemək..."} />
                <datalist id="daily-categories-list">
                  {categories.map((cat) => <option key={cat} value={cat} />)}
                </datalist>
              </label>
            </>
          )}
          <label className="full">
            <span>Açıqlama</span>
            <textarea value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Əməliyyatla bağlı qısa qeyd" />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>İmtina</button>
          <button type="submit" className="primary-button"><Check size={17} />Yadda saxla</button>
        </div>
      </form>
    </div>
  );
}

function CloseDialog({ date, accounts, balanceAt, onClose, onSave }: { date: string; accounts: Account[]; balanceAt: (account: Account, endDate: string, beforeDay?: boolean) => number; onClose: () => void; onSave: (actuals: Record<string, number>, note: string) => void }) {
  const activeAccounts = accounts.filter((acc) => !isPlaceholderCard(acc.name));
  const [actuals, setActuals] = useState<Record<string, string>>(() => Object.fromEntries(activeAccounts.map((account) => [account.id, String(balanceAt(account, date))])));
  const [note, setNote] = useState("");
  const differences = activeAccounts.map((account) => Number(actuals[account.id] || 0) - balanceAt(account, date));
  const hasDifference = differences.some((value) => Math.abs(value) > 0.009);
  return <div className="modal-backdrop"><div className="modal close-modal"><div className="modal-heading"><div><span>GÜN SONU</span><h2>Hesabları yoxla</h2><p>{dateLabel(date, { day: "numeric", month: "long", year: "numeric" })}</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="close-list"><div className="close-head"><span>Şəxs / Hesab</span><span>Sistem</span><span>Faktiki</span><span>Fərq</span></div>{activeAccounts.map((account) => { const expected = balanceAt(account, date); const actual = Number(actuals[account.id] || 0); const difference = actual - expected; const isCard = /^K\./i.test(account.name) || account.type === "card"; const label = account.person ? `${account.person} · ${account.channel}` : `${normalizePersonName(account.name)} · ${isCard ? "Kart / Bank" : "Kassa"}`; return <label key={account.id}><span><b>{label}</b><small>{account.currency}</small></span><strong>{formatMoney(expected, account.currency)}</strong><input inputMode="decimal" value={actuals[account.id]} onChange={(event) => setActuals((current) => ({ ...current, [account.id]: event.target.value }))} /><em className={Math.abs(difference) > 0.009 ? "different" : ""}>{formatMoney(difference, account.currency)}</em></label>; })}</div>{hasDifference && <label className="difference-note"><span>Fərqin izahı</span><textarea value={note} onChange={(event) => setNote(event.target.value)} required placeholder="Sistem və faktiki qalıq arasındakı fərqin səbəbini yazın" /></label>}<div className="modal-actions"><button className="secondary-button" onClick={onClose}>İmtina</button><button className="primary-button" disabled={hasDifference && !note.trim()} onClick={() => onSave(Object.fromEntries(Object.entries(actuals).map(([key, value]) => [key, Number(value || 0)])), note)}><LockKeyhole size={17} />Günü bağla</button></div></div></div>;
}

function AccountsView({ state, accounts, balanceAt }: { state: DailyState; accounts: Account[]; balanceAt: (account: Account, endDate: string, beforeDay?: boolean) => number }) {
  const [subTab, setSubTab] = useState<"cards" | "movements">("cards");
  const [selectedBank, setSelectedBank] = useState<string>("Kapital Bank");
  const [showInactiveCards, setShowInactiveCards] = useState(false);
  const [cardQuery, setCardQuery] = useState("");
  const visibleAccounts = useMemo(() => accounts.filter((item) => !isPlaceholderCard(item.name)), [accounts]);
  const [selected, setSelected] = useState(visibleAccounts[0]?.id ?? accounts[0].id);
  const account = accounts.find((item) => item.id === selected) ?? accounts[0];
  const movements = state.entries.filter((entry) => entry.accountId === selected || entry.targetAccountId === selected).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  const formatAccountDisplay = (item: Account) => {
    if (item.person) return `${item.person} · ${item.channel}`;
    const clean = normalizePersonName(item.name);
    const isCard = /^K\./i.test(item.name) || item.type === "card";
    return `${clean} · ${isCard ? "Kart / Bank" : "Kassa"}`;
  };

  const dynamicBankReports = useMemo(() => {
    const manualEntries = state.entries.filter((entry) => !entry.id.startsWith("sheet-"));
    return IMPORTED_CARD_REPORT.map((bankGroup) => {
      const bankNorm = bankGroup.bank.toLocaleLowerCase("az-AZ");
      const rows = bankGroup.rows.map((baseRow) => {
        const personNorm = normalizePersonName(baseRow.person).toLocaleLowerCase("az-AZ");
        let income = baseRow.income;
        let onlinePayment = baseRow.onlinePayment;
        let sameBankTransfer = baseRow.sameBankTransfer;
        let diffBankTransfer = baseRow.diffBankTransfer;
        let cashOut = baseRow.cashOut;

        for (const entry of manualEntries) {
          const amt = Math.abs(entry.amount);
          const srcPerson = normalizePersonName(entry.responsible).toLocaleLowerCase("az-AZ");
          const srcBank = (entry.bank ?? "").toLocaleLowerCase("az-AZ");
          const dstPerson = normalizePersonName(entry.targetResponsible).toLocaleLowerCase("az-AZ");
          const dstBank = (entry.targetBank ?? "").toLocaleLowerCase("az-AZ");

          if (entry.kind === "income" && srcPerson === personNorm && srcBank === bankNorm) {
            income += amt;
          } else if (entry.kind === "expense" && srcPerson === personNorm && srcBank === bankNorm) {
            onlinePayment -= amt;
          } else if (entry.kind === "transfer") {
            if (srcPerson === personNorm && srcBank === bankNorm) {
              if (dstBank === "kassa") cashOut -= amt;
              else if (dstBank === bankNorm) sameBankTransfer -= amt;
              else diffBankTransfer -= amt;
            }
            if (dstPerson === personNorm && dstBank === bankNorm) {
              income += amt;
            }
          }
        }
        const delta =
          (income - baseRow.income) +
          (onlinePayment - baseRow.onlinePayment) +
          (sameBankTransfer - baseRow.sameBankTransfer) +
          (diffBankTransfer - baseRow.diffBankTransfer) +
          (cashOut - baseRow.cashOut);
        return {
          ...baseRow,
          income,
          onlinePayment,
          sameBankTransfer,
          diffBankTransfer,
          cashOut,
          balance: baseRow.balance + delta,
          limitRemaining: baseRow.limitRemaining - (income - baseRow.income),
        };
      });
      const totalBalance = rows.reduce((sum, r) => sum + r.balance, 0);
      return { ...bankGroup, totalBalance, rows };
    });
  }, [state.entries]);

  const totalAllBanks = useMemo(
    () => dynamicBankReports.reduce((sum, bank) => sum + bank.totalBalance, 0),
    [dynamicBankReports]
  );
  const activeBankReport = useMemo(
    () => dynamicBankReports.find((item) => item.bank === selectedBank) ?? dynamicBankReports[0],
    [dynamicBankReports, selectedBank]
  );
  const filteredCardRows = useMemo(() => {
    const q = cardQuery.trim().toLocaleLowerCase("az-AZ");
    return activeBankReport.rows.filter((row) => {
      if (q && !row.person.toLocaleLowerCase("az-AZ").includes(q)) return false;
      if (showInactiveCards || q) return true;
      return (
        row.opening !== 0 ||
        row.income !== 0 ||
        row.onlinePayment !== 0 ||
        row.sameBankTransfer !== 0 ||
        row.diffBankTransfer !== 0 ||
        row.cashOut !== 0 ||
        row.balance !== 0 ||
        row.limitRemaining !== 0
      );
    });
  }, [activeBankReport, cardQuery, showInactiveCards]);

  const cardTotals = useMemo(
    () =>
      activeBankReport.rows.reduce(
        (acc, row) => ({
          opening: acc.opening + row.opening,
          income: acc.income + row.income,
          onlinePayment: acc.onlinePayment + row.onlinePayment,
          sameBankTransfer: acc.sameBankTransfer + row.sameBankTransfer,
          diffBankTransfer: acc.diffBankTransfer + row.diffBankTransfer,
          cashOut: acc.cashOut + row.cashOut,
          balance: acc.balance + row.balance,
          limitRemaining: acc.limitRemaining + row.limitRemaining,
        }),
        { opening: 0, income: 0, onlinePayment: 0, sameBankTransfer: 0, diffBankTransfer: 0, cashOut: 0, balance: 0, limitRemaining: 0 }
      ),
    [activeBankReport]
  );

  return (
    <>
      <section className="page-heading page-heading-split">
        <div>
          <span className="eyebrow">HESABLAR VƏ KART HESABATI</span>
          <h1>{subTab === "cards" ? "Banklar üzrə kart hesabatı" : "Şəxs və kanal üzrə hesab hərəkətləri"}</h1>
          <p>
            {subTab === "cards"
              ? "Bütün 7 bank üzrə məsul şəxslərin kart balansları, mədaxil, onlayn ödəniş, köçürmə, nağdlaşdırma və limit qalıqları."
              : "Hər bir məsul şəxsin Kassa və Kart / Bank kanalları üzrə cari qalığı və əməliyyat tarixçəsi."}
          </p>
        </div>
        <div className="subview-switch" role="tablist">
          <button type="button" className={subTab === "cards" ? "active" : ""} onClick={() => setSubTab("cards")}>
            <CreditCard size={16} />
            <span>Kart Hesabatı (7 Bank)</span>
          </button>
          <button type="button" className={subTab === "movements" ? "active" : ""} onClick={() => setSubTab("movements")}>
            <WalletCards size={16} />
            <span>Hesab hərəkətləri</span>
          </button>
        </div>
      </section>

      {subTab === "cards" ? (
        <section className="card-report-shell">
          <div className="bank-tabs-grid">
            {dynamicBankReports.map((bank) => (
              <button
                key={bank.bank}
                type="button"
                className={cx("bank-tab-card", selectedBank === bank.bank && "active")}
                onClick={() => setSelectedBank(bank.bank)}
              >
                <div className="bank-tab-top">
                  <span className="bank-code-badge">{bank.code}</span>
                  <small>{bank.rows.filter((r) => r.balance !== 0 || r.income !== 0).length} aktiv</small>
                </div>
                <b>{bank.bank}</b>
                <strong>{formatMoney(bank.totalBalance, "AZN")}</strong>
              </button>
            ))}
            <div className="bank-tab-card total-card">
              <div className="bank-tab-top">
                <span className="bank-code-badge">∑</span>
                <small>7 bank cəmi</small>
              </div>
              <b>Ümumi Kart Balansı</b>
              <strong>{formatMoney(totalAllBanks, "AZN")}</strong>
            </div>
          </div>

          <div className="card-report-panel">
            <div className="card-report-toolbar">
              <div>
                <div className="panel-title-row">
                  <h2>{activeBankReport.bank} — Kart Hesabatı</h2>
                  <em>{filteredCardRows.length} / {activeBankReport.rows.length} kart</em>
                </div>
                <small>Əvvəldən qalıq, mədaxil, onlayn ödəniş, eyni/fərqli bank köçürməsi, nağdlaşdırma və limit</small>
              </div>
              <div className="card-report-actions">
                <label className="search-box">
                  <Search size={16} />
                  <input value={cardQuery} onChange={(e) => setCardQuery(e.target.value)} placeholder="Şəxs axtar..." />
                </label>
                <button
                  type="button"
                  className={cx("secondary-button", showInactiveCards && "active")}
                  onClick={() => setShowInactiveCards((v) => !v)}
                >
                  {showInactiveCards ? "Yalnız aktivləri göstər" : "Bütün sətirlər (23)"}
                </button>
              </div>
            </div>

            <div className="card-report-table-wrap">
              <table className="card-report-table">
                <thead>
                  <tr>
                    <th>Şəxs</th>
                    <th>Status</th>
                    <th className="num">Əv. qalıq</th>
                    <th className="num">Mədaxil</th>
                    <th className="num">Onlayn Ödəniş</th>
                    <th className="num">Köçürmə (eyni bank)</th>
                    <th className="num">Köçürmə (fərqli bank)</th>
                    <th className="num">Nağdlaşdırma</th>
                    <th className="num">Cari Balans</th>
                    <th className="num">Limit qalığı</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="total-row">
                    <td><b>Cəmi ({activeBankReport.bank})</b></td>
                    <td>—</td>
                    <td className="num">{formatMoney(cardTotals.opening, "AZN")}</td>
                    <td className="num income">{formatMoney(cardTotals.income, "AZN")}</td>
                    <td className="num expense">{formatMoney(cardTotals.onlinePayment, "AZN")}</td>
                    <td className="num expense">{formatMoney(cardTotals.sameBankTransfer, "AZN")}</td>
                    <td className="num expense">{formatMoney(cardTotals.diffBankTransfer, "AZN")}</td>
                    <td className="num expense">{formatMoney(cardTotals.cashOut, "AZN")}</td>
                    <td className="num balance"><strong>{formatMoney(cardTotals.balance, "AZN")}</strong></td>
                    <td className="num">{formatMoney(cardTotals.limitRemaining, "AZN")}</td>
                  </tr>
                  {filteredCardRows.map((row) => (
                    <tr key={row.person}>
                      <td><b>{row.person}</b></td>
                      <td>
                        <span className={cx("card-status-pill", !row.status && "active")}>
                          {row.status || "Aktiv"}
                        </span>
                      </td>
                      <td className="num">{formatMoney(row.opening, "AZN")}</td>
                      <td className={cx("num", row.income > 0 && "income")}>{formatMoney(row.income, "AZN")}</td>
                      <td className={cx("num", row.onlinePayment !== 0 && "expense")}>{formatMoney(row.onlinePayment, "AZN")}</td>
                      <td className={cx("num", row.sameBankTransfer !== 0 && "expense")}>{formatMoney(row.sameBankTransfer, "AZN")}</td>
                      <td className={cx("num", row.diffBankTransfer !== 0 && "expense")}>{formatMoney(row.diffBankTransfer, "AZN")}</td>
                      <td className={cx("num", row.cashOut !== 0 && "expense")}>{formatMoney(row.cashOut, "AZN")}</td>
                      <td className="num balance"><strong>{formatMoney(row.balance, "AZN")}</strong></td>
                      <td className={cx("num", row.limitRemaining < 0 && "expense")}>{formatMoney(row.limitRemaining, "AZN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <div className="accounts-layout">
          <section className="accounts-overview">
            {visibleAccounts.map((item) => {
              const isCard = /^K\./i.test(item.name) || item.type === "card";
              const Icon = isCard ? CreditCard : accountIcon(item);
              return (
                <button key={item.id} className={selected === item.id ? "selected" : ""} onClick={() => setSelected(item.id)}>
                  <span className={`account-icon ${isCard ? "card" : item.type}`}><Icon size={20} /></span>
                  <span><small>{formatAccountDisplay(item)}</small><b>{formatMoney(balanceAt(item, todayKey), item.currency)}</b></span>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </section>
          <section className="account-detail">
            <div className="account-detail-heading">
              <span><small>CARİ QALIQ</small><h2>{formatAccountDisplay(account)}</h2></span>
              <b>{formatMoney(balanceAt(account, todayKey), account.currency)}</b>
            </div>
            <div className="account-movements">
              {movements.length ? movements.map((entry) => {
                const incoming = entry.kind === "income" || entry.targetAccountId === account.id;
                const channel = resolveEntryChannel(entry, account);
                return (
                  <article key={entry.id}>
                    <span className={incoming ? "mini-icon income" : "mini-icon expense"}>
                      {incoming ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                    </span>
                    <span>
                      <b>{entry.counterparty} <i className={cx("channel-pill", channel.toLocaleLowerCase("az-AZ") === "kassa" ? "cash" : "bank")}>{channel}</i></b>
                      <small>{dateLabel(entry.date, { day: "numeric", month: "short" })}{entry.time ? ` · ${entry.time}` : ""} · {entry.category}{entry.note ? ` · ${entry.note}` : ""}</small>
                    </span>
                    <strong className={incoming ? "income" : "expense"}>
                      {incoming ? "+" : "−"}{formatMoney(Math.abs(entry.amount), account.currency)}
                    </strong>
                  </article>
                );
              }) : <div className="empty-state"><WalletCards size={28} /><b>Əməliyyat yoxdur</b></div>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function ReportsView({ state }: { state: DailyState }) {
  const [reportTab, setReportTab] = useState<"charts" | "pivots" | "customers">("charts");
  const [selectedWeek, setSelectedWeek] = useState<string>(IMPORTED_WEEKLY_CHARTS[IMPORTED_WEEKLY_CHARTS.length - 1]?.week ?? "V Həftə");
  const [customerSearch, setCustomerSearch] = useState("");

  const manualEntries = useMemo(
    () => state.entries.filter((entry) => !entry.id.startsWith("sheet-")),
    [state.entries]
  );

  const activeWeekData = useMemo(() => {
    if (selectedWeek === "live-7") {
      const days = Array.from({ length: 7 }, (_, index) => shiftDate(todayKey, index - 6));
      return days.map((date) => {
        const entries = state.entries.filter((entry) => entry.date === date);
        const collection = entries.filter((entry) => entry.kind === "income").reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
        const supplierPayment = entries
          .filter((entry) => entry.kind === "expense" && entry.category.toLocaleLowerCase("az-AZ").includes("təch"))
          .reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
        const expense = entries
          .filter((entry) => entry.kind === "expense" && !entry.category.toLocaleLowerCase("az-AZ").includes("təch"))
          .reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
        return { date, collection, expense, supplierPayment };
      });
    }
    const found = IMPORTED_WEEKLY_CHARTS.find((w) => w.week === selectedWeek) ?? IMPORTED_WEEKLY_CHARTS[0];
    return found.days.map((day) => {
      const dayManual = manualEntries.filter((e) => e.date === day.date);
      if (!dayManual.length) return day;
      const addCol = dayManual.filter((e) => e.kind === "income").reduce((s, e) => s + Math.abs(e.amount), 0);
      const addSup = dayManual
        .filter((e) => e.kind === "expense" && e.category.toLocaleLowerCase("az-AZ").includes("təch"))
        .reduce((s, e) => s + Math.abs(e.amount), 0);
      const addExp = dayManual
        .filter((e) => e.kind === "expense" && !e.category.toLocaleLowerCase("az-AZ").includes("təch"))
        .reduce((s, e) => s + Math.abs(e.amount), 0);
      return {
        date: day.date,
        collection: day.collection + addCol,
        expense: day.expense + addExp,
        supplierPayment: day.supplierPayment + addSup,
      };
    });
  }, [selectedWeek, state.entries, manualEntries]);

  const maxChartVal = Math.max(
    ...activeWeekData.flatMap((row) => [row.collection, row.expense, row.supplierPayment]),
    1
  );

  const weekTotals = useMemo(
    () =>
      activeWeekData.reduce(
        (acc, row) => ({
          collection: acc.collection + row.collection,
          expense: acc.expense + row.expense,
          supplierPayment: acc.supplierPayment + row.supplierPayment,
        }),
        { collection: 0, expense: 0, supplierPayment: 0 }
      ),
    [activeWeekData]
  );

  const dynamicPivots = useMemo(() => {
    const catMap = new Map<string, number>(
      IMPORTED_PIVOT_REPORTS.byCategory.map((item) => [item.category, item.amount])
    );
    const bankMap = new Map<string, number>(
      IMPORTED_PIVOT_REPORTS.byBank.map((item) => [item.bank, item.amount])
    );
    const cardMap = new Map<string, number>(
      IMPORTED_PIVOT_REPORTS.byCard.map((item) => [item.person, item.amount])
    );
    const supMap = new Map<string, number>(
      IMPORTED_PIVOT_REPORTS.dailySupplierPayments.map((item) => [item.date, item.amount])
    );

    for (const entry of manualEntries) {
      const amt = Math.abs(entry.amount);
      if (entry.kind === "income") {
        catMap.set(entry.category, (catMap.get(entry.category) ?? 0) + amt);
        if (entry.bank && entry.bank.toLocaleLowerCase("az-AZ") !== "kassa") {
          bankMap.set(entry.bank, (bankMap.get(entry.bank) ?? 0) + amt);
          const p = normalizePersonName(entry.responsible);
          cardMap.set(p, (cardMap.get(p) ?? 0) + amt);
        }
      } else if (entry.kind === "expense") {
        catMap.set(entry.category, (catMap.get(entry.category) ?? 0) - amt);
        if (entry.category.toLocaleLowerCase("az-AZ").includes("təch")) {
          supMap.set(entry.date, (supMap.get(entry.date) ?? 0) + amt);
        }
      }
    }

    return {
      byCategory: Array.from(catMap.entries()).map(([category, amount]) => ({ category, amount })),
      byBank: Array.from(bankMap.entries()).map(([bank, amount]) => ({ bank, amount })),
      byCard: Array.from(cardMap.entries()).map(([person, amount]) => ({ person, amount })),
      dailySupplierPayments: Array.from(supMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({ date, amount })),
    };
  }, [manualEntries]);

  const dynamicCustomers = useMemo(() => {
    const custList: Array<{ name: string; paid: number; invoiced: number }> = IMPORTED_CUSTOMERS.map((c) => ({
      name: c.name,
      paid: c.paid,
      invoiced: c.invoiced,
    }));
    for (const entry of manualEntries) {
      if (entry.kind === "transfer") continue;
      const party = entry.counterparty.trim();
      if (!party) continue;
      const delta = entry.kind === "income" ? Math.abs(entry.amount) : -Math.abs(entry.amount);
      const existing = custList.find((c) => c.name.toLocaleLowerCase("az-AZ") === party.toLocaleLowerCase("az-AZ"));
      if (existing) existing.paid += delta;
      else custList.push({ name: party, paid: delta, invoiced: 0 });
    }
    return custList;
  }, [manualEntries]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLocaleLowerCase("az-AZ");
    return dynamicCustomers.filter((item) => !q || item.name.toLocaleLowerCase("az-AZ").includes(q));
  }, [customerSearch, dynamicCustomers]);

  const totalCustomerPaid = useMemo(
    () => filteredCustomers.reduce((sum, item) => sum + item.paid, 0),
    [filteredCustomers]
  );

  return (
    <>
      <section className="page-heading page-heading-split">
        <div>
          <span className="eyebrow">HESABATLAR VƏ ANALİTİKA</span>
          <h1>
            {reportTab === "charts"
              ? "Qrafik Hesabat (Həftəlik dinamika)"
              : reportTab === "pivots"
                ? "Cədvəl Hesabatı (Kateqoriya, Bank, Kart və Təchizatçı)"
                : "Müştəri və Kontragent üzrə pul fəaliyyəti"}
          </h1>
          <p>
            {reportTab === "charts"
              ? "Həftələr üzrə Ümumi Yığım, Rasxod (Xərc) və Təchizatçıya Ödəniş (TO) müqayisəsi."
              : reportTab === "pivots"
                ? "Kateqoriya, bank, kart sahibi və günlər üzrə təchizatçı ödənişlərinin icmalı."
                : "Baza və Cədvəl Hesabat vərəqlərindən gətirilmiş kontragent ödəniş yekunları."}
          </p>
        </div>
        <div className="subview-switch" role="tablist">
          <button type="button" className={reportTab === "charts" ? "active" : ""} onClick={() => setReportTab("charts")}>
            <BarChart3 size={16} />
            <span>Qrafik Hesabat</span>
          </button>
          <button type="button" className={reportTab === "pivots" ? "active" : ""} onClick={() => setReportTab("pivots")}>
            <Columns2 size={16} />
            <span>Cədvəl Hesabat</span>
          </button>
          <button type="button" className={reportTab === "customers" ? "active" : ""} onClick={() => setReportTab("customers")}>
            <Users size={16} />
            <span>Müştəri fəaliyyəti ({IMPORTED_CUSTOMERS.length})</span>
          </button>
        </div>
      </section>

      {reportTab === "charts" && (
        <section className="report-panel">
          <div className="report-toolbar">
            <div className="week-selector">
              {IMPORTED_WEEKLY_CHARTS.map((item) => (
                <button
                  key={item.week}
                  type="button"
                  className={selectedWeek === item.week ? "active" : ""}
                  onClick={() => setSelectedWeek(item.week)}
                >
                  {item.week}
                </button>
              ))}
              <button
                type="button"
                className={selectedWeek === "live-7" ? "active" : ""}
                onClick={() => setSelectedWeek("live-7")}
              >
                Son 7 gün
              </button>
            </div>
            <div className="report-legend">
              <span><i className="income" />Ümumi Yığım ({formatMoney(weekTotals.collection, "AZN")})</span>
              <span><i className="expense" />Rasxod ({formatMoney(weekTotals.expense, "AZN")})</span>
              <span><i className="supplier" />Təchizatçıya Ödəniş ({formatMoney(weekTotals.supplierPayment, "AZN")})</span>
            </div>
          </div>

          <div className="bar-chart">
            {activeWeekData.map((row) => (
              <div key={row.date} className="bar-day">
                <div className="bars">
                  <i
                    className="income"
                    title={`Ümumi Yığım: ${formatMoney(row.collection, "AZN")}`}
                    style={{ height: `${Math.max((row.collection / maxChartVal) * 100, row.collection ? 4 : 0)}%` }}
                  />
                  <i
                    className="expense"
                    title={`Rasxod: ${formatMoney(row.expense, "AZN")}`}
                    style={{ height: `${Math.max((row.expense / maxChartVal) * 100, row.expense ? 4 : 0)}%` }}
                  />
                  <i
                    className="supplier"
                    title={`Təchizatçıya Ödəniş: ${formatMoney(row.supplierPayment, "AZN")}`}
                    style={{ height: `${Math.max((row.supplierPayment / maxChartVal) * 100, row.supplierPayment ? 4 : 0)}%` }}
                  />
                </div>
                <b>{dateLabel(row.date, { weekday: "short" })}</b>
                <small>{dateLabel(row.date, { day: "numeric", month: "short" })}</small>
              </div>
            ))}
          </div>

          <div className="report-table report-table-4col">
            <article className="report-table-head">
              <span>Tarix</span>
              <span>Ümumi Yığım</span>
              <span>Rasxod (Xərc)</span>
              <span>Təchizatçıya Ödəniş (TO)</span>
              <span>Xalis fərq</span>
            </article>
            {activeWeekData.map((row) => {
              const net = row.collection - row.expense - row.supplierPayment;
              return (
                <article key={row.date}>
                  <span>
                    <b>{dateLabel(row.date, { day: "numeric", month: "long" })}</b>
                    <small>{dateLabel(row.date, { weekday: "long" })}</small>
                  </span>
                  <strong className="income">+{formatMoney(row.collection, "AZN")}</strong>
                  <strong className="expense">−{formatMoney(row.expense, "AZN")}</strong>
                  <strong className="supplier-text">−{formatMoney(row.supplierPayment, "AZN")}</strong>
                  <b className={net >= 0 ? "positive" : "negative"}>{formatMoney(net, "AZN")}</b>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {reportTab === "pivots" && (
        <section className="pivot-reports-grid">
          <div className="pivot-card">
            <div className="pivot-card-head">
              <h3>Kateqoriya üzrə pul fəaliyyəti</h3>
              <em>{dynamicPivots.byCategory.length} kateqoriya</em>
            </div>
            <div className="pivot-list">
              {dynamicPivots.byCategory.map((item) => (
                <article key={item.category}>
                  <span>{item.category}</span>
                  <strong className={item.amount > 0 ? "income" : item.amount < 0 ? "expense" : ""}>
                    {formatMoney(item.amount, "AZN")}
                  </strong>
                </article>
              ))}
            </div>
          </div>

          <div className="pivot-card">
            <div className="pivot-card-head">
              <h3>Banklar üzrə mədaxil</h3>
              <em>{dynamicPivots.byBank.length} bank</em>
            </div>
            <div className="pivot-list">
              {dynamicPivots.byBank.map((item) => (
                <article key={item.bank}>
                  <span>{item.bank}</span>
                  <strong className={item.amount > 0 ? "income" : ""}>
                    {formatMoney(item.amount, "AZN")}
                  </strong>
                </article>
              ))}
              <article className="pivot-total-row">
                <b>Cəmi bank mədaxili</b>
                <strong>
                  {formatMoney(
                    dynamicPivots.byBank.reduce((sum, item) => sum + item.amount, 0),
                    "AZN"
                  )}
                </strong>
              </article>
            </div>

            <div className="pivot-card-head" style={{ borderTop: "1px solid var(--arix-line)" }}>
              <h3>Kartlar üzrə pul fəaliyyəti</h3>
              <em>{dynamicPivots.byCard.length} kart</em>
            </div>
            <div className="pivot-list pivot-list-scroll">
              {dynamicPivots.byCard.map((item) => (
                <article key={item.person}>
                  <span>{item.person}</span>
                  <strong className={item.amount > 0 ? "income" : ""}>
                    {formatMoney(item.amount, "AZN")}
                  </strong>
                </article>
              ))}
            </div>
          </div>

          <div className="pivot-card">
            <div className="pivot-card-head">
              <h3>Günlər üzrə təchizatçıya ödəniş</h3>
              <em>{dynamicPivots.dailySupplierPayments.length} gün</em>
            </div>
            <div className="pivot-list pivot-list-scroll">
              {dynamicPivots.dailySupplierPayments
                .filter((item) => item.amount !== 0)
                .map((item) => (
                  <article key={item.date}>
                    <span>{dateLabel(item.date, { day: "numeric", month: "long" })}</span>
                    <strong className="expense">−{formatMoney(item.amount, "AZN")}</strong>
                  </article>
                ))}
              <article className="pivot-total-row">
                <b>Yekun təchizatçı ödənişi</b>
                <strong className="expense">
                  −{formatMoney(
                    dynamicPivots.dailySupplierPayments.reduce((sum, item) => sum + item.amount, 0),
                    "AZN"
                  )}
                </strong>
              </article>
            </div>
          </div>
        </section>
      )}

      {reportTab === "customers" && (
        <section className="directory-panel">
          <div className="directory-toolbar">
            <label className="search-box">
              <Search size={17} />
              <input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Müştəri və ya təchizatçı axtar..."
              />
            </label>
            <div className="customer-summary-pill">
              <span>Seçilmiş üzrə cəmi dövriyyə:</span>
              <b>{formatMoney(totalCustomerPaid, "AZN")}</b>
            </div>
          </div>
          <div className="customer-report-grid">
            {filteredCustomers.map((item, idx) => (
              <article key={`${item.name}-${idx}`}>
                <span>{String(idx + 1).padStart(2, "0")}</span>
                <b>{item.name}</b>
                <strong className={item.paid > 0 ? "income" : item.paid < 0 ? "expense" : ""}>
                  {formatMoney(item.paid, "AZN")}
                </strong>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
