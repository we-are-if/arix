import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Copy,
  Eye,
  FilePlus2,
  FileText,
  HandCoins,
  Image as ImageIcon,
  Layers3,
  ListChecks,
  NotepadText,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  Truck,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import AriXLogo from "./AriXLogo";
import QaimeDocument from "./QaimeDocument";
import QaimePreviewStage from "./QaimePreviewStage";
import { printQaimeDocument, QaimePrintButton, type PrintMode } from "./QaimePrintDropdown";
import { readQaimePdf } from "./qaimePdf";
import {
  extractProductRowCandidates,
  mergeProductRowCandidates,
  parseCloudShopInvoiceText,
  parseFlexibleNumber,
  preloadOcrWorker,
  preprocessImageForOcr,
  recognizeImageFast,
  type InvoiceRecord,
  type ParsedSalesDoc,
  type ParsedSalesItem,
} from "./qaimeParser";
import { OFFICIAL_PRODUCT_CATALOG, OFFICIAL_PRODUCT_LIST } from "./productCatalog";
import {
  subscribeToSyncStatus,
  getInvoiceSyncState,
  getPendingQueueCount,
  retryInvoiceSync,
  flushQueue,
} from "./dailyInvoiceSync";

function ApprovalIcon({
  kind,
}: {
  kind:
    | "document"
    | "calendar"
    | "representative"
    | "source"
    | "currency"
    | "company"
    | "note"
    | "terms"
    | "payment"
    | "delivery";
}) {
  const icons = {
    document: FileText,
    calendar: CalendarDays,
    representative: UserRound,
    source: Layers3,
    currency: CircleDollarSign,
    company: Building2,
    note: NotepadText,
    terms: ListChecks,
    payment: HandCoins,
    delivery: Truck,
  };
  const Icon = icons[kind];
  return <Icon className={`approval-vector-icon ${kind}`} aria-hidden="true" />;
}

type EntryItem = {
  id: string;
  date: string;
  time: string;
  kind: "income" | "expense" | "transfer";
  title: string;
  counterparty: string;
  category: string;
  amount: number;
  accountId: string;
  responsible?: string;
  bank?: string;
  note?: string;
  invoiced?: boolean;
  invoiceNo?: string;
};

type Props = {
  newestCreatedFirst?: boolean;
  isLiveConnected?: boolean;
  entries: EntryItem[];
  customerDebts: Record<string, number>;
  pastMonthUninvoiced: Record<string, number>;
  invoices: InvoiceRecord[];
  knownCustomers: string[];
  formatMoney: (value: number, currency: "TRY" | "AZN" | "USD") => string;
  currentUserName: string;
  canManageInvoice: boolean;
  canApproveInvoice: boolean;
  canRestartInvoice: boolean;
  canDeleteInvoicePermanently: boolean;
  onConfirmInvoice: (record: InvoiceRecord) => void;
  onApproveInvoice: (invoiceId: string) => void;
  onCancelInvoice: (invoiceId: string, reason?: string) => void;
  onRestartInvoice: (invoiceId: string) => void;
  onDeleteInvoicePermanently: (invoiceId: string) => void;
  onUpdateCustomerDebt: (customer: string, newDebt: number) => void;
  onToggleEntryInvoiced: (entryId: string) => void;
  onOpenCustomerProfile?: (customerName: string) => void;
  openCreateTrigger?: number;
  externalSelectedCustomer?: string | null;
  externalEditingInvoice?: InvoiceRecord | null;
  onClearExternalEditing?: () => void;
};

const SAMPLE_RAW_DOC = `Satış #32609
Yararlı 31 oktyabr 2026
Hesab ANAnas
Müştəri Membran Group
Satıcı Arif Mahmud
Endirim 0% (0.00 ₼)
Məbləğ 872.70 ₼
MƏHSULLAR
Bute Kapuçino C1402 6,1 11.00 0.00 67.10
Patine Bej G581 C1806 1,6 12.00 0.00 19.20
Soft Moment Gri Folyolu C1870 21,4 15.00 0.00 321.00
Patine Silver G572 ES 707 6,1 12.00 0.00 73.20
HG Aytaşı G545 ES HG 00138 9,2 13.00 0.00 119.60
Süper Mat Kapuçino G569_1 ES SM 228 1,8 16.00 0.00 28.80
Soft Touch İnci Gri G455 ERSA 516 12,2 16.00 0.00 195.20
Wenge G19 C1442 3,05 12.00 0.00 36.60
Soft Pink Panter Folyolu C1874 0,8 15.00 0.00 12.00
Ümumi nəticə 62,25 - 0.00 872.70`;

