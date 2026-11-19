import { spareInvestorOpening } from "./investorOpening.local";
import { markAllDailyNotifications } from "../../shared/dailyReadAll.js";
import { isTrailingDailyEntry, orderDailyDisplayEntries } from "../../shared/dailyDisplayOrder.js";
import NotificationTypes from "./NotificationTypes";
import { isPunctuationOnly } from "./noteText";
import NoteSummary from "./NoteSummary";
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import DisplayScaleControl from "./DisplayScaleControl";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Columns2,
  CreditCard,
  ChevronDown,
  Globe2,
  Landmark,
  LockKeyhole,
  ListChecks,
  Maximize2,
  Minimize2,
  Moon,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Tags,
  Trash2,
  Users,
  WalletCards,
  X,
  FileText,
  Eye,
  History,
  RefreshCw,
  ClipboardCheck,
  LayoutGrid,
  List,
} from "lucide-react";
import AriXLogo from "./AriXLogo";
import { BankLogo, normalizeBankKey } from "./BankLogo";
import CustomersCrmView from "./CustomersCrmView";
import InvoiceAttachmentView from "./InvoiceAttachmentView";
import DailyManagementView from "./DailyManagementView";
import { rebaseDailySnapshot } from "./dailySnapshotMerge";
import {
  enqueueInvoiceMutation,
  markInvoiceSynced,
  markInvoicesSyncedBatch,
  wasInvoiceSynced,
  flushQueue,
} from "./dailyInvoiceSync";
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
import {
  SPAREXPERT_ACCOUNTS,
  SPAREXPERT_PEOPLE,
  SPAREXPERT_CHANNELS,
  SPAREXPERT_CATEGORIES,
  SPAREXPERT_CUSTOMERS,
  SPAREXPERT_CARD_REPORT,
  SPAREXPERT_ENTRIES,
  SPAREXPERT_NOVEMBER_OPENING,
} from "./sparexpertDefaults";

type View = "daily" | "invoices" | "accounts" | "reports" | "cashboxes" | "categories" | "people" | "customers" | "settings" | "management";
type EntryKind = "income" | "expense" | "transfer";
type Currency = "TRY" | "AZN" | "USD";
type DailyContextTarget =
  | { type: "entry"; entry: Entry }
  | { type: "account"; account: Account }
  | { type: "workspace" };
const STANDARD_BANKS = ["Kapital Bank", "ABB", "Unibank", "Leobank", "Rabitə Bank", "Ziraat Bank", "Azər Türk Bank", "M10"];
type BankDirectory = Record<string, string>;
const bankDirectoryKey = (name: string) => {
  const known = normalizeBankKey(name);
  return known === "other" || known === "total" ? name.trim().toLocaleLowerCase("az-AZ") : known;
};
async function encodeBankLogo(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) {
    throw new Error("PNG, JPG və ya WebP seçin (ən çox 2 MB).");
  }
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const scale = 128 / Math.max(image.width, image.height, 128);
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Şəkli açmaq olmadı.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.85);
  } finally { image.close(); }
}

type Account = {
  id: string;
  name: string;
  type: "cash" | "bank" | "card" | "currency";
  currency: Currency;
  opening: number;
  person?: string;
  channel?: string;
  logo?: string;
  archived?: boolean;
};
type EntryExpenseMethod = "online" | "diff_bank" | "same_bank" | "cash_out";

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
  card?: string;
  expenseMethod?: EntryExpenseMethod;
  invoiced?: boolean;
  invoiceNo?: string;
  editedAt?: string;
  editedBy?: string;
  createdAt?: string;
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
  changeReason: string;
  expenseMethod: EntryExpenseMethod;
  accountId?: string;
  targetAccountId?: string;
  cardBank?: string;
  targetCardBank?: string;
};
type CloseRecord = { date: string; actuals: Record<string, number>; note: string; closedAt: string; notificationTotals?: { income: number; expense: number; supplier: number; ending: number } };
type DailyState = { entries: Entry[]; closes: CloseRecord[] };
type ReconciliationRow = readonly [string, number, number, number, number, number?];

type DayMetric = { kassa: number; kartTo: number; cloudshop: number; note: string };
type CalculationRules = {
  requireBackdatedApproval?: boolean;
  requireEntryEditApproval?: boolean;
  requireEntryDeleteApproval?: boolean;
  autoSupplierEnabled: boolean;
  autoSupplierAccounts: string[];
  internalTransferMode: "net_received" | "expense_column" | "separate";
  showDayCheckMetrics: boolean;
  hideZeroPlaceholderCards: boolean;
};
type CardLimitRuleKey = "opening" | "income" | "onlinePayment" | "sameBankTransfer" | "diffBankTransfer" | "cashOut";
type CardLimitRules = Record<CardLimitRuleKey, boolean>;
type CardStatus = "" | "🚫" | "🔒" | "❓";
type CardBankLimitSettings = { rules: CardLimitRules; limits: Record<string, number>; statuses: Record<string, CardStatus> };
type CardLimitSettings = Record<string, CardBankLimitSettings>;

type DailySnapshot = {
  version: 1 | 2 | 3;
  companyId?: string;
  companyName?: string;
  accounts?: Account[];
  state: DailyState;
  peopleList: string[];
  channelList: string[];
  categoryList: string[];
  customerList: string[];
  rules: CalculationRules;
  customerDebts: Record<string, number>;
  pastMonthUninvoiced: Record<string, number>;
  invoices: InvoiceRecord[];
  cardLimitSettings?: CardLimitSettings;
};

type DailyApiResponse = {
  data: DailySnapshot | null;
  revision: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
};
type DailyNotification = { id: string; title: string; message: string; type?: string; relatedId?: string; createdAt: string; createdBy?: string; readAt?: string | null };
type EntryChangeRequest = {
  id: string;
  entryId: string;
  action?: "update" | "delete" | "create_backdated";
  status: "pending" | "approved" | "rejected";
  originalEntry: Entry | null;
  proposedEntry: Entry | null;
  reason?: string;
  requestedAt: string;
  requestedById: string;
  requestedBy: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionNote?: string;
};

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

const DEFAULT_CARD_LIMIT_RULES: CardLimitRules = {
  opening: false,
  income: false,
  onlinePayment: false,
  sameBankTransfer: false,
  diffBankTransfer: false,
  cashOut: false,
};

// Card limits are bank-specific.  For Kapital and ABB the monthly cap is the
// remaining amount after the carried balance, outgoing interbank transfers and
// cash withdrawals; incoming money is never part of that volume.
const defaultCardLimitRulesForBank = (bank: string): CardLimitRules => {
  const normalized = bank.trim().toLocaleLowerCase("az-AZ");
  if (normalized === "kapital bank" || normalized === "abb") {
    return {
      ...DEFAULT_CARD_LIMIT_RULES,
      opening: true,
      diffBankTransfer: true,
      cashOut: true,
    };
  }
  return { ...DEFAULT_CARD_LIMIT_RULES };
};
const CARD_LIMIT_RULE_OPTIONS: readonly { key: CardLimitRuleKey; label: string; description: string }[] = [
  { key: "onlinePayment", label: "Onlayn ödəniş", description: "Kartla edilən onlayn ödənişlər" },
  { key: "sameBankTransfer", label: "Eyni banka köçürmə", description: "Eyni bank daxilində çıxan köçürmə" },
  { key: "diffBankTransfer", label: "Fərqli banka köçürmə", description: "Başqa banka çıxan köçürmə" },
  { key: "cashOut", label: "Nağdlaşdırma", description: "Kartdan kassaya çıxarılan vəsait" },
];
const CARD_STATUS_OPTIONS: readonly { value: CardStatus; label: string }[] = [
  { value: "", label: "Aktiv" },
  { value: "🚫", label: "Passiv · ⛔" },
  { value: "🔒", label: "Kilidli · 🔒" },
  { value: "❓", label: "Qeyri-müəyyən · ❓" },
];

const isCashLimitChannel = (name: string) =>
  /^(?:kassa|nağd)(?:$|[ .(·])|^n\./iu.test(name.trim());

const normalizeCardLimitSettings = (saved?: CardLimitSettings | null, isSparexpert = false): CardLimitSettings => {
  const sourceReports = (isSparexpert ? SPAREXPERT_CARD_REPORT.filter((report) => !isCashLimitChannel(report.bank)) : IMPORTED_CARD_REPORT) as readonly {
    bank: string;
    rows: readonly { person: string; monthlyLimit?: number; status?: string }[];
  }[];
  const reports = sourceReports.map((report) => ({
    bank: report.bank,
    rows: report.rows.map((row) => ({ ...row })),
  }));

  // Retain a card/person that was created after the original sheet import.
  // Otherwise a browser refresh would silently remove its saved limit.
  for (const [savedBank, bankSettings] of Object.entries(saved || {})) {
    let report = reports.find((item) => normalizeBankKey(item.bank) === normalizeBankKey(savedBank));
    if (!report) {
      report = { bank: savedBank, rows: [] };
      reports.push(report);
    }
    for (const person of new Set([...Object.keys(bankSettings?.limits || {}), ...Object.keys(bankSettings?.statuses || {})])) {
      const canonical = canonicalPersonLabel(person);
      if (!report.rows.some((row) => canonicalPersonLabel(row.person) === canonical)) {
        report.rows.push({ person: canonical, monthlyLimit: 0, status: "" });
      }
    }
  }

  return Object.fromEntries(reports.map((report) => {
    const existing = saved?.[report.bank];
    const limits = { ...existing?.limits };
    const statuses = { ...existing?.statuses };
    for (const [person, limit] of Object.entries(existing?.limits || {})) {
      const canonical = canonicalPersonLabel(person);
      if (!(canonical in limits)) limits[canonical] = limit;
    }
    for (const [person, status] of Object.entries(existing?.statuses || {})) {
      const canonical = canonicalPersonLabel(person);
      if (!(canonical in statuses)) statuses[canonical] = status;
    }
    return [report.bank, {
      // A new bank starts from its actual bank rule.  Saved user choices still
      // remain editable, but income must never be counted as a limit channel.
      rules: { ...defaultCardLimitRulesForBank(report.bank), ...(existing?.rules || {}), income: false },
      limits: Object.fromEntries(report.rows.map((row) => [
        row.person,
        Number.isFinite(Number(limits[row.person]))
          ? Math.max(0, Number(limits[row.person]))
          : Math.max(0, Number(row.monthlyLimit || 0)),
      ])),
      statuses: Object.fromEntries(report.rows.map((row) => [
        row.person,
        statuses[row.person] === "🚫" || statuses[row.person] === "🔒" || statuses[row.person] === "❓" || statuses[row.person] === ""
          ? statuses[row.person]
          : (row.status === "🚫" || row.status === "🔒" || row.status === "❓" ? row.status : ""),
      ])),
    }];
  }));
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
const isAggregateAccount = (name: string) => name.trim().toLocaleLowerCase("az-AZ") === "ümumi";

const canonicalPersonLabel = (raw: string) =>
  raw.trim().replace(/^((?:K|N|BK|H)\.\s*)?hava\s*xan[ıi]m$/iu, (_, prefix = "") => `${prefix}Hava`);

const normalizePersonName = (raw?: string) => {
  const value = canonicalPersonLabel(raw ?? "");
  if (!value) return "Eşqin";
  if (/^K\.X(\d+)$/i.test(value)) return value.replace(/^K\.X/i, "Kart X");
  if (/^K\./i.test(value)) return value.replace(/^K\.\s*/i, "").trim();
  if (/^N\./i.test(value)) return value.replace(/^N\.\s*/i, "").trim();
  if (/^BK\./i.test(value)) return value.replace(/^BK\.\s*/i, "").trim();
  if (/^H\.SimZiraat/i.test(value) || /^H\.SimƏDV/i.test(value) || /^H\.Simran/i.test(value)) return "Simran";
  if (/^H\.SpareRB/i.test(value) || /^H\.Spare/i.test(value) || /^H\.ƏDV/i.test(value)) return "Spare";
  if (/^H\.Ceyhun/i.test(value)) return "Ceyhun";
  if (/^H\./i.test(value)) return value.replace(/^H\.\s*/i, "").trim();
  return value;
};

const resolveEntryPerson = (entry: Pick<Entry, "responsible" | "accountId">, fallbackAccount?: Account) => {
  if (fallbackAccount?.person) return normalizePersonName(fallbackAccount.person);
  const raw = entry.responsible?.trim() || fallbackAccount?.name || "";
  return normalizePersonName(raw);
};

const resolveEntryChannel = (entry: Pick<Entry, "bank" | "responsible" | "accountId">, fallbackAccount?: Account) => {
  const bank = entry.bank?.trim();
  if (bank) return bank;
  if (fallbackAccount?.channel) return fallbackAccount.channel;
  const rawResponsible = entry.responsible?.trim() || fallbackAccount?.name || "";
  if (/^K\./i.test(rawResponsible) || fallbackAccount?.type === "card") return "Kart";
  return "Kassa";
};

const pairAccountId = (person: string, channel: string) =>
  `pair:${encodeURIComponent(normalizePersonName(person))}:${encodeURIComponent(channel.trim() || "Kassa")}`;

const findAccountForPersonChannel = (person: string, channel: string, accountList: Account[] = ACCOUNTS): Account => {
  const cleanPerson = normalizePersonName(person);
  const cleanChannel = channel.trim() || "Kassa";
  const cleanChannelLower = cleanChannel.toLocaleLowerCase("az-AZ");
  const cleanPersonLower = cleanPerson.toLocaleLowerCase("az-AZ");

  // 1. Exact match on acc.person AND acc.channel (Supports multiple accounts per person in different banks/cards)
  const exact = accountList.find(
    (acc) =>
      acc.person &&
      acc.channel &&
      acc.person.toLocaleLowerCase("az-AZ") === cleanPersonLower &&
      acc.channel.toLocaleLowerCase("az-AZ") === cleanChannelLower
  );
  if (exact) return exact;

  // 2. Keyword match on acc.person AND channel (e.g. "Kapital" vs "Kapital ƏDV" vs "Ziraat" vs "Kassa")
  const personMatch = accountList.find((acc) => {
    if (!acc.person || acc.person.toLocaleLowerCase("az-AZ") !== cleanPersonLower) return false;
    const ch = (acc.channel || "").toLocaleLowerCase("az-AZ");
    if (cleanChannelLower.includes("kassa") && (ch.includes("kassa") || acc.type === "cash")) return true;
    if (cleanChannelLower.includes("kapital") && (cleanChannelLower.includes("ədv") ? ch.includes("ədv") : !ch.includes("ədv")) && ch.includes("kapital")) return true;
    if (cleanChannelLower.includes("rabitə") && ch.includes("rabitə")) return true;
    if (cleanChannelLower.includes("ziraat") && ch.includes("ziraat")) return true;
    if (cleanChannelLower.includes("biznes") && ch.includes("biznes")) return true;
    if (cleanChannelLower === "kart" && (ch.includes("kart") || acc.type === "card")) return true;
    return false;
  });
  if (personMatch) return personMatch;

  // 3. Fallback for Azart Membran and general cash/card logic
  const isCash = cleanChannelLower === "kassa";
  if (isCash) {
    if (cleanPersonLower === "ümumi") {
      const umumi = accountList.find((acc) => isAggregateAccount(acc.name));
      if (umumi) return umumi;
    }
    const match = accountList.find(
      (acc) =>
        acc.type === "cash" &&
        !acc.name.startsWith("K.") &&
        !isAggregateAccount(acc.name) &&
        (acc.name.toLocaleLowerCase("az-AZ") === cleanPersonLower ||
         (acc.person && acc.person.toLocaleLowerCase("az-AZ") === cleanPersonLower))
    );
    if (match) return match;
  } else {
    const matchChannel = accountList.find(
      (acc) => acc.name.toLocaleLowerCase("az-AZ") === cleanChannelLower
    );
    if (matchChannel) return matchChannel;

    const matchK = accountList.find(
      (acc) =>
        acc.name.startsWith("K.") &&
        normalizePersonName(acc.name).toLocaleLowerCase("az-AZ") === cleanPersonLower
    );
    if (matchK) return matchK;

    const matchDirect = accountList.find(
      (acc) =>
        (acc.type === "card" || acc.type === "bank") &&
        (acc.name.toLocaleLowerCase("az-AZ") === cleanPersonLower ||
         acc.name.toLocaleLowerCase("az-AZ") === cleanChannelLower)
    );
    if (matchDirect) return matchDirect;
  }

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

const getReconRowCategory = (name: string, isSpare: boolean, catalog: Account[]): "cash" | "bank" | "card" => {
  if (isAggregateAccount(name) || name === "Ümumi" || name === "Ümumi Cəmi") return "cash";
  const acc = catalog.find((a) => a.id === name || a.name === name);
  if (acc?.type === "cash") return "cash";
  if (acc?.type === "bank") return "bank";
  if (acc?.type === "card") return "card";

  if (name.startsWith("N.")) return "cash";
  if (name.startsWith("H.")) return "bank";
  if (name.startsWith("K.") || name.startsWith("BK.") || name.startsWith("Kart")) return "card";
  if (name === "Ceyhun") return "card";
  if (acc?.channel === "Kassa") return "cash";
  if (acc?.channel?.includes("Bank") || acc?.channel?.includes("ƏDV")) return "bank";
  return "card";
};

const getAccountDisplayInfo = (name: string, isSpare: boolean, accountCatalog: Account[], autoTo = false) => {
  if (!isSpare) {
    const isAgg = isAggregateAccount(name);
    const isCard = /^K\./i.test(name) || /^Kart/i.test(name);
    const cleanName = isAgg ? "Ümumi Kassa və Bank" : normalizePersonName(name);
    const badgeText = isAgg ? "Bütün hesablar" : isCard ? "Kart / Bank" : autoTo ? "Kassa · Avto TÖ" : "Kassa";
    const badgeClass = isAgg ? "total" : isCard ? "bank" : "cash";
    return { cleanName, badgeText, badgeClass };
  }

  if (isAggregateAccount(name) || name === "Ümumi" || name === "Ümumi Cəmi") {
    return { cleanName: "Ümumi Cəmi", badgeText: "Cəmi", badgeClass: "total" };
  }

  const acc = accountCatalog.find((a) => a.name === name || a.id === name);
  if (name === "H.Spare") return { cleanName: "Spare (Əsas)", badgeText: "Kapital Bank", badgeClass: "bank" };
  if (name === "H.ƏDV") return { cleanName: "Spare (ƏDV)", badgeText: "Kapital Bank", badgeClass: "bank" };
  if (name === "H.Simran") return { cleanName: "Simran (Əsas)", badgeText: "Kapital Bank", badgeClass: "bank" };
  if (name === "H.SimƏDV") return { cleanName: "Simran (ƏDV)", badgeText: "Kapital Bank", badgeClass: "bank" };
  if (name === "H.Ceyhun") return { cleanName: "Ceyhun", badgeText: "Kapital Bank", badgeClass: "bank" };
  if (name === "H.SpareRB") return { cleanName: "Spare", badgeText: "Rabitə Bank", badgeClass: "bank" };
  if (name === "H.SimZiraat") return { cleanName: "Simran", badgeText: "Ziraat Bank", badgeClass: "bank" };
  if (name === "BK.Simran") return { cleanName: "Simran", badgeText: "Biznes Kart", badgeClass: "card" };
  if (name === "Kart X1") return { cleanName: "Simran (Ziraat)", badgeText: "Kart X1", badgeClass: "card" };
  if (name.startsWith("N.")) return { cleanName: name.replace(/^N\./, "").trim(), badgeText: "Kassa", badgeClass: "cash" };
  if (name.startsWith("K.")) return { cleanName: name.replace(/^K\./, "").trim(), badgeText: "Kart", badgeClass: "card" };
  if (name.startsWith("Kart")) return { cleanName: name, badgeText: "Kart", badgeClass: "card" };
  if (name.startsWith("H.")) return { cleanName: name.replace(/^H\./, "").trim(), badgeText: "Bank Hesabı", badgeClass: "bank" };
  if (name === "Ceyhun") return { cleanName: "Ceyhun", badgeText: "Kart", badgeClass: "card" };

  const person = acc?.person || normalizePersonName(name);
  const badgeText = acc?.channel || (acc?.type === "cash" ? "Kassa" : acc?.type === "bank" ? "Bank" : "Kart");
  const badgeClass = acc?.type === "cash" ? "cash" : acc?.type === "bank" ? "bank" : "card";
  return { cleanName: person || name, badgeText, badgeClass };
};

const isLegacySimranZiraat = (value?: string) => {
  let name = value ?? "";
  if (name.startsWith("pair:")) {
    try { name = decodeURIComponent(name.split(":")[1] ?? ""); } catch { return false; }
  }
  return /^(?:k|kart)x1$/i.test(name.replace(/[\s._-]+/g, ""));
};
const isRetiredSparePerson = (value?: string) =>
  isLegacySimranZiraat(value) || /^(?:kart|k)x\d+$/i.test((value || "").replace(/[\s._-]+/g, "")) || /^(?:h)?x[34]$/i.test((value || "").replace(/[\s._-]+/g, ""));

const spareRelease = import.meta.env.VITE_SPAREXPERT_RELEASE === "1";
const spareImportedAccounts = new Map<string, Entry>((spareRelease ? [] : SPAREXPERT_ENTRIES).map((entry) => [entry.id, entry as Entry]));
const recoverSpareImportedAccount = (entry: Entry): Entry => {
  const original = spareImportedAccounts.get(entry.id);
  if (!original) return entry;
  // Older browser versions rewrote imported account IDs using the Azart catalog.
  const source = entry.accountId?.startsWith("pair:") || !entry.accountId || entry.accountId === entry.responsible;
  const target = entry.kind === "transfer" && (entry.targetAccountId?.startsWith("pair:") || !entry.targetAccountId || entry.targetAccountId === entry.targetResponsible);
  const canonicalId = (id?: string) => isLegacySimranZiraat(id) ? "H.SimZiraat" : id;
  const reversed = entry.kind === "transfer" && original.kind === "transfer" && entry.date === original.date &&
    Math.abs(entry.amount) === Math.abs(original.amount) &&
    canonicalId(entry.accountId) === original.targetAccountId && canonicalId(entry.targetAccountId) === original.accountId &&
    original.accountId !== original.targetAccountId;
  return {
    ...entry,
    ...(source || reversed ? { accountId: original.accountId, bank: original.bank, responsible: original.responsible } : {}),
    ...((target || reversed) && original.targetAccountId ? { targetAccountId: original.targetAccountId, targetBank: original.targetBank, targetResponsible: original.targetResponsible } : {}),
    ...(reversed ? { title: original.title, counterparty: original.counterparty } : {}),
  };
};

const migrateManualAccountIds = (dailyState: DailyState, isSparexpert = false): DailyState => ({
  ...dailyState,
  entries: dailyState.entries.map((rawEntry) => {
    const entry = isSparexpert ? recoverSpareImportedAccount(rawEntry) : rawEntry;
    if (isSparexpert) {
      const fromX1 = isLegacySimranZiraat(entry.accountId) || isLegacySimranZiraat(entry.responsible);
      const toX1 = isLegacySimranZiraat(entry.targetAccountId) || isLegacySimranZiraat(entry.targetResponsible);
      return {
        ...entry,
        ...(fromX1 ? { accountId: "H.SimZiraat", bank: "Ziraat Bank", responsible: "Simran" } : {}),
        ...(toX1 ? { targetAccountId: "H.SimZiraat", targetBank: "Ziraat Bank", targetResponsible: "Simran" } : {}),
        ...(entry.kind === "transfer" && isLegacySimranZiraat(entry.counterparty) &&
            (toX1 || entry.targetAccountId === "H.SimZiraat") ? {
          counterparty: "Simran · Ziraat Bank",
          title: entry.title.replace(/\b(?:kart|k)[\s._-]*x[\s._-]*1\b/gi, "Simran · Ziraat Bank"),
        } : {}),
      };
    }
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
const SPAREXPERT_FIRST_DATE = "2026-11-01";
const SPAREXPERT_FIRST_MONTH = SPAREXPERT_FIRST_DATE.slice(0, 7);

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
const monthKey = (date: string) => date.slice(0, 7);
const shiftMonth = (key: string, months: number) => {
  const [year, month] = key.split("-").map(Number);
  const value = new Date(year, month - 1 + months, 1, 12);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}`;
};
const monthLabel = (key: string) => dateLabel(`${key}-01`, { month: "long", year: "numeric" });
const IMPORTED_CARD_REPORT_MONTH = (IMPORTED_ENTRIES as readonly { date: string }[]).reduce(
  (latest, entry) => monthKey(entry.date) > latest ? monthKey(entry.date) : latest,
  "0000-00"
);
const formatMoney = (value: number, currency: Currency) => {
  const [whole, decimal] = Math.abs(value).toFixed(2).split(".");
  const amount = `${value < 0 ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimal}`;
  if (currency === "AZN") return `${amount} ₼`;
  if (currency === "USD") return `$${amount}`;
  return `${amount} ₺`;
};
const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");
// Baza!I suppliers entered without T.; names also listed in Baza!H are excluded.
const spareUnprefixedSuppliers = new Set(["Ruslan elektrik", "PRIME SERV CONS", "Şahin ölüxana", "Proling Caspian", "AzərMaş MMC", "Salnik Dünyası", "Xocasən Ölüxanası", "Sənan Avto", "Atəşgah sığorta", "Yedpa (nəğd)", "İbrahim avto", "M-trans nəğd", "Elmir elektrik", "Top servis", "MİN AUTO PARTS", "Qara Bazar", "EVA AİR MMC", "Bilinm təchiz", "Tural Usta", "Məmməd Usta", "Ölüxana Kamal", "Rəşad usta", "Lender", "Mikayıl", "Ayxan usta", "Kamal usta", "Ramin malyar", "Paşa", "Asim spare"].map((name) => name.toLocaleLowerCase("az-AZ")));
const sparexpertPartyType = (name: string) => {
  const prefix = name.trim().match(/^([TƏY])\s*\./iu)?.[1].toLocaleUpperCase("az-AZ");
  return prefix === "T" ? "seller" : prefix === "Ə" ? "employee" : prefix === "Y" ? "investor" :
    spareUnprefixedSuppliers.has(name.trim().normalize("NFC").toLocaleLowerCase("az-AZ")) ? "seller" : "customer";
};
// Verified SpareXpert Baza contacts for roles missing from older directories.
const spareRoleDirectory = ["Ə. Elşən", "Ə. Ceyhun", "Ə. Kənan", "Ə. Sadiq", "Ə. Mikayıl", "Ə. Tofiq", "Ə. Ədilə", "Ə. Vəli", "Ə. Heydər", "Ə. Simran", "Ə.Zaur", "Ə.Asif", "Ə.İslam", "Ə.Baba", "Ə.Elgiz", "Ə. Vaqif (Razval)", "Ə. Arif Mahmud", "Ə.Ruslan", "Ə. Ümid", "Ə. Fariz", "Ə. Mətləb", "Ə. Nurlan", "Ə. Baladayı", "Ə. Fuad", "Ə. Paşa", "Ə. Ruslan təkərçi", "Ə. Ramil", "Ə. Xəyal", "Ə. Namiq elektrik", "Ə. Əli", "Ə. Fərid təkərçi", "Ə. Aqil", "Ə. Ayxan", "Ə. Məhəmməd elek", "Ə. Nicat", "Ə. Mövsüm", "Ə. Asim", "Ə. Həsən", "Ə. Tərlan", "Ə. Tural", "Ə. Yahya", "Ə. Təkərçi", "Ə. Rəşad", "Ə. Şamxal", "Ə. Abdulla", "Y. Adil", "Y. Kənan", "Y. Fuad", "Y. Ceyhun"];
const spareDirectoryRoles = [
  { key: "customer", label: "Müştərilər", single: "Müştəri", prefix: "" },
  { key: "seller", label: "Satıcılar", single: "Satıcı", prefix: "T. " },
  { key: "employee", label: "Əməkdaşlar", single: "Əməkdaş", prefix: "Ə. " },
  { key: "investor", label: "İnvestorlar", single: "İnvestor", prefix: "Y. " },
] as const;
const isSparexpertCustomer = (name: string) => {
  const normalized = name.trim().toLocaleLowerCase("az-AZ");
  return Boolean(normalized) && !["rasxod", "qeyd edilməyib", ".", "—"].includes(normalized) &&
    sparexpertPartyType(name) === "customer";
};
const emptyCardActivity = () => ({ income: 0, onlinePayment: 0, sameBankTransfer: 0, diffBankTransfer: 0, cashOut: 0 });
// Confirmed opening balance for this card; earlier movements remain in the ledger.
// November's Kart Hesabat opening column, with the confirmed Elgiz correction.
const SPARE_KAPITAL_OPENING: Readonly<Record<string, number>> = {
  "kənan": SPAREXPERT_NOVEMBER_OPENING["K.Kənan"],
  simran: SPAREXPERT_NOVEMBER_OPENING["K.Simran"],
  elgiz: SPAREXPERT_NOVEMBER_OPENING["K.Elgiz"],
  "kart x2": SPAREXPERT_NOVEMBER_OPENING["Kart X2"],
};
function spareCardOpening(person: string, bank: string): number {
  return spareBankKey(bank) === "kapital"
    ? SPARE_KAPITAL_OPENING[normalizePersonName(person).toLocaleLowerCase("az-AZ")] ?? 0
    : 0;
}
type CardActivity = ReturnType<typeof emptyCardActivity>;
type CardReportRow = CardActivity & {
  person: string;
  opening: number;
  balance: number;
  status: string;
  monthlyLimit: number;
  limitRemaining: number;
};
type CardReportGroup = { bank: string; code: string; totalBalance: number; rows: CardReportRow[] };
const spareBankKey = (bank?: string) => {
  const key = normalizeBankKey(bank);
  return key === "other" ? bank?.trim().toLocaleLowerCase("az-AZ") ?? "" : key;
};
function addSpareCardActivity(activity: CardActivity, entry: Entry, side: "source" | "target") {
  const amount = Math.round(Math.abs(entry.amount) * 100) / 100;
  if (side === "target" || entry.kind === "income") activity.income += amount;
  else if (entry.kind === "transfer") {
    const target = spareBankKey(entry.targetBank);
    if (target === "kassa") activity.cashOut -= amount;
    else if (target === spareBankKey(entry.bank)) activity.sameBankTransfer -= amount;
    else activity.diffBankTransfer -= amount;
  } else if (/^nd$/i.test(entry.card?.trim() ?? "")) activity.cashOut -= amount;
  else if (entry.expenseMethod === "same_bank") activity.sameBankTransfer -= amount;
  else if (entry.expenseMethod === "diff_bank") activity.diffBankTransfer -= amount;
  else activity.onlinePayment -= amount;
}

const seedEntries = (isSpare = false): Entry[] => {
  if (isSpare) return (spareRelease ? [] : SPAREXPERT_ENTRIES as unknown as Entry[]).map((entry) => ({ ...entry }));
  return IMPORTED_ENTRIES.map((entry) => ({ ...entry })) as Entry[];
};

const loadState = (): DailyState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return migrateManualAccountIds(JSON.parse(saved) as DailyState);
  } catch {
    // The prototype remains usable when browser storage is unavailable.
  }
  return migrateManualAccountIds({ entries: seedEntries(false), closes: [] });
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

function ViewTabs({ view, onChange, onCreate, createDisabled, collapsed, hasQaime = true, mobileReports = false }: { view: View; onChange: (view: View) => void; onCreate: () => void; createDisabled?: boolean; collapsed?: boolean; hasQaime?: boolean; mobileReports?: boolean }) {
  const iconSize = collapsed ? 22 : 19;
  return <nav className={cx("page-tabs", !hasQaime && "spare-page-tabs")} aria-label="Daily bölmələri">
    <button className={view === "daily" ? "active" : ""} title={collapsed ? "Gündəlik dəftər" : undefined} onClick={() => onChange("daily")}><BookOpen size={iconSize} /><span>Gündəlik dəftər</span></button>
    {hasQaime && <button className={view === "invoices" ? "active" : ""} title={collapsed ? "Qaimələr" : undefined} onClick={() => onChange("invoices")}><FileText size={iconSize} /><span>Qaimələr</span></button>}
    <button className="mobile-create-entry" aria-label={view === "invoices" ? "Yeni qaimə yarat" : "Yeni əməliyyat yarat"} title={view === "invoices" ? "Yeni qaimə" : "Yeni əməliyyat"} onClick={onCreate} disabled={createDisabled}><Plus size={24} /><span>Yarat</span></button>
    <button className={view === "customers" ? "active" : ""} title={collapsed ? "Müştərilər" : undefined} onClick={() => onChange("customers")}><Users size={iconSize} /><span>Müştərilər</span></button>
    <button className={cx(view === "accounts" && "active", mobileReports && "mobile-reports-link", mobileReports && view === "reports" && "mobile-reports-current", !hasQaime && "spare-accounts-tab")} title={collapsed ? "Hesablar" : undefined} onClick={() => onChange("accounts")}><WalletCards size={iconSize} /><span className="accounts-label">Hesablar</span>{mobileReports && <span className="mobile-reports-label">Hesabatlar</span>}</button>
    <button className={cx("desktop-reports-tab", view === "reports" && "active")} title={collapsed ? "Hesabatlar" : undefined} onClick={() => onChange("reports")}><BarChart3 size={iconSize} /><span>Hesabatlar</span></button>
  </nav>;
}

const getCompanyStorageKey = (companyId: string | undefined, key: string) => {
  const norm = (companyId || "azartmembran").trim().toLowerCase();
  return `arix-daily-${norm}-${key}`;
};

const getSavedStorageItem = (companyId: string | undefined, key: string, legacyKey?: string) => {
  const norm = (companyId || "azartmembran").trim().toLowerCase();
  const companyItem = localStorage.getItem(`arix-daily-${norm}-${key}`);
  if (companyItem !== null) return companyItem;
  if (norm === "azartmembran" && legacyKey) {
    return localStorage.getItem(legacyKey);
  }
  return null;
};

const setSavedStorageItem = (companyId: string | undefined, key: string, value: string) => {
  const norm = (companyId || "azartmembran").trim().toLowerCase();
  try {
    localStorage.setItem(`arix-daily-${norm}-${key}`, value);
  } catch {
    // quota safe
  }
};

const investorPaymentCategory = "Yatırımçıya ödəniş";
const investorKey = (name: string) => name.trim().replace(/^y\s*\.\s*/iu, "Y. ").toLocaleLowerCase("az-AZ");
const investorParty = (name: string) => /^y\s*\.\s*\S/iu.test(name.trim());
const legacyInvestorCategory = (category: string) => /^y\s*\.\s*ödəniş(?:\s*\([a-z]+\))?$/iu.test(category.trim());
const spareEntryCategories = (categories: string[]) => [
  ...categories.filter((category) => !legacyInvestorCategory(category) && investorKey(category) !== investorKey(investorPaymentCategory)),
  investorPaymentCategory,
];

// Verified opening figures from the November Cədvəl Hesabat worksheet, in cents.


function InvestorSummaryBlock({ entries, month, parties }: { entries: Entry[]; month: string; parties: string[] }) {

  const summary = useMemo(() => {
    const legacy = { a: "Y. Adil", c: "Y. Ceyhun", k: "Y. Kənan" } as Record<string, string>;
    const investors = new Map<string, string>();
    for (const party of [...parties, ...entries.map((entry) => entry.counterparty || ""), ...Object.values(legacy)]) {
      if (investorParty(party)) investors.set(investorKey(party), party.trim().replace(/^y\s*\.\s*/iu, "Y. "));
    }
    return Array.from(investors, ([key, name]) => {
      let opening = spareInvestorOpening[key] ?? 0;
      const daily = new Map<string, number>();
      for (const e of entries) {
        if (e.date < SPAREXPERT_FIRST_DATE || monthKey(e.date) > month) continue;
        const cp = investorKey(e.counterparty || "");
        const cat = investorKey(e.category || "");
        const owner = cp === key;
        const legacyCode = cat.match(/^y\. ödəniş \(([a-z]+)\)$/)?.[1];
        const repaymentCode = legacyCode && (legacy[legacyCode] ? investorKey(legacy[legacyCode]) === key : owner);
        const cents = Math.round(Math.abs(e.amount) * 100);
        let delta: number;
        if (e.kind === "income" && cat === "yatırım" && owner) delta = cents;
        else if (e.kind === "expense" && (repaymentCode || (owner && (cat === "y. ödəniş" || cat === investorKey(investorPaymentCategory))))) delta = -cents;
        else continue;
        if (monthKey(e.date) < month) opening += delta;
        else daily.set(e.date, (daily.get(e.date) ?? 0) + delta);
      }
      return {
        name,
        opening: opening / 100,
        closing: (opening + [...daily.values()].reduce((sum, delta) => sum + delta, 0)) / 100,
        movements: [...daily].sort(([a], [b]) => a.localeCompare(b)),
      };
    }).filter((investor) => investor.opening !== 0 || investor.movements.length > 0 ||
      parties.some((party) => investorKey(party) === investorKey(investor.name)));
  }, [entries, month, parties]);

  return (
    <div className="investor-summary-card">
      <div className="investor-summary-header">
        <div className="investor-title-wrap">
          <Landmark size={18} className="investor-icon" />
          <b>İnvestor fəaliyyəti · {monthLabel(month)}</b>
        </div>
      </div>
      <div className="investor-grid">
        {summary.map((inv) => (
          <div key={inv.name} className="investor-item">
            <span className="investor-name">{inv.name}</span>
            <div className="pivot-list">
              <article><span>Əvvəldən qalıq</span><strong className={inv.opening < 0 ? "negative" : undefined}>{formatMoney(inv.opening, "AZN")}</strong></article>
              {inv.movements.length === 0 && <article><span>Bu ay üçün əməliyyat yoxdur.</span></article>}
              {inv.movements.map(([date, cents]) => <article key={date}>
                <span>{dateLabel(date, { day: "numeric", month: "short" })}</span>
                <strong className={cents < 0 ? "negative" : cents > 0 ? "positive" : undefined}>{formatMoney(cents / 100, "AZN")}</strong>
              </article>)}
              <article className="investor-closing"><b>Yekun qalıq</b><strong className={inv.closing < 0 ? "negative" : undefined}>{formatMoney(inv.closing, "AZN")}</strong></article>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DailyWorkspace({ session, onLogout }: { session: DailySession; onLogout: () => void }) {
  const can = (permission: string) => session.role.toLocaleLowerCase("az") === "sahib" || Boolean(session.permissions?.includes(permission));
  const isSparexpert = session.companyId === "sparexpert" || session.company?.id === "sparexpert";
  const activeCompanyId = isSparexpert ? "sparexpert" : "azartmembran";
  const [spareReportMonth, setSpareReportMonth] = useState(() => monthKey(todayKey < SPAREXPERT_FIRST_DATE ? SPAREXPERT_FIRST_DATE : todayKey));
  const [spareReportCards, setSpareReportCards] = useState(false);
  const spareMonth = isSparexpert ? { value: spareReportMonth, set: setSpareReportMonth } : undefined;
  const localPreviewParams = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? new URLSearchParams(window.location.search)
    : null;
  const previewView = localPreviewParams?.get("view");
  const previewDate = localPreviewParams?.get("date");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("arix-daily-theme");
    if (saved === "dark" || saved === "light") return saved;
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  });
  const hasQaime = session.company?.features?.qaime !== false;
  const [view, setView] = useState<View>(() => {
    const initial = ["daily", "invoices", "customers", "accounts", "reports", "cashboxes", "people", "categories", "management", "settings"].includes(previewView || "") ? previewView as View : "daily";
    return (!hasQaime && initial === "invoices") ? "daily" : initial;
  });
  const [remoteAccounts, setRemoteAccounts] = useState<Account[] | null>(null);
  const [dailyContextMenu, setDailyContextMenu] = useState<{ target: DailyContextTarget; x: number; y: number } | null>(null);
  const [accountContextEdit, setAccountContextEdit] = useState<Account | null>(null);
  const [switchingCompany, setSwitchingCompany] = useState(false);

  useEffect(() => {
    if (!hasQaime && view === "invoices") {
      setView("daily");
    }
  }, [hasQaime, view]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("arix-daily-sidebar-collapsed") === "1");
  const [managementOpen, setManagementOpen] = useState(() => localStorage.getItem("arix-daily-management-open") !== "0");
  const [topMenu, setTopMenu] = useState<"language" | "notifications" | "profile" | "company" | null>(null);
  const [notifications, setNotifications] = useState<DailyNotification[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const personalNotificationKey = `arix-daily-${activeCompanyId}-notifications:${session.id}`;
  const [personalNotification, setPersonalNotification] = useState<{ key: string; inApp: boolean } | null>(null);
  const [personalNotificationSettingsOpen, setPersonalNotificationSettingsOpen] = useState(false);
  const [personalPushBusy, setPersonalPushBusy] = useState(false);
  const [personalPushStatus, setPersonalPushStatus] = useState("");
  const inAppNotificationsEnabled = personalNotification?.key === personalNotificationKey
    ? personalNotification.inApp
    : (() => { try { return localStorage.getItem(personalNotificationKey) !== "off"; } catch { return true; } })();
  const setInAppNotificationsEnabled = (inApp: boolean) => {
    setPersonalNotification({ key: personalNotificationKey, inApp });
    try { localStorage.setItem(personalNotificationKey, inApp ? "on" : "off"); } catch { /* Storage can be unavailable. */ }
    if (!inApp) setNotificationToast(null);
  };

  const [notificationToast, setNotificationToast] = useState<DailyNotification | null>(null);
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());
  const notificationsInitializedRef = useRef(false);
  const dayCalendarRef = useRef<HTMLDialogElement>(null);
  const [calendarMonth, setCalendarMonth] = useState(todayKey.slice(0, 7));
  const [state, setState] = useState<DailyState>(() => {
    try {
      const saved = getSavedStorageItem(activeCompanyId, "imported-v4", STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as DailyState;
        if (Array.isArray(parsed?.entries) && parsed.entries.length >= (isSparexpert ? 500 : 100)) {
          return migrateManualAccountIds(parsed, isSparexpert);
        }
      }
    } catch {}
    return migrateManualAccountIds({ entries: seedEntries(isSparexpert), closes: [] }, isSparexpert);
  });
  const [selectedDate, setSelectedDate] = useState(() => {
    if (previewDate && /^\d{4}-\d{2}-\d{2}$/.test(previewDate)) return isSparexpert && previewDate < SPAREXPERT_FIRST_DATE ? SPAREXPERT_FIRST_DATE : previewDate;
    if (isSparexpert && session.id === "daily-local-dev") {
      return state.entries.reduce((latest, entry) => entry.date >= SPAREXPERT_FIRST_DATE && entry.date > latest && entry.date <= todayKey ? entry.date : latest, "") || (todayKey < SPAREXPERT_FIRST_DATE ? SPAREXPERT_FIRST_DATE : todayKey);
    }
    return todayKey;
  });
  const [peopleList, setPeopleList] = useState<string[]>(() => {
    const initial = isSparexpert ? SPAREXPERT_PEOPLE : DEFAULT_PEOPLE;
    const saved = getSavedStorageItem(activeCompanyId, "directory-people-v2", "arix-daily-directory-people-v2");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
      } catch {}
    }
    return initial;
  });
  const [channelList, setChannelList] = useState<string[]>(() => {
    const initial = isSparexpert ? SPAREXPERT_CHANNELS : DEFAULT_CHANNELS;
    const saved = getSavedStorageItem(activeCompanyId, "directory-cashboxes-v3", "arix-daily-directory-cashboxes-v3");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
      } catch {}
    }
    return initial;
  });
  const [categoryList, setCategoryList] = useState<string[]>(() => {
    const initial = isSparexpert ? spareEntryCategories(SPAREXPERT_CATEGORIES) : DEFAULT_CATEGORIES;
    const saved = getSavedStorageItem(activeCompanyId, "directory-categories", "arix-daily-directory-categories");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return isSparexpert ? spareEntryCategories(parsed) : parsed as string[];
      } catch {}
    }
    return initial;
  });
  const [customerList, setCustomerList] = useState<string[]>(() => {
    const initial = isSparexpert ? (spareRelease ? [] : SPAREXPERT_CUSTOMERS) : DEFAULT_CUSTOMERS;
    const saved = getSavedStorageItem(activeCompanyId, "directory-customers-v1", "arix-daily-directory-customers-v1");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
      } catch {}
    }
    return initial;
  });
  const [bankLogos, setBankLogos] = useState<BankDirectory>(() => {
    try { return JSON.parse(getSavedStorageItem(activeCompanyId, "bank-logos-v1") || "{}") || {}; } catch { return {}; }
  });
  const [customBanks, setCustomBanks] = useState<string[]>(() => {
    try { return JSON.parse(getSavedStorageItem(activeCompanyId, "bank-directory-v1") || "[]") || []; } catch { return []; }
  });
  useEffect(() => {
    setSavedStorageItem(activeCompanyId, "bank-logos-v1", JSON.stringify(bankLogos));
    setSavedStorageItem(activeCompanyId, "bank-directory-v1", JSON.stringify(customBanks));
  }, [activeCompanyId, bankLogos, customBanks]);
  const [customAccounts, setCustomAccounts] = useState<Account[]>(() => {
    const saved = getSavedStorageItem(activeCompanyId, "custom-accounts-v2");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed as Account[];
      } catch {}
    }
    return [];
  });
  useEffect(() => {
    setSavedStorageItem(activeCompanyId, "custom-accounts-v2", JSON.stringify(customAccounts));
  }, [customAccounts, activeCompanyId]);
  const [rules, setRules] = useState<CalculationRules>(() => {
    const initial: CalculationRules = isSparexpert
      ? {
          autoSupplierEnabled: false,
          autoSupplierAccounts: [],
          internalTransferMode: "separate" as const,
          showDayCheckMetrics: false,
          hideZeroPlaceholderCards: true,
        }
      : DEFAULT_RULES;
    const saved = getSavedStorageItem(activeCompanyId, "calc-rules-v1", RULES_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") return { ...initial, ...parsed };
      } catch {}
    }
    return initial;
  });
  const [customerDebts, setCustomerDebts] = useState<Record<string, number>>(() => {
    if (isSparexpert) return {};
    try {
      const saved = getSavedStorageItem(activeCompanyId, "customer-debts-v1", "arix-daily-customer-debts-v1");
      if (saved) return JSON.parse(saved) as Record<string, number>;
    } catch {}
    return { ...(IMPORTED_CUSTOMER_DEBTS as unknown as Record<string, number>) };
  });
  const [pastMonthUninvoiced, setPastMonthUninvoiced] = useState<Record<string, number>>(() => {
    if (isSparexpert) return {};
    try {
      const saved = getSavedStorageItem(activeCompanyId, "past-month-v2", "arix-daily-past-month-v2");
      if (saved) return JSON.parse(saved) as Record<string, number>;
    } catch {}
    return { ...(IMPORTED_PAST_MONTH_UNINVOICED as unknown as Record<string, number>) };
  });
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => {
    if (isSparexpert) return [];
    try {
      const saved = getSavedStorageItem(activeCompanyId, "invoices-v1", "arix-daily-invoices-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as InvoiceRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter((invoice) => invoice.id !== "inv-seed-32609");
      }
    } catch {}
    return [];
  });
  // Keep the cap and its bank-specific rules in the shared snapshot from the
  // very first load.  Leaving this as null made the screen fall back to the
  // imported monthly report after a refresh, so a saved limit could appear to
  // change when navigating between months or devices.
  const [cardLimitSettings, setCardLimitSettings] = useState<CardLimitSettings>(() =>
    normalizeCardLimitSettings(null, isSparexpert)
  );
  const effectiveCardLimitSettings = useMemo(
    () => normalizeCardLimitSettings(cardLimitSettings, isSparexpert),
    [cardLimitSettings, isSparexpert]
  );
  const [syncStatus, setSyncStatus] = useState<"loading" | "saved" | "saving" | "offline" | "conflict">("loading");
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const syncRevisionRef = useRef<number | null>(null);
  const syncReadyRef = useRef(false);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastRemoteSnapshotFingerprintRef = useRef("");
  const localSnapshotChangePendingRef = useRef(false);
  const snapshotPollBusyRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const invoicesRef = useRef(invoices);
  invoicesRef.current = invoices;
  const [selectedCrmCustomer, setSelectedCrmCustomer] = useState<string | null>(null);
  const [directoryRole, setDirectoryRole] = useState<(typeof spareDirectoryRoles)[number]["key"]>("customer");
  const directorySection = spareDirectoryRoles.find(({ key }) => key === directoryRole)!;
  const directoryName = (name: string) => directorySection.prefix
    ? directorySection.prefix + name.trim().replace(/^[TƏY]\s*\.\s*/iu, "")
    : name;

  const [externalInvoiceCustomer, setExternalInvoiceCustomer] = useState<string | null>(null);
  const [externalEditingInvoice, setExternalEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [invoiceCreateSignal, setInvoiceCreateSignal] = useState(0);
  const [entryOpen, setEntryOpen] = useState(() => Boolean(localPreviewParams?.get("modal") === "entry"));
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [entryDialogBusy, setEntryDialogBusy] = useState(false);
  const [entryDialogError, setEntryDialogError] = useState("");
  const [entryNotice, setEntryNotice] = useState("");
  const [entryChangeRequests, setEntryChangeRequests] = useState<EntryChangeRequest[]>([]);
  const [entryApprovalOpen, setEntryApprovalOpen] = useState(false);
  const [entryApprovalBusy, setEntryApprovalBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [noteSummaryDate, setNoteSummaryDate] = useState<string | null>(null);
  const [statementAccountName, setStatementAccountName] = useState<string | null>(null);
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
    changeReason: "",
    expenseMethod: "online",
  });

  const [removedSpareParties, setRemovedSpareParties] = useState<string[]>(() => {
    try {
      const stored = getSavedStorageItem(activeCompanyId, "removed-parties-v2");
      const previous = JSON.parse(getSavedStorageItem(activeCompanyId, "removed-parties-v1") || "[]");
      const saved = stored ? JSON.parse(stored) : ["y.fuad", ...(Array.isArray(previous) ? previous : [])];
      return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : [];
    } catch { return []; }
  });
  const partyDirectoryKey = (name: string) => investorKey(name).replace(/\s+/g, "");
  useEffect(() => {
    if (isSparexpert) setSavedStorageItem(activeCompanyId, "removed-parties-v2", JSON.stringify(removedSpareParties));
  }, [activeCompanyId, isSparexpert, removedSpareParties]);
  const visibleDirectory = useMemo(() => {
    if (!isSparexpert) return customerList;
    const records = new Map(spareRoleDirectory.map((name) => [investorKey(name).replace(/\s+/g, ""), name]));
    for (const name of customerList) records.set(investorKey(name).replace(/\s+/g, ""), name);
    return [...records].filter(([key]) => !removedSpareParties.includes(key)).map(([, name]) => name);
  }, [customerList, isSparexpert, removedSpareParties]);
  const entryCounterpartyOptions = useMemo(() => {
    const options = new Map<string, string>();
    const addOption = (raw?: string) => {
      const value = raw?.trim();
      if (!value || value === "Qeyd edilməyib") return;
      if (isSparexpert && removedSpareParties.includes(partyDirectoryKey(value))) return;
      const key = value.toLocaleLowerCase("az-AZ");
      if (!options.has(key)) options.set(key, value);
    };

    DEFAULT_CUSTOMERS.forEach(addOption);
    visibleDirectory.forEach(addOption);
    Object.keys(customerDebts).forEach(addOption);
    invoices.forEach((invoice) => addOption(invoice.customer));
    state.entries.forEach((entry) => addOption(entry.counterparty));

    return Array.from(options.values()).sort((left, right) => left.localeCompare(right, "az-AZ"));
  }, [visibleDirectory, customerDebts, invoices, state.entries, isSparexpert, removedSpareParties]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem("arix-daily-theme", theme); } catch { /* quota safe */ }
  }, [theme]);
  useEffect(() => {
    try { localStorage.setItem("arix-daily-sidebar-collapsed", sidebarCollapsed ? "1" : "0"); } catch { /* safe */ }
  }, [sidebarCollapsed]);
  useEffect(() => {
    try { localStorage.setItem("arix-daily-management-open", managementOpen ? "1" : "0"); } catch { /* safe */ }
  }, [managementOpen]);
  useEffect(() => {
    setSavedStorageItem(activeCompanyId, "imported-v4", JSON.stringify(state));
  }, [state, activeCompanyId]);
  useEffect(() => {
    setSavedStorageItem(activeCompanyId, "directory-people-v2", JSON.stringify(peopleList));
  }, [peopleList, activeCompanyId]);
  useEffect(() => {
    setSavedStorageItem(activeCompanyId, "directory-cashboxes-v3", JSON.stringify(channelList));
  }, [channelList, activeCompanyId]);
  useEffect(() => {
    setSavedStorageItem(activeCompanyId, "directory-categories", JSON.stringify(categoryList));
  }, [categoryList, activeCompanyId]);
  useEffect(() => {
    setSavedStorageItem(activeCompanyId, "directory-customers-v1", JSON.stringify(customerList));
  }, [customerList, activeCompanyId]);
  useEffect(() => {
    setSavedStorageItem(activeCompanyId, "calc-rules-v1", JSON.stringify(rules));
  }, [rules, activeCompanyId]);
  useEffect(() => {
    if (isSparexpert) return;
    setSavedStorageItem(activeCompanyId, "customer-debts-v1", JSON.stringify(customerDebts));
  }, [customerDebts, activeCompanyId, isSparexpert]);
  useEffect(() => {
    if (isSparexpert) return;
    setSavedStorageItem(activeCompanyId, "past-month-v2", JSON.stringify(pastMonthUninvoiced));
  }, [pastMonthUninvoiced, activeCompanyId, isSparexpert]);
  useEffect(() => {
    if (isSparexpert) return;
    try {
      setSavedStorageItem(activeCompanyId, "invoices-v1", JSON.stringify(invoices));
    } catch {
      try {
        const lightweight = (invoices || []).map((inv) => ({
          ...inv,
          screenshotDataUrl: undefined,
          returnScreenshotDataUrl: undefined,
        }));
        setSavedStorageItem(activeCompanyId, "invoices-v1", JSON.stringify(lightweight));
      } catch (err) {
        console.warn("[localStorage] Failed to cache invoices:", err);
      }
    }
  }, [invoices, activeCompanyId, isSparexpert]);

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

  const normalizeDailySnapshot = (remote: DailySnapshot): DailySnapshot => {
    // Older snapshots do not have cardLimitSettings.  Materialize the defaults
    // in that case so they are persisted on the next safe snapshot save rather
    // than reconstructed from the imported report on every device.
    const nextCardLimitSettings = normalizeCardLimitSettings(remote.cardLimitSettings, isSparexpert);
    return {
      version: 3,
      companyId: remote.companyId,
      companyName: remote.companyName,
      ...(remote.accounts ? { accounts: remote.accounts.map((account) => ({
        ...account,
        name: canonicalPersonLabel(account.name),
        ...(account.person ? { person: canonicalPersonLabel(account.person) } : {}),
      })) } : {}),
      state: migrateManualAccountIds({ ...remote.state, entries: remote.state.entries.map((entry) => ({
        ...entry,
        ...(entry.responsible ? { responsible: canonicalPersonLabel(entry.responsible) } : {}),
        ...(entry.targetResponsible ? { targetResponsible: canonicalPersonLabel(entry.targetResponsible) } : {}),
      })) }, isSparexpert),
      peopleList: [...new Set((remote.peopleList || DEFAULT_PEOPLE).map(canonicalPersonLabel))],
      channelList: remote.channelList || DEFAULT_CHANNELS,
      categoryList: isSparexpert ? spareEntryCategories(remote.categoryList?.length ? remote.categoryList : SPAREXPERT_CATEGORIES) : remote.categoryList?.length ? remote.categoryList : DEFAULT_CATEGORIES,
      customerList: remote.customerList?.length ? remote.customerList : isSparexpert ? (spareRelease ? [] : SPAREXPERT_CUSTOMERS) : DEFAULT_CUSTOMERS,
      rules: { ...DEFAULT_RULES, ...remote.rules },
      customerDebts: remote.customerDebts || {},
      pastMonthUninvoiced: remote.pastMonthUninvoiced || {},
      invoices: remote.invoices || [],
      cardLimitSettings: nextCardLimitSettings,
    };
  };

  const setSnapshotValues = (next: DailySnapshot) => {
    const nextCardLimitSettings = normalizeCardLimitSettings(next.cardLimitSettings, isSparexpert);
    if (next.accounts) setRemoteAccounts(next.accounts);
    setState(next.state);
    setPeopleList(next.peopleList);
    setChannelList(next.channelList);
    setCategoryList(next.categoryList);
    setCustomerList(next.customerList);
    setRules(next.rules);
    setCustomerDebts(next.customerDebts);
    setPastMonthUninvoiced(next.pastMonthUninvoiced);
    setInvoices(next.invoices);
    setCardLimitSettings(nextCardLimitSettings);
  };

  const applyRemoteSnapshot = (payload: DailyApiResponse) => {
    if (payload.data) {
      const normalizedRemote = normalizeDailySnapshot(payload.data);

      // Preserve any local unsaved entries that are not yet on the server
      const currentEntries = stateRef.current?.entries || [];
      const remoteEntryIds = new Set((normalizedRemote.state?.entries || []).map((e) => String(e.id)));
      const localNewEntries = (azartMobileNavigation || isSparexpert) ? [] : currentEntries.filter(
        (e) => !remoteEntryIds.has(String(e.id)) && !String(e.id).startsWith("sheet-")
      );
      if (localNewEntries.length > 0) {
        normalizedRemote.state.entries = [...(normalizedRemote.state?.entries || []), ...localNewEntries];
      }

      // Preserve any local unsaved draft invoices that are not yet on the server
      const currentInvoices = invoicesRef.current || [];
      const remoteInvoiceIds = new Set((normalizedRemote.invoices || []).map((inv) => String(inv.id)));
      const localDrafts = currentInvoices.filter(
        (inv) => inv.status === "draft" && !remoteInvoiceIds.has(String(inv.id))
      );
      if (localDrafts.length > 0) {
        normalizedRemote.invoices = [...(normalizedRemote.invoices || []), ...localDrafts];
      }

      lastRemoteSnapshotFingerprintRef.current = JSON.stringify(normalizedRemote);
      localSnapshotChangePendingRef.current = localNewEntries.length > 0 || localDrafts.length > 0;
      setSnapshotValues(normalizedRemote);
      if (Array.isArray(normalizedRemote.invoices)) {
        markInvoicesSyncedBatch(normalizedRemote.invoices.map((inv) => inv.id));
      }
    }
    syncRevisionRef.current = payload.revision;
    syncReadyRef.current = true;
    setSyncStatus("saved");
  };

  const refreshDailySnapshot = async () => {
    const response = await fetch("/api/daily", { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error(`Daily API ${response.status}`);
    const payload = await response.json() as DailyApiResponse;
    applyRemoteSnapshot(payload);
    return payload;
  };

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/daily", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Daily API ${response.status}`);
        return response.json() as Promise<DailyApiResponse>;
      })
      .then((payload) => { if (!cancelled) applyRemoteSnapshot(payload); })
      .catch(() => {
        if (cancelled) return;
        syncReadyRef.current = false;
        setSyncStatus("offline");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isClosed = false;

    function connect() {
      if (isClosed) return;
      try {
        eventSource = new EventSource("/api/daily/events");

        eventSource.onopen = () => {
          setIsLiveConnected(true);
          void flushQueue();
        };

        eventSource.addEventListener("invoice_upsert", (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            const inv: InvoiceRecord = data.invoice;
            if (!inv || !inv.id) return;

            markInvoiceSynced(inv.id);

            setInvoices((current) => {
              const idx = current.findIndex((item) => item.id === inv.id);
              if (idx >= 0) {
                const next = [...current];
                next[idx] = inv;
                return next;
              }
              return [inv, ...current];
            });

            if (data.customerDebts) {
              setCustomerDebts(data.customerDebts);
            }
            if (data.pastMonthUninvoiced) {
              setPastMonthUninvoiced(data.pastMonthUninvoiced);
            }
            if (Array.isArray(data.entries)) {
              setState((prev) => ({ ...prev, entries: data.entries }));
            }
            if (data.revision) {
              syncRevisionRef.current = data.revision;
            }
          } catch (err) {
            console.error("SSE invoice_upsert error:", err);
          }
        });

        eventSource.addEventListener("invoice_delete", (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            const invoiceId = data.invoiceId;
            if (!invoiceId) return;

            setInvoices((current) => current.filter((item) => item.id !== invoiceId));

            if (data.customerDebts) {
              setCustomerDebts(data.customerDebts);
            }
            if (data.pastMonthUninvoiced) {
              setPastMonthUninvoiced(data.pastMonthUninvoiced);
            }
            if (Array.isArray(data.entries)) {
              setState((prev) => ({ ...prev, entries: data.entries }));
            }
            if (data.revision) {
              syncRevisionRef.current = data.revision;
            }
          } catch (err) {
            console.error("SSE invoice_delete error:", err);
          }
        });

        eventSource.addEventListener("snapshot_saved", (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data.revision && !localSnapshotChangePendingRef.current) {
              void refreshDailySnapshot();
            }
          } catch {
            // ignore
          }
        });

        eventSource.onerror = () => {
          setIsLiveConnected(false);
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (!isClosed) {
            window.setTimeout(connect, 3000);
          }
        };
      } catch {
        setIsLiveConnected(false);
        if (!isClosed) {
          window.setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      isClosed = true;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const pollDailySnapshot = async (force = false) => {
      if (
        cancelled ||
        snapshotPollBusyRef.current ||
        !syncReadyRef.current ||
        (localSnapshotChangePendingRef.current && !force && syncStatus !== "offline")
      ) return;

      snapshotPollBusyRef.current = true;
      try {
        const response = await fetch("/api/daily", { credentials: "include", cache: "no-store" });
        if (!response.ok) throw new Error(`Daily API ${response.status}`);
        const payload = await response.json() as DailyApiResponse;
        const currentRevision = syncRevisionRef.current ?? 0;
        if (!cancelled && (payload.revision > currentRevision || syncStatus === "offline" || force)) {
          applyRemoteSnapshot(payload);
        }
      } catch {
        // A transient background refresh failure must not hide already loaded data.
      } finally {
        snapshotPollBusyRef.current = false;
      }
    };

    const handleFocus = () => { void pollDailySnapshot(); };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void pollDailySnapshot();
    };
    const timer = window.setInterval(() => { void pollDailySnapshot(); }, 4_000);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [session.id]);

  const loadEntryChangeRequests = async () => {
    if (!can("daily.entries.edit") && !can("daily.entries.delete") && !can("daily.entries.create") && !can("daily.entries.approve")) return [];
    const response = await fetch("/api/daily/entry-change-requests", { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error(`Daily API ${response.status}`);
    const payload = await response.json() as { data?: EntryChangeRequest[]; revision?: number };
    setEntryChangeRequests(payload.data || []);
    return payload.data || [];
  };

  useEffect(() => {
    if (!session || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (cancelled) return;
        setPushEnabled(Boolean(subscription));
        if (subscription) {
          void fetch("/api/daily/push-subscriptions", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subscription: subscription.toJSON() }),
          }).catch(() => undefined);
        }
      })
      .catch(() => { if (!cancelled) setPushEnabled(false); });
    return () => { cancelled = true; };
  }, [session.id]);

  useEffect(() => {
    knownNotificationIdsRef.current = new Set();
    notificationsInitializedRef.current = false;
    setNotificationToast(null);
  }, [session.id]);

  useEffect(() => {
    if (!notificationToast) return;
    const timer = window.setTimeout(() => setNotificationToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [notificationToast]);

  const waitForPushOperation = async <T,>(operation: Promise<T>, message: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), 10000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  const enablePushNotifications = async () => {
    setPersonalPushStatus("Bildiriş icazəsi yoxlanılır…");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error("Bu cihaz push bildirişini dəstəkləmir.");
      }
      if (Notification.permission === "denied") {
        throw new Error("Saytın bildiriş icazəsi bağlıdır. Chrome-da daily.arix.az saytını açın → ünvanın yanındakı sayt ayarları → İcazələr → Bildirişlər → İcazə ver.");
      }
      let permissionTimer: ReturnType<typeof setTimeout> | undefined;
      const permission = Notification.permission === "granted" ? "granted" : await Promise.race([
        Notification.requestPermission(),
        new Promise<never>((_, reject) => {
          permissionTimer = setTimeout(() => reject(new Error("İcazə pəncərəsi cavab vermədi. Chrome-da daily.arix.az saytını açın → sayt ayarları → Bildirişlər → İcazə ver.")), 10000);
        }),
      ]).finally(() => clearTimeout(permissionTimer));
      if (permission !== "granted") {
        throw new Error("Bildiriş icazəsi verilmədi.");
      }
      setPersonalPushStatus("Cihaz bildiriş xidməti hazırlanır…");
      let readyTimer: ReturnType<typeof setTimeout> | undefined;
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => {
          readyTimer = setTimeout(() => reject(new Error("Bildiriş xidməti hazır olmadı. Chrome-da daily.arix.az saytını yenidən açın.")), 8000);
        }),
      ]).finally(() => clearTimeout(readyTimer));
      const response = await fetch("/api/daily/push-config", { credentials: "include", signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("Push bildiriş konfiqurasiyası alına bilmədi.");
      const config = await response.json();
      const publicKey = config?.data?.publicKey;
      if (!publicKey) throw new Error("Push bildiriş açarı serverdə təyin edilməyib.");
      const bytes = Uint8Array.from(
        atob(publicKey.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(publicKey.length / 4) * 4, "=")),
        (char) => char.charCodeAt(0),
      );
      const existing = await waitForPushOperation(registration.pushManager.getSubscription(), "Cihazın bildiriş qeydiyyatı yoxlanmadı. Yenidən cəhd edin.");
      setPersonalPushStatus("Cihaz bildirişlərə qoşulur…");
      const subscription = existing ?? await waitForPushOperation(registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      }), "Cihaz bildiriş xidmətinə qoşulmadı. Yenidən cəhd edin.");
      const saved = await waitForPushOperation(fetch("/api/daily/push-subscriptions", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      }), "Server cihaz qeydiyyatına cavab vermədi. Yenidən cəhd edin.");
      if (!saved.ok) {
        const result = await saved.json().catch(() => null);
        throw new Error(result?.error || "Cihaz serverdə qeydiyyatdan keçmədi. Yenidən cəhd edin.");
      }
      setPushEnabled(true);
      setPersonalPushStatus("Cihaz bildirişləri aktivdir. «Test et» ilə yoxlayın.");
    } catch (cause) {
      setPersonalPushStatus(cause instanceof Error ? cause.message : "Bildirişlər aktivləşdirilə bilmədi.");
    }
  };

  const changePersonalPush = async (refresh = false) => {
    if (personalPushBusy) return;
    setPersonalPushBusy(true);
    try {
      if (!pushEnabled || refresh) {
        await enablePushNotifications();
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription && !(await subscription.unsubscribe()) && await registration?.pushManager.getSubscription()) {
        throw new Error("Bu cihazda bildirişləri söndürmək mümkün olmadı.");
      }
      setPushEnabled(false);
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Bildiriş ayarı dəyişdirilə bilmədi.");
    } finally {
      setPersonalPushBusy(false);
    }
  };

  const testPushNotification = async () => {
    try {
      const response = await fetch("/api/daily/push-test", { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Test bildirişi göndərilə bilmədi.");
      const result = await response.json();
      if (!result?.data?.delivered) {
        throw new Error("Bu cihazın aktiv push abonəliyi tapılmadı. Bildirişləri yenidən açın.");
      }
    } catch (cause) {
      setPushEnabled(false);
      alert(cause instanceof Error ? cause.message : "Test bildirişi göndərilə bilmədi.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadLiveItems = () => {
      void fetch("/api/daily/notifications", { credentials: "include", cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
        .then((payload: { data?: DailyNotification[] }) => {
          if (cancelled) return;
          const next = payload.data || [];
          if (notificationsInitializedRef.current) {
            const fresh = next.find((item) => !item.readAt && !knownNotificationIdsRef.current.has(item.id));
            if (fresh) {
              setNotificationToast(fresh);
              if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
                try {
                  const sysNotif = new Notification(fresh.title, {
                    body: fresh.message,
                    icon: "/arix-daily-icon-192.png",
                    badge: "/arix-daily-icon-192.png",
                    tag: `${fresh.type || "arix-daily"}:${fresh.id}`,
                  });
                  sysNotif.onclick = () => {
                    window.focus();
                    void markNotificationRead(fresh);
                    sysNotif.close();
                  };
                } catch {}
              }
            }
          } else {
            notificationsInitializedRef.current = true;
          }
          knownNotificationIdsRef.current = new Set(next.map((item) => item.id));
          setNotifications(next);
        })
        .catch(() => undefined);
      if (can("daily.entries.edit") || can("daily.entries.delete") || can("daily.entries.create") || can("daily.entries.approve")) {
        void fetch("/api/daily/entry-change-requests", { credentials: "include", cache: "no-store" })
          .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
          .then((payload: { data?: EntryChangeRequest[] }) => { if (!cancelled) setEntryChangeRequests(payload.data || []); })
          .catch(() => undefined);
      }
    };
    loadLiveItems();
    const timer = window.setInterval(loadLiveItems, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [session.id]);

  const markNotificationRead = async (notification: DailyNotification) => {
    if (!notification.readAt) {
      await fetch(`/api/daily/notifications/${notification.id}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
    }
    if (notification.type?.startsWith("daily_entry_") && notification.relatedId) {
      await loadEntryChangeRequests().catch(() => undefined);
      setEntryApprovalOpen(true);
      setTopMenu(null);
    }
    if (notification.type === "daily_access_request" && can("daily.users.manage")) {
      setView("management");
      setTopMenu(null);
    }
  };

  useEffect(() => {
    if (!syncReadyRef.current || syncRevisionRef.current == null) return;
    const snapshot: DailySnapshot = {
      version: 3,
      state,
      peopleList,
      channelList,
      categoryList,
      customerList,
      rules,
      customerDebts,
      pastMonthUninvoiced,
      invoices,
      // The monthly cap is configuration, not a calculated monthly value.
      // Always keep it in the shared snapshot so every user/device sees the
      // same cap; only limitRemaining changes with the selected month.
      cardLimitSettings,
    };
    const snapshotFingerprint = JSON.stringify(snapshot);
    if (snapshotFingerprint === lastRemoteSnapshotFingerprintRef.current) {
      localSnapshotChangePendingRef.current = false;
      return;
    }
    localSnapshotChangePendingRef.current = true;
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
            const conflict = await response.json().catch(() => ({})) as { revision?: number; code?: string };
            setSyncStatus("conflict");
            const latestResponse = await fetch("/api/daily", { credentials: "include", cache: "no-store" });
            if (!latestResponse.ok) throw new Error(`Daily API ${latestResponse.status}`);
            const latestPayload = await latestResponse.json() as DailyApiResponse;
            if (!latestPayload.data) {
              applyRemoteSnapshot(latestPayload);
              return;
            }
            const latestSnapshot = normalizeDailySnapshot(latestPayload.data);
            if (!Number.isInteger(conflict.revision) || conflict.code) {
              const serverInvoiceIds = new Set((latestSnapshot.invoices || []).map((inv) => inv.id));
              const localUnsavedDrafts = (snapshot.invoices || []).filter(
                (inv) => inv.status === "draft" && !wasInvoiceSynced(inv.id) && !serverInvoiceIds.has(inv.id)
              );
              if (localUnsavedDrafts.length > 0) {
                latestSnapshot.invoices = [...(latestSnapshot.invoices || []), ...localUnsavedDrafts];
              }
              const serverEntryIds = new Set((latestSnapshot.state?.entries || []).map((e) => e.id));
              const localUnsavedEntries = (azartMobileNavigation || isSparexpert) ? [] : (snapshot.state?.entries || []).filter(
                (e) => !serverEntryIds.has(e.id) && !e.id.startsWith("sheet-")
              );
              if (localUnsavedEntries.length > 0) {
                latestSnapshot.state.entries = [...(latestSnapshot.state?.entries || []), ...localUnsavedEntries];
              }
              syncRevisionRef.current = latestPayload.revision;
              syncReadyRef.current = true;
              lastRemoteSnapshotFingerprintRef.current = JSON.stringify(normalizeDailySnapshot(latestPayload.data));
              setSnapshotValues(latestSnapshot);
              localSnapshotChangePendingRef.current = localUnsavedDrafts.length > 0 || localUnsavedEntries.length > 0;
              return;
            }

            let baseSnapshot = latestSnapshot;
            try {
              const parsedBase = JSON.parse(lastRemoteSnapshotFingerprintRef.current) as DailySnapshot;
              if (parsedBase?.state?.entries) baseSnapshot = parsedBase;
            } catch {
              // If the cached base cannot be read, the latest server state remains authoritative.
            }
            const rebasedSnapshot = rebaseDailySnapshot(baseSnapshot, snapshot, latestSnapshot);
            if (azartMobileNavigation || isSparexpert) rebasedSnapshot.state.entries = latestSnapshot.state.entries;
            if (JSON.stringify(rebasedSnapshot) !== JSON.stringify(latestSnapshot)) {
              syncRevisionRef.current = latestPayload.revision;
              syncReadyRef.current = true;
              lastRemoteSnapshotFingerprintRef.current = JSON.stringify(latestSnapshot);
              setSnapshotValues(rebasedSnapshot);
              localSnapshotChangePendingRef.current = true;
              setSyncStatus("saving");
            } else {
              applyRemoteSnapshot({ ...latestPayload, data: latestSnapshot });
            }
            return;
          }
          if (!response.ok) {
            if (response.status === 403) {
              try {
                const latestResponse = await fetch("/api/daily", { credentials: "include", cache: "no-store" });
                if (latestResponse.ok) {
                  const latestPayload = await latestResponse.json() as DailyApiResponse;
                  applyRemoteSnapshot(latestPayload);
                }
              } catch {
                // ignore
              }
            }
            throw new Error(`Daily API ${response.status}`);
          }
          const payload = await response.json() as DailyApiResponse;
          syncRevisionRef.current = payload.revision;
          lastRemoteSnapshotFingerprintRef.current = snapshotFingerprint;
          localSnapshotChangePendingRef.current = false;
          setSyncStatus("saved");
        } catch {
          setSyncStatus("offline");
          localSnapshotChangePendingRef.current = false;
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state, peopleList, channelList, categoryList, customerList, rules, customerDebts, pastMonthUninvoiced, invoices, cardLimitSettings]);

  const toggleEntryInvoiced = (entryId: string) => {
    if (!can("daily.invoices.manage")) return;
    setState((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.id === entryId ? { ...entry, invoiced: !entry.invoiced } : entry
      ),
    }));
  };

  const confirmInvoice = (record: InvoiceRecord) => {
    if (!can("daily.invoices.manage")) return;
    if (record.status === "active" && !can("daily.invoices.approve")) return;

    const safeInvoiceNo = String(record.invoiceNo || "").trim();
    const safeCustomer = String(record.customer || "").trim();
    const safeCustomerLower = safeCustomer.toLocaleLowerCase("az-AZ");

    const existingById = invoices.find((invoice) => invoice.id === record.id);
    if (existingById) {
      if (existingById.status === "active" && record.status === "draft") {
        record = {
          ...record,
          id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
          restartOf: undefined,
        };
      } else {
        const existingNo = String(existingById.invoiceNo || "").trim();
        const existingCust = String(existingById.customer || "").trim().toLocaleLowerCase("az-AZ");
        const invoiceNoChanged = existingNo !== safeInvoiceNo;
        const customerChanged = existingCust !== safeCustomerLower;
        const sourceImageChanged = String(existingById.screenshotDataUrl || "") !== String(record.screenshotDataUrl || "");
        if ((invoiceNoChanged && customerChanged) || (sourceImageChanged && (invoiceNoChanged || customerChanged))) {
          record = {
            ...record,
            id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            createdAt: new Date().toISOString(),
            restartOf: undefined,
          };
        }
      }
    }
    // Handle draft save/update without changing ledger or debt
    if (record.status === "draft") {
      setInvoices((current) => {
        const existingIdx = current.findIndex(
          (inv) =>
            inv.id === record.id ||
            (inv.status === "draft" &&
              String(inv.invoiceNo || "").trim() === safeInvoiceNo &&
              String(inv.customer || "").trim().toLocaleLowerCase("az-AZ") === safeCustomerLower)
        );
        if (existingIdx >= 0 && current[existingIdx].status === "draft") {
          const next = [...current];
          next[existingIdx] = { ...current[existingIdx], ...record, id: current[existingIdx].id };
          return next;
        }
        return [record, ...current.filter((inv) => inv.id !== record.id)];
      });
      void enqueueInvoiceMutation({ invoiceId: record.id, action: "upsert", invoice: record, approve: false }, ({ revision }) => {
        if (revision) syncRevisionRef.current = revision;
      });
      return;
    }

    const existingActive = invoices.find(
      (inv) =>
        inv.status === "active" &&
        (inv.id === record.id ||
          (String(inv.invoiceNo || "").trim() === safeInvoiceNo &&
            String(inv.customer || "").trim().toLocaleLowerCase("az-AZ") === safeCustomerLower))
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
      void enqueueInvoiceMutation({ invoiceId: updatedRecord.id, action: "upsert", invoice: updatedRecord, approve: true }, ({ revision }) => {
        if (revision) syncRevisionRef.current = revision;
      });
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
    void enqueueInvoiceMutation({ invoiceId: record.id, action: "upsert", invoice: record, approve: true }, ({ revision }) => {
      if (revision) syncRevisionRef.current = revision;
    });
  };

  const approveInvoice = (invoiceId: string) => {
    if (!can("daily.invoices.approve")) return;
    const target = invoices.find((inv) => inv.id === invoiceId);
    if (!target || target.status !== "draft") return;

    const currentDebt = customerDebts[target.customer] ?? 0;
    const pastMonthPending = target.explicitPaymentSelection && !target.includePastPayment ? 0 : pastMonthUninvoiced[target.customer] ?? target.previousPastMonthSnapshot;
    const pendingEntries = state.entries.filter(
      (e) =>
        e.kind === "income" &&
        !e.invoiced && (!target.explicitPaymentSelection || target.linkedEntryIds.includes(e.id)) &&
        String(e.counterparty || "").trim().toLocaleLowerCase("az-AZ") === String(target.customer || "").trim().toLocaleLowerCase("az-AZ")
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
              approvedBy: session.name,
              approvedAt: nowIso,
            }
          : inv
      )
    );
    void enqueueInvoiceMutation({ invoiceId, action: "approve" }, ({ revision }) => {
      if (revision) syncRevisionRef.current = revision;
    });
  };

  const reverseInvoiceEffects = (target: InvoiceRecord) => {
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
  };

  const cancelInvoice = (invoiceId: string, reason?: string) => {
    if (!can("daily.invoices.approve")) return;
    const target = invoices.find((inv) => inv.id === invoiceId);
    if (!target || target.status === "cancelled") return;
    reverseInvoiceEffects(target);
    setInvoices((current) =>
      current.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              status: "cancelled",
              cancelledAt: new Date().toISOString(),
              cancelledBy: session.name,
              rejectionReason: reason?.trim() || "Qaimə ləğv edildi",
            }
          : inv
      )
    );
    void enqueueInvoiceMutation({ invoiceId, action: "cancel", reason }, ({ revision }) => {
      if (revision) syncRevisionRef.current = revision;
    });
  };

  const restartInvoice = (invoiceId: string) => {
    if (!can("daily.invoices.restart")) return;
    const target = invoices.find((inv) => inv.id === invoiceId);
    if (!target) return;
    reverseInvoiceEffects(target);
    const nowIso = new Date().toISOString();
    setInvoices((current) => current.map((inv) => inv.id === invoiceId ? {
      ...inv,
      status: "cancelled",
      cancelledAt: nowIso,
      cancelledBy: session.name,
      rejectionReason: "Qaimə başdan başladıldı",
      restartedAt: nowIso,
      restartedBy: session.name,
    } : inv));
    void enqueueInvoiceMutation({ invoiceId, action: "restart" }, ({ revision }) => {
      if (revision) syncRevisionRef.current = revision;
    });
  };

  const deleteInvoicePermanently = (invoiceId: string) => {
    if (!can("daily.invoices.delete_permanent")) return;
    const target = invoices.find((inv) => inv.id === invoiceId);
    if (!target) return;
    reverseInvoiceEffects(target);
    setInvoices((current) => current.filter((inv) => inv.id !== invoiceId));
    void enqueueInvoiceMutation({ invoiceId, action: "delete" }, ({ revision }) => {
      if (revision) syncRevisionRef.current = revision;
    });
  };

  const syncSpareCustomerMutation = (payload: { action: "add" | "rename" | "delete"; customer?: string; previous?: string; initialDebt?: number }) => {
    if (!isSparexpert) return;
    syncQueueRef.current = syncQueueRef.current.then(async () => {
      try {
        const response = await fetch("/api/daily/customers", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) return;
        const result = await response.json() as DailyApiResponse;
        if (result.revision) syncRevisionRef.current = result.revision;
        applyRemoteSnapshot(result);
      } catch {
        // Keep local state in offline/local preview mode
      }
    });
  };

  const canManageCustomerDirectory = isSparexpert ? (can("daily.directories.manage") || can("daily.entries.create") || can("daily.entries.edit")) : can("daily.directories.manage");
  const addNewCustomer = (name: string, initialDebt: number): string | void => {
    if (!canManageCustomerDirectory) return;
    const clean = name.trim();
    if (!clean) return;
    if (isSparexpert) {
      const targetKey = partyDirectoryKey(clean);
      setRemovedSpareParties((current) => current.filter((key) => key !== targetKey));
      setCustomerList((current) => {
        const exists = current.some((c) => partyDirectoryKey(c) === targetKey);
        return exists ? current.map((c) => (partyDirectoryKey(c) === targetKey ? clean : c)) : [clean, ...current];
      });
      setCustomerDebts((current) => ({ ...current, [clean]: initialDebt }));
      syncSpareCustomerMutation({ action: "add", customer: clean, initialDebt });
      return clean;
    }
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

  const renameCustomer = (oldName: string, newName: string): string | void => {
    if (!canManageCustomerDirectory) return;
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanOld || !cleanNew || cleanOld.toLocaleLowerCase("az-AZ") === cleanNew.toLocaleLowerCase("az-AZ")) return cleanNew || cleanOld;
    if (isSparexpert) {
      const oldKey = partyDirectoryKey(cleanOld);
      const newKey = partyDirectoryKey(cleanNew);
      setRemovedSpareParties((current) => {
        const withoutNew = current.filter((key) => key !== newKey);
        return oldKey !== newKey && !withoutNew.includes(oldKey) ? [...withoutNew, oldKey] : withoutNew;
      });
      setCustomerList((current) => {
        const hasOld = current.some((c) => partyDirectoryKey(c) === oldKey);
        return hasOld ? current.map((c) => (partyDirectoryKey(c) === oldKey ? cleanNew : c)) : [cleanNew, ...current];
      });
      syncSpareCustomerMutation({ action: "rename", previous: cleanOld, customer: cleanNew });
    }

    setCustomerList((current) =>
      current.map((c) => (c.toLocaleLowerCase("az-AZ") === cleanOld.toLocaleLowerCase("az-AZ") ? cleanNew : c))
    );

    setCustomerDebts((current) => {
      const next = { ...current };
      const debt = next[cleanOld] ?? 0;
      delete next[cleanOld];
      next[cleanNew] = debt;
      return next;
    });

    setPastMonthUninvoiced((current) => {
      const next = { ...current };
      if (cleanOld in next) {
        const val = next[cleanOld];
        delete next[cleanOld];
        next[cleanNew] = val;
      }
      return next;
    });

    setState((current) => ({
      ...current,
      entries: current.entries.map((e) =>
        e.counterparty && e.counterparty.trim().toLocaleLowerCase("az-AZ") === cleanOld.toLocaleLowerCase("az-AZ")
          ? { ...e, counterparty: cleanNew }
          : e
      ),
    }));

    setInvoices((current) =>
      current.map((inv) =>
        inv.customer && inv.customer.trim().toLocaleLowerCase("az-AZ") === cleanOld.toLocaleLowerCase("az-AZ")
          ? { ...inv, customer: cleanNew }
          : inv
      )
    );

    if (selectedCrmCustomer && selectedCrmCustomer.toLocaleLowerCase("az-AZ") === cleanOld.toLocaleLowerCase("az-AZ")) {
      setSelectedCrmCustomer(cleanNew);
    }
    return cleanNew;
    if (false) {
      setSelectedCrmCustomer(cleanNew);
    }
  };

  const deleteCustomer = (customerName: string) => {
    if (!canManageCustomerDirectory) return;
    const clean = customerName.trim();
    if (!clean) return;
    if (isSparexpert) {
      const key = partyDirectoryKey(clean);
      setRemovedSpareParties((current) => current.includes(key) ? current : [...current, key]);
      setCustomerDebts((current) => {
        const next = { ...current };
        for (const k of Object.keys(next)) {
          if (partyDirectoryKey(k) === key) delete next[k];
        }
        return next;
      });
      setPastMonthUninvoiced((current) => {
        const next = { ...current };
        for (const k of Object.keys(next)) {
          if (partyDirectoryKey(k) === key) delete next[k];
        }
        return next;
      });
      syncSpareCustomerMutation({ action: "delete", previous: clean, customer: clean });
      setCustomerList((current) => current.filter((name) => partyDirectoryKey(name) !== key));
      setSelectedCrmCustomer(null);
      return;
    }

    setCustomerList((current) =>
      current.filter((c) => c.toLocaleLowerCase("az-AZ") !== clean.toLocaleLowerCase("az-AZ"))
    );
    setCustomerDebts((current) => {
      const next = { ...current };
      delete next[clean];
      return next;
    });
    setPastMonthUninvoiced((current) => {
      const next = { ...current };
      delete next[clean];
      return next;
    });

    if (selectedCrmCustomer && selectedCrmCustomer.toLocaleLowerCase("az-AZ") === clean.toLocaleLowerCase("az-AZ")) {
      setSelectedCrmCustomer(null);
    }
  };

  const updateCustomerDebt = (customer: string, newDebt: number) => {
    if (isSparexpert && can("daily.entries.edit")) syncSpareCustomerMutation({ action: "add", customer, initialDebt: newDebt });
    if (!can("daily.entries.edit")) return;
    if (azartMobileNavigation) {
      const key = Object.keys(customerDebts).find((name) => name.toLocaleLowerCase("az-AZ") === customer.toLocaleLowerCase("az-AZ")) || customer;
      void (async () => {
        try {
          const response = await fetch("/api/daily/customer-debt", {
            method: "PUT", credentials: "include", headers: { "content-type": "application/json" },
            body: JSON.stringify({ customer: key, amount: newDebt, expected: customerDebts[key] ?? 0 }),
          });
          const result = await response.json();
          if (!response.ok) {
            if (response.status === 409) await refreshDailySnapshot().catch(() => undefined);
            throw new Error(result.error || "Borc saxlanılmadı.");
          }
          await refreshDailySnapshot();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : "Borc saxlanılmadı.");
        }
      })();
      return;
    }
    setCustomerDebts((current) => ({
      ...current,
      [customer]: newDebt,
    }));
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
  const activeEntries = useMemo(() => isSparexpert
    ? state.entries.filter((entry) => entry.date >= SPAREXPERT_FIRST_DATE)
    : state.entries, [isSparexpert, state.entries]);
  const dayEntries = useMemo(() => state.entries
    .filter((entry) => entry.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time)), [selectedDate, state.entries]);
  const accountCatalog = useMemo(() => {
    const baseList = remoteAccounts?.length ? remoteAccounts : (isSparexpert ? SPAREXPERT_ACCOUNTS : ACCOUNTS);
    const accounts = new Map(baseList.map((account) => [account.id, account]));
    for (const cust of customAccounts) {
      accounts.set(cust.id, cust);
    }
    if (isSparexpert) {
      const legacy = accounts.get("Kart X1");
      const ziraat = accounts.get("H.SimZiraat") ?? SPAREXPERT_ACCOUNTS.find((account) => account.id === "H.SimZiraat");
      if (legacy && ziraat) {
        accounts.set(ziraat.id, { ...ziraat, opening: ziraat.opening + legacy.opening });
        accounts.delete(legacy.id);
      }
      const referenced = new Set(state.entries.flatMap((entry) => [entry.accountId, entry.targetAccountId]));
      for (const id of ["N.Fuad", "H.X3", "H.X4", "Ceyhun"]) {
        const account = accounts.get(id);
        if (account?.opening === 0 && !referenced.has(id)) accounts.delete(id);
      }
    }
    const combinedBase = [...accounts.values()];
    for (const entry of state.entries) {
      if (entry.id.startsWith("sheet-")) continue;
      const source = (isSparexpert ? accounts.get(entry.accountId) : undefined) ??
        findAccountForPersonChannel(resolveEntryPerson(entry), resolveEntryChannel(entry), combinedBase);
      accounts.set(source.id, source);
      if (entry.kind === "transfer") {
        const target = (isSparexpert && entry.targetAccountId ? accounts.get(entry.targetAccountId) : undefined) ??
          findAccountForPersonChannel(entry.targetResponsible || entry.responsible || "Eşqin", entry.targetBank || "Kassa", combinedBase);
        accounts.set(target.id, target);
      }
    }
    return [...accounts.values()];
  }, [state.entries, remoteAccounts, customAccounts, isSparexpert]);
  useEffect(() => {
    if (!isSparexpert) return;
    const owners = accountCatalog
      .filter((account) => !account.id.startsWith("pair:") && !isAggregateAccount(account.name))
      .map((account) => account.person?.trim())
      .filter((person): person is string => Boolean(person) && !isRetiredSparePerson(person));
    setPeopleList((current) => {
      const names = new Map(current.filter((person) => !isRetiredSparePerson(person))
        .map((person) => [person.trim().toLocaleLowerCase("az-AZ"), person]));
      for (const owner of owners) {
        const key = owner.toLocaleLowerCase("az-AZ");
        if (!names.has(key)) names.set(key, owner);
      }
      const next = [...names.values()];
      return next.length === current.length && next.every((person, index) => person === current[index]) ? current : next;
    });
  }, [accountCatalog, isSparexpert, peopleList]);

  const handleSaveAccount = (acc: Account, newPerson?: string, newChannel?: string) => {
    if (newPerson && !peopleList.includes(newPerson)) {
      setPeopleList((cur) => [...cur, newPerson]);
    }
    if (newChannel && !channelList.includes(newChannel)) {
      setChannelList((cur) => [...cur, newChannel]);
    }
    setCustomAccounts((cur) => {
      const idx = cur.findIndex((a) => a.id === acc.id);
      if (idx >= 0) {
        const updated = [...cur];
        updated[idx] = acc;
        return updated;
      }
      return [...cur, acc];
    });
    if (!isSparexpert && acc.type === "card" && acc.channel?.trim()) {
      const channel = acc.channel.trim();
      const person = normalizePersonName(acc.person || acc.name);
      setCardLimitSettings((current) => {
        const normalized = normalizeCardLimitSettings(current, false);
        const bank = Object.keys(normalized).find((name) => normalizeBankKey(name) === normalizeBankKey(channel)) || channel;
        const existing = normalized[bank] || { rules: defaultCardLimitRulesForBank(bank), limits: {}, statuses: {} };
        const limits = { ...existing.limits };
        if (acc.archived) delete limits[person];
        else if (!(person in limits)) limits[person] = 0;
        return normalizeCardLimitSettings({ ...normalized, [bank]: { ...existing, limits } }, false);
      });
    }
  };

  const handleDeleteAccount = (accId: string) => {
    if ((remoteAccounts || (isSparexpert ? SPAREXPERT_ACCOUNTS : ACCOUNTS)).some((item) => item.id === accId)) {
      window.alert("Əsas hesabı silmək olmur. Hesabı arxivə keçirə bilərsiniz.");
      return;
    }
    const account = accountCatalog.find((item) => item.id === accId);
    if (!account) return;
    const keys = new Set([account.id, account.name]);
    const hasHistory = state.entries.some((entry) =>
      keys.has(entry.accountId) || (entry.targetAccountId && keys.has(entry.targetAccountId)));
    const opening = isSparexpert ? SPAREXPERT_NOVEMBER_OPENING[accId] ?? account.opening : account.opening;
    if (hasHistory || opening !== 0) {
      window.alert("Bu hesabın əməliyyat tarixçəsi və ya ilkin qalığı var. Hesab silinmədi.");
      return;
    }
    setCustomAccounts((cur) => cur.filter((a) => a.id !== accId));
  };

  const balanceAt = (account: Account, endDate: string, beforeDay = false) => {
    if (!isSparexpert && isAutoSupplierCollector(account.name)) return 0;
    const cutoff = beforeDay ? shiftDate(endDate, -1) : endDate;
    const snapshotDate = isSparexpert ? null : Object.keys(RECONCILIATION_BY_DATE)
      .filter((key) => key <= cutoff && RECONCILIATION_BY_DATE[key].some(([name]) => name === account.name))
      .sort((a, b) => b.localeCompare(a))[0];
    const snapshot = snapshotDate ? RECONCILIATION_BY_DATE[snapshotDate].find(([name]) => name === account.name) : undefined;
    const novemberOpening = isSparexpert && endDate >= SPAREXPERT_FIRST_DATE ? SPAREXPERT_NOVEMBER_OPENING[account.id] : undefined;
    const base = novemberOpening ?? (snapshot ? snapshot[1] + snapshot[2] - snapshot[3] - snapshot[4] : account.opening);
    const after = isSparexpert ? shiftDate(SPAREXPERT_FIRST_DATE, -1) : snapshotDate ?? "0000-00-00";
    return state.entries.reduce((total, entry) => {
      const inRange = !entry.id.startsWith("sheet-") && entry.date > after && entry.date <= cutoff;
      if (!inRange) return total;
      const amt = Math.abs(entry.amount);
      if (isSparexpert) {
        const source = entry.accountId === account.id || entry.accountId === account.name;
        const target = entry.targetAccountId === account.id || entry.targetAccountId === account.name;
        if (entry.kind === "transfer") return total + (target ? amt : 0) - (source ? amt : 0);
        return total + (source ? (entry.kind === "income" ? amt : -amt) : 0);
      }
      if (entry.kind === "income" && entry.accountId === account.id) return total + amt;
      if (entry.kind === "expense" && entry.accountId === account.id) return total - amt;
      if (entry.kind === "transfer" && entry.accountId === account.id) return total - amt;
      if (entry.kind === "transfer" && entry.targetAccountId === account.id) return total + amt;
      return total;
    }, base);
  };

  const reconciliationRows = useMemo<ReconciliationRow[]>(() => {
    const isSparexpert = session.companyId === "sparexpert" || session.company?.id === "sparexpert";
    const baseSnapshot = (isSparexpert ? [] : (RECONCILIATION_BY_DATE[selectedDate] ?? [])) as ReconciliationRow[];
    const manualToday = dayEntries.filter((entry) => !entry.id.startsWith("sheet-"));
    const manualBefore = state.entries.filter((entry) => !entry.id.startsWith("sheet-") && entry.date < selectedDate);

    const pairAccounts = accountCatalog.filter((account) => account.id.startsWith("pair:"));
    const baseRows: Array<[string, number, number, number, number]> = baseSnapshot.length
      ? [
          ...baseSnapshot.map(([name, rec, prev, exp, sup]) => [name, rec, prev, exp, sup] as [string, number, number, number, number]),
          ...pairAccounts.map((account) => [account.name, 0, balanceAt(account, selectedDate, true), 0, 0] as [string, number, number, number, number]),
        ]
      : accountCatalog.map((acc) => [acc.name, 0, isAggregateAccount(acc.name) ? 0 : balanceAt(acc, selectedDate, true), 0, 0]);

    if (isSparexpert) {
      const mappedRows = accountCatalog.map((account) => {
        if (isAggregateAccount(account.name)) {
          return [account.name, 0, 0, 0, 0, 0] as const;
        }
        let rec = 0;
        let exp = 0;
        let sup = 0;
        let tr = 0;
        for (const entry of dayEntries) {
          const amt = Math.abs(entry.amount);
          const cat = (entry.category || "").toLocaleLowerCase("az-AZ");
          const isTransfer = entry.kind === "transfer";
          const isSupplier = cat === "ödəniş" || cat.includes("təch");

          if (isTransfer) {
            if (entry.accountId === account.id || entry.accountId === account.name) tr -= amt;
            if (entry.targetAccountId === account.id || entry.targetAccountId === account.name) tr += amt;
            continue;
          }
          if (entry.kind === "income" && (entry.accountId === account.id || entry.accountId === account.name)) {
            rec += amt;
          }
          if (entry.kind === "expense" && (entry.accountId === account.id || entry.accountId === account.name)) {
            if (isSupplier) sup += amt;
            else exp += amt;
          }
        }
        const prev = balanceAt(account, selectedDate, true);
        return [account.name, rec, prev, exp, sup, tr] as const;
      });

      const detailRows = mappedRows.filter(([name]) => !isAggregateAccount(name));
      const umumiRec = detailRows.reduce((sum, [, r]) => sum + r, 0);
      const umumiPrev = detailRows.reduce((sum, [, , p]) => sum + p, 0);
      const umumiExp = detailRows.reduce((sum, [, , , e]) => sum + e, 0);
      const umumiSup = detailRows.reduce((sum, [, , , , s]) => sum + s, 0);
      const umumiTr = detailRows.reduce((sum, [, , , , , t = 0]) => sum + (t || 0), 0);

      return [["Ümumi", umumiRec, umumiPrev, umumiExp, umumiSup, umumiTr], ...detailRows];
    }

    const mappedRows = baseRows.map(([name, baseRec, basePrev, baseExp, baseSup]) => {
      if (isAggregateAccount(name)) {
        return [name, 0, 0, 0, 0] as const;
      }
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

    const detailRows = mappedRows.filter(([name]) => !isAggregateAccount(name));
    const umumiRec = detailRows.reduce((sum, [, r]) => sum + r, 0);
    const umumiPrev = detailRows.reduce((sum, [, , p]) => sum + p, 0);
    const umumiExp = detailRows.reduce((sum, [, , , e]) => sum + e, 0);
    const umumiSup = detailRows.reduce((sum, [, , , , s]) => sum + s, 0);

    return mappedRows.map((row) => {
      if (isAggregateAccount(row[0])) {
        return [row[0], umumiRec, umumiPrev, umumiExp, umumiSup] as const;
      }
      return row;
    });
  }, [selectedDate, dayEntries, state.entries, rules, accountCatalog]);

  const detailReconciliationRows = useMemo(() => {
    const hasAggregate = reconciliationRows.some(([name]) => isAggregateAccount(name));
    return hasAggregate
      ? reconciliationRows.filter(([name]) => !isAggregateAccount(name))
      : reconciliationRows;
  }, [reconciliationRows]);

  const daySummary = useMemo(() => {
    return detailReconciliationRows.reduce((totals, [, received, previous, expense, supplier, transfer = 0]) => ({
      income: totals.income + received,
      expense: totals.expense + expense + supplier,
      opening: totals.opening + previous,
      expected: totals.expected + (isSparexpert ? (previous + received - supplier - expense + (transfer || 0)) : (received + previous - expense - supplier)),
    }), { income: 0, expense: 0, opening: 0, expected: 0 });
  }, [detailReconciliationRows, isSparexpert]);

  const reconciliationTotals = detailReconciliationRows.reduce((totals, [, received, previous, expense, supplier, transfer = 0]) => ({
    received: totals.received + received,
    previous: totals.previous + previous,
    expense: totals.expense + expense,
    supplier: totals.supplier + supplier,
    transfer: (totals.transfer || 0) + (transfer || 0),
  }), { received: 0, previous: 0, expense: 0, supplier: 0, transfer: 0 });
  const visibleReconciliationRows = reconciliationRows.filter(([name, received, previous, expense, supplier]) => {
    const queryNorm = reconciliationQuery.trim().toLocaleLowerCase("az-AZ");
    if (!queryNorm && isSparexpert && isPlaceholderCard(name) && received === 0 && previous === 0 && expense === 0 && supplier === 0) {
      return false;
    }
    if (!queryNorm && rules.hideZeroPlaceholderCards && isPlaceholderCard(name) && received === 0 && previous === 0 && expense === 0 && supplier === 0) {
      return false;
    }
    if (!queryNorm) return true;
    if (isSparexpert) {
      const { cleanName, badgeText } = getAccountDisplayInfo(name, true, accountCatalog, false);
      return `${name} ${cleanName} ${badgeText}`.toLocaleLowerCase("az-AZ").includes(queryNorm);
    }
    const cleanName = normalizePersonName(name);
    const channelLabel = /^K\./i.test(name) ? "Kart / Bank" : "Kassa";
    return `${name} ${cleanName} ${channelLabel}`.toLocaleLowerCase("az-AZ").includes(queryNorm);
  });

  const visibleEntries = orderDailyDisplayEntries(dayEntries.filter((entry) => {
    const normalized = query.trim().toLocaleLowerCase("az-AZ");
    const account = accountCatalog.find((item) => item.id === entry.accountId);
    const personLabel = resolveEntryPerson(entry, account);
    const channelLabel = resolveEntryChannel(entry, account);
    const matchesQuery = !normalized || `${entry.title} ${entry.counterparty} ${entry.category} ${personLabel} ${channelLabel} ${entry.responsible ?? ""} ${entry.bank ?? ""} ${entry.note ?? ""}`.toLocaleLowerCase("az-AZ").includes(normalized);
    const matchesAccount = !accountFilter || entry.accountId === accountFilter || entry.targetAccountId === accountFilter;
    return matchesQuery && matchesAccount;
  }), activeCompanyId);
  const pendingEntryRequestById = new Map(
    entryChangeRequests.filter((request) => request.status === "pending").map((request) => [request.entryId, request]),
  );

  const defaultCategoryForKind = (nextKind: EntryKind) => {
    if (nextKind === "transfer") return "Hesablararası köçürmə";
    if (nextKind === "income") return categoryList.find((item) => item.toLocaleLowerCase("az-AZ").includes("vəsait qəbulu")) || categoryList[0] || "Vəsait qəbulu";
    return categoryList.find((item) => !item.toLocaleLowerCase("az-AZ").includes("vəsait qəbulu")) || "Digər xərc";
  };

  const openEntry = (nextKind: EntryKind) => {
    if (closeRecord) return;
    setEditingEntry(null);
    setEntryDialogError("");
    setKind(nextKind);
    const defaultPerson = isSparexpert
      ? "Ceyhun"
      : (peopleList.find((p) => p !== "Ümumi") ?? peopleList[0] ?? "Eşqin");
    const defaultChannel = isSparexpert ? "Kassa" : (channelList[0] ?? "Kassa");
    const secondChannel = isSparexpert
      ? "Kapital Bank"
      : (channelList.find((c) => c !== defaultChannel) ?? defaultChannel);
    setDraft({
      amount: "",
      person: defaultPerson,
      channel: defaultChannel,
      targetPerson: defaultPerson,
      targetChannel: secondChannel,
      counterparty: "",
      category: defaultCategoryForKind(nextKind),
      note: "",
      changeReason: "",
      expenseMethod: "online",
    });
    setEntryOpen(true);
  };

  const openEntryForAccount = (nextKind: EntryKind, accountName: string) => {
    if (closeRecord) return;
    setStatementAccountName(null);
    setEditingEntry(null);
    setEntryDialogError("");
    setKind(nextKind);
    const targetAcc = accountCatalog.find((acc) => acc.name === accountName || acc.id === accountName);
    const isCard = /^K\./i.test(accountName) || /^Kart/i.test(accountName) || targetAcc?.type === "card";
    const isAggregate = isAggregateAccount(accountName);
    const cleanName = isAggregate ? "Eşqin" : (targetAcc?.person || normalizePersonName(accountName));
    const person = peopleList.find((p) => p.toLocaleLowerCase("az-AZ") === cleanName.toLocaleLowerCase("az-AZ")) ?? cleanName;
    const channel = targetAcc?.channel
      ? targetAcc.channel
      : isCard
        ? (channelList.find((c) => c.toLocaleLowerCase("az-AZ").includes("kapital") || c.toLocaleLowerCase("az-AZ").includes("bank")) ?? "Kapital Bank")
        : "Kassa";
    const secondChannel = channelList.find((c) => c !== channel) ?? (isCard ? "Kassa" : "Kapital Bank");
    setDraft({
      amount: "",
      person,
      channel,
      targetPerson: person,
      targetChannel: secondChannel,
      counterparty: "",
      category: defaultCategoryForKind(nextKind),
      note: "",
      changeReason: "",
      expenseMethod: "online",
    });
    setEntryOpen(true);
  };

  const openEntryForEdit = (entry: Entry) => {
    if ((azartMobileNavigation || isSparexpert) && state.closes.some((record) => record.date === entry.date)) return;
    if (!can("daily.entries.edit") && !can("daily.entries.delete")) return;
    const pending = entryChangeRequests.find((request) => request.entryId === entry.id && request.status === "pending");
    if (pending) {
      setEntryApprovalOpen(true);
      return;
    }
    setEditingEntry(entry);
    setEntryDialogError("");
    setKind(entry.kind);
    setDraft({
      amount: String(Math.abs(entry.amount)).replace(".", ","),
      ...(isSparexpert ? {
        accountId: entry.accountId,
        targetAccountId: entry.targetAccountId,
        cardBank: entry.bank,
        targetCardBank: entry.targetBank,
      } : {}),
      person: resolveEntryPerson(entry),
      channel: resolveEntryChannel(entry),
      targetPerson: entry.targetResponsible || resolveEntryPerson(entry),
      targetChannel: entry.targetBank || channelList.find((item) => item !== resolveEntryChannel(entry)) || resolveEntryChannel(entry),
      counterparty: entry.counterparty || "",
      category: entry.category || defaultCategoryForKind(entry.kind),
      note: entry.note || "",
      changeReason: "",
      expenseMethod: entry.expenseMethod || "online",
    });
    setEntryOpen(true);
  };

  const openDailyContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    const element = event.target as HTMLElement;
    // Keep native copy/paste behaviour inside data-entry fields.
    if (element.closest("input, textarea, select, [contenteditable='true']")) return;
    const entryId = element.closest<HTMLElement>("[data-daily-entry-id]")?.dataset.dailyEntryId;
    const accountId = element.closest<HTMLElement>("[data-daily-account-id]")?.dataset.dailyAccountId;
    const accountName = element.closest<HTMLElement>("[data-daily-account-name]")?.dataset.dailyAccountName;
    const entry = entryId ? state.entries.find((item) => item.id === entryId) : undefined;
    const account = accountId
      ? accountCatalog.find((item) => item.id === accountId)
      : accountName
        ? accountCatalog.find((item) => item.name === accountName || item.id === accountName)
        : undefined;
    // A context menu only belongs to an actual Daily record.  Empty spaces,
    // summary tiles and bank headers keep the native browser right click.
    if (!entry && !account) return;
    event.preventDefault();
    setDailyContextMenu({
      target: entry ? { type: "entry", entry } : { type: "account", account: account! },
      x: event.clientX,
      y: event.clientY,
    });
  };

  const editContextAccount = (account: Account) => {
    setDailyContextMenu(null);
    setAccountContextEdit(account);
    setView("cashboxes");
  };

  const azartMobileNavigation = (session.companyId || session.company?.id || "azartmembran") === "azartmembran" && !isSparexpert;
  const submitEntryChangeRequest = async (
    payload: { action: "update" | "delete" | "create_backdated"; entryId?: string; proposedEntry?: Entry; reason?: string },
    successMessage: string
  ) => {
    if ((azartMobileNavigation || isSparexpert) && state.closes.some((record) => record.date === (editingEntry?.date || payload.proposedEntry?.date))) {
      setEntryDialogError("Bu gün bağlıdır. Əvvəlcə günü yenidən açın.");
      return false;
    }
    if (payload.action === "update") {
      const reason = payload.reason?.trim();
      if (!reason || isPunctuationOnly(reason)) {
        setEntryDialogError("Düzəlişin səbəbini qeyd edin.");
        return false;
      }
      payload = { ...payload, reason };
    }
    setEntryDialogBusy(true);
    setEntryDialogError("");
    try {
      const response = await fetch("/api/daily/entry-change-requests", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({})) as { data?: EntryChangeRequest; error?: string; applied?: boolean };
      if (azartMobileNavigation && response.status === 404 && payload.entryId && payload.action !== "create_backdated") {
        const missingId = payload.entryId;
        setState((current) => ({ ...current, entries: current.entries.filter((entry) => entry.id !== missingId) }));
        setEntryOpen(false);
        setEditingEntry(null);
        setEntryNotice("Əməliyyat artıq serverdə yoxdur. Gündəlik yeniləndi.");
        void refreshDailySnapshot().catch(() => undefined);
        return false;
      }
      if (!response.ok) throw new Error(result.error || "Əməliyyat sorğusu göndərilmədi.");
      if (result.data) setEntryChangeRequests((current) => [result.data!, ...current.filter((item) => item.id !== result.data!.id)]);
      if (result.applied) void refreshDailySnapshot().catch(() => undefined);
      setEntryNotice(result.applied ? "Əməliyyat birbaşa tətbiq edildi." : successMessage);
      setEntryOpen(false);
      setEditingEntry(null);
      return true;
    } catch (error) {
      setEntryDialogError(error instanceof Error ? error.message : "Əməliyyat sorğusu göndərilmədi.");
      return false;
    } finally {
      setEntryDialogBusy(false);
    }
  };

  const requestEntryDeletion = async () => {
    if (!editingEntry || !can("daily.entries.delete")) return;
    if (!window.confirm(isSparexpert && rules.requireEntryDeleteApproval === false ? "Bu əməliyyatı silmək istəyirsiniz?" : "Bu əməliyyatın silinməsini təsdiqə göndərmək istəyirsiniz? Təsdiqədək balans dəyişməyəcək.")) return;
    await submitEntryChangeRequest(
      { action: "delete", entryId: editingEntry.id, reason: draft.changeReason },
      "Silinmə təsdiq üçün göndərildi. Mövcud qeyd və balans dəyişdirilmədi."
    );
  };

  const spareEntryAttempt = useRef<Entry | null>(null);

  const saveEntry = async (event: FormEvent) => {
    event.preventDefault();
    if (entryDialogBusy) return;
    if ((azartMobileNavigation || isSparexpert) && state.closes.some((record) => record.date === (editingEntry?.date || selectedDate))) {
      setEntryDialogError("Bu gün bağlıdır. Əvvəlcə günü yenidən açın.");
      return;
    }
    if (azartMobileNavigation && isPunctuationOnly(draft.note)) {
      setEntryDialogError("Qeyd yalnız durğu işarələrindən ibarət ola bilməz.");
      return;
    }

    setEntryDialogError("");
    const amount = Number(draft.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || !draft.person || !draft.channel) {
      setEntryDialogError("Məbləğ, şəxs və hesab/kanal məcburidir.");
      return;
    }
    if (kind !== "transfer" && !draft.category.trim()) {
      setEntryDialogError("Kateqoriya seçilməlidir.");
      return;
    }
    if (isSparexpert && [investorKey(investorPaymentCategory), "yatırım"].includes(investorKey(draft.category)) &&
        (!investorParty(draft.counterparty || "") || kind !== (investorKey(draft.category) === "yatırım" ? "income" : "expense"))) {
      setEntryDialogError("Yatırımçını qarşı tərəf kimi seçin. Yatırım qəbulu mədaxil, geri ödəniş məxaric kimi yazılır.");
      return;
    }
    if (isSparexpert && (draft.accountId === "choose-card-account" || (kind === "transfer" && draft.targetAccountId === "choose-card-account"))) {
      setEntryDialogError("Bankın altında istifadə edəcəyiniz kartı seçin.");
      return;
    }
    const sourceAccount = (draft.accountId && accountCatalog.find((a) => a.id === draft.accountId))
      || findAccountForPersonChannel(draft.person, draft.channel, accountCatalog);
    const targetAccount = kind === "transfer"
      ? ((draft.targetAccountId && accountCatalog.find((a) => a.id === draft.targetAccountId))
         || findAccountForPersonChannel(draft.targetPerson, draft.targetChannel, accountCatalog))
      : undefined;
    if (isSparexpert) {
      const matches = (id: string | undefined, person: string, channel: string) =>
        accountCatalog.some((account) => !account.archived && !isAggregateAccount(account.name) && (id
          ? account.id === id
          : normalizePersonName(account.person || "").toLocaleLowerCase("az-AZ") === normalizePersonName(person).toLocaleLowerCase("az-AZ") &&
            (account.channel || "").trim().toLocaleLowerCase("az-AZ") === channel.trim().toLocaleLowerCase("az-AZ")));
      const missing = !matches(draft.accountId, draft.person, draft.channel)
        ? [draft.person, draft.channel]
        : kind === "transfer" && !matches(draft.targetAccountId, draft.targetPerson, draft.targetChannel)
          ? [draft.targetPerson, draft.targetChannel]
          : null;
      if (missing) {
        setEntryDialogError(`${missing.filter(Boolean).join(" · ")} hesabı mövcud deyil. Əvvəlcə Hesablar bölməsindən hesabı yaradın, sonra əməliyyatı saxlayın.`);
        return;
      }
    }
    const title = kind === "transfer"
      ? `${draft.person} (${draft.channel}) → ${draft.targetPerson} (${draft.targetChannel})`
      : kind === "income"
        ? "Mədaxil"
        : "Məxaric";
    const entry: Entry = {
      ...(editingEntry || {} as Entry),
      id: editingEntry?.id || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `ent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      date: editingEntry?.date || selectedDate,
      time: editingEntry?.time || timeNow(),
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
      expenseMethod: kind === "expense" && draft.channel.toLocaleLowerCase("az-AZ") !== "kassa" ? (draft.expenseMethod || "online") : undefined,
      invoiced: editingEntry?.invoiced || false,
      invoiceNo: editingEntry?.invoiceNo,
    };
    if (editingEntry) {
      await submitEntryChangeRequest(
        { action: "update", entryId: editingEntry.id, proposedEntry: entry, reason: draft.changeReason },
        "Düzəliş təsdiq üçün göndərildi. Mövcud balans dəyişdirilmədi."
      );
      return;
    }
    if (entry.date < todayKey) {
      await submitEntryChangeRequest(
        { action: "create_backdated", proposedEntry: entry, reason: draft.changeReason },
        "Keçmiş tarix əməliyyatı təsdiq üçün göndərildi. Təsdiqədək balans dəyişməyəcək."
      );
      return;
    }
    if (isSparexpert) {
      const attempt = spareEntryAttempt.current;
      const pendingEntry = attempt ? { ...entry, id: attempt.id, time: attempt.time } : entry;
      spareEntryAttempt.current = pendingEntry;
      setEntryDialogBusy(true);
      setEntryDialogError("");
      try {
        const response = await fetch("/api/daily/entries", {
          method: "POST", credentials: "include", headers: { "content-type": "application/json" },
          body: JSON.stringify({ entry: pendingEntry }),
        });
        const payload = await response.json();
        if (!response.ok || payload.data?.id !== pendingEntry.id) throw new Error(payload.error || "Server əməliyyatı təsdiqləmədi.");
        spareEntryAttempt.current = null;
        setEntryNotice("Əməliyyat serverdə saxlanıldı.");
        setEntryOpen(false);
        void refreshDailySnapshot().catch(() => undefined);
      } catch (error) {
        setEntryDialogError(error instanceof Error ? error.message : "Serverə göndərilmədi. Yenidən cəhd edin.");
      } finally {
        setEntryDialogBusy(false);
      }
      return;
    }
    setState((current) => ({ ...current, entries: [...current.entries, entry] }));
    setEntryOpen(false);
  };

  const quickActions = [
    { kind: "income" as const, label: "Mədaxil", Icon: ArrowDownLeft },
    { kind: "expense" as const, label: "Məxaric", Icon: ArrowUpRight },
    { kind: "transfer" as const, label: "Köçürmə", Icon: ArrowLeftRight },
  ];

  const handleUniversalCreate = () => {
    if (view === "invoices") {
      setInvoiceCreateSignal((s) => s + 1);
    } else {
      openEntry("income");
    }
  };

  const resolveEntryChangeRequest = async (requestId: string, action: "approve" | "reject", note = "") => {
    setEntryApprovalBusy(true);
    try {
      const request = entryChangeRequests.find((item) => item.id === requestId);
      const requestLabel = request?.action === "delete" ? "Silinmə" : request?.action === "create_backdated" ? "Keçmiş tarix əlavəsi" : "Düzəliş";
      const response = await fetch(`/api/daily/entry-change-requests/${requestId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const payload = await response.json().catch(() => ({})) as { data?: EntryChangeRequest; error?: string; revision?: number };
      if (!response.ok) throw new Error(payload.error || "Qərar saxlanılmadı.");
      await Promise.all([loadEntryChangeRequests(), action === "approve" ? refreshDailySnapshot() : Promise.resolve()]);
      setEntryNotice(action === "approve" ? `${requestLabel} təsdiqləndi və balans yeniləndi.` : `${requestLabel} rədd edildi; balans dəyişmədi.`);
    } catch (error) {
      setEntryNotice(error instanceof Error ? error.message : "Qərar saxlanılmadı.");
    } finally {
      setEntryApprovalBusy(false);
    }
  };

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

  const canManageNotifications = can("daily.notifications.manage");
  const canManageSystem = can("daily.users.manage") || canManageNotifications || can("daily.audit.view");
  const showInAppNotifications = inAppNotificationsEnabled;
  const canOpenMobileApprovals = (can("daily.entries.edit") || can("daily.entries.delete") || can("daily.entries.create") || can("daily.entries.approve"));
  const mobilePendingCount = canOpenMobileApprovals ? entryChangeRequests.filter((item) => item.status === "pending").length : 0;
  const managementActive = view === "cashboxes" || view === "categories" || view === "people" || view === "customers" || view === "settings" || view === "management";
  const navIconSize = sidebarCollapsed ? 22 : 19;

  const handleCompanySwitch = async (targetId: string) => {
    if (targetId === session.companyId || targetId === session.company?.id) {
      setTopMenu(null);
      return;
    }
    setTopMenu(null);
    setSwitchingCompany(true);
    setSyncStatus("saving");
    try {
      const res = await fetch("/api/daily-auth/switch-company", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: targetId }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Şirkət dəyişdirilə bilmədi");
      }
      window.location.reload();
    } catch (err) {
      if (session.id === "daily-local-dev") {
        localStorage.setItem("arix-daily-local-company", targetId);
        window.location.reload();
        return;
      }
      alert(err instanceof Error ? err.message : "Xəta baş verdi");
      setSwitchingCompany(false);
      setSyncStatus("saved");
    }
  };

  const activeCardBanks = useMemo(() => {
    const people = new Map<string, Map<string, { bank: string; balance: number; moved: boolean }>>();
    if (!isSparexpert) return people;
    const record = (person: string | undefined, bank: string | undefined, delta: number, moved: boolean) => {
      const owner = normalizePersonName(person).toLocaleLowerCase("az-AZ");
      const key = normalizeBankKey(bank);
      if (!owner || !bank || key === "other" || key === "total") return;
      const cards = people.get(owner) ?? new Map();
      people.set(owner, cards);
      const card = cards.get(key) ?? { bank, balance: 0, moved: false };
      card.balance += delta;
      card.moved ||= moved;
      cards.set(key, card);
    };
    for (const group of SPAREXPERT_CARD_REPORT) {
      for (const row of group.rows) record(row.person, group.bank, spareCardOpening(row.person, group.bank), false);
    }
    const accountTypes = new Map(accountCatalog.flatMap((account) => [[account.id, account.type], [account.name, account.type]]));
    for (const entry of state.entries) {
      if (entry.date < SPAREXPERT_FIRST_DATE || entry.date > selectedDate) continue;
      const amount = Math.abs(entry.amount);
      const moved = entry.date === selectedDate && amount > 0;
      if (accountTypes.get(entry.accountId) === "card") {
        record(entry.responsible, entry.bank, entry.kind === "income" ? amount : -amount, moved);
      }
      if (entry.kind === "transfer" && entry.targetAccountId && accountTypes.get(entry.targetAccountId) === "card") {
        record(entry.targetResponsible, entry.targetBank, amount, moved);
      }
    }
    return people;
  }, [accountCatalog, isSparexpert, selectedDate, state.entries]);

  const cardBanksFor = (name: string, cleanName: string, badgeClass: string) => {
    if (!isSparexpert || badgeClass !== "card") return [];
    const account = accountCatalog.find((item) => item.name === name);
    if (account?.channel !== "Kart") return [];
    const person = normalizePersonName(account.person || cleanName).toLocaleLowerCase("az-AZ");
    return Array.from(activeCardBanks.get(person)?.values() ?? [])
      .filter((card) => card.moved || Math.round(card.balance * 100) !== 0);
  };

  const renderReconRow = ([name, received, previous, expense, supplier, transfer = 0]: ReconciliationRow) => {
    const current = isSparexpert
      ? previous + received - supplier - expense + (transfer || 0)
      : received + previous - expense - supplier;
    const autoTo = !isSparexpert && isAutoSupplierCollector(name);
    const { cleanName, badgeText, badgeClass } = getAccountDisplayInfo(name, isSparexpert, accountCatalog, autoTo);
    const showBankLogo = isSparexpert && badgeClass === "bank" && normalizeBankKey(badgeText) !== "other";
    const cardBanks = cardBanksFor(name, cleanName, badgeClass);
    const customLogo = isSparexpert ? accountCatalog.find((account) => account.id === name || account.name === name)?.logo || bankLogos[bankDirectoryKey(badgeText)] : undefined;
    const accountIcons = (size: number) => customLogo && !isAggregateAccount(name)
      ? <img src={customLogo} width={size} height={size} style={{ objectFit: "contain" }} alt="" />
      : cardBanks.length
      ? cardBanks.map(({ bank }) => <BankLogo key={bank} bank={bank} size={size} />)
      : showBankLogo ? <BankLogo bank={badgeText} size={size} />
      : isAggregateAccount(name) ? <WalletCards size={size} aria-hidden="true" />
      : badgeClass === "cash" ? <Banknote size={size} className="sp-icon-cash" aria-hidden="true" />
      : badgeClass === "bank" ? <Building2 size={size} aria-hidden="true" />
      : <CreditCard size={size} className="sp-icon-card" aria-hidden="true" />;

    return (
      <article
        key={name}
        className="recon-row clickable-recon-row"
        data-daily-account-name={name}
        role="button"
        tabIndex={0}
        title={`${cleanName} hesabının günün dökümünü açmaq üçün klikləyin`}
        onClick={() => setStatementAccountName(name)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setStatementAccountName(name);
          }
        }}
      >
        <div className="reconciliation-mobile-card">
          <div className="recon-m-head">
            <div className="recon-m-identity">
              {isSparexpert && <span className="sp-mobile-account-icons" title={cardBanks.length ? cardBanks.map(({ bank }) => bank).join(", ") : badgeText}>{accountIcons(18)}</span>}
              <span className="recon-m-name">{cleanName}</span>
              {!isSparexpert && <span className={cx("recon-badge", badgeClass)}>{badgeText}</span>}
            </div>
            <div className="recon-m-current">
              <span className="recon-m-label">Cari qalıq</span>
              <strong className="recon-m-balance">{formatMoney(current, "AZN")}</strong>
            </div>
          </div>
          <div className="recon-m-pills">
            <div className="recon-m-pill">
              <span className="pill-label">Əvvəl</span>
              <span className="pill-val">{formatMoney(previous, "AZN")}</span>
            </div>
            <div className={cx("recon-m-pill", received > 0 && "pill-positive")}>
              <span className="pill-label">+Qəbul</span>
              <span className="pill-val">{formatMoney(received, "AZN")}</span>
            </div>
            {isSparexpert ? (
              <>
                <div className={cx("recon-m-pill", supplier > 0 && "pill-warning")}>
                  <span className="pill-label">−Ödəniş</span>
                  <span className="pill-val">{formatMoney(supplier, "AZN")}</span>
                </div>
                <div className={cx("recon-m-pill", expense > 0 && "pill-negative")}>
                  <span className="pill-label">−Rasxod</span>
                  <span className="pill-val">{formatMoney(expense, "AZN")}</span>
                </div>
                <div className={cx("recon-m-pill", transfer > 0 ? "pill-positive" : transfer < 0 ? "pill-negative" : "")}>
                  <span className="pill-label">±Köçürmə</span>
                  <span className="pill-val">{transfer !== 0 ? (transfer > 0 ? `+${formatMoney(transfer, "AZN")}` : formatMoney(transfer, "AZN")) : "0 ₼"}</span>
                </div>
              </>
            ) : (
              <>
                <div className={cx("recon-m-pill", expense > 0 && "pill-negative")}>
                  <span className="pill-label">−Xərc</span>
                  <span className="pill-val">{formatMoney(expense, "AZN")}</span>
                </div>
                <div className={cx("recon-m-pill", supplier > 0 && "pill-warning")}>
                  <span className="pill-label">−TÖ</span>
                  <span className="pill-val">{formatMoney(supplier, "AZN")}</span>
                </div>
              </>
            )}
          </div>
          <div className="recon-m-footer">
            <span className="recon-m-hint">Günün dökümünə baxmaq üçün toxunun</span>
            <ChevronRight size={13} className="recon-m-chevron" />
          </div>
        </div>
        <b className="recon-person-cell" title={`${cleanName} (${badgeText}${autoTo ? " — Vəsait qəbulu avtomatik təchizatçı ödənişinə silinir" : ""})`}>
          {isSparexpert && <span className="sp-recon-leading-icon">
            {accountIcons(18)}
          </span>}
          <span className="recon-person">{cleanName}</span>{" "}
          {!showBankLogo && !cardBanks.length && <small className={cx("recon-badge", badgeClass)}>{badgeText}</small>}
        </b>
        <strong className="recon-current-cell">{formatMoney(current, "AZN")}</strong>
        <span data-label="Əvvəldən qalıq" className="recon-cell-previous">{formatMoney(previous, "AZN")}</span>
        <span data-label="Vəsait qəbulu" className="recon-cell-received">{formatMoney(received, "AZN")}</span>
        {isSparexpert ? (
          <>
            <span data-label="Ödəniş" className={cx("recon-cell-supplier", supplier ? "outflow" : "")}>{formatMoney(supplier, "AZN")}</span>
            <span data-label="Rasxod" className={cx("recon-cell-expense", expense ? "outflow" : "")}>{formatMoney(expense, "AZN")}</span>
            <span data-label="Daxili Köçürmə" className={cx("recon-cell-transfer", (transfer || 0) < 0 ? "outflow" : (transfer || 0) > 0 ? "positive" : "")}>
              {(transfer || 0) !== 0 ? ((transfer || 0) > 0 ? `+${formatMoney(transfer || 0, "AZN")}` : formatMoney(transfer || 0, "AZN")) : "0 ₼"}
            </span>
          </>
        ) : (
          <>
            <span data-label="Xərc" className={cx("recon-cell-expense", expense ? "outflow" : "")}>{formatMoney(expense, "AZN")}</span>
            <span data-label="Təchizatçı" className={cx("recon-cell-supplier", supplier ? "outflow" : "")}>{formatMoney(supplier, "AZN")}</span>
          </>
        )}
      </article>
    );
  };

  const renderSparexpertReconCard = ([name, received, previous, expense, supplier, transfer = 0]: ReconciliationRow) => {
    const current = previous + received - supplier - expense + (transfer || 0);
    const { cleanName, badgeText, badgeClass } = getAccountDisplayInfo(name, true, accountCatalog, false);
    const acc = accountCatalog.find((a) => a.id === name || a.name === name);
    const channelBank = acc?.channel || badgeText;
    const customLogo = acc?.logo || bankLogos[bankDirectoryKey(channelBank)] || bankLogos[bankDirectoryKey(badgeText)];
    const showBankLogo = badgeClass === "bank" && normalizeBankKey(badgeText) !== "other";
    const cardBanks = cardBanksFor(name, cleanName, badgeClass);

    return (
      <div
        key={name}
        className="sp-recon-card clickable-recon-row"
        data-daily-account-name={name}
        role="button"
        tabIndex={0}
        title={`${cleanName} hesabının günün dökümünü açmaq üçün klikləyin`}
        onClick={() => setStatementAccountName(name)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setStatementAccountName(name);
          }
        }}
      >
        <div className="sp-recon-card-head">
          <div className="sp-recon-card-identity">
            <span className="sp-recon-card-icon">
              {customLogo && !isAggregateAccount(name) ? (
                <img src={customLogo} width={22} height={22} style={{ objectFit: "contain" }} alt="" />
              ) : cardBanks.length ? cardBanks.map(({ bank }) => <BankLogo key={bank} bank={bank} size={19} />) : isAggregateAccount(name) ? (
                <WalletCards size={19} aria-hidden="true" />
              ) : badgeClass === "bank" ? (
                <BankLogo bank={showBankLogo ? badgeText : channelBank} size={22} />
              ) : badgeClass === "cash" ? (
                <Banknote size={19} className="sp-icon-cash" />
              ) : (
                <CreditCard size={19} className="sp-icon-card" />
              )}
            </span>
            <div className="sp-recon-card-titles">
              <span className="sp-recon-card-name" title={cleanName}>{cleanName}</span>
              {!showBankLogo && !cardBanks.length && <span className={cx("recon-badge", badgeClass)}>{badgeText}</span>}
            </div>
          </div>
        </div>

        <div className="sp-recon-card-pills sp-recon-six-metrics">
          <div className={cx("sp-recon-pill pill-current", current < 0 && "pill-negative")}>
            <span className="sp-pill-label">Cari qalıq</span>
            <span className="sp-pill-val">{formatMoney(current, "AZN")}</span>
          </div>
          <div className="sp-recon-pill pill-neutral" title="Əvvəldən qalıq">
            <span className="sp-pill-label">Əvvəl</span>
            <span className="sp-pill-val">{formatMoney(previous, "AZN")}</span>
          </div>
          <div className={cx("sp-recon-pill", received > 0 && "pill-positive")} title="Vəsait qəbulu / Mədaxil">
            <span className="sp-pill-label">+Qəbul</span>
            <span className="sp-pill-val">{formatMoney(received, "AZN")}</span>
          </div>
          <div className={cx("sp-recon-pill", supplier > 0 && "pill-warning")} title="Təchizatçı ödənişi (TÖ)">
            <span className="sp-pill-label">−Ödəniş</span>
            <span className="sp-pill-val">{formatMoney(supplier, "AZN")}</span>
          </div>
          <div className={cx("sp-recon-pill", expense > 0 && "pill-negative")} title="Rasxod / Xərclər">
            <span className="sp-pill-label">−Rasxod</span>
            <span className="sp-pill-val">{formatMoney(expense, "AZN")}</span>
          </div>
          <div className={cx("sp-recon-pill", transfer > 0 ? "pill-positive" : transfer < 0 ? "pill-negative" : "")} title="Daxili Köçürmə (en sonda)">
            <span className="sp-pill-label">±Köçürmə</span>
            <span className="sp-pill-val">
              {transfer !== 0 ? (transfer > 0 ? `+${formatMoney(transfer, "AZN")}` : formatMoney(transfer, "AZN")) : "0 ₼"}
            </span>
          </div>
        </div>

        <div className="sp-recon-card-footer">
          <span className="sp-recon-card-hint">Günün dökümünə baxmaq üçün toxunun</span>
          <ChevronRight size={13} className="sp-recon-chevron" />
        </div>
      </div>
    );
  };

  const reconSections = useMemo(() => {
    if (!isSparexpert) return [];
    const cashRows: ReconciliationRow[] = [];
    const bankRows: ReconciliationRow[] = [];
    const cardRows: ReconciliationRow[] = [];

    for (const row of visibleReconciliationRows) {
      if (isAggregateAccount(row[0])) continue;
      const cat = getReconRowCategory(row[0], isSparexpert, accountCatalog);
      if (cat === "cash") cashRows.push(row);
      else if (cat === "bank") bankRows.push(row);
      else cardRows.push(row);
    }

    const calcTotals = (rows: ReconciliationRow[]) =>
      rows.reduce(
        (acc, [, received, previous, expense, supplier, transfer = 0]) => {
          const current = previous + received - supplier - expense + (transfer || 0);
          return {
            count: acc.count + 1,
            previous: acc.previous + previous,
            received: acc.received + received,
            expense: acc.expense + expense,
            supplier: acc.supplier + supplier,
            transfer: acc.transfer + (transfer || 0),
            current: acc.current + current,
          };
        },
        { count: 0, previous: 0, received: 0, expense: 0, supplier: 0, transfer: 0, current: 0 }
      );

    return [
      {
        key: "cash" as const,
        title: "Kassa Hesabları",
        icon: <Banknote size={15} className="recon-group-icon icon-cash" />,
        rows: cashRows,
        totals: calcTotals(cashRows),
      },
      {
        key: "bank" as const,
        title: "Rəsmi Bank Hesabları",
        icon: <Building2 size={15} className="recon-group-icon icon-bank" />,
        rows: bankRows,
        totals: calcTotals(bankRows),
      },
      {
        key: "card" as const,
        title: "Kart Hesabları",
        icon: <CreditCard size={15} className="recon-group-icon icon-card" />,
        rows: cardRows,
        totals: calcTotals(cardRows),
      },
    ].filter((sec) => sec.rows.length > 0);
  }, [visibleReconciliationRows, isSparexpert, accountCatalog]);

  return (
    <div className="app-shell" onContextMenu={openDailyContextMenu}>
      <header className="topbar">
        <div className="topbar-brand">
          <AriXLogo className="arix-logo" />
          <div className="topbar-company-title">
            <b>AriX Daily</b>
            <span className="topbar-company-name">{session.company?.name || "Azart Membran"}</span>
          </div>
        </div>
        <div className="topbar-actions">
          {session.availableCompanies && session.availableCompanies.length > 1 && (
            <div className="topbar-menu-wrap company-switch-wrap">
              <button
                type="button"
                className="topbar-option company-switch-btn"
                onClick={() => setTopMenu(topMenu === "company" ? null : "company")}
                disabled={switchingCompany}
                title="Şirkəti dəyiş"
              >
                <Building2 size={16} />
                <span className="hide-xs">{session.company?.name || "Şirkət"}</span>
                <ChevronDown size={14} className={topMenu === "company" ? "rotated" : ""} />
              </button>
              {topMenu === "company" && (
                <div className={cx("top-popover company-popover", theme === "dark" && "is-dark")}>
                  <div className="company-popover-head">
                    <b>Şirkəti dəyiş</b>
                    <small>Aktiv şirkət hesabı</small>
                  </div>
                  {session.availableCompanies.map((c) => {
                    const isActive = session.companyId === c.id || session.company?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={cx("company-item", isActive && "active")}
                        onClick={() => void handleCompanySwitch(c.id)}
                      >
                        <div>
                          <strong>{c.name}</strong>
                          <small>{c.features?.qaime === false ? "Qaiməsiz gündəlik axın" : "Tam maliyyə və qaimə sistemi"}</small>
                        </div>
                        {isActive && <Check size={16} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="topbar-menu-wrap">
            <button className="topbar-option" onClick={() => setTopMenu(topMenu === "language" ? null : "language")}>
              <Globe2 size={18} />
              <span className="hide-xs">Azərbaycanca</span>
              <span className="show-xs">AZ</span>
              <ChevronDown size={14} className={topMenu === "language" ? "rotated" : ""} />
            </button>
            {topMenu === "language" && (
              <div className={cx("top-popover language-popover", theme === "dark" && "is-dark")}>
                <button className="lang-item active" onClick={() => setTopMenu(null)}>
                  <span className="lang-badge">AZ</span>
                  <strong>Azərbaycanca</strong>
                  <Check size={15} />
                </button>
                <small>Türk və ingilis dili sonrakı mərhələdə əlavə olunacaq.</small>
              </div>
            )}
          </div>
          <DisplayScaleControl key={activeCompanyId} companyId={activeCompanyId} theme={theme} onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")} />
          {canOpenMobileApprovals && <button
            type="button"
            className="topbar-option mobile-entry-approvals"
            aria-label={mobilePendingCount ? `Əməliyyat təsdiqləri, ${mobilePendingCount} gözləyən` : "Əməliyyat təsdiqləri"}
            onClick={() => { setTopMenu(null); setEntryApprovalOpen(true); }}
          >
            <ClipboardCheck size={17} />
            {mobilePendingCount > 0 && <span className="mobile-approvals-count" aria-hidden="true">{mobilePendingCount > 99 ? "99+" : mobilePendingCount}</span>}
          </button>}
          <div className="topbar-menu-wrap">
            <button className="icon-button notification-button" aria-label="Bildirişlər" onClick={() => { setPersonalNotificationSettingsOpen(false); setTopMenu(topMenu === "notifications" ? null : "notifications"); }}>
              <Bell size={18} />
              {showInAppNotifications && notifications.some((item) => !item.readAt) && <i />}
            </button>
            {topMenu === "notifications" && (
              <div className={cx("top-popover notification-popover", theme === "dark" && "is-dark")}>
                {personalNotificationSettingsOpen ? (
                  <section className="daily-personal-notifications" aria-label="Bildiriş ayarları">
                    <div className="notification-popover-head">
                      <b>Bildiriş ayarları</b>
                      <button type="button" className="notification-action-link" onClick={() => setPersonalNotificationSettingsOpen(false)}>Geri</button>
                    </div>
                    <p>Bu ayarlar yalnız bu cihazda tətbiq olunur.</p>
                  <label>
                    <span>Tətbiqdaxili bildirişlər</span>
                    <input type="checkbox" checked={inAppNotificationsEnabled} onChange={(event) => setInAppNotificationsEnabled(event.target.checked)} />
                  </label>
                  <label>
                    <span>Cihaz bildirişləri (push)</span>
                    <input type="checkbox" checked={pushEnabled} disabled={personalPushBusy} onChange={() => void changePersonalPush()} />
                  </label>
                  {!pushEnabled && <button type="button" className="notification-action-link" disabled={personalPushBusy} onClick={() => void changePersonalPush()}>
                    {personalPushBusy ? "Aktivləşdirilir…" : "Bu cihazda bildirişləri aç"}
                  </button>}
                  {personalPushStatus && <p role="status" aria-live="polite">{personalPushStatus}</p>}
                  <NotificationTypes isSparexpert={isSparexpert} />
                    {pushEnabled && <div className="notification-popover-actions">
                    {pushEnabled ? (
                      <>
                        <button type="button" className="notification-action-link success" onClick={() => void testPushNotification()}>Test et</button>
                        <button type="button" className="notification-action-link" disabled={personalPushBusy} onClick={() => void changePersonalPush(true)}>Yenilə</button>
                      </>
                    ) : (
                      <button type="button" className="notification-action-link" onClick={() => void enablePushNotifications()}>Bu cihazda bildirimləri aç</button>
                    )}
                  </div>}
                  </section>
                ) : <>
                <div className="notification-popover-head">
                  <div>
                    <b>Bildirişlər</b>
                    <small>{showInAppNotifications ? `${notifications.filter((item) => !item.readAt).length} oxunmamış` : "Tətbiqdaxili bildirişlər bağlıdır"}</small>
                  </div>
                    <button type="button" className="notification-action-link" aria-label="Bildiriş ayarları" title="Bildiriş ayarları" onClick={() => setPersonalNotificationSettingsOpen(true)}><Settings size={18} /></button>

                </div>
                {showInAppNotifications && <button type="button" className="notification-action-link" style={{ width: "100%", padding: "10px 12px", textAlign: "left" }} disabled={!notifications.some((item) => !item.readAt)} onClick={(event) => void markAllDailyNotifications(event, setNotifications, activeCompanyId)}>Hamısını oxunmuş et</button>}
                {showInAppNotifications && notifications.slice(0, 5).map((notification) => <button type="button" key={notification.id} className={cx("notification-item", !notification.readAt && "unread")} onClick={() => void markNotificationRead(notification)}>
                  <Bell size={15} />
                  <span><strong>{notification.title}</strong><small>{notification.message}</small><time>{new Date(notification.createdAt).toLocaleString("az-AZ")}</time></span>
                </button>)}
                {showInAppNotifications && notifications.length === 0 && <div className="notification-empty">Yeni bildiriş yoxdur.</div>}
                <article>
                  {syncStatus === "saved" ? <Check size={16} /> : syncStatus === "conflict" ? <X size={16} /> : <ArrowLeftRight size={16} />}
                  <span>
                    <strong>{syncStatus === "saved" ? "Sunucuda saxlanıldı" : syncStatus === "saving" ? "Saxlanılır" : syncStatus === "conflict" ? "Senkronizasiya toqquşması" : syncStatus === "offline" ? "Yalnız bu cihazda" : "Sunucuya bağlanılır"}</strong>
                    <small>{syncStatus === "conflict" ? "Başqa cihazdakı yeni məlumatı silməmək üçün avtomatik qeyd dayandırıldı." : syncStatus === "offline" ? "Bağlantı bərpa ediləndə səhifəni yeniləyin." : "Daily məlumatları ayrıca SQLite bazasında qorunur."}</small>
                  </span>
                </article>
                {canManageNotifications && <button className="notification-manage-link" onClick={() => { setView("management"); setTopMenu(null); }}><ShieldCheck size={15} /> {azartMobileNavigation ? "Bildiriş və audit (idarəçi)" : "Bildirişləri idarə et"}</button>}
                </>}
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
              <div className={cx("top-popover profile-popover", theme === "dark" && "is-dark")}>
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
                {canManageSystem && <button className="profile-action" onClick={() => { setView("management"); setTopMenu(null); }}>
                  <ShieldCheck size={15} />
                  <span>İdarəetmə paneli</span>
                </button>}
                <button className="profile-action" onClick={() => void onLogout()}>
                  <LockKeyhole size={15} />
                  <span>Çıxış et</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={cx("workspace", isSparexpert && "spare-workspace", sidebarCollapsed && "sidebar-collapsed")}>
        <aside className="sidebar-shell">
          <div className="sidebar">
            <nav className="sidebar-nav">
              <button
                className="sidebar-primary"
                title={sidebarCollapsed ? (view === "invoices" ? "Yeni qaimə" : "Yeni əməliyyat") : undefined}
                onClick={handleUniversalCreate}
                disabled={view === "invoices" ? !can("daily.invoices.manage") : (Boolean(closeRecord) || !can("daily.entries.create"))}
              >
                <Plus size={sidebarCollapsed ? 22 : 19} />
                <span>{view === "invoices" ? "Yeni qaimə" : "Yeni əməliyyat"}</span>
              </button>
              <ViewTabs
                view={view}
                onChange={setView}
                onCreate={handleUniversalCreate}
                createDisabled={view === "invoices" ? !can("daily.invoices.manage") : (Boolean(closeRecord) || !can("daily.entries.create"))}
                collapsed={sidebarCollapsed}
                hasQaime={hasQaime}
                mobileReports={!isSparexpert}
              />
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
                    {can("daily.directories.manage") && <button className={view === "categories" ? "active" : ""} title={sidebarCollapsed ? "Kateqoriyalar" : undefined} onClick={() => setView("categories")}><Tags size={16} /><span>Kateqoriyalar</span></button>}
                    {can("daily.settings.manage") && <button className={view === "settings" ? "active" : ""} title={sidebarCollapsed ? "Tənzimləmələr" : undefined} onClick={() => setView("settings")}><Settings size={16} /><span>Tənzimləmələr</span></button>}
                    {(can("daily.entries.edit") || can("daily.entries.delete") || can("daily.entries.create") || can("daily.entries.approve")) && <button title={sidebarCollapsed ? "Əməliyyat təsdiqləri" : undefined} onClick={() => setEntryApprovalOpen(true)}><ClipboardCheck size={16} /><span>Əməliyyat təsdiqləri</span>{entryChangeRequests.some((item) => item.status === "pending") && <em>{entryChangeRequests.filter((item) => item.status === "pending").length}</em>}</button>}
                    {canManageSystem && <button className={view === "management" ? "active" : ""} title={sidebarCollapsed ? "İdarəetmə paneli" : undefined} onClick={() => setView("management")}><ShieldCheck size={16} /><span>Bildiriş və audit</span></button>}
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
        <main className={cx(view === "customers" && "customers-view", isSparexpert && view === "reports" && "spare-reports-view")}>
          {!isSparexpert && (view === "accounts" || view === "reports") && (
            <nav className="mobile-report-sections" aria-label="Hesabat bölmələri">
              <button type="button" aria-pressed={view === "accounts"} onClick={() => setView("accounts")}>Hesablar və kart</button>
              <button type="button" aria-pressed={view === "reports"} onClick={() => setView("reports")}>Digər hesabatlar</button>
            </nav>
          )}
          {isSparexpert && view === "reports" && (
            <nav className="spare-report-sections" aria-label="Hesabat bölmələri">
              <button type="button" aria-pressed={!spareReportCards} onClick={() => setSpareReportCards(false)}>Aylıq hesabatlar</button>
              <button type="button" aria-pressed={spareReportCards} onClick={() => setSpareReportCards(true)}>Kart hesabatı</button>
            </nav>
          )}
          {entryNotice && <div className="entry-notice"><ClipboardCheck size={16} /><span>{entryNotice}</span><button type="button" onClick={() => setEntryNotice("")}><X size={14} /></button></div>}
          {view === "daily" && <>
            {closeRecord && <div className="closed-banner"><LockKeyhole size={18} /><div><b>Bu gün bağlanıb</b><span>{new Date(closeRecord.closedAt).toLocaleString("az-AZ")} tarixində təsdiqlənib.</span></div></div>}

            <section className="date-strip date-strip-primary" aria-label="Tarix seçimi">
              <button className="date-arrow" disabled={isSparexpert && selectedDate <= SPAREXPERT_FIRST_DATE} onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} aria-label="Əvvəlki gün"><ChevronLeft size={18} /></button>
              <div className="date-list">{dates.map((key, index) => {
                if (isSparexpert && key < SPAREXPERT_FIRST_DATE) return null;
                const distance = Math.abs(index - 3);
                return <button key={key} className={cx(key === selectedDate && "selected", key === todayKey && "today", `date-distance-${distance}`)} aria-haspopup={key === selectedDate || key === todayKey ? "dialog" : undefined} title={key === selectedDate || key === todayKey ? "Təqvimi aç" : undefined} onClick={() => { if (key === selectedDate || key === todayKey) { setCalendarMonth(monthKey(key)); dayCalendarRef.current?.showModal(); return; } setSelectedDate(key); setAccountFilter(null); }}><small>{key === selectedDate ? "SEÇİLMİŞ GÜN" : key === todayKey ? "BU GÜN" : dateLabel(key, { weekday: "short" })}</small><b>{dateLabel(key, { day: "numeric" })} {dateLabel(key, { month: "short" })}</b><span>{dateLabel(key, { weekday: "short" })}</span></button>;
              })}</div>
              <button className="date-arrow" onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} aria-label="Növbəti gün"><ChevronRight size={18} /></button>
            </section>

            {<dialog ref={dayCalendarRef} className="day-calendar" aria-label="Gündəlik üçün tarix seçin">
              <div className="day-calendar-heading">
                <button type="button" className="date-arrow" aria-label="Əvvəlki ay" disabled={isSparexpert && calendarMonth <= SPAREXPERT_FIRST_MONTH} onClick={() => setCalendarMonth((m) => shiftMonth(m, -1))}><ChevronLeft size={18} /></button>
                <strong aria-live="polite">{monthLabel(calendarMonth)}</strong>
                <button type="button" className="date-arrow" aria-label="Növbəti ay" onClick={() => setCalendarMonth((m) => shiftMonth(m, 1))}><ChevronRight size={18} /></button>
              </div>
              <div className="day-calendar-grid">
                {["B.e.", "Ç.a.", "Ç.", "C.a.", "C.", "Ş.", "B."].map((day) => <small key={day}>{day}</small>)}
                {(() => {
                  const [year, month] = calendarMonth.split("-").map(Number);
                  const offset = (new Date(year, month - 1, 1, 12).getDay() + 6) % 7;
                  return Array.from({ length: offset + new Date(year, month, 0, 12).getDate() }, (_, index) => {
                    if (index < offset) return <span key={index} aria-hidden="true" />;
                    const day = index - offset + 1;
                    const date = `${calendarMonth}-${pad(day)}`;
                    return <button type="button" key={date} aria-label={dateLabel(date, { day: "numeric", month: "long", year: "numeric" })} aria-pressed={date === selectedDate} aria-current={date === todayKey ? "date" : undefined} onClick={() => { setSelectedDate(date); setAccountFilter(null); dayCalendarRef.current?.close(); }}>{day}</button>;
                  });
                })()}
              </div>
              <div className="day-calendar-actions">
                <button type="button" className="secondary-button" onClick={() => { setSelectedDate(todayKey); setAccountFilter(null); dayCalendarRef.current?.close(); }}>Bu gün</button>
                <button type="button" className="secondary-button" onClick={() => dayCalendarRef.current?.close()}>Bağla</button>
              </div>
            </dialog>}

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
                isSparexpert && "spare-book-layout",
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
                    <button type="button" className="day-close-button note-summary-trigger" aria-label="Qeydlər üzrə yekun" title="Qeydlər üzrə yekun" onClick={() => setNoteSummaryDate(selectedDate)}><ListChecks size={17} aria-hidden="true" /><span>Qeydlər üzrə yekun</span></button>
                    <button className="day-close-button" onClick={() => {
                      if (!can("daily.day.close")) return;
                      if (!closeRecord) {
                        setCloseOpen(true);
                        return;
                      }
                      if (!window.confirm(`${selectedDate} tarixli günü yenidən açmaq istəyirsiniz? Bağlanış qeydi silinəcək, əməliyyatlar saxlanılacaq.`)) return;
                      setState((current) => ({
                        ...current,
                        closes: current.closes.filter((record) => record.date !== closeRecord.date || record.closedAt !== closeRecord.closedAt),
                      }));
                    }} disabled={!can("daily.day.close")}><LockKeyhole size={15} />{closeRecord ? (can("daily.day.close") ? "Günü yenidən aç" : "Gün bağlanıb") : "Günü bağla"}</button>
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
                <div className="operation-head">
                  <span className="op-head-no">№</span>
                  <span className="op-head-time">Saat</span>
                  <span className="op-head-amount">Məbləğ</span>
                  <span className="op-head-kind">Əməliyyat növü</span>
                  <span className="op-head-category">Kateqoriya</span>
                  <span className="op-head-party">Qarşı tərəf</span>
                  <span className="op-head-person">Şəxs</span>
                  <span className="op-head-channel">Hesab / Kanal</span>
                  <span className="op-head-note">Açıqlama</span>
                </div>
                <div className="operation-list">{visibleEntries.length === 0 ? <div className="empty-state"><CalendarDays size={28} /><b>Bu gün əməliyyat yoxdur</b><span>Yeni mədaxil və ya məxaric əlavə edə bilərsiniz.</span></div> : visibleEntries.map((entry, index) => {
                  const displayNote = azartMobileNavigation && entry.note?.trim() === "." ? "" : entry.note;
                  const addedAt = entry.createdAt ? new Date(entry.createdAt) : null;
                  const addedOn = addedAt && Number.isFinite(addedAt.getTime()) ? dateKey(addedAt) : null;
                  const addedLater = addedOn !== null && addedOn > entry.date;
                  const operationTime = addedLater && addedAt
                    ? `${pad(addedAt.getHours())}:${pad(addedAt.getMinutes())} · ${addedOn.split("-").reverse().join(".")}`
                    : entry.time || "—";

                  const account = accountCatalog.find((item) => item.id === entry.accountId) ?? ACCOUNTS[0];
                  const personLabel = entry.kind === "transfer" && entry.targetResponsible
                    ? `${resolveEntryPerson(entry, account)} → ${normalizePersonName(entry.targetResponsible)}`
                    : resolveEntryPerson(entry, account);
                  const channelLabel = entry.kind === "transfer" && entry.targetBank
                    ? `${resolveEntryChannel(entry, account)} → ${entry.targetBank}`
                    : resolveEntryChannel(entry, account);
                  const pendingChange = pendingEntryRequestById.get(entry.id);
                  const interactive = Boolean(pendingChange && can("daily.entries.approve")) || (!closeRecord && (can("daily.entries.edit") || can("daily.entries.delete")));
                  const startsTrailingGroup = isTrailingDailyEntry(entry, activeCompanyId) &&
                    (index === 0 || !isTrailingDailyEntry(visibleEntries[index - 1], activeCompanyId));
                  return <Fragment key={entry.id}>
                    {startsTrailingGroup && <div className="operation-group-divider" role="heading" aria-level={3}>
                      {isSparexpert ? "Daxili köçürmələr" : "Təchizatçıya ödənişlər"}
                    </div>}
                    <article
                    className={cx("operation-row", entry.kind, interactive && "editable", pendingChange && "change-pending")}
                    data-daily-entry-id={entry.id}
                    role={interactive ? "button" : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    title={pendingChange ? "Əməliyyat sorğusu təsdiq gözləyir" : interactive ? "Düzəliş üçün aç" : undefined}
                    onClick={() => {
                      if (!interactive) return;
                      if (pendingChange) setEntryApprovalOpen(true);
                      else openEntryForEdit(entry);
                    }}
                    onKeyDown={(event) => {
                      if (!interactive || (event.key !== "Enter" && event.key !== " ")) return;
                      event.preventDefault();
                      if (pendingChange) setEntryApprovalOpen(true);
                      else openEntryForEdit(entry);
                    }}
                  >
                    <div className="operation-mobile-card" style={{ width: "100%" }}>
                      <div className="op-m-row-top">
                        <div className="op-m-identity">
                          <div className={cx("op-m-kind-icon", entry.kind)}>
                            {entry.kind === "income" ? <ArrowDownLeft size={16} /> : entry.kind === "expense" ? <ArrowUpRight size={16} /> : <ArrowLeftRight size={16} />}
                          </div>
                          <div className="op-m-title-wrap">
                            <b className="op-m-party">
                              {entry.counterparty?.trim() || entry.title || (entry.kind === "income" ? "Mədaxil" : entry.kind === "expense" ? "Məxaric" : "Köçürmə")}
                            </b>
                            {entry.counterparty?.trim() && entry.title && entry.title !== "Mədaxil" && entry.title !== "Məxaric" && (
                              <span className="op-m-subtitle">{entry.title}</span>
                            )}
                          </div>
                        </div>
                        <div className="op-m-amount-wrap">
                          <strong className={cx("op-m-amount", entry.kind)}>
                            {entry.kind === "income" ? "+" : entry.kind === "expense" ? "−" : ""}{formatMoney(Math.abs(entry.amount), account.currency)}
                          </strong>
                          {pendingChange ? (
                            <span className="op-m-status pending">Təsdiq gözləyir</span>
                          ) : (
                            <span className={cx("op-m-status", entry.kind)}>
                              {entry.kind === "income" ? "Mədaxil" : entry.kind === "expense" ? "Məxaric" : "Köçürmə"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="op-m-row-meta">
                        <span className="op-m-time" title={addedLater ? "Dəftərə əlavə edildiyi saat və tarix" : undefined}>{operationTime}</span>
                        {entry.category && (
                          <span className="op-m-category">{entry.category}</span>
                        )}
                        <span className="op-m-compact-kind">
                          {pendingChange ? (
                            <span className="op-m-status pending">Təsdiq gözləyir</span>
                          ) : (
                            <span className={cx("op-m-status", entry.kind)}>
                              {entry.kind === "income" ? "Mədaxil" : entry.kind === "expense" ? "Məxaric" : "Köçürmə"}
                            </span>
                          )}
                        </span>
                        <span className={cx("op-m-channel-pill", String(channelLabel || "").toLocaleLowerCase("az-AZ").includes("kassa") ? "cash" : "bank")}>
                          {personLabel} · {channelLabel}
                        </span>
                        {entry.kind === "expense" && entry.expenseMethod === "cash_out" && <small>Nağdlaşdırma</small>}
                        {entry.kind === "expense" && entry.expenseMethod === "diff_bank" && (
                          <span className="op-m-channel-pill diff-bank" title="Fərqli bank köçürməsi"><span className="op-m-bank-full">🔄 Fərqli bank köçürməsi</span><span className="op-m-compact-kind">Fərqli bank</span></span>
                        )}
                        {entry.kind === "expense" && entry.expenseMethod === "same_bank" && (
                          <span className="op-m-channel-pill same-bank" title="Eyni bank köçürməsi"><span className="op-m-bank-full">🔁 Eyni bank köçürməsi</span><span className="op-m-compact-kind">Eyni bank</span></span>
                        )}
                      </div>

                      {displayNote?.trim() && (
                        <p className={cx("op-m-note", /^[.·–—-]+$/.test(displayNote.trim()) && "op-m-note-placeholder")}>
                          <span>{displayNote}</span>
                        </p>
                      )}
                    </div>
                    <span className="operation-no">{index + 1}</span>
                    <span className="operation-time" title={addedLater ? "Dəftərə əlavə edildiyi saat və tarix" : undefined}>{operationTime}</span>
                    <strong className="operation-amount">{formatMoney(entry.amount, account.currency)}</strong>
                    <span className="operation-kind-cell">
                      <i className={`kind-badge ${entry.kind}`}>
                        {entry.kind === "income" ? <ArrowDownLeft size={13} /> : entry.kind === "expense" ? <ArrowUpRight size={13} /> : <ArrowLeftRight size={13} />}
                        {entry.kind === "income" ? "Mədaxil" : entry.kind === "expense" ? "Məxaric" : "Köçürmə"}
                      </i>
                      {entry.kind === "expense" && entry.expenseMethod === "cash_out" && <small>Nağdlaşdırma</small>}
                        {entry.kind === "expense" && entry.expenseMethod === "diff_bank" && (
                        <i className="kind-badge expense-method-tag diff-bank">Fərqli bank</i>
                      )}
                      {entry.kind === "expense" && entry.expenseMethod === "same_bank" && (
                        <i className="kind-badge expense-method-tag same-bank">Eyni bank</i>
                      )}
                    </span>
                    <span data-label="Kateqoriya" className="operation-category-cell wrap-cell" title={entry.category ? (displayNote && displayNote.trim() && displayNote !== "." && displayNote !== "—" ? `${entry.category} · ${displayNote}` : entry.category) : (displayNote || "")}>
                      {entry.category || (displayNote && displayNote.trim() && displayNote !== "." && displayNote !== "—" ? displayNote : "—")}
                      {entry.category && displayNote && displayNote.trim() && displayNote !== "." && displayNote !== "—" ? (
                        <em className="operation-inline-note"> · {displayNote}</em>
                      ) : null}
                    </span>
                    <span data-label="Kontragent" className="operation-party wrap-cell" title={entry.counterparty}>{entry.counterparty || (entry.kind === "income" ? "Mədaxil" : entry.kind === "expense" ? "Məxaric" : "Köçürmə")}</span>
                    <span data-label="Şəxs" className="operation-person-cell" title={personLabel}>{personLabel}</span>
                    <span data-label="Hesab / Kanal" className="operation-channel-cell" title={channelLabel}><i className={cx("channel-pill", channelLabel.toLocaleLowerCase("az-AZ") === "kassa" ? "cash" : "bank")}>{channelLabel}</i></span>
                    <span data-label="Şərh" className="operation-note-cell wrap-cell" title={displayNote || ""}>{displayNote || "—"}</span>
                    {interactive && <span className={cx("operation-edit-affordance", pendingChange && "pending")} aria-hidden="true">{pendingChange ? <ClipboardCheck size={13} /> : <Pencil size={13} />}</span>}
                  </article></Fragment>;
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
              {isSparexpert && (
                <div className="reconciliation-table is-sparexpert-cards">
                  <div className="reconciliation-body">
                    {visibleReconciliationRows.filter(([name]) => isAggregateAccount(name)).map(renderSparexpertReconCard)}
                    {reconSections.map((section) => (
                      <div key={section.key} className="recon-group-block">
                        <div className="recon-group-divider">
                          <div className="recon-group-divider-content">
                            <div className="recon-group-title">
                              <span className={cx("recon-group-icon", `icon-${section.key}`)}>{section.icon}</span>
                              <strong>{section.title}</strong>
                              <span className="recon-group-count">{section.rows.length} hesab</span>
                            </div>
                            <div className="recon-group-subtotal">
                              <small>Cəmi qalıq:</small>
                              <strong className={section.totals.current < 0 ? "negative" : "positive"}>
                                {formatMoney(section.totals.current, "AZN")}
                              </strong>
                            </div>
                          </div>
                        </div>
                        <div className="sp-recon-cards-list">
                          {section.rows.map(renderSparexpertReconCard)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                <div className={cx("reconciliation-table", isSparexpert && "spare-recon-desktop")}>
                  <div className="reconciliation-head">
                    <span className="recon-head-person">Şəxs / Hesab</span>
                    <span className="recon-head-current">Cari qalıq</span>
                    <span className="recon-head-previous">Əvvəldən qalıq</span>
                    <span className="recon-head-received">Vəsait qəbulu</span>
                    {isSparexpert ? <>
                      <span className="recon-head-supplier">Ödəniş</span>
                      <span className="recon-head-expense">Xərc</span>
                      <span>Köçürmə</span>
                    </> : <>
                      <span className="recon-head-expense">Xərc</span>
                      <span className="recon-head-supplier">Təchizatçıya ödəniş</span>
                    </>}
                  </div>
                  <div className="reconciliation-mobile-head" aria-hidden="true">
                    <span>Ad / Hesab</span>
                    <span>Cari qalıq</span>
                    <span>Əvvəldən</span>
                    <span>Qəbul</span>
                    <span>Xərc</span>
                    <span>Təchizatçı öd.</span>
                  </div>
                  <div className="reconciliation-body">
                    {isSparexpert ? (
                      <>
                        {visibleReconciliationRows.filter(([name]) => isAggregateAccount(name)).map(renderReconRow)}
                        {reconSections.map((section) => (
                          <div key={section.key}>
                            <h3 className="sp-recon-section-label">{section.title}</h3>
                            {section.rows.map(renderReconRow)}
                          </div>
                        ))}
                      </>
                    ) : visibleReconciliationRows.map(renderReconRow)}
                  </div>
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
            <InvoiceAttachmentView newestCreatedFirst={azartMobileNavigation}
              openCreateTrigger={invoiceCreateSignal}
              isLiveConnected={isLiveConnected}
              entries={activeEntries}
              customerDebts={customerDebts}
              pastMonthUninvoiced={pastMonthUninvoiced}
              invoices={invoices}
              knownCustomers={customerList}
              formatMoney={formatMoney}
              currentUserName={session.name}
              canManageInvoice={can("daily.invoices.manage")}
              canApproveInvoice={can("daily.invoices.approve")}
              canRestartInvoice={can("daily.invoices.restart")}
              canDeleteInvoicePermanently={can("daily.invoices.delete_permanent")}
              onConfirmInvoice={confirmInvoice}
              onApproveInvoice={approveInvoice}
              onCancelInvoice={cancelInvoice}
              onRestartInvoice={restartInvoice}
              onDeleteInvoicePermanently={deleteInvoicePermanently}
              onUpdateCustomerDebt={updateCustomerDebt}
              onToggleEntryInvoiced={toggleEntryInvoiced}
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
          {(view === "accounts" || (isSparexpert && view === "reports" && spareReportCards)) && (
            <AccountsView
              key={view}
              initialSubTab={isSparexpert && view === "accounts" ? "movements" : "cards"}
              sharedMonth={spareMonth}
              isSparexpert={isSparexpert}
              state={state}
              accounts={accountCatalog}
              balanceAt={balanceAt}
              cardLimitSettings={effectiveCardLimitSettings}
              canManageLimits={can("daily.settings.manage")}
              onSaveCardLimitSettings={setCardLimitSettings}
              customAccounts={customAccounts}
              bankDirectory={isSparexpert ? { names: customBanks, logos: bankLogos, setNames: setCustomBanks, setLogos: setBankLogos } : undefined}
              onSaveAccount={handleSaveAccount}
              onDeleteAccount={handleDeleteAccount}
              peopleList={peopleList}
              setPeopleList={setPeopleList}
              channelList={channelList}
              setChannelList={setChannelList}
              contextAccountEdit={accountContextEdit}
              onContextAccountEditHandled={() => setAccountContextEdit(null)}
            />
          )}
          {view === "reports" && (!isSparexpert || !spareReportCards) && <ReportsView state={state} accounts={accountCatalog} parties={visibleDirectory} isSparexpert={isSparexpert} sharedMonth={spareMonth} />}
          {view === "cashboxes" && (
            <AccountsView
              isSparexpert={isSparexpert}
              state={state}
              accounts={accountCatalog}
              balanceAt={balanceAt}
              cardLimitSettings={effectiveCardLimitSettings}
              canManageLimits={can("daily.settings.manage")}
              onSaveCardLimitSettings={setCardLimitSettings}
              customAccounts={customAccounts}
              bankDirectory={isSparexpert ? { names: customBanks, logos: bankLogos, setNames: setCustomBanks, setLogos: setBankLogos } : undefined}
              onSaveAccount={handleSaveAccount}
              onDeleteAccount={handleDeleteAccount}
              peopleList={peopleList}
              setPeopleList={setPeopleList}
              channelList={channelList}
              setChannelList={setChannelList}
              initialSubTab="management"
              contextAccountEdit={accountContextEdit}
              onContextAccountEditHandled={() => setAccountContextEdit(null)}
            />
          )}
          {view === "categories" && can("daily.directories.manage") && <DirectoryView items={categoryList} setItems={setCategoryList} onAdd={isSparexpert ? async (category, action, previous) => {
            const response = await fetch("/api/daily/categories", {
              method: "POST", credentials: "include", headers: { "content-type": "application/json" },
              body: JSON.stringify({ category, action, previous }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Kateqoriya saxlanmadı.");
            applyRemoteSnapshot(payload);
          } : undefined} eyebrow="KATEQORİYALAR" title="Əməliyyat kateqoriyaları" description="Mədaxil və məxaric qeydlərində istifadə olunan kateqoriyalar." />}
          {view === "people" && can("daily.directories.manage") && <DirectoryView items={peopleList} setItems={setPeopleList} eyebrow="ŞƏXSLƏR" title="Hesab sahibləri və məsul şəxslər" description="Hesab və ya bank adına görə təkrarlanmayan vahid şəxs siyahısı. Hər bir şəxs həm Kassa, həm də müxtəlif bank hesabları ilə əməliyyat apara bilər." />}
          {view === "customers" && (<>
            {isSparexpert && !selectedCrmCustomer && <nav className="spare-directory-tabs" aria-label="Əlaqə bölmələri">
              {spareDirectoryRoles.map(({ key, label }) => <button key={key} type="button" aria-pressed={directoryRole === key} onClick={() => { setDirectoryRole(key); setSelectedCrmCustomer(null); }}>{label}</button>)}
            </nav>}
            <CustomersCrmView
              key={isSparexpert ? directoryRole : "customers"}
              directoryLabel={isSparexpert ? directorySection.label : undefined}
              directorySingle={isSparexpert ? directorySection.single : undefined}
              hasQaime={hasQaime}
              includeCustomer={isSparexpert ? (name) => !removedSpareParties.includes(partyDirectoryKey(name)) && (directoryRole === "customer" ? isSparexpertCustomer(name) : sparexpertPartyType(name) === directoryRole) : undefined}
              entries={activeEntries}
              customerDebts={customerDebts}
              pastMonthUninvoiced={pastMonthUninvoiced}
              invoices={invoices}
              knownCustomers={visibleDirectory}
              selectedCustomerName={selectedCrmCustomer}
              onSelectCustomerName={setSelectedCrmCustomer}
              formatMoney={formatMoney}
              currentUserName={session.name}
              canManageInvoice={can("daily.invoices.manage")}
              canApproveInvoice={can("daily.invoices.approve")}
              canEditEntries={can("daily.entries.edit")}
              canManageDirectories={canManageCustomerDirectory}
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
              onAddCustomer={isSparexpert ? (name, debt) => addNewCustomer(directoryName(name), debt) : addNewCustomer}
              onRenameCustomer={isSparexpert ? (oldName, newName) => renameCustomer(oldName, directoryName(newName)) : renameCustomer}
              onDeleteCustomer={deleteCustomer}
            />
          </>)}
          {view === "settings" && can("daily.settings.manage") && <SettingsView
            theme={theme}
            setTheme={setTheme}
            rules={rules}
            isSparexpert={isSparexpert}
            saveApprovalRule={async (key, enabled) => {
              const response = await fetch("/api/daily/entry-approval-settings", {
                method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
                body: JSON.stringify({ key, enabled }),
              });
              const payload = await response.json();
              if (!response.ok) throw new Error(payload.error || "Seçim saxlanmadı.");
              applyRemoteSnapshot(payload);
            }}
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
              localStorage.removeItem("arix-daily-past-month-v2");
              localStorage.removeItem("arix-daily-invoices-v1");
              window.location.reload();
            }}
          />}
          {view === "management" && canManageSystem && <DailyManagementView session={session} showPermissionActions />}
        </main>
      </div>

      {entryOpen && <EntryDialog editNeedsApproval={!isSparexpert || rules.requireEntryEditApproval !== false} deleteNeedsApproval={!isSparexpert || rules.requireEntryDeleteApproval !== false} requireEditReason={Boolean(editingEntry) && can("daily.entries.edit")} mode={editingEntry ? "edit" : "create"} entryDate={editingEntry?.date || selectedDate} isBackdated={!editingEntry && selectedDate < todayKey && (!isSparexpert || rules.requireBackdatedApproval !== false)} canEdit={can("daily.entries.edit")} canDelete={Boolean(editingEntry && can("daily.entries.delete"))} kind={kind} setKind={setKind} draft={draft} setDraft={setDraft} people={peopleList} channels={channelList} categories={categoryList} customers={entryCounterpartyOptions} busy={entryDialogBusy} error={entryDialogError} onDelete={() => void requestEntryDeletion()} onClose={() => { if (entryDialogBusy) return; spareEntryAttempt.current = null; setEntryOpen(false); setEditingEntry(null); setEntryDialogError(""); }} onSubmit={saveEntry} accounts={accountCatalog.filter((account) => !account.archived)} bankNames={customBanks} isSparexpert={isSparexpert} />}
      {entryApprovalOpen && <EntryApprovalCenter requests={entryChangeRequests} canApprove={can("daily.entries.approve")} busy={entryApprovalBusy} onRefresh={() => void loadEntryChangeRequests()} onResolve={resolveEntryChangeRequest} onClose={() => setEntryApprovalOpen(false)} />}
      {noteSummaryDate === selectedDate && <NoteSummary
        localOnly={isSparexpert && session.id === "daily-local-dev"}
        storageKey={`arix-daily-note-merges:${activeCompanyId}:${session.id}:${selectedDate}`}
        date={selectedDate}
        entries={dayEntries}
        currencyFor={(entry) => (accountCatalog.find((account) => account.id === entry.accountId) ?? ACCOUNTS[0]).currency}
        formatMoney={formatMoney}
        onClose={() => setNoteSummaryDate(null)}
      />}
      {closeOpen && !closeRecord && (
        <CloseDialog
          date={selectedDate}
          accounts={accountCatalog}
          reconciliationRows={detailReconciliationRows}
          onClose={() => setCloseOpen(false)}
          onSave={(actuals, note) => {
            setState((current) => ({
              ...current,
              closes: [
                ...current.closes.filter((item) => item.date !== selectedDate),
                {
                  date: selectedDate, actuals, note, closedAt: new Date().toISOString(),
                  ...((azartMobileNavigation || isSparexpert) ? { notificationTotals: {
                    income: reconciliationTotals.received,
                    expense: reconciliationTotals.expense + (isSparexpert ? reconciliationTotals.supplier : 0),
                    supplier: reconciliationTotals.supplier,
                    ending: daySummary.expected,
                  } } : {}),
                },
              ],
            }));
            setCloseOpen(false);
          }}
        />
      )}

      {statementAccountName && (
        <AccountStatementModal
          accountName={statementAccountName}
          selectedDate={selectedDate}
          reconciliationRows={reconciliationRows}
          dayEntries={dayEntries}
          accountCatalog={accountCatalog}
          formatMoney={formatMoney}
          onClose={() => setStatementAccountName(null)}
          onOpenEntryForAccount={openEntryForAccount}
          onSelectEntry={(entry) => {
            setStatementAccountName(null);
            openEntryForEdit(entry);
          }}
          canEditEntry={can("daily.entries.edit")}
          isAutoSupplierCollector={isAutoSupplierCollector}
          isSparexpert={isSparexpert}
        />
      )}

      {dailyContextMenu && <DailyContextMenu
        target={dailyContextMenu.target}
        position={{ x: dailyContextMenu.x, y: dailyContextMenu.y }}
        canEditEntry={can("daily.entries.edit") || can("daily.entries.delete")}
        onClose={() => setDailyContextMenu(null)}
        onEditEntry={(entry) => { setDailyContextMenu(null); openEntryForEdit(entry); }}
        onOpenAccount={(account) => { setDailyContextMenu(null); setStatementAccountName(account.id || account.name); }}
        onEditAccount={editContextAccount}
        onCreateEntry={(kind) => { setDailyContextMenu(null); openEntry(kind); }}
        onRefresh={() => window.location.reload()}
      />}

      {showInAppNotifications && notificationToast && createPortal(
        <aside className={`desktop-notification-toast ${theme === "dark" ? "is-dark" : ""}`} aria-live="polite">
          <div
            className="desktop-notification-toast-card"
            role="button"
            tabIndex={0}
            onClick={() => {
              const target = notificationToast;
              setNotificationToast(null);
              void markNotificationRead(target);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              const target = notificationToast;
              setNotificationToast(null);
              void markNotificationRead(target);
            }}
          >
            <span className="desktop-notification-toast-icon"><Bell aria-hidden="true" size={20} /></span>
            <span className="desktop-notification-toast-copy">
              <b>{notificationToast.title}</b>
              <span>{notificationToast.message}</span>
              <small>İndi • Açmaq üçün klikləyin</small>
            </span>
            <button
              type="button"
              className="desktop-notification-toast-close"
              aria-label="Bildirişi bağla"
              onClick={(event) => {
                event.stopPropagation();
                setNotificationToast(null);
              }}
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        </aside>,
        document.body,
      )}
    </div>
  );
}

function DailyContextMenu({
  target,
  position,
  canEditEntry,
  onClose,
  onEditEntry,
  onOpenAccount,
  onEditAccount,
  onCreateEntry,
  onRefresh,
}: {
  target: DailyContextTarget;
  position: { x: number; y: number };
  canEditEntry: boolean;
  onClose: () => void;
  onEditEntry: (entry: Entry) => void;
  onOpenAccount: (account: Account) => void;
  onEditAccount: (account: Account) => void;
  onCreateEntry: (kind: EntryKind) => void;
  onRefresh: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const closeOnOutside = (event: Event) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const closeOnKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", closeOnOutside, true);
    window.addEventListener("keydown", closeOnKey);
    window.addEventListener("scroll", onClose, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", closeOnOutside, true);
      window.removeEventListener("keydown", closeOnKey);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const copyText = async () => {
    const text = target.type === "entry"
      ? `${target.entry.date} ${target.entry.time || ""} · ${target.entry.title || target.entry.kind} · ${Math.abs(target.entry.amount).toLocaleString("az-AZ")} ₼${target.entry.counterparty ? ` · ${target.entry.counterparty}` : ""}`
      : target.type === "account"
        ? `${getCleanAccountTitle(target.account)} · ${target.account.channel || "Kassa"}`
        : "AriX Daily";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(onClose, 450);
    } catch { onClose(); }
  };

  const menuWidth = 272;
  const left = Math.max(10, Math.min(position.x, window.innerWidth - menuWidth - 10));
  const top = Math.max(10, Math.min(position.y, window.innerHeight - 320));
  const entryTitle = target.type === "entry"
    ? target.entry.counterparty?.trim() || target.entry.title || (target.entry.kind === "income" ? "Mədaxil" : target.entry.kind === "expense" ? "Məxaric" : "Köçürmə")
    : target.type === "account" ? getCleanAccountTitle(target.account) : "AriX Daily";
  const entryMeta = target.type === "entry"
    ? `${target.entry.date} · ${formatMoney(target.entry.amount, "AZN")}`
    : target.type === "account" ? `${target.account.channel || "Kassa"} · ${target.account.type === "card" ? "Kart" : target.account.type === "bank" ? "Bank" : "Kassa"}` : "Sürətli əməliyyatlar";

  return createPortal(
    <div className="daily-context-menu-backdrop" role="presentation" onContextMenu={(event) => { event.preventDefault(); onClose(); }}>
      <div ref={menuRef} className="daily-context-menu" style={{ left, top }} role="menu" aria-label="Sürətli əməliyyat menyusu">
        <header>
          <span>{target.type === "entry" ? <FileText size={14} /> : target.type === "account" ? <WalletCards size={14} /> : <AriXLogo />}</span>
          <div><b>{entryTitle}</b><small>{entryMeta}</small></div>
        </header>
        {target.type === "entry" && <>
          {canEditEntry && <button type="button" onClick={() => onEditEntry(target.entry)}><Pencil size={16} /><span><b>Əməliyyatı düzəlt</b><small>Məbləğ, kateqoriya və qeydi aç</small></span></button>}
          <button type="button" onClick={copyText}><Copy size={16} /><span><b>{copied ? "Kopyalandı" : "Məlumatı kopyala"}</b><small>Tarix, məbləğ və qarşı tərəf</small></span></button>
        </>}
        {target.type === "account" && <>
          <button type="button" className="is-primary" onClick={() => onOpenAccount(target.account)}><Eye size={16} /><span><b>Hesab hərəkətlərini aç</b><small>Günün dökümü və qalıq</small></span></button>
          <button type="button" onClick={() => onEditAccount(target.account)}><Pencil size={16} /><span><b>Hesabı düzəlt</b><small>Ad, bank, balans və aktivlik</small></span></button>
          <button type="button" onClick={copyText}><Copy size={16} /><span><b>{copied ? "Kopyalandı" : "Hesabı kopyala"}</b><small>Hesab adı və kanalı</small></span></button>
        </>}
      </div>
    </div>,
    document.body,
  );
}

function DirectoryView({ items, setItems, onAdd, eyebrow, title, description }: { items: string[]; setItems: React.Dispatch<React.SetStateAction<string[]>>; onAdd?: (value: string, action?: "add" | "rename" | "delete", previous?: string) => Promise<void>; eyebrow: string; title: string; description: string }) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const visible = items.filter((item) => item.toLocaleLowerCase("az-AZ").includes(query.trim().toLocaleLowerCase("az-AZ")));
  const [editingCategory, setEditingCategory] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addMessage, setAddMessage] = useState("");
  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (adding || !value || items.some((item) => item !== editingCategory && item.toLocaleLowerCase("az-AZ") === value.toLocaleLowerCase("az-AZ"))) return;
    setAdding(true);
    setAddMessage("");
    try {
      if (onAdd) {
        await onAdd(value, editingCategory ? "rename" : "add", editingCategory);
        setEditingCategory("");
        setAddOpen(false);
        setAddMessage("Saxlanıldı.");
      } else setItems((current) => [...current, value]);
      setDraft("");
    } catch (error) {
      setAddMessage(error instanceof Error ? error.message : "Kateqoriya saxlanmadı.");
    } finally {
      setAdding(false);
    }
  };
  const deleteCategory = async (item: string) => {
    if (!onAdd || adding || !window.confirm(`«${item}» kateqoriyasını seçim siyahısından silmək istəyirsiniz?`)) return;
    setAdding(true);
    try {
      await onAdd("", "delete", item);
      setAddMessage("Silindi.");
    } catch (error) {
      setAddMessage(error instanceof Error ? error.message : "Kateqoriya silinmədi.");
    } finally {
      setAdding(false);
    }
  };
  return <><section className="page-heading directory-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><em>{items.length} qeyd</em></section><section className="directory-panel"><div className="directory-toolbar"><label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Siyahıda axtar" /></label>{onAdd && <button type="button" className="primary-button" aria-expanded={addOpen} onClick={() => { setEditingCategory(""); setDraft(""); setAddOpen(true); setAddMessage(""); }}><Plus size={16} />Kateqoriya əlavə et</button>}{(!onAdd || addOpen) && <form onSubmit={addItem}><input autoFocus={Boolean(onAdd)} aria-label="Kateqoriyanın adı" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Yeni ad daxil edin" /><button className="primary-button" type="submit" disabled={adding || !draft.trim()}>{onAdd ? (adding ? "Saxlanılır…" : "Saxla") : "Əlavə et"}</button>{onAdd && <button type="button" className="secondary-button" disabled={adding} onClick={() => { setAddOpen(false); setDraft(""); setAddMessage(""); }}>Ləğv et</button>}</form>}<span role="status">{addMessage}</span></div><div className="directory-list">{visible.map((item, index) => <article key={`${item}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><b>{item}</b>{onAdd ? (!legacyInvestorCategory(item) && <div><button type="button" disabled={adding} onClick={() => { setEditingCategory(item); setDraft(item); setAddOpen(true); setAddMessage(""); }}>Düzəliş et</button><button type="button" disabled={adding} onClick={() => void deleteCategory(item)}>Sil</button></div>) : <button onClick={() => setItems((current) => current.filter((value) => value !== item))} aria-label={`${item} sil`}><Trash2 size={16} /></button>}</article>)}</div></section></>;
}

function SettingsView({
  saveApprovalRule,
  isSparexpert,
  theme,
  setTheme,
  rules,
  setRules,
  peopleList,
  onResetRules,
  onReset,
}: {
  saveApprovalRule: (key: string, enabled: boolean) => Promise<void>;
  isSparexpert: boolean;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  rules: CalculationRules;
  setRules: React.Dispatch<React.SetStateAction<CalculationRules>>;
  peopleList: string[];
  onResetRules: () => void;
  onReset: () => void;
}) {
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState("");
  const saveApproval = async (key: string, enabled: boolean) => {
    setApprovalSaving(true);
    setApprovalMessage("Saxlanılır…");
    try {
      await saveApprovalRule(key, enabled);
      setApprovalMessage("Saxlanıldı.");
    } catch (error) {
      setApprovalMessage(error instanceof Error ? error.message : "Seçim saxlanmadı.");
    } finally {
      setApprovalSaving(false);
    }
  };
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
          {isSparexpert && <fieldset disabled={approvalSaving}>
            <legend>Əməliyyat təsdiqləri</legend>
            {([
              ["requireBackdatedApproval", "Keçmiş tarixə yeni əməliyyat"],
              ["requireEntryEditApproval", "Mövcud əməliyyata düzəliş"],
              ["requireEntryDeleteApproval", "Əməliyyatı silmə"],
            ] as const).map(([key, label]) => <label key={key} style={{ display: "block" }}>
              <input type="checkbox" checked={rules[key] !== false}
                onChange={(event) => void saveApproval(key, event.target.checked)} /> {label}
            </label>)}
            <p role="status">{approvalMessage}</p>
          </fieldset>}
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

const CARD_BANKS = [
  "Kapital Bank",
  "Unibank",
  "Leobank",
  "M10",
  "ABB",
  "Rabitə Bank",
  "Ziraat Bank",
] as const;

function EntryDialog({ editNeedsApproval = true, deleteNeedsApproval = true, requireEditReason, mode, entryDate, isBackdated, canEdit, canDelete, kind, setKind, draft, setDraft, people, channels, categories, customers, busy, error, onDelete, onClose, onSubmit, accounts = [], bankNames = [], isSparexpert = false }: {
  editNeedsApproval?: boolean;
  deleteNeedsApproval?: boolean;
  mode: "create" | "edit";
  entryDate: string;
  isBackdated: boolean;
  requireEditReason: boolean;
  canEdit: boolean;
  canDelete: boolean;
  kind: EntryKind;
  setKind: (value: EntryKind) => void;
  draft: EntryDraft;
  setDraft: React.Dispatch<React.SetStateAction<EntryDraft>>;
  people: string[];
  channels: string[];
  categories: string[];
  customers: string[];
  busy: boolean;
  error: string;
  onDelete: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  bankNames?: string[];
  accounts?: Account[];
  isSparexpert?: boolean;
}) {
  const [counterpartyMenuOpen, setCounterpartyMenuOpen] = useState(false);
  useEffect(() => {
    if (!counterpartyMenuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".counterparty-combobox")) {
        setCounterpartyMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [counterpartyMenuOpen]);
  const selectablePeople = people.filter((person) => person !== "Ümumi");
  const personOptions = isSparexpert ? selectablePeople.filter((person) => !isRetiredSparePerson(person))
    : selectablePeople.length ? selectablePeople : DEFAULT_PEOPLE;
  const channelOptions = channels.length ? channels : DEFAULT_CHANNELS;

  const sparexpertAccountOptions = useMemo(() => {
    if (!isSparexpert) return [];
    return accounts
      .filter((acc) => !isAggregateAccount(acc.name) && personOptions.some((person) =>
        person.trim().toLocaleLowerCase("az-AZ") === acc.person?.trim().toLocaleLowerCase("az-AZ")))
      .map((acc) => {
        const info = getAccountDisplayInfo(acc.name, true, accounts);
        const cat: "cash" | "bank" | "card" =
          acc.type === "card" ? "card" : acc.type === "cash" ? "cash" : "bank";

        let bankName = "";
        let cleanLabel = info.cleanName;

        if (cat === "bank") {
          const chLower = (acc.channel || "").toLowerCase();
          const idLower = (acc.id || "").toLowerCase();
          if (chLower.includes("rabitə") || idLower.includes("rb") || idLower.includes("rabit")) {
            bankName = "Rabitə Bank";
          } else if (chLower.includes("ziraat") || idLower.includes("ziraat")) {
            bankName = "Ziraat Bank";
          } else {
            bankName = [...STANDARD_BANKS, ...bankNames].find((bank) =>
              bankDirectoryKey(bank) === bankDirectoryKey(acc.channel || "")) || "Kapital Bank";
          }

          if (acc.id === "H.Spare") {
            cleanLabel = "Spare (Əsas)";
          } else if (acc.id === "H.ƏDV") {
            cleanLabel = "Spare (ƏDV)";
          } else if (acc.id === "H.Simran") {
            cleanLabel = "Simran (Əsas)";
          } else if (acc.id === "H.SimƏDV") {
            cleanLabel = "Simran (ƏDV)";
          } else if (acc.id === "H.Ceyhun") {
            cleanLabel = "Ceyhun";
          } else if (acc.id === "H.SpareRB") {
            cleanLabel = "Spare";
          } else if (acc.id === "H.SimZiraat") {
            cleanLabel = "Simran";
          } else {
            cleanLabel = info.cleanName.replace(/^H\./, "").replace(/\s*·\s*.*$/, "").trim() || acc.name;
          }
        } else if (cat === "cash") {
          bankName = "Kassa";
          cleanLabel = acc.person || info.cleanName.replace(/^N\./, "").trim();
        } else {
          cleanLabel = acc.person || info.cleanName.replace(/^(K\.|BK\.|Kart\s*)/, "").trim();
        }

        return {
          id: acc.id,
          name: acc.name,
          label: `${info.cleanName} · ${info.badgeText}`,
          cleanLabel,
          person: acc.person || info.cleanName,
          channel: acc.channel || info.badgeText,
          category: cat,
          bankName,
        };
      });
  }, [isSparexpert, accounts, people, bankNames]);

  const officialBanksList = useMemo(() => {
    const list: string[] = ["Kapital Bank", "Rabitə Bank", "Ziraat Bank"];
    sparexpertAccountOptions
      .filter((a) => a.category === "bank" && a.bankName)
      .forEach((a) => {
        if (!list.includes(a.bankName)) list.push(a.bankName);
      });
    return list;
  }, [sparexpertAccountOptions]);

  const cardBanksList = [...new Map([...STANDARD_BANKS, ...bankNames].map((bank) => [bankDirectoryKey(bank), bank])).values()];

  const cashAccounts = useMemo(() => sparexpertAccountOptions.filter((a) => a.category === "cash"), [sparexpertAccountOptions]);
  const bankAccounts = useMemo(() => sparexpertAccountOptions.filter((a) => a.category === "bank"), [sparexpertAccountOptions]);
  const cardAccounts = useMemo(() => sparexpertAccountOptions.filter((a) => a.category === "card"), [sparexpertAccountOptions]);

  const [sourceCardBank, setSourceCardBank] = useState<string>(() => {
    if (draft.cardBank) {
      const bank = cardBanksList.find((b) => bankDirectoryKey(b) === bankDirectoryKey(draft.cardBank!));
      if (bank) return bank;
    }
    if (draft.channel && CARD_BANKS.some((b) => b.toLowerCase() === draft.channel.toLowerCase())) {
      return draft.channel;
    }
    return "Kapital Bank";
  });

  const [targetCardBank, setTargetCardBank] = useState<string>(() => {
    if (draft.targetCardBank) {
      const bank = cardBanksList.find((b) => bankDirectoryKey(b) === bankDirectoryKey(draft.targetCardBank!));
      if (bank) return bank;
    }
    if (draft.targetChannel && CARD_BANKS.some((b) => b.toLowerCase() === draft.targetChannel.toLowerCase())) {
      return draft.targetChannel;
    }
    return "Kapital Bank";
  });

  const [sourceOfficialBank, setSourceOfficialBank] = useState<string>(() => {
    if (draft.accountId) {
      const match = sparexpertAccountOptions.find((o) => o.id === draft.accountId);
      if (match?.bankName) return match.bankName;
    }
    if (draft.channel) {
      const ch = draft.channel.toLowerCase();
      if (ch.includes("rabitə")) return "Rabitə Bank";
      if (ch.includes("ziraat")) return "Ziraat Bank";
      if (ch.includes("kapital")) return "Kapital Bank";
    }
    return "Kapital Bank";
  });

  const [targetOfficialBank, setTargetOfficialBank] = useState<string>(() => {
    if (draft.targetAccountId) {
      const match = sparexpertAccountOptions.find((o) => o.id === draft.targetAccountId);
      if (match?.bankName) return match.bankName;
    }
    if (draft.targetChannel) {
      const ch = draft.targetChannel.toLowerCase();
      if (ch.includes("rabitə")) return "Rabitə Bank";
      if (ch.includes("ziraat")) return "Ziraat Bank";
      if (ch.includes("kapital")) return "Kapital Bank";
    }
    return "Kapital Bank";
  });

  const sourceOfficialBankAccounts = useMemo(() => {
    return sparexpertAccountOptions.filter(
      (a) => a.category === "bank" && a.bankName === sourceOfficialBank
    );
  }, [sparexpertAccountOptions, sourceOfficialBank]);

  const targetOfficialBankAccounts = useMemo(() => {
    return sparexpertAccountOptions.filter(
      (a) => a.category === "bank" && a.bankName === targetOfficialBank
    );
  }, [sparexpertAccountOptions, targetOfficialBank]);

  const selectedSourceAccId = useMemo(() => {
    if (!isSparexpert || sparexpertAccountOptions.length === 0) return "";
    if (draft.accountId) {
      const directAcc = sparexpertAccountOptions.find((opt) => opt.id === draft.accountId);
      if (directAcc) return directAcc.id;
    }
    const pNorm = normalizePersonName(draft.person).toLocaleLowerCase("az-AZ");
    const chNorm = (draft.channel || "").trim().toLocaleLowerCase("az-AZ");

    if (CARD_BANKS.some((b) => b.toLowerCase() === chNorm)) {
      const cardPerson = sparexpertAccountOptions.find(
        (opt) => opt.category === "card" && opt.person.toLocaleLowerCase("az-AZ") === pNorm
      );
      if (cardPerson) return cardPerson.id;
    }

    const direct = sparexpertAccountOptions.find(
      (opt) => opt.id.toLocaleLowerCase("az-AZ") === chNorm || opt.id.toLocaleLowerCase("az-AZ") === pNorm
    );
    if (direct) return direct.id;

    const exact = sparexpertAccountOptions.find(
      (opt) =>
        opt.person.toLocaleLowerCase("az-AZ") === pNorm &&
        opt.channel.toLocaleLowerCase("az-AZ") === chNorm
    );
    if (exact) return exact.id;

    const match = sparexpertAccountOptions.find(
      (opt) =>
        opt.person.toLocaleLowerCase("az-AZ") === pNorm &&
        ((chNorm.includes("kapital") && opt.channel.toLocaleLowerCase("az-AZ").includes("kapital") && (chNorm.includes("ədv") ? opt.channel.toLocaleLowerCase("az-AZ").includes("ədv") : !opt.channel.toLocaleLowerCase("az-AZ").includes("ədv"))) ||
         (chNorm.includes("rabitə") && opt.channel.toLocaleLowerCase("az-AZ").includes("rabitə")) ||
         (chNorm.includes("ziraat") && opt.channel.toLocaleLowerCase("az-AZ").includes("ziraat")) ||
         (chNorm.includes("biznes") && opt.channel.toLocaleLowerCase("az-AZ").includes("biznes")) ||
         (chNorm === "kart" && opt.channel.toLocaleLowerCase("az-AZ") === "kart") ||
         (chNorm.includes("kassa") && opt.channel.toLocaleLowerCase("az-AZ").includes("kassa")))
    );
    return match?.id || sparexpertAccountOptions[0].id;
  }, [isSparexpert, draft.accountId, draft.person, draft.channel, sparexpertAccountOptions]);

  const selectedTargetAccId = useMemo(() => {
    if (!isSparexpert || sparexpertAccountOptions.length === 0) return "";
    if (draft.targetAccountId) {
      const directAcc = sparexpertAccountOptions.find((opt) => opt.id === draft.targetAccountId);
      if (directAcc) return directAcc.id;
    }
    const pNorm = normalizePersonName(draft.targetPerson).toLocaleLowerCase("az-AZ");
    const chNorm = (draft.targetChannel || "").trim().toLocaleLowerCase("az-AZ");

    if (CARD_BANKS.some((b) => b.toLowerCase() === chNorm)) {
      const cardPerson = sparexpertAccountOptions.find(
        (opt) => opt.category === "card" && opt.person.toLocaleLowerCase("az-AZ") === pNorm
      );
      if (cardPerson) return cardPerson.id;
    }

    const direct = sparexpertAccountOptions.find(
      (opt) => opt.id.toLocaleLowerCase("az-AZ") === chNorm || opt.id.toLocaleLowerCase("az-AZ") === pNorm
    );
    if (direct) return direct.id;

    const exact = sparexpertAccountOptions.find(
      (opt) =>
        opt.person.toLocaleLowerCase("az-AZ") === pNorm &&
        opt.channel.toLocaleLowerCase("az-AZ") === chNorm
    );
    if (exact) return exact.id;

    const match = sparexpertAccountOptions.find(
      (opt) =>
        opt.person.toLocaleLowerCase("az-AZ") === pNorm &&
        ((chNorm.includes("kapital") && opt.channel.toLocaleLowerCase("az-AZ").includes("kapital")) ||
         (chNorm.includes("biznes") && opt.channel.toLocaleLowerCase("az-AZ").includes("biznes")) ||
         (chNorm === "kart" && opt.channel.toLocaleLowerCase("az-AZ") === "kart") ||
         (chNorm.includes("kassa") && opt.channel.toLocaleLowerCase("az-AZ").includes("kassa")))
    );
    return match?.id || (sparexpertAccountOptions[1]?.id ?? sparexpertAccountOptions[0].id);
  }, [isSparexpert, draft.targetAccountId, draft.targetPerson, draft.targetChannel, sparexpertAccountOptions]);

  const sourceCategory = useMemo<"cash" | "bank" | "card">(() => {
    if (["missing-card-account", "choose-card-account"].includes(draft.accountId || "")) return "card";
    const opt = sparexpertAccountOptions.find((o) => o.id === selectedSourceAccId);
    return opt?.category || "cash";
  }, [selectedSourceAccId, sparexpertAccountOptions, draft.accountId]);

  const targetCategory = useMemo<"cash" | "bank" | "card">(() => {
    if (["missing-card-account", "choose-card-account"].includes(draft.targetAccountId || "")) return "card";
    const opt = sparexpertAccountOptions.find((o) => o.id === selectedTargetAccId);
    return opt?.category || "bank";
  }, [selectedTargetAccId, sparexpertAccountOptions, draft.targetAccountId]);

  const handleSelectSourceCategory = (cat: "cash" | "bank" | "card") => {
    if (sourceCategory === cat) return;
    if (cat === "bank") {
      const match = sparexpertAccountOptions.find((o) => o.category === "bank" && o.bankName === sourceOfficialBank)
        || sparexpertAccountOptions.find((o) => o.category === "bank");
      if (match) {
        if (match.bankName) setSourceOfficialBank(match.bankName);
        onSelectSparexpertAccount(match.id);
        return;
      }
    }
    const firstOfCat = sparexpertAccountOptions.find((o) => o.category === cat);
    if (firstOfCat) {
      if (cat === "card") selectCard("source", firstOfCat.person, sourceCardBank);
      else onSelectSparexpertAccount(firstOfCat.id);
    }
  };

  const handleSelectTargetCategory = (cat: "cash" | "bank" | "card") => {
    if (targetCategory === cat) return;
    if (cat === "bank") {
      const match = sparexpertAccountOptions.find((o) => o.category === "bank" && o.bankName === targetOfficialBank)
        || sparexpertAccountOptions.find((o) => o.category === "bank");
      if (match) {
        if (match.bankName) setTargetOfficialBank(match.bankName);
        onSelectSparexpertTargetAccount(match.id);
        return;
      }
    }
    const firstOfCat = sparexpertAccountOptions.find((o) => o.category === cat);
    if (firstOfCat) {
      if (cat === "card") selectCard("target", firstOfCat.person, targetCardBank);
      else onSelectSparexpertTargetAccount(firstOfCat.id);
    }
  };

  const handleSelectSourceOfficialBank = (bank: string) => {
    setSourceOfficialBank(bank);
    const firstAcc = sparexpertAccountOptions.find((o) => o.category === "bank" && o.bankName === bank);
    if (firstAcc) {
      onSelectSparexpertAccount(firstAcc.id);
    }
  };

  const handleSelectTargetOfficialBank = (bank: string) => {
    setTargetOfficialBank(bank);
    const firstAcc = sparexpertAccountOptions.find((o) => o.category === "bank" && o.bankName === bank);
    if (firstAcc) {
      onSelectSparexpertTargetAccount(firstAcc.id);
    }
  };

  useEffect(() => {
    const current = sparexpertAccountOptions.find((o) => o.id === selectedSourceAccId);
    if (current && current.category === "bank" && current.bankName && current.bankName !== sourceOfficialBank) {
      setSourceOfficialBank(current.bankName);
    }
  }, [selectedSourceAccId, sparexpertAccountOptions, sourceOfficialBank]);

  useEffect(() => {
    const current = sparexpertAccountOptions.find((o) => o.id === selectedTargetAccId);
    if (current && current.category === "bank" && current.bankName && current.bankName !== targetOfficialBank) {
      setTargetOfficialBank(current.bankName);
    }
  }, [selectedTargetAccId, sparexpertAccountOptions, targetOfficialBank]);

  const sourceCategoryOptions = useMemo(() => {
    return sparexpertAccountOptions.filter((o) => o.category === sourceCategory);
  }, [sparexpertAccountOptions, sourceCategory]);

  const targetCategoryOptions = useMemo(() => {
    return sparexpertAccountOptions.filter((o) => o.category === targetCategory);
  }, [sparexpertAccountOptions, targetCategory]);

  const onSelectSparexpertAccount = (accId: string, overrideBank?: string) => {
    const chosen = sparexpertAccountOptions.find((o) => o.id === accId);
    if (chosen) {
      const isCard = chosen.category === "card";
      const bankToUse = isCard
        ? (overrideBank || sourceCardBank || "Kapital Bank")
        : chosen.channel;
      setDraft((cur) => ({
        ...cur,
        person: chosen.person,
        channel: bankToUse,
        accountId: chosen.id,
        cardBank: isCard ? bankToUse : undefined,
        expenseMethod: chosen.category === "cash" ? "online" : cur.expenseMethod,
      }));
    }
  };

  const onSelectSparexpertTargetAccount = (accId: string, overrideBank?: string) => {
    const chosen = sparexpertAccountOptions.find((o) => o.id === accId);
    if (chosen) {
      const isCard = chosen.category === "card";
      const bankToUse = isCard
        ? (overrideBank || targetCardBank || "Kapital Bank")
        : chosen.channel;
      setDraft((cur) => ({
        ...cur,
        targetPerson: chosen.person,
        targetChannel: bankToUse,
        targetAccountId: chosen.id,
        targetCardBank: isCard ? bankToUse : undefined,
      }));
    }
  };

  const cardPeople = [...new Set(cardAccounts.map((account) => account.person))];
  const cardsForBank = (person: string, bank: string) =>
    cardAccounts.filter((account) => account.person === person &&
      (bankDirectoryKey(account.channel) === bankDirectoryKey(bank) ||
        (bankDirectoryKey(bank) === "kapital" && /^(kart|biznes kart)$/i.test(account.channel))));
  const selectCard = (side: "source" | "target", person: string, bank: string, chosenId?: string) => {
    const choices = cardsForBank(person, bank);
    const account = chosenId ? choices.find((item) => item.id === chosenId) : choices.length === 1 ? choices[0] : undefined;
    const accountId = account?.id || (choices.length > 1 ? "choose-card-account" : "missing-card-account");
    if (side === "source") {
      setSourceCardBank(bank);
      setDraft((cur) => ({ ...cur, person, channel: bank, cardBank: bank, accountId }));
    } else {
      setTargetCardBank(bank);
      setDraft((cur) => ({ ...cur, targetPerson: person, targetChannel: bank, targetCardBank: bank, targetAccountId: accountId }));
    }
  };
  const handleSelectSourceCardBank = (bank: string) => selectCard("source", draft.person, bank);
  const handleSelectTargetCardBank = (bank: string) => selectCard("target", draft.targetPerson, bank);
  const renderCardChoice = (side: "source" | "target") => {
    const person = side === "source" ? draft.person : draft.targetPerson;
    const bank = side === "source" ? sourceCardBank : targetCardBank;
    const id = side === "source" ? draft.accountId : draft.targetAccountId;
    const choices = cardsForBank(person, bank);
    if (choices.length < 2) return null;
    return <label className="full"><span>Kartı seçin</span>
      <select value={choices.some((card) => card.id === id) ? id : ""} onChange={(event) => selectCard(side, person, bank, event.target.value)}>
        <option value="">Kart seçin</option>
        {choices.map((card) => <option key={card.id} value={card.id}>{/^(kart|biznes kart)$/i.test(card.channel) ? card.channel : card.cleanLabel === person ? card.name : card.cleanLabel}</option>)}
      </select>
    </label>;
  };
  const filteredCustomers = useMemo(() => {
    const query = draft.counterparty.trim().toLocaleLowerCase("az-AZ");
    if (!query) return customers;
    return customers.filter((customer) => customer.toLocaleLowerCase("az-AZ").includes(query));
  }, [customers, draft.counterparty]);
  const chooseKind = (value: EntryKind) => {
    setKind(value);
    setDraft((current) => ({
      ...current,
      category: value === "transfer"
        ? "Hesablararası köçürmə"
        : value === "income"
          ? categories.find((item) => item.toLocaleLowerCase("az-AZ").includes("vəsait qəbulu")) || categories[0] || "Vəsait qəbulu"
          : categories.find((item) => !item.toLocaleLowerCase("az-AZ").includes("vəsait qəbulu")) || "Digər xərc",
    }));
  };
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={onSubmit}>
        <div className="modal-heading">
          <div><span>{mode === "edit" ? "DÜZƏLİŞ SORĞUSU" : isBackdated ? "KEÇMİŞ TARİX SORĞUSU" : "YENİ ƏMƏLİYYAT"}</span><h2>{mode === "edit" ? "Əməliyyatı düzəlt" : "Dəftərə qeyd əlavə et"}</h2><p>{dateLabel(entryDate, { day: "numeric", month: "long", year: "numeric" })}{(mode === "edit" || isBackdated) ? " · Balans yalnız təsdiqdən sonra dəyişəcək." : ""}</p></div>
          <button type="button" className="icon-button" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="kind-switch">
          {(["income", "expense", "transfer"] as EntryKind[]).map((value) => (
            <button type="button" key={value} onClick={() => chooseKind(value)} className={kind === value ? `active ${value}` : ""}>
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

          {isSparexpert ? (
            kind === "transfer" ? (
              /* SparExpert Transfer (Google Sheet: Hesablararası Köçürmə) */
                <div className="v2-transfer-grid full">
                  <div className="v2-transfer-col">
                    <div className="v2-transfer-col-header">
                      <ArrowUpRight size={15} style={{ color: "#ef4444" }} />
                      <span>Çıxış Hesabı (Haradan)</span>
                    </div>
                    <div className="v2-channel-pills compact">
                      <button
                        type="button"
                        className={`v2-channel-btn cash ${sourceCategory === "cash" ? "active" : ""}`}
                        onClick={() => handleSelectSourceCategory("cash")}
                      >
                        <Banknote size={14} />
                        <span>Kassa</span>
                      </button>
                      <button
                        type="button"
                        className={`v2-channel-btn bank ${sourceCategory === "bank" ? "active" : ""}`}
                        onClick={() => handleSelectSourceCategory("bank")}
                      >
                        <Landmark size={14} />
                        <span>Bank</span>
                      </button>
                      <button
                        type="button"
                        className={`v2-channel-btn card ${sourceCategory === "card" ? "active" : ""}`}
                        onClick={() => handleSelectSourceCategory("card")}
                      >
                        <CreditCard size={14} />
                        <span>Kart</span>
                      </button>
                    </div>
                    {sourceCategory === "card" ? (
                        <>
                          <select
                            value={draft.person}
 onChange={(event) => selectCard("source", event.target.value, sourceCardBank)}
>
{cardPeople.map((person) => <option key={person} value={person}>{person}</option>)}
                          </select>
                          <div className="bank-pills-row compact">
                            {cardBanksList.map((b) => (
                              <button
                                key={b}
                                type="button"
                                className={`bank-pill-btn compact ${sourceCardBank === b ? "active" : ""}`}
                                onClick={() => handleSelectSourceCardBank(b)}
                                title={b}
                              >
                                <BankLogo bank={b} size={13} />
                                <span>{b.replace(" Bank", "")}</span>
                              </button>
                            ))}
                          </div>
{renderCardChoice("source")}
                        </>
                    ) : sourceCategory === "bank" ? (
                      <>
                        <div className="bank-pills-row compact">
                          {officialBanksList.map((b) => (
                            <button
                              key={b}
                              type="button"
                              className={`bank-pill-btn compact ${sourceOfficialBank === b ? "active" : ""}`}
                              onClick={() => handleSelectSourceOfficialBank(b)}
                              title={b}
                            >
                              <BankLogo bank={b} size={13} />
                              <span>{b.replace(" Bank", "")}</span>
                            </button>
                          ))}
                        </div>
                        <select
                          value={selectedSourceAccId}
                          onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                        >
                          {sourceOfficialBankAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <select
                        value={selectedSourceAccId}
                        onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                      >
                        {sourceCategoryOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="v2-transfer-col">
                    <div className="v2-transfer-col-header">
                      <ArrowDownLeft size={15} style={{ color: "#10b981" }} />
                      <span>Giriş Hesabı (Haraya)</span>
                    </div>
                    <div className="v2-channel-pills compact">
                      <button
                        type="button"
                        className={`v2-channel-btn cash ${targetCategory === "cash" ? "active" : ""}`}
                        onClick={() => handleSelectTargetCategory("cash")}
                      >
                        <Banknote size={14} />
                        <span>Kassa</span>
                      </button>
                      <button
                        type="button"
                        className={`v2-channel-btn bank ${targetCategory === "bank" ? "active" : ""}`}
                        onClick={() => handleSelectTargetCategory("bank")}
                      >
                        <Landmark size={14} />
                        <span>Bank</span>
                      </button>
                      <button
                        type="button"
                        className={`v2-channel-btn card ${targetCategory === "card" ? "active" : ""}`}
                        onClick={() => handleSelectTargetCategory("card")}
                      >
                        <CreditCard size={14} />
                        <span>Kart</span>
                      </button>
                    </div>
                    {targetCategory === "card" ? (
                        <>
                          <select
                            value={draft.targetPerson}
 onChange={(event) => selectCard("target", event.target.value, targetCardBank)}
>
{cardPeople.map((person) => <option key={person} value={person}>{person}</option>)}
                          </select>
                          <div className="bank-pills-row compact">
                            {cardBanksList.map((b) => (
                              <button
                                key={b}
                                type="button"
                                className={`bank-pill-btn compact ${targetCardBank === b ? "active" : ""}`}
                                onClick={() => handleSelectTargetCardBank(b)}
                                title={b}
                              >
                                <BankLogo bank={b} size={13} />
                                <span>{b.replace(" Bank", "")}</span>
                              </button>
                            ))}
                          </div>
{renderCardChoice("target")}
                        </>
                    ) : targetCategory === "bank" ? (
                      <>
                        <div className="bank-pills-row compact">
                          {officialBanksList.map((b) => (
                            <button
                              key={b}
                              type="button"
                              className={`bank-pill-btn compact ${targetOfficialBank === b ? "active" : ""}`}
                              onClick={() => handleSelectTargetOfficialBank(b)}
                              title={b}
                            >
                              <BankLogo bank={b} size={13} />
                              <span>{b.replace(" Bank", "")}</span>
                            </button>
                          ))}
                        </div>
                        <select
                          value={selectedTargetAccId}
                          onChange={(event) => onSelectSparexpertTargetAccount(event.target.value)}
                        >
                          {targetOfficialBankAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <select
                        value={selectedTargetAccId}
                        onChange={(event) => onSelectSparexpertTargetAccount(event.target.value)}
                      >
                        {targetCategoryOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
            ) : (
              /* SparExpert Mədaxil / Məxaric (Google Sheet sırası: Məbləğ -> Kateqoriya & Kontragent -> Hesab/Kanal -> Ödəniş Forması) */
              <>
                <label>
                  <span>Qarşı tərəf (Kontragent)</span>
                  <div
                    className="counterparty-combobox"
                    onBlur={(event) => {
                      // Mobile Safari may report null when tapping an option.
                      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setCounterpartyMenuOpen(false);
                    }}
                  >
                    <div className="counterparty-input-wrap">
                      <input
                        value={draft.counterparty}
                        onChange={(event) => {
                          setDraft((current) => ({ ...current, counterparty: event.target.value }));
                          setCounterpartyMenuOpen(true);
                        }}
                        onFocus={() => setCounterpartyMenuOpen(true)}
                        onKeyDown={(event) => { if (event.key === "Escape" && counterpartyMenuOpen) { event.stopPropagation(); setCounterpartyMenuOpen(false); } }}
                        placeholder="Müştəri, təchizatçı və ya şəxs"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={counterpartyMenuOpen}
                        aria-controls="daily-counterparty-options"
                      />
                      <button
                        type="button"
                        className="counterparty-toggle"
                        title="Müştəri siyahısını aç"
                        aria-label="Müştəri siyahısını aç"
                        onClick={() => setCounterpartyMenuOpen((current) => !current)}
                      >
                        <ChevronDown size={17} />
                      </button>
                    </div>
                    {counterpartyMenuOpen && (
                      <div id="daily-counterparty-options" className="counterparty-options" role="listbox">
                        <div className="counterparty-options-head">
                          <span>Müştərilər</span>
                          <b>{filteredCustomers.length}</b>
                        </div>
                        {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (
                          <button
                            type="button"
                            key={customer}
                            role="option"
                            aria-selected={draft.counterparty === customer}
                            className={draft.counterparty === customer ? "selected" : ""}
                            onClick={() => {
                              setDraft((current) => ({ ...current, counterparty: customer }));
                              setCounterpartyMenuOpen(false);
                            }}
                          >
                            <span>{customer}</span>
                            {draft.counterparty === customer && <Check size={15} />}
                          </button>
                        )) : <div className="counterparty-empty">Uyğun müştəri tapılmadı</div>}
                      </div>
                    )}
                  </div>
                </label>
                <label>
                  <span>Kateqoriya</span>
                  <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} required>
                    <option value="" disabled>Kateqoriya seçin</option>
                    {draft.category && !categories.includes(draft.category) && <option value={draft.category}>{draft.category}</option>}
                    {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </label>

                {/* Hesab / Kanal seçimi (Kassa / Rəsmi Bank / Kartlar) */}
                  <>
                    <div className="variant2-channel-box full">
                      <span className="field-label">Ödəniş / Daxilolma Kanalı</span>
                      <div className="v2-channel-pills">
                        <button
                          type="button"
                          className={`v2-channel-btn cash ${sourceCategory === "cash" ? "active" : ""}`}
                          onClick={() => handleSelectSourceCategory("cash")}
                        >
                          <Banknote size={15} />
                          <span>💵 Kassa (Nağd)</span>
                        </button>
                        <button
                          type="button"
                          className={`v2-channel-btn bank ${sourceCategory === "bank" ? "active" : ""}`}
                          onClick={() => handleSelectSourceCategory("bank")}
                        >
                          <Landmark size={15} />
                          <span>🏦 Rəsmi Bank</span>
                        </button>
                        <button
                          type="button"
                          className={`v2-channel-btn card ${sourceCategory === "card" ? "active" : ""}`}
                          onClick={() => handleSelectSourceCategory("card")}
                        >
                          <CreditCard size={15} />
                          <span>💳 Kartlar</span>
                        </button>
                      </div>
                    </div>
                    {sourceCategory === "card" ? (
                      <div className="card-selector-container full">
                          <>
                            <label className="full">
                              <span>Məsul şəxs</span>
                              <select
                                value={draft.person}
 onChange={(event) => selectCard("source", event.target.value, sourceCardBank)}
>
{cardPeople.map((person) => <option key={person} value={person}>{person}</option>)}
                              </select>
                            </label>
                            <div className="card-bank-selector full">
                              <span className="field-label">Kartın bankı</span>
                              <div className="bank-pills-row">
                                {cardBanksList.map((b) => (
                                  <button
                                    key={b}
                                    type="button"
                                    className={`bank-pill-btn ${sourceCardBank === b ? "active" : ""}`}
                                    onClick={() => handleSelectSourceCardBank(b)}
                                  >
                                    <BankLogo bank={b} size={15} />
                                    <span>{b}</span>
                                  </button>
                                ))}
                              </div>
{renderCardChoice("source")}
                            </div>
                          </>

                      </div>
                    ) : sourceCategory === "bank" ? (
                      <div className="official-bank-selector-container full">
                        <span className="field-label">Rəsmi Bank Seçimi</span>
                        <div className="bank-pills-row">
                          {officialBanksList.map((b) => (
                            <button
                              key={b}
                              type="button"
                              className={`bank-pill-btn ${sourceOfficialBank === b ? "active" : ""}`}
                              onClick={() => handleSelectSourceOfficialBank(b)}
                            >
                              <BankLogo bank={b} size={15} />
                              <span>{b}</span>
                            </button>
                          ))}
                        </div>
                        <label className="full" style={{ marginTop: "4px" }}>
                          <span>{sourceOfficialBank} Hesabı</span>
                          <select
                            value={selectedSourceAccId}
                            onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                          >
                            {sourceOfficialBankAccounts.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : (
                      <label className="full">
                        <span>Kassa seçimi (Məsul şəxs)</span>
                        <select
                          value={selectedSourceAccId}
                          onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                        >
                          {sourceCategoryOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </>


                {kind === "expense" && draft.channel.toLocaleLowerCase("az-AZ") !== "kassa" && (
                  <div className="expense-method-group full">
                    <span className="field-label">Ödəniş forması (Bank / Kart çıxışı)</span>
                    <div className="expense-method-toggle" role="radiogroup">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={draft.expenseMethod === "online"}
                        className={draft.expenseMethod === "online" ? "active" : ""}
                        onClick={() => setDraft((current) => ({ ...current, expenseMethod: "online" }))}
                      >
                        <CreditCard size={15} />
                        <span>Onlayn / POS</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={draft.expenseMethod === "diff_bank"}
                        className={draft.expenseMethod === "diff_bank" ? "active" : ""}
                        onClick={() => setDraft((current) => ({ ...current, expenseMethod: "diff_bank" }))}
                      >
                        <ArrowUpRight size={15} />
                        <span>Fərqli banka köçürmə</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={draft.expenseMethod === "same_bank"}
                        className={draft.expenseMethod === "same_bank" ? "active" : ""}
                        onClick={() => setDraft((current) => ({ ...current, expenseMethod: "same_bank" }))}
                      >
                        <ArrowLeftRight size={15} />
                        <span>Eyni banka köçürmə</span>
                      </button>


                    </div>
                    <small className="expense-method-hint">
                      {draft.expenseMethod === "diff_bank"
                        ? `💡 ${draft.channel || "Kart"} hesabatında «Köçürmə (fərqli bank)» sütununa düşəcək və aylıq kart limitindən çıxılacaq.`
                        : draft.expenseMethod === "same_bank"
                        ? `💡 ${draft.channel || "Kart"} hesabatında «Köçürmə (eyni bank)» sütununa düşəcək.`
                        : `💡 ${draft.channel || "Kart"} kartı ilə POS terminal və ya internet ödənişi (standart onlayn xərc).`}
                    </small>
                  </div>
                )}
              </>
            )
          ) : (
            /* AZART MEMBRAN (!isSparexpert): 100% Orijinal Struktur */
            <>
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

              {kind === "expense" && draft.channel.toLocaleLowerCase("az-AZ") !== "kassa" && (
                <div className="expense-method-group full">
                  <span className="field-label">Ödəniş forması (Bank / Kart çıxışı)</span>
                  <div className={cx("expense-method-toggle", !isSparexpert && "expense-method-toggle-four")} role="radiogroup">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={draft.expenseMethod === "online"}
                      className={draft.expenseMethod === "online" ? "active" : ""}
                      onClick={() => setDraft((current) => ({ ...current, expenseMethod: "online" }))}
                    >
                      <CreditCard size={15} />
                      <span>Onlayn / POS</span>
                    </button>
                    {!isSparexpert && <button type="button" role="radio"
                      aria-checked={draft.expenseMethod === "cash_out"}
                      className={draft.expenseMethod === "cash_out" ? "active" : ""}
                      onClick={() => setDraft((current) => ({ ...current, expenseMethod: "cash_out" }))}>
                      <Banknote size={15} aria-hidden="true" /><span>Nağdlaşdırma</span>
                    </button>}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={draft.expenseMethod === "diff_bank"}
                      className={draft.expenseMethod === "diff_bank" ? "active" : ""}
                      onClick={() => setDraft((current) => ({ ...current, expenseMethod: "diff_bank" }))}
                    >
                      <ArrowUpRight size={15} />
                      <span>Fərqli banka köçürmə</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={draft.expenseMethod === "same_bank"}
                      className={draft.expenseMethod === "same_bank" ? "active" : ""}
                      onClick={() => setDraft((current) => ({ ...current, expenseMethod: "same_bank" }))}
                    >
                      <ArrowLeftRight size={15} />
                      <span>Eyni banka köçürmə</span>
                    </button>

                  </div>
                  <small className="expense-method-hint">
                    {draft.expenseMethod === "cash_out" ? "Kart hesabatında Nağdlaşdırma kimi göstərilir. Kapital Bank kartının aylıq limitindən çıxılır." : draft.expenseMethod === "diff_bank"
                      ? `💡 ${draft.channel || "Kart"} hesabatında «Köçürmə (fərqli bank)» sütununa düşəcək və aylıq kart limitindən çıxılacaq.`
                      : draft.expenseMethod === "same_bank"
                      ? `💡 ${draft.channel || "Kart"} hesabatında «Köçürmə (eyni bank)» sütununa düşəcək.`
                      : `💡 ${draft.channel || "Kart"} kartı ilə POS terminal və ya internet ödənişi (standart onlayn xərc).`}
                  </small>
                </div>
              )}

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
                    <div
                      className="counterparty-combobox"
                      onBlur={(event) => {
                        // Mobile Safari may report null when tapping an option.
                      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setCounterpartyMenuOpen(false);
                      }}
                    >
                      <div className="counterparty-input-wrap">
                        <input
                          value={draft.counterparty}
                          onChange={(event) => {
                            setDraft((current) => ({ ...current, counterparty: event.target.value }));
                            setCounterpartyMenuOpen(true);
                          }}
                          onFocus={() => setCounterpartyMenuOpen(true)}
                        onKeyDown={(event) => { if (event.key === "Escape" && counterpartyMenuOpen) { event.stopPropagation(); setCounterpartyMenuOpen(false); } }}
                          placeholder="Müştəri, təchizatçı və ya şəxs"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={counterpartyMenuOpen}
                          aria-controls="daily-counterparty-options"
                        />
                        <button
                          type="button"
                          className="counterparty-toggle"
                          title="Müştəri siyahısını aç"
                          aria-label="Müştəri siyahısını aç"
                          onClick={() => setCounterpartyMenuOpen((current) => !current)}
                        >
                          <ChevronDown size={17} />
                        </button>
                      </div>
                      {counterpartyMenuOpen && (
                        <div id="daily-counterparty-options" className="counterparty-options" role="listbox">
                          <div className="counterparty-options-head">
                            <span>Müştərilər</span>
                            <b>{filteredCustomers.length}</b>
                          </div>
                          {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (
                            <button
                              type="button"
                              key={customer}
                              role="option"
                              aria-selected={draft.counterparty === customer}
                              className={draft.counterparty === customer ? "selected" : ""}
                              onClick={() => {
                                setDraft((current) => ({ ...current, counterparty: customer }));
                                setCounterpartyMenuOpen(false);
                              }}
                            >
                              <span>{customer}</span>
                              {draft.counterparty === customer && <Check size={15} />}
                            </button>
                          )) : <div className="counterparty-empty">Uyğun müştəri tapılmadı</div>}
                        </div>
                      )}
                    </div>
                  </label>
                  <label>
                    <span>Kateqoriya</span>
                    <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} required>
                      <option value="" disabled>Kateqoriya seçin</option>
                      {draft.category && !categories.includes(draft.category) && <option value={draft.category}>{draft.category}</option>}
                      {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </label>
                </>
              )}
            </>
          )}
          <label className="full">
            <span>Açıqlama</span>
            <textarea value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Əməliyyatla bağlı qısa qeyd" />
          </label>
          {(mode === "edit" || isBackdated) && <label className="full">
            <span>{requireEditReason ? "Səbəb (düzəliş üçün məcburi)" : mode === "edit" ? "Düzəliş / silinmə səbəbi" : "Keçmiş tarixə əlavə səbəbi"}</span>
            <input aria-required={requireEditReason || undefined} value={draft.changeReason} onChange={(event) => setDraft((current) => ({ ...current, changeReason: event.target.value }))} placeholder={requireEditReason ? "Düzəlişin səbəbini yazın" : "Qısa izah (istəyə bağlı)"} />
          </label>}
        </div>
        {error && <div className="entry-dialog-error">{error}</div>}
        <div className="modal-actions">
          {mode === "edit" && canDelete && <button type="button" className="secondary-button danger entry-delete-request" onClick={onDelete} disabled={busy}><Trash2 size={16} />{deleteNeedsApproval ? "Silməni təsdiqə göndər" : "Sil"}</button>}
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>İmtina</button>
          {(mode === "create" || canEdit) && <button type="submit" className="primary-button" disabled={busy}><Check size={17} />{busy ? "Göndərilir..." : (mode === "edit" && editNeedsApproval) || isBackdated ? "Təsdiqə göndər" : "Yadda saxla"}</button>}
        </div>
      </form>
    </div>
  );
}

function EntryApprovalCenter({ requests, canApprove, busy, onRefresh, onResolve, onClose }: {
  requests: EntryChangeRequest[];
  canApprove: boolean;
  busy: boolean;
  onRefresh: () => void;
  onResolve: (requestId: string, action: "approve" | "reject", note?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(() => requests.find((item) => item.status === "pending")?.id || requests[0]?.id || "");
  const [resolutionNote, setResolutionNote] = useState("");
  const selected = requests.find((item) => item.id === selectedId) || requests[0];
  const ordered = [...requests].sort((left, right) => {
    if (left.status === "pending" && right.status !== "pending") return -1;
    if (left.status !== "pending" && right.status === "pending") return 1;
    return right.requestedAt.localeCompare(left.requestedAt);
  });
  const fields: Array<{ label: string; key: keyof Entry }> = [
    { label: "Tarix", key: "date" },
    { label: "Saat", key: "time" },
    { label: "Növ", key: "kind" },
    { label: "Məbləğ", key: "amount" },
    { label: "Kateqoriya", key: "category" },
    { label: "Qarşı tərəf", key: "counterparty" },
    { label: "Şəxs", key: "responsible" },
    { label: "Hesab / Kanal", key: "bank" },
    { label: "Açıqlama", key: "note" },
  ];
  const changedFields = selected
    ? fields.filter(({ key }) => String(selected.originalEntry?.[key] ?? "") !== String(selected.proposedEntry?.[key] ?? ""))
    : [];
  const statusLabel = (status: EntryChangeRequest["status"]) => status === "pending" ? "Gözləyir" : status === "approved" ? "Təsdiqləndi" : "Rədd edildi";
  const actionLabel = (action?: EntryChangeRequest["action"]) => action === "delete" ? "Silinmə" : action === "create_backdated" ? "Keçmiş tarix" : "Düzəliş";

  return <div className="modal-backdrop entry-approval-backdrop">
    <section className="modal entry-approval-modal" role="dialog" aria-modal="true" aria-label="Əməliyyat təsdiqləri">
      <header className="modal-heading">
        <div><span>NƏZARƏTLİ ƏMƏLİYYAT</span><h2>Əməliyyat təsdiqləri</h2><p>Düzəliş, silinmə və keçmiş tarix əlavələri təsdiqə qədər balansı dəyişmir.</p></div>
        <div className="entry-approval-heading-actions"><button type="button" className="icon-button" onClick={onRefresh} title="Yenilə"><ArrowLeftRight size={17} /></button><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div>
      </header>
      <div className="entry-approval-layout">
        <aside className="entry-request-list">
          {ordered.map((request) => {
            const entry = request.originalEntry || request.proposedEntry;
            return <button type="button" key={request.id} className={cx(selected?.id === request.id && "active", request.status)} onClick={() => { setSelectedId(request.id); setResolutionNote(""); }}>
              <span><b>{entry?.counterparty || entry?.title || "Əməliyyat"}</b><small>{actionLabel(request.action)} · {entry?.date || "—"} · {request.requestedBy}</small></span>
              <em>{statusLabel(request.status)}</em>
            </button>;
          })}
          {ordered.length === 0 && <div className="entry-request-empty"><ClipboardCheck size={24} /><b>Əməliyyat sorğusu yoxdur</b><span>Göndərilən sorğular burada görünəcək.</span></div>}
        </aside>
        {selected && <main className="entry-request-detail">
          <div className="entry-request-meta"><span><small>{actionLabel(selected.action)} sorğusu · Göndərən</small><b>{selected.requestedBy}</b></span><span><small>Tarix</small><b>{new Date(selected.requestedAt).toLocaleString("az-AZ")}</b></span><i className={selected.status}>{statusLabel(selected.status)}</i></div>
          {selected.reason && <div className="entry-request-reason"><small>Sorğu səbəbi</small><p>{selected.reason}</p></div>}
          <div className="entry-change-table">
            <div className="entry-change-head"><span>Sahə</span><span>Əvvəl</span><span>Təklif edilən</span></div>
            {changedFields.map(({ label, key }) => <div key={String(key)}><b>{label}</b><span>{String(selected.originalEntry?.[key] ?? "—")}</span><strong>{String(selected.proposedEntry?.[key] ?? "—")}</strong></div>)}
          </div>
          {changedFields.length === 0 && <div className="entry-request-empty"><span>Dəyişən maliyyə sahəsi tapılmadı.</span></div>}
          {selected.status !== "pending" && <div className="entry-request-resolution"><b>{selected.resolvedBy || "Daily rəhbəri"}</b><span>{selected.resolvedAt ? new Date(selected.resolvedAt).toLocaleString("az-AZ") : ""}</span>{selected.resolutionNote && <p>{selected.resolutionNote}</p>}</div>}
          {selected.status === "pending" && canApprove && <div className="entry-approval-decision"><input value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Qərar qeydi (istəyə bağlı)" /><button type="button" className="secondary-button danger" disabled={busy} onClick={() => void onResolve(selected.id, "reject", resolutionNote)}>Rədd et</button><button type="button" className="primary-button" disabled={busy} onClick={() => void onResolve(selected.id, "approve", resolutionNote)}><Check size={16} /> Təsdiqlə</button></div>}
          {selected.status === "pending" && !canApprove && <div className="entry-waiting-note"><ClipboardCheck size={16} /><span>Səlahiyyətli şəxsin qərarı gözlənilir.</span></div>}
        </main>}
      </div>
    </section>
  </div>;
}

function AccountStatementModal({
  accountName,
  selectedDate,
  reconciliationRows,
  dayEntries,
  accountCatalog,
  formatMoney,
  onClose,
  onOpenEntryForAccount,
  onSelectEntry,
  canEditEntry,
  isAutoSupplierCollector,
  isSparexpert = false,
}: {
  accountName: string;
  selectedDate: string;
  reconciliationRows: ReconciliationRow[];
  dayEntries: Entry[];
  accountCatalog: Account[];
  formatMoney: (amount: number, currency: Currency) => string;
  onClose: () => void;
  onOpenEntryForAccount: (kind: EntryKind, accountName: string) => void;
  onSelectEntry?: (entry: Entry) => void;
  canEditEntry?: boolean;
  isAutoSupplierCollector: (name: string) => boolean;
  isSparexpert?: boolean;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const isAggregate = isAggregateAccount(accountName);
  const row = reconciliationRows.find(([n]) => n === accountName) || [accountName, 0, 0, 0, 0, 0];
  const [, received, previous, expense, supplier, transfer = 0] = row;
  const current = isSparexpert
    ? previous + received - supplier - expense + (transfer || 0)
    : received + previous - expense - supplier;
  const autoTo = !isSparexpert && isAutoSupplierCollector(accountName);
  const { cleanName, badgeText, badgeClass } = getAccountDisplayInfo(accountName, isSparexpert, accountCatalog, autoTo);
  const isCard = badgeClass === "card" || badgeClass === "bank";
  const account = accountCatalog.find((acc) => acc.name === accountName || acc.id === accountName);

  const accountEntries = useMemo(() => {
    if (isAggregate) {
      return [...dayEntries].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    }
    return dayEntries.filter((entry) => {
      if (account) {
        if (entry.accountId === account.id) return true;
        if (entry.kind === "transfer" && entry.targetAccountId === account.id) return true;
      }
      const person = resolveEntryPerson(entry, account);
      const channel = resolveEntryChannel(entry, account);
      if (isCard) {
        return (
          (person.toLocaleLowerCase("az-AZ") === cleanName.toLocaleLowerCase("az-AZ") && channel.toLocaleLowerCase("az-AZ") !== "kassa") ||
          Boolean(entry.bank && entry.bank.toLocaleLowerCase("az-AZ") === accountName.toLocaleLowerCase("az-AZ"))
        );
      }
      return person.toLocaleLowerCase("az-AZ") === cleanName.toLocaleLowerCase("az-AZ") && channel.toLocaleLowerCase("az-AZ") === "kassa";
    }).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }, [dayEntries, account, isCard, cleanName, accountName, isAggregate]);

  return createPortal(
    <div className="modal-backdrop statement-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal statement-modal" onClick={(e) => e.stopPropagation()}>
        <div className="statement-sheet-handle" aria-hidden="true" />

        <div className="statement-header">
          <div className="statement-identity">
            <div className="statement-icon-wrap">
              {isCard ? <CreditCard size={22} /> : <Banknote size={22} />}
            </div>
            <div>
              <div className="statement-title-row">
                <h2>{cleanName}</h2>
                <span className={cx("recon-badge", isCard ? "bank" : "cash")}>{badgeText}</span>
              </div>
              <p className="statement-subtitle">
                {dateLabel(selectedDate, { day: "numeric", month: "long", year: "numeric" })} · Günlük döküm
              </p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Bağla" title="Bağla (Esc)">
            <X size={19} />
          </button>
        </div>

        <div className="statement-body">
          <div className="statement-kpis">
            <div className="statement-kpi-box opening">
              <span className="kpi-label">Əvvəldən qalıq</span>
              <strong className="kpi-value">{formatMoney(previous, "AZN")}</strong>
            </div>
            <div className={cx("statement-kpi-box income", received > 0 && "active")}>
              <span className="kpi-label">Vəsait qəbulu (+)</span>
              <strong className="kpi-value">{received > 0 ? `+${formatMoney(received, "AZN")}` : formatMoney(received, "AZN")}</strong>
            </div>
            <div className={cx("statement-kpi-box expense", expense > 0 && "active")}>
              <span className="kpi-label">Xərc (−)</span>
              <strong className="kpi-value">{expense > 0 ? `−${formatMoney(expense, "AZN")}` : formatMoney(expense, "AZN")}</strong>
            </div>
            <div className={cx("statement-kpi-box supplier", supplier > 0 && "active")}>
              <span className="kpi-label">Təchizatçı (−)</span>
              <strong className="kpi-value">{supplier > 0 ? `−${formatMoney(supplier, "AZN")}` : formatMoney(supplier, "AZN")}</strong>
            </div>
            <div className="statement-kpi-box balance highlight">
              <span className="kpi-label">Günün cari qalığı (=)</span>
              <strong className="kpi-value">{formatMoney(current, "AZN")}</strong>
            </div>
          </div>

          <div className="statement-section">
            <div className="statement-section-head">
              <h3>
                Bu günün əməliyyatları <span className="statement-count">({accountEntries.length})</span>
              </h3>
              {accountEntries.length > 0 && canEditEntry && (
                <span className="statement-hint">Baxmaq və ya redaktə üçün üzərinə klikləyin</span>
              )}
            </div>

            {accountEntries.length === 0 ? (
              <div className="statement-empty-state">
                <div className="statement-empty-icon">
                  <CalendarDays size={32} />
                </div>
                <h4>Bu gün əməliyyat qeydə alınmayıb</h4>
                <p>
                  Bu hesab üzrə <strong>{dateLabel(selectedDate, { day: "numeric", month: "long" })}</strong> tarixində heç bir mədaxil, məxaric və ya köçürmə aparılmayıb. Qalıq ötən gündən ötürülüb: <b>{formatMoney(current, "AZN")}</b>
                </p>
                <div className="statement-empty-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => onOpenEntryForAccount("income", accountName)}
                  >
                    <Plus size={16} /> Mədaxil əlavə et
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => onOpenEntryForAccount("expense", accountName)}
                  >
                    <Plus size={16} /> Məxaric əlavə et
                  </button>
                </div>
              </div>
            ) : (
              <div className="statement-entries-list">
                {accountEntries.map((entry) => {
                  const isIncomingTransfer = entry.kind === "transfer" && entry.targetAccountId === account?.id;
                  const isIncome = entry.kind === "income" || isIncomingTransfer;
                  const isSupplier = entry.category?.toLocaleLowerCase("az-AZ").includes("təch");
                  const amountAbs = Math.abs(entry.amount);
                  const amountSign = isIncome ? "+" : "−";

                  let kindLabel = "Mədaxil";
                  let icon = <ArrowDownLeft size={16} />;
                  let iconClass = "income";

                  if (entry.kind === "expense") {
                    kindLabel = isSupplier ? "Təchizatçı ödənişi" : "Məxaric";
                    icon = <ArrowUpRight size={16} />;
                    iconClass = isSupplier ? "supplier" : "expense";
                  } else if (entry.kind === "transfer") {
                    kindLabel = isIncomingTransfer ? "Köçürmə (Daxil)" : "Köçürmə (Xaric)";
                    icon = <ArrowLeftRight size={16} />;
                    iconClass = isIncomingTransfer ? "income" : "transfer";
                  }

                  const counterpartyDisplay = entry.counterparty || entry.title;

                  return (
                    <div
                      key={entry.id}
                      className={cx("statement-entry-item", canEditEntry && "clickable")}
                      role={canEditEntry ? "button" : undefined}
                      tabIndex={canEditEntry ? 0 : undefined}
                      onClick={() => {
                        if (canEditEntry && onSelectEntry) {
                          onSelectEntry(entry);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (canEditEntry && onSelectEntry && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          onSelectEntry(entry);
                        }
                      }}
                    >
                      <div className="entry-left">
                        <div className={cx("entry-kind-icon", iconClass)}>
                          {icon}
                        </div>
                        <div className="entry-details">
                          <div className="entry-main-line">
                            <span className="entry-time">{entry.time || "--:--"}</span>
                            <span className="entry-bank-tag">
                              <BankLogo bank={entry.bank || "Kassa"} size={13} />
                              <span>
                                {entry.kind === "transfer" && entry.targetBank
                                  ? `${entry.bank || "Kassa"} → ${entry.targetBank}`
                                  : (entry.bank || "Kassa")}
                              </span>
                            </span>
                            <span className="entry-kind-tag">{kindLabel}</span>
                            {entry.kind === "expense" && entry.expenseMethod === "cash_out" && <small>Nağdlaşdırma</small>}
                        {entry.kind === "expense" && entry.expenseMethod === "diff_bank" && (
                              <span className="entry-method-tag diff-bank">Fərqli bank</span>
                            )}
                            {entry.kind === "expense" && entry.expenseMethod === "same_bank" && (
                              <span className="entry-method-tag same-bank">Eyni bank</span>
                            )}
                            {entry.category && entry.category !== kindLabel && (
                              <span className="entry-category-tag">{entry.category}</span>
                            )}
                          </div>
                          {counterpartyDisplay && (
                            <div className="entry-counterparty">
                              <b>{counterpartyDisplay}</b>
                              {entry.counterparty && entry.title && entry.title !== "Mədaxil" && entry.title !== "Məxaric" && (
                                <span className="entry-sub-title"> · {entry.title}</span>
                              )}
                            </div>
                          )}
                          {entry.note?.trim() && (
                            <p className="entry-note">{entry.note}</p>
                          )}
                        </div>
                      </div>
                      <div className="entry-right">
                        <strong className={cx("entry-amount", isIncome ? "income" : "outflow")}>
                          {amountSign}{formatMoney(amountAbs, "AZN")}
                        </strong>
                        {canEditEntry && (
                          <span className="entry-edit-hint">
                            Bax / Redaktə <ChevronRight size={12} />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="statement-actions">
          <div className="statement-add-buttons">
            <button
              type="button"
              className="secondary-button"
              onClick={() => onOpenEntryForAccount("income", accountName)}
            >
              <Plus size={15} /> + Mədaxil
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onOpenEntryForAccount("expense", accountName)}
            >
              <Plus size={15} /> − Məxaric
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onOpenEntryForAccount("transfer", accountName)}
            >
              <ArrowLeftRight size={15} /> Transfer
            </button>
          </div>
          <button type="button" className="primary-button" onClick={onClose}>
            Bağla
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CloseDialog({
  date,
  accounts,
  reconciliationRows,
  onClose,
  onSave,
}: {
  date: string;
  accounts: Account[];
  reconciliationRows: ReconciliationRow[];
  onClose: () => void;
  onSave: (actuals: Record<string, number>, note: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  // Filter out aggregate account ("Ümumi") and placeholder cards ("Kart X5", "T1..T4", etc.)
  const closeAccounts = useMemo(() => {
    return reconciliationRows
      .filter(([name]) => !isAggregateAccount(name) && !isPlaceholderCard(name))
      .map(([name, received, previous, expense, supplier]) => {
        const account = accounts.find((acc) => acc.name === name) || {
          id: name,
          name,
          type: /^K\./i.test(name) || /^Kart/i.test(name) ? "card" : "cash",
          currency: "AZN",
          opening: 0,
        };
        const expected = Math.round((received + previous - expense - supplier) * 100) / 100;
        const hasActivity = received !== 0 || expense !== 0 || supplier !== 0;
        const isCard = /^K\./i.test(account.name) || account.type === "card";
        const label = account.person
          ? `${account.person} · ${account.channel}`
          : `${normalizePersonName(account.name)} · ${isCard ? "Kart / Bank" : "Kassa"}`;
        return {
          account,
          label,
          isCard,
          expected,
          hasActivity,
          received,
          previous,
          expense,
          supplier,
        };
      });
  }, [reconciliationRows, accounts]);

  const [actuals, setActuals] = useState<Record<string, string>>(() =>
    Object.fromEntries(closeAccounts.map((item) => [item.account.id, String(item.expected)]))
  );
  const [note, setNote] = useState("");

  const visibleItems = useMemo(() => {
    if (showAll) return closeAccounts;
    // By default, prioritize accounts with activity today or the primary cash register (Eşqin)
    const filtered = closeAccounts.filter(
      (item) => item.hasActivity || item.account.name === "Eşqin"
    );
    return filtered.length > 0 ? filtered : closeAccounts;
  }, [closeAccounts, showAll]);

  const differences = visibleItems.map((item) => Number(actuals[item.account.id] || 0) - item.expected);
  const hasDifference = differences.some((val) => Math.abs(val) > 0.009);

  return (
    <div className="modal-backdrop">
      <div className="modal close-modal">
        <div className="modal-heading">
          <div>
            <span>GÜN SONU</span>
            <h2>Hesabları yoxla</h2>
            <p>{dateLabel(date, { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={19} /></button>
        </div>

        <div className="close-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", marginBottom: "4px" }}>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            {showAll ? `Bütün hesablar (${closeAccounts.length})` : `Bugün aktiv hesablar (${visibleItems.length})`}
          </span>
          <button
            type="button"
            className="secondary-button"
            style={{ height: "30px", fontSize: "12px", padding: "0 10px" }}
            onClick={() => setShowAll((prev) => !prev)}
          >
            {showAll ? "Yalnız aktivləri göstər" : `Bütün hesabları göstər (${closeAccounts.length})`}
          </button>
        </div>

        <div className="close-list">
          <div className="close-head">
            <span>Şəxs / Hesab</span>
            <span>Sistem (Cari qalıq)</span>
            <span>Faktiki</span>
            <span>Fərq</span>
          </div>
          {visibleItems.map(({ account, label, expected, hasActivity }) => {
            const actual = Number(actuals[account.id] ?? expected);
            const difference = actual - expected;
            return (
              <label key={account.id}>
                <span>
                  <b>{label}</b>
                  <small>
                    {hasActivity ? "● Bugünkü hərəkət var" : "Dəyişməyib"}
                  </small>
                </span>
                <strong data-close-label="Sistem">{formatMoney(expected, account.currency)}</strong>
                <div className="close-actual-field" data-close-label="Faktiki">
                <input
                  aria-label={`${label} — faktiki qalıq`}
                  inputMode="decimal"
                  value={actuals[account.id] ?? ""}
                  onChange={(event) =>
                    setActuals((current) => ({ ...current, [account.id]: event.target.value }))
                  }
                />
                </div>
                <em data-close-label="Fərq" className={Math.abs(difference) > 0.009 ? "different" : ""}>
                  {formatMoney(difference, account.currency)}
                </em>
              </label>
            );
          })}
        </div>

        {hasDifference && (
          <label className="difference-note">
            <span>Fərqin izahı</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required
              placeholder="Sistem və faktiki qalıq arasındakı fərqin səbəbini yazın"
            />
          </label>
        )}

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>İmtina</button>
          <button
            className="primary-button"
            disabled={hasDifference && !note.trim()}
            onClick={() =>
              onSave(
                Object.fromEntries(
                  Object.entries(actuals).map(([key, value]) => [key, Number(value || 0)])
                ),
                note
              )
            }
          >
            <LockKeyhole size={17} /> Günü bağla
          </button>
        </div>
      </div>
    </div>
  );
}

function getCleanAccountTitle(acc?: Account | Partial<Account>): string {
  if (!acc) return "";
  if (acc.id === "H.Spare") return "Spare (Əsas)";
  if (acc.id === "H.ƏDV") return "Spare (ƏDV)";
  if (acc.id === "H.Simran") return "Simran (Əsas)";
  if (acc.id === "H.SimƏDV") return "Simran (ƏDV)";
  if (acc.id === "H.Ceyhun") return "Ceyhun";
  if (acc.id === "H.SpareRB") return "Spare (Rabitə)";
  if (acc.id === "H.SimZiraat") return "Simran (Ziraat)";
  if (acc.id === "BK.Simran") return "Simran (Biznes)";
  if (acc.id === "Kart X1") return "Simran (Ziraat)";

  const raw = acc.name || acc.id || "";
  const cleaned = raw.replace(/^[HNK]\./, "").replace(/^BK\./, "").trim();
  if (cleaned && cleaned !== acc.id && !cleaned.startsWith("acc_")) {
    return cleaned;
  }
  if (acc.person) {
    if (acc.type === "cash") return acc.person;
    if (acc.channel && acc.channel !== "Kassa") return `${acc.person} (${acc.channel})`;
    return acc.person;
  }
  return (cleaned.startsWith("acc_") ? (acc.person || "Hesab") : cleaned) || acc.id || "";
}

function AccountEditModal({
  account,
  isNew,
  initialType,
  peopleList,
  channelList,
  bankDirectory,
  onSave,
  onClose,
}: {
  account?: Partial<Account>;
  isNew: boolean;
  initialType?: "cash" | "bank" | "card";
  peopleList: string[];
  channelList: string[];
  bankDirectory?: { names: string[]; logos: BankDirectory };
  onSave: (acc: Account, newPerson?: string, newChannel?: string) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<"cash" | "bank" | "card">((account?.type === "cash" || account?.type === "card") ? account.type : (initialType || "bank"));
  const [person, setPerson] = useState<string>(account?.person || peopleList[0] || "Spare");
  const [isNewPerson, setIsNewPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");

  const bankNames = ["Kapital Bank", "ABB", "Unibank", "Leobank", "Rabitə Bank", "Ziraat Bank", "Azər Türk Bank"];
  const currentChannel = account?.channel?.trim() || "";
  const currentBank = normalizeBankKey(currentChannel);
  const inferredBank = account?.id === "H.SimZiraat" ? "ziraat" : normalizeBankKey(account?.name);
  const bankOptions = [...new Set([
    ...bankNames,
    ...(bankDirectory?.names || []),
    ...(type === "card" ? ["M10"] : []),
    ...(!bankDirectory ? channelList.filter((name) => /\b(bank|bankı)\b/i.test(name) && normalizeBankKey(name) === "other") : []),
    ...(currentChannel && account?.type !== "cash" && !/^(?:[NHK]\.|Kassa\b)/i.test(currentChannel) &&
      currentBank === "other" && inferredBank === "other" ? [currentChannel] : []),
  ])];
  const [channel, setChannel] = useState<string>(() =>
    bankOptions.find((name) => normalizeBankKey(name) === (inferredBank !== "other" ? inferredBank : currentBank) && normalizeBankKey(name) !== "other")
    || (bankOptions.includes(currentChannel) ? currentChannel : "")
  );
  const [isNewChannel, setIsNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");

  const initialTitle = account ? getCleanAccountTitle(account) : "";
  const [accountTitle, setAccountTitle] = useState<string>(initialTitle);
  const [currency, setCurrency] = useState<Currency>(account?.currency || "AZN");
  const [opening, setOpening] = useState<string>(String(account?.opening ?? 0));
  const [logo, setLogo] = useState(account?.logo || "");
  const [archived, setArchived] = useState(Boolean(account?.archived));
  const [logoError, setLogoError] = useState("");
  const [logoLoading, setLogoLoading] = useState(false);
  const readLogo = async (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) {
      setLogoError("PNG, JPG və ya WebP şəkli seçin (ən çox 2 MB).");
      return;
    }
    setLogoError("");
    setLogoLoading(true);
    try {
      const image = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        const ratio = 128 / Math.max(image.width, image.height, 128);
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        const context = canvas.getContext("2d");
        if (!context) throw new Error();
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setLogo(canvas.toDataURL("image/webp", 0.85));
      } finally { image.close(); }
    } catch {
      setLogoError("Şəkli açmaq olmadı. Başqa fayl seçin.");
    } finally { setLogoLoading(false); }
  };

  const effectivePerson = isNewPerson ? newPersonName.trim() : person;
  const effectiveChannel = type === "cash" ? "Kassa" : (isNewChannel ? newChannelName.trim() : channel);

  const defaultTitlePlaceholder = useMemo(() => {
    if (type === "cash") return `${effectivePerson || "Şəxs"}`;
    if (type === "bank") return `${effectivePerson || "Şəxs"} (${effectiveChannel || "Bank"})`;
    return `${effectivePerson || "Şəxs"} (${effectiveChannel || "Kart"})`;
  }, [type, effectivePerson, effectiveChannel]);

  const displayTitle = accountTitle.trim() || defaultTitlePlaceholder;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (logoLoading) return;
    const finalPerson = isNewPerson ? newPersonName.trim() : person;
    const finalChannel = type === "cash" ? "Kassa" : (isNewChannel ? newChannelName.trim() : channel);
    if (!finalPerson) {
      alert("Zəhmət olmasa hesab sahibini / məsul şəxsi qeyd edin.");
      return;
    }
    if (!finalChannel) {
      alert("Zəhmət olmasa bank və ya kanalı qeyd edin.");
      return;
    }

    const openingNum = parseFloat(opening.replace(",", ".")) || 0;
    const finalId = account?.id || `acc_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const finalName = accountTitle.trim() || defaultTitlePlaceholder;

    const newAcc: Account = {
      id: finalId,
      name: finalName,
      type,
      currency,
      opening: openingNum,
      person: finalPerson,
      channel: finalChannel,
      logo,
      archived,
    };

    onSave(
      newAcc,
      isNewPerson ? finalPerson : undefined,
      isNewChannel ? finalChannel : undefined
    );
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-heading">
          <div>
            <span>HESAB İDARƏETMƏSİ</span>
            <h2>{isNew ? "Yeni Hesab Əlavə Et" : `Hesaba Düzəliş Et: ${initialTitle || displayTitle}`}</h2>
            <p>Kassa, rəsmi bank və ya kart hesabı təyin edin. Əməliyyat və hesabatlara dərhal əlavə olunacaq.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><X size={19} /></button>
        </div>

        <div className="form-grid">
          <div className="variant2-channel-box full">
            <span className="field-label">Hesab Növü</span>
            <div className="v2-channel-pills">
              <button
                type="button"
                className={`v2-channel-btn cash ${type === "cash" ? "active" : ""}`}
                onClick={() => {
                  setType("cash");
                  setChannel("Kassa");
                  setIsNewChannel(false);
                }}
              >
                <Banknote size={15} />
                <span>💵 Kassa (Nağd)</span>
              </button>
              <button
                type="button"
                className={`v2-channel-btn bank ${type === "bank" ? "active" : ""}`}
                onClick={() => {
                  setType("bank");
                  if (channel === "Kassa") setChannel(channelList.find((c) => c !== "Kassa") || "Kapital Bank");
                }}
              >
                <Landmark size={15} />
                <span>🏦 Rəsmi Bank</span>
              </button>
              <button
                type="button"
                className={`v2-channel-btn card ${type === "card" ? "active" : ""}`}
                onClick={() => {
                  setType("card");
                  if (channel === "Kassa") setChannel(channelList.find((c) => c !== "Kassa") || "Kapital Bank");
                }}
              >
                <CreditCard size={15} />
                <span>💳 Kart Hesabı</span>
              </button>
            </div>
          </div>

          <label>
            <span>Məsul Şəxs (Hesab Sahibi)</span>
            {!isNewPerson ? (
              <div style={{ display: "flex", gap: "6px" }}>
                <select value={person} onChange={(e) => setPerson(e.target.value)} style={{ flex: 1 }}>
                  {[...new Set([...(account?.person ? [account.person] : []), ...peopleList])].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ whiteSpace: "nowrap", padding: "0 10px", fontSize: "12px" }}
                  hidden={Boolean(bankDirectory)} onClick={() => setIsNewPerson(true)}
                  title="Yeni şəxs yaz"
                >
                  <Plus size={14} /> Yeni
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  autoFocus
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  placeholder="Şəxsin adını yazın..."
                  required
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="secondary-button"
                  style={{ padding: "0 10px", fontSize: "12px" }}
                  onClick={() => {
                    setIsNewPerson(false);
                    setNewPersonName("");
                  }}
                  title="Siyahıdan seç"
                >
                  Geri
                </button>
              </div>
            )}
          </label>

          {type !== "cash" ? (
            <label>
              <span>{type === "card" ? "Kartın bankı / ödəniş xidməti" : "Bank"}</span>
              {!isNewChannel ? (
                <div style={{ display: "flex", gap: "6px" }}>
                  <select required value={bankOptions.includes(channel) ? channel : ""} onChange={(e) => setChannel(e.target.value)} style={{ flex: 1 }}>
                    <option value="">Bank seçin</option>
                    {bankOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ whiteSpace: "nowrap", padding: "0 10px", fontSize: "12px" }}
                    hidden={Boolean(bankDirectory)}
                    onClick={() => setIsNewChannel(true)}
                    title="Yeni bank yaz"
                  >
                    <Plus size={14} /> Yeni
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    autoFocus
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="Banka adını yazın..."
                    required
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ padding: "0 10px", fontSize: "12px" }}
                    onClick={() => {
                      setIsNewChannel(false);
                      setNewChannelName("");
                    }}
                    title="Siyahıdan seç"
                  >
                    Geri
                  </button>
                </div>
              )}
            </label>
          ) : (
            <label>
              <span>Kanal</span>
              <input value="Kassa (Nağd pul)" disabled style={{ opacity: 0.8 }} />
            </label>
          )}

          <label>
            <span>Hesab Adı / Təsviri</span>
            <input
              value={accountTitle}
              onChange={(e) => setAccountTitle(e.target.value)}
              placeholder={defaultTitlePlaceholder}
            />
            <small style={{ color: "var(--arix-muted, #64748b)", fontSize: "11px", marginTop: "3px", display: "block" }}>
              Standart: <b>{defaultTitlePlaceholder}</b> (istəsəniz fərqli ad yaza bilərsiniz)
            </small>
          </label>

          <label>
            <span>Valyuta</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="AZN">AZN (₼)</option>
              <option value="USD">USD ($)</option>
              <option value="TRY">TRY (₺)</option>
            </select>
          </label>

          <label className="full">
            <span>Başlanğıc Qalıq (Açılış balansı)</span>
            <div className="amount-field">
              <input
                inputMode="decimal"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder="0,00"
              />
              <b>{currency}</b>
            </div>
          </label>

          <div className="full">
            <label><span>Hesab loqosu</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={logoLoading} onChange={(event) => void readLogo(event.target.files?.[0])} /></label>
            {logo && <button type="button" className="secondary-button" disabled={logoLoading} onClick={() => setLogo("")}>Loqonu sil</button>}
            {logoError && <p role="alert">{logoError}</p>}
            {!isNew && <label><span>Hesabın vəziyyəti</span><select value={archived ? "archived" : "active"} onChange={(event) => setArchived(event.target.value === "archived")}><option value="active">Aktiv</option><option value="archived">Arxivdə</option></select></label>}
          </div>
          <div className="full">
            <span className="field-label" style={{ fontSize: "12px", fontWeight: 600, color: "var(--arix-muted, #64748b)" }}>
              Canlı Önizləmə (Sistemdə görünüşü):
            </span>
            <div className="mgmt-preview-card">
              <div className="mgmt-preview-left">
                {(logo || bankDirectory?.logos[bankDirectoryKey(effectiveChannel)]) ? <img src={logo || bankDirectory?.logos[bankDirectoryKey(effectiveChannel)]} width={28} height={28} style={{ objectFit: "contain" }} alt="" /> : <BankLogo bank={effectiveChannel} size={28} />}
                <div className="mgmt-preview-info">
                  <b>{displayTitle}</b>
                  <span>{effectiveChannel} ({type === "cash" ? "Nağd Kassa" : type === "bank" ? "Rəsmi Bank Hesabı" : "Kart Hesabı"})</span>
                </div>
              </div>
              <div className="mgmt-preview-balance">
                İlkin: {parseFloat(opening.replace(",", ".")) || 0} {currency}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: "16px" }}>
          <button type="button" className="secondary-button" onClick={onClose}>İmtina</button>
          <button type="submit" className="primary-button">
            <Save size={16} />
            <span>Yadda saxla</span>
          </button>
        </div>
      </form>
    </div>
  );
}

type SharedReportMonth = { value: string; set: React.Dispatch<React.SetStateAction<string>> };

function AccountsView({
  sharedMonth,
  state,
  accounts,
  balanceAt,
  cardLimitSettings,
  canManageLimits,
  onSaveCardLimitSettings,
  customAccounts = [],
  bankDirectory,
  onSaveAccount,
  onDeleteAccount,
  peopleList = [],
  setPeopleList,
  channelList = [],
  setChannelList,
  initialSubTab = "cards",
  isSparexpert = false,
  contextAccountEdit,
  onContextAccountEditHandled,
}: {
  sharedMonth?: SharedReportMonth;
  isSparexpert?: boolean;
  state: DailyState;
  accounts: Account[];
  balanceAt: (account: Account, endDate: string, beforeDay?: boolean) => number;
  cardLimitSettings: CardLimitSettings;
  canManageLimits: boolean;
  onSaveCardLimitSettings: (settings: CardLimitSettings) => void;
  customAccounts?: Account[];
  bankDirectory?: { names: string[]; logos: BankDirectory; setNames: React.Dispatch<React.SetStateAction<string[]>>; setLogos: React.Dispatch<React.SetStateAction<BankDirectory>> };
  onSaveAccount?: (account: Account, newPerson?: string, newChannel?: string) => void;
  onDeleteAccount?: (accountId: string) => void;
  peopleList?: string[];
  setPeopleList?: React.Dispatch<React.SetStateAction<string[]>>;
  channelList?: string[];
  setChannelList?: React.Dispatch<React.SetStateAction<string[]>>;
  initialSubTab?: "cards" | "movements" | "management";
  contextAccountEdit?: Account | null;
  onContextAccountEditHandled?: () => void;
}) {
  const [subTab, setSubTab] = useState<"cards" | "movements" | "management">(initialSubTab);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | undefined>(undefined);
  const [newAccountType, setNewAccountType] = useState<"bank" | "card">("bank");
  const [mgmtSection, setMgmtSection] = useState<"accounts" | "banks" | "people">("accounts");
  const [mgmtTypeFilter, setMgmtTypeFilter] = useState<"all" | "cash" | "bank" | "card">("all");
  const [mgmtSearchQuery, setMgmtSearchQuery] = useState("");
  const [newBankDraft, setNewBankDraft] = useState("");
  const [newPersonDraft, setNewPersonDraft] = useState("");
  const [selectedPersonCardDetails, setSelectedPersonCardDetails] = useState<string | null>(null);
  useEffect(() => {
    if (!contextAccountEdit) return;
    setSubTab("management");
    setEditingAccount(contextAccountEdit);
    setNewAccountType(contextAccountEdit.type === "card" ? "card" : "bank");
    setAccountModalOpen(true);
    onContextAccountEditHandled?.();
  }, [contextAccountEdit, onContextAccountEditHandled]);
  const [selectedBank, setSelectedBank] = useState<string>("Kapital Bank");
  const baseCardReport = useMemo(() => {
    if (!isSparexpert) {
      const groups: CardReportGroup[] = IMPORTED_CARD_REPORT.map((group) => ({
        ...group,
        rows: group.rows.map((row) => ({ ...row })),
      }));

      // Azart's original report is imported from the sheet.  Cards added later
      // must join that report without changing the imported historical rows.
      for (const account of accounts) {
        if (account.type !== "card" || account.archived || !account.channel?.trim()) continue;
        const channel = account.channel.trim();
        const person = normalizePersonName(account.person || account.name);
        let group = groups.find((item) => normalizeBankKey(item.bank) === normalizeBankKey(channel));
        if (!group) {
          group = { bank: channel, code: channel, totalBalance: 0, rows: [] };
          groups.push(group);
        }
        const row = group.rows.find((item) => normalizePersonName(item.person) === person);
        if (row) {
          row.opening += account.opening || 0;
          row.balance += account.opening || 0;
          continue;
        }
        group.rows.push({
          person,
          opening: account.opening || 0,
          ...emptyCardActivity(),
          balance: account.opening || 0,
          status: "",
          monthlyLimit: 0,
          limitRemaining: 0,
        });
      }
      return groups;
    }
    const groups: { bank: string; code: string; totalBalance: number; rows: Array<(typeof SPAREXPERT_CARD_REPORT)[number]["rows"][number]> }[] = SPAREXPERT_CARD_REPORT.filter((report) => !isCashLimitChannel(report.bank)).map((group) => ({ ...group, rows: [...group.rows] }));
    const add = (bank: string, person: string) => {
      if (!bank || !person || isCashLimitChannel(bank) || /^(kart|biznes kart)$/i.test(bank)) return;
      let group = groups.find((item) => spareBankKey(item.bank) === spareBankKey(bank));
      if (!group) {
        group = { bank, code: bank, totalBalance: 0, rows: [] };
        groups.push(group);
      }
      if (!group.rows.some((row) => investorKey(row.person) === investorKey(person))) {
        group.rows.push({ person, opening: 0, ...emptyCardActivity(), balance: 0, status: "", monthlyLimit: 0, limitRemaining: 0 });
      }
    };
    for (const account of accounts) if (account.type === "card") add(account.channel || "", account.person || "");
    return groups;
  }, [accounts, isSparexpert]);
  const currentMonth = monthKey(todayKey);
  const firstCardMonth = isSparexpert
    ? SPAREXPERT_FIRST_MONTH
    : IMPORTED_CARD_REPORT_MONTH === "0000-00"
    ? currentMonth
    : IMPORTED_CARD_REPORT_MONTH;
  const [localCardMonth, setLocalCardMonth] = useState(() => currentMonth < firstCardMonth ? firstCardMonth : currentMonth);
  const cardMonth = sharedMonth?.value ?? localCardMonth;
  const setCardMonth = sharedMonth?.set ?? setLocalCardMonth;
  const [showInactiveCards, setShowInactiveCards] = useState(false);
  const [cardQuery, setCardQuery] = useState("");
  const [limitSettingsOpen, setLimitSettingsOpen] = useState(false);
  const visibleAccounts = useMemo(() => accounts.filter((item) => !isPlaceholderCard(item.name)), [accounts]);
  const [selected, setSelected] = useState(visibleAccounts[0]?.id ?? accounts[0].id);
  const account = accounts.find((item) => item.id === selected) ?? accounts[0];
  const movements = state.entries.filter((entry) => (!sharedMonth || monthKey(entry.date) === cardMonth) &&
    (entry.accountId === selected || entry.targetAccountId === selected)).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  const accountBalanceDate = sharedMonth && cardMonth < currentMonth ? shiftDate(`${shiftMonth(cardMonth, 1)}-01`, -1) : todayKey;
  const spareCardIds = useMemo(() => new Set(accounts.flatMap((account) => account.type === "card" ? [account.id, account.name] : [])), [accounts]);
  const spareMonthlyCardMovements = useMemo(() => {
    const byBank = new Map<string, Array<{ entry: Entry; person: string; side: "source" | "target" }>>();
    if (!isSparexpert) return byBank;
    for (const entry of state.entries) {
      if (monthKey(entry.date) !== cardMonth) continue;
      const add = (side: "source" | "target", id?: string, bank?: string, owner?: string) => {
        if (!id || !bank || (!spareCardIds.has(id) && !/^K\./i.test(id))) return;
        const key = spareBankKey(bank);
        const rows = byBank.get(key) ?? [];
        rows.push({ entry, side, person: normalizePersonName(owner || id) });
        byBank.set(key, rows);
      };
      add("source", entry.accountId, entry.bank, entry.responsible);
      if (entry.kind === "transfer") add("target", entry.targetAccountId, entry.targetBank, entry.targetResponsible);
    }
    return byBank;
  }, [cardMonth, isSparexpert, spareCardIds, state.entries]);
  const formatAccountDisplay = (item: Account) => {
    if (item.person && item.channel) return `${item.person} · ${item.channel}`;
    return getCleanAccountTitle(item);
  };

  const dynamicBankReports = useMemo(() => {
    const manualEntries = state.entries.filter((entry) => !entry.id.startsWith("sheet-"));
    const emptyActivity = emptyCardActivity;
    const applyEntry = (
      activity: ReturnType<typeof emptyActivity>,
      entry: Entry,
      personNorm: string,
      bankNorm: string
    ) => {
      const amount = Math.abs(entry.amount);
      const sourcePerson = normalizePersonName(entry.responsible).toLocaleLowerCase("az-AZ");
      const sourceBank = (entry.bank ?? "").toLocaleLowerCase("az-AZ");
      const targetPerson = normalizePersonName(entry.targetResponsible).toLocaleLowerCase("az-AZ");
      const targetBank = (entry.targetBank ?? "").toLocaleLowerCase("az-AZ");
      if (isSparexpert) {
        if ((spareCardIds.has(entry.accountId) || /^K\./i.test(entry.accountId)) && sourcePerson === personNorm && spareBankKey(entry.bank) === bankNorm) {
          addSpareCardActivity(activity, entry, "source");
        }
        if (entry.kind === "transfer" && entry.targetAccountId && (spareCardIds.has(entry.targetAccountId) || /^K\./i.test(entry.targetAccountId)) &&
            targetPerson === personNorm && spareBankKey(entry.targetBank) === bankNorm) {
          addSpareCardActivity(activity, entry, "target");
        }
        return;
      }

      if (entry.kind === "income" && sourcePerson === personNorm && sourceBank === bankNorm) {
        activity.income += amount;
      } else if (entry.kind === "expense" && sourcePerson === personNorm && sourceBank === bankNorm) {
        if (entry.expenseMethod === "cash_out") {
          activity.cashOut -= amount;
        } else if (entry.expenseMethod === "diff_bank") {
          activity.diffBankTransfer -= amount;
        } else if (entry.expenseMethod === "same_bank") {
          activity.sameBankTransfer -= amount;
        } else {
          activity.onlinePayment -= amount;
        }
      } else if (entry.kind === "transfer") {
        if (sourcePerson === personNorm && sourceBank === bankNorm) {
          if (targetBank === "kassa") activity.cashOut -= amount;
          else if (targetBank === bankNorm) activity.sameBankTransfer -= amount;
          else activity.diffBankTransfer -= amount;
        }
        if (targetPerson === personNorm && targetBank === bankNorm) activity.income += amount;
      }
    };
    const activityDelta = (activity: ReturnType<typeof emptyActivity>) =>
      activity.income + activity.onlinePayment + activity.sameBankTransfer + activity.diffBankTransfer + activity.cashOut;

    return baseCardReport.map((bankGroup) => {
      const bankNorm = isSparexpert ? spareBankKey(bankGroup.bank) : bankGroup.bank.toLocaleLowerCase("az-AZ");
      const bankLimitSettings = cardLimitSettings[bankGroup.bank] || {
        rules: DEFAULT_CARD_LIMIT_RULES,
        limits: {},
        statuses: {},
      };
      const rows = bankGroup.rows.map((baseRow) => {
        const personNorm = normalizePersonName(baseRow.person).toLocaleLowerCase("az-AZ");
        let opening = isSparexpert ? spareCardOpening(baseRow.person, bankGroup.bank)
          : cardMonth === firstCardMonth ? baseRow.opening : baseRow.balance;
        if (isSparexpert) {
          for (const account of accounts) {
            if (account.type === "card" && account.id.startsWith("acc_") && account.person &&
              investorKey(account.person) === investorKey(baseRow.person) &&
              spareBankKey(account.channel) === bankNorm) opening += account.opening;
          }
        }
        const activity = !isSparexpert && cardMonth === firstCardMonth
          ? {
              income: baseRow.income,
              onlinePayment: baseRow.onlinePayment,
              sameBankTransfer: baseRow.sameBankTransfer,
              diffBankTransfer: baseRow.diffBankTransfer,
              cashOut: baseRow.cashOut,
            }
          : emptyActivity();

        for (const entry of manualEntries) {
          const entryMonth = monthKey(entry.date);
          if (entryMonth < firstCardMonth || entryMonth > cardMonth) continue;
          if (entryMonth === cardMonth) {
            applyEntry(activity, entry, personNorm, bankNorm);
          } else {
            const priorActivity = emptyActivity();
            applyEntry(priorActivity, entry, personNorm, bankNorm);
            opening += activityDelta(priorActivity);
          }
        }
        const balance = Math.round((opening + activityDelta(activity)) * 100) / 100;
        const monthlyLimit = Math.max(0, Number(bankLimitSettings.limits[baseRow.person] ?? baseRow.monthlyLimit ?? 0));
        const limitValues: Record<CardLimitRuleKey, number> = { opening, ...activity };
        // Each bank has its own volume rules.  Selected outgoing movement types
        // count only when they are explicitly enabled for that bank.
        const limitUsage = (bankLimitSettings.rules.opening ? Math.abs(limitValues.opening) : 0)
          + CARD_LIMIT_RULE_OPTIONS.reduce(
            (sum, item) => sum + (bankLimitSettings.rules[item.key] ? Math.abs(limitValues[item.key]) : 0),
            0
          );
        const limitRemaining = monthlyLimit > 0
          ? Math.round((monthlyLimit - limitUsage) * 100) / 100
          : 0;
        return {
          ...baseRow,
          status: bankLimitSettings.statuses[baseRow.person] ?? baseRow.status ?? "",
          monthlyLimit,
          opening,
          ...activity,
          balance,
          limitRemaining,
        };
      });
      const reportRows = isSparexpert ? rows.filter((row) =>
        !isPlaceholderCard(row.person) || [row.opening, row.income, row.onlinePayment,
          row.sameBankTransfer, row.diffBankTransfer, row.cashOut, row.balance].some((amount) => Math.round(amount * 100) !== 0)
      ) : rows;
      const totalBalance = reportRows.reduce((sum, r) => sum + r.balance, 0);
      return { ...bankGroup, totalBalance, rows: reportRows };
    });
  }, [accounts, spareCardIds, baseCardReport, cardLimitSettings, cardMonth, firstCardMonth, isSparexpert, state.entries]);

  const totalAllBanks = useMemo(
    () => dynamicBankReports.reduce((sum, bank) => sum + bank.totalBalance, 0),
    [dynamicBankReports]
  );
  const azartLimitDialogReports = useMemo(() => dynamicBankReports.map((bank) => ({
    bank: bank.bank,
    code: bank.code,
    rows: bank.rows.map((row) => ({ person: row.person, status: row.status || "" })),
  })), [dynamicBankReports]);
  const activeBankReport = useMemo(
    () => dynamicBankReports.find((item) => item.bank === selectedBank) ?? dynamicBankReports[0],
    [dynamicBankReports, selectedBank]
  );
  const selectedPersonCards = useMemo(() => {
    if (!selectedPersonCardDetails) return [];
    const personKey = normalizePersonName(selectedPersonCardDetails).toLocaleLowerCase("az-AZ");
    return dynamicBankReports.flatMap((bank) => bank.rows
      .filter((row) => normalizePersonName(row.person).toLocaleLowerCase("az-AZ") === personKey)
      .map((row) => ({ bank: bank.bank, row })));
  }, [dynamicBankReports, selectedPersonCardDetails]);
  const selectedCardMovements = spareMonthlyCardMovements.get(spareBankKey(activeBankReport.bank)) ?? [];
  const filteredCardRows = useMemo(() => {
    const q = cardQuery.trim().toLocaleLowerCase("az-AZ");
    // The source sheet keeps people in a meaningful order.  Keep that order
    // inside each status group, but always surface usable (active) cards first.
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
    }).map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const activeFirst = (a.row.status ? 1 : 0) - (b.row.status ? 1 : 0);
        return activeFirst || a.index - b.index;
      })
      .map(({ row }) => row);
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
          monthlyLimit: acc.monthlyLimit + row.monthlyLimit,
          limitRemaining: acc.limitRemaining + row.limitRemaining,
        }),
        { opening: 0, income: 0, onlinePayment: 0, sameBankTransfer: 0, diffBankTransfer: 0, cashOut: 0, balance: 0, monthlyLimit: 0, limitRemaining: 0 }
      ),
    [activeBankReport]
  );

  const filteredAccountsForMgmt = useMemo(() => {
    const q = mgmtSearchQuery.trim().toLowerCase();
    return accounts.filter((acc) => {
      if (mgmtTypeFilter !== "all" && acc.type !== mgmtTypeFilter) return false;
      if (!q) return true;
      const titleMatch = getCleanAccountTitle(acc).toLowerCase().includes(q);
      const idMatch = (acc.id || "").toLowerCase().includes(q);
      const nameMatch = (acc.name || "").toLowerCase().includes(q);
      const personMatch = (acc.person || "").toLowerCase().includes(q);
      const channelMatch = (acc.channel || "").toLowerCase().includes(q);
      return titleMatch || idMatch || nameMatch || personMatch || channelMatch;
    });
  }, [accounts, mgmtTypeFilter, mgmtSearchQuery]);

  const cashCount = useMemo(() => accounts.filter((a) => a.type === "cash").length, [accounts]);
  const bankCount = useMemo(() => accounts.filter((a) => a.type === "bank").length, [accounts]);
  const cardCount = useMemo(() => accounts.filter((a) => a.type === "card").length, [accounts]);

  return (
    <div className="accounts-view-shell">
      <section className="page-heading page-heading-split">
        <div>
          <span className="eyebrow">HESABLAR VƏ KART HESABATI</span>
          <h1>
            {subTab === "cards"
              ? "Banklar üzrə kart hesabatı"
              : subTab === "movements"
              ? "Şəxs və kanal üzrə hesab hərəkətləri"
              : "Hesab, Bank və Şəxs İdarəetmə Mərkəzi"}
          </h1>
          <p>
            {subTab === "cards"
              ? "Bütün 7 bank üzrə məsul şəxslərin kart balansları, mədaxil, onlayn ödəniş, köçürmə, nağdlaşdırma və limit qalıqları."
              : subTab === "movements"
              ? "Hər bir məsul şəxsin Kassa və Kart / Bank kanalları üzrə cari qalığı və əməliyyat tarixçəsi."
              : "Bütün Kassa, Rəsmi Bank və Kart hesablarını, yeni bankları, şəxsləri və ilkin qalıqları buradan təyin edin və idarə edin."}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div className="subview-switch" role="tablist">
            <button type="button" className={subTab === "cards" ? "active" : ""} onClick={() => setSubTab("cards")}>
              <CreditCard size={16} />
              <span>Kart Hesabatı (7 Bank)</span>
            </button>
            <button type="button" className={subTab === "movements" ? "active" : ""} onClick={() => setSubTab("movements")}>
              <WalletCards size={16} />
              <span>Hesab hərəkətləri</span>
            </button>
            <button type="button" className={subTab === "management" ? "active" : ""} onClick={() => setSubTab("management")}>
              <SlidersHorizontal size={16} />
              <span>Hesab və Bank İdarəetməsi</span>
            </button>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setEditingAccount(undefined);
              setNewAccountType("bank");
              setAccountModalOpen(true);
            }}
            style={{ gap: "6px" }}
          >
            <Plus size={16} />
            <span>Yeni Hesab Əlavə Et</span>
          </button>
          {!isSparexpert && <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setEditingAccount(undefined);
              setNewAccountType("card");
              setAccountModalOpen(true);
            }}
            style={{ gap: "6px" }}
          >
            <CreditCard size={16} />
            <span>Yeni kart əlavə et</span>
          </button>}
        </div>
      </section>

      {sharedMonth && subTab === "movements" && <nav className="spare-report-month" aria-label="Hesab hərəkətləri ayı">
        <button type="button" className="date-arrow" disabled={cardMonth <= firstCardMonth} onClick={() => setCardMonth((value) => shiftMonth(value, -1))} aria-label="Əvvəlki ay"><ChevronLeft size={16} /></button>
        <strong aria-live="polite">{monthLabel(cardMonth)}</strong>
        <button type="button" className="date-arrow" disabled={cardMonth >= currentMonth} onClick={() => setCardMonth((value) => shiftMonth(value, 1))} aria-label="Növbəti ay"><ChevronRight size={16} /></button>
      </nav>}
      {subTab === "cards" ? (
        <section className="card-report-shell">
          <div className="card-report-control-bar">
            <div className="card-month-switch" aria-label="Kart hesabatı ayı">
              <button type="button" onClick={() => setCardMonth((value) => shiftMonth(value, -1))} disabled={cardMonth <= firstCardMonth} aria-label="Əvvəlki ay"><ChevronLeft size={16} /></button>
              <span><CalendarDays size={15} /><b>{monthLabel(cardMonth)}</b></span>
              <button type="button" onClick={() => setCardMonth((value) => shiftMonth(value, 1))} disabled={cardMonth >= currentMonth} aria-label="Növbəti ay"><ChevronRight size={16} /></button>
            </div>
            {canManageLimits && <button type="button" className="secondary-button card-limit-settings-trigger" onClick={() => setLimitSettingsOpen(true)}><Settings size={16} />Limitləri idarə et</button>}
          </div>
          <div className="bank-tabs-grid">
            {dynamicBankReports.map((bank) => (
              <button
                key={bank.bank}
                type="button"
                className={cx("bank-tab-card", selectedBank === bank.bank && "active")}
                onClick={() => setSelectedBank(bank.bank)}
              >
                <div className="bank-tab-top">
                  <span className="bank-code-badge">
                    <BankLogo bank={bank.bank} size={24} />
                  </span>
                  <small>{bank.rows.filter((r) => r.balance !== 0 || r.income !== 0).length} aktiv</small>
                </div>
                <b>{bank.bank}</b>
                <strong>{formatMoney(bank.totalBalance, "AZN")}</strong>
              </button>
            ))}
            <div className="bank-tab-card total-card">
              <div className="bank-tab-top">
                <span className="bank-code-badge">
                  <BankLogo bank="total" size={24} />
                </span>
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
                  <BankLogo bank={activeBankReport.bank} size={24} />
                  <h2>{activeBankReport.bank} — Kart Hesabatı</h2>
                  <em>{filteredCardRows.length} / {activeBankReport.rows.length} kart</em>
                  {isSparexpert && <em>{selectedCardMovements.length} hərəkət</em>}
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
                  {showInactiveCards ? "Yalnız aktivləri göstər" : "Bütün sətirlər"}
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
                    <th className="num">Aylıq limit</th>
                    <th className="num" title="Seçilən bank qaydalarına əsasən aylıq limit qalığı">Limit qalığı</th>
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
                    <td className="num">{formatMoney(cardTotals.monthlyLimit, "AZN")}</td>
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
                      <td className="num">{formatMoney(row.monthlyLimit, "AZN")}</td>
                      <td className={cx("num", row.limitRemaining < 0 && "expense")} title={`Aylıq limit: ${formatMoney(row.monthlyLimit, "AZN")}`}>{formatMoney(row.limitRemaining, "AZN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isSparexpert && <details key={`${cardMonth}:${activeBankReport.bank}`} className="pivot-card spare-party-detail">
              <summary><span>Ayın kart hərəkətləri</span><strong>{selectedCardMovements.length} hərəkət</strong></summary>
              <div className="pivot-list pivot-list-scroll">
                {selectedCardMovements.length === 0 && <article><span>Bu bankın kartlarında seçilən ay üçün hərəkət yoxdur.</span></article>}
                {[...selectedCardMovements].sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.entry.time.localeCompare(a.entry.time)).map(({ entry, person, side }) => {
                  const incoming = side === "target" || entry.kind === "income";
                  return <article key={`${entry.id}:${side}`}>
                    <span>{dateLabel(entry.date, { day: "numeric", month: "short" })} · {person} · {entry.category}</span>
                    <strong className={incoming ? "income" : "expense"}>{incoming ? "+" : "−"}{formatMoney(Math.abs(entry.amount), "AZN")}</strong>
                  </article>;
                })}
              </div>
            </details>}
          </div>
        </section>
      ) : subTab === "movements" ? (
        <div className="accounts-layout">
          <section className="accounts-overview">
            {visibleAccounts.map((item) => {
              const isCard = /^K\./i.test(item.name) || item.type === "card";
              const Icon = isCard ? CreditCard : accountIcon(item);
              return (
                <button key={item.id} className={selected === item.id ? "selected" : ""} onClick={() => setSelected(item.id)}>
                  <span className={`account-icon ${isCard ? "card" : item.type}`}><Icon size={20} /></span>
                  <span><small>{formatAccountDisplay(item)}</small><b>{formatMoney(balanceAt(item, accountBalanceDate), item.currency)}</b></span>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </section>
          <section className="account-detail">
            <div className="account-detail-heading">
              <span><small>CARİ QALIQ</small><h2>{formatAccountDisplay(account)}</h2></span>
              <b>{formatMoney(balanceAt(account, accountBalanceDate), account.currency)}</b>
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
      ) : null}
      {subTab === "management" && (
        <section className="mgmt-hub-shell">
          <div className="mgmt-stats-grid">
            <div className="mgmt-stat-card">
              <div className="mgmt-stat-icon cash">
                <Banknote size={22} />
              </div>
              <div className="mgmt-stat-info">
                <span>Kassa Hesabları</span>
                <strong>{cashCount}</strong>
              </div>
            </div>
            <div className="mgmt-stat-card">
              <div className="mgmt-stat-icon bank">
                <Landmark size={22} />
              </div>
              <div className="mgmt-stat-info">
                <span>Rəsmi Banklar</span>
                <strong>{bankCount}</strong>
              </div>
            </div>
            <div className="mgmt-stat-card">
              <div className="mgmt-stat-icon card">
                <CreditCard size={22} />
              </div>
              <div className="mgmt-stat-info">
                <span>Kart Hesabları</span>
                <strong>{cardCount}</strong>
              </div>
            </div>
            <div className="mgmt-stat-card">
              <div className="mgmt-stat-icon banks">
                <Globe2 size={22} />
              </div>
              <div className="mgmt-stat-info">
                <span>Bank Şəbəkələri</span>
                <strong>{channelList.length}</strong>
              </div>
            </div>
            <div className="mgmt-stat-card">
              <div className="mgmt-stat-icon people">
                <Users size={22} />
              </div>
              <div className="mgmt-stat-info">
                <span>Məsul Şəxslər</span>
                <strong>{peopleList.length}</strong>
              </div>
            </div>
          </div>

          <div className="mgmt-controls-bar">
            <div className="mgmt-sub-nav">
              <button
                type="button"
                className={`mgmt-sub-nav-btn ${mgmtSection === "accounts" ? "active" : ""}`}
                onClick={() => setMgmtSection("accounts")}
              >
                <WalletCards size={15} />
                <span>Hesablar Kataloqu ({accounts.length})</span>
              </button>
              <button
                type="button"
                className={`mgmt-sub-nav-btn ${mgmtSection === "banks" ? "active" : ""}`}
                onClick={() => setMgmtSection("banks")}
              >
                <Landmark size={15} />
                <span>Banklar və Kanallar ({channelList.length})</span>
              </button>
              <button
                type="button"
                className={`mgmt-sub-nav-btn ${mgmtSection === "people" ? "active" : ""}`}
                onClick={() => setMgmtSection("people")}
              >
                <Users size={15} />
                <span>Şəxslər ({peopleList.length})</span>
              </button>
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setEditingAccount(undefined);
                setNewAccountType("bank");
                setAccountModalOpen(true);
              }}
              style={{ gap: "6px" }}
            >
              <Plus size={16} />
              <span>Yeni Hesab Əlavə Et</span>
            </button>
          </div>

          {mgmtSection === "accounts" && (
            <>
              <div className="mgmt-controls-bar" style={{ padding: "8px 14px" }}>
                <div className="mgmt-filters-group">
                  <button
                    type="button"
                    className={`mgmt-filter-btn ${mgmtTypeFilter === "all" ? "active" : ""}`}
                    onClick={() => setMgmtTypeFilter("all")}
                  >
                    Bütün Hesablar ({accounts.length})
                  </button>
                  <button
                    type="button"
                    className={`mgmt-filter-btn ${mgmtTypeFilter === "cash" ? "active" : ""}`}
                    onClick={() => setMgmtTypeFilter("cash")}
                  >
                    💵 Kassa ({cashCount})
                  </button>
                  <button
                    type="button"
                    className={`mgmt-filter-btn ${mgmtTypeFilter === "bank" ? "active" : ""}`}
                    onClick={() => setMgmtTypeFilter("bank")}
                  >
                    🏦 Rəsmi Bank ({bankCount})
                  </button>
                  <button
                    type="button"
                    className={`mgmt-filter-btn ${mgmtTypeFilter === "card" ? "active" : ""}`}
                    onClick={() => setMgmtTypeFilter("card")}
                  >
                    💳 Kartlar ({cardCount})
                  </button>
                </div>

                <label className="search-box" style={{ maxWidth: "280px" }}>
                  <Search size={16} />
                  <input
                    value={mgmtSearchQuery}
                    onChange={(e) => setMgmtSearchQuery(e.target.value)}
                    placeholder="Hesab, şəxs və ya bank axtar..."
                  />
                </label>
              </div>

              <div className="mgmt-table-wrap">
                <table className="mgmt-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>#</th>
                      <th>Hesab Adı</th>
                      <th>Növü</th>
                      <th>Bank / Kanal</th>
                      <th>Məsul Şəxs</th>
                      <th>Valyuta</th>
                      <th style={{ textAlign: "right" }}>İlkin Balans</th>
                      <th style={{ textAlign: "right" }}>Cari Balans</th>
                      <th style={{ textAlign: "center", width: "120px" }}>Əməliyyatlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccountsForMgmt.map((acc, idx) => {
                      const isCustom = customAccounts.some((c) => c.id === acc.id);
                      const currentBal = balanceAt(acc, todayKey);
                      const cleanTitle = getCleanAccountTitle(acc);
                      return (
                        <tr key={acc.id} data-daily-account-id={acc.id}>
                          <td style={{ color: "var(--arix-muted, #64748b)" }}>{idx + 1}</td>
                          <td>
                            <strong style={{ fontWeight: 700 }}>{cleanTitle}</strong>
                            {isCustom && (
                              <span style={{ marginLeft: "6px", fontSize: "10.5px", background: "#fef3c7", color: "#b45309", padding: "2px 6px", borderRadius: "4px" }}>
                                Xüsusi
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`mgmt-type-badge ${acc.type}`}>
                              {acc.type === "cash" ? "💵 Kassa" : acc.type === "bank" ? "🏦 Rəsmi Bank" : "💳 Kart"}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                              {(acc.logo || bankDirectory?.logos[bankDirectoryKey(acc.channel || "")]) ? <img src={acc.logo || bankDirectory?.logos[bankDirectoryKey(acc.channel || "")]} width={18} height={18} style={{ objectFit: "contain" }} alt="" /> : <BankLogo bank={acc.channel || (acc.type === "cash" ? "Kassa" : "Kapital Bank")} size={18} />}{acc.archived && <small>Arxivdə</small>}
                              <span>{acc.channel || (acc.type === "cash" ? "Kassa" : "—")}</span>
                            </div>
                          </td>
                          <td>
                            <b>{acc.person || normalizePersonName(acc.name)}</b>
                          </td>
                          <td>{acc.currency}</td>
                          <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                            {formatMoney(acc.opening, acc.currency)}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: currentBal < 0 ? "#ef4444" : "#059669" }}>
                            {formatMoney(currentBal, acc.currency)}
                          </td>
                          <td>
                            <div className="mgmt-actions-cell" style={{ justifyContent: "center" }}>
                              <button
                                type="button"
                                className="mgmt-action-btn"
                                onClick={() => {
                                  setEditingAccount(acc);
                                  setAccountModalOpen(true);
                                }}
                                title="Düzəliş et"
                              >
                                <Pencil size={13} />
                                <span>Düzəlt</span>
                              </button>
                              {isCustom && onDeleteAccount && (
                                <button
                                  type="button"
                                  className="mgmt-action-btn delete"
                                  onClick={() => {
                                    if (confirm(`"${cleanTitle}" hesabını silmək istədiyinizə əminsiniz?`)) {
                                      onDeleteAccount(acc.id);
                                    }
                                  }}
                                  title="Sil"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {mgmtSection === "banks" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="mgmt-controls-bar">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = newBankDraft.trim();
                    if (trimmed && bankDirectory && ![...STANDARD_BANKS, ...bankDirectory.names].some((name) => bankDirectoryKey(name) === bankDirectoryKey(trimmed))) {
                      bankDirectory.setNames((cur) => [...cur, trimmed]);
                      setNewBankDraft("");
                    } else if (trimmed && !bankDirectory && setChannelList && !channelList.includes(trimmed)) {
                      setChannelList((cur) => [...cur, trimmed]);
                      setNewBankDraft("");
                    }
                  }}
                  style={{ display: "flex", gap: "8px", width: "100%", maxWidth: "450px" }}
                >
                  <input
                    value={newBankDraft}
                    onChange={(e) => setNewBankDraft(e.target.value)}
                    placeholder="Yeni bank və ya ödəniş kanalı adı (məs: Yelo Bank)..."
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="primary-button" style={{ whiteSpace: "nowrap" }}>
                    <Plus size={16} /> Əlavə et
                  </button>
                </form>
                <small style={{ color: "var(--arix-muted, #64748b)" }}>
                  💡 Əlavə etdiyiniz banklar əməliyyat pəncərəsində düymə şəklində görünəcək.
                </small>
              </div>

              <div className="mgmt-card-grid">
                {(bankDirectory ? [...STANDARD_BANKS, ...bankDirectory.names] : channelList).map((ch) => {
                  const accCount = accounts.filter((a) => (a.channel || "").toLowerCase() === ch.toLowerCase()).length;
                  return (
                    <div key={ch} className="mgmt-channel-card">
                      <div className="mgmt-channel-left">
                        {bankDirectory?.logos[bankDirectoryKey(ch)] ? <img src={bankDirectory.logos[bankDirectoryKey(ch)]} width={28} height={28} style={{ objectFit: "contain" }} alt="" /> : <BankLogo bank={ch} size={28} />}
                        <div>
                          <div>{ch}</div>
                          <small>{accCount} hesab bağlıdır</small>
                        </div>
                      </div>
                      {bankDirectory && <div>
                        <label>Bank loqosu<input aria-label={ch + " loqosu"} type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          try {
                            const logo = await encodeBankLogo(file);
                            bankDirectory.setLogos((cur) => ({ ...cur, [bankDirectoryKey(ch)]: logo }));
                          } catch (error) { window.alert(error instanceof Error ? error.message : "Şəkli açmaq olmadı."); }
                        }} /></label>
                        {bankDirectory.logos[bankDirectoryKey(ch)] && <button type="button" className="secondary-button" onClick={() => bankDirectory.setLogos((cur) => ({ ...cur, [bankDirectoryKey(ch)]: "" }))}>Loqonu sil</button>}
                      </div>}
                      {bankDirectory?.names.includes(ch) && !accCount && <button type="button" className="mgmt-action-btn delete" onClick={() => bankDirectory.setNames((cur) => cur.filter((name) => name !== ch))}>Sil</button>}
                      {!bankDirectory && setChannelList && ch.toLowerCase() !== "kassa" && (
                        <button
                          type="button"
                          className="mgmt-action-btn delete"
                          onClick={(event) => {
                            if (confirm(`"${ch}" kanalını siyahıdan silmək istəyirsiniz?`)) {
                              setChannelList((cur) => cur.filter((item) => item !== ch));
                            }
                          }}
                          title="Sil"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {mgmtSection === "people" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="mgmt-controls-bar">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = newPersonDraft.trim();
                    if (trimmed && setPeopleList && !peopleList.includes(trimmed)) {
                      setPeopleList((cur) => [...cur, trimmed]);
                      setNewPersonDraft("");
                    }
                  }}
                  style={{ display: "flex", gap: "8px", width: "100%", maxWidth: "450px" }}
                >
                  <input
                    value={newPersonDraft}
                    onChange={(e) => setNewPersonDraft(e.target.value)}
                    placeholder="Yeni məsul şəxs adı..."
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="primary-button" style={{ whiteSpace: "nowrap" }}>
                    <Plus size={16} /> Əlavə et
                  </button>
                </form>
                <small style={{ color: "var(--arix-muted, #64748b)" }}>
                  💡 Əlavə etdiyiniz şəxslər Kassa, Bank və Kart əməliyyatlarında məsul şəxs siyahısına düşəcək.
                </small>
              </div>

              <div className="mgmt-card-grid">
                {peopleList.map((p) => {
                  const accCount = accounts.filter((a) => (a.person || "").toLowerCase() === p.toLowerCase()).length;
                  // Imported card reports are historical card records, not
                  // editable account objects.  Show them separately so a
                  // person with seven November cards is never misleadingly
                  // presented as having “0 accounts”.
                  const reportCardCount = dynamicBankReports.reduce(
                    (sum, bank) => sum + bank.rows.filter((row) => normalizePersonName(row.person).toLowerCase() === normalizePersonName(p).toLowerCase()).length,
                    0,
                  );
                  return (
                    <div
                      key={p}
                      className={cx("mgmt-channel-card", reportCardCount > 0 && "mgmt-person-card")}
                      role={reportCardCount > 0 ? "button" : undefined}
                      tabIndex={reportCardCount > 0 ? 0 : undefined}
                      onClick={() => { if (reportCardCount > 0) setSelectedPersonCardDetails(p); }}
                      onKeyDown={(event) => {
                        if (reportCardCount > 0 && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          setSelectedPersonCardDetails(p);
                        }
                      }}
                    >
                      <div className="mgmt-channel-left">
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#4f46e5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700 }}>
                          {p.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div>{p}</div>
                          <small>{reportCardCount > 0 ? `${reportCardCount} kart qeydi${accCount ? ` · ${accCount} idarə olunan hesab` : ""}` : accCount ? `${accCount} hesab bağlıdır` : "Hesab və kart qeydi yoxdur"}</small>
                        </div>
                      </div>
                      {setPeopleList && (!isSparexpert || !(accCount || reportCardCount)) && (
                        <button
                          type="button"
                          className="mgmt-action-btn delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (confirm(`"${p}" şəxsini siyahıdan silmək istəyirsiniz?`)) {
                              setPeopleList((cur) => cur.filter((item) => item !== p));
                            }
                          }}
                          title="Sil"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {accountModalOpen && (
        <AccountEditModal
          account={editingAccount}
          isNew={!editingAccount}
          initialType={newAccountType}
          peopleList={peopleList}
          channelList={channelList}
          bankDirectory={bankDirectory}
          onSave={(acc, newP, newCh) => {
            if (onSaveAccount) onSaveAccount(acc, newP, newCh);
            setAccountModalOpen(false);
          }}
          onClose={() => setAccountModalOpen(false)}
        />
      )}
      {selectedPersonCardDetails && (
        <div className="modal-backdrop person-card-detail-backdrop" role="presentation" onMouseDown={() => setSelectedPersonCardDetails(null)}>
          <section className="modal person-card-detail-modal" role="dialog" aria-modal="true" aria-label={`${selectedPersonCardDetails} kart qeydləri`} onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-heading">
              <div>
                <span>KART QEYDLƏRİ</span>
                <h2>{selectedPersonCardDetails}</h2>
                <p>{selectedPersonCards.length} bank üzrə kart statusu və noyabr hərəkət xülasəsi</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedPersonCardDetails(null)} aria-label="Bağla"><X size={19} /></button>
            </header>
            <div className="person-card-detail-list">
              {selectedPersonCards.map(({ bank, row }) => {
                const status = CARD_STATUS_OPTIONS.find((item) => item.value === row.status)?.label || "Aktiv";
                return <button key={`${bank}:${row.person}`} type="button" className="person-card-detail-row" onClick={() => { setSelectedBank(bank); setSubTab("cards"); setSelectedPersonCardDetails(null); }}>
                  <span className="person-card-bank"><BankLogo bank={bank} size={24} /><b>{bank}</b></span>
                  <span className={cx("card-status-pill", !row.status && "active")}>{status}</span>
                  <span><small>Cari balans</small><b>{formatMoney(row.balance, "AZN")}</b></span>
                  <span><small>Limit qalığı</small><b className={cx(row.limitRemaining < 0 && "expense")}>{formatMoney(row.limitRemaining, "AZN")}</b></span>
                  <ChevronRight size={17} />
                </button>;
              })}
            </div>
            <footer className="modal-actions"><small>Bir sətrə klikləyin: həmin bankın kart hesabatı açılacaq.</small><button type="button" className="secondary-button" onClick={() => setSelectedPersonCardDetails(null)}>Bağla</button></footer>
          </section>
        </div>
      )}
      {limitSettingsOpen && <CardLimitSettingsDialog isSparexpert={isSparexpert} reports={isSparexpert ? undefined : azartLimitDialogReports} settings={cardLimitSettings} initialBank={selectedBank} onClose={() => setLimitSettingsOpen(false)} onSave={(next) => { onSaveCardLimitSettings(next); setLimitSettingsOpen(false); }} />}
    </div>
  );
}

function CardLimitSettingsDialog({ settings, initialBank, onClose, onSave, isSparexpert = false, reports: providedReports }: {
  isSparexpert?: boolean;
  reports?: readonly { bank: string; code: string; rows: readonly { person: string; status: string }[] }[];
  settings: CardLimitSettings;
  initialBank: string;
  onClose: () => void;
  onSave: (settings: CardLimitSettings) => void;
}) {
  const reports = providedReports || (isSparexpert ? SPAREXPERT_CARD_REPORT.filter((report) => !isCashLimitChannel(report.bank)) : IMPORTED_CARD_REPORT) as readonly {
    bank: string;
    code: string;
    rows: readonly { person: string; status: string }[];
  }[];
  const [selectedBank, setSelectedBank] = useState(() => reports.some((item) => item.bank === initialBank) ? initialBank : reports[0]?.bank || "");
  const [draft, setDraft] = useState<CardLimitSettings>(() => normalizeCardLimitSettings(settings, isSparexpert));
  const [bulkLimit, setBulkLimit] = useState("");
  const report = reports.find((item) => item.bank === selectedBank) || reports[0];
  const bankSettings = draft[selectedBank] || { rules: { ...DEFAULT_CARD_LIMIT_RULES }, limits: {}, statuses: {} };

  const updateRule = (key: CardLimitRuleKey, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      [selectedBank]: {
        ...(current[selectedBank] || bankSettings),
        rules: { ...(current[selectedBank]?.rules || bankSettings.rules), [key]: checked },
      },
    }));
  };
  const updateLimit = (person: string, value: string) => {
    const parsed = Number(value.replace(",", "."));
    setDraft((current) => ({
      ...current,
      [selectedBank]: {
        ...(current[selectedBank] || bankSettings),
        limits: {
          ...(current[selectedBank]?.limits || bankSettings.limits),
          [person]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
        },
      },
    }));
  };
  const updateStatus = (person: string, value: string) => {
    const status: CardStatus = value === "🚫" || value === "🔒" || value === "❓" ? value : "";
    setDraft((current) => ({
      ...current,
      [selectedBank]: {
        ...(current[selectedBank] || bankSettings),
        statuses: {
          ...(current[selectedBank]?.statuses || bankSettings.statuses),
          [person]: status,
        },
      },
    }));
  };
  const applyBulkLimit = () => {
    const parsed = Number(bulkLimit.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0 || !report) return;
    setDraft((current) => ({
      ...current,
      [selectedBank]: {
        ...(current[selectedBank] || bankSettings),
        limits: {
          ...(current[selectedBank]?.limits || bankSettings.limits),
          ...Object.fromEntries(report.rows.map((row) => [row.person, parsed])),
        },
      },
    }));
  };

  return <div className="modal-backdrop card-limit-settings-backdrop">
    <form className="modal card-limit-settings-modal" onSubmit={(event) => { event.preventDefault(); onSave(normalizeCardLimitSettings(draft, isSparexpert)); }}>
      <header className="modal-heading">
        <div><span>AYLIQ KART LİMİTLƏRİ</span><h2>Bank limitlərini idarə et</h2><p>Hər bank üçün limit məbləğini və hansı hərəkətlərin limit qalığına təsir etdiyini ayrıca seçin.</p></div>
        <button type="button" className="icon-button" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="card-limit-bank-tabs" role="tablist">
        {reports.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={selectedBank === item.bank}
            className={selectedBank === item.bank ? "active" : ""}
            key={item.bank}
            onClick={() => { setSelectedBank(item.bank); setBulkLimit(""); }}
          >
            <i><BankLogo bank={item.bank} size={18} /></i>
            <span>{item.bank}</span>
          </button>
        ))}
      </div>
      <div className="card-limit-settings-body">
        <section className="card-limit-rules">
          <div className="card-limit-section-heading"><div><h3>{selectedBank} qaydaları</h3><p>Limit yalnız kartdan çıxan hərəkətlərlə hesablanır. Bu bankda limitə təsir edən çıxış növlərini ayrıca seçin.</p></div></div>
          <div className="card-limit-rule-list">
            {CARD_LIMIT_RULE_OPTIONS.map((item) => <label key={item.key}>
              <input type="checkbox" checked={Boolean(bankSettings.rules[item.key])} onChange={(event) => updateRule(item.key, event.target.checked)} />
              <span><b>{item.label}</b><small>{item.description}</small></span>
            </label>)}
          </div>
        </section>
        <section className="card-limit-people">
          <div className="card-limit-section-heading">
            <div><h3>Şəxs üzrə aylıq limit</h3><p>Yeni ay başlayanda məbləğ yenidən tam limit kimi açılır.</p></div>
            <div className="card-limit-bulk"><input inputMode="decimal" value={bulkLimit} onChange={(event) => setBulkLimit(event.target.value)} placeholder="Məs. 5000" /><button type="button" className="secondary-button" onClick={applyBulkLimit}>Hamısına tətbiq et</button></div>
          </div>
          <div className="card-limit-person-list">
            <div className="card-limit-person-head"><span>Şəxs</span><span>Kart statusu</span><span>Aylıq limit</span></div>
            {report?.rows.map((row) => <label key={row.person}>
              <b>{row.person}</b>
              <select value={bankSettings.statuses[row.person] ?? row.status ?? ""} onChange={(event) => updateStatus(row.person, event.target.value)} aria-label={`${row.person} kart statusu`}>
                {CARD_STATUS_OPTIONS.map((option) => <option key={option.value || "active"} value={option.value}>{option.label}</option>)}
              </select>
              <span><input inputMode="decimal" value={bankSettings.limits[row.person] || ""} onChange={(event) => updateLimit(row.person, event.target.value)} placeholder="0" /><i>₼</i></span>
            </label>)}
          </div>
        </section>
      </div>
      <footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>İmtina</button><button type="submit" className="primary-button"><Check size={16} />Qaydaları saxla</button></footer>
    </form>
  </div>;
}

function ReportsView({ state, accounts, parties, isSparexpert = false, sharedMonth }: { state: DailyState; accounts: Account[]; parties: string[]; isSparexpert?: boolean; sharedMonth?: SharedReportMonth }) {
  const [reportTab, setReportTab] = useState<"charts" | "pivots" | "customers" | "investors">("charts");
  const [selectedWeek, setSelectedWeek] = useState<string>(IMPORTED_WEEKLY_CHARTS[IMPORTED_WEEKLY_CHARTS.length - 1]?.week ?? "V Həftə");
  const [customerSearch, setCustomerSearch] = useState("");

  const currentReportMonth = monthKey(todayKey);
  const [localReportMonth, setLocalReportMonth] = useState(currentReportMonth);
  const reportMonth = sharedMonth?.value ?? localReportMonth;
  const setReportMonth = sharedMonth?.set ?? setLocalReportMonth;
  const [spareChartPeriod, setSpareChartPeriod] = useState<"days" | "weeks">("days");
  const showSpareWeeks = isSparexpert && spareChartPeriod === "weeks";
  const firstReportMonth = useMemo(() => isSparexpert ? SPAREXPERT_FIRST_MONTH : state.entries.reduce((first, entry) => {
    const month = monthKey(entry.date);
    return /^\d{4}-\d{2}$/.test(month) && month < first ? month : first;
  }, currentReportMonth), [state.entries, currentReportMonth, isSparexpert]);
  const manualEntries = useMemo(
    () => state.entries.filter((entry) => isSparexpert ? monthKey(entry.date) === reportMonth : !entry.id.startsWith("sheet-")),
    [state.entries, isSparexpert, reportMonth]
  );

  const activeWeekData = useMemo(() => {
    if (isSparexpert) {
      const [year, month] = reportMonth.split("-").map(Number);
      const rows = Array.from({ length: new Date(year, month, 0, 12).getDate() }, (_, index) => ({
        date: `${reportMonth}-${pad(index + 1)}`, collection: 0, expense: 0, supplierPayment: 0,
      }));
      for (const entry of manualEntries) {
        const row = rows[Number(entry.date.slice(8, 10)) - 1];
        if (!row || row.date !== entry.date) continue;
        const amount = Math.abs(entry.amount);
        if (entry.kind === "income") row.collection += amount;
        if (entry.kind === "expense") row.expense += amount;
      }
      if (!showSpareWeeks) return rows;
      const weeks: Array<(typeof rows)[number] & { endDate: string }> = [];
      for (const row of rows) {
        const previous = weeks[weeks.length - 1];
        if (!previous || new Date(`${row.date}T12:00:00`).getDay() === 1) {
          weeks.push({ ...row, endDate: row.date });
        } else {
          previous.endDate = row.date;
          previous.collection += row.collection;
          previous.expense += row.expense;
        }
      }
      return weeks;
    }
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
    if (!found) return [];
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
  }, [selectedWeek, state.entries, manualEntries, isSparexpert, reportMonth, showSpareWeeks]);
  const weekDateRange = (row: { date: string; endDate?: unknown }) =>
    typeof row.endDate === "string" ? `${Number(row.date.slice(-2))}–${Number(row.endDate.slice(-2))}` : "";

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
      (isSparexpert ? [] : IMPORTED_PIVOT_REPORTS.byCategory).map((item) => [item.category, item.amount])
    );
    const bankMap = new Map<string, number>(
      (isSparexpert ? [] : IMPORTED_PIVOT_REPORTS.byBank).map((item) => [item.bank, item.amount])
    );
    const cardMap = new Map<string, number>(
      (isSparexpert ? [] : IMPORTED_PIVOT_REPORTS.byCard).map((item) => [item.person, item.amount])
    );
    const supMap = new Map<string, number>(
      (isSparexpert ? [] : IMPORTED_PIVOT_REPORTS.dailySupplierPayments).map((item) => [item.date, item.amount])
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
        if (!isSparexpert && entry.category.toLocaleLowerCase("az-AZ").includes("təch")) {
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
  }, [isSparexpert, manualEntries]);

  const spareCards = useMemo(() => {
    const rows = new Map<string, CardActivity & { name: string; bank: string }>();
    if (!isSparexpert) return [];
    const cardAccounts = new Map(accounts.filter((account) => account.type === "card").map((account) => [account.id, account]));
    const bankNames = new Map(SPAREXPERT_CARD_REPORT.map(({ bank }) => [spareBankKey(bank), bank]));
    const add = (entry: Entry, side: "source" | "target") => {
      const account = cardAccounts.get((side === "source" ? entry.accountId : entry.targetAccountId) ?? "");
      const channel = side === "source" ? entry.bank : entry.targetBank;
      if (!account || !channel) return;
      const bankKey = spareBankKey(channel);
      const bank = bankNames.get(bankKey) ?? channel;
      const name = normalizePersonName(account.person || (side === "source" ? entry.responsible : entry.targetResponsible) || account.name);
      const key = `${name.toLocaleLowerCase("az-AZ")}:${bankKey}`;
      const row = rows.get(key) ?? { name, bank, ...emptyCardActivity() };
      addSpareCardActivity(row, entry, side);
      rows.set(key, row);
    };
    for (const entry of manualEntries) {
      add(entry, "source");
      if (entry.kind === "transfer") add(entry, "target");
    }
    return [...rows.values()].sort((a, b) => a.bank.localeCompare(b.bank, "az") || a.name.localeCompare(b.name, "az"));
  }, [accounts, isSparexpert, manualEntries]);

  const dynamicCustomers = useMemo(() => {
    const baseCust = isSparexpert ? [] : IMPORTED_CUSTOMERS;
    const custList: Array<{ name: string; paid: number; invoiced: number }> = baseCust.map((c) => ({
      name: c.name,
      paid: c.paid,
      invoiced: c.invoiced,
    }));
    for (const entry of manualEntries) {
      if (entry.kind === "transfer" || (isSparexpert && entry.kind !== "income")) continue;
      const party = String(entry.counterparty || "").trim();
      if (!party || (isSparexpert && !isSparexpertCustomer(party))) continue;
      const delta = entry.kind === "income" ? Math.abs(entry.amount) : -Math.abs(entry.amount);
      const existing = custList.find((c) => c.name.toLocaleLowerCase("az-AZ") === party.toLocaleLowerCase("az-AZ"));
      if (existing) existing.paid += delta;
      else custList.push({ name: party, paid: delta, invoiced: 0 });
    }
    return custList;
  }, [manualEntries, isSparexpert]);

  const sparePartyReports = useMemo(() => {
    type PartyRow = { name: string; income: number; expense: number; salary: number; advance: number; other: number; entries: Entry[] };
    const groups = { seller: new Map<string, PartyRow>(), employee: new Map<string, PartyRow>() };
    if (isSparexpert) {
      for (const entry of manualEntries) {
        if (entry.kind !== "income" && entry.kind !== "expense") continue;
        const party = entry.counterparty?.trim() || "";
        const type = sparexpertPartyType(party);
        if (type !== "seller" && type !== "employee") continue;
        const name = party.replace(/^[TƏ]\s*\.\s*/iu, "").trim();
        if (!name) continue;
        const key = name.toLocaleLowerCase("az-AZ");
        const row = groups[type].get(key) ?? { name, income: 0, expense: 0, salary: 0, advance: 0, other: 0, entries: [] };
        const cents = Math.round(Math.abs(entry.amount) * 100);
        row[entry.kind] += cents;
        row.entries.push(entry);
        if (type === "employee" && entry.kind === "expense") {
          if (/\bavans\b/iu.test(`${entry.category} ${entry.note ?? ""}`)) row.advance += cents;
          else if (entry.category.trim().toLocaleLowerCase("az-AZ") === "əməkhaqqı") row.salary += cents;
          else row.other += cents;
        }
        groups[type].set(key, row);
      }
    }
    return (["seller", "employee"] as const).map((type) => ({
      type,
      title: type === "seller" ? "Satıcılar üzrə pul fəaliyyəti" : "İşçilər üzrə ödənişlər",
      rows: Array.from(groups[type].values()).sort((a, b) => a.name.localeCompare(b.name, "az")),
    }));
  }, [isSparexpert, manualEntries]);

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
      <section className="page-heading page-heading-split daily-report-heading">
        <div>
          <span className="eyebrow">HESABATLAR VƏ ANALİTİKA</span>
          <h1>
            {reportTab === "charts"
              ? (isSparexpert ? "Qrafik Hesabat (Aylıq dinamika)" : "Qrafik Hesabat (Həftəlik dinamika)")
              : reportTab === "pivots"
                ? (isSparexpert ? "Cədvəl Hesabatı (Kateqoriya, Bank və Kart)" : "Cədvəl Hesabatı (Kateqoriya, Bank, Kart və Təchizatçı)")
                : "Müştəri və Kontragent üzrə pul fəaliyyəti"}
          </h1>
          <p>
            {reportTab === "charts"
              ? (isSparexpert ? "Seçilmiş ayın günləri üzrə mədaxil və məxaric." : "Həftələr üzrə Ümumi Yığım, Rasxod (Xərc) və Təchizatçıya Ödəniş (TO) müqayisəsi.")
              : reportTab === "pivots"
                ? (isSparexpert ? "Seçilmiş ay üzrə kateqoriya, bank və kart sahiblərinin icmalı." : "Kateqoriya, bank, kart sahibi və günlər üzrə təchizatçı ödənişlərinin icmalı.")
                : "Baza və Cədvəl Hesabat vərəqlərindən gətirilmiş kontragent ödəniş yekunları."}
          </p>
        </div>
        <div className="subview-switch daily-report-tabs" role="group" aria-label="Hesabat növləri">
          <button type="button" aria-pressed={reportTab === "charts"} className={reportTab === "charts" ? "active" : ""} onClick={() => setReportTab("charts")}>
            <BarChart3 size={16} />
            <span>Qrafik Hesabat</span>
          </button>
          <button type="button" aria-pressed={reportTab === "pivots"} className={reportTab === "pivots" ? "active" : ""} onClick={() => setReportTab("pivots")}>
            <Columns2 size={16} />
            <span>Cədvəl Hesabat</span>
          </button>
          <button type="button" aria-pressed={reportTab === "customers"} className={reportTab === "customers" ? "active" : ""} onClick={() => setReportTab("customers")}>
            <Users size={16} />
            <span>Müştəri fəaliyyəti ({isSparexpert ? dynamicCustomers.length : IMPORTED_CUSTOMERS.length})</span>
          </button>
          {isSparexpert && (
            <button type="button" className={reportTab === "investors" ? "active" : ""} onClick={() => setReportTab("investors")}>
              <Landmark size={16} />
              <span>İnvestor Fəaliyyəti</span>
            </button>
          )}
        </div>
      </section>

      {isSparexpert && <nav className="spare-report-month" aria-label="Hesabat ayı">
        <button type="button" className="date-arrow" disabled={reportMonth <= firstReportMonth} onClick={() => setReportMonth((month) => shiftMonth(month, -1))} aria-label="Əvvəlki ay"><ChevronLeft size={18} /></button>
        <strong aria-live="polite">{monthLabel(reportMonth)}</strong>
        <button type="button" className="date-arrow" disabled={reportMonth >= currentReportMonth} onClick={() => setReportMonth((month) => shiftMonth(month, 1))} aria-label="Növbəti ay"><ChevronRight size={18} /></button>
      </nav>}
      {isSparexpert && !manualEntries.length && <p>Bu ay üçün əməliyyat yoxdur.</p>}

      {reportTab === "charts" && (
        <section className="report-panel">
          <div className="report-toolbar">
            {isSparexpert && <div className="week-selector" role="group" aria-label="Ayın bölgüsü">
              <button type="button" aria-pressed={!showSpareWeeks} className={!showSpareWeeks ? "active" : ""} onClick={() => setSpareChartPeriod("days")}>Günlər üzrə</button>
              <button type="button" aria-pressed={showSpareWeeks} className={showSpareWeeks ? "active" : ""} onClick={() => setSpareChartPeriod("weeks")}>Həftələr üzrə</button>
            </div>}
            {!isSparexpert && (
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
            )}
            <div className="report-legend">
              <span><i className="income" />Ümumi Yığım ({formatMoney(weekTotals.collection, "AZN")})</span>
              <span><i className="expense" />Rasxod ({formatMoney(weekTotals.expense, "AZN")})</span>
              {!isSparexpert && <span><i className="supplier" />Təchizatçıya Ödəniş ({formatMoney(weekTotals.supplierPayment, "AZN")})</span>}
            </div>
          </div>

          <div className={cx("bar-chart", isSparexpert && "spare-monthly-chart")} style={isSparexpert ? { gridTemplateColumns: `repeat(${activeWeekData.length}, minmax(36px, 1fr))` } : undefined}>
            {activeWeekData.map((row, index) => (
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
                  {!isSparexpert && <i
                    className="supplier"
                    title={`Təchizatçıya Ödəniş: ${formatMoney(row.supplierPayment, "AZN")}`}
                    style={{ height: `${Math.max((row.supplierPayment / maxChartVal) * 100, row.supplierPayment ? 4 : 0)}%` }}
                  />}
                </div>
                <b>{showSpareWeeks ? `${index + 1}. həftə` : dateLabel(row.date, { weekday: "short" })}</b>
                <small>{showSpareWeeks ? weekDateRange(row) : dateLabel(row.date, { day: "numeric", month: "short" })}</small>
              </div>
            ))}
          </div>

          <div className={cx("report-table report-table-4col", isSparexpert && "spare-monthly-table")}>
            <article className="report-table-head">
              <span>{showSpareWeeks ? "Həftə" : "Tarix"}</span>
              <span>Ümumi Yığım</span>
              <span>Rasxod (Xərc)</span>
              {!isSparexpert && <span>Təchizatçıya Ödəniş (TO)</span>}
              <span>Xalis fərq</span>
            </article>
            {activeWeekData.map((row, index) => {
              const net = row.collection - row.expense - row.supplierPayment;
              return (
                <article key={row.date}>
                  <span>
                    <b>{showSpareWeeks ? `${index + 1}. həftə` : dateLabel(row.date, { day: "numeric", month: "long" })}</b>
                    <small>{showSpareWeeks ? weekDateRange(row) : dateLabel(row.date, { weekday: "long" })}</small>
                  </span>
                  <strong className="income">+{formatMoney(row.collection, "AZN")}</strong>
                  <strong className="expense">−{formatMoney(row.expense, "AZN")}</strong>
                  {!isSparexpert && <strong className="supplier-text">−{formatMoney(row.supplierPayment, "AZN")}</strong>}
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
              <em>{isSparexpert ? spareCards.length : dynamicPivots.byCard.length} kart</em>
            </div>
            <div className="pivot-list pivot-list-scroll">
              {isSparexpert ? spareCards.map((item) => (
                <details className="spare-party-detail" key={`${item.bank}:${item.name}`}>
                  <summary><span>{item.name} · {item.bank}</span><strong>{formatMoney(item.income + item.onlinePayment + item.sameBankTransfer + item.diffBankTransfer + item.cashOut, "AZN")}</strong></summary>
                  {([["Mədaxil", item.income], ["Onlayn / POS", item.onlinePayment], ["Eyni banka köçürmə", item.sameBankTransfer], ["Fərqli banka köçürmə", item.diffBankTransfer], ["Nağdlaşdırma", item.cashOut]] as const).map(([label, amount]) =>
                    <article key={label}><span>{label}</span><strong>{formatMoney(amount, "AZN")}</strong></article>)}
                </details>
              )) : dynamicPivots.byCard.map((item) => (
                <article key={item.person}>
                  <span>{item.person}</span>
                  <strong className={item.amount > 0 ? "income" : ""}>
                    {formatMoney(item.amount, "AZN")}
                  </strong>
                </article>
              ))}
            </div>
          </div>

          {isSparexpert && sparePartyReports.map(({ type, title, rows }) => (
            <div className="pivot-card" key={type}>
              <div className="pivot-card-head"><h3>{title}</h3><em>{rows.length} nəfər</em></div>
              <div className="pivot-list">
                {rows.length === 0 && <article><span>Bu ay üçün əməliyyat yoxdur.</span></article>}
                {rows.map(({ name, income, expense, salary, advance, other, entries }) => (
                  <details key={name} className="spare-party-detail">
                    <summary><span>{name}</span><span>
                      {income > 0 && <strong className="income">+{formatMoney(income / 100, "AZN")} </strong>}
                      {expense > 0 && <strong className="expense">−{formatMoney(expense / 100, "AZN")}</strong>}
                    </span></summary>
                    {type === "employee" && <article>
                      <span>Maaş: {formatMoney(salary / 100, "AZN")} · Avans: {formatMoney(advance / 100, "AZN")}
                        {other > 0 && ` · Digər: ${formatMoney(other / 100, "AZN")}`}</span>
                    </article>}
                    {entries.map((entry) => <article key={entry.id}>
                      <span>{dateLabel(entry.date, { day: "numeric", month: "short" })} · {entry.category} · {entry.bank}</span>
                      <strong>{entry.kind === "expense" ? "−" : "+"}{formatMoney(Math.abs(entry.amount), "AZN")}</strong>
                    </article>)}
                  </details>
                ))}
                {rows.length > 0 && <article className="pivot-total-row">
                  <b>Cəmi ödəniş</b>
                  <strong>{formatMoney(rows.reduce((total, row) => total + row.expense, 0) / 100, "AZN")}</strong>
                </article>}
                {type === "employee" && rows.length > 0 && <article>
                  <span>Cəmi maaş · Cəmi avans</span>
                  <strong>{formatMoney(rows.reduce((total, row) => total + row.salary, 0) / 100, "AZN")} · {formatMoney(rows.reduce((total, row) => total + row.advance, 0) / 100, "AZN")}</strong>
                </article>}
              </div>
            </div>
          ))}
          {!isSparexpert && <div className="pivot-card">
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
          </div>}
        </section>
      )}

      {reportTab === "investors" && isSparexpert && (
        <section className="directory-panel" style={{ padding: "16px" }}>
          <InvestorSummaryBlock entries={state.entries} month={reportMonth} parties={parties} />
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
                placeholder={isSparexpert ? "Müştəri axtar..." : "Müştəri və ya təchizatçı axtar..."}
              />
            </label>
            <div className="customer-summary-pill">
              <span>{isSparexpert ? "Ay üzrə müştəri ödənişləri:" : "Seçilmiş üzrə cəmi dövriyyə:"}</span>
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