const parseInvoiceDateToTime = (dateStr?: string): number => {
  if (!dateStr) return 0;
  const str = String(dateStr).trim();
  const partsDot = str.split(".");
  if (partsDot.length === 3) {
    const day = parseInt(partsDot[0], 10);
    const month = parseInt(partsDot[1], 10) - 1;
    const year = parseInt(partsDot[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  const partsDash = str.split("-");
  if (partsDash.length === 3 && partsDash[0].length === 4) {
    const year = parseInt(partsDash[0], 10);
    const month = parseInt(partsDash[1], 10) - 1;
    const day = parseInt(partsDash[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  const t = new Date(str).getTime();
  return Number.isFinite(t) ? t : 0;
};

function DecimalInput({
  value,
  onChange,
  className,
  style,
  placeholder,
}: {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => (value === 0 ? "" : String(value)));

  useEffect(() => {
    const currentParsed = parseFlexibleNumber(text);
    if (currentParsed !== value && !(text === "" && value === 0)) {
      setText(value === 0 ? "" : String(value));
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      style={style}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (/^[0-9.,\- ]*$/.test(raw)) {
          setText(raw);
          const parsed = parseFlexibleNumber(raw);
          onChange(parsed);
        }
      }}
      onBlur={() => {
        const parsed = parseFlexibleNumber(text);
        setText(parsed === 0 ? "0" : String(parsed));
        onChange(parsed);
      }}
    />
  );
}

const displayInvoiceNumber = (invoice: InvoiceRecord) =>
  `SPF-${invoice.invoiceNo}${invoice.dailySequence ? `-${String(invoice.dailySequence).padStart(3, "0")}` : ""}`;

export default function InvoiceAttachmentView({
  newestCreatedFirst = false,
  openCreateTrigger,
  isLiveConnected,
  entries,
  customerDebts,
  pastMonthUninvoiced,
  invoices,
  knownCustomers,
  formatMoney,
  currentUserName,
  canManageInvoice,
  canApproveInvoice,
  canRestartInvoice,
  canDeleteInvoicePermanently,
  onConfirmInvoice,
  onApproveInvoice,
  onCancelInvoice,
  onRestartInvoice,
  onDeleteInvoicePermanently,
  onUpdateCustomerDebt,
  onToggleEntryInvoiced,
  onOpenCustomerProfile,
  externalSelectedCustomer,
  externalEditingInvoice,
  onClearExternalEditing,
}: Props) {
  // Main view state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "active" | "cancelled">("all");
  const [, setSyncTick] = useState(0);

  useEffect(() => {
    return subscribeToSyncStatus(() => setSyncTick((v) => v + 1));
  }, []);

  const pendingQueueCount = getPendingQueueCount();

  // Modals
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [restartSourceId, setRestartSourceId] = useState<string | null>(null);
  const [pdfViewerInvoice, setPdfViewerInvoice] = useState<InvoiceRecord | null>(null);
  const [invoiceContextMenu, setInvoiceContextMenu] = useState<{ invoice: InvoiceRecord; x: number; y: number } | null>(null);

  // Editor form state
  const [invoiceNo, setInvoiceNo] = useState("32609");
  const [invoiceDate, setInvoiceDate] = useState(() => new Intl.DateTimeFormat("tr-TR").format(new Date()));
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [sellerName, setSellerName] = useState(currentUserName);
  const [warehouseName, setWarehouseName] = useState("ANAnas");
  const [docNote, setDocNote] = useState("");
  const [salesInput, setSalesInput] = useState("872.70");
  const [returnInput, setReturnInput] = useState("0");
  const [purchaseInput, setPurchaseInput] = useState("0");
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[] | null>(null);
  const [includePastPayment, setIncludePastPayment] = useState(true);
  const [ocrTarget, setOcrTarget] = useState<"sales" | "return">("sales");
  const [itemsViewTab, setItemsViewTab] = useState<"sales" | "return">("sales");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [parsedDoc, setParsedDoc] = useState<ParsedSalesDoc | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedSalesItem[]>([]);
  const [returnItems, setReturnItems] = useState<ParsedSalesItem[]>([]);
  const [editorBanner, setEditorBanner] = useState<{ type: "success" | "warning" | "info"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfPaperRef = useRef<HTMLElement | null>(null);
  const editorPaperRef = useRef<HTMLElement | null>(null);
  const invoiceContextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!invoiceContextMenu) return;
    const close = (event: Event) => {
      if (!invoiceContextMenuRef.current?.contains(event.target as Node)) setInvoiceContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setInvoiceContextMenu(null); };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", () => setInvoiceContextMenu(null), { capture: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [invoiceContextMenu]);

  // Preload OCR worker on component mount for ultra-fast OCR responses
  useEffect(() => {
    preloadOcrWorker();
  }, []);

  // Sync external customer or invoice opening
  useEffect(() => {
    if (externalEditingInvoice) {
      openEditorWithInvoice(externalEditingInvoice);
      onClearExternalEditing?.();
    } else if (externalSelectedCustomer) {
      openNewFormForCustomer(externalSelectedCustomer);
      onClearExternalEditing?.();
    }
  }, [externalEditingInvoice, externalSelectedCustomer]);

  // Trigger new invoice form creation from mobile bottom bar or header shortcut
  useEffect(() => {
    if (openCreateTrigger && openCreateTrigger > 0) {
      openNewForm();
    }
  }, [openCreateTrigger]);

  const allCustomerOptions = useMemo(() => {
    const set = new Set<string>([
      ...Object.keys(customerDebts),
      ...Object.keys(pastMonthUninvoiced),
      ...knownCustomers,
    ]);
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, "az-AZ"));
  }, [customerDebts, pastMonthUninvoiced, knownCustomers]);

  const knownProductNames = useMemo(() => {
    const names = new Set<string>(OFFICIAL_PRODUCT_LIST.map((p) => p.name.trim()));
    for (const inv of invoices) {
      for (const item of inv.items) {
        if (item.name?.trim()) names.add(item.name.trim());
      }
    }
    return Array.from(names).filter(Boolean);
  }, [invoices]);

  const knownProductCatalog = useMemo(() => {
    const catalog: Record<string, string> = { ...OFFICIAL_PRODUCT_CATALOG };
    for (const inv of invoices) {
      for (const item of inv.items) {
        const name = item.name?.trim();
        const code = item.code?.trim();
        if (name && code && !catalog[name]) {
          catalog[name] = code;
        }
      }
    }
    return catalog;
  }, [invoices]);

  // Bulk invoices grouped by Date (Sorted with most recent/nearest date & number first)
  const creationTime = (invoice: InvoiceRecord) => {
    const time = Date.parse(invoice.createdAt || "");
    return Number.isFinite(time) ? time : parseInvoiceDateToTime(invoice.date);
  };
  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("az-AZ");
    return (invoices || [])
      .filter((inv) => {
        if (!inv) return false;
        if (statusFilter !== "all" && inv.status !== statusFilter) return false;
        if (!q) return true;
        const invNo = String(inv.invoiceNo || "").toLocaleLowerCase("az-AZ");
        const cust = String(inv.customer || "").toLocaleLowerCase("az-AZ");
        const seller = String(inv.seller || "").toLocaleLowerCase("az-AZ");
        const date = String(inv.date || "");
        return (
          invNo.includes(q) || displayInvoiceNumber(inv).toLocaleLowerCase("az-AZ").includes(q) ||
          cust.includes(q) ||
          seller.includes(q) ||
          date.includes(q)
        );
      })
      .sort((a, b) => {
        if (newestCreatedFirst) return creationTime(b) - creationTime(a);
        const timeA = parseInvoiceDateToTime(a.date);
        const timeB = parseInvoiceDateToTime(b.date);
        if (timeA !== timeB) return timeB - timeA; // Most recent date first
        const numA = Number(a.invoiceNo);
        const numB = Number(b.invoiceNo);
        if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
          return numB - numA; // Highest invoice number first
        }
        return String(b.invoiceNo || "").localeCompare(String(a.invoiceNo || ""), undefined, { numeric: true });
      });
  }, [invoices, statusFilter, search, newestCreatedFirst]);

  const dateGroups = useMemo(() => {
    const map = new Map<string, InvoiceRecord[]>();
    for (const inv of filteredInvoices) {
      const timestamp = Date.parse(inv.createdAt || "");
      const d = (newestCreatedFirst && Number.isFinite(timestamp)
        ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baku", day: "2-digit", month: "2-digit", year: "numeric" })
            .format(timestamp).replaceAll("/", ".")
        : inv.date) || "Digər";
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(inv);
    }
    return Array.from(map.entries())
      .map(([date, list]) => ({
        date,
        list,
      }))
      .sort((a, b) => {
        const timeA = parseInvoiceDateToTime(a.date);
        const timeB = parseInvoiceDateToTime(b.date);
        return timeB - timeA;
      });
  }, [filteredInvoices, newestCreatedFirst]);

  // Calculations for active customer inside editor modal
  const customerPendingEntries = useMemo(() => {
    const cleanTarget = String(selectedCustomer || "").trim().toLocaleLowerCase("az-AZ");
    if (!cleanTarget) return [];
    return (entries || []).filter(
      (e) =>
        e &&
        e.kind === "income" &&
        !e.invoiced &&
        String(e.counterparty || "").trim().toLocaleLowerCase("az-AZ") === cleanTarget
    );
  }, [entries, selectedCustomer]);

  const selectedPayments = customerPendingEntries.filter((entry) => selectedPaymentIds === null || selectedPaymentIds.includes(entry.id));
  const selectedPastPayment = includePastPayment;
  const pendingCurrentMonthSum = useMemo(
    () => Math.round(selectedPayments.reduce((sum, e) => sum + Math.abs(e.amount), 0) * 100) / 100,
    [selectedPayments]
  );

  const storedPastMonthBalance = useMemo(() => {
    const safeCust = String(selectedCustomer || "").trim();
    if (!safeCust) return 0;
    const store = pastMonthUninvoiced || {};
    const exact = store[safeCust];
    if (exact !== undefined) return exact;
    const safeCustLower = safeCust.toLocaleLowerCase("az-AZ");
    const foundKey = Object.keys(store).find(
      (k) => String(k || "").trim().toLocaleLowerCase("az-AZ") === safeCustLower
    );
    return foundKey ? (store[foundKey] ?? 0) : 0;
  }, [pastMonthUninvoiced, selectedCustomer]);

  const storedPreviousDebt = useMemo(() => {
    const safeCust = String(selectedCustomer || "").trim();
    if (!safeCust) return 0;
    const store = customerDebts || {};
    const exact = store[safeCust];
    if (exact !== undefined) return exact;
    const safeCustLower = safeCust.toLocaleLowerCase("az-AZ");
    const foundKey = Object.keys(store).find(
      (k) => String(k || "").trim().toLocaleLowerCase("az-AZ") === safeCustLower
    );
    return foundKey ? (store[foundKey] ?? 0) : 0;
  }, [customerDebts, selectedCustomer]);

  const existingEditorInvoice = editingTargetId
    ? invoices.find((invoice) => invoice.id === editingTargetId)
    : undefined;
  // An approved document keeps the payment snapshot accepted by the server.
  const lockedPayments = newestCreatedFirst && existingEditorInvoice?.status === "active" ? existingEditorInvoice : undefined;
  const effectivePreviousDebt = lockedPayments ? (lockedPayments.previousDebtSnapshot ?? 0) : storedPreviousDebt;
  const selectedPastAmount = selectedPastPayment ? Math.max(0, storedPastMonthBalance) : 0;
  const totalDeductiblePayment = lockedPayments ? (lockedPayments.paymentDeducted ?? 0)
    : Math.round((pendingCurrentMonthSum + selectedPastAmount) * 100) / 100;

  const currentSalesAmount = parseFlexibleNumber(salesInput);
  const currentReturnAmount = parseFlexibleNumber(returnInput);
  const currentPurchaseAmount = parseFlexibleNumber(purchaseInput);

  const parsedItemsTotal = useMemo(
    () => Math.round(parsedItems.reduce((sum, item) => sum + Number(item.total || 0), 0) * 100) / 100,
    [parsedItems],
  );

  const returnItemsTotal = useMemo(
    () => Math.round(returnItems.reduce((sum, item) => sum + Number(item.total || 0), 0) * 100) / 100,
    [returnItems],
  );

  useEffect(() => {
    if (!parsedItems.length) return;
    setSalesInput((current) =>
      Math.abs(parseFlexibleNumber(current) - parsedItemsTotal) < 0.001
        ? current
        : String(parsedItemsTotal),
    );
  }, [parsedItems.length, parsedItemsTotal]);

  useEffect(() => {
    if (!returnItems.length) return;
    setReturnInput((current) =>
      Math.abs(parseFlexibleNumber(current) - returnItemsTotal) < 0.001
        ? current
        : String(returnItemsTotal),
    );
  }, [returnItems.length, returnItemsTotal]);

  const calculatedFinalDebt = useMemo(() => {
    if (lockedPayments) {
      const oldImpact = (lockedPayments.salesAmount || 0) - (lockedPayments.returnAmount || 0) - (lockedPayments.purchaseAmount || 0);
      return Math.round(((lockedPayments.finalDebt || 0) + currentSalesAmount - currentReturnAmount - currentPurchaseAmount - oldImpact) * 100) / 100;
    }
    const result =
      effectivePreviousDebt +
      currentSalesAmount -
      currentReturnAmount -
      currentPurchaseAmount -
      totalDeductiblePayment;
    return Math.round(result * 100) / 100;
  }, [
    lockedPayments,
    effectivePreviousDebt,
    currentSalesAmount,
    currentReturnAmount,
    currentPurchaseAmount,
    totalDeductiblePayment,
  ]);

  const editorPreviewInvoice: InvoiceRecord = {
    id: editingTargetId || "qaime-preview",
    invoiceNo: invoiceNo.trim(),
    date: invoiceDate.trim(),
    createdAt: existingEditorInvoice?.createdAt || new Date().toISOString(),
    customer: selectedCustomer.trim(),
    seller: sellerName.trim(),
    warehouse: warehouseName.trim(),
    note: docNote.trim(),
    previousDebtSnapshot: effectivePreviousDebt,
    previousPastMonthSnapshot: lockedPayments ? (lockedPayments.previousPastMonthSnapshot ?? 0) : storedPastMonthBalance,
    salesAmount: currentSalesAmount,
    returnAmount: currentReturnAmount,
    purchaseAmount: currentPurchaseAmount,
    paymentDeducted: totalDeductiblePayment,
      explicitPaymentSelection: true,
      includePastPayment,
    currentMonthDeducted: lockedPayments ? (lockedPayments.currentMonthDeducted ?? 0) : pendingCurrentMonthSum,
    pastMonthDeducted: lockedPayments ? (lockedPayments.pastMonthDeducted ?? 0) : selectedPastAmount,
    finalDebt: calculatedFinalDebt,
    linkedEntryIds: lockedPayments ? (lockedPayments.linkedEntryIds || []) : selectedPayments.map((entry) => entry.id),
    linkedEntriesSummary: lockedPayments ? (lockedPayments.linkedEntriesSummary || []) : selectedPayments.map((entry) => ({
      id: entry.id,
      date: entry.date,
      amount: Math.abs(entry.amount),
      channel: entry.bank?.trim() || "Kassa",
    })),
    items: parsedItems,
    returnItems: returnItems,
    status: existingEditorInvoice?.status || "draft",
    approvedBy: existingEditorInvoice?.approvedBy,
    approvedAt: existingEditorInvoice?.approvedAt,
    cancelledAt: existingEditorInvoice?.cancelledAt,
    cancelledBy: existingEditorInvoice?.cancelledBy,
    rejectionReason: existingEditorInvoice?.rejectionReason,
    restartOf: restartSourceId || existingEditorInvoice?.restartOf,
    restartedAt: existingEditorInvoice?.restartedAt,
    restartedBy: existingEditorInvoice?.restartedBy,
    printedAt: existingEditorInvoice?.printedAt,
  };

  // Open editor helpers
  const nextManualInvoiceNumber = () => String(
    Math.max(32609, ...invoices.map((invoice) => Number(invoice.invoiceNo)).filter(Number.isFinite)) + 1
  );
  const currentInvoiceDate = () => new Intl.DateTimeFormat("tr-TR").format(new Date());

  const closeEditor = () => {
    setEditorModalOpen(false);
    setEditingTargetId(null);
    setRestartSourceId(null);
  };

  const openNewForm = () => {
    const nextNo = nextManualInvoiceNumber();
    setEditingTargetId(null);
    setRestartSourceId(null);
    setInvoiceNo(nextNo);
    setInvoiceDate(currentInvoiceDate());
    setSelectedCustomer("");
    setSellerName(currentUserName);
    setWarehouseName("ANAnas");
    setDocNote("");
    setSalesInput("0");
    setReturnInput("0");
    setPurchaseInput("0");
    setParsedItems([]);
    setReturnItems([]);
    setParsedDoc(null);
    setSelectedPaymentIds(null); setIncludePastPayment(true);
    setEditorBanner(null);
    setEditorModalOpen(true);
  };

  const openNewFormForCustomer = (cust: string) => {
    const nextNo = nextManualInvoiceNumber();
    setEditingTargetId(null);
    setRestartSourceId(null);
    setInvoiceNo(nextNo);
    setInvoiceDate(currentInvoiceDate());
    setSelectedCustomer(cust);
    setSellerName(currentUserName);
    setWarehouseName("ANAnas");
    setDocNote("");
    setSalesInput("0");
    setReturnInput("0");
    setPurchaseInput("0");
    setParsedItems([]);
    setReturnItems([]);
    setParsedDoc(null);
    setOcrTarget("sales");
    setItemsViewTab("sales");
    setSelectedPaymentIds(null); setIncludePastPayment(true);
    setEditorBanner(null);
    setEditorModalOpen(true);
  };

  const openEditorWithInvoice = (inv: InvoiceRecord) => {
    setEditingTargetId(inv.id);
    setRestartSourceId(null);
    setInvoiceNo(inv.invoiceNo);
    setInvoiceDate(inv.date);
    setSelectedCustomer(inv.customer);
    setSellerName(inv.seller || currentUserName);
    setWarehouseName(inv.warehouse || "ANAnas");
    setDocNote(inv.note || "");
    setSalesInput(String(inv.salesAmount));
    setReturnInput(String(inv.returnAmount));
    setPurchaseInput(String(inv.purchaseAmount));
    setParsedItems(inv.items || []);
    setReturnItems(inv.returnItems || []);
    setParsedDoc(null);
    setOcrTarget("sales");
    setItemsViewTab("sales");
    setSelectedPaymentIds(inv.explicitPaymentSelection ? inv.linkedEntryIds || [] : null);
    setIncludePastPayment(!inv.explicitPaymentSelection || inv.includePastPayment === true);
    setEditorBanner(null);
    setEditorModalOpen(true);
  };

  const restartInvoiceInEditor = (inv: InvoiceRecord) => {
    if (!canRestartInvoice) return;
    const accepted = window.confirm(
      `SPF-${inv.invoiceNo} qaiməsini başdan başlamaq istəyirsiniz? Köhnə sənəd tarixçədə ləğv edilmiş kimi qalacaq.`,
    );
    if (!accepted) return;
    onRestartInvoice(inv.id);
    setEditingTargetId(null);
    setRestartSourceId(inv.id);
    setInvoiceNo(inv.invoiceNo);
    setInvoiceDate(currentInvoiceDate());
    setSelectedCustomer("");
    setSellerName(currentUserName);
    setWarehouseName(inv.warehouse || "ANAnas");
    setDocNote("");
    setSalesInput("0");
    setReturnInput("0");
    setPurchaseInput("0");
    setParsedItems([]);
    setReturnItems([]);
    setParsedDoc(null);
    setSelectedPaymentIds(null); setIncludePastPayment(true);
    setEditorBanner({ type: "info", text: `SPF-${inv.invoiceNo} üçün təmiz forma açıldı. Köhnə sənəd tarixçədə saxlanıldı.` });
    setPdfViewerInvoice(null);
    setEditorModalOpen(true);
  };

  const startPreparedInvoiceOver = () => {
    if (existingEditorInvoice) {
      restartInvoiceInEditor(existingEditorInvoice);
      return;
    }
    const accepted = window.confirm(
      "Hazırladığınız qaimədəki məhsul və məbləğ məlumatları təmizlənsin?",
    );
    if (!accepted) return;
    setInvoiceDate(currentInvoiceDate());
    setSelectedCustomer("");
    setDocNote("");
    setSalesInput("0");
    setReturnInput("0");
    setPurchaseInput("0");
    setParsedItems([]);
    setReturnItems([]);
    setParsedDoc(null);
    setSelectedPaymentIds(null); setIncludePastPayment(true);
    setEditorBanner({ type: "info", text: "Qaimə formu təmizləndi. Yenidən hazırlaya bilərsiniz." });
  };

  const permanentlyDeleteInvoice = (inv: InvoiceRecord) => {
    if (!canDeleteInvoicePermanently) return;
    const accepted = window.confirm(
      `SPF-${inv.invoiceNo} qaiməsini qalıcı silmək istəyirsiniz? Sənəd siyahıdan çıxacaq, amma silmə qeydi audit tarixçəsində qalacaq.`,
    );
    if (!accepted) return;
    onDeleteInvoicePermanently(inv.id);
    setPdfViewerInvoice(null);
    closeEditor();
  };

  const openInvoiceContextMenu = (event: MouseEvent<HTMLElement>, invoice: InvoiceRecord) => {
    // A qaimə row owns its own context menu; it must never fall through to
    // the generic Daily canvas menu.
    event.preventDefault();
    event.stopPropagation();
    setInvoiceContextMenu({ invoice, x: event.clientX, y: event.clientY });
  };

  const copyInvoiceDetails = async (invoice: InvoiceRecord) => {
    const text = `${displayInvoiceNumber(invoice)} · ${invoice.customer} · ${invoice.date} · ${formatMoney(Number(invoice.salesAmount || 0), "AZN")}`;
    try { await navigator.clipboard.writeText(text); } catch { /* Clipboard permission is optional. */ }
    setInvoiceContextMenu(null);
  };

  const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const parseQuality = (candidate: ParsedSalesDoc) =>
    (candidate.verified ? 100 : 0) +
    candidate.items.length * 20 +
    (candidate.matchedCustomer ? 12 : 0) +
    (candidate.warehouse ? 4 : 0) +
    (candidate.invoiceNo ? 2 : 0) +
    (candidate.date ? 2 : 0);

  const parseImageDocument = async (image: File | Blob): Promise<ParsedSalesDoc> => {
    const preprocessed = await preprocessImageForOcr(image);
    setOcrProgress(30);

    let selectedText = await recognizeImageFast(preprocessed, "3");
    let parsed = parseCloudShopInvoiceText(selectedText, allCustomerOptions);
    setOcrProgress(60);

    if (!parsed.verified || !parsed.items.length || !parsed.matchedCustomer) {
      const alternateText = await recognizeImageFast(preprocessed, "4");
      const alternateParsed = parseCloudShopInvoiceText(alternateText, allCustomerOptions);
      if (parseQuality(alternateParsed) > parseQuality(parsed)) {
        selectedText = alternateText;
        parsed = alternateParsed;
      }
    }

    // Product identity comes from the same row coordinates. Numeric values stay
    // exactly as parsed and mathematically verified above.
    let rowCandidates = extractProductRowCandidates(selectedText);
    if (rowCandidates.length !== parsed.items.length) {
      const layoutText = await recognizeImageFast(preprocessed, "11");
      const layoutCandidates = extractProductRowCandidates(layoutText);
      if (layoutCandidates.length === parsed.items.length) rowCandidates = layoutCandidates;
    }
    setOcrProgress(85);
    return {
      ...parsed,
      items: mergeProductRowCandidates(parsed.items, rowCandidates, knownProductNames, knownProductCatalog),
    };
  };

  const applyParsedDocument = (parsed: ParsedSalesDoc, sourceLabel: "PDF" | "Şəkil") => {
    if (ocrTarget === "return") {
      const returnTotal = parsed.salesAmount || parsed.itemsSum;
      if (returnTotal > 0) setReturnInput(String(returnTotal));
      if (parsed.items.length > 0) {
        setReturnItems(parsed.items);
        setItemsViewTab("return");
      }
      if (!selectedCustomer && parsed.matchedCustomer) {
        setSelectedCustomer(parsed.matchedCustomer);
      }
      setEditorBanner({
        type: "success",
        text: `↩ Geriqaytarma qaiməsindən ${parsed.items.length} məhsul (${returnTotal.toFixed(2)} ₼) oxundu və çıxılacaq məbləğə əlavə edildi.`,
      });
      return;
    }

    const pastedDifferentDocument = Boolean(
      existingEditorInvoice && (
        existingEditorInvoice.status === "active" ||
        (parsed.invoiceNo && parsed.invoiceNo !== existingEditorInvoice.invoiceNo) ||
        (parsed.matchedCustomer &&
          parsed.matchedCustomer.trim().toLocaleLowerCase("az-AZ") !==
            existingEditorInvoice.customer.trim().toLocaleLowerCase("az-AZ"))
      )
    );
    if (pastedDifferentDocument) {
      setEditingTargetId(null);
      setRestartSourceId(null);
      setSelectedPaymentIds(null); setIncludePastPayment(true);
    }

    setParsedDoc(parsed);
    if (parsed.invoiceNo) setInvoiceNo(parsed.invoiceNo);
    if (parsed.date) setInvoiceDate(parsed.date);
    if (parsed.matchedCustomer) {
      setSelectedCustomer(parsed.matchedCustomer);
      setSelectedPaymentIds(null); setIncludePastPayment(true);
    }
    if (parsed.seller) setSellerName(parsed.seller);
    if (parsed.warehouse) setWarehouseName(parsed.warehouse);
    if (parsed.salesAmount > 0) setSalesInput(String(parsed.salesAmount));
    if (parsed.items.length > 0) {
      setParsedItems(parsed.items);
      setItemsViewTab("sales");
    }

    if (pastedDifferentDocument) {
      setEditorBanner({
        type: "warning",
        text: `Başqa qaimə aşkarlandı. SPF-${existingEditorInvoice?.invoiceNo} dəyişdirilmədən saxlanıldı və sənəd yeni qaimə kimi açıldı.`,
      });
    } else if (parsed.verified) {
      setEditorBanner({
        type: "success",
        text: `${sourceLabel} uğurla oxundu. ${parsed.verificationNote || `${parsed.salesAmount.toFixed(2)} ₼ təsdiqləndi.`}`,
      });
    } else {
      setEditorBanner({
        type: "info",
        text: parsed.verificationNote || `${sourceLabel} sənədindən ${parsed.items.length} məhsul oxundu. Məlumatları nəzərdən keçirin.`,
      });
    }
  };

  const processImageFile = async (file: File | Blob) => {
    try {
      setOcrBusy(true);
      setOcrProgress(5);
      setEditorBanner({ type: "info", text: "Şəkil oxunur və riyazi balans yoxlanılır..." });
      const parsed = await parseImageDocument(file);
      setOcrProgress(100);
      applyParsedDocument(parsed, "Şəkil");
    } catch (err) {
      setEditorBanner({ type: "warning", text: `Sənəd oxunarkən xəta oldu: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setOcrBusy(false);
      setOcrProgress(0);
    }
  };

  const processPdfFile = async (file: File) => {
    try {
      setOcrBusy(true);
      setOcrProgress(5);
      setEditorBanner({ type: "info", text: "PDF yoxlanılır və mətn qatından məlumatlar alınır..." });
      const pdf = await readQaimePdf(file);
      setOcrProgress(45);

      let parsed = pdf.hasEmbeddedText
        ? parseCloudShopInvoiceText(pdf.text, allCustomerOptions)
        : parseCloudShopInvoiceText("", allCustomerOptions);
      if (!pdf.hasEmbeddedText || !parsed.items.length) {
        setEditorBanner({ type: "info", text: "PDF skan sənədidir. Yüksək keyfiyyətli OCR ilə oxunur..." });
        parsed = await parseImageDocument(pdf.previewBlob);
      }
      setOcrProgress(100);
      applyParsedDocument(parsed, "PDF");
    } catch (err) {
      setEditorBanner({ type: "warning", text: `PDF oxunarkən xəta oldu: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setOcrBusy(false);
      setOcrProgress(0);
    }
  };

  const processDocumentFile = (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLocaleLowerCase("en-US").endsWith(".pdf");
    return isPdf ? processPdfFile(file) : processImageFile(file);
  };

  // Global & editor paste handler
  const handlePasteEvent = (e: ClipboardEvent<HTMLDivElement> | Event) => {
    if (!canManageInvoice) return;
    const clipboardData = (e as ClipboardEvent).clipboardData || (window as unknown as { clipboardData?: DataTransfer }).clipboardData;
    if (!clipboardData || !clipboardData.items) return;
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.type.indexOf("image") !== -1 || item.type === "application/pdf") {
        const file = item.getAsFile();
        if (file) {
          if (!editorModalOpen || (ocrTarget === "sales" && existingEditorInvoice?.status === "active")) {
            setEditingTargetId(null);
            setRestartSourceId(null);
            if (!editorModalOpen) openNewForm();
          }
          void processDocumentFile(file);
          break;
        }
      }
    }
  };

  useEffect(() => {
    const listener = (event: Event) => {
      handlePasteEvent(event);
    };
    window.addEventListener("paste", listener);
    return () => window.removeEventListener("paste", listener);
  }, [editorModalOpen, allCustomerOptions, canManageInvoice]);

  // Form actions inside modal: Send to Approval (Draft), Approve, or Reject
  const handleSaveDraft = () => {
    if (!invoiceNo.trim() || !selectedCustomer.trim()) {
      setEditorBanner({ type: "warning", text: "Qaimə nömrəsini və müştərini seçmədən təsdiqə göndərmək olmaz." });
      return;
    }
    const draftId = (editingTargetId && existingEditorInvoice?.status === "draft")
      ? editingTargetId
      : `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record: InvoiceRecord = {
      id: draftId,
      invoiceNo: invoiceNo.trim(),
      date: invoiceDate.trim(),
      customer: selectedCustomer.trim(),
      seller: sellerName.trim(),
      warehouse: warehouseName.trim(),
      salesAmount: currentSalesAmount,
      returnAmount: currentReturnAmount,
      purchaseAmount: currentPurchaseAmount,
      previousDebtSnapshot: effectivePreviousDebt,
      previousPastMonthSnapshot: lockedPayments ? (lockedPayments.previousPastMonthSnapshot ?? 0) : storedPastMonthBalance,
      paymentDeducted: totalDeductiblePayment,
      explicitPaymentSelection: true,
      includePastPayment,
      currentMonthDeducted: lockedPayments ? (lockedPayments.currentMonthDeducted ?? 0) : pendingCurrentMonthSum,
      pastMonthDeducted: lockedPayments ? (lockedPayments.pastMonthDeducted ?? 0) : selectedPastAmount,
      finalDebt: calculatedFinalDebt,
      linkedEntryIds: lockedPayments ? (lockedPayments.linkedEntryIds || []) : selectedPayments.map((e) => e.id),
      linkedEntriesSummary: lockedPayments ? (lockedPayments.linkedEntriesSummary || []) : selectedPayments.map((e) => ({
        id: e.id,
        date: e.date,
        amount: Math.abs(e.amount),
        channel: e.bank?.trim() || "Kassa",
      })),
      items: parsedItems,
      returnItems: returnItems,
      note: docNote.trim(),
      status: "draft",
      createdAt: (existingEditorInvoice?.status === "draft" && existingEditorInvoice?.createdAt) || new Date().toISOString(),
      restartOf: restartSourceId || existingEditorInvoice?.restartOf,
    };
    onConfirmInvoice(record);
    if (statusFilter === "active" || statusFilter === "cancelled") {
      setStatusFilter("all");
    }
    closeEditor();
  };

  const handleSaveAndApprove = () => {
    if (!invoiceNo.trim() || !selectedCustomer.trim()) {
      setEditorBanner({ type: "warning", text: "Qaimə nömrəsini və müştərini seçmədən təsdiqləmək olmaz." });
      return;
    }
    const recordId = (editingTargetId && existingEditorInvoice?.status === "active")
      ? editingTargetId
      : `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record: InvoiceRecord = {
      id: recordId,
      invoiceNo: invoiceNo.trim(),
      date: invoiceDate.trim(),
      customer: selectedCustomer.trim(),
      seller: sellerName.trim(),
      warehouse: warehouseName.trim(),
      salesAmount: currentSalesAmount,
      returnAmount: currentReturnAmount,
      purchaseAmount: currentPurchaseAmount,
      previousDebtSnapshot: effectivePreviousDebt,
      previousPastMonthSnapshot: lockedPayments ? (lockedPayments.previousPastMonthSnapshot ?? 0) : storedPastMonthBalance,
      paymentDeducted: totalDeductiblePayment,
      explicitPaymentSelection: true,
      includePastPayment,
      currentMonthDeducted: lockedPayments ? (lockedPayments.currentMonthDeducted ?? 0) : pendingCurrentMonthSum,
      pastMonthDeducted: lockedPayments ? (lockedPayments.pastMonthDeducted ?? 0) : selectedPastAmount,
      finalDebt: calculatedFinalDebt,
      linkedEntryIds: lockedPayments ? (lockedPayments.linkedEntryIds || []) : selectedPayments.map((e) => e.id),
      linkedEntriesSummary: lockedPayments ? (lockedPayments.linkedEntriesSummary || []) : selectedPayments.map((e) => ({
        id: e.id,
        date: e.date,
        amount: Math.abs(e.amount),
        channel: e.bank?.trim() || "Kassa",
      })),
      items: parsedItems,
      returnItems: returnItems,
      note: docNote.trim(),
      status: "active",
      createdAt: existingEditorInvoice?.createdAt || new Date().toISOString(),
      approvedBy: currentUserName,
      approvedAt: new Date().toISOString(),
      restartOf: restartSourceId || existingEditorInvoice?.restartOf,
    };
    onConfirmInvoice(record);
    if (statusFilter === "draft" || statusFilter === "cancelled") {
      setStatusFilter("all");
    }
    closeEditor();
  };

  const handlePrintPdf = (mode: PrintMode = "bw") => {
    const targetPaper = pdfPaperRef.current || editorPaperRef.current;
    if (!targetPaper) return;
    printQaimeDocument(targetPaper, mode);
  };

  const generateHighResCanvas = async (paperEl: HTMLElement): Promise<HTMLCanvasElement> => {
    const html2canvas = (await import("html2canvas")).default;
    return await html2canvas(paperEl, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: 1200,
      windowHeight: 1800,
      onclone: (_clonedDoc, clonedEl) => {
        _clonedDoc.documentElement.style.setProperty("--daily-display-scale", "1");
        clonedEl.style.transform = "none";
        clonedEl.style.transformOrigin = "initial";
        clonedEl.style.width = "794px";
        clonedEl.style.minWidth = "794px";
        clonedEl.style.maxWidth = "794px";
        clonedEl.style.boxShadow = "none";
        clonedEl.style.margin = "0";

        let parent = clonedEl.parentElement;
        while (parent && parent !== _clonedDoc.body) {
          parent.style.transform = "none";
          parent.style.width = "794px";
          parent.style.maxWidth = "none";
          parent.style.minWidth = "794px";
          parent.style.height = "auto";
          parent.style.maxHeight = "none";
          parent.style.overflow = "visible";
          parent.style.padding = "0";
          parent.style.margin = "0";
          parent = parent.parentElement;
        }

        // Ensure all SVGs and their child paths have explicit concrete colors (Canvas 2D rejects currentColor)
        const svgs = clonedEl.querySelectorAll("svg");
        svgs.forEach((svg) => {
          const computed = window.getComputedStyle(svg);
          const color = computed.color || "#1e293b";

          const currentStroke = svg.getAttribute("stroke");
          if (!currentStroke || currentStroke === "currentColor") {
            svg.setAttribute("stroke", color);
            svg.style.stroke = color;
          }

          const currentFill = svg.getAttribute("fill");
          if (currentFill === "currentColor") {
            svg.setAttribute("fill", color);
            svg.style.fill = color;
          }

          svg.querySelectorAll("path, polygon, circle, line, rect, polyline").forEach((child) => {
            const el = child as SVGElement;
            const childStroke = el.getAttribute("stroke");
            if (childStroke === "currentColor" || (!childStroke && currentStroke === "currentColor")) {
              el.setAttribute("stroke", color);
              el.style.stroke = color;
            }
            const childFill = el.getAttribute("fill");
            if (childFill === "currentColor") {
              el.setAttribute("fill", color);
              el.style.fill = color;
            }
          });
        });
      },
    });
  };

  const handleCopyPaperImage = async () => {
    const targetPaper = pdfPaperRef.current || editorPaperRef.current;
    if (!targetPaper) return;
    try {
      const canvas = await generateHighResCanvas(targetPaper);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob && navigator.clipboard && "write" in navigator.clipboard) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setEditorBanner({ type: "success", text: "Qaimə şəkli kopyalandı! İstədiyiniz yerə yapışdıra bilərsiniz." });
      }
    } catch {
      // ignore
    }
  };

  const handleSharePdf = async () => {
    const targetPaper = pdfPaperRef.current;
    if (!targetPaper || !pdfViewerInvoice) return;
    try {
      const [{ jsPDF }] = await Promise.all([
        import("jspdf"),
      ]);
      const canvas = await generateHighResCanvas(targetPaper);
      const imgWidthMm = 210;
      const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;
      const pdf = new jsPDF({
        unit: "mm",
        format: imgHeightMm > 297 ? [imgWidthMm, imgHeightMm] : "a4",
        orientation: "portrait",
        compress: true,
      });
      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.95),
        "JPEG",
        0,
        0,
        imgWidthMm,
        imgHeightMm > 297 ? imgHeightMm : 297,
        undefined,
        "FAST"
      );
      const blob = pdf.output("blob");
      const file = new File([blob], `QAIME-${pdfViewerInvoice.invoiceNo}.pdf`, { type: "application/pdf" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: pdfViewerInvoice.customer || `Qaimə ${pdfViewerInvoice.invoiceNo}`,
          text: pdfViewerInvoice.customer || "",
          files: [file],
        });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setEditorBanner({ type: "warning", text: "PDF paylaşımı hazırlanmadı. Çap et / PDF düyməsindən istifadə edin." });
    }
  };

  return (
    <>
      {/* =========================================================================
          MAIN TOPLU ONALAMA PƏNCƏRƏSİ (AriX Order ApprovalFormsPage)
      ========================================================================= */}
      <section className="approval-forms-page">
        <header>
          <div className="approval-forms-title">
            <b>Qaimələr</b>
            <span>{filteredInvoices.length} sənəd</span>
          </div>

          <label className="approval-forms-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Form, müştəri və ya təmsilçi axtar..."
            />
            {search && (
              <button type="button" onClick={() => setSearch("")}>
                <X size={14} />
              </button>
            )}
          </label>

          <div className="approval-forms-actions">
            <div className="subview-switch" role="tablist">
              <button
                type="button"
                className={statusFilter === "all" ? "active" : ""}
                onClick={() => setStatusFilter("all")}
              >
                Hamısı
              </button>
              <button
                type="button"
                className={statusFilter === "draft" ? "active" : ""}
                onClick={() => setStatusFilter("draft")}
              >
                Təsdiq gözləyən
              </button>
              <button
                type="button"
                className={statusFilter === "active" ? "active" : ""}
                onClick={() => setStatusFilter("active")}
              >
                Təsdiqlənən
              </button>
              <button
                type="button"
                className={statusFilter === "cancelled" ? "active" : ""}
                onClick={() => setStatusFilter("cancelled")}
              >
                Ləğv edilən
              </button>
            </div>
            <span
              className={`daily-live-indicator ${isLiveConnected ? "connected" : "reconnecting"}`}
              title={isLiveConnected ? "Real-vaxt canlı sinxronizasiya aktivdir (<100ms)" : "Serverlə əlaqə qurulur..."}
            >
              <span className="live-dot" />
              <span>{isLiveConnected ? "Canlı sinxron" : "Qoşulur..."}</span>
            </span>
            {canManageInvoice && <button type="button" className="primary-button" onClick={openNewForm}>
              <Plus size={16} />
              <span>Yeni qaimə</span>
              <small>Ctrl+V</small>
            </button>}
          </div>
        </header>

        {pendingQueueCount > 0 && (
          <div className="daily-sync-banner">
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={16} />
              <span>
                <b>{pendingQueueCount} qaimə</b> serverə çatmayıb (növbədə saxlanılır). Şəbəkə bərpa olunduqda avtomatik göndəriləcək.
              </span>
            </span>
            <button type="button" onClick={() => void flushQueue()}>
              İndi göndər
            </button>
          </div>
        )}

        {filteredInvoices.length === 0 ? (
          <div className="approval-forms-search-empty">
            <FileText size={32} />
            <b>Qaimə və ya sifariş formu tapılmadı</b>
            <span>Ekran görüntüsünü birbaşa buraya yapışdırın (Ctrl+V) və ya yeni form yaradın.</span>
            {canManageInvoice && <button type="button" onClick={openNewForm}>
              + Yeni Form Yarat
            </button>}
          </div>
        ) : (
          <div className="approval-forms-table">
            <div className="approval-forms-table-head">
              <span>PDF</span>
              <span>Durum</span>
              <span>Form / Qaimə</span>
              <span>Müştəri</span>
              <span>Satış təmsilçisi</span>
              <span>Təsdiqləyən</span>
              <span>Sənəd tarixi</span>
            </div>

            {dateGroups.map((group) => (
              <div key={group.date} className="approval-form-date-group">
                <div className="approval-form-date-separator">
                  <CalendarDays size={14} />
                  <b>{group.date}</b>
                  <span>{group.list.length} form</span>
                </div>

                {group.list.map((inv) => {
                  const stateClass =
                    inv.status === "active"
                      ? "approved"
                      : inv.status === "cancelled"
                        ? "rejected"
                        : "pending";
                  return (
                    <article key={inv.id} className="approval-form-row" onContextMenu={(event) => openInvoiceContextMenu(event, inv)}>
                      <span className="approval-form-show-control">
                        <button
                          type="button"
                          className="approval-form-pdf"
                          onClick={() => setPdfViewerInvoice(inv)}
                        >
                          <Eye size={14} />
                          <span>Göstər</span>
                        </button>
                      </span>

                      <span className={`approval-form-state ${stateClass}`}>
                        <i>
                          {stateClass === "approved" ? (
                            <Check size={11} />
                          ) : stateClass === "rejected" ? (
                            <X size={11} />
                          ) : (
                            <Clock size={11} />
                          )}
                        </i>
                        <b>
                          {stateClass === "approved"
                            ? "Təsdiqləndi"
                            : stateClass === "rejected"
                              ? "Reddedildi"
                              : "Təsdiq gözləyir"}
                        </b>
                      </span>

                      <div
                        className="approval-form-open"
                        role={canManageInvoice ? "button" : undefined}
                        tabIndex={canManageInvoice ? 0 : undefined}
                        onClick={() => {
                          if (!canManageInvoice) return;
                          if (inv.status === "cancelled") setPdfViewerInvoice(inv);
                          else openEditorWithInvoice(inv);
                        }}
                        onKeyDown={(e) => {
                          if (!canManageInvoice || (e.key !== "Enter" && e.key !== " ")) return;
                          if (inv.status === "cancelled") setPdfViewerInvoice(inv);
                          else openEditorWithInvoice(inv);
                        }}
                      >
                        <span>
                          <div className="approval-row-inv-title">
                            <b>{displayInvoiceNumber(inv)}</b>
                            {(() => {
                              const syncInfo = getInvoiceSyncState(inv.id, inv.status === "draft");
                              if (syncInfo.state === "synced") {
                                return (
                                  <span className="sync-status-tag synced" title="Serverdə saxlanılıb və sinxronlaşdırılıb">
                                    <span className="sync-status-dot green" />
                                    <span className="sync-status-label">Sinxron</span>
                                  </span>
                                );
                              }
                              if (syncInfo.state === "syncing") {
                                return (
                                  <span className="sync-status-tag syncing" title="Serverə göndərilir...">
                                    <span className="sync-status-dot yellow pulsing" />
                                    <span className="sync-status-label">Göndərilir</span>
                                  </span>
                                );
                              }
                              return (
                                <span className="sync-status-tag failed" title={syncInfo.error || "Serverə getməyib (növbədədir)"}>
                                  <span className="sync-status-dot red" />
                                  <span className="sync-status-label">Oflayn</span>
                                  <button
                                    type="button"
                                    className="sync-retry-inline-btn"
                                    title="Təkrar göndər"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void retryInvoiceSync(inv.id);
                                    }}
                                  >
                                    ↻
                                  </button>
                                </span>
                              );
                            })()}
                          </div>
                          <small>Qaimə #{inv.invoiceNo} · {(inv.items || []).length} kalem</small>
                        </span>
                        <span>
                          <b>{inv.customer}</b>
                          <small>Borc: {formatMoney(Number(inv.finalDebt || 0), "AZN")}</small>
                        </span>
                        <span>
                          <b>{inv.seller || currentUserName}</b>
                          <small>Satış: {formatMoney(Number(inv.salesAmount || 0), "AZN")}</small>
                        </span>
                        <span>
                          <b>{inv.approvedBy || (inv.status === "draft" ? "Gözləyir" : "Ləğv edildi")}</b>
                          <small>{inv.status === "active" ? "Təsdiqləndi" : "—"}</small>
                        </span>
                        <span>
                          <b>{inv.date}</b>
                          <small>Anbar: {inv.warehouse || "ANAnas"}</small>
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* =========================================================================
          APPROVAL FORM MODAL (AriX Order ApprovalFormModal split workspace:
          Left: .approval-editor + Right: .approval-paper-wrap)
      ========================================================================= */}
      {editorModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal wide approval-modal">
            <header>
              <button
                type="button"
                className="modal-back"
                onClick={closeEditor}
              >
                <ArrowLeft size={16} />
                <span>Geri</span>
              </button>
              <div className="modal-heading">
                <h2>SPF-{invoiceNo} · Sifariş təsdiq formu</h2>
                <p>Ekran görüntüsünü yapışdırın (Ctrl+V) və ya xanaları redaktə edin.</p>
              </div>
              <button
                type="button"
                className="close"
                onClick={closeEditor}
              >
                <X size={19} />
              </button>
            </header>

            <div className="modal-body">
              {editorBanner && (
                <div
                  className={`sync-warning ${editorBanner.type === "success" ? "success-sync" : ""}`}
                  style={{
                    borderColor: editorBanner.type === "success" ? "#86efac" : undefined,
                    background: editorBanner.type === "success" ? "#f0fdf4" : undefined,
                    color: editorBanner.type === "success" ? "#166534" : undefined,
                  }}
                >
                  <div className="sync-warning-dot" />
                  <div>
                    <b>Bildiriş</b>
                    <span>{editorBanner.text}</span>
                  </div>
                </div>
              )}

              <div className="approval-workspace">
                {/* LEFT: APPROVAL EDITOR */}
                <div className="approval-editor">
                  {/* OCR Target Selector Tabs */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                    <button
                      type="button"
                      onClick={() => { setOcrTarget("sales"); setItemsViewTab("sales"); }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "7px",
                        border: ocrTarget === "sales" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                        background: ocrTarget === "sales" ? "#eff6ff" : "#ffffff",
                        color: ocrTarget === "sales" ? "#1e40af" : "#475569",
                        fontWeight: 700,
                        fontSize: "12.5px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        cursor: "pointer",
                      }}
                    >
                      <span>🛒 1. Satış Qaiməsi OCR</span>
                      {parsedItems.length > 0 && (
                        <span style={{ fontSize: "10.5px", background: "#dbeafe", padding: "1px 6px", borderRadius: "8px", color: "#1e40af" }}>
                          {parsedItems.length} məhsul
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOcrTarget("return"); setItemsViewTab("return"); }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "7px",
                        border: ocrTarget === "return" ? "2px solid #dc2626" : "1px solid #cbd5e1",
                        background: ocrTarget === "return" ? "#fef2f2" : "#ffffff",
                        color: ocrTarget === "return" ? "#991b1b" : "#475569",
                        fontWeight: 700,
                        fontSize: "12.5px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        cursor: "pointer",
                      }}
                    >
                      <span>↩ 2. Geriqaytarma OCR</span>
                      {returnItems.length > 0 ? (
                        <span style={{ fontSize: "10.5px", background: "#fee2e2", padding: "1px 6px", borderRadius: "8px", color: "#991b1b" }}>
                          {returnItems.length} məhsul
                        </span>
                      ) : (
                        <span style={{ fontSize: "10px", color: "#94a3b8" }}>İstəyə görə</span>
                      )}
                    </button>
                  </div>

                  {/* OCR & Paste Trigger Bar */}
                  <div
                    className="approval-domestic-line-action"
                    style={{
                      borderColor: ocrTarget === "return" ? "#fca5a5" : undefined,
                      background: ocrTarget === "return" ? "#fff5f5" : undefined,
                    }}
                  >
                    <label>
                      <ImageIcon size={16} />
                      <button
                        type="button"
                        className="brand-upload-button"
                        style={{
                          background: ocrTarget === "return" ? "#dc2626" : undefined,
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={ocrBusy}
                      >
                        <Upload size={14} />
                        <span>
                          {ocrBusy
                            ? `Oxunur... ${ocrProgress}%`
                            : ocrTarget === "sales"
                              ? "Satış sənədini seç və ya Ctrl+V"
                              : "Geriqaytarma sənədini seç və ya Ctrl+V"}
                        </span>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf,image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.currentTarget.value = "";
                          if (file) {
                            if (ocrTarget === "sales" && existingEditorInvoice?.status === "active") {
                              setEditingTargetId(null);
                              setRestartSourceId(null);
                            }
                            void processDocumentFile(file);
                          }
                        }}
                      />
                    </label>
                    <small>
                      {ocrTarget === "sales"
                        ? "Satış qaiməsi skrinşotu / PDF-i (Ctrl+V yapışdırıla bilər). Mallar satış cədvəlinə düşəcək."
                        : "Geriqaytarma qaiməsi skrinşotu / PDF-i (Ctrl+V yapışdırıla bilər). Mallar qaytarma cədvəlinə və borcdan çıxılan məbləğə düşəcək."}
                    </small>
                  </div>

                  {/* Header metadata fields */}
                  <div className="approval-fields four">
                    <label>
                      <span>Form / Qaimə №</span>
                      <input
                        value={invoiceNo}
                        onChange={(e) => setInvoiceNo(e.target.value)}
                        placeholder="32609"
                      />
                    </label>
                    <label>
                      <span>Sənəd tarixi</span>
                      <input
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        placeholder="31.10.2026"
                      />
                    </label>
                    <label>
                      <span>Müştəri</span>
                      <input
                        list="arix-approval-customers-list"
                        value={selectedCustomer}
                        onChange={(e) => { setSelectedCustomer(e.target.value); setSelectedPaymentIds(null); setIncludePastPayment(true); }}
                        placeholder="Müştəri adı"
                      />
                      <datalist id="arix-approval-customers-list">
                        {allCustomerOptions.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </label>
                    <label>
                      <span>Satış təmsilçisi</span>
                      <input
                        value={sellerName}
                        onChange={(e) => setSellerName(e.target.value)}
                        placeholder="Arif Mahmud"
                      />
                    </label>
                  </div>

                  {/* Financial Fields */}
                  <div className="approval-fields three">
                    <label>
                      <span>Cari Qaimə Satışı (AZN)</span>
                      <input
                        inputMode="decimal"
                        value={salesInput}
                        onChange={(e) => setSalesInput(e.target.value)}
                        placeholder="0.00"
                      />
                    </label>
                    <label>
                      <span style={{ color: Number(returnInput) > 0 ? "#b91c1c" : undefined }}>
                        Geri Qaytarma Məbləği (AZN)
                      </span>
                      <input
                        inputMode="decimal"
                        value={returnInput}
                        onChange={(e) => setReturnInput(e.target.value)}
                        placeholder="0.00"
                        style={{
                          borderColor: Number(returnInput) > 0 ? "#fca5a5" : undefined,
                          background: Number(returnInput) > 0 ? "#fff5f5" : undefined,
                        }}
                      />
                    </label>
                    <label>
                      <span>Əvvəlki Borc Qalığı (AZN)</span>
                      <input
                        inputMode="decimal"
                        value={String(effectivePreviousDebt)}
                        readOnly
                        placeholder="0.00"
                      />
                    </label>
                  </div>

                  {/* Deducted Payments strip */}
                  <div
                    style={{
                      border: "1px solid #dce2eb",
                      borderRadius: "7px",
                      background: "#fff",
                      padding: "10px 12px",
                      display: "grid",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <b>Gündəlik Dəftərdən Çıxılan Ödənişlər</b>
                      <strong style={{ color: "#087a55" }}>−{formatMoney(totalDeductiblePayment, "AZN")}</strong>
                    </div>
                    <small style={{ color: "#667085" }}>
                      {lockedPayments ? "Təsdiq zamanı qeydə alınan ödənişlər. Yeni ödənişlər növbəti qaimə üçün qalır." : <>
                      Seçilən {selectedPayments.length} ödəniş (
                      {formatMoney(pendingCurrentMonthSum, "AZN")})
                      {selectedPastAmount > 0 &&
                        ` + Keçən aydan qalan qalıq (${formatMoney(selectedPastAmount, "AZN")})`}
                      </>}
                    </small>
                  </div>

                  {!lockedPayments && <fieldset className="invoice-payment-options">
                    <legend>Bu qaiməyə daxil ediləcək ödənişlər</legend>
                    {customerPendingEntries.map((entry) => <label key={entry.id}>
                      <input type="checkbox" checked={selectedPayments.some((payment) => payment.id === entry.id)}
                        onChange={(event) => setSelectedPaymentIds((current) => {
                          const ids = current ?? customerPendingEntries.map((payment) => payment.id);
                          return event.target.checked ? [...ids, entry.id] : ids.filter((id) => id !== entry.id);
                        })} />
                      {entry.date} · {entry.bank || "Kassa"} · {formatMoney(Math.abs(entry.amount), "AZN")}
                    </label>)}
                    {storedPastMonthBalance > 0 && <label><input type="checkbox" checked={includePastPayment}
                      onChange={(event) => setIncludePastPayment(event.target.checked)} /> Keçən aydan qalan ödəniş · {formatMoney(storedPastMonthBalance, "AZN")}</label>}
                    {!customerPendingEntries.length && storedPastMonthBalance <= 0 && <small>Gözləyən ödəniş yoxdur.</small>}
                    <small>Seçilməyən ödənişlər növbəti qaimə üçün qalır.</small>
                  </fieldset>}

                  {/* Product items table */}
                  <div>
                    {/* Items Tab Switcher */}
                    <div style={{ display: "flex", gap: "6px", margin: "14px 0 8px" }}>
                      <button
                        type="button"
                        onClick={() => setItemsViewTab("sales")}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border: itemsViewTab === "sales" ? "2px solid #2563eb" : "1px solid #cbd5e1",
                          background: itemsViewTab === "sales" ? "#eff6ff" : "#f8fafc",
                          color: itemsViewTab === "sales" ? "#1d4ed8" : "#475569",
                          fontWeight: 700,
                          fontSize: "12px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <span>🛒 Satılan Mallar</span>
                        <span style={{ fontSize: "10px", background: "#dbeafe", padding: "1px 6px", borderRadius: "10px" }}>
                          {parsedItems.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemsViewTab("return")}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border: itemsViewTab === "return" ? "2px solid #dc2626" : "1px solid #cbd5e1",
                          background: itemsViewTab === "return" ? "#fef2f2" : "#f8fafc",
                          color: itemsViewTab === "return" ? "#b91c1c" : "#475569",
                          fontWeight: 700,
                          fontSize: "12px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <span>↩ Geri Qaytarılan Mallar</span>
                        <span
                          style={{
                            fontSize: "10px",
                            background: returnItems.length > 0 ? "#fee2e2" : "#e2e8f0",
                            color: returnItems.length > 0 ? "#991b1b" : "#64748b",
                            padding: "1px 6px",
                            borderRadius: "10px",
                          }}
                        >
                          {returnItems.length}
                        </span>
                      </button>
                    </div>

                    <div className="approval-line-head">
                      <span>Məhsul adı</span>
                      <span>Artikul / Kod</span>
                      <span>Vahid</span>
                      <span>Miqdar</span>
                      <span>Qiymət</span>
                      <span>Məbləğ</span>
                    </div>
                    <div className="approval-lines">
                      {(itemsViewTab === "sales" ? parsedItems : returnItems).length === 0 ? (
                        <div style={{ padding: "20px", textAlign: "center", color: "#667085", fontSize: "11px" }}>
                          {itemsViewTab === "sales"
                            ? "Satış məhsul siyahısı boşdur. Ekran görüntüsü yapışdırın və ya aşağıdan məhsul əlavə edin."
                            : "Geri qaytarılan məhsul yoxdur. Geriqaytarma sənədini yapışdırın və ya aşağıdan əlavə edin."}
                        </div>
                      ) : (
                        (itemsViewTab === "sales" ? parsedItems : returnItems).map((item, idx) => (
                          <div key={`${item.no || idx}-${item.name}`} className="approval-line">
                            <label>
                              <input
                                value={item.name}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const autoCode = knownProductCatalog[val.trim()] || "";
                                  if (itemsViewTab === "sales") {
                                    setParsedItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, name: val, code: it.code || autoCode } : it))
                                    );
                                  } else {
                                    setReturnItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, name: val, code: it.code || autoCode } : it))
                                    );
                                  }
                                }}
                              />
                            </label>
                            <label>
                              <input
                                value={item.code}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (itemsViewTab === "sales") {
                                    setParsedItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, code: val } : it))
                                    );
                                  } else {
                                    setReturnItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, code: val } : it))
                                    );
                                  }
                                }}
                                placeholder="ES 2702"
                              />
                            </label>
                            <label>
                              <select
                                value={item.unit || "metr"}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (itemsViewTab === "sales") {
                                    setParsedItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, unit: val } : it))
                                    );
                                  } else {
                                    setReturnItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, unit: val } : it))
                                    );
                                  }
                                }}
                              >
                                <option value="metr">metr</option>
                                <option value="ədəd">ədəd</option>
                                <option value="kq">kq</option>
                                <option value="litr">litr</option>
                                <option value="paçka">paçka</option>
                                <option value="rulo">rulo</option>
                                <option value="m²">m²</option>
                              </select>
                            </label>
                            <label>
                              <DecimalInput
                                value={item.quantity}
                                onChange={(val) => {
                                  if (itemsViewTab === "sales") {
                                    setParsedItems((prev) =>
                                      prev.map((it, i) =>
                                        i === idx
                                          ? { ...it, quantity: val, total: Math.round(val * it.price * 100) / 100 }
                                          : it
                                      )
                                    );
                                  } else {
                                    setReturnItems((prev) =>
                                      prev.map((it, i) =>
                                        i === idx
                                          ? { ...it, quantity: val, total: Math.round(val * it.price * 100) / 100 }
                                          : it
                                      )
                                    );
                                  }
                                }}
                              />
                            </label>
                            <label>
                              <DecimalInput
                                value={item.price}
                                onChange={(val) => {
                                  if (itemsViewTab === "sales") {
                                    setParsedItems((prev) =>
                                      prev.map((it, i) =>
                                        i === idx
                                          ? { ...it, price: val, total: Math.round(it.quantity * val * 100) / 100 }
                                          : it
                                      )
                                    );
                                  } else {
                                    setReturnItems((prev) =>
                                      prev.map((it, i) =>
                                        i === idx
                                          ? { ...it, price: val, total: Math.round(it.quantity * val * 100) / 100 }
                                          : it
                                      )
                                    );
                                  }
                                }}
                              />
                            </label>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <b style={{ fontSize: "11px", color: itemsViewTab === "return" ? "#b91c1c" : undefined }}>
                                {itemsViewTab === "return" ? "−" : ""}{item.total.toFixed(2)} ₼
                              </b>
                              <button
                                type="button"
                                style={{ border: 0, background: "none", color: "#c8283c", cursor: "pointer" }}
                                onClick={() => {
                                  if (itemsViewTab === "sales") {
                                    setParsedItems((prev) => prev.filter((_, i) => i !== idx));
                                  } else {
                                    setReturnItems((prev) => prev.filter((_, i) => i !== idx));
                                  }
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      className="approval-manual-line-action"
                      style={{ width: "100%", justifyContent: "center", cursor: "pointer" }}
                      onClick={() => {
                        const newItem = {
                          no: (itemsViewTab === "sales" ? parsedItems : returnItems).length + 1,
                          name: itemsViewTab === "sales" ? "Yeni Məhsul" : "Qaytarılan Məhsul",
                          code: "",
                          quantity: 1,
                          unit: "metr",
                          price: 0,
                          discount: 0,
                          total: 0,
                        };
                        if (itemsViewTab === "sales") {
                          setParsedItems((prev) => [...prev, newItem]);
                        } else {
                          setReturnItems((prev) => [...prev, newItem]);
                        }
                      }}
                    >
                      <Plus size={14} /> <span>+ {itemsViewTab === "sales" ? "Satış sətiri əlavə et" : "Qaytarma sətiri əlavə et"}</span>
                    </button>
                  </div>
                </div>

                {/* RIGHT: APPROVAL PAPER PREVIEW (Exact A4 Form) */}
                <div className="approval-paper-wrap">
                  <div className="approval-preview-label">A4 formun ön baxışı</div>
                  <QaimePreviewStage invoice={editorPreviewInvoice} paperRef={editorPaperRef} mode="editor" />
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <div className="approval-action-group approval-action-group-start">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeEditor}
                >
                  <X size={15} />
                  <span>İmtina et</span>
                </button>
                {canManageInvoice && (!existingEditorInvoice || canRestartInvoice) && <button
                  type="button"
                  className="secondary approval-action-restart"
                  onClick={startPreparedInvoiceOver}
                >
                  <RotateCcw size={15} />
                  <span>Başdan başla</span>
                </button>}
                {existingEditorInvoice && canDeleteInvoicePermanently && <button
                  type="button"
                  className="secondary approval-action-delete"
                  onClick={() => permanentlyDeleteInvoice(existingEditorInvoice)}
                >
                  <Trash2 size={15} />
                  <span>Qalıcı sil</span>
                </button>}
              </div>
              <div className="approval-action-group approval-action-group-end">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void handleCopyPaperImage()}
                >
                  <Copy size={15} />
                  <span>Şəkli kopyala</span>
                </button>
                <QaimePrintButton
                  className="secondary"
                  size={15}
                  dropUp={true}
                  onPrint={(mode) => handlePrintPdf(mode)}
                />
                {canManageInvoice && <button
                  type="button"
                  className="secondary"
                  onClick={handleSaveDraft}
                >
                  <Clock size={15} />
                  <span>Təsdiqə göndər</span>
                </button>}
                {canApproveInvoice && <button
                  type="button"
                  className="primary"
                  onClick={handleSaveAndApprove}
                >
                  <Check size={16} />
                  <span>Formu təsdiqlə</span>
                </button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          FULL SCREEN PDF VIEWER (AriX Order ApprovalPdfViewer style with
          Üst panel: Geri | Məlumat | Təsdiqlə | Rədd et | Düzəlt | Köçür | Çap et)
      ========================================================================= */}
      {pdfViewerInvoice && (
        <div className="approval-pdf-viewer" role="dialog" aria-modal="true">
          <header>
            <button type="button" onClick={() => setPdfViewerInvoice(null)}>
              <ArrowLeft size={17} />
              <span>Geri</span>
            </button>
            <div>
              <b>{displayInvoiceNumber(pdfViewerInvoice)} · {pdfViewerInvoice.customer}</b>
              <small>{pdfViewerInvoice.seller || currentUserName} · {pdfViewerInvoice.date}</small>
            </div>
            <nav>
              {pdfViewerInvoice.status === "draft" && canApproveInvoice && (
                <button
                  type="button"
                  className="approval-viewer-approve"
                  onClick={() => {
                    onApproveInvoice(pdfViewerInvoice.id);
                    setPdfViewerInvoice(null);
                  }}
                >
                  <Check size={16} />
                  <span>Təsdiqlə</span>
                </button>
              )}
              {pdfViewerInvoice.status !== "cancelled" && canApproveInvoice && (
                <button
                  type="button"
                  className="approval-viewer-reject"
                  onClick={() => {
                    const reason = window.prompt("Ləğv səbəbini yazın:", "");
                    if (reason === null) return;
                    onCancelInvoice(pdfViewerInvoice.id, reason);
                    setPdfViewerInvoice(null);
                  }}
                >
                  <X size={16} />
                  <span>Rədd et / Ləğv et</span>
                </button>
              )}
              {pdfViewerInvoice.status !== "cancelled" && canManageInvoice && <button
                type="button"
                onClick={() => {
                  const inv = pdfViewerInvoice;
                  setPdfViewerInvoice(null);
                  openEditorWithInvoice(inv);
                }}
              >
                <Pencil size={16} />
                <span>Düzəlt</span>
              </button>}
              {canRestartInvoice && <button
                type="button"
                className="approval-viewer-restart"
                onClick={() => restartInvoiceInEditor(pdfViewerInvoice)}
              >
                <RotateCcw size={16} />
                <span>Başdan başla</span>
              </button>}
              {canDeleteInvoicePermanently && <button
                type="button"
                className="approval-viewer-delete"
                onClick={() => permanentlyDeleteInvoice(pdfViewerInvoice)}
              >
                <Trash2 size={16} />
                <span>Qalıcı sil</span>
              </button>}
              <button type="button" onClick={() => void handleCopyPaperImage()}>
                <Copy size={16} />
                <span>Şəkli kopyala</span>
              </button>
              <button type="button" onClick={() => void handleSharePdf()}>
                <Share2 size={16} />
                <span>Paylaş</span>
              </button>
              <QaimePrintButton
                size={16}
                onPrint={(mode) => handlePrintPdf(mode)}
              />
            </nav>
          </header>
          <main>
            {pdfViewerInvoice && (
              <QaimePreviewStage
                invoice={pdfViewerInvoice}
                paperRef={pdfPaperRef}
                mode="viewer"
              />
            )}
          </main>
        </div>
      )}

      {invoiceContextMenu && createPortal((() => {
        const inv = invoiceContextMenu.invoice;
        const left = Math.max(10, Math.min(invoiceContextMenu.x, window.innerWidth - 282));
        const top = Math.max(10, Math.min(invoiceContextMenu.y, window.innerHeight - 420));
        const closeAnd = (action: () => void) => () => { setInvoiceContextMenu(null); action(); };
        return (
          <div className="daily-context-menu-backdrop invoice-context-menu-backdrop" role="presentation" onContextMenu={(event) => { event.preventDefault(); setInvoiceContextMenu(null); }}>
            <div ref={invoiceContextMenuRef} className="daily-context-menu invoice-context-menu" style={{ left, top }} role="menu" aria-label="Qaimə menyusu">
              <header>
                <span><FileText size={14} /></span>
                <div><b>{displayInvoiceNumber(inv)}</b><small>{inv.customer || "Müştəri qeyd edilməyib"} · {inv.status === "active" ? "Təsdiqlənib" : inv.status === "cancelled" ? "Ləğv edilib" : "Təsdiq gözləyir"}</small></div>
              </header>
              <button type="button" className="is-primary" onClick={closeAnd(() => setPdfViewerInvoice(inv))}><Eye size={16} /><span><b>Qaiməni göstər</b><small>PDF görünüşü, çap və paylaşım</small></span></button>
              {canManageInvoice && inv.status !== "cancelled" && <button type="button" onClick={closeAnd(() => openEditorWithInvoice(inv))}><Pencil size={16} /><span><b>Qaiməni düzəlt</b><small>Müştəri, məbləğ və məhsullar</small></span></button>}
              {inv.status === "draft" && canApproveInvoice && <button type="button" onClick={closeAnd(() => onApproveInvoice(inv.id))}><Check size={16} /><span><b>Qaiməni təsdiqlə</b><small>Təsdiq gözləməsini bitir</small></span></button>}
              {inv.status !== "cancelled" && canApproveInvoice && <button type="button" onClick={closeAnd(() => { const reason = window.prompt("Ləğv səbəbini yazın:", ""); if (reason !== null) onCancelInvoice(inv.id, reason); })}><X size={16} /><span><b>Rədd et / ləğv et</b><small>Qaiməni ləğv edilmiş et</small></span></button>}
              {canRestartInvoice && <button type="button" onClick={closeAnd(() => restartInvoiceInEditor(inv))}><RotateCcw size={16} /><span><b>Başdan başla</b><small>Yeni təmiz qaimə versiyası yarat</small></span></button>}
              {canDeleteInvoicePermanently && <button type="button" onClick={closeAnd(() => permanentlyDeleteInvoice(inv))}><Trash2 size={16} /><span><b>Qalıcı sil</b><small>Siyahıdan sil, audit izi qalır</small></span></button>}
              <button type="button" onClick={() => void copyInvoiceDetails(inv)}><Copy size={16} /><span><b>Məlumatı kopyala</b><small>Nömrə, müştəri, tarix və məbləğ</small></span></button>
            </div>
          </div>
        );
      })(), document.body)}
    </>
  );
}
