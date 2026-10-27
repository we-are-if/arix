import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import readXlsxFile, { readSheet } from "read-excel-file/browser";
import { ArrowLeft, Bell, Building2, CalendarDays, Camera, Check, CircleDollarSign, ClipboardCopy, Download, Eye, FileText, HandCoins, Layers3, ListChecks, Lock, LockOpen, Moon, NotepadText, Pencil, Plus, Printer, ScanText, Scissors, Search, Settings2, Share2, Smartphone, Sun, Trash2, Truck, UserRound, X } from "lucide-react";
import AriXLogo from "../../src/components/AriXLogo";

const pdfWorkerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
let pdfRendererPromise: ReturnType<typeof importPdfRenderer> | null = null;

function importPdfRenderer() {
  return import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    return pdfjs;
  });
}

function preloadPdfRenderer() {
  if (!pdfRendererPromise) {
    pdfRendererPromise = importPdfRenderer();
  }
  return pdfRendererPromise;
}

type Product = {
  id: number;
  name: string;
  code?: string;
  sku?: string;
  unit?: string;
  physicalQuantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  rollCount?: number;
};
type Customer = {
  id: string;
  name: string;
  phone?: string;
  contact?: string;
  salesRepresentative?: string;
  salesRepresentativeUserId?: string;
  folderName?: string;
  addressLine1?: string;
  addressLine2?: string;
  address?: string;
  email?: string;
  note?: string;
  prices?: Record<string, number>;
  customerType?: "domestic" | "foreign";
  country?: string;
  priceLists?: Record<string, Record<string, number>>;
};

function defaultExportDiscount(customerName: string) {
  const key = customerName.trim().toLocaleUpperCase("tr").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ");
  return ["DOORKA", "MDOOR", "MAHA", "MEMBRAN GROUP", "OGUZ PANEL"].some((name) => key.includes(name)) ? 20 : 0;
}
type AliasRule = { trigger: string; replacement: string; category?: string };
type Employee = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  active: boolean;
  permissions?: string[];
  notificationPreferences?: { inApp: boolean; push: boolean; events: Record<string, boolean> };
  notificationPermissions?: { events: Record<string, boolean> };
  pushDeviceCount?: number;
  pushLastRegisteredAt?: string | null;
  pushLastError?: string;
};
type PermissionDefinition = { key: string; group: string; action: string };
type StockImportHistory = {
  id: string; sourceName: string; sourceDate: string; importedAt: string;
  importedBy: string; updated: number; created: number;
};
type OrderStockMovement = {
  id: string; orderNumber: string; customerName: string; productCode?: string; productName: string;
  customerQuantity: number; cutAllowanceQuantity: number; stockQuantity: number; cutPieceCount: number;
  createdAt: string; createdBy: string;
};
type StockTransaction = {
  id: string; documentNumber: string; productId: number; productCode: string; productName: string;
  type: "adjustment" | "writeoff" | "transfer" | "purchase" | "loan_purchase";
  quantity: number; rollCount: number; signedQuantity: number; beforeQuantity: number; afterQuantity: number;
  beforeRollCount: number; afterRollCount: number; fromLocation?: string; toLocation?: string;
  counterparty?: string; note: string; loanOutstanding?: number; createdAt: string; createdBy: string;
  attachment?: { name: string; mimeType: string; archivedFile: string; size: number } | null;
};
type StockDocument = {
  id: string; documentNumber: string; type: StockTransaction["type"]; date: string; counterparty?: string;
  fromLocation?: string; toLocation?: string; note: string; createdAt: string; createdBy: string;
  lines: Array<{ productId: number; productCode: string; productName: string; quantity: number; rollCount: number; signedQuantity: number; loanOutstanding?: number; loanOutstandingRollCount?: number }>;
  attachments: Array<{ name: string; mimeType: string; archivedFile: string; size: number }>;
};
type AccessLog = {
  id: string; action: "page_view" | "order_view" | "app_open"; page: string; orderId?: string; orderNumber?: string;
  userId: string; userName: string; role: string; ip: string; userAgent: string; createdAt: string;
};

type Match = {
  source: string;
  productId: number | null;
  productName: string;
  productCode: string;
  quantity: number | null;
  unit?: "mt" | "rulo";
  orderedRollCount?: number;
  lineNote?: string;
  confidence: number;
  needsReview: boolean;
  cutAllowanceApplied?: boolean;
  cutPieceCount?: number;
  cutAllowancePerPiece?: number;
  cutAllowanceMeters?: number;
  stockConsumptionQuantity?: number;
  alternatives: Array<{
    id: number;
    name: string;
    code: string;
    confidence?: number;
  }>;
};

const withoutCutAllowance = <T extends Match>(item: T): T => {
  return {
    ...item,
    cutAllowanceApplied: false,
    cutPieceCount: 0,
    cutAllowancePerPiece: 0,
    cutAllowanceMeters: 0,
    stockConsumptionQuantity: Number(item.quantity) || 0,
  };
};

const cutAllowanceTotal = (item: Match) => {
  if (!item.cutAllowanceApplied) return 0;
  const requestedPerPiece = Number(item.cutAllowancePerPiece);
  const perPiece = Number.isFinite(requestedPerPiece) ? Math.max(0, requestedPerPiece) : 0.2;
  return Math.max(1, Math.trunc(Number(item.cutPieceCount) || 1)) * perPiece;
};
const cutAllowancePerPieceValue = (item: Match) => {
  const value = Number(item.cutAllowancePerPiece);
  return Number.isFinite(value) ? Math.max(0, value) : 0.2;
};

function EditableNumberInput({ value, min, step, onValueChange, onValueCommit }: {
  value: number;
  min: number;
  step: number;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const commit = () => {
    focused.current = false;
    const parsed = Number(draft);
    const next = draft.trim() === "" || !Number.isFinite(parsed) ? value : Math.max(min, parsed);
    setDraft(String(next));
    onValueChange(next);
    onValueCommit?.(next);
  };

  return (
    <input
      type="number"
      min={min}
      step={step}
      inputMode="decimal"
      value={draft}
      onFocus={(event) => {
        focused.current = true;
        event.currentTarget.select();
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        if (nextDraft.trim() === "") return;
        const parsed = Number(nextDraft);
        if (Number.isFinite(parsed)) onValueChange(Math.max(min, parsed));
      }}
      onBlur={commit}
    />
  );
}

type OrderItem = Match & {
  preparedQuantity: number | null;
  preparedRollCount?: number | null;
  preparedBy?: string;
  preparedByUserId?: string;
  preparedAt?: string;
};

const CUT_ALLOWANCE_REQUIRED_BELOW_METERS = 70;

const requiresCutAllowance = (item: OrderItem, preparedQuantity = Number(item.preparedQuantity ?? item.quantity) || 0) =>
  preparedQuantity > 0 && preparedQuantity < CUT_ALLOWANCE_REQUIRED_BELOW_METERS;

const hasRequiredCutAllowance = (item: OrderItem) =>
  !requiresCutAllowance(item) || (item.cutAllowanceApplied === true && cutAllowanceTotal(item) > 0);

const requiredCutAllowancePatch = (item: OrderItem, preparedQuantity: number) => {
  if (!(preparedQuantity > 0 && preparedQuantity < CUT_ALLOWANCE_REQUIRED_BELOW_METERS)) return {};
  return {
    cutAllowanceApplied: true,
    cutPieceCount: Math.max(1, Number(item.cutPieceCount) || 1),
    cutAllowancePerPiece: Math.max(0.2, cutAllowancePerPieceValue(item)),
  };
};
type OrderAudit = {
  id: string;
  action: string;
  itemIndex?: number;
  productId?: number;
  productName?: string;
  oldValue?: string | number | null;
  newValue?: string | number;
  by: string;
  userId?: string;
  at: string;
  reason?: string;
};
type OrderAttachment = {
  id: string;
  kind: "orderForm" | "despatch" | "deliveryProof";
  name: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
  deletedAt?: string;
  deletedBy?: string;
};
type ApprovalFormLine = {
  productId: number | null;
  productCode: string;
  productName: string;
  quantity: number;
  rollCount: number;
  width?: number;
  unitPrice: number;
  discountRate: number;
  vatRate: number;
  unit?: "M2" | "M" | "ROLL" | "BOX" | "PCS" | "KG" | "SET" | "PALLET";
  unitsPerBox?: number;
  manual?: boolean;
  packageCount?: number;
  netWeight?: number;
  grossWeight?: number;
  hsCode?: string;
  countryOfOrigin?: string;
};
type ApprovalForm = {
  number: string;
  documentType?: "domestic" | "proforma" | "commercial_invoice" | "packing_list";
  proformaNumber?: string;
  invoiceNumber?: string;
  shipmentDate?: string;
  palletDistribution?: number[];
  palletAllocations?: Array<Array<{ lineIndex: number; rolls: number; quantity?: number }>>;
  allowSeventeenRollPallet?: boolean;
  palletDetails?: Array<{
    grossWeight: number;
    tareWeight: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
  }>;
  date: string;
  revisionDate?: string;
  salesRepresentative?: string;
  salesRepresentativeUserId?: string;
  currency: "TRY" | "USD" | "EUR";
  exchangeRate: number;
  priceSource?: "DEPO" | "ANTREPO_TRANSIT";
  priceFactor?: 1 | 0.5;
  vatIncluded: boolean;
  lines: ApprovalFormLine[];
  overallDiscountRate?: number;
  extraCharge: number;
  extraChargeLabel: string;
  paymentTerms: string;
  deliveryTerms: string;
  note: string;
  status: "draft" | "approved" | "rejected";
  preparedAt?: string;
  preparedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  customerName?: string;
  customerContact?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerTaxOffice?: string;
  customerTaxNumber?: string;
  packageType?: string;
  productDescription?: string;
  incoterm?: string;
  shipmentPort?: string;
  destination?: string;
  countryOfOrigin?: string;
  bankName?: string;
  swiftCode?: string;
  iban?: string;
  buyerOrderNumber?: string;
  transportMode?: string;
  vehicleContainerNumber?: string;
  transportDocumentNumber?: string;
  loadingPlace?: string;
  marksAndNumbers?: string;
  freightAmount?: number;
  insuranceAmount?: number;
  exporterDeclaration?: string;
  updatedAt?: string;
  updatedBy?: string;
  archive?: {
    path: string;
    windowsPath?: string;
    filename: string;
    archivedAt: string;
    archivedBy: string;
    status?: "draft" | "approved";
  };
};

const DOMESTIC_GENERAL_TERMS = [
  "Fiyatlarımıza KDV dahil değildir.",
  "Faturadaki döviz kuru, bir önceki iş gününün TCMB efektif satış kuru olacak şekilde alınacaktır.",
  "Yukarıda belirtilen malzemelerin fiyatları depo teslim fiyatlarıdır. Kargo ve nakliye bedeli alıcıya aittir.",
  "Ürünler, mümkün olan en kısa sürede alıcının belirttiği kargo ya da nakliye firmasına yönlendirilir.",
  "Anlaşılmayan hususlarda lütfen ilgili satış sorumlumuz ile temasa geçiniz.",
] as const;
const EXPORT_GENERAL_TERMS = [
  "Prices and amounts are stated in the currency shown on this proforma invoice.",
  "Bank charges outside Türkiye are payable by the buyer.",
  "Delivery, cost and risk responsibilities are governed by the stated Incoterms® 2020 rule.",
  "Final quantities and shipment details will be confirmed on the commercial invoice and packing list.",
] as const;
type CompanyPrintSettings = {
  companyName: string;
  brandSubtitle?: string;
  addressLine?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxOffice?: string;
  taxNumber?: string;
  companyLogo: string;
  companyStamp?: string;
};
type Order = {
  id: string;
  number: string;
  customerName: string;
  note?: string;
  originalText?: string;
  originalItems?: OrderItem[];
  status: Status;
  items: OrderItem[];
  createdBy: string;
  createdByUserId?: string | null;
  businessDate?: string;
  preparedBy?: string;
  createdAt: string;
  updatedAt?: string;
  readyAt?: string;
  deliveredAt?: string;
  deliveredBy?: string;
  draftUpdatedAt?: string;
  draftUpdatedBy?: string;
  activeEditors?: Array<{ id?: string; name: string }>;
  history?: Array<{ status: Status; at: string; by: string }>;
  audit?: OrderAudit[];
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  parentOrderId?: string;
  parentOrderNumber?: string;
  partialDeliverySourceId?: string;
  isPartialDelivery?: boolean;
  hasPartialDelivery?: boolean;
  deliveryNote?: string;
  deliveryPhoto?: string;
  despatchReady?: boolean;
  despatchNumber?: string;
  withoutDespatch?: boolean;
  despatchReadyAt?: string;
  despatchReadyBy?: string;
  despatchScope?: "full" | "partial";
  despatchItems?: Array<{ itemIndex: number; quantity: number; rollCount: number }>;
  attachments?: OrderAttachment[];
  approvalForm?: ApprovalForm;
  rolloverHistory?: Array<{
    fromDate: string;
    toDate: string;
    at: string;
    by: string;
    snapshot: Partial<Order>;
  }>;
  reportRolloverTo?: string;
  isTest?: boolean;
  isLoanReturn?: boolean;
  isExport?: boolean;
  mergedOrderIds?: string[];
  mergedOrderNumbers?: string[];
  mergedIntoOrderId?: string;
  mergedIntoOrderNumber?: string;
  exportPackingRequired?: boolean;
  exportPackingStatus?: "pending" | "preparing" | "ready";
  lockedAt?: string;
  lockedBy?: string;
  lockedByUserId?: string;
  lockReason?: string;
};

type Status =
  | "new"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled"
  | "fulfilled";
type BoardStatus = "new" | "preparing" | "ready" | "delivered";
type Session = { id: string; name: string; role: string; permissions?: string[]; notificationPreferences?: { inApp: boolean; push: boolean; events: Record<string, boolean> }; notificationPermissions?: { events: Record<string, boolean> } };

const notificationEventOptions = [
  ["order_created", "Yeni sipariş"], ["order_editing_started", "Sipariş düzenlenmeye başladı"],
  ["order_edited", "Sipariş düzenlendi"], ["order_preparing_started", "Sipariş hazırlanmaya başladı"],
  ["order_status_returned", "Sipariş düzenleme için geri gönderildi"], ["order_ready", "Sipariş hazırlandı"],
  ["order_cancelled", "Sipariş iptal edildi"], ["order_deleted", "Sipariş silindi"],
  ["approval_form_prepared", "Sipariş formu hazırlandı"], ["approval_form_edited", "Sipariş formu düzenlendi"],
  ["approval_form_preparing_started", "Form hazırlanmaya başladı"], ["approval_form_editing_started", "Form düzenlenmeye başladı"],
  ["approval_requested", "Onay bekleyen form"], ["approval_completed", "Form onaylandı"],
  ["approval_rejected", "Form reddedildi"], ["approval_form_archived", "Form PDF arşivlendi"],
  ["despatch_ready", "İrsaliye hazırlandı, teslim edilebilir"], ["order_delivered", "Sipariş teslim edildi"],
  ["day_closed", "Gün kapanış özeti"], ["order_locked", "Sipariş kilitlendi"],
  ["order_unlocked", "Sipariş kilidi açıldı"], ["announcement", "Yönetici duyuruları"],
] as const;

const notificationEventGroups = [
  { label: "Siparişler", keys: ["order_created", "order_editing_started", "order_edited", "order_preparing_started", "order_status_returned", "order_ready", "order_cancelled", "order_deleted", "order_locked", "order_unlocked"] },
  { label: "Sipariş formları", keys: ["approval_form_prepared", "approval_form_edited", "approval_form_preparing_started", "approval_form_editing_started", "approval_requested", "approval_completed", "approval_rejected", "approval_form_archived"] },
  { label: "Teslimat", keys: ["despatch_ready", "order_delivered"] },
  { label: "Sistem", keys: ["day_closed", "announcement"] },
] as const;

type BrowserBackLayer = {
  id: string;
  close: () => void;
  cleanupTimer?: number;
};
const browserBackLayers: BrowserBackLayer[] = [];
let browserBackListenerInstalled = false;
let suppressBrowserBackPop = false;

function useBrowserBackLayer(active: boolean, onClose: () => void) {
  const idRef = useRef(`arix-layer-${Math.random().toString(36).slice(2)}`);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    if (!browserBackListenerInstalled) {
      browserBackListenerInstalled = true;
      window.addEventListener("popstate", () => {
        if (suppressBrowserBackPop) {
          suppressBrowserBackPop = false;
          return;
        }
        const layer = browserBackLayers.pop();
        if (layer) layer.close();
      });
    }

    const id = idRef.current;
    let layer = browserBackLayers.find((item) => item.id === id);
    if (layer?.cleanupTimer) {
      window.clearTimeout(layer.cleanupTimer);
      delete layer.cleanupTimer;
    }
    if (!layer) {
      layer = { id, close: () => closeRef.current() };
      browserBackLayers.push(layer);
      window.history.pushState({ ...(window.history.state || {}), arixLayer: id }, "");
    }

    return () => {
      const current = browserBackLayers.find((item) => item.id === id);
      if (!current) return;
      current.cleanupTimer = window.setTimeout(() => {
        const index = browserBackLayers.findIndex((item) => item.id === id);
        if (index < 0) return;
        const wasTop = index === browserBackLayers.length - 1;
        browserBackLayers.splice(index, 1);
        if (wasTop && window.history.state?.arixLayer === id) {
          suppressBrowserBackPop = true;
          window.history.back();
        }
      }, 0);
    };
  }, [active]);
}
type OrderDay = {
  date: string;
  closed: boolean;
  closedAt?: string;
  closedBy?: string;
  automatic?: boolean;
  carriedCount?: number;
  carriedToDate?: string;
  openedAt?: string;
  openedBy?: string;
};
type OrderNotification = {
  id: string;
  orderId: string;
  dayKey?: string;
  formNumber?: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  readAt?: string;
};
type NotificationHistoryGroup = {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  createdBy: string;
  orderId?: string;
  dayKey?: string;
  recipients: string[];
  readCount: number;
};
type AuthConfig = { enabled: boolean; googleClientId: string };
type AuthResponse = { data?: Session; pending?: boolean };
type GoogleCredentialResponse = { credential?: string };
type Language = "az" | "tr" | "en" | "ru";
type WorkflowRole = "owner" | "sales" | "warehouse" | "delivery" | "viewer";

function sessionCan(session: Session | null | undefined, permission: string) {
  return Boolean(session && (session.role.trim().toLocaleLowerCase("az") === "sahib" || session.permissions?.includes(permission)));
}

function workflowRole(role: string): WorkflowRole {
  const value = role.trim().toLocaleLowerCase("az");
  if (value === "sahib")
    return "owner";
  if (["satış", "satış rəhbəri", "satis", "sales"].includes(value))
    return "sales";
  if (["anbar əməliyyatları", "anbar", "anbardar", "depo", "depo görevlisi", "warehouse"].includes(value))
    return "warehouse";
  if (["təhvilat", "çatdırılma", "teslimat", "delivery"].includes(value))
    return "delivery";
  return "viewer";
}

function representativeIdentity(value: string | undefined) {
  const normalized = String(value || "").trim().toLocaleLowerCase("tr");
  if (normalized.includes("mustafa")) return "mustafa";
  if (normalized.includes("serkan")) return "serkan";
  return normalized;
}

const languageOptions: Array<{ id: Language; short: string; label: string }> = [
  { id: "az", short: "AZ", label: "Azərbaycan" },
  { id: "tr", short: "TR", label: "Türkçe" },
  { id: "en", short: "EN", label: "English" },
  { id: "ru", short: "RU", label: "Русский" },
];

const copy = {
  az: {
    title: "Sifarişlər",
    subtitle: "Satışdan gələn sifarişləri qarışıqlıq olmadan hazırlayın.",
    flow: "BU GÜNÜN AXINI",
    active: "aktiv sifariş",
    create: "Sifariş yarat",
    settings: "Ayarlar",
    new: "Yeni",
    preparing: "Hazırlanır",
    ready: "Hazır",
    empty: "Burada sifariş yoxdur",
    rows: "sətir",
    logout: "Çıxış",
    customer: "Müştəri adı",
    note: "Qeyd",
    lineNote: "Məhsul qeydi",
    orderText: "Sifariş mətni",
    match: "Məhsulları uyğunlaşdır",
    matched: "Uyğunlaşdırılan məhsullar",
    changeText: "Mətni dəyiş",
    choose: "Məhsul seçin",
    send: "Sifarişi göndər",
    start: "Hazırlamağa başla",
    back: "Geri qaytar",
    done: "Hazırdır",
    edit: "Düzəliş et",
    delivered: "Təhvil verildi",
    preparingHint: "WhatsApp mətnini olduğu kimi yapışdırın",
    ordered: "Sifariş",
    preparedBy: "Hazırlayan",
    createdBy: "Əlavə edən",
    deliveredBy: "Təhvil verən",
    workflowTab: "Aktiv sifarişlər",
    approvalFormsTab: "Sifariş formaları",
    daysTab: "Günlük hesabatlar",
    dailyEmpty: "Hələ təhvil verilmiş sifariş yoxdur",
    editOrder: "Sifarişi düzəlt",
    saveChanges: "Dəyişiklikləri saxla",
    deleteOrder: "Sifarişi sil",
    openDay: "Günü aç",
    closeDay: "Günü bağla",
    dayOpen: "İş günü açıqdır",
    dayClosed: "İş günü bağlıdır",
    rememberMe: "Oturum açıq qalsın",
    trashTab: "Silinənlər",
    trashEmpty: "Silinmiş sifariş yoxdur",
    restore: "Geri qaytar",
    deleteForever: "Həmişəlik sil",
    activeEditors: "Hazırda işləyənlər",
    changeHistory: "Əməliyyat tarixçəsi",
    saveDraft: "Taslağı saxla",
    draftSaved: "Taslaq saxlanıldı",
    documents: "Sənədlər",
    orderForm: "Sifariş formu",
    despatchFile: "İrsaliye",
    uploadFile: "PDF və ya şəkil yüklə",
    noFile: "Hələ fayl yüklənməyib",
    openFile: "Aç",
    previewFile: "Önizləmə",
    printFile: "Çap et",
    downloadFile: "Endir",
    fullScreen: "Tam ekran",
    deleteFile: "Sil",
    deletedFiles: "Silinən sənədlər",
    restoreFile: "Geri qaytar",
    fileHint: "Şəkillər avtomatik sıxılır. PDF limiti 5 MB-dır.",
    originalOrder: "Ana sifariş",
    rollCount: "Rulo sayı",
    deliveryNote: "Təhvil qeydi",
    deliveryPhoto: "Təhvil şəkli",
    deliveryProof: "Təhvil məlumatları",
    fullTrace: "Tam sifariş tarixçəsi",
    traceHint: "Mətn, uyğunlaşdırma, partiyalar və bütün dəyişikliklər",
    orderSummary: "Sifariş xülasəsi",
    batchCount: "Hazır partiya",
    deliveredProducts: "Təhvil verilən məhsul",
    tapForDetails: "Məhsul tarixçəsini gör",
    productHistory: "Məhsul tarixçəsi",
    enteredAs: "İlk yazılan",
    matchedAs: "Uyğunlaşdırılan",
    noChanges: "Bu məhsul üçün əlavə dəyişiklik yoxdur.",
    orderedTotal: "Ümumi sifariş",
    preparedTotal: "Hazırlanan",
    deliveredTotal: "Təhvil verilən",
    readyWaiting: "Hazır, təhvil gözləyir",
    unpreparedRemaining: "Hazırlanmayan qalıq",
    unpreparedProducts: "Hazırlanmayan qalan məhsullar",
    noUnpreparedProducts: "Bu sifarişdə hazırlanmağı gözləyən məhsul yoxdur.",
    meterChange: "Metraj dəyişdi",
    rollChange: "Rulo sayı dəyişdi",
    originalText: "Yazılan ilk mətn",
    initialMatches: "İlk məhsul uyğunlaşdırması",
    preparedBatches: "Hazır partiyalar və qalanlar",
    quantityHistory: "Metraj və rulo dəyişiklikləri",
    oldRecordMissing: "Bu köhnə sifarişdə ilk mətn saxlanılmayıb.",
    remaining: "Qalan",
    despatchReady: "İrsaliye hazırdır",
    despatchPending: "İrsaliye gözlənilir",
    despatchNumber: "İrsaliye nömrəsi",
    deliveryWithoutDespatch: "İrsaliyesiz təhvil",
    deliveryWithoutDespatchReady: "İrsaliyesiz təhvil üçün hazırdır",
    confirmDeliveryWithoutDespatch: "İrsaliyesiz təhvili təsdiqlə",
    confirmDespatch: "İrsaliyeni təsdiqlə",
    revokeDespatch: "Təsdiqi geri al",
    productsTab: "Məhsullar",
    customersTab: "Müştərilər",
    aliasesTab: "Qısaltmalar və Sinonimlər",
    search: "Axtarış...",
    addProduct: "Yeni Məhsul",
    addCustomer: "Yeni Müştəri",
    addAlias: "Yeni Qayda",
    save: "Yadda saxla",
    delete: "Sil",
    code: "Kod / Artikul",
    productName: "Məhsul adı",
    phone: "Telefon",
    aliasTrigger: "Yazılan qısaltma (məs: FS)",
    aliasReplacement: "Əvəz olunan ifadə (məs: Folyo Satin)",
    testMatch: "Sınaq Yoxlaması",
    testPlaceholder: "Məsələn: 30 mt FS Beyaz və ya 20m Parlak Beyaz",
    bulkAdd: "Toplu Əlavə",
  },
  tr: {
    title: "Siparişler",
    subtitle: "Satıştan gelen siparişleri karışıklık olmadan hazırlayın.",
    flow: "BUGÜNÜN AKIŞI",
    active: "aktif sipariş",
    create: "Sipariş oluştur",
    settings: "Ayarlar",
    new: "Yeni",
    preparing: "Hazırlanıyor",
    ready: "Hazır",
    empty: "Burada sipariş yok",
    rows: "satır",
    logout: "Çıkış",
    customer: "Müşteri adı",
    note: "Not",
    lineNote: "Ürün notu",
    orderText: "Sipariş metni",
    match: "Ürünleri eşleştir",
    matched: "Eşleştirilen ürünler",
    changeText: "Metni değiştir",
    choose: "Ürün seçin",
    send: "Siparişi gönder",
    start: "Hazırlamaya başla",
    back: "Geri gönder",
    done: "Hazır",
    edit: "Düzenle",
    delivered: "Teslim edildi",
    preparingHint: "WhatsApp metnini olduğu gibi yapıştırın",
    ordered: "Sipariş",
    preparedBy: "Hazırlayan",
    createdBy: "Ekleyen",
    deliveredBy: "Teslim eden",
    workflowTab: "Aktif siparişler",
    approvalFormsTab: "Sipariş formları",
    daysTab: "Günlük raporlar",
    dailyEmpty: "Henüz teslim edilen sipariş yok",
    editOrder: "Siparişi düzenle",
    saveChanges: "Değişiklikleri kaydet",
    deleteOrder: "Siparişi sil",
    openDay: "Günü aç",
    closeDay: "Günü kapat",
    dayOpen: "İş günü açık",
    dayClosed: "İş günü kapalı",
    rememberMe: "Oturum açık kalsın",
    trashTab: "Silinenler",
    trashEmpty: "Silinen sipariş yok",
    restore: "Geri yükle",
    deleteForever: "Kalıcı sil",
    activeEditors: "Şu anda düzenleyenler",
    changeHistory: "İşlem geçmişi",
    saveDraft: "Taslağı kaydet",
    draftSaved: "Taslak kaydedildi",
    documents: "Belgeler",
    orderForm: "Sipariş formu",
    despatchFile: "İrsaliye",
    uploadFile: "PDF veya görsel yükle",
    noFile: "Henüz dosya yüklenmedi",
    openFile: "Aç",
    previewFile: "Önizle",
    printFile: "Yazdır",
    downloadFile: "İndir",
    fullScreen: "Tam ekran",
    deleteFile: "Sil",
    deletedFiles: "Silinen belgeler",
    restoreFile: "Geri yükle",
    fileHint: "Görseller otomatik sıkıştırılır. PDF sınırı 5 MB'dır.",
    originalOrder: "Ana sipariş",
    rollCount: "Rulo sayısı",
    deliveryNote: "Teslim notu",
    deliveryPhoto: "Teslim fotoğrafı",
    deliveryProof: "Teslim bilgileri",
    fullTrace: "Tam sipariş geçmişi",
    traceHint: "Metin, eşleştirme, partiler ve bütün değişiklikler",
    orderSummary: "Sipariş özeti",
    batchCount: "Hazır parti",
    deliveredProducts: "Teslim edilen ürün",
    tapForDetails: "Ürün geçmişini gör",
    productHistory: "Ürün geçmişi",
    enteredAs: "İlk yazılan",
    matchedAs: "Eşleşen ürün",
    noChanges: "Bu ürün için başka değişiklik yok.",
    orderedTotal: "Toplam sipariş",
    preparedTotal: "Hazırlanan",
    deliveredTotal: "Teslim edilen",
    readyWaiting: "Hazır, teslim bekliyor",
    unpreparedRemaining: "Hazırlanmayan kalan",
    unpreparedProducts: "Hazırlanmayan kalan ürünler",
    noUnpreparedProducts: "Bu siparişte hazırlanmayı bekleyen ürün yok.",
    meterChange: "Metre değişikliği",
    rollChange: "Rulo sayısı değişikliği",
    originalText: "Yazılan ilk metin",
    initialMatches: "İlk ürün eşleştirmesi",
    preparedBatches: "Hazır partiler ve kalanlar",
    quantityHistory: "Metre ve rulo değişiklikleri",
    oldRecordMissing: "Bu eski siparişte ilk metin kaydedilmemiş.",
    remaining: "Kalan",
    despatchReady: "İrsaliye hazır",
    despatchPending: "İrsaliye bekleniyor",
    despatchNumber: "İrsaliye numarası",
    deliveryWithoutDespatch: "İrsaliyesiz teslim",
    deliveryWithoutDespatchReady: "İrsaliyesiz teslim için hazır",
    confirmDeliveryWithoutDespatch: "İrsaliyesiz teslimi onayla",
    confirmDespatch: "İrsaliyeyi onayla",
    revokeDespatch: "Onayı geri al",
    productsTab: "Ürünler",
    customersTab: "Müşteriler",
    aliasesTab: "Kısaltmalar ve Eşanlamlılar",
    search: "Ara...",
    addProduct: "Yeni Ürün",
    addCustomer: "Yeni Müşteri",
    addAlias: "Yeni Kural",
    save: "Kaydet",
    delete: "Sil",
    code: "Kod / Artikul",
    productName: "Ürün adı",
    phone: "Telefon",
    aliasTrigger: "Yazılan kısaltma (örn: FS)",
    aliasReplacement: "Eşleşecek ifade (örn: Folyo Satin)",
    testMatch: "Canlı Eşleştirme Testi",
    testPlaceholder: "Örnek: 30 mt FS Beyaz veya 20m Parlak Beyaz",
    bulkAdd: "Toplu Ekle",
  },
  en: {
    title: "Orders",
    subtitle: "Prepare incoming sales orders without confusion.",
    flow: "TODAY'S FLOW",
    active: "active orders",
    create: "Create order",
    settings: "Settings",
    new: "New",
    preparing: "Preparing",
    ready: "Ready",
    empty: "No orders here",
    rows: "lines",
    logout: "Sign out",
    customer: "Customer name",
    note: "Note",
    lineNote: "Product note",
    orderText: "Order text",
    match: "Match products",
    matched: "Matched products",
    changeText: "Edit text",
    choose: "Select product",
    send: "Send order",
    start: "Start preparing",
    back: "Move back",
    done: "Mark ready",
    edit: "Edit",
    delivered: "Delivered",
    preparingHint: "Paste the WhatsApp text as received",
    ordered: "Ordered",
    preparedBy: "Prepared by",
    createdBy: "Added by",
    deliveredBy: "Delivered by",
    workflowTab: "Active orders",
    approvalFormsTab: "Order forms",
    daysTab: "Daily reports",
    dailyEmpty: "No delivered orders yet",
    editOrder: "Edit order",
    saveChanges: "Save changes",
    deleteOrder: "Delete order",
    openDay: "Open day",
    closeDay: "Close day",
    dayOpen: "Business day is open",
    dayClosed: "Business day is closed",
    rememberMe: "Keep me signed in",
    trashTab: "Deleted",
    trashEmpty: "No deleted orders",
    restore: "Restore",
    deleteForever: "Delete permanently",
    activeEditors: "Editing now",
    changeHistory: "Activity history",
    saveDraft: "Save draft",
    draftSaved: "Draft saved",
    documents: "Documents",
    orderForm: "Order form",
    despatchFile: "Dispatch note",
    uploadFile: "Upload PDF or image",
    noFile: "No file uploaded yet",
    openFile: "Open",
    previewFile: "Preview",
    printFile: "Print",
    downloadFile: "Download",
    fullScreen: "Full screen",
    deleteFile: "Delete",
    deletedFiles: "Deleted documents",
    restoreFile: "Restore",
    fileHint: "Images are compressed automatically. PDF limit is 5 MB.",
    originalOrder: "Original order",
    rollCount: "Roll count",
    deliveryNote: "Delivery note",
    deliveryPhoto: "Delivery photo",
    deliveryProof: "Delivery details",
    fullTrace: "Complete order history",
    traceHint: "Text, matching, batches and all changes",
    orderSummary: "Order summary",
    batchCount: "Ready batches",
    deliveredProducts: "Delivered products",
    tapForDetails: "View product history",
    productHistory: "Product history",
    enteredAs: "Originally entered",
    matchedAs: "Matched product",
    noChanges: "There are no additional changes for this product.",
    orderedTotal: "Total ordered",
    preparedTotal: "Prepared",
    deliveredTotal: "Delivered",
    readyWaiting: "Ready, awaiting delivery",
    unpreparedRemaining: "Not yet prepared",
    unpreparedProducts: "Products not yet prepared",
    noUnpreparedProducts: "No products are waiting to be prepared.",
    meterChange: "Meter change",
    rollChange: "Roll count change",
    originalText: "Original entered text",
    initialMatches: "Initial product matches",
    preparedBatches: "Ready batches and remainder",
    quantityHistory: "Meter and roll changes",
    oldRecordMissing: "The original text was not stored for this older order.",
    remaining: "Remaining",
    despatchReady: "Dispatch note ready",
    despatchPending: "Waiting for dispatch note",
    despatchNumber: "Dispatch note number",
    deliveryWithoutDespatch: "Delivery without dispatch note",
    deliveryWithoutDespatchReady: "Ready for delivery without dispatch note",
    confirmDeliveryWithoutDespatch: "Confirm delivery without dispatch note",
    confirmDespatch: "Confirm dispatch note",
    revokeDespatch: "Revoke confirmation",
    productsTab: "Products",
    customersTab: "Customers",
    aliasesTab: "Abbreviations & Synonyms",
    search: "Search...",
    addProduct: "New Product",
    addCustomer: "New Customer",
    addAlias: "New Rule",
    save: "Save",
    delete: "Delete",
    code: "Code / Article",
    productName: "Product name",
    phone: "Phone",
    aliasTrigger: "Typed abbreviation (e.g. FS)",
    aliasReplacement: "Expanded expression (e.g. Folyo Satin)",
    testMatch: "Live Matching Test",
    testPlaceholder: "e.g. 30 mt FS Beyaz or 20m Parlak Beyaz",
    bulkAdd: "Bulk Add",
  },
  ru: {
    title: "Заказы",
    subtitle: "Подготавливайте заказы без путаницы.",
    flow: "СЕГОДНЯШНИЙ ПОТОК",
    active: "активных заказов",
    create: "Создать заказ",
    settings: "Настройки",
    new: "Новые",
    preparing: "Подготовка",
    ready: "Готово",
    empty: "Здесь нет заказов",
    rows: "строк",
    logout: "Выйти",
    customer: "Имя клиента",
    note: "Примечание",
    lineNote: "Примечание к товару",
    orderText: "Текст заказа",
    match: "Сопоставить товары",
    matched: "Сопоставленные товары",
    changeText: "Изменить текст",
    choose: "Выберите товар",
    send: "Отправить заказ",
    start: "Начать подготовку",
    back: "Вернуть",
    done: "Готово",
    edit: "Изменить",
    delivered: "Доставлено",
    preparingHint: "Вставьте текст WhatsApp без изменений",
    ordered: "Заказано",
    preparedBy: "Подготовил",
    createdBy: "Добавил",
    deliveredBy: "Передал",
    workflowTab: "Активные заказы",
    approvalFormsTab: "Формы заказов",
    daysTab: "Ежедневные отчеты",
    dailyEmpty: "Доставленных заказов пока нет",
    editOrder: "Изменить заказ",
    saveChanges: "Сохранить изменения",
    deleteOrder: "Удалить заказ",
    openDay: "Открыть день",
    closeDay: "Закрыть день",
    dayOpen: "Рабочий день открыт",
    dayClosed: "Рабочий день закрыт",
    rememberMe: "Оставаться в системе",
    trashTab: "Удаленные",
    trashEmpty: "Удаленных заказов нет",
    restore: "Восстановить",
    deleteForever: "Удалить навсегда",
    activeEditors: "Сейчас редактируют",
    changeHistory: "История действий",
    saveDraft: "Сохранить черновик",
    draftSaved: "Черновик сохранен",
    documents: "Документы",
    orderForm: "Форма заказа",
    despatchFile: "Накладная",
    uploadFile: "Загрузить PDF или изображение",
    noFile: "Файл еще не загружен",
    openFile: "Открыть",
    previewFile: "Просмотр",
    printFile: "Печать",
    downloadFile: "Скачать",
    fullScreen: "На весь экран",
    deleteFile: "Удалить",
    deletedFiles: "Удаленные документы",
    restoreFile: "Восстановить",
    fileHint: "Изображения сжимаются автоматически. Лимит PDF — 5 МБ.",
    originalOrder: "Основной заказ",
    rollCount: "Количество рулонов",
    deliveryNote: "Примечание о доставке",
    deliveryPhoto: "Фото доставки",
    deliveryProof: "Данные доставки",
    fullTrace: "Полная история заказа",
    traceHint: "Текст, сопоставление, партии и все изменения",
    orderSummary: "Сводка заказа",
    batchCount: "Готовые партии",
    deliveredProducts: "Доставленные товары",
    tapForDetails: "Открыть историю товара",
    productHistory: "История товара",
    enteredAs: "Введено изначально",
    matchedAs: "Сопоставленный товар",
    noChanges: "Для этого товара нет дополнительных изменений.",
    orderedTotal: "Всего заказано",
    preparedTotal: "Подготовлено",
    deliveredTotal: "Доставлено",
    readyWaiting: "Готово, ожидает доставки",
    unpreparedRemaining: "Не подготовлено",
    unpreparedProducts: "Неподготовленные товары",
    noUnpreparedProducts: "Нет товаров, ожидающих подготовки.",
    meterChange: "Изменение метража",
    rollChange: "Изменение количества рулонов",
    originalText: "Исходный текст",
    initialMatches: "Первичное сопоставление товаров",
    preparedBatches: "Готовые партии и остаток",
    quantityHistory: "Изменения метров и рулонов",
    oldRecordMissing: "Исходный текст этого старого заказа не сохранён.",
    remaining: "Остаток",
    despatchReady: "Накладная готова",
    despatchPending: "Ожидание накладной",
    despatchNumber: "Номер накладной",
    deliveryWithoutDespatch: "Доставка без накладной",
    deliveryWithoutDespatchReady: "Готово к доставке без накладной",
    confirmDeliveryWithoutDespatch: "Подтвердить доставку без накладной",
    confirmDespatch: "Подтвердить накладную",
    revokeDespatch: "Отменить подтверждение",
    productsTab: "Товары",
    customersTab: "Клиенты",
    aliasesTab: "Сокращения и Синонимы",
    search: "Поиск...",
    addProduct: "Новый товар",
    addCustomer: "Новый клиент",
    addAlias: "Новое правило",
    save: "Сохранить",
    delete: "Удалить",
    code: "Код / Артикул",
    productName: "Название товара",
    phone: "Телефон",
    aliasTrigger: "Сокращение (напр: FS)",
    aliasReplacement: "Полное значение (напр: Folyo Satin)",
    testMatch: "Проверка сопоставления",
    testPlaceholder: "Например: 30 mt FS Beyaz или 20m Parlak Beyaz",
    bulkAdd: "Массовое добавление",
  },
} satisfies Record<Language, Record<string, string>>;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string | number | boolean>,
          ) => void;
        };
      };
    };
  }
}

let googleScriptPromise: Promise<void> | null = null;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Google giriş xidməti yüklənmədi."));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

const HeaderIcon = {
  Globe: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </svg>
  ),
  ChevronDown: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
};

const statusMeta: Record<Status, { label: string; tone: string }> = {
  new: { label: "Yeni", tone: "violet" },
  preparing: { label: "Hazırlanır", tone: "amber" },
  ready: { label: "Hazır", tone: "green" },
  delivered: { label: "Təhvil verildi", tone: "gray" },
  cancelled: { label: "Ləğv edildi", tone: "red" },
  fulfilled: { label: "Tamamlandı", tone: "gray" },
};

function safeItems(order: Order): OrderItem[] {
  return Array.isArray(order.items) ? order.items : [];
}

function itemHasPreparedAmount(order: Order, item: OrderItem) {
  if (Number(item.preparedQuantity) > 0 || Number(item.preparedRollCount) > 0) return true;
  return ["ready", "delivered"].includes(order.status)
    && (Number(item.quantity) > 0 || Number(item.orderedRollCount) > 0);
}

function preparedByForDisplay(order: Order) {
  const itemPreparers = [...new Set(safeItems(order)
    .filter((item) => itemHasPreparedAmount(order, item))
    .map((item) => item.preparedBy)
    .filter(Boolean))];
  if (itemPreparers.length) return itemPreparers.join(", ");
  return ["ready", "delivered"].includes(order.status) ? order.preparedBy || "-" : "-";
}

function orderedQuantityLabel(item: Match) {
  const parts = [];
  if (Number(item.quantity) > 0) parts.push(`${Number(item.quantity)} mt`);
  if (Number(item.orderedRollCount) > 0) parts.push(`${Number(item.orderedRollCount)} rulo`);
  return parts.length ? parts.join(" · ") : "0 mt";
}

function preparedQuantityLabel(item: OrderItem) {
  const parts = [];
  if (Number(item.preparedQuantity) > 0) parts.push(`${Number(item.preparedQuantity)} mt`);
  if (Number(item.preparedRollCount) > 0) parts.push(`${Number(item.preparedRollCount)} rulo`);
  return parts.length ? parts.join(" · ") : "0 mt";
}

function readyMergeKey(order: Order) {
  const despatchKey = order.despatchReady
    ? (!order.withoutDespatch && String(order.despatchNumber || "").trim()
      ? `despatch:${String(order.despatchNumber).trim().toLocaleLowerCase("tr")}`
      : "")
    : "pending";
  if (!despatchKey) return "";
  return `${order.customerName.trim().toLocaleLowerCase("tr")}|${Boolean(order.isTest)}|${Boolean(order.isLoanReturn)}|${Boolean(order.isExport)}|${despatchKey}`;
}

function printableAuditValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "-";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method || "GET").toUpperCase();
  const attempts = method === "GET" ? 3 : 1;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutMs = method === "GET" ? 10_000 : 30_000;
    const timeout = window.setTimeout(
      () => controller.abort(new Error("İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.")),
      timeoutMs,
    );
    try {
      const response = await fetch(path, {
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        },
        ...init,
        cache: method === "GET" ? "no-store" : init?.cache,
        signal: init?.signal ?? controller.signal,
      });
      const raw = await response.text();
      let payload: Record<string, unknown> = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }
      if (!response.ok) {
        const error = new Error(
          typeof payload.error === "string"
            ? payload.error
            : `Sunucu yanıt vermedi (${response.status}).`,
        );
        if (attempt + 1 < attempts && (response.status >= 500 || response.status === 401)) {
          lastError = error;
          window.clearTimeout(timeout);
          await new Promise((resolve) =>
            window.setTimeout(resolve, 250 * (attempt + 1)),
          );
          continue;
        }
        if (response.status === 401) window.dispatchEvent(new Event("arix-auth-expired"));
        throw error;
      }
      if (!raw) throw new Error("Sunucudan boş yanıt alındı.");
      window.clearTimeout(timeout);
      return payload as T;
    } catch (cause) {
      window.clearTimeout(timeout);
      lastError =
        cause instanceof Error ? cause : new Error("Bağlantı kurulamadı.");
      if (attempt + 1 >= attempts) break;
      await new Promise((resolve) =>
        window.setTimeout(resolve, 250 * (attempt + 1)),
      );
    }
  }
  throw lastError || new Error("Bağlantı kurulamadı.");
}

const imageFilePattern = /\.(?:jpe?g|jpe|jfif|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i;
const imageAccept =
  "image/*,.jpg,.jpeg,.jpe,.jfif,.png,.webp,.gif,.bmp,.avif,.heic,.heif,.tif,.tiff";

function isImageFile(file: File) {
  return file.type.startsWith("image/") || imageFilePattern.test(file.name);
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isJpegFile(file: File) {
  return /^(?:image\/jpeg|image\/pjpeg)$/i.test(file.type) ||
    /\.(?:jpe?g|jpe|jfif)$/i.test(file.name);
}

async function prepareImageUpload(file: File) {
  if (isJpegFile(file) && file.size <= 900_000) {
    const data = await fileToDataUrl(file);
    return data.replace(/^data:[^;,]+;base64,/i, "data:image/jpeg;base64,");
  }
  return compressDeliveryPhoto(file);
}

async function compressDeliveryPhoto(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "Bu resim formatı cihazınızda açılamadı. Fotoğrafı JPG veya PNG olarak kaydedip yeniden deneyin.",
        ),
      );
    image.src = objectUrl;
  }).finally(() => URL.revokeObjectURL(objectUrl));
  const maxSide = 900;
  const scale = Math.min(
    1,
    maxSide / Math.max(source.naturalWidth, source.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  let quality = 0.8;
  let data = canvas.toDataURL("image/jpeg", quality);
  while (data.length > 850_000 && quality > 0.35) {
    quality -= 0.1;
    data = canvas.toDataURL("image/jpeg", quality);
  }
  if (data.length > 900_000)
    throw new Error("Fotoğraf sıkıştırılamadı. Daha küçük bir fotoğraf seçin.");
  return data;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Fayl oxunmadı."));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(size: number) {
  return size < 1_000_000
    ? `${Math.max(1, Math.round(size / 1_000))} KB`
    : `${(size / 1_000_000).toFixed(1)} MB`;
}

let approvalDisplayRate = 1;
function formatMoney(value: number, currency: ApprovalForm["currency"]) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function money(value: number, currency: ApprovalForm["currency"]) {
  const primary = formatMoney(value, currency);
  return currency === "TRY"
    ? primary
    : `${primary} / ${formatMoney(value * approvalDisplayRate, "TRY")}`;
}

function dualMoney(
  value: number,
  form: Pick<ApprovalForm, "currency" | "exchangeRate">,
) {
  const primary = formatMoney(value, form.currency);
  if (form.currency === "TRY") return { primary, local: "" };
  return {
    primary,
    local: formatMoney(value * (Number(form.exchangeRate) || 0), "TRY"),
  };
}

function approvalTotals(form: ApprovalForm) {
  const overallDiscountRate = Math.min(
    100,
    Math.max(0, Number(form.overallDiscountRate) || 0),
  );
  const lines = form.lines.map((line) => {
    const billableQuantity = (line.unit ?? "M2") === "M2"
      ? line.quantity * (Number(line.width) || 1.42)
      : line.quantity;
    const gross = billableQuantity * line.unitPrice;
    const net = gross * (1 - line.discountRate / 100);
    const discountedNet = net * (1 - overallDiscountRate / 100);
    const vat = form.vatIncluded ? 0 : discountedNet * (line.vatRate / 100);
    return { net, vat, total: net + vat };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.net, 0);
  const overallDiscount = subtotal * (overallDiscountRate / 100);
  const vat = lines.reduce((sum, line) => sum + line.vat, 0);
  const freight = form.documentType === "commercial_invoice" ? Number(form.freightAmount) || 0 : 0;
  const insurance = form.documentType === "commercial_invoice" ? Number(form.insuranceAmount) || 0 : 0;
  return {
    lines,
    subtotal,
    overallDiscount,
    vat,
    freight,
    insurance,
    total: subtotal - overallDiscount + vat + form.extraCharge + freight + insurance,
  };
}

function balancedPalletDistribution(totalRolls: number) {
  const total = Math.max(0, Math.trunc(totalRolls));
  if (total === 0) return [];
  const palletCount = Math.ceil(total / 16);
  const base = Math.floor(total / palletCount);
  const remainder = total % palletCount;
  return Array.from({ length: palletCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function packingPalletPlan(lines: ApprovalFormLine[], distribution: number[]) {
  const pallets = distribution.map((rollCount, index) => ({ number: index + 1, rollCount, remaining: rollCount, items: [] as Array<{ line: ApprovalFormLine; lineIndex: number; rolls: number; quantity: number }> }));
  let palletIndex = 0;
  lines.forEach((line, lineIndex) => {
    let remainingRolls = Math.max(0, Math.trunc(Number(line.rollCount) || 0));
    const totalRolls = remainingRolls;
    while (remainingRolls > 0 && palletIndex < pallets.length) {
      while (palletIndex < pallets.length && pallets[palletIndex].remaining <= 0) palletIndex += 1;
      if (palletIndex >= pallets.length) break;
      const rolls = Math.min(remainingRolls, pallets[palletIndex].remaining);
      pallets[palletIndex].items.push({
        line,
        lineIndex,
        rolls,
        quantity: totalRolls ? Number(line.quantity || 0) * rolls / totalRolls : Number(line.quantity || 0),
      });
      pallets[palletIndex].remaining -= rolls;
      remainingRolls -= rolls;
    }
    if (totalRolls === 0 && pallets.length) pallets[0].items.push({ line, lineIndex, rolls: 0, quantity: Number(line.quantity || 0) });
  });
  return pallets;
}

function packingAllocationsFromPlan(lines: ApprovalFormLine[], distribution: number[]) {
  return packingPalletPlan(lines, distribution).map((pallet) => pallet.items
    .filter((item) => item.rolls > 0)
    .map((item) => ({ lineIndex: item.lineIndex, rolls: item.rolls, quantity: item.quantity })));
}

function ApprovalIcon({ kind }: { kind: "document" | "calendar" | "representative" | "source" | "currency" | "company" | "note" | "terms" | "payment" | "delivery" }) {
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

function localDateTimeInput(value?: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(0, 16);
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const current = new Date();
    const localCurrent = new Date(current.getTime() - current.getTimezoneOffset() * 60_000);
    return `${value}T${localCurrent.toISOString().slice(11, 16)}`;
  }
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] || character,
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request<{ data: T }>(path, init)).data;
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [aliases, setAliases] = useState<AliasRule[]>([]);
  const [deletedOrders, setDeletedOrders] = useState<Order[]>([]);
  const [approvalOrders, setApprovalOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [printSettings, setPrintSettings] = useState<CompanyPrintSettings>({
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
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [mergeReadySelection, setMergeReadySelection] = useState<Order[] | null>(null);
  const [mergeReadyCheckedIds, setMergeReadyCheckedIds] = useState<string[]>([]);
  const [mergeReadyBusy, setMergeReadyBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMode, setSettingsMode] = useState<"settings" | "stock">("settings");
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [activeApprovalOrder, setActiveApprovalOrder] = useState<Order | null>(null);
  const [approvalPreviewOnly, setApprovalPreviewOnly] = useState(false);
  const [exportPreviewOrder, setExportPreviewOrder] = useState<Order | null>(null);
  const [approvalEditorIntent, setApprovalEditorIntent] = useState<"view" | "edit" | "approve" | "reject">("view");
  const [approvalEntrySource, setApprovalEntrySource] = useState<"forms" | "order">("order");
  const [pdfOrder, setPdfOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [syncWarning, setSyncWarning] = useState("");
  const [initialDataLoading, setInitialDataLoading] = useState(true);
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem("arix-order-language") as Language) || "az",
  );
  const [isDark, setIsDark] = useState(
    () => localStorage.getItem("arix-order-theme") === "dark",
  );
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [notificationPreferencesOpen, setNotificationPreferencesOpen] = useState(false);
  const [myNotificationSettings, setMyNotificationSettings] = useState<{ preferences: { inApp: boolean; push: boolean; events: Record<string, boolean> }; permissions: { events: Record<string, boolean> } } | null>(null);
  const [notificationSettingsBusy, setNotificationSettingsBusy] = useState(false);
  const [boardSearch, setBoardSearch] = useState("");
  const [inactiveOrdersOpen, setInactiveOrdersOpen] = useState(false);
  const [inactiveOrderBusyId, setInactiveOrderBusyId] = useState("");
  const [pageTab, setPageTab] = useState<"board" | "forms" | "days" | "stock">(() => {
    const saved = localStorage.getItem("arix-order-page-tab");
    return ["board", "forms", "days", "stock"].includes(saved || "") ? saved as "board" | "forms" | "days" | "stock" : "board";
  });
  const [orderDay, setOrderDay] = useState<OrderDay | null>(null);
  const dayToggleBusyRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const consecutiveEmptyLoadsRef = useRef(0);
  const orderLoadSequenceRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => void preloadPdfRenderer(), 1_500);
    return () => window.clearTimeout(timer);
  }, []);
  const accessStartedRef = useRef(false);
  const text = copy[language];

  useBrowserBackLayer(
    languageMenuOpen || profileMenuOpen || notificationMenuOpen,
    () => {
      setLanguageMenuOpen(false);
      setProfileMenuOpen(false);
      setNotificationMenuOpen(false);
    },
  );

  useEffect(() => {
    localStorage.setItem("arix-order-language", language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    localStorage.setItem("arix-order-theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem("arix-order-page-tab", pageTab);
  }, [pageTab]);

  useEffect(() => {
    if (!session) return;
    const action = accessStartedRef.current ? "page_view" : "app_open";
    accessStartedRef.current = true;
    void api("/api/orders/access-log", { method: "POST", body: JSON.stringify({ action, page: pageTab }) }).catch(() => undefined);
  }, [session?.id, pageTab]);

  useEffect(() => {
    if (!session || !activeOrder) return;
    void api("/api/orders/access-log", { method: "POST", body: JSON.stringify({ action: "order_view", page: pageTab, orderId: activeOrder.id, orderNumber: activeOrder.number }) }).catch(() => undefined);
  }, [session?.id, activeOrder?.id, pageTab]);

  useEffect(() => {
    if (!session || activeOrder) return;
    const savedOrderId = localStorage.getItem(`arix-order-open:${session.id}`);
    if (!savedOrderId) return;
    const savedOrder = [...orders, ...approvalOrders].find((order) => order.id === savedOrderId);
    if (savedOrder) setActiveOrder(savedOrder);
  }, [session, orders, approvalOrders, activeOrder]);

  useEffect(() => {
    if (session && activeOrder) localStorage.setItem(`arix-order-open:${session.id}`, activeOrder.id);
  }, [session, activeOrder]);

  useEffect(() => {
    if (!session) return;
    if (!sessionCan(session, "orders.view")) {
      localStorage.removeItem(`arix-order-active-cache:${session.id}`);
      setOrders([]);
      setInitialDataLoading(false);
      setCreateOpen(false);
      return;
    }
    try {
      const cached = JSON.parse(
        localStorage.getItem(`arix-order-active-cache:${session.id}`) || "[]",
      ) as Order[];
      if (Array.isArray(cached) && cached.length) {
        setOrders(cached);
        hasLoadedRef.current = true;
      }
    } catch {
      localStorage.removeItem(`arix-order-active-cache:${session.id}`);
    }
    setCreateOpen(
      localStorage.getItem(`arix-order-create-open:${session.id}`) === "1",
    );
  }, [session]);

  useEffect(() => {
    if (!session) return;
    localStorage.setItem(
      `arix-order-create-open:${session.id}`,
      createOpen ? "1" : "0",
    );
  }, [createOpen, session]);

  const loadSupportingData = useCallback(async () => {
    if (!session) return;
    const tasks: Array<Promise<unknown>> = [];
    if (sessionCan(session, "products.view") || sessionCan(session, "products.manage")) tasks.push(api<Product[]>("/api/orders/catalog").then(setProducts)); else setProducts([]);
    if (sessionCan(session, "counterparties.view") || sessionCan(session, "counterparties.manage")) tasks.push(api<Customer[]>("/api/orders/customers").then(setCustomers)); else setCustomers([]);
    if (sessionCan(session, "company.view") || sessionCan(session, "company.manage")) tasks.push(api<AliasRule[]>("/api/orders/aliases").then(setAliases)); else setAliases([]);
    if (sessionCan(session, "orders.days.view") || sessionCan(session, "orders.days.manage")) tasks.push(api<OrderDay>("/api/orders/day").then(setOrderDay)); else setOrderDay(null);
    if (sessionCan(session, "orders.view")) tasks.push(api<Order[]>("/api/orders/trash").then(setDeletedOrders)); else setDeletedOrders([]);
    if (sessionCan(session, "company.view") || sessionCan(session, "company.manage")) {
      tasks.push(api<{ printSettings?: CompanyPrintSettings }>("/api/company-settings").then((companyData) => {
        if (companyData.printSettings) setPrintSettings(companyData.printSettings);
      }));
    } else if (sessionCan(session, "orders.view")) {
      tasks.push(api<CompanyPrintSettings>("/api/orders/print-settings").then(setPrintSettings));
    }
    await Promise.allSettled(tasks);
  }, [session]);

  const loadNotifications = useCallback(async () => {
    if (!sessionCan(session, "orders.view")) return setNotifications([]);
    try {
      setNotifications(await api<OrderNotification[]>("/api/orders/notifications"));
    } catch {
      // Notifications must not interrupt the operational order screen.
    }
  }, [session]);

  const load = useCallback(async () => {
    if (!sessionCan(session, "orders.view")) {
      setOrders([]);
      setInitialDataLoading(false);
      return;
    }
    const loadSequence = ++orderLoadSequenceRef.current;
    try {
      const orderData = await api<Order[]>("/api/orders");
      if (loadSequence !== orderLoadSequenceRef.current) return;
      const incomingActive = orderData.filter(
        (order) =>
          !["delivered", "cancelled", "fulfilled"].includes(order.status),
      );
      setOrders((current) => {
        const currentActive = current.filter(
          (order) =>
            !["delivered", "cancelled", "fulfilled"].includes(order.status),
        );
        if (!incomingActive.length && currentActive.length) {
          consecutiveEmptyLoadsRef.current += 1;
          if (consecutiveEmptyLoadsRef.current < 2) {
            setSyncWarning(
              "Sunucudan boş yanıt alındı. Son sağlam sipariş listesi korunuyor; bağlantı yeniden deneniyor.",
            );
            return current;
          }
        } else {
          consecutiveEmptyLoadsRef.current = 0;
        }
        const orderSignature = (items: Order[]) => items.map((item) => [
          item.id,
          item.status,
          item.updatedAt,
          item.draftUpdatedAt,
          item.despatchReady,
          item.approvalForm?.updatedAt,
          (item.activeEditors ?? []).map((editor) => editor.id || editor.name).join(","),
        ].join(":" )).join("|");
        if (orderSignature(current) === orderSignature(orderData)) {
          setSyncWarning("");
          return current;
        }
        if (session && incomingActive.length) {
          try {
            const cache = incomingActive.map((order) => ({
              ...order,
              deliveryPhoto: "",
            }));
            localStorage.setItem(
              `arix-order-active-cache:${session.id}`,
              JSON.stringify(cache),
            );
          } catch {
            // The live data remains authoritative if browser storage is full.
          }
        } else if (session && !incomingActive.length) {
          localStorage.removeItem(`arix-order-active-cache:${session.id}`);
        }
        setSyncWarning("");
        return orderData;
      });
      hasLoadedRef.current = true;
      setInitialDataLoading(false);
    } catch (cause) {
      if (loadSequence !== orderLoadSequenceRef.current) return;
      setInitialDataLoading(false);
      setSyncWarning(
        hasLoadedRef.current
          ? "Bağlantı geçici olarak kesildi. Son sağlam veriler gösteriliyor ve otomatik yeniden bağlanılıyor."
          : cause instanceof Error
            ? cause.message
            : "Məlumat alınmadı.",
      );
    }
  }, [session]);

  useEffect(() => {
    api<Session | null>("/api/auth/session")
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const refreshPermissions = () => {
      void api<Session | null>("/api/auth/session")
        .then((fresh) => {
          if (!cancelled && fresh) {
            setSession((current) => JSON.stringify(current) === JSON.stringify(fresh) ? current : fresh);
          }
        })
        .catch(() => undefined);
    };
    const onFocus = () => refreshPermissions();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshPermissions();
    };
    const timer = window.setInterval(refreshPermissions, 15_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session?.id]);

  useEffect(() => {
    const expire = () => {
      setSession(null);
      setOrders([]);
      setProducts([]);
      setCustomers([]);
      setApprovalOrders([]);
      setDeletedOrders([]);
      setActiveOrder(null);
      setActiveApprovalOrder(null);
      setCreateOpen(false);
      setSettingsOpen(false);
    };
    window.addEventListener("arix-auth-expired", expire);
    return () => window.removeEventListener("arix-auth-expired", expire);
  }, []);

  useEffect(() => {
    if (!session) return;
    void load();
    void loadSupportingData();
    void loadNotifications();
  }, [session, load, loadSupportingData, loadNotifications]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [session, load]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => void loadSupportingData(), 60_000);
    return () => window.clearInterval(timer);
  }, [session, loadSupportingData]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => void loadNotifications(), 15_000);
    return () => window.clearInterval(timer);
  }, [session, loadNotifications]);

  useEffect(() => {
    if (!activeOrder) return;
    const fresh = orders.find((order) => order.id === activeOrder.id);
    if (fresh && fresh !== activeOrder) setActiveOrder(fresh);
  }, [orders, activeOrder]);

  const grouped = useMemo(
    () => {
      const query = boardSearch.trim().toLocaleLowerCase("tr-TR");
      const boardOrders = query
        ? orders.filter((order) => order.customerName.toLocaleLowerCase("tr-TR").includes(query))
        : orders;
      return {
        new: boardOrders.filter((order) => order.status === "new"),
        preparing: boardOrders.filter((order) => order.status === "preparing"),
        ready: boardOrders.filter((order) => order.status === "ready"),
        delivered: boardOrders.filter((order) => {
          if (order.status !== "delivered") return false;
          const deliveredDate = String(order.deliveredAt || "").slice(0, 10);
          return !orderDay?.date
            || order.businessDate === orderDay.date
            || deliveredDate === orderDay.date;
        }),
      };
    },
    [orders, orderDay?.date, boardSearch],
  );
  const deliveredByDay = useMemo(() => {
    const groups = new Map<string, Order[]>();
    const rolloverTargetDate = (order: Order, rollover: NonNullable<Order["rolloverHistory"]>[number]) => {
      const laterActivityDates = [
        ...(order.history ?? []).map((entry) => entry.at),
        ...(order.audit ?? []).map((entry) => entry.at),
        order.deliveredAt,
      ]
        .filter((value): value is string => Boolean(value) && String(value) > String(rollover.at || ""))
        .map((value) => String(value).slice(0, 10))
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date > rollover.fromDate)
        .sort();
      return laterActivityDates[0] || rollover.toDate;
    };
    for (const order of orders) {
      for (const rollover of order.rolloverHistory ?? []) {
        const archivedOrder = {
          ...order,
          ...rollover.snapshot,
          businessDate: rollover.fromDate,
          reportRolloverTo: rolloverTargetDate(order, rollover),
        } as Order;
        groups.set(rollover.fromDate, [
          ...(groups.get(rollover.fromDate) ?? []),
          archivedOrder,
        ]);
      }
      if (order.status === "cancelled") continue;
      const value = order.status === "delivered" && order.deliveredAt
        ? order.deliveredAt
        : order.businessDate || order.createdAt || new Date().toISOString();
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        groups.set(value, [...(groups.get(value) ?? []), order]);
        continue;
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      groups.set(key, [...(groups.get(key) ?? []), order]);
    }
    return [...groups.entries()].sort(([left], [right]) =>
      right.localeCompare(left),
    );
  }, [orders]);
  const isOwner = session
    ? session.role.trim().toLocaleLowerCase("az") === "sahib"
    : false;
  const currentWorkflowRole = session ? workflowRole(session.role) : "viewer";
  const canSell =
    currentWorkflowRole === "owner" || Boolean(session?.permissions?.includes("orders.create"));
  const canMergeReady = currentWorkflowRole === "owner" || Boolean(session?.permissions?.includes("orders.merge_ready"));
  const mergeReadyGroups = useMemo(() => {
    const groups = new Map<string, Order[]>();
    for (const order of orders.filter((item) => item.status === "ready")) {
      const key = readyMergeKey(order);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), order]);
    }
    return [...groups.values()].filter((items) => items.length >= 2);
  }, [orders]);

  const mergeReadyOrders = async (selected: Order[]) => {
    setMergeReadyBusy(true);
    setError("");
    try {
      const merged = await api<Order>("/api/orders/merge-ready", { method: "POST", body: JSON.stringify({ orderIds: selected.map((order) => order.id) }) });
      setMergeReadySelection(null);
      setMergeReadyCheckedIds([]);
      await load();
      setActiveOrder(merged);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hazır siparişler birleştirilemedi.");
    } finally {
      setMergeReadyBusy(false);
    }
  };
  const canViewApprovalForms =
    currentWorkflowRole === "owner" ||
    Boolean(session?.permissions?.includes("order_forms.view"));
  const canViewDays = currentWorkflowRole === "owner" || Boolean(session?.permissions?.includes("orders.days.view"));
  const canManageDays = currentWorkflowRole === "owner" || Boolean(session?.permissions?.includes("orders.days.manage"));
  const canManageTrash = currentWorkflowRole === "owner" || Boolean(session?.permissions?.includes("trash.manage"));
  const canViewStock = currentWorkflowRole === "owner" || ["products.view", "products.manage"]
    .some((permission) => session?.permissions?.includes(permission));
  const canOpenSettings = currentWorkflowRole === "owner" || [
    "company.view", "company.manage", "products.view", "products.manage",
    "counterparties.view", "counterparties.manage", "employees.manage",
  ].some((permission) => session?.permissions?.includes(permission));
  const unreadNotificationCount = notifications.filter((item) => !item.readAt).length;

  const manageDeletedOrder = async (order: Order, action: "restore" | "delete") => {
    if (action === "delete" && !window.confirm(`${order.number} kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) return;
    setInactiveOrderBusyId(order.id);
    setError("");
    try {
      await api(`/api/orders/trash/${order.id}${action === "restore" ? "/restore" : ""}`, {
        method: action === "restore" ? "POST" : "DELETE",
      });
      await Promise.all([load(), loadSupportingData()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı.");
    } finally {
      setInactiveOrderBusyId("");
    }
  };

  useEffect(() => {
    if (!session || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (cancelled) return;
        setPushEnabled(Boolean(subscription));
        if (subscription) void api("/api/orders/push-subscriptions", { method: "POST", body: JSON.stringify({ subscription: subscription.toJSON() }) });
      })
      .catch(() => { if (!cancelled) setPushEnabled(false); });
    return () => { cancelled = true; };
  }, [session]);

  const enablePushNotifications = async () => {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Bu cihaz push bildirimini desteklemiyor.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Bildirim izni verilmedi.");
      const registration = await navigator.serviceWorker.ready;
      const config = await api<{ publicKey: string }>("/api/orders/push-config");
      if (!config.publicKey) throw new Error("Push bildirim anahtarı sunucuda tanımlı değil.");
      const bytes = Uint8Array.from(atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(config.publicKey.length / 4) * 4, "=")), (character) => character.charCodeAt(0));
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      await api("/api/orders/push-subscriptions", { method: "POST", body: JSON.stringify({ subscription: subscription.toJSON() }) });
      setPushEnabled(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bildirimler açılamadı.");
    }
  };

  const testPushNotification = async () => {
    try {
      const result = await api<{ delivered: number }>("/api/orders/push-test", { method: "POST" });
      if (!result.delivered) throw new Error("Bu cihazın aktif push aboneliği bulunamadı. Bildirimleri yeniden açın.");
    } catch (cause) {
      setPushEnabled(false);
      setError(cause instanceof Error ? cause.message : "Test bildirimi gönderilemedi.");
    }
  };

  const openNotificationPreferences = async () => {
    setNotificationMenuOpen(false);
    setNotificationPreferencesOpen(true);
    setNotificationSettingsBusy(true);
    try {
      setMyNotificationSettings(await api("/api/orders/notification-preferences"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bildirim ayarları yüklenemedi.");
    } finally {
      setNotificationSettingsBusy(false);
    }
  };

  const saveMyNotificationPreferences = async () => {
    if (!myNotificationSettings) return;
    setNotificationSettingsBusy(true);
    try {
      const next = await api<typeof myNotificationSettings>("/api/orders/notification-preferences", { method: "PATCH", body: JSON.stringify(myNotificationSettings.preferences) });
      setMyNotificationSettings(next);
      setNotificationPreferencesOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bildirim ayarları kaydedilemedi.");
    } finally {
      setNotificationSettingsBusy(false);
    }
  };

  const markNotificationRead = async (notification: OrderNotification) => {
    if (!notification.readAt) {
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, readAt } : item),
      );
      void api<OrderNotification>(`/api/orders/notifications/${notification.id}`, {
        method: "PATCH",
      }).catch(() => void loadNotifications());
    }
  };

  const notificationTarget = (notification: OrderNotification) => {
    if (notification.type === "day_closed" && notification.dayKey) return "day" as const;
    if (!notification.orderId) return null;
    if (["approval_requested", "approval_completed", "approval_form_prepared", "approval_form_edited", "approval_form_preparing_started", "approval_form_editing_started", "approval_form_archived"].includes(notification.type)) {
      return "form" as const;
    }
    return "order" as const;
  };

  const runNotificationAction = async (notification: OrderNotification) => {
    await markNotificationRead(notification);
    const targetType = notificationTarget(notification);
    if (!targetType) return;
    if (targetType === "day") {
      setPageTab("days");
      setNotificationMenuOpen(false);
      window.setTimeout(() => {
        document.getElementById(`order-day-${notification.dayKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      return;
    }
    const target = [...approvalOrders, ...orders].find((item) => item.id === notification.orderId);
    if (!target) {
      setError("İlgili sipariş mevcut listenizde bulunamadı veya erişim yetkiniz yok.");
      return;
    }
    if (targetType === "form") {
      setPageTab("forms");
      setApprovalEntrySource("forms");
      setApprovalEditorIntent("view");
      setActiveApprovalOrder(target);
    } else {
      setPageTab("board");
      setActiveOrder(target);
    }
    setNotificationMenuOpen(false);
  };

  const markAllNotificationsRead = async () => {
    try {
      const result = await api<{ updated: number; readAt: string }>("/api/orders/notifications/read-all", { method: "POST" });
      if (result.updated) setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt: result.readAt }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bildirimler güncellenemedi.");
    }
  };
  const visibleBoardStatuses: BoardStatus[] =
    currentWorkflowRole === "delivery"
      ? ["ready", "delivered"]
      : ["new", "preparing", "ready", "delivered"];

  const toggleDay = async (): Promise<boolean> => {
    if (!orderDay || !canManageDays || dayToggleBusyRef.current) return false;
    dayToggleBusyRef.current = true;
    setError("");
    try {
      const closingDay = !orderDay.closed;
      const next = await api<OrderDay>(`/api/orders/day?date=${encodeURIComponent(orderDay.date)}`, {
        method: "POST",
        body: JSON.stringify({ closed: closingDay }),
      });
      setOrderDay(closingDay ? await api<OrderDay>("/api/orders/day") : next);
      await Promise.all([load(), loadNotifications()]);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "İş günü dəyişdirilmədi.",
      );
      return false;
    } finally {
      dayToggleBusyRef.current = false;
    }
  };

  useEffect(() => {
    if (!session || pageTab !== "forms" || !canViewApprovalForms) return;
    api<Order[]>("/api/orders/approval-forms")
      .then(setApprovalOrders)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Sipariş formları yüklenemedi."));
  }, [session, pageTab, canViewApprovalForms, orders]);

  if (session === undefined)
    return <div className="center-state">Yüklənir…</div>;
  if (!session)
    return (
      <Login
        language={language}
        setLanguage={setLanguage}
        isDark={isDark}
        setIsDark={setIsDark}
        onSuccess={(user) => setSession(user)}
      />
    );

  const logout = async () => {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
    }
  };

  return (
    <main className={`app-shell ${isDark ? "theme-dark" : ""}`}>
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur ${isDark ? "glass-header-dark border-white/10" : "glass-header border-white/70"}`}
      >
        <div className="flex w-full items-center justify-between px-3 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <AriXLogo className="glass-logo h-11 w-11" />
            <div className="hidden text-lg font-semibold tracking-tight sm:block">
              AriX Order
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Settings button */}
            {canOpenSettings && (
              <button
                onClick={() => {
                  setSettingsMode("settings");
                  setSettingsOpen(true);
                }}
                className={`mobile-header-control inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${isDark ? "glass-control-dark border-white/10 hover:bg-white/10" : "glass-control border-white/70 hover:bg-white/75"}`}
                aria-label={text.settings}
              >
                <span className="arix-header-icon" aria-hidden="true">
                  <Settings2 />
                </span>
                <span className="hidden sm:inline">{text.settings}</span>
              </button>
            )}

            {/* Language menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setLanguageMenuOpen((value) => !value);
                  setProfileMenuOpen(false);
                  setNotificationMenuOpen(false);
                }}
                className={`mobile-header-control inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${isDark ? "glass-control-dark border-white/10 hover:bg-white/10" : "glass-control border-white/70 hover:bg-white/75"}`}
                aria-label="Dil"
                aria-expanded={languageMenuOpen}
              >
                <span className="arix-header-icon" aria-hidden="true">
                  <HeaderIcon.Globe />
                </span>
                <span className="hidden sm:inline">
                  {languageOptions.find((item) => item.id === language)?.label}
                </span>
                <span className="mobile-control-label sm:hidden">{language.toUpperCase()}</span>
                <HeaderIcon.ChevronDown
                  className={`mobile-control-chevron h-3.5 w-3.5 transition-transform ${languageMenuOpen ? "rotate-180" : ""}`}
                />
              </button>
              {languageMenuOpen && (
                <div
                  className={`surface-popover absolute right-0 top-12 z-50 w-52 rounded-2xl border p-2 shadow-xl ${isDark ? "glass-panel-dark border-white/10" : "glass-panel border-white/70"}`}
                >
                  {languageOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setLanguage(item.id);
                        setLanguageMenuOpen(false);
                      }}
                      className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition ${item.id === language ? "surface-nav-active text-indigo-700" : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-700 hover:bg-white/70"}`}
                    >
                      <span
                        className={`flex h-7 w-9 items-center justify-center rounded-lg text-xs font-bold ${item.id === language ? "bg-indigo-600 text-white" : isDark ? "bg-white/10" : "bg-slate-100"}`}
                      >
                        {item.short}
                      </span>
                      <span className="flex-1 font-medium">{item.label}</span>
                      {item.id === language && (
                        <span className="text-indigo-500">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dark / Light toggle */}
            <button
              onClick={() => setIsDark((current) => !current)}
              className={`mobile-header-control inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${isDark ? "glass-control-dark border-white/10 hover:bg-white/10" : "glass-control border-white/70 hover:bg-white/75"}`}
              aria-label="Tema"
            >
              <span className={`arix-header-icon ${isDark ? "is-moon" : "is-sun"}`} aria-hidden="true">
                {isDark ? <Moon /> : <Sun />}
              </span>
              <span className="mobile-control-label">{isDark ? "Dark" : "Light"}</span>
            </button>

            {/* Approval notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationMenuOpen((value) => !value);
                  setLanguageMenuOpen(false);
                  setProfileMenuOpen(false);
                }}
                className={`mobile-header-control relative inline-flex h-11 w-11 items-center justify-center rounded-xl border transition ${isDark ? "glass-control-dark border-white/10 hover:bg-white/10" : "glass-control border-white/70 hover:bg-white/75"}`}
                aria-label="Bildirimler"
                aria-expanded={notificationMenuOpen}
              >
                <span className="arix-header-icon" aria-hidden="true">
                  <Bell />
                </span>
                {unreadNotificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                  </span>
                )}
              </button>
              {notificationMenuOpen && createPortal(
                <div className={`notification-popover surface-popover absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border shadow-xl ${isDark ? "is-dark glass-panel-dark border-white/10" : "glass-panel border-white/70"}`}>
                  <div className="notification-popover-header flex items-center justify-between border-b px-4 py-3">
                    <span><strong className="block text-sm">Bildirimler</strong>{unreadNotificationCount > 0 && <button type="button" className="mt-1 text-[11px] font-semibold text-slate-500" onClick={() => void markAllNotificationsRead()}>Tümünü okundu yap</button>}</span>
                    <span className="flex items-center gap-3"><button type="button" className="notification-settings-trigger" title="Bildirim ayarları" aria-label="Bildirim ayarları" onClick={() => void openNotificationPreferences()}><Settings2 aria-hidden="true" /></button>{pushEnabled ? <><button type="button" className="text-xs font-semibold text-emerald-600" onClick={() => void testPushNotification()}>Test et</button><button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => void enablePushNotifications()}>Yenile</button></> : <button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => void enablePushNotifications()}>Bu cihazda bildirimleri aç</button>}</span>
                  </div>
                  <div className="notification-popover-list max-h-96 overflow-y-auto p-2">
                    {notifications.length ? notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => void runNotificationAction(notification)}
                        className={`notification-popover-item mb-2 block w-full rounded-xl border px-3 py-3 text-left transition last:mb-0 ${notification.readAt ? "is-read" : "is-unread"}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? "bg-slate-300" : "bg-indigo-600"}`} />
                          <span className="min-w-0 flex-1">
                            <b className="block text-sm">{notification.title}</b>
                            <small className="notification-popover-message mt-1 block text-xs">{notification.message}</small>
                            <small className="notification-popover-time mt-1.5 block text-[11px]">{new Date(notification.createdAt).toLocaleString("tr-TR")}</small>
                          </span>
                        </div>
                        {(notification.orderId || notification.dayKey) && <span className="mt-2 block text-right text-[11px] font-semibold text-indigo-600">{notification.dayKey ? "Gün raporunu görüntüle" : "İlgili kaydı aç"}</span>}
                      </button>
                    )) : (
                      <div className="px-4 py-8 text-center text-sm text-slate-500">Henüz bildirim yok</div>
                    )}
                  </div>
                </div>,
                document.body,
              )}
            </div>

            {/* Profile menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((value) => !value);
                  setLanguageMenuOpen(false);
                  setNotificationMenuOpen(false);
                }}
                className={`mobile-header-control flex h-11 items-center gap-2 rounded-xl border px-2.5 transition ${isDark ? "glass-control-dark border-white/10 hover:bg-white/10" : "glass-control border-white/70 hover:bg-white/80"}`}
                aria-expanded={profileMenuOpen}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/12 text-xs font-bold text-indigo-600">
                  {session.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="hidden min-w-0 text-left sm:block">
                  <div className="truncate text-sm font-semibold leading-4">
                    {session.name}
                  </div>
                  <div
                    className={`truncate text-[11px] leading-3.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}
                  >
                    {session.role}
                  </div>
                </div>
                <HeaderIcon.ChevronDown
                  className={`mobile-control-chevron h-4 w-4 shrink-0 transition-transform ${profileMenuOpen ? "rotate-180" : ""}`}
                />
              </button>
              {profileMenuOpen && (
                <div
                  className={`surface-popover absolute right-0 top-12 z-50 w-72 rounded-2xl border p-2 shadow-xl ${isDark ? "glass-panel-dark border-white/10" : "glass-panel border-white/70"}`}
                >
                  <div
                    className={`rounded-xl border p-3 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50/80"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/12 text-sm font-bold text-indigo-600">
                        {session.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {session.name}
                        </div>
                        <div
                          className={`truncate text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}
                        >
                          {session.role}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className={`mt-2 flex h-10 w-full items-center justify-center rounded-xl text-sm font-semibold ${isDark ? "text-rose-200 hover:bg-rose-400/10" : "text-rose-600 hover:bg-rose-50"}`}
                  >
                    {text.logout}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="order-content">
        {syncWarning && (
          <div className="sync-warning" role="status">
            <span className="sync-warning-dot" />
            <div>
              <b>Veriler korunuyor</b>
              <span>{syncWarning}</span>
            </div>
            <button type="button" onClick={() => void load()}>
              Yeniden dene
            </button>
          </div>
        )}
        {error && (
          <div className="notice" role="alert">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {pageTab === "board" && <section className="page-head">
          <div>
            <p className="eyebrow">{text.flow}</p>
            <h1>{text.title}</h1>
            <p>{text.subtitle}</p>
          </div>
          <div className="page-actions">
            <div className="summary">
              <b>
                {initialDataLoading && !orders.length
                  ? "—"
                  :
                  orders.filter(
                    (o) =>
                      !["delivered", "cancelled", "fulfilled"].includes(
                        o.status,
                      ),
                  ).length}
              </b>
              <span>{text.active}</span>
            </div>
            <button className="inactive-orders-trigger" type="button" onClick={() => setInactiveOrdersOpen(true)} aria-label="İptal ve silinen siparişler" title="İptal ve silinen siparişler">
              <Trash2 aria-hidden="true" />
              {deletedOrders.length > 0 && <span>{deletedOrders.length > 99 ? "99+" : deletedOrders.length}</span>}
            </button>
            {canSell && (
              <button
                className="primary"
                onClick={() => setCreateOpen(true)}
                aria-label={text.create}
              >
                <span className="create-order-plus" aria-hidden="true">＋</span>
                <span className="create-order-label">{text.create}</span>
              </button>
            )}
          </div>
        </section>}
        <div className="order-view-tabs" role="tablist">
          <button
            className={pageTab === "board" ? "active" : ""}
            onClick={() => setPageTab("board")}
          >
            <ListChecks aria-hidden="true" /><span>{text.workflowTab}</span>
          </button>
          {canViewApprovalForms && (
            <button
              className={pageTab === "forms" ? "active" : ""}
              onClick={() => setPageTab("forms")}
            >
              <FileText aria-hidden="true" /><span>{text.approvalFormsTab}</span>
            </button>
          )}
          {canViewDays && (
            <button
              className={pageTab === "days" ? "active" : ""}
              onClick={() => setPageTab("days")}
            >
              <CalendarDays aria-hidden="true" /><span>{text.daysTab}</span>
            </button>
          )}
          {canViewStock && (
            <button
              className={pageTab === "stock" ? "active" : ""}
              onClick={() => setPageTab("stock")}
            >
              <Layers3 aria-hidden="true" /><span>Stok</span>
            </button>
          )}
        </div>
        {initialDataLoading && !orders.length && (
          <div className="orders-loading-state">
            <span />
            Siparişler yükleniyor…
          </div>
        )}
        {initialDataLoading && !orders.length ? null : pageTab === "board" ? (
          <div className="board-view">
            <label className="board-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                value={boardSearch}
                onChange={(event) => setBoardSearch(event.target.value)}
                placeholder="Müşteri adıyla ara"
                aria-label="Müşteri adıyla sipariş ara"
              />
              {boardSearch && (
                <button type="button" onClick={() => setBoardSearch("")} aria-label="Aramayı temizle">
                  <X aria-hidden="true" />
                </button>
              )}
            </label>
            <section className="board">
              {visibleBoardStatuses.map((status) => (
                <BoardColumn
                  key={status}
                  status={status}
                  orders={grouped[status]}
                  onOpen={setActiveOrder}
                  language={language}
                  onMerge={status === "ready" && canMergeReady && mergeReadyGroups.length ? (group) => {
                    setMergeReadySelection(group);
                    setMergeReadyCheckedIds([]);
                  } : undefined}
                />
              ))}
            </section>
          </div>
        ) : pageTab === "forms" ? (
          <ApprovalFormsPage orders={approvalOrders} onOpen={(order) => {
            setApprovalEntrySource("forms");
            setApprovalPreviewOnly(false);
            setApprovalEditorIntent("view");
            setActiveApprovalOrder(order);
          }} onShowPdf={(order) => {
            setApprovalEntrySource("forms");
            const documentType = order.approvalForm?.documentType;
            if (order.isExport || (documentType && documentType !== "domestic")) setExportPreviewOrder(order);
            else setPdfOrder(order);
          }} />
        ) : pageTab === "days" ? (
          <DailyArchive
            groups={deliveredByDay}
            currentDay={orderDay}
            isOwner={canManageDays}
            onToggleDay={toggleDay}
            onOpen={setActiveOrder}
            language={language}
          />
        ) : pageTab === "stock" ? (
          <StockPage
            products={products}
            language={language}
            session={session}
            canManage={currentWorkflowRole === "owner" || Boolean(session.permissions?.includes("products.manage"))}
            onManage={() => {
              setSettingsMode("stock");
              setSettingsOpen(true);
            }}
            onChanged={() => void loadSupportingData()}
          />
        ) : null}
        <footer className="app-page-footer">
          <span>Powered by</span>
          <AriXLogo />
          <strong>AriX</strong>
          <span>Sipariş sistemi</span>
          <a href="https://www.arix.az" target="_blank" rel="noreferrer">
            www.arix.az
          </a>
        </footer>
        {inactiveOrdersOpen && (
          <Modal title="İptal ve silinenler" subtitle={`${deletedOrders.length} kayıt`} onClose={() => setInactiveOrdersOpen(false)} className="inactive-orders-modal">
            {deletedOrders.length ? <div className="inactive-orders-list modal-list">
              {deletedOrders.map((order) => {
                const deleted = Boolean(order.deletedAt);
                const reason = deleted ? order.deletionReason : order.cancellationReason;
                const actor = deleted ? order.deletedBy : order.cancelledBy;
                const at = deleted ? order.deletedAt : order.cancelledAt || order.updatedAt;
                return <article className="inactive-order-row" key={`${deleted ? "deleted" : "cancelled"}-${order.id}`}>
                  <button type="button" className="inactive-order-info" onClick={() => { if (!deleted) { setInactiveOrdersOpen(false); setActiveOrder(order); } }} disabled={deleted}>
                    <span className={`inactive-order-icon ${deleted ? "deleted" : "cancelled"}`}><Trash2 aria-hidden="true" /></span>
                    <span className="inactive-order-main"><b>{order.customerName}</b><small>{order.number} · {order.items.length} ürün · {deleted ? "Silindi" : "İptal edildi"}</small></span>
                    <span className="inactive-order-detail"><span>{reason || "Sebep kaydedilmemiş"}</span><small>{actor || "-"}{at ? ` · ${new Date(at).toLocaleString(language, { dateStyle: "short", timeStyle: "short" })}` : ""}</small></span>
                  </button>
                  {deleted && canManageTrash && <div className="inactive-order-actions">
                    <button type="button" className="secondary" disabled={inactiveOrderBusyId === order.id} onClick={() => void manageDeletedOrder(order, "restore")}>{text.restore}</button>
                    <button type="button" className="danger-button" disabled={inactiveOrderBusyId === order.id} onClick={() => void manageDeletedOrder(order, "delete")}><Trash2 aria-hidden="true" />{text.deleteForever}</button>
                  </div>}
                </article>;
              })}
            </div> : <div className="inactive-orders-empty"><Trash2 aria-hidden="true" /><b>Henüz iptal veya silinen sipariş yok</b></div>}
          </Modal>
        )}
      </div>

      {createOpen && (
        <CreateOrder
          products={products}
          session={session}
          customers={customers}
          draftKey={`arix-order-draft:${session.id}`}
          language={language}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}

      {mergeReadySelection && (
        <Modal title="Hazır siparişleri birleştir" subtitle={`${mergeReadySelection[0].customerName} · ${mergeReadySelection.length} hazır siparişten birleştirilecekleri seçin.`} onClose={() => {
          if (mergeReadyBusy) return;
          setMergeReadySelection(null);
          setMergeReadyCheckedIds([]);
        }}>
          <div className="merge-ready-groups">
              <article className="merge-ready-summary">
                <div className="merge-ready-summary-copy">
                  <span className="merge-ready-summary-icon"><Layers3 aria-hidden="true" /></span>
                  <span>
                    <strong>{mergeReadyCheckedIds.length} sipariş seçildi</strong>
                    <small>{mergeReadyCheckedIds.length < 2 ? "Birleştirmek için en az iki sipariş seçin." : "Seçilen siparişler tek teslimatta birleştirilecek."}</small>
                  </span>
                </div>
                <button type="button" className="primary" disabled={mergeReadyBusy || mergeReadyCheckedIds.length < 2} onClick={() => void mergeReadyOrders(mergeReadySelection.filter((order) => mergeReadyCheckedIds.includes(order.id)))}>Seçilenleri birleştir</button>
              </article>
              <div className="merge-ready-picker">
                {mergeReadySelection.map((order) => {
                  const selected = mergeReadyCheckedIds.includes(order.id);
                  return (
                  <label key={order.id} className={selected ? "is-selected" : ""}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setMergeReadyCheckedIds((current) => checked ? [...current, order.id] : current.filter((id) => id !== order.id));
                      }}
                    />
                    <span className="merge-ready-order-copy">
                      <b>{order.number}</b>
                      <small>{order.items.map((item) => item.productName).join(" · ")}</small>
                    </span>
                    <span className="merge-ready-order-meta">
                      <b>{order.items.map((item) => preparedQuantityLabel(item)).join(" · ")}</b>
                      <small>{order.items.length} ürün satırı</small>
                    </span>
                  </label>
                );})}
              </div>
          </div>
        </Modal>
      )}

      {notificationPreferencesOpen && (
        <Modal title="Bildirim ayarları" subtitle="Almak istediğiniz bildirimleri seçin." onClose={() => setNotificationPreferencesOpen(false)} className="notification-preferences-modal">
          {notificationSettingsBusy && !myNotificationSettings ? <div className="center-state">Yükleniyor…</div> : myNotificationSettings && <div className="self-notification-preferences">
            <div className="self-notification-channels">
              <label><span className="notification-channel-icon"><Bell aria-hidden="true" /></span><span><b>Uygulama içi</b><small>Zil menüsünde göster</small></span><input type="checkbox" checked={myNotificationSettings.preferences.inApp !== false} onChange={(event) => setMyNotificationSettings((current) => current ? { ...current, preferences: { ...current.preferences, inApp: event.target.checked } } : current)} /></label>
              <label><span className="notification-channel-icon"><Smartphone aria-hidden="true" /></span><span><b>Cihaz bildirimi</b><small>Telefon ve bilgisayara gönder</small></span><input type="checkbox" checked={myNotificationSettings.preferences.push !== false} onChange={(event) => setMyNotificationSettings((current) => current ? { ...current, preferences: { ...current.preferences, push: event.target.checked } } : current)} /></label>
            </div>
            <div className="self-notification-groups">
              {notificationEventGroups.map((group) => {
                const options = notificationEventOptions.filter(([key]) => group.keys.includes(key as never) && myNotificationSettings.permissions.events?.[key] !== false);
                if (!options.length) return null;
                const selected = options.filter(([key]) => myNotificationSettings.preferences.events?.[key] !== false).length;
                return <details key={group.label}>
                  <summary><span><b>{group.label}</b><small>{options.length} bildirim türü</small></span><strong>{selected}/{options.length}</strong></summary>
                  <div className="self-notification-events">
                    {options.map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" checked={myNotificationSettings.preferences.events?.[key] !== false} onChange={(event) => setMyNotificationSettings((current) => current ? { ...current, preferences: { ...current.preferences, events: { ...current.preferences.events, [key]: event.target.checked } } } : current)} /></label>)}
                  </div>
                </details>;
              })}
            </div>
            <div className="modal-actions"><button type="button" className="secondary" onClick={() => setNotificationPreferencesOpen(false)}>Vazgeç</button><button type="button" className="primary" disabled={notificationSettingsBusy} onClick={() => void saveMyNotificationPreferences()}>Kaydet</button></div>
          </div>}
        </Modal>
      )}

      {settingsOpen && (
        <SettingsModal
          products={products}
          session={session}
          customers={customers}
          aliases={aliases}
          language={language}
          printSettings={printSettings}
          onPrintSettingsChange={setPrintSettings}
          onClose={() => setSettingsOpen(false)}
          onReload={() => {
            void load();
            void loadSupportingData();
          }}
          productsOnly={settingsMode === "stock"}
        />
      )}

      {activeOrder && (
        <OrderDetail
          order={activeOrder}
          allOrders={orders}
          products={products}
          customers={customers}
          printSettings={printSettings}
          isOwner={isOwner}
          session={session}
          workflowRole={currentWorkflowRole}
          language={language}
          onClose={() => {
            localStorage.removeItem(`arix-order-open:${session.id}`);
            setActiveOrder(null);
          }}
          onChanged={(next) => {
            setActiveOrder(next);
            void load();
            if (next.status === "cancelled") void loadSupportingData();
            void loadNotifications();
          }}
          onShowApprovalPdf={(order) => {
            setApprovalEntrySource("order");
            setPdfOrder(order);
          }}
          onDeleted={() => {
            localStorage.removeItem(`arix-order-open:${session.id}`);
            setActiveOrder(null);
            void load();
            void loadSupportingData();
          }}
        />
      )}
      {activeApprovalOrder && (
        <ApprovalFormEditor
          key={activeApprovalOrder.id}
          order={activeApprovalOrder}
          customers={customers}
          printSettings={printSettings}
          session={session}
          language={language}
          initialAction={approvalEditorIntent}
          allowApproval={approvalEntrySource === "forms"}
          previewOnly={approvalPreviewOnly}
          onClose={() => {
            setActiveApprovalOrder(null);
            setApprovalPreviewOnly(false);
            setApprovalEditorIntent("view");
          }}
          onSaved={(next) => {
            setActiveApprovalOrder(next);
            setApprovalOrders((current) => current.map((item) => item.id === next.id ? next : item));
            void load();
            if (next.approvalForm?.status === "approved" && next.approvalForm.archive?.path) setPdfOrder(next);
          }}
        />
      )}
      {exportPreviewOrder && (
        <Modal
          title="Belgeyi göster"
          subtitle={`${exportPreviewOrder.customerName} · ${exportPreviewOrder.number}`}
          onClose={() => setExportPreviewOrder(null)}
          className="export-preview-picker"
        >
          <div className="export-preview-options">
            {([
              ["proforma", "Proforma Invoice", "Müşteriye gönderilen onay belgesi"],
              ["commercial_invoice", "Commercial Invoice", "Sevkiyatın ticari faturası"],
              ["packing_list", "Packing List", "Palet, ağırlık ve paket bilgileri"],
            ] as const).map(([documentType, title, description]) => (
              <button
                type="button"
                key={documentType}
                onClick={() => {
                  const approvalForm = exportPreviewOrder.approvalForm;
                  if (!approvalForm) return;
                  setActiveApprovalOrder({
                    ...exportPreviewOrder,
                    approvalForm: { ...approvalForm, documentType },
                  });
                  setApprovalPreviewOnly(true);
                  setApprovalEditorIntent("view");
                  setExportPreviewOrder(null);
                }}
              >
                <FileText aria-hidden="true" />
                <span><b>{title}</b><small>{description}</small></span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {pdfOrder && (
        <ApprovalPdfViewer
          order={pdfOrder}
          session={session}
          allowApproval={approvalEntrySource === "forms"}
          onClose={() => setPdfOrder(null)}
          onEdit={() => {
            setPdfOrder(null);
            setApprovalEditorIntent("edit");
            setActiveApprovalOrder(pdfOrder);
          }}
          onApprove={() => {
            setPdfOrder(null);
            setApprovalEditorIntent("approve");
            setActiveApprovalOrder(pdfOrder);
          }}
          onReject={() => {
            setPdfOrder(null);
            setApprovalEditorIntent("reject");
            setActiveApprovalOrder(pdfOrder);
          }}
        />
      )}
    </main>
  );
}

function BoardColumn({
  status,
  orders,
  onOpen,
  language,
  onMerge,
}: {
  status: BoardStatus;
  orders: Order[];
  onOpen: (order: Order) => void;
  language: Language;
  onMerge?: (orders: Order[]) => void;
}) {
  const meta = statusMeta[status];
  const text = copy[language];
  return (
    <section className={`column column-${status}`}>
      <header>
        <span className={`status-dot ${meta.tone}`} />
        <h2>{text[status]}</h2>
        <b>{orders.length}</b>
      </header>
      <div className="cards">
        {orders.length ? (
          orders.map((order) => {
            const mergeKey = status === "ready" ? readyMergeKey(order) : "";
            const mergeGroup = mergeKey
              ? orders.filter((candidate) => readyMergeKey(candidate) === mergeKey)
              : [];
            return <div className="order-card-stack" key={order.id}>
            <button
              className="order-card"
              onClick={() => onOpen(order)}
            >
              <div className="order-creator">
                <span>{text.createdBy}</span>
                <b>{order.createdBy}</b>
              </div>
              <div className="card-top">
                <span>{order.number}</span>
                <time>
                  {new Date(order.createdAt).toLocaleTimeString(language, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              {order.lockedAt && (
                <div className="order-lock-badge" title={order.lockReason || "Sipariş değişikliklere karşı kilitlendi"}>
                  <Lock aria-hidden="true" /><b>Kilitli</b><span>{order.lockedBy}</span>
                </div>
              )}
              {order.parentOrderNumber && (
                <div className="parent-order-link">
                  {text.originalOrder}: <b>{order.parentOrderNumber}</b>
                </div>
              )}
              {order.mergedOrderNumbers?.length ? (
                <div className="parent-order-link merged-order-link">Birleşenler: <b>{order.mergedOrderNumbers.join(" · ")}</b></div>
              ) : null}
              {(order.isPartialDelivery || order.partialDeliverySourceId) && (
                <div className="order-kind-badge partial-delivery"><b>Kısmi teslim</b></div>
              )}
              {order.status === "ready" && (order.hasPartialDelivery || order.audit?.some((entry) => entry.action === "partialDeliveryCreated")) && (
                <div className="order-kind-badge partial-remaining"><b>Kısmi teslim · Kalan miktar</b></div>
              )}
              {order.status === "ready" && (
                <div className="parent-order-link">
                  <b>
                    {order.despatchReady
                      ? order.withoutDespatch
                        ? text.deliveryWithoutDespatchReady
                        : `${text.despatchReady}: ${order.despatchNumber}`
                      : text.despatchPending}
                  </b>
                </div>
              )}
              {order.exportPackingRequired && (
                <div className="parent-order-link">
                  <b>Palet hazırlanacak · Packing List bekliyor</b>
                </div>
              )}
              {order.isLoanReturn && (
                <div className="order-kind-badge loan-return">
                  <b>Borç iadesi</b>
                </div>
              )}
              <h3>{order.customerName}</h3>
              <ul>
                {order.items.slice(0, 4).map((item, index) => (
                  <li key={`${item.productId}-${index}`}>
                    <span>{item.productName}</span>
                    <b>{status === "ready" ? preparedQuantityLabel(item) : orderedQuantityLabel(item)}</b>
                  </li>
                ))}
              </ul>
              {order.items.length > 4 && (
                <small>+{order.items.length - 4} məhsul</small>
              )}
              <footer>
                <span>
                  {order.items.length} {text.rows}
                </span>
              </footer>
            </button>
            {onMerge && mergeGroup.length >= 2 && (
              <button type="button" className="merge-ready-card-action" onClick={() => onMerge(mergeGroup)}>
                <Layers3 aria-hidden="true" />
                <span>Birleştir</span>
              </button>
            )}
            </div>;
          })
        ) : (
          <div className="empty">
            <span>✓</span>
            <p>{text.empty}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function DailyArchive({
  groups,
  currentDay,
  isOwner,
  onToggleDay,
  onOpen,
  language,
}: {
  groups: Array<[string, Order[]]>;
  currentDay: OrderDay | null;
  isOwner: boolean;
  onToggleDay: () => Promise<boolean>;
  onOpen: (order: Order) => void;
  language: Language;
}) {
  const ui = copy[language];
  const [reportBusyDay, setReportBusyDay] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportPreview, setReportPreview] = useState<{ url: string; filename: string } | null>(null);
  const [copiedSummaryDay, setCopiedSummaryDay] = useState("");
  const [dayCloseConfirmOpen, setDayCloseConfirmOpen] = useState(false);
  const [dayActionBusy, setDayActionBusy] = useState(false);
  const currentDayOrders = useMemo(
    () => groups.find(([day]) => day === currentDay?.date)?.[1].filter((order) => !order.reportRolloverTo) ?? [],
    [groups, currentDay?.date],
  );
  const dayCloseSummary = useMemo(() => {
    const delivered = currentDayOrders.filter((order) => order.status === "delivered").length;
    const carried = currentDayOrders.filter((order) => !["delivered", "fulfilled", "cancelled"].includes(order.status));
    return {
      delivered,
      ready: carried.filter((order) => order.status === "ready").length,
      waiting: carried.filter((order) => order.status !== "ready").length,
    };
  }, [currentDayOrders]);
  const nextDayLabel = useMemo(() => {
    if (!currentDay?.date) return "sonraki güne";
    const next = new Date(`${currentDay.date}T12:00:00`);
    next.setDate(next.getDate() + 1);
    return next.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  }, [currentDay?.date]);
  const runDayToggle = async () => {
    if (dayActionBusy) return;
    setDayActionBusy(true);
    const changed = await onToggleDay();
    setDayActionBusy(false);
    if (changed) setDayCloseConfirmOpen(false);
  };
  useEffect(() => () => {
    if (reportPreview?.url) URL.revokeObjectURL(reportPreview.url);
  }, [reportPreview]);
  const copyDeliveredSummary = async (day: string, deliveredOrders: Order[]) => {
    const customerGroups = new Map<string, { name: string; items: Array<{ item: OrderItem; isLoanReturn: boolean }> }>();
    for (const order of deliveredOrders) {
      const key = order.customerName.trim().toLocaleUpperCase("tr-TR");
      const group = customerGroups.get(key) ?? { name: order.customerName.trim(), items: [] };
      group.items.push(...safeItems(order).map((item) => ({ item, isLoanReturn: Boolean(order.isLoanReturn) })));
      customerGroups.set(key, group);
    }
    const text = [...customerGroups.values()].map((group) => [
      group.name,
      ...group.items.map(({ item, isLoanReturn }) => `${isLoanReturn ? "BORÇ İADESİ · " : ""}${item.productCode || "-"} · ${item.productName} · ${Number((item.preparedQuantity ?? item.quantity) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} mt`),
    ].join("\n")).join("\n\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const field = document.createElement("textarea");
        field.value = text;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        field.remove();
      }
      setCopiedSummaryDay(day);
      window.setTimeout(() => setCopiedSummaryDay((current) => current === day ? "" : current), 2200);
    } catch {
      setReportError("Teslimat metni kopyalanamadı. Tarayıcının pano iznini kontrol edin.");
    }
  };
  const downloadDayReport = async (day: string, orders: Order[]) => {
    setReportBusyDay(day);
    setReportError("");
    const escapeHtml = (value: unknown) => String(value ?? "-")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    try {
      const formatNumber = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
      const formatTime = (value?: string) => value ? new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
      const auditEvent = (order: Order, actions: string[]) => [...(order.audit ?? [])].reverse().find((entry) => actions.includes(entry.action));
      const historyEvent = (order: Order, status: Status) => [...(order.history ?? [])].reverse().find((entry) => entry.status === status);
      const reportStatusLabel = (value: unknown) => ({
        new: "Hazırlama bekliyor",
        preparing: "Hazırlanıyor",
        ready: "Teslimata hazır",
        delivered: "Teslim edildi",
        fulfilled: "Tamamlandı",
        cancelled: "İptal edildi",
      }[String(value)] || String(value ?? "-"));
      const reportAuditAction = (entry: OrderAudit) => {
        if (entry.action === "preparedCorrection") return `Hazır ürün bilgisini düzeltti: ${String(entry.newValue || "")}`;
        if (entry.action !== "status") return "Sipariş bilgilerini düzenledi";
        const from = String(entry.oldValue ?? "");
        const to = String(entry.newValue ?? "");
        if (from === "ready" && to === "preparing") return "Hazırlanmaya geri gönderdi";
        if (from === "preparing" && to === "new") return "Hazırlama beklemeye geri gönderdi";
        if (from === "new" && to === "preparing") return "Hazırlamaya başladı";
        if (from === "preparing" && to === "ready") return "Siparişi hazırladı";
        if (from === "ready" && to === "delivered") return "Siparişi teslim etti";
        return `${reportStatusLabel(from)} durumundan ${reportStatusLabel(to)} durumuna geçirdi`;
      };
      type ReportPage = { kind: "orders" | "carried" | "totals"; orders: Order[] };
      const reportPages: ReportPage[] = [];
      const realOrders = orders.filter((order) => !order.isTest);
      const reportSourceById = new Map<string, Order>();
      for (const [, groupedOrders] of groups) {
        for (const groupedOrder of groupedOrders) {
          if (!reportSourceById.has(groupedOrder.id)) reportSourceById.set(groupedOrder.id, groupedOrder);
        }
      }
      for (const order of realOrders) reportSourceById.set(order.id, order);
      const childParentIds = new Set(realOrders.map((order) => order.parentOrderId).filter(Boolean));
      const mergedSourceIds = new Set(realOrders.flatMap((order) => order.mergedOrderIds ?? []));
      const mergedTargetIds = new Set(realOrders.map((order) => order.id));
      const uniqueOrders = [...new Map(realOrders
        .filter((order) => !(order.status === "fulfilled" && childParentIds.has(order.id)))
        .filter((order) => !mergedSourceIds.has(order.id))
        .filter((order) => !(order.mergedIntoOrderId && mergedTargetIds.has(order.mergedIntoOrderId)))
        .map((order) => [`${order.id}:${order.reportRolloverTo || "current"}`, order] as const)).values()]
        .map((order) => ({
          ...order,
          audit: [...new Map((order.audit ?? []).map((entry) => [
            [entry.action, entry.productId, entry.itemIndex, entry.oldValue, entry.newValue, entry.by, entry.at].join("|"),
            entry,
          ])).values()],
        }));
      const activeOrders = uniqueOrders.filter((order) => order.status === "delivered" && !order.reportRolloverTo);
      const carriedStatusOrder: Record<string, number> = { ready: 0, preparing: 1, new: 2 };
      const carriedOrders = uniqueOrders
        .filter((order) => order.status !== "delivered" || Boolean(order.reportRolloverTo))
        .sort((left, right) => (carriedStatusOrder[left.status] ?? 9) - (carriedStatusOrder[right.status] ?? 9) || String(left.createdAt).localeCompare(String(right.createdAt)));
      const isIncludedInPreparedTotals = (order: Order) => ["ready", "delivered"].includes(order.status);
      const sumOrders = (source: Order[], prepared: boolean) => source.reduce((totals, order) => {
        for (const item of safeItems(order)) {
          const enteredPreparedQuantity = Number(item.preparedQuantity) || 0;
          const quantity = prepared
            ? (isIncludedInPreparedTotals(order)
              ? (enteredPreparedQuantity > 0 ? enteredPreparedQuantity : Number(item.quantity) || 0)
              : 0)
            : Number(item.quantity) || 0;
          const rollCount = Number(prepared
            ? (isIncludedInPreparedTotals(order) ? item.preparedRollCount : 0)
            : item.orderedRollCount) || 0;
          if (!(quantity > 0) && !(rollCount > 0)) continue;
          const hasCutAllowance = item.cutAllowanceApplied === true || Number(item.cutPieceCount) > 0 || Number(item.cutAllowanceMeters) > 0;
          const allowance = Number(item.cutAllowanceMeters) || 0;
          if (!hasCutAllowance) {
            totals.rolls += rollCount;
            totals.fullMeters += quantity;
          } else {
            totals.pieces += Math.max(1, Number(item.cutPieceCount) || 0);
            totals.pieceMeters += quantity;
          }
          totals.allowance += allowance;
          totals.totalMeters += quantity + allowance;
        }
        return totals;
      }, { rolls: 0, pieces: 0, fullMeters: 0, pieceMeters: 0, allowance: 0, totalMeters: 0 });
      const deliveredTotals = sumOrders(activeOrders, true);
      const carriedTotals = sumOrders(carriedOrders, true);
      const overallTotals = {
        rolls: deliveredTotals.rolls + carriedTotals.rolls,
        pieces: deliveredTotals.pieces + carriedTotals.pieces,
        fullMeters: deliveredTotals.fullMeters + carriedTotals.fullMeters,
        pieceMeters: deliveredTotals.pieceMeters + carriedTotals.pieceMeters,
        allowance: deliveredTotals.allowance + carriedTotals.allowance,
        totalMeters: deliveredTotals.totalMeters + carriedTotals.totalMeters,
      };
      const reportSources = (order: Order) => {
        const sources = (order.mergedOrderIds ?? [])
          .map((sourceId) => reportSourceById.get(sourceId))
          .filter((source): source is Order => Boolean(source));
        return sources.length ? sources : [order];
      };
      const uniqueAuditEvents = (sourceOrders: Order[], actions: string[]) => [...new Map(sourceOrders
        .flatMap((source) => source.audit ?? [])
        .filter((entry) => actions.includes(entry.action))
        .sort((left, right) => String(left.at).localeCompare(String(right.at)))
        .map((entry) => [`${entry.action}|${entry.by}|${entry.at}`, entry] as const)).values()];
      const uniqueHistoryEvents = (sourceOrders: Order[], status: Status) => [...new Map(sourceOrders
        .flatMap((source) => source.history ?? [])
        .filter((entry) => entry.status === status)
        .sort((left, right) => String(left.at).localeCompare(String(right.at)))
        .map((entry) => [`${entry.by}|${entry.at}`, entry] as const)).values()];
      const peopleWithTimes = (events: Array<{ by: string; at: string }>, fallbackName = "-", fallbackAt?: string) => events.length
        ? events.map((entry) => `${escapeHtml(entry.by)} · ${formatTime(entry.at)}`).join("<br>")
        : `${escapeHtml(fallbackName)} · ${formatTime(fallbackAt)}`;
      const reportItemChange = (entry: OrderAudit) => entry.action === "preparedCorrection"
        ? `${escapeHtml(entry.by)} · ${formatTime(entry.at)} · Düzeltme: ${escapeHtml(entry.newValue ?? "-")}${entry.reason ? ` · Neden: ${escapeHtml(entry.reason)}` : ""}`
        : `${escapeHtml(entry.by)} · ${formatTime(entry.at)} · ${entry.action === "preparedQuantity" ? "Metre" : entry.action === "preparedRollCount" ? "Rulo" : entry.action === "cutAllowance" ? "Kesim payı" : "Sipariş satırı"}: ${escapeHtml(entry.oldValue ?? "-")} → ${escapeHtml(entry.newValue ?? "-")}${entry.reason ? ` · Neden: ${escapeHtml(entry.reason)}` : ""}`;
      let pageOrders: Order[] = [];
      let pageUnits = 0;
      for (const order of activeOrders) {
        const evidenceUnits = order.deliveryPhoto || (order.attachments ?? []).some((file) => file.kind === "deliveryProof" && !file.deletedAt) ? 10 : 0;
        const noteUnits = order.note || order.deliveryNote || order.approvalForm?.note ? 2 : 0;
        const units = 5 + Math.max(1, safeItems(order).length) + evidenceUnits + noteUnits;
        if (pageOrders.length && pageUnits + units > 18) {
          reportPages.push({ kind: "orders", orders: pageOrders });
          pageOrders = [];
          pageUnits = 0;
        }
        pageOrders.push(order);
        pageUnits += units;
      }
      if (pageOrders.length) reportPages.push({ kind: "orders", orders: pageOrders });
      for (const order of carriedOrders) {
        reportPages.push({ kind: "carried", orders: [order] });
      }
      if (!reportPages.length) reportPages.push({ kind: "orders", orders: [] });
      reportPages.push({ kind: "totals", orders: [] });
      const totalsBlock = (title: string, totals: { rolls: number; pieces: number; fullMeters: number; pieceMeters: number; allowance: number; totalMeters: number }) => `<div style="display:grid;grid-template-columns:1.45fr repeat(6,1fr);align-items:center;gap:1.5mm;margin:3mm 0 2mm;padding:2.2mm 3mm;border:1px solid #dfe5ee;border-left:1.2mm solid #5545ef;background:#f7f8fb;font-size:7pt"><b>${escapeHtml(title)}</b><span><b>${formatNumber(totals.rolls)}</b><small style="display:block;color:#748097">Rulo sayısı</small></span><span><b>${formatNumber(totals.pieces)}</b><small style="display:block;color:#748097">Parça sayısı</small></span><span><b>${formatNumber(totals.fullMeters)} mt</b><small style="display:block;color:#748097">Tam metre</small></span><span><b>${formatNumber(totals.pieceMeters)} mt</b><small style="display:block;color:#748097">Parça metre</small></span><span><b>${formatNumber(totals.allowance)} mt</b><small style="display:block;color:#748097">Pay</small></span><span><b>${formatNumber(totals.totalMeters)} mt</b><small style="display:block;color:#748097">Toplam metre</small></span></div>`;
      const logo = `<svg viewBox="20 12 70 76" aria-hidden="true"><polygon points="30,80 46,20 70,20 54,80" fill="#34d399"/><path d="M62 40 L84 62" stroke="#4f7ddc" stroke-width="10" stroke-linecap="round"/><path d="M84 40 L62 62" stroke="#4f7ddc" stroke-width="10" stroke-linecap="round"/></svg>`;
      const stage = document.createElement("div");
      stage.className = "daily-pdf-stage";
      stage.innerHTML = `<style>
        .daily-pdf-stage .daily-pdf-page{border-top:1.2mm solid #6257e8!important;background:#fff!important}.daily-pdf-stage .pdf-brand{position:relative!important;min-height:10mm!important;border-bottom:.35mm solid #e2e7ee!important;padding-bottom:2.5mm!important}.daily-pdf-stage .pdf-brand:after{content:"";position:absolute;bottom:-.35mm;left:0;width:24mm;height:.65mm;background:#31c997}.daily-pdf-stage .pdf-logo svg{width:9mm!important;height:9mm!important}.daily-pdf-stage .pdf-logo b{color:#17233b!important;font-size:11pt!important}.daily-pdf-stage .pdf-date strong{color:#17233b!important;font-size:8pt!important}.daily-pdf-stage .order-block{border:1px solid #e1e6ed!important;border-left:.7mm solid #6257e8!important;border-radius:1.5mm!important;background:#fff!important;padding:2.2mm!important}.daily-pdf-stage .order-block+.order-block{margin-top:3mm!important}.daily-pdf-stage .order-title{padding-bottom:1.3mm!important;border-bottom:1px solid #edf0f4!important}.daily-pdf-stage .order-title h2{color:#17233b!important;font-size:12pt!important}.daily-pdf-stage .document-kind{margin:1.4mm 0 0;border-left:.8mm solid #31c997;background:#f1fbf7;padding:1.2mm 1.7mm;color:#087653;font-size:7pt;font-weight:800;letter-spacing:0}.daily-pdf-stage .meta span{border-left:.55mm solid #d9d5ff!important;border-radius:0!important;background:#fafbfc!important}.daily-pdf-stage .meta span:nth-child(3n+1){border-left-color:#9ee8cf!important}.daily-pdf-stage .products{border:1px solid #e2e7ee!important}.daily-pdf-stage .products th{background:#f1f4f7!important;color:#39465b!important;border-bottom:1px solid #d9e0e8!important}.daily-pdf-stage .products tbody tr:nth-child(even){background:#fbfcfd!important}.daily-pdf-stage .products td{border-bottom:1px solid #e8ecf1!important}.daily-pdf-stage .detail{border:1px solid #e4e8ee!important;border-radius:1mm!important;background:#fafbfc!important}.daily-pdf-stage .proofs{border:1px solid #e4e8ee!important;border-radius:1.5mm!important}.daily-pdf-stage .edits{border-radius:1mm!important}.daily-pdf-stage .pdf-footer b{color:#5545ef!important}
        .order-title h2 small{font-size:7pt!important}.status{border:1px solid #e1e6ed!important;background:#fff!important;font-size:7pt!important}.status.ok{border-color:#bdebd9!important;color:#087653!important}.meta span{font-size:6.7pt!important;padding:1.3mm 1.5mm!important}.meta b{font-size:7.4pt!important}.products{font-size:7pt!important}.products th{padding:1.35mm 1.1mm!important}.products td{padding:1.55mm 1.1mm!important}.products b{font-size:7.5pt!important}.products small{font-size:6.5pt!important}.products .allowance{margin-top:.7mm!important;color:#5a50bd!important;font-weight:700}.detail{font-size:6.6pt!important;padding:1.7mm!important}.detail b{font-size:7.2pt!important}.edits{margin-top:1.5mm!important;padding:1.6mm!important;border-left:.7mm solid #8b7cf6!important;background:#faf9ff!important;font-size:6.7pt!important;line-height:1.5!important}.edits b{display:block!important;margin-bottom:.7mm!important;font-size:7.4pt!important}.carry-row{grid-template-columns:2fr .8fr 1fr 1fr!important;font-size:7pt!important}.carry-row b{font-size:7.7pt!important}.carry-row small{font-size:6.2pt!important;line-height:1.3!important}.proofs{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;align-items:start!important;gap:2mm!important;margin-top:2mm!important;padding:2mm!important;background:#fafbfc!important}.proofs img{box-sizing:border-box!important;display:block!important;width:auto!important;max-width:100%!important;height:auto!important;max-height:65mm!important;margin:0 auto!important;border-radius:1mm!important;object-fit:contain!important;background:#fff!important}.proofs:has(img:only-child){grid-template-columns:1fr!important}.proofs img:only-child{max-width:100%!important;max-height:72mm!important}.report-totals{margin-top:8mm}.report-totals h1{margin:0 0 2mm;color:#17233b;font-size:15pt}.report-totals>p{margin:0 0 6mm;color:#748097;font-size:7pt}.daily-pdf-page.is-compact .proofs img{max-height:45mm!important}.daily-pdf-page.is-compact .proofs img:only-child{max-height:52mm!important}.daily-pdf-page.is-compact .meta span{padding:1mm 1.2mm!important}.daily-pdf-page.is-compact .products td{padding:1.2mm 1mm!important}
        .daily-pdf-stage{position:absolute;z-index:2147483647;top:0;left:0;width:210mm;background:#fff;color:#17233b;font-family:Aptos,"Segoe UI",Arial,sans-serif}.daily-pdf-page{position:relative;box-sizing:border-box;width:210mm;height:297mm;padding:7mm 8mm 15mm;background:#fff;overflow:hidden;page-break-after:always}.pdf-brand{display:flex;align-items:center;justify-content:space-between;padding-bottom:2.3mm;border-bottom:.6mm solid #5545ef}.pdf-logo{display:flex;align-items:center;gap:2mm}.pdf-logo svg{width:9mm;height:9mm}.pdf-logo b{font-size:11pt}.pdf-logo small,.pdf-date span{display:block;color:#748097;font-size:5.7pt}.pdf-date{text-align:right}.pdf-date strong{font-size:7.5pt}.order-block{margin-top:3mm;border-top:.7mm solid #dfe5ee;padding-top:2mm}.order-block:first-of-type{border-top:0}.order-title{display:flex;align-items:center;justify-content:space-between;gap:3mm}.order-title h2{margin:0;font-size:11pt}.order-title h2 small{margin-left:2mm;color:#66738a;font-size:6pt;font-weight:600}.merged-orders{display:flex;align-items:center;flex-wrap:wrap;gap:1.2mm;margin-top:1.5mm;padding:1.5mm 2mm;border-left:.8mm solid #5545ef;background:#f4f2ff;color:#4d43ad;font-size:6.2pt}.merged-orders span{padding:.5mm 1mm;border:1px solid #d9d4ff;background:#fff;font-weight:700}.status{border-radius:1.5mm;background:#fff3d8;padding:1mm 1.8mm;color:#946000;font-size:5.7pt;font-weight:800}.status.ok{background:#e7f9f1;color:#087c52}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:1mm;margin:1.5mm 0}.meta span{border-left:.7mm solid #d9d4ff;background:#f7f8fb;padding:1mm 1.3mm;font-size:5.4pt;line-height:1.35}.meta b{display:block;font-size:6.2pt}.products{width:100%;border-collapse:collapse;table-layout:fixed;font-size:5.6pt}.products th{background:#eef2f7;color:#59667b;padding:1mm;text-align:left}.products td{padding:1.2mm 1mm;border-bottom:1px solid #e5eaf0;vertical-align:top}.products .num{text-align:right}.products b{font-size:6.1pt}.products small{display:block;margin-top:.35mm;color:#718096;line-height:1.25}.changes{color:#5545c9!important}.positive{color:#087c52}.negative{color:#b4542d}.detail-row{display:grid;grid-template-columns:1fr 1fr;gap:1.3mm;margin-top:1.3mm}.detail{background:#f5f7fa;padding:1.2mm 1.5mm;font-size:5.4pt;line-height:1.35;white-space:pre-wrap}.detail b{font-size:5.8pt}.proofs{display:flex;gap:1mm;margin-top:1mm}.proofs img{width:24mm;height:16mm;border:1px solid #dfe5ed;border-radius:1mm;object-fit:cover}.edits{margin-top:1mm;color:#5e6980;font-size:5.2pt}.carry-title{margin:5mm 0 2mm;font-size:14pt}.carry-row{display:grid;grid-template-columns:1.2fr .8fr 1fr 1fr;gap:2mm;border-bottom:1px solid #e4e9f0;padding:2.3mm 1mm;font-size:6.5pt}.carry-row b{display:block;font-size:7.2pt}.carry-row small{display:block;color:#748097;margin-top:.5mm}.pdf-footer{position:absolute;right:8mm;bottom:3.5mm;left:8mm;display:flex;justify-content:space-between;border-top:1px solid #e2e7ef;padding-top:1.5mm;color:#7b8799;font-size:5.5pt}.pdf-footer b{color:#28344a}
      </style>${reportPages.map((page, pageIndex) => `<section class="daily-pdf-page"><header class="pdf-brand"><div class="pdf-logo">${logo}<span><b>AriX Panel</b><small>Gün sonu operasyon raporu</small></span></div><div class="pdf-date"><strong>${escapeHtml(new Date(`${day}T12:00:00`).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" }))}</strong><span>${escapeHtml(new Date().toLocaleString("tr-TR"))}</span></div></header>${page.kind === "carried" ? `<h1 class="carry-title">Devredenler</h1>` : ""}${page.orders.map((order) => {
        const sourceOrders = reportSources(order);
        const activityOrders = sourceOrders.some((source) => source.id === order.id) ? sourceOrders : [order, ...sourceOrders];
        const displayApproval = order.approvalForm ?? sourceOrders.find((source) => source.approvalForm)?.approvalForm;
        const preparing = historyEvent(order, "preparing");
        const ready = historyEvent(order, "ready");
        const formApprovedEvents = uniqueAuditEvents(sourceOrders, ["approvalFormApproved"]);
        const formArchivedEvents = uniqueAuditEvents(sourceOrders, ["approvalFormArchived", "approvalFormDraftArchived"]);
        const formApproved = formApprovedEvents[formApprovedEvents.length - 1] ?? auditEvent(order, ["approvalFormApproved"]);
        const formArchived = formArchivedEvents[formArchivedEvents.length - 1] ?? auditEvent(order, ["approvalFormArchived", "approvalFormDraftArchived"]);
        const creatorEvents = [...new Map(sourceOrders.map((source) => [`${source.createdBy}|${source.createdAt}`, { by: source.createdBy, at: source.createdAt }] as const)).values()];
        const preparingEvents = uniqueHistoryEvents(sourceOrders, "preparing");
        const formEditorEvents = uniqueAuditEvents(sourceOrders, ["approvalFormSaved"]);
        const legacyFormEditors = [...new Map(sourceOrders.filter((source) => source.approvalForm).map((source) => {
          const by = source.approvalForm?.preparedBy || source.createdBy || source.approvalForm?.updatedBy || "-";
          const at = source.approvalForm?.preparedAt || source.createdAt || source.approvalForm?.updatedAt || "";
          return [`${by}|${at}`, { by, at }] as const;
        })).values()];
        const orderEdits = activityOrders.flatMap((source) => source.audit ?? []).filter((entry) => ["customerNameEdited", "orderNoteEdited", "orderEdited", "preparedCorrection", "status"].includes(entry.action)).sort((left, right) => String(left.at).localeCompare(String(right.at)));
        const photos = [...new Set([order.deliveryPhoto, ...(order.attachments ?? []).filter((file) => file.kind === "deliveryProof" && !file.deletedAt && file.mimeType.startsWith("image/")).map((file) => file.url)].filter(Boolean))].slice(0, 2) as string[];
        const documents = (order.attachments ?? []).filter((file) => !file.deletedAt).map((file) => `${file.name} · ${file.uploadedBy} · ${formatTime(file.uploadedAt)}`).join("\n");
        const despatchLabel = order.withoutDespatch ? "İrsaliyesiz teslim" : (order.despatchNumber || "İrsaliye yok");
        const formNumbers = [...new Set(sourceOrders.map((source) => source.approvalForm?.number).filter(Boolean))] as string[];
        const representatives = [...new Set(sourceOrders.map((source) => source.approvalForm?.salesRepresentative).filter(Boolean))] as string[];
        const contacts = [...new Set(sourceOrders.map((source) => source.approvalForm?.customerContact).filter(Boolean))] as string[];
        const mergedOrdersHtml = order.mergedOrderNumbers?.length
          ? `<div class="merged-orders"><b>Birleşen siparişler:</b> ${order.mergedOrderNumbers.map((number) => `<span>${escapeHtml(number)}</span>`).join("")}</div>`
          : "";
        const formEditorSummary = formEditorEvents.length
          ? peopleWithTimes(formEditorEvents)
          : legacyFormEditors.length
            ? peopleWithTimes(legacyFormEditors)
            : "Form hazırlanmadı";
        const deliveryNoteLabel = order.deliveryNote || (order.status === "delivered" ? "Teslim notu girilmedi" : "Henüz teslim edilmedi");
        const sourceItemContext = (itemIndex: number) => {
          if (!order.mergedOrderIds?.length) return { orders: [order], itemIndex };
          let localIndex = itemIndex;
          for (const source of sourceOrders) {
            const sourceLength = safeItems(source).length;
            if (localIndex < sourceLength) return { orders: [source, order], itemIndex: localIndex };
            localIndex -= sourceLength;
          }
          return { orders: [order], itemIndex };
        };
        const productRows = safeItems(order).map((item, itemIndex) => {
          const original = (order.originalItems ?? [])[itemIndex]
            ?? (order.originalItems ?? []).find((entry) => Number(entry.productId) === Number(item.productId));
          const requested = Number(original?.quantity ?? item.quantity) || 0;
          const requestedRolls = Number(original?.orderedRollCount ?? item.orderedRollCount) || 0;
          const prepared = Number(item.preparedQuantity ?? (["ready", "delivered"].includes(order.status) ? item.quantity : 0)) || 0;
          const preparedRolls = Number(item.preparedRollCount) || 0;
          const rollBased = !(requested > 0) && requestedRolls > 0;
          const difference = rollBased ? preparedRolls - requestedRolls : prepared - requested;
          const differenceUnit = rollBased ? "rulo" : "mt";
          const itemContext = sourceItemContext(itemIndex);
          const sourceReady = itemContext.orders.flatMap((source) => source.history ?? []).find((entry) => entry.status === "ready");
          const hasPreparedWork = prepared > 0 || preparedRolls > 0;
          const originalPreparedBy = hasPreparedWork
            ? item.preparedBy || itemContext.orders[0]?.preparedBy || sourceReady?.by || ready?.by || order.preparedBy || "-"
            : "-";
          const originalPreparedAt = hasPreparedWork
            ? item.preparedAt || itemContext.orders[0]?.readyAt || sourceReady?.at || ready?.at
            : undefined;
          const changes = itemContext.orders.flatMap((source) => source.audit ?? []).filter((entry) => {
            const belongsToItem = Number(entry.itemIndex) === itemContext.itemIndex
              || (entry.itemIndex === undefined && Number(entry.productId) === Number(item.productId));
            const correctionText = String(entry.newValue || "");
            const isPreparedCorrection = entry.action === "preparedCorrection"
              && (correctionText.includes(item.productName) || (!!item.productCode && correctionText.includes(item.productCode)));
            return (belongsToItem && ["preparedQuantity", "preparedRollCount", "cutAllowance", "orderItemEdited"].includes(entry.action))
              || isPreparedCorrection;
          });
          return `<tr><td><b>${escapeHtml(item.productCode || "-")}</b></td><td><b>${escapeHtml(item.productName)}</b><small>${escapeHtml(item.lineNote || "")}</small></td><td class="num"><b>${rollBased ? `${formatNumber(requestedRolls)} rulo` : `${formatNumber(requested)} mt`}</b>${!rollBased && requestedRolls > 0 ? `<small>${formatNumber(requestedRolls)} rulo</small>` : ""}</td><td class="num"><b>${formatNumber(prepared)} mt</b><small>${item.cutAllowanceApplied || Number(item.cutPieceCount) > 0 ? `${formatNumber(Number(item.cutPieceCount) || 1)} parça` : `${formatNumber(preparedRolls)} rulo`}</small><small class="allowance">Pay: ${formatNumber(Number(item.cutAllowanceMeters) || 0)} mt</small></td><td class="num"><b class="${difference >= 0 ? "positive" : "negative"}">${difference > 0 ? "+" : ""}${formatNumber(difference)} ${differenceUnit}</b></td><td><b>${escapeHtml(originalPreparedBy)} · ${formatTime(originalPreparedAt)}</b>${changes.map((entry) => `<small class="changes">${reportItemChange(entry)}</small>`).join("")}</td></tr>`;
        }).join("") || `<tr><td colspan="6">Ürün bulunmuyor.</td></tr>`;
        return `<article class="order-block"><div class="order-title"><h2>${escapeHtml(order.customerName)}<small>${escapeHtml(order.number)} · ${escapeHtml(formNumbers.join(" · ") || "Form yok")} · ${escapeHtml(despatchLabel)}</small></h2><span class="status ${order.status === "delivered" ? "ok" : ""}">${escapeHtml(reportStatusLabel(order.status))}${page.kind === "carried" && !isIncludedInPreparedTotals(order) ? " · Hazırlanmadı, toplama dahil değil" : ""}</span></div>${order.isLoanReturn ? `<div class="document-kind">İŞLEM TÜRÜ · BORÇ İADESİ</div>` : ""}${mergedOrdersHtml}<div class="meta"><span><b>Sipariş verenler</b>${peopleWithTimes(creatorEvents)}</span><span><b>Müşteri temsilcisi: ${escapeHtml(representatives.join(", ") || "-")}</b>${escapeHtml(contacts.join(", ") || order.customerName)}</span><span><b>Hazırlamaya başlayanlar</b>${peopleWithTimes(preparingEvents, preparing?.by || order.preparedBy || "-", preparing?.at)}</span><span><b>Sipariş formunu hazırlayan / düzenleyenler</b>${formEditorSummary}</span><span><b>İrsaliye yapan: ${escapeHtml(order.despatchReadyBy || "-")}</b>${formatTime(order.despatchReadyAt)}</span><span><b>Fatura yapan: Meliha Keskin</b>${formatTime(order.despatchReadyAt)}</span><span><b>Teslim eden: ${escapeHtml(order.deliveredBy || "-")}</b>${formatTime(order.deliveredAt)}</span></div><table class="products"><colgroup><col style="width:9%"><col style="width:24%"><col style="width:11%"><col style="width:11%"><col style="width:9%"><col style="width:36%"></colgroup><thead><tr><th>Kod</th><th>Ürün</th><th class="num">Sipariş</th><th class="num">Hazırlanan</th><th class="num">Fark</th><th>Hazırlayanlar ve değişiklikler</th></tr></thead><tbody>${productRows}</tbody></table>${orderEdits.length ? `<div class="edits"><b>Düzenleme geçmişi:</b> ${orderEdits.map((entry) => `${escapeHtml(entry.by)} · ${formatTime(entry.at)} · ${escapeHtml(reportAuditAction(entry))}${entry.reason ? ` · Neden: ${escapeHtml(entry.reason)}` : ""}`).join("<br>")}</div>` : ""}<div class="detail-row"><div class="detail"><b>NOTLAR VE KOŞULLAR</b>\n${escapeHtml(order.note || "Sipariş notu yok.")}\nÖdeme: ${escapeHtml(displayApproval?.paymentTerms || "Belirtilmedi")} · Teslimat: ${escapeHtml(displayApproval?.deliveryTerms || "Belirtilmedi")}\nEk not: ${escapeHtml(displayApproval?.note || "Yok")}</div><div class="detail"><b>FORM / İRSALİYE / TESLİM</b>\nOnay: ${escapeHtml(formApproved?.by || displayApproval?.approvedBy || "-")} · ${formatTime(formApproved?.at || displayApproval?.approvedAt)}\nArşiv: ${escapeHtml(formArchived?.by || displayApproval?.archive?.archivedBy || "-")} · ${formatTime(formArchived?.at || displayApproval?.archive?.archivedAt)}\nTeslim notu: ${escapeHtml(deliveryNoteLabel)}\n${escapeHtml(documents || "Ek belge yok")}</div></div>${photos.length ? `<div class="proofs">${photos.map((url) => `<img src="${escapeHtml(url)}" alt="Teslim kanıtı">`).join("")}</div>` : ""}</article>`;
      }).join("")}${page.kind === "totals" ? `<section class="report-totals"><h1>Toplam Rapor</h1><p>Günün teslim ve devreden miktar özeti</p>${totalsBlock("Teslim edilenler toplamı", deliveredTotals)}${carriedOrders.length ? totalsBlock("Devredenler toplamı", carriedTotals) : ""}${totalsBlock(carriedOrders.length ? "Genel toplam · teslim edilen + devreden" : "Teslim edilenler · genel toplam", overallTotals)}</section>` : ""}<footer class="pdf-footer"><span>Powered by <b>AriX</b> · www.arix.az</span><span>Sayfa ${pageIndex + 1}/${reportPages.length}</span></footer></section>`).join("")}`;
      document.body.appendChild(stage);
      await document.fonts.ready;
      await Promise.all([...stage.querySelectorAll<HTMLImageElement>("img")].map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      for (const page of stage.querySelectorAll<HTMLElement>(".daily-pdf-page")) {
        const footer = page.querySelector<HTMLElement>(".pdf-footer");
        if (!footer) continue;
        const footerTop = footer.getBoundingClientRect().top;
        const contentBottom = [...page.children]
          .filter((element) => element !== footer)
          .reduce((bottom, element) => Math.max(bottom, element.getBoundingClientRect().bottom), page.getBoundingClientRect().top);
        if (contentBottom > footerTop - 12) page.classList.add("is-compact");
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const filename = `AriX-Gun-Raporu-${day}.pdf`;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      const pageElements = [...stage.querySelectorAll<HTMLElement>(".daily-pdf-page")];
      for (let pageIndex = 0; pageIndex < pageElements.length; pageIndex += 1) {
        const canvas = await html2canvas(pageElements[pageIndex], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("PDF sayfası oluşturulamadı.");
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let inkSamples = 0;
        const sampleStep = Math.max(4, Math.floor((canvas.width * canvas.height) / 80_000));
        for (let pixel = 0; pixel < pixels.length; pixel += 4 * sampleStep) {
          if (pixels[pixel] < 245 || pixels[pixel + 1] < 245 || pixels[pixel + 2] < 245) inkSamples += 1;
        }
        if (inkSamples < 20) throw new Error(`Raporun ${pageIndex + 1}. sayfası boş oluştu; PDF açılmadı.`);
        if (pageIndex > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      }
      const blob = pdf.output("blob");
      setReportPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { url: URL.createObjectURL(blob), filename };
      });
      stage.remove();
    } catch (cause) {
      setReportError(cause instanceof Error ? cause.message : "PDF raporu oluşturulamadı.");
    } finally {
      document.querySelectorAll(".daily-pdf-stage").forEach((element) => element.remove());
      setReportBusyDay("");
    }
  };
  return (
    <>
    <section className="daily-archive">
      <div className={`day-control ${currentDay?.closed ? "closed" : "open"}`}>
        <div>
          <span>{currentDay?.closed ? ui.dayClosed : ui.dayOpen}</span>
          {currentDay?.date && <b>{new Date(`${currentDay.date}T12:00:00`).toLocaleDateString(language, { day: "2-digit", month: "long", year: "numeric" })}</b>}
          {currentDay?.closed && currentDay.automatic && <strong className="automatic-day-close">Sistem tarafından otomatik kapatıldı</strong>}
          {currentDay?.closed && !currentDay.automatic && currentDay.closedBy && <small>{currentDay.closedBy} tarafından kapatıldı</small>}
          {currentDay?.closedAt && <small>{new Date(currentDay.closedAt).toLocaleString("tr-TR")}</small>}
          {currentDay?.closed && Number(currentDay.carriedCount) > 0 && <small>{currentDay.carriedCount} sipariş {currentDay.carriedToDate ? new Date(`${currentDay.carriedToDate}T12:00:00`).toLocaleDateString("tr-TR") : "sonraki iş gününe"} devredildi</small>}
        </div>
        {isOwner && (
          <button
            className={currentDay?.closed ? "primary" : "secondary"}
            disabled={dayActionBusy}
            onClick={() => currentDay?.closed ? void runDayToggle() : setDayCloseConfirmOpen(true)}
          >
            {dayActionBusy ? "İşleniyor…" : currentDay?.closed ? ui.openDay : ui.closeDay}
          </button>
        )}
      </div>
      {!groups.length && <div className="daily-empty">{ui.dailyEmpty}</div>}
      {reportError && <p className="form-error">{reportError}</p>}
      {groups.map(([day, orders]) => {
        const carriedOrders = orders.filter((order) => Boolean(order.reportRolloverTo));
        const deliveredOrders = orders.filter((order) => order.status === "delivered" && !order.reportRolloverTo);
        const pendingOrders = orders.filter((order) => order.status !== "delivered" && !order.reportRolloverTo);
        const renderOrder = (order: Order) => (
          <button
            className={`day-order ${order.reportRolloverTo ? "is-carried" : order.status === "delivered" ? "is-delivered" : "is-pending"}`}
            key={order.id}
            onClick={() => onOpen(order)}
          >
            <div className="day-order-head">
              <div>
                <strong>{order.customerName}</strong>
                <span>{order.number}</span>
              </div>
              <div className="day-order-state">
                <span className={`day-status status-${order.status}`}>
                  {statusMeta[order.status]?.label || order.status}
                </span>
                <time>
                  {new Date(
                    order.deliveredAt || order.updatedAt || order.createdAt,
                  ).toLocaleTimeString(language, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            </div>
            {order.reportRolloverTo && (
              <div className="day-document-badge">Sonraki güne devredildi: <b>{new Date(`${order.reportRolloverTo}T12:00:00`).toLocaleDateString(language)}</b></div>
            )}
            {order.parentOrderNumber && (
              <div className="parent-order-link">
                {ui.originalOrder}: <b>{order.parentOrderNumber}</b>
              </div>
            )}
            {order.isLoanReturn && (
              <div className="day-document-badge loan-return"><b>Borç iadesi</b></div>
            )}
            {(order.attachments || []).some((attachment) => !attachment.deletedAt) && (
              <div className="day-document-badge">
                {ui.documents}: <b>{(order.attachments || []).filter((attachment) => !attachment.deletedAt).length}</b>
              </div>
            )}
            <div className="day-product-head">
              <span>{ui.code}</span><span>{ui.productName}</span><span>mt</span>
              <span>{ui.rollCount}</span><span>{ui.preparedBy}</span>
            </div>
            <ul className="day-product-list">
              {safeItems(order).map((item, index) => (
                <li key={`${item.productId}-${index}`}>
                  <span data-label={ui.code}>{item.productCode || "-"}</span>
                  <span data-label={ui.productName}>{item.productName}{item.lineNote ? ` · ${item.lineNote}` : ""}</span>
                  <b data-label="mt">{item.preparedQuantity || item.quantity}</b>
                  <b data-label={ui.rollCount}>{item.preparedRollCount || "-"}</b>
                  <span data-label={ui.preparedBy}>{itemHasPreparedAmount(order, item) ? item.preparedBy || order.preparedBy || "-" : "-"}</span>
                </li>
              ))}
            </ul>
            <footer>
              <span>{ui.createdBy}: <b>{order.createdBy}</b></span>
              {order.status === "delivered" ? (
                <span>{ui.deliveredBy}: <b>{order.deliveredBy || "-"}</b> · {order.deliveredAt ? new Date(order.deliveredAt).toLocaleString(language) : "-"}</span>
              ) : (
                <span>{ui.preparedBy}: <b>{preparedByForDisplay(order)}</b></span>
              )}
            </footer>
            {(order.deliveryNote || order.deliveryPhoto) && (
              <div className="delivery-proof">
                <div><b>{ui.deliveryProof}</b><span>{order.deliveryNote || "-"}</span></div>
                {order.deliveryPhoto && <img src={order.deliveryPhoto} alt={ui.deliveryPhoto} />}
              </div>
            )}
          </button>
        );
        return <section className="day-group" id={`order-day-${day}`} key={day}>
          <header>
            <div className="day-group-title">
              <h2>{new Date(`${day}T12:00:00`).toLocaleDateString(language, {
                day: "2-digit",
                month: "long",
                year: "numeric",
                weekday: "long",
              })}</h2>
              <div className="day-summary-chips">
                <span><b>{orders.length}</b> toplam</span>
                <span className="pending"><b>{pendingOrders.length}</b> hazır değil</span>
                <span className="delivered"><b>{deliveredOrders.length}</b> teslim edildi</span>
                {carriedOrders.length > 0 && <span><b>{carriedOrders.length}</b> sonraki güne devreden</span>}
              </div>
            </div>
            <button type="button" className="day-report-download" disabled={reportBusyDay === day} onClick={() => void downloadDayReport(day, orders)}>
              <FileText aria-hidden="true" />
              <span>{reportBusyDay === day ? "PDF hazırlanıyor…" : "PDF raporunu görüntüle"}</span>
            </button>
          </header>
          {pendingOrders.length > 0 && <section className="day-order-section pending">
            <header><span className="day-section-dot" /><div><h3>Hazır olmayanlar</h3><small>Hazırlama veya teslim süreci devam eden siparişler</small></div><b>{pendingOrders.length}</b></header>
            <div className="day-orders">{pendingOrders.map(renderOrder)}</div>
          </section>}
          {carriedOrders.length > 0 && <section className="day-order-section carried">
            <header><span className="day-section-dot" /><div><h3>Sonraki güne devredenler</h3><small>Gün kapanışında teslim edilmediği için aktarılan siparişler</small></div><b>{carriedOrders.length}</b></header>
            <div className="day-orders">{carriedOrders.map(renderOrder)}</div>
          </section>}
          {deliveredOrders.length > 0 && <section className="day-order-section delivered">
            <header><span className="day-section-dot" /><div><h3>Teslim edilenler</h3><small>Teslim işlemi tamamlanmış siparişler</small></div><button type="button" className="copy-delivered-summary" onClick={() => void copyDeliveredSummary(day, deliveredOrders)}><ClipboardCopy aria-hidden="true" /><span>{copiedSummaryDay === day ? "Kopyalandı" : "Grup metnini kopyala"}</span></button><b>{deliveredOrders.length}</b></header>
            <div className="day-orders">{deliveredOrders.map(renderOrder)}</div>
          </section>}
        </section>;
      })}
      {reportPreview && (
        <DailyReportPreview
          url={reportPreview.url}
          filename={reportPreview.filename}
          onClose={() => setReportPreview(null)}
        />
      )}
    </section>
    {dayCloseConfirmOpen && currentDay && (
      <Modal
        title="İş gününü kapat"
        subtitle={`${new Date(`${currentDay.date}T12:00:00`).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })} günü için kapanışı onaylayın.`}
        onClose={() => !dayActionBusy && setDayCloseConfirmOpen(false)}
        className="day-close-confirm"
      >
        <div className="day-close-confirm-summary" aria-label="Gün kapanış özeti">
          <div><Check aria-hidden="true" /><span>Teslim edilen</span><b>{dayCloseSummary.delivered}</b></div>
          <div><Truck aria-hidden="true" /><span>Hazır devreden</span><b>{dayCloseSummary.ready}</b></div>
          <div><CalendarDays aria-hidden="true" /><span>Hazır olmayan</span><b>{dayCloseSummary.waiting}</b></div>
        </div>
        <div className="day-close-confirm-note">
          <Bell aria-hidden="true" />
          <p><b>Bildirimler gönderilecek.</b> Gün özeti yöneticilere, görev özeti ilgili çalışanlara iletilecek. Hazır ve hazırlanmamış siparişler {nextDayLabel} tarihine devredilecek.</p>
        </div>
        <div className="modal-actions day-close-confirm-actions">
          <button type="button" className="secondary" disabled={dayActionBusy} onClick={() => setDayCloseConfirmOpen(false)}>Vazgeç</button>
          <button type="button" className="primary" disabled={dayActionBusy} onClick={() => void runDayToggle()}>
            {dayActionBusy ? "Kapatılıyor…" : "Günü kapat ve bildirimleri gönder"}
          </button>
        </div>
      </Modal>
    )}
    </>
  );
}

function DailyReportPreview({ url, filename, onClose }: { url: string; filename: string; onClose: () => void }) {
  useBrowserBackLayer(true, onClose);
  const printReport = () => {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.opacity = "0";
    frame.src = url;
    frame.onload = () => window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 30_000);
    }, 500);
    document.body.appendChild(frame);
  };
  return (
    <section className="approval-pdf-viewer" role="dialog" aria-modal="true" aria-label="Günlük rapor önizleme">
      <header>
        <button type="button" onClick={onClose}><ArrowLeft aria-hidden="true" /><span>Geri</span></button>
        <div><b>Günlük operasyon raporu</b><small>{filename}</small></div>
        <nav>
          <button type="button" onClick={printReport}><Printer aria-hidden="true" /><span>Yazdır</span></button>
          <a className="daily-report-download-action" href={url} download={filename}><Download aria-hidden="true" /><span>İndir</span></a>
        </nav>
      </header>
      <main className="daily-report-preview-frame"><iframe src={url} title={filename} /></main>
    </section>
  );
}

function CreateOrder({
  products,
  session,
  customers,
  draftKey,
  onClose,
  onCreated,
  language,
}: {
  products: Product[];
  session: Session;
  customers: Customer[];
  draftKey: string;
  onClose: () => void;
  onCreated: () => void;
  language: Language;
}) {
  const ui = copy[language];
  const savedDraft = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(draftKey) || "{}") as {
        customerName?: string;
        text?: string;
        note?: string;
        matches?: Match[];
        isTest?: boolean;
        isLoanReturn?: boolean;
      };
    } catch {
      return {};
    }
  }, [draftKey]);
  const [customerName, setCustomerName] = useState(
    savedDraft.customerName ?? "",
  );
  const [text, setText] = useState(savedDraft.text ?? "");
  const [note, setNote] = useState(savedDraft.note ?? "");
  const [isTest, setIsTest] = useState(savedDraft.isTest === true);
  const [isLoanReturn, setIsLoanReturn] = useState(savedDraft.isLoanReturn === true);
  const [matches, setMatches] = useState<Match[]>(
    Array.isArray(savedDraft.matches) ? savedDraft.matches.map(withoutCutAllowance) : [],
  );
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [error, setError] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [availableProducts, setAvailableProducts] = useState(products);
  const [newProductIndex, setNewProductIndex] = useState<number | null>(null);
  const [newProductCode, setNewProductCode] = useState("");
  const [newProductName, setNewProductName] = useState("");

  useEffect(() => setAvailableProducts(products), [products]);

  useEffect(() => {
    if (!customerName && !text && !note && matches.length === 0) {
      localStorage.removeItem(draftKey);
      return;
    }
    localStorage.setItem(
      draftKey,
      JSON.stringify({ customerName, text, note, matches, isTest, isLoanReturn }),
    );
  }, [customerName, text, note, matches, isTest, isLoanReturn, draftKey]);

  const customerSuggestions = useMemo(() => {
    if (!customerName.trim()) return customers.slice(0, 6);
    const q = customerName.toLowerCase();
    return customers
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [customerName, customers]);

  const readOrderImage = async (file?: File) => {
    if (!file) return;
    if (!isImageFile(file)) {
      setError("Sipariş metni için JPG, PNG veya başka bir resim dosyası seçin.");
      return;
    }
    setOcrBusy(true);
    setOcrProgress(0);
    setError("");
    try {
      const { recognize } = await import("tesseract.js");
      const result = await recognize(file, "tur+eng", {
        logger: (message) => {
          if (message.status === "recognizing text") {
            setOcrProgress(Math.round(Number(message.progress || 0) * 100));
          }
        },
      });
      const extracted = String(result.data.text || "")
        .replace(/\r/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
      if (!extracted) throw new Error("Resimde okunabilir sipariş metni bulunamadı.");
      setText((current) => [current.trim(), extracted].filter(Boolean).join("\n"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resim okunamadı.");
    } finally {
      setOcrBusy(false);
      setOcrProgress(0);
    }
  };

  const analyze = async () => {
    setBusy(true);
    setError("");
    try {
      setMatches(
        (await api<Match[]>("/api/orders/match", {
          method: "POST",
          body: JSON.stringify({ text }),
        })).map(withoutCutAllowance),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Uyğunlaşdırma alınmadı.",
      );
    } finally {
      setBusy(false);
    }
  };

  const update = (index: number, patch: Partial<Match>) =>
    setMatches((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch, needsReview: false } : item,
      ),
    );

  const openNewProduct = (item: Match, index: number) => {
    setNewProductIndex(index);
    setNewProductCode(item.productCode || "");
    setNewProductName(item.productName || item.source.replace(/^\s*\d+(?:[.,]\d+)?\s*(?:mt|m|metre|meter|rulo|rul|rl|vr|r|top|bobin)?\s*/i, "").trim());
  };

  const createMatchedProduct = async (index: number) => {
    if (!newProductName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const product = await api<Product>("/api/orders/catalog", {
        method: "POST",
        body: JSON.stringify({ name: newProductName.trim(), code: newProductCode.trim(), unit: "mt", fromOrderMatch: true }),
      });
      const hydrated = { ...product, physicalQuantity: 0, reservedQuantity: 0, availableQuantity: 0, rollCount: 0 };
      setAvailableProducts((current) => [...current, hydrated]);
      update(index, {
        productId: product.id,
        productName: product.name,
        productCode: product.code || product.sku || "",
      });
      setNewProductIndex(null);
      setNewProductCode("");
      setNewProductName("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Yeni ürün oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const clearDraft = () => {
    localStorage.removeItem(draftKey);
    setCustomerName("");
    setText("");
    setNote("");
    setIsTest(false);
    setIsLoanReturn(false);
    setMatches([]);
    setError("");
    setShowCustomerDropdown(false);
    setNewProductIndex(null);
    setNewProductCode("");
    setNewProductName("");
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({ customerName, note, text, items: matches.map(withoutCutAllowance), isTest, isLoanReturn }),
      });
      localStorage.removeItem(draftKey);
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sifariş saxlanmadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`${ui.new} ${ui.title.toLocaleLowerCase(language)}`}
      subtitle={ui.preparingHint}
      onClose={onClose}
      wide
    >
      {(customerName || text || note || matches.length > 0) && (
        <div className="create-order-draft-bar">
          <span>Kaydedilmiş taslak açık</span>
          <button type="button" onClick={clearDraft} disabled={busy}>
            <Trash2 aria-hidden="true" />
            Taslağı sil ve yeni başla
          </button>
        </div>
      )}
      <div className="form-grid">
        <label className="autocomplete-wrap">
          <span>{ui.customer}</span>
          <input
            autoFocus
            value={customerName}
            onFocus={() => setShowCustomerDropdown(true)}
            onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setShowCustomerDropdown(true);
            }}
            placeholder="Abanoz Mobilya"
          />
          {showCustomerDropdown && customerSuggestions.length > 0 && (
            <div className="autocomplete-dropdown">
              {customerSuggestions.map((c) => (
                <div
                  key={c.id}
                  className="autocomplete-item"
                  onMouseDown={() => {
                    setCustomerName(c.name);
                    setShowCustomerDropdown(false);
                  }}
                >
                  <b>{c.name}</b>
                  {c.phone && (
                    <small style={{ color: "#888" }}>{c.phone}</small>
                  )}
                </div>
              ))}
            </div>
          )}
        </label>
        <label>
          <span>{ui.note}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <div className="order-type-toggles">
        <label className="test-order-toggle">
          <input type="checkbox" checked={isTest} onChange={(event) => setIsTest(event.target.checked)} />
          <span><b>Test siparişi</b><small>Bildirim gönderilmez; stok ve günlük satış toplamlarına dahil edilmez.</small></span>
        </label>
        <label className={`test-order-toggle loan-return-toggle${isLoanReturn ? " active" : ""}`}>
          <input type="checkbox" checked={isLoanReturn} onChange={(event) => setIsLoanReturn(event.target.checked)} />
          <span><b>Borç iadesi</b><small>Teslimde stoktan ve müşterinin borç bakiyesinden düşer.</small></span>
        </label>
      </div>

      {!matches.length ? (
        <>
          <label>
            <span>{ui.orderText}</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                "30 mt FS Beyaz\n2 rulo Parlak Beyaz\nST Gri 3 top\nSedef Metal 25m\n010 - 4 rl"
              }
              rows={6}
            />
          </label>
          <div className="order-ocr-actions">
            <label className={`order-ocr-button${ocrBusy ? " disabled" : ""}`}>
              <ScanText size={18} />
              <span>{ocrBusy ? `Resim okunuyor %${ocrProgress}` : "Resimden oku"}</span>
              <input
                type="file"
                accept={imageAccept}
                disabled={ocrBusy}
                onChange={(event) => {
                  void readOrderImage(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label className={`order-ocr-button${ocrBusy ? " disabled" : ""}`}>
              <Camera size={18} />
              <span>Fotoğraf çek</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={ocrBusy}
                onChange={(event) => {
                  void readOrderImage(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          <button
            className="primary full"
            disabled={!text.trim() || busy || ocrBusy}
            onClick={analyze}
          >
            {busy ? "…" : ui.match}
          </button>
        </>
      ) : (
        <div className="match-list">
          <div className="match-head">
            <b>{ui.matched}</b>
          </div>
          {matches.map((item, index) => {
            const selectedProduct = availableProducts.find(
              (product) => product.id === item.productId,
            );
            const available = Number(selectedProduct?.availableQuantity ?? 0);
            const stockConsumption = Number(item.quantity || 0);
            const exceedsStock = Boolean(
              selectedProduct && stockConsumption > available,
            );
            return (
              <div
                className={`match-row ${item.needsReview ? "review" : ""} ${exceedsStock ? "stock-warning" : ""}`}
                key={`${item.source}-${index}`}
              >
                <div className="source-line">
                  “{item.source}”
                  {item.confidence > 0 && (
                    <span
                      style={{
                        fontSize: "11px",
                        marginLeft: "8px",
                        color: item.confidence >= 0.85 ? "#10b981" : "#f59e0b",
                      }}
                    >
                      (%{Math.round(item.confidence * 100)})
                    </span>
                  )}
                  <button type="button" className="create-missing-product" onClick={() => openNewProduct(item, index)}>
                    + Yeni ürün oluştur ve bu satıra bağla
                  </button>
                </div>
                <select
                  value={item.productId ?? ""}
                  onChange={(e) => {
                    const product = availableProducts.find(
                      (p) => p.id === Number(e.target.value),
                    );
                    if (product) {
                      update(index, {
                        productId: product.id,
                        productName: product.name,
                        productCode: product.code || product.sku || "",
                      });
                    }
                  }}
                >
                  <option value="">{ui.choose}</option>
                  {availableProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.code || product.sku} · {product.name} ·{" "}
                      {Number(product.availableQuantity ?? 0).toLocaleString(
                        language,
                      )}{" "}
                      mt
                    </option>
                  ))}
                </select>
                <div className="order-quantity-editor">
                  <div className="meter-input">
                    <EditableNumberInput
                      min={0}
                      step={0.01}
                      value={Number(item.quantity ?? 0)}
                      onValueChange={(value) => update(index, { quantity: value, unit: "mt" })}
                    />
                    <span>mt</span>
                  </div>
                  <div className="meter-input">
                    <EditableNumberInput
                      min={0}
                      step={1}
                      value={Number(item.orderedRollCount ?? 0)}
                      onValueChange={(value) => update(index, { orderedRollCount: Math.max(0, Math.trunc(value)) })}
                    />
                    <span>rulo</span>
                  </div>
                </div>
                <input
                  className="line-note-input"
                  value={item.lineNote ?? ""}
                  onChange={(e) => update(index, { lineNote: e.target.value })}
                  placeholder={ui.lineNote}
                  aria-label={ui.lineNote}
                />
                <button
                  type="button"
                  className="remove-order-line"
                  title="Sipariş satırını kaldır"
                  aria-label="Sipariş satırını kaldır"
                  onClick={() => setMatches((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Trash2 aria-hidden="true" />
                  <span>Satırı kaldır</span>
                </button>
                {newProductIndex === index && (
                  <div className="inline-product-create">
                    <label><span>Ürün kodu</span><input value={newProductCode} onChange={(event) => setNewProductCode(event.target.value)} placeholder="ERSA 000" /></label>
                    <label><span>Ürün adı</span><input autoFocus value={newProductName} onChange={(event) => setNewProductName(event.target.value)} /></label>
                    <button type="button" className="secondary" onClick={() => setNewProductIndex(null)}>Vazgeç</button>
                    <button type="button" className="primary" disabled={busy || !newProductName.trim()} onClick={() => void createMatchedProduct(index)}>Oluştur ve seç</button>
                  </div>
                )}
                {selectedProduct && (
                  <div className="product-stock-summary">
                    <span>
                      Fiziki{" "}
                      <b>
                        {Number(
                          selectedProduct.physicalQuantity ?? 0,
                        ).toLocaleString(language)}{" "}
                        mt
                      </b>
                    </span>
                    <span>
                      Rezerv{" "}
                      <b>
                        {Number(
                          selectedProduct.reservedQuantity ?? 0,
                        ).toLocaleString(language)}{" "}
                        mt
                      </b>
                    </span>
                    <span>
                      Kullanılabilir{" "}
                      <b>{available.toLocaleString(language)} mt</b>
                    </span>
                    <span>
                      Rulo{" "}
                      <b>
                        {Number(selectedProduct.rollCount ?? 0).toLocaleString(
                          language,
                        )}
                      </b>
                    </span>
                    {exceedsStock && (
                      <strong>
                        Girilen miktar kullanılabilir stoktan fazla.
                      </strong>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button
            className="primary full"
            disabled={
              !customerName.trim() ||
              matches.some((item) => !item.productId || (!(Number(item.quantity) > 0) && !(Number(item.orderedRollCount) > 0))) ||
              busy
            }
            onClick={save}
          >
            {busy ? "…" : ui.send}
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function ApprovalFormsPage({
  orders,
  onOpen,
  onShowPdf,
}: {
  orders: Order[];
  onOpen: (order: Order) => void;
  onShowPdf: (order: Order) => void;
}) {
  if (!orders.length) {
    return (
      <div className="approval-forms-empty">
        <FileText aria-hidden="true" />
        <b>Henüz sipariş formu yok</b>
        <span>Hazır siparişlerden oluşturulan formlar burada görünecek.</span>
      </div>
    );
  }
  const groups = orders.reduce<Array<{ date: string; orders: Order[] }>>((result, order) => {
    const key = order.approvalForm?.date || "Tarihsiz";
    const current = result.find((group) => group.date === key);
    if (current) current.orders.push(order);
    else result.push({ date: key, orders: [order] });
    return result;
  }, []);
  return (
    <section className="approval-forms-page">
      <header>
        <div>
          <b>Sipariş formları</b>
          <span>{orders.length} belge</span>
        </div>
        <span>Onaya gönderilen ve onaylanan formlar</span>
      </header>
      <div className="approval-forms-table">
        <div className="approval-forms-table-head">
          <span>PDF</span>
          <span>Durum</span>
          <span>Form / sipariş</span>
          <span>Müşteri</span>
          <span>Satış temsilcisi</span>
          <span>Belge tarihi</span>
        </div>
        {groups.map((group) => (
          <div className="approval-form-date-group" key={group.date}>
            <div className="approval-form-date-separator">
              <CalendarDays aria-hidden="true" />
              <b>{group.date === "Tarihsiz" ? group.date : new Date(`${group.date}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" })}</b>
              <span>{group.orders.length} form</span>
            </div>
            {group.orders.map((order) => {
              const form = order.approvalForm!;
              return (
                <div className="approval-form-row" key={order.id}>
                  {form.archive?.path ? (
                    <button className="approval-form-pdf" type="button" onClick={() => onShowPdf(order)} aria-label={`${form.number} PDF göster`}>
                      <Eye aria-hidden="true" />
                      <span>Göster</span>
                    </button>
                  ) : <span className="approval-form-pdf-missing">PDF yok</span>}
                  <span className={`approval-form-state ${form.status}`} title={form.status === "approved" ? "Onaylandı" : form.status === "rejected" ? `Reddedildi: ${form.rejectionReason || "Sebep belirtilmedi"}` : "Onay bekliyor"}>
                    <i>{form.status === "approved" && <Check />}</i>
                    <b>{form.status === "approved" ? "Onaylandı" : form.status === "rejected" ? "Reddedildi" : "Onay bekliyor"}</b>
                  </span>
                  <button className="approval-form-open" type="button" onClick={() => onOpen(order)}>
                    <span><b>{form.number}</b><small>{order.number}</small></span>
                    <span><b>{form.customerName || order.customerName}</b><small>{form.customerContact || "Müşteri yetkilisi belirtilmedi"}</small></span>
                    <span><b>{form.salesRepresentative || "Atanmadı"}</b><small>{form.updatedBy ? `Son işlem: ${form.updatedBy}` : ""}</small></span>
                    <span><b>{new Date(`${form.date}T00:00:00`).toLocaleDateString("tr-TR")}</b><small>{form.updatedAt ? new Date(form.updatedAt).toLocaleString("tr-TR") : ""}</small></span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function ApprovalPdfViewer({ order, session, allowApproval, onClose, onEdit, onApprove, onReject }: {
  order: Order;
  session: Session;
  allowApproval: boolean;
  onClose: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [pdfRendered, setPdfRendered] = useState(false);
  const [zoom, setZoom] = useState(1);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const nativePdfRef = useRef<HTMLIFrameElement | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const filename = order.approvalForm?.archive?.filename || `${order.approvalForm?.number || order.number}.pdf`;
  const nativeShare = Reflect.get(navigator, "share") as ((data: ShareData) => Promise<void>) | undefined;
  const nativeCanShare = Reflect.get(navigator, "canShare") as ((data: ShareData) => boolean) | undefined;
  const useNativeWindowsViewer = /Windows NT/i.test(navigator.userAgent);
  const representativeName = representativeIdentity(order.approvalForm?.salesRepresentative);
  const sessionName = representativeIdentity(session.name);
  const isOwner = workflowRole(session.role) === "owner";
  const ownsOrder = order.createdByUserId ? order.createdByUserId === session.id : order.createdBy.trim().toLocaleLowerCase("tr") === sessionName;
  const isAssignedRepresentative = order.approvalForm?.salesRepresentativeUserId
    === session.id || Boolean(representativeName && representativeName === sessionName);
  const canEditRejectedOwn = order.approvalForm?.status === "rejected" &&
    workflowRole(session.role) === "sales" && (ownsOrder || isAssignedRepresentative);
  const canEdit = isOwner || Boolean(session.permissions?.includes("order_forms.edit")) || canEditRejectedOwn;
  const canApprove = allowApproval && (isOwner ||
    Boolean(session.permissions?.includes("order_forms.approve")) ||
    ((Boolean(session.permissions?.includes("orders.approve")) || workflowRole(session.role) === "sales") && (ownsOrder || isAssignedRepresentative)));

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    fetch(`/api/orders/${order.id}/approval-form/pdf`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "PDF açılamadı.");
        }
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfBlob(blob);
        setPdfUrl(objectUrl);
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "PDF açılamadı."); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [order.id]);

  useEffect(() => {
    if (useNativeWindowsViewer || !pdfBlob || !pagesRef.current) return;
    let cancelled = false;
    const pages = pagesRef.current;
    pages.replaceChildren();
    setPdfRendered(false);
    void (async () => {
      try {
        const pdfjs = await preloadPdfRenderer();
        const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
        const pdfDocument = await pdfjs.getDocument({ data: bytes }).promise;
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages && !cancelled; pageNumber += 1) {
          const page = await pdfDocument.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = pages.parentElement?.clientWidth || window.innerWidth;
          const targetWidth = Math.min(1400, Math.max(320, availableWidth));
          const cssScale = targetWidth / baseViewport.width;
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
          const viewport = page.getViewport({ scale: cssScale * pixelRatio });
          const canvas = document.createElement("canvas");
          canvas.className = "approval-pdf-page";
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("PDF sayfası çizilemedi.");
          pages.appendChild(canvas);
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          if (pageNumber === 1 && !cancelled) setPdfRendered(true);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "PDF görüntülenemedi.");
      }
    })();
    return () => {
      cancelled = true;
      pages.replaceChildren();
    };
  }, [pdfBlob, useNativeWindowsViewer]);

  const touchDistance = (touches: { readonly [index: number]: { clientX: number; clientY: number } }) => {
    const x = touches[0].clientX - touches[1].clientX;
    const y = touches[0].clientY - touches[1].clientY;
    return Math.hypot(x, y);
  };

  const share = async () => {
    if (!pdfBlob) return;
    const file = new File([pdfBlob], filename, { type: "application/pdf" });
    try {
      const canShareFile = !nativeCanShare || nativeCanShare.call(navigator, { files: [file] });
      if (nativeShare && canShareFile) {
        await nativeShare.call(navigator, { title: filename, files: [file] });
        return;
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? `PDF paylaşılamadı: ${cause.message}` : "PDF paylaşılamadı.");
      return;
    }
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = filename;
    link.click();
  };

  const printPdf = async () => {
    if (!pdfBlob || !pdfRendered) return;
    if (useNativeWindowsViewer && nativePdfRef.current?.contentWindow) {
      nativePdfRef.current.contentWindow.focus();
      nativePdfRef.current.contentWindow.print();
      return;
    }
    const isAppleMobile = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isAppleMobile && nativeShare) {
      const file = new File([pdfBlob], filename, { type: "application/pdf" });
      try {
        if (!nativeCanShare || nativeCanShare.call(navigator, { files: [file] })) {
          await nativeShare.call(navigator, { title: `Yazdır: ${filename}`, files: [file] });
          return;
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? `Yazdırma ekranı açılamadı: ${cause.message}` : "Yazdırma ekranı açılamadı.");
        return;
      }
    }
    const cleanup = () => document.body.classList.remove("printing-pdf-viewer");
    document.body.classList.add("printing-pdf-viewer");
    window.addEventListener("afterprint", cleanup, { once: true });
    void document.body.offsetHeight;
    try {
      window.print();
    } finally {
      window.setTimeout(cleanup, 2_000);
    }
  };

  return (
    <section className="approval-pdf-viewer" role="dialog" aria-modal="true" aria-label={`${filename} PDF görüntüleyici`}>
      <header>
        <button type="button" onClick={onClose}><ArrowLeft aria-hidden="true" /><span>Geri</span></button>
        <div><b>{order.approvalForm?.number || order.number}</b><small>{filename}</small></div>
        <nav>
          {canEdit && <button type="button" onClick={onEdit}><Pencil aria-hidden="true" /><span>Düzenle</span></button>}
          {canApprove && order.approvalForm?.status !== "approved" && <button type="button" className="approval-viewer-reject" onClick={onReject}><X aria-hidden="true" /><span>Reddet</span></button>}
          {canApprove && order.approvalForm?.status !== "approved" && <button type="button" className="approval-viewer-approve" onClick={onApprove}><Check aria-hidden="true" /><span>Onayla</span></button>}
          <button className="mobile-hide-print" type="button" disabled={!pdfRendered} onClick={() => void printPdf()}><Printer aria-hidden="true" /><span>Yazdır</span></button>
          <button type="button" disabled={!pdfBlob} onClick={() => void share()}>{nativeShare ? <Share2 aria-hidden="true" /> : <Download aria-hidden="true" />}<span>{nativeShare ? "Paylaş" : "İndir"}</span></button>
        </nav>
      </header>
      <main
        onTouchStart={(event) => {
          if (event.touches.length === 2) pinchRef.current = { distance: touchDistance(event.touches), zoom };
        }}
        onTouchMove={(event) => {
          if (event.touches.length !== 2 || !pinchRef.current) return;
          event.preventDefault();
          const next = pinchRef.current.zoom * (touchDistance(event.touches) / pinchRef.current.distance);
          setZoom(Math.min(3.5, Math.max(0.75, next)));
        }}
        onTouchEnd={(event) => {
          if (event.touches.length < 2) pinchRef.current = null;
        }}
      >
        {error && <p className="form-error">{error}</p>}
        {!error && !pdfRendered && <div className="orders-loading-state"><span />Belge açılıyor…</div>}
        {!error && useNativeWindowsViewer && pdfUrl && <iframe ref={nativePdfRef} className="approval-native-pdf" src={pdfUrl} title={filename} onLoad={() => setPdfRendered(true)} />}
        {!useNativeWindowsViewer && <div className={`approval-pdf-canvas-stage ${pdfRendered ? "is-ready" : ""}`} style={{ width: `${zoom * 100}%` }} ref={pagesRef} aria-label={filename} />}
      </main>
    </section>
  );
}

function StockPage({
  products,
  language,
  session,
  canManage,
  onManage,
  onChanged,
}: {
  products: Product[];
  language: Language;
  session: Session;
  canManage: boolean;
  onManage: () => void;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [movements, setMovements] = useState<OrderStockMovement[]>([]);
  const [documents, setDocuments] = useState<StockDocument[]>([]);
  const [createDocumentOpen, setCreateDocumentOpen] = useState(false);
  const [activeDocument, setActiveDocument] = useState<StockDocument | null>(null);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  useEffect(() => {
    void Promise.allSettled([
      api<OrderStockMovement[]>("/api/orders/stock-movements").then(setMovements),
      api<StockDocument[]>("/api/orders/stock-documents").then(setDocuments),
    ]);
  }, []);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr");
    if (!query) return products;
    return products.filter((product) =>
      `${product.code || product.sku || ""} ${product.name}`.toLocaleLowerCase("tr").includes(query),
    );
  }, [products, search]);
  const summary = useMemo(() => {
    const available = products.map((product) =>
      Number(product.availableQuantity ?? (Number(product.physicalQuantity ?? 0) - Number(product.reservedQuantity ?? 0))),
    );
    return {
      products: products.length,
      meters: available.reduce((sum, value) => sum + value, 0),
      rolls: products.reduce((sum, product) => sum + Number(product.rollCount ?? 0), 0),
      low: available.filter((value) => value > 0 && value <= 100).length,
      out: available.filter((value) => value <= 0).length,
    };
  }, [products]);

  return (
    <section className="stock-page">
      <header className="stock-page-header">
        <div><span>STOK MERKEZİ</span><h2>Stok durumu</h2><p>Fiziki stok, rezervler ve sipariş hareketleri</p></div>
        {canManage && <button type="button" className="primary" onClick={onManage}><Pencil aria-hidden="true" /> Stoku yönet</button>}
      </header>
      <div className="stock-page-summary" aria-label="Stok özeti">
        <article><span>Ürün çeşidi</span><strong>{summary.products.toLocaleString(language)}</strong><small>Aktif katalog</small></article>
        <article><span>Kullanılabilir</span><strong>{summary.meters.toLocaleString(language, { maximumFractionDigits: 2 })} mt</strong><small>Rezerv sonrası</small></article>
        <article><span>Toplam rulo</span><strong>{summary.rolls.toLocaleString(language)}</strong><small>Fiziki stok</small></article>
        <article className={summary.low || summary.out ? "attention" : ""}><span>Stok uyarısı</span><strong>{summary.low + summary.out}</strong><small>{summary.out} tükenen · {summary.low} kritik</small></article>
      </div>
      <div className="stock-page-toolbar">
        <label><ScanText aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ürün kodu veya adıyla ara" /></label>
        <span>{filtered.length} ürün</span>
      </div>
      <div className="stock-page-content">
        <div className="stock-overview-table stock-page-table">
          <div className="stock-overview-head"><span>Ürün</span><span>Fiziki</span><span>Rezerv</span><span>Kullanılabilir</span><span>Rulo</span><span>Durum</span></div>
          <div className="stock-overview-body">
            {filtered.map((product) => {
              const available = Number(product.availableQuantity ?? (Number(product.physicalQuantity ?? 0) - Number(product.reservedQuantity ?? 0)));
              const state = available <= 0 ? "out" : available <= 100 ? "low" : "ok";
              return <button type="button" className="stock-overview-row stock-product-row" key={product.id} onClick={() => setActiveProduct(product)}>
                <span><b>{product.code || product.sku || "-"}</b><small>{product.name}</small></span>
                <strong>{Number(product.physicalQuantity ?? 0).toLocaleString(language)} mt</strong>
                <span>{Number(product.reservedQuantity ?? 0).toLocaleString(language)} mt</span>
                <strong>{available.toLocaleString(language)} mt</strong>
                <span>{Number(product.rollCount ?? 0).toLocaleString(language)}</span>
                <span className={`stock-state ${state}`}>{state === "out" ? "Tükendi" : state === "low" ? "Kritik" : "Yeterli"}</span>
              </button>;
            })}
          </div>
        </div>
        <aside className="stock-page-movements">
          <header><b>Son hareketler</b><span>{movements.length} kayıt</span></header>
          <div>
            {movements.slice(0, 12).map((movement) => <article key={movement.id}>
              <span><b>{movement.productCode || "-"}</b><small>{movement.productName}</small></span>
              <strong>-{movement.stockQuantity.toLocaleString(language)} mt</strong>
              <p>{movement.customerName} · {movement.orderNumber}</p>
              <time>{new Date(movement.createdAt).toLocaleString(language)}</time>
            </article>)}
            {!movements.length && <p className="stock-overview-empty">Henüz stok hareketi yok.</p>}
          </div>
        </aside>
        <aside className="stock-page-movements stock-documents-panel">
          <header><b>Stok evrakları</b><button type="button" onClick={() => setCreateDocumentOpen(true)}>＋ Evrak oluştur</button></header>
          <div>{documents.map((document) => <article key={document.id} className="stock-document-row">
            <span><b>{document.documentNumber}</b><small>{document.type === "purchase" ? "Normal alış" : document.type === "loan_purchase" ? "Borç alış" : document.type === "writeoff" ? "Stoktan silme" : document.type === "transfer" ? "Yer değiştirme" : "Stok düzeltme"}</small></span>
            <strong>{document.type === "loan_purchase" ? `${document.lines.reduce((sum, line) => sum + Number(line.loanOutstandingRollCount ?? line.rollCount ?? 0), 0).toLocaleString(language)} rulo · ${document.lines.reduce((sum, line) => sum + Number(line.loanOutstanding ?? line.quantity ?? 0), 0).toLocaleString(language)} mt kalan` : `${document.lines.length} ürün`}</strong><p>{document.counterparty || document.note}</p><time>{new Date(document.createdAt).toLocaleString(language)}</time>
            <button type="button" className="stock-document-detail-button" onClick={() => setActiveDocument(document)}>İçeriği gör</button>
          </article>)}{!documents.length && <p className="stock-overview-empty">Henüz stok evrakı oluşturulmadı.</p>}</div>
        </aside>
      </div>
      {activeProduct && <StockProductModal product={activeProduct} session={session} language={language} onClose={() => setActiveProduct(null)} onChanged={() => { onChanged(); setActiveProduct(null); }} />}
      {activeDocument && <StockDocumentDetailModal document={activeDocument} language={language} onClose={() => setActiveDocument(null)} />}
      {createDocumentOpen && <StockDocumentModal products={products} session={session} onClose={() => setCreateDocumentOpen(false)} onCreated={() => { setCreateDocumentOpen(false); onChanged(); void api<StockDocument[]>("/api/orders/stock-documents").then(setDocuments); }} />}
    </section>
  );
}

function StockDocumentDetailModal({ document, language, onClose }: { document: StockDocument; language: Language; onClose: () => void }) {
  const isLoan = document.type === "loan_purchase";
  const totalQuantity = document.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const totalRolls = document.lines.reduce((sum, line) => sum + Number(line.rollCount || 0), 0);
  const remainingQuantity = document.lines.reduce((sum, line) => sum + Number(line.loanOutstanding ?? line.quantity ?? 0), 0);
  const remainingRolls = document.lines.reduce((sum, line) => sum + Number(line.loanOutstandingRollCount ?? line.rollCount ?? 0), 0);
  return <Modal title={isLoan ? "Borç bakiyesi" : "Stok evrakı"} subtitle={`${document.documentNumber} · ${document.counterparty || "-"}`} onClose={onClose} wide>
    {isLoan && <div className="stock-loan-summary">
      <article><span>İlk borç</span><b>{totalRolls.toLocaleString(language)} rulo</b><strong>{totalQuantity.toLocaleString(language)} mt</strong></article>
      <article><span>Kalan borç</span><b>{remainingRolls.toLocaleString(language)} rulo</b><strong>{remainingQuantity.toLocaleString(language)} mt</strong></article>
      <article><span>İade edilen</span><b>{(totalRolls - remainingRolls).toLocaleString(language)} rulo</b><strong>{(totalQuantity - remainingQuantity).toLocaleString(language)} mt</strong></article>
    </div>}
    <div className="stock-loan-table">
      <header><span>Ürün</span><span>İlk borç</span><span>İade</span><span>Kalan</span></header>
      {document.lines.map((line) => {
        const quantityLeft = Number(line.loanOutstanding ?? line.quantity ?? 0);
        const rollsLeft = Number(line.loanOutstandingRollCount ?? line.rollCount ?? 0);
        return <article key={`${line.productId}-${line.productCode}`}>
          <span><b>{line.productCode || "-"}</b><small>{line.productName}</small></span>
          <span><b>{Number(line.rollCount || 0).toLocaleString(language)} rulo</b><small>{Number(line.quantity || 0).toLocaleString(language)} mt</small></span>
          <span><b>{(Number(line.rollCount || 0) - rollsLeft).toLocaleString(language)} rulo</b><small>{(Number(line.quantity || 0) - quantityLeft).toLocaleString(language)} mt</small></span>
          <span><b>{rollsLeft.toLocaleString(language)} rulo</b><small>{quantityLeft.toLocaleString(language)} mt</small></span>
        </article>;
      })}
    </div>
    {document.note && <p className="stock-document-note">{document.note}</p>}
  </Modal>;
}

function StockProductModal({ product, session, language, onClose, onChanged }: {
  product: Product; session: Session; language: Language; onClose: () => void; onChanged: () => void;
}) {
  const [history, setHistory] = useState<StockTransaction[]>([]);
  const [type, setType] = useState<StockTransaction["type"]>("purchase");
  const [quantity, setQuantity] = useState("");
  const [rollCount, setRollCount] = useState("");
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [note, setNote] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; data: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const owner = workflowRole(session.role) === "owner";
  const permissionFor: Record<StockTransaction["type"], string> = {
    adjustment: "stock.adjust", writeoff: "stock.writeoff", transfer: "stock.transfer", purchase: "stock.purchase", loan_purchase: "stock.loan_purchase",
  };
  const allowedTypes = (Object.keys(permissionFor) as StockTransaction["type"][]).filter((item) => owner || session.permissions?.includes(permissionFor[item]));
  useEffect(() => {
    void api<StockTransaction[]>(`/api/orders/catalog/${product.id}/stock-history`)
      .then((items) => setHistory((Array.isArray(items) ? items : []).filter((item) => Boolean(item?.type && item?.documentNumber))))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Stok geçmişi yüklenemedi."));
  }, [product.id]);
  useEffect(() => { if (!allowedTypes.includes(type) && allowedTypes[0]) setType(allowedTypes[0]); }, [allowedTypes, type]);
  const labels: Record<StockTransaction["type"], string> = { adjustment: "Stok düzeltme", writeoff: "Stoktan silme", transfer: "Yer değiştirme", purchase: "Normal alış", loan_purchase: "Borç alış" };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await api(`/api/orders/catalog/${product.id}/stock-transaction`, { method: "POST", body: JSON.stringify({ type, quantity: Number(quantity), rollCount: Number(rollCount || 0), fromLocation, toLocation, counterparty, note, attachmentName: attachment?.name, attachmentData: attachment?.data }) });
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Stok işlemi kaydedilemedi."); }
    finally { setBusy(false); }
  };
  return <Modal title={`${product.code || product.sku || "-"} · ${product.name}`} subtitle="Stok kartı ve evraklı hareket geçmişi" onClose={onClose} wide className="stock-product-modal">
    <div className="stock-product-balances">
      <article><span>Fiziki stok</span><strong>{Number(product.physicalQuantity || 0).toLocaleString(language)} mt</strong></article>
      <article><span>Rezerv</span><strong>{Number(product.reservedQuantity || 0).toLocaleString(language)} mt</strong></article>
      <article><span>Kullanılabilir</span><strong>{Number(product.availableQuantity || 0).toLocaleString(language)} mt</strong></article>
      <article><span>Rulo</span><strong>{Number(product.rollCount || 0).toLocaleString(language)}</strong></article>
    </div>
    {false && allowedTypes.length > 0 && <section className="stock-operation-form">
      <header><b>Yeni stok işlemi</b><span>Her kayıt için otomatik stok evrakı oluşur</span></header>
      <div className="stock-operation-types">{allowedTypes.map((item) => <button type="button" className={type === item ? "active" : ""} onClick={() => setType(item)} key={item}>{labels[item]}</button>)}</div>
      <div className="stock-operation-fields">
        {type !== "transfer" && <label>Metre<input type="number" min="0" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>}
        {type !== "transfer" && <label>Rulo<input type="number" min="0" step="1" value={rollCount} onChange={(event) => setRollCount(event.target.value)} /></label>}
        {type === "transfer" && <><label>Çıkış konumu<input value={fromLocation} onChange={(event) => setFromLocation(event.target.value)} /></label><label>Hedef konum<input value={toLocation} onChange={(event) => setToLocation(event.target.value)} /></label></>}
        {(type === "purchase" || type === "loan_purchase") && <label className="wide">Tedarikçi / firma<input value={counterparty} onChange={(event) => setCounterparty(event.target.value)} /></label>}
        <label className="wide">Açıklama<textarea rows={2} required value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <label className="stock-document-upload">Evrak ekle<input type="file" accept="image/*,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setAttachment({ name: file.name, data: String(reader.result || "") }); reader.readAsDataURL(file); }} /><span>{attachment?.name || "PDF veya görsel"}</span></label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button type="button" className="primary" disabled={busy || !note.trim() || (type !== "transfer" && !(Number(quantity) > 0))} onClick={() => void submit()}>{busy ? "Kaydediliyor…" : "İşlemi ve evrakı kaydet"}</button>
    </section>}
    <section className="stock-product-history"><header><b>Hareket geçmişi</b><span>{history.length} evrak</span></header>{history.map((item) => <article key={item.id}>
      <span className={`stock-history-type ${item.type}`}>{labels[item.type]}</span><div><b>{item.documentNumber}</b><small>{item.note}</small></div><strong>{item.signedQuantity > 0 ? "+" : ""}{item.signedQuantity.toLocaleString(language)} mt</strong><span><b>{item.createdBy}</b><small>{new Date(item.createdAt).toLocaleString(language)}</small></span>{item.attachment && <span className="stock-history-document"><FileText aria-hidden="true" /> {item.attachment.name}</span>}
    </article>)}{!history.length && <p className="stock-overview-empty">Bu ürün için kayıtlı stok evrakı yok.</p>}</section>
  </Modal>;
}

function StockDocumentModal({ products, session, onClose, onCreated }: { products: Product[]; session: Session; onClose: () => void; onCreated: () => void }) {
  const owner = workflowRole(session.role) === "owner";
  const permissions: Record<StockTransaction["type"], string> = { adjustment: "stock.adjust", writeoff: "stock.writeoff", transfer: "stock.transfer", purchase: "stock.purchase", loan_purchase: "stock.loan_purchase" };
  const labels: Record<StockTransaction["type"], string> = { adjustment: "Stok düzeltme", writeoff: "Stoktan silme", transfer: "Yer değiştirme", purchase: "Normal alış", loan_purchase: "Borç alış" };
  const allowed = (Object.keys(permissions) as StockTransaction["type"][]).filter((type) => owner || session.permissions?.includes(permissions[type]));
  const [type, setType] = useState<StockTransaction["type"]>(allowed[0] || "purchase");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [counterparty, setCounterparty] = useState("");
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{ productId: products[0]?.id || 0, quantity: "", rollCount: "" }]);
  const [attachments, setAttachments] = useState<Array<{ name: string; data: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const loaded = await Promise.all([...files].map((file) => new Promise<{ name: string; data: string }>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, data: String(reader.result || "") }); reader.onerror = reject; reader.readAsDataURL(file); })));
    setAttachments((current) => [...current, ...loaded]);
  };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await api("/api/orders/stock-documents", { method: "POST", body: JSON.stringify({ type, date, counterparty, fromLocation, toLocation, note, attachments, lines: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity || 0), rollCount: Number(line.rollCount || 0) })) }) });
      onCreated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Stok evrakı oluşturulamadı."); }
    finally { setBusy(false); }
  };
  return <Modal title="Stok evrakı oluştur" subtitle="Bir evraka birden fazla ürün ve dosya ekleyebilirsiniz" onClose={onClose} wide className="stock-document-modal">
    <div className="stock-operation-types">{allowed.map((item) => <button type="button" key={item} className={type === item ? "active" : ""} onClick={() => setType(item)}>{labels[item]}</button>)}</div>
    <div className="stock-document-meta"><label>Tarih<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>{(type === "purchase" || type === "loan_purchase") && <label>Tedarikçi / firma<input value={counterparty} onChange={(event) => setCounterparty(event.target.value)} /></label>}{type === "transfer" && <><label>Çıkış konumu<input value={fromLocation} onChange={(event) => setFromLocation(event.target.value)} /></label><label>Hedef konum<input value={toLocation} onChange={(event) => setToLocation(event.target.value)} /></label></>}</div>
    <section className="stock-document-lines"><header><b>Ürünler</b><button type="button" onClick={() => setLines((current) => [...current, { productId: products[0]?.id || 0, quantity: "", rollCount: "" }])}>＋ Ürün ekle</button></header>{lines.map((line, index) => <div key={index}>
      <select value={line.productId} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productId: Number(event.target.value) } : item))}>{products.map((product) => <option key={product.id} value={product.id}>{product.code || product.sku} · {product.name}</option>)}</select>
      {type !== "transfer" && <input type="number" min="0" step="0.01" placeholder="Metre" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} />}
      {type !== "transfer" && <input type="number" min="0" step="1" placeholder="Rulo" value={line.rollCount} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, rollCount: event.target.value } : item))} />}
      <button type="button" aria-label="Ürünü kaldır" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
    </div>)}</section>
    <label className="stock-document-note">Evrak açıklaması<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label>
    <label className="stock-document-upload multi">Dosyalar<input type="file" multiple accept="image/*,.pdf" onChange={(event) => void addFiles(event.target.files)} /><span>{attachments.length ? `${attachments.length} dosya eklendi` : "PDF veya görselleri seçin"}</span></label>
    {attachments.length > 0 && <div className="stock-document-files">{attachments.map((file, index) => <span key={`${file.name}-${index}`}><FileText aria-hidden="true" />{file.name}<button type="button" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}
    {error && <p className="form-error">{error}</p>}
    <button type="button" className="primary stock-document-save" disabled={busy || !allowed.length || !note.trim()} onClick={() => void submit()}>{busy ? "Kaydediliyor…" : "Stok evrakını oluştur"}</button>
  </Modal>;
}

function SettingsModal({
  products,
  session,
  customers,
  aliases,
  language,
  printSettings,
  onPrintSettingsChange,
  onClose,
  onReload,
  productsOnly = false,
}: {
  products: Product[];
  session: Session;
  customers: Customer[];
  aliases: AliasRule[];
  language: Language;
  printSettings: CompanyPrintSettings;
  onPrintSettingsChange: (settings: CompanyPrintSettings) => void;
  onClose: () => void;
  onReload: () => void;
  productsOnly?: boolean;
}) {
  const ui = copy[language];
  const [tab, setTab] = useState<
    "branding" | "products" | "customers" | "aliases" | "users" | "access"
  >(productsOnly ? "products" : "branding");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionDefinition[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<Record<string, string[]>>({});
  const [expandedEmployeeId, setExpandedEmployeeId] = useState("");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [notificationsPaused, setNotificationsPaused] = useState(false);
  const [notificationControlBusy, setNotificationControlBusy] = useState(false);
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryGroup[]>([]);
  const [notificationHistoryLoading, setNotificationHistoryLoading] = useState(false);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [accessLogsLoading, setAccessLogsLoading] = useState(false);
  const [accessUserFilter, setAccessUserFilter] = useState("");
  const [accessActionFilter, setAccessActionFilter] = useState("");
  const [accessPageFilter, setAccessPageFilter] = useState("");
  const [accessDateFrom, setAccessDateFrom] = useState("");
  const [accessDateTo, setAccessDateTo] = useState("");
  const [stockImporting, setStockImporting] = useState(false);
  const [stockImportHistory, setStockImportHistory] = useState<StockImportHistory[]>([]);
  const [orderStockMovements, setOrderStockMovements] = useState<OrderStockMovement[]>([]);
  const [stockEditing, setStockEditing] = useState(productsOnly);
  const [brand, setBrand] = useState(printSettings);
  const hasSettingPermission = (permission: string) =>
    workflowRole(session.role) === "owner" || Boolean(session.permissions?.includes(permission));
  const filteredAccessLogs = useMemo(() => {
    const from = accessDateFrom ? new Date(`${accessDateFrom}T00:00:00`).getTime() : 0;
    const to = accessDateTo ? new Date(`${accessDateTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return accessLogs.filter((entry) => {
      const timestamp = new Date(entry.createdAt).getTime();
      return (!accessUserFilter || entry.userId === accessUserFilter)
        && (!accessActionFilter || entry.action === accessActionFilter)
        && (!accessPageFilter || entry.page === accessPageFilter)
        && timestamp >= from && timestamp <= to;
    });
  }, [accessLogs, accessUserFilter, accessActionFilter, accessPageFilter, accessDateFrom, accessDateTo]);
  const settingsTabs = (productsOnly ? [
    { id: "products" as const, allowed: hasSettingPermission("products.view") || hasSettingPermission("products.manage") },
  ] : [
    { id: "branding" as const, allowed: hasSettingPermission("company.view") || hasSettingPermission("company.manage") },
    { id: "customers" as const, allowed: hasSettingPermission("counterparties.view") || hasSettingPermission("counterparties.manage") },
    { id: "aliases" as const, allowed: hasSettingPermission("company.manage") },
    { id: "users" as const, allowed: hasSettingPermission("employees.manage") },
    { id: "access" as const, allowed: workflowRole(session.role) === "owner" },
  ]).filter((item) => item.allowed);

  // Product form state
  const [newProductName, setNewProductName] = useState("");
  const [newProductCode, setNewProductCode] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");

  // Customer form state
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const [newCustomerSalesRepresentative, setNewCustomerSalesRepresentative] = useState("");
  const [newCustomerFolderName, setNewCustomerFolderName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerNote, setNewCustomerNote] = useState("");
  const [newCustomerAddressLine1, setNewCustomerAddressLine1] = useState("");
  const [newCustomerAddressLine2, setNewCustomerAddressLine2] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<"domestic" | "foreign">("domestic");
  const [customerImporting, setCustomerImporting] = useState(false);
  const [customerPriceDraft, setCustomerPriceDraft] = useState<Record<string, string>>({});
  const [customerAntrepoPriceDraft, setCustomerAntrepoPriceDraft] = useState<Record<string, string>>({});
  const [customerContactDraft, setCustomerContactDraft] = useState("");
  const [customerSalesRepresentativeDraft, setCustomerSalesRepresentativeDraft] = useState("");
  const [customerFolderNameDraft, setCustomerFolderNameDraft] = useState("");
  const [customerAddressLine1Draft, setCustomerAddressLine1Draft] = useState("");
  const [customerAddressLine2Draft, setCustomerAddressLine2Draft] = useState("");
  const customerImportInputRef = useRef<HTMLInputElement>(null);
  const [customerImportFileName, setCustomerImportFileName] = useState("");

  // Alias form state
  const [newTrigger, setNewTrigger] = useState("");
  const [newReplacement, setNewReplacement] = useState("");

  // Live test matching state
  const [testLine, setTestLine] = useState("30 mt FS Beyaz");
  const [testResult, setTestResult] = useState<Match[] | null>(null);

  const loadEmployees = useCallback(async () => {
    try {
      const [employeeData, permissionResponse, notificationControl] = await Promise.all([
        api<Employee[]>("/api/employees"),
        request<{ data: PermissionDefinition[]; roleDefaults?: Record<string, string[]> }>("/api/employees/permission-catalog"),
        api<{ paused?: boolean }>("/api/orders/notification-control"),
      ]);
      setEmployees(employeeData);
      setPermissionCatalog(permissionResponse.data);
      setRoleDefaults(permissionResponse.roleDefaults ?? {});
      setNotificationsPaused(Boolean(notificationControl.paused));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "İstifadəçilər yüklənmədi.",
      );
    }
  }, []);

  const loadNotificationHistory = useCallback(async () => {
    setNotificationHistoryLoading(true);
    try {
      const history = await api<Array<Partial<NotificationHistoryGroup> & { recipientName?: string }>>("/api/orders/notifications/history");
      setNotificationHistory((Array.isArray(history) ? history : []).map((entry, index) => ({
        id: String(entry.id || `notification-history-${index}`),
        type: String(entry.type || "notification"),
        title: String(entry.title || "Bildirim"),
        message: String(entry.message || ""),
        createdAt: String(entry.createdAt || ""),
        createdBy: String(entry.createdBy || "AriX"),
        orderId: String(entry.orderId || ""),
        dayKey: String(entry.dayKey || ""),
        recipients: Array.isArray(entry.recipients)
          ? entry.recipients.map(String).filter(Boolean)
          : [String(entry.recipientName || "")].filter(Boolean),
        readCount: Number.isFinite(Number(entry.readCount)) ? Number(entry.readCount) : 0,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bildirim geçmişi yüklenemedi.");
    } finally {
      setNotificationHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "users") void Promise.all([loadEmployees(), loadNotificationHistory()]);
  }, [tab, loadEmployees, loadNotificationHistory]);

  useEffect(() => {
    if (tab !== "access" || workflowRole(session.role) !== "owner") return;
    setAccessLogsLoading(true);
    void api<AccessLog[]>("/api/orders/access-logs").then(setAccessLogs).catch((err) => setError(err instanceof Error ? err.message : "Erişim geçmişi yüklenemedi.")).finally(() => setAccessLogsLoading(false));
  }, [tab, session.role]);

  useEffect(() => {
    if (tab !== "products" || !hasSettingPermission("products.view")) return;
    void Promise.allSettled([
      api<StockImportHistory[]>("/api/orders/catalog/stock-import-history").then(setStockImportHistory),
      api<OrderStockMovement[]>("/api/orders/stock-movements").then(setOrderStockMovements),
    ]);
  }, [tab]);

  useEffect(() => {
    if (!settingsTabs.some((item) => item.id === tab) && settingsTabs[0]) setTab(settingsTabs[0].id);
  }, [tab, settingsTabs]);

  const importStockExcel = async (file: File) => {
    setStockImporting(true);
    setError("");
    setSuccess("");
    try {
      const sheet = (await readXlsxFile(file)) as unknown as Array<
        Array<string | number | boolean | Date | null>
      >;
      if (sheet.length < 2) throw new Error("Excel dosyası boş.");
      const normalize = (value: unknown) =>
        String(value ?? "")
          .trim()
          .toLocaleLowerCase("tr")
          .replace(/\s+/g, " ");
      const headerIndex = sheet.findIndex((row) => row.some((cell) => ["ürün kodu", "kod", "stok kodu", "sku"].includes(normalize(cell))));
      if (headerIndex < 0) throw new Error("Ürün kodu başlığı bulunamadı.");
      const headers = sheet[headerIndex].map(normalize);
      const findColumn = (...names: string[]) =>
        headers.findIndex((header) => names.includes(header));
      const codeColumn = findColumn(
        "kod",
        "kodu",
        "ürün kodu",
        "məhsul kodu",
        "stok kodu",
        "sku",
        "artikül",
        "artikul",
      );
      const meterColumn = findColumn(
        "fiziki mt",
        "stok mt",
        "metraj / mtül",
        "metraj / mtul",
        "metraj",
        "metre",
        "metr",
        "mt",
        "stok",
      );
      const rollColumn = findColumn(
        "rulo",
        "rulo sayısı",
        "rulo sayı",
        "rulo sayısi",
        "rulo sayı",
        "rulon",
      );
      const nameColumn = findColumn("ürün adı", "məhsul adı", "ürün", "malzeme adı");
      if (codeColumn < 0 || meterColumn < 0)
        throw new Error(
          "Excel başlıklarında Ürün kodu ve Metraj sütunları bulunmalıdır.",
        );
      const rows = sheet
        .slice(headerIndex + 1)
        .filter((row) => row.some((cell) => cell !== null && cell !== ""))
        .map((row) => ({
          code: String(row[codeColumn] ?? "").trim(),
          name: nameColumn >= 0 ? String(row[nameColumn] ?? "").trim() : "",
          physicalQuantity: Number(row[meterColumn] ?? 0),
          rollCount: rollColumn >= 0 ? Number(row[rollColumn] ?? 0) : 0,
        }))
        .filter((row) => row.code);
      const dateMatch = file.name.match(/(\d{2})[.\-_](\d{2})[.\-_](\d{4})/);
      const sourceDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : new Date(file.lastModified).toISOString().slice(0, 10);
      const result = await api<{ updated: number; created: number; history: StockImportHistory }>(
        "/api/orders/catalog/stock-import",
        { method: "POST", body: JSON.stringify({ rows, sourceName: file.name, sourceDate, sourceFile: await fileToDataUrl(file) }) },
      );
      setStockImportHistory((current) => [result.history, ...current].slice(0, 20));
      setSuccess(`${result.updated} ürünün stoku güncellendi. ${result.created} yeni ürün oluşturuldu.`);
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Excel stokları yüklenemedi.");
    } finally {
      setStockImporting(false);
    }
  };

  const updateEmployeeRole = async (
    employee: Employee,
    patch: Partial<Pick<Employee, "role" | "active" | "permissions" | "notificationPreferences" | "notificationPermissions">>,
  ) => {
    setError("");
    try {
      await api(`/api/employees/${encodeURIComponent(employee.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: employee.name,
          email: employee.email,
          phone: employee.phone ?? "",
          role: patch.role ?? employee.role,
          active: patch.active ?? employee.active,
          permissions: patch.permissions ?? employee.permissions,
          notificationPreferences: patch.notificationPreferences ?? employee.notificationPreferences,
          notificationPermissions: patch.notificationPermissions ?? employee.notificationPermissions,
        }),
      });
      await loadEmployees();
      setSuccess("İstifadəçi icazəsi yeniləndi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "İstifadəçi yenilənmədi.");
    }
  };

  const sendBroadcastNotification = async (test = false) => {
    setError("");
    setSuccess("");
    if (!test && (!broadcastTitle.trim() || !broadcastMessage.trim())) {
      setError("Duyuru başlığı ve mesajı zorunludur.");
      return;
    }
    setBroadcastSending(true);
    try {
      const result = await api<{ recipients: number; pushed: number; paused?: boolean }>("/api/orders/notifications/broadcast", {
        method: "POST",
        body: JSON.stringify({ test, title: broadcastTitle, message: broadcastMessage }),
      });
      if (result.paused) {
        setSuccess("Bildirimler duraklatıldığı için gönderilmedi.");
        return;
      }
      if (!test) {
        setBroadcastTitle("");
        setBroadcastMessage("");
      }
      setSuccess(`Bildirim ${result.recipients} kullanıcıya kaydedildi, ${result.pushed} cihaz push bildirimi aldı.`);
      await loadNotificationHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toplu bildirim gönderilemedi.");
    } finally {
      setBroadcastSending(false);
    }
  };

  const setNotificationPause = async (paused: boolean) => {
    setError("");
    setSuccess("");
    setNotificationControlBusy(true);
    try {
      const result = await api<{ paused: boolean }>("/api/orders/notification-control", {
        method: "PATCH",
        body: JSON.stringify({ paused }),
      });
      setNotificationsPaused(Boolean(result.paused));
      setSuccess(paused ? "Tüm bildirimler geçici olarak duraklatıldı." : "Tüm bildirimler yeniden açıldı.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bildirim ayarı güncellenemedi.");
    } finally {
      setNotificationControlBusy(false);
    }
  };

  const permissionLabels: Record<string, string> = {
    "dashboard.view": "Paneli gör",
    "products.view": "Ürün ve stokları gör",
    "products.manage": "Ürün ve stokları yönet",
    "stock.adjust": "Stok düzeltmesi yap",
    "stock.writeoff": "Stoktan silme yap",
    "stock.transfer": "Stok yer değiştirmesi yap",
    "stock.purchase": "Normal alış girişi yap",
    "stock.loan_purchase": "Borç alış girişi yap",
    "orders.view": "Siparişleri gör",
    "orders.view_all": "Tüm kullanıcıların siparişlerini gör",
    "orders.create": "Sipariş oluştur",
    "orders.approve": "Kendi siparişini onayla",
    "orders.edit": "Sipariş düzenle",
    "orders.lock": "Sipariş kilitle / kilidi aç",
    "orders.prepare": "Ürün hazırla, metre ve rulo gir",
    "orders.merge_ready": "Hazır siparişleri birleştir",
    "orders.rollback": "Siparişi önceki aşamaya geri gönder",
    "orders.despatch": "İrsaliye durumunu yönet",
    "orders.deliver": "Siparişi teslim et",
    "orders.deliver_without_proof": "Teslim notu ve dosyası olmadan teslim et",
    "orders.delete": "Sipariş sil ve geri yükle",
    "orders.days.view": "Gün arşivini gör",
    "orders.days.manage": "İş gününü aç ve kapat",
    "orders.audit.view": "İşlem geçmişi ve logları gör",
    "documents.view": "Belgeleri gör",
    "documents.create": "Belge yükle ve oluştur",
    "documents.edit": "Belgeleri düzenle",
    "documents.delete": "Belgeleri sil",
    "order_forms.view": "Sipariş formlarını gör",
    "order_forms.view_all": "Tüm temsilcilerin formlarını gör",
    "order_forms.edit": "Sipariş formu düzenle",
    "order_forms.approve": "Sipariş formunu onayla ve PDF'yi arşivle",
    "money.view": "Finansı gör",
    "money.manage": "Finansı yönet",
    "counterparties.view": "Müşterileri gör",
    "counterparties.manage": "Müşteri ve fiyatları yönet",
    "company.view": "Şirket ayarlarını gör",
    "company.manage": "Şirket ayarlarını yönet",
    "employees.manage": "Kullanıcı ve yetkileri yönet",
    "accounting.view": "Muhasebeyi gör",
    "accounting.manage": "Muhasebeyi yönet",
    "reports.view": "Raporları gör",
    "trash.manage": "Çöp kutusunu yönet",
  };
  const permissionGroupLabels: Record<string, string> = {
    dashboard: "Panel", products: "Ürün ve stok", orders: "Sipariş akışı",
    documents: "Belgeler", order_forms: "Sipariş formları", money: "Finans",
    counterparties: "Müşteriler", company: "Şirket", employees: "Kullanıcılar",
    accounting: "Muhasebe", reports: "Raporlar", trash: "Çöp kutusu",
  };

  const runTestMatch = async () => {
    if (!testLine.trim()) return;
    try {
      const res = await api<Match[]>("/api/orders/match", {
        method: "POST",
        body: JSON.stringify({ text: testLine }),
      });
      setTestResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test xətası");
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/orders/catalog", {
        method: "POST",
        body: JSON.stringify({ name: newProductName, code: newProductCode }),
      });
      setNewProductName("");
      setNewProductCode("");
      setSuccess("Məhsul əlavə edildi.");
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Məhsul əlavə edilmədi.");
    } finally {
      setBusy(false);
    }
  };

  const handleBulkAddProducts = async () => {
    if (!bulkText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const lines = bulkText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        const parts = line.split(/[-–—:]/).map((s) => s.trim());
        let name = line;
        let code = "";
        if (parts.length >= 2) {
          if (/^ERSA|^TEST|^ARIX/i.test(parts[0])) {
            code = parts[0];
            name = parts.slice(1).join(" ");
          } else {
            name = parts[0];
            code = parts.slice(1).join(" ");
          }
        }
        await api("/api/orders/catalog", {
          method: "POST",
          body: JSON.stringify({ name, code }),
        });
      }
      setBulkText("");
      setBulkMode(false);
      setSuccess(`${lines.length} məhsul əlavə edildi.`);
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toplu əlavə edilmədi.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm("Bu məhsulu silmək istədiyinizə əminsiniz?")) return;
    try {
      await api(`/api/orders/catalog/${id}`, { method: "DELETE" });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Məhsul silinmədi.");
    }
  };

  const handleStockChange = async (
    product: Product,
    physicalQuantity: number,
    rollCount: number,
  ) => {
    setError("");
    try {
      await api("/api/orders/catalog", {
        method: "POST",
        body: JSON.stringify({
          id: product.id,
          name: product.name,
          code: product.code || product.sku || "",
          unit: product.unit || "mt",
          physicalQuantity: Math.max(0, physicalQuantity || 0),
          rollCount: Math.max(0, Math.trunc(rollCount || 0)),
        }),
      });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stok saxlanmadı.");
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/orders/customers", {
        method: "POST",
        body: JSON.stringify({
          name: newCustomerName,
          contact: newCustomerContact,
          salesRepresentative: newCustomerSalesRepresentative,
          folderName: newCustomerFolderName,
          phone: newCustomerPhone,
          addressLine1: newCustomerAddressLine1,
          addressLine2: newCustomerAddressLine2,
          address: [newCustomerAddressLine1, newCustomerAddressLine2].filter(Boolean).join(" · "),
          note: newCustomerNote,
        }),
      });
      setNewCustomerName("");
      setNewCustomerContact("");
      setNewCustomerSalesRepresentative("");
      setNewCustomerFolderName("");
      setNewCustomerPhone("");
      setNewCustomerNote("");
      setNewCustomerAddressLine1("");
      setNewCustomerAddressLine2("");
      setSuccess("Müştəri əlavə edildi.");
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Müştəri əlavə edilmədi.");
    } finally {
      setBusy(false);
    }
  };

  const importCustomersAndPrices = async (file: File) => {
    setCustomerImporting(true);
    setError("");
    setSuccess("");
    try {
      const dataSheet = await readSheet(file, "DATA");
      const foreignPriceSheets = {
        DEPO: "DepoPrice",
        ANTREPO_TRANSIT: "AntrepoPrice",
        ANTREPO_TRANSIT_FALLBACK: "TransitPrice",
      } as const;
      const isForeignWorkbook = String(dataSheet[1]?.[4] ?? "").trim().length > 0;
      let entries: Array<Record<string, unknown>> = [];

      if (isForeignWorkbook) {
        const byName = new Map<string, Record<string, unknown>>();
        dataSheet.slice(1).forEach((row) => {
          const name = String(row[5] ?? "").trim();
          if (!name) return;
          const addressLine1 = String(row[7] ?? "").trim();
          const addressLine2 = String(row[8] ?? "").trim();
          byName.set(name.toLocaleLowerCase("tr"), {
            name,
            country: String(row[4] ?? "").trim(),
            phone: String(row[6] ?? "").trim().replace(/^__$/, ""),
            folderName: name,
            addressLine1,
            addressLine2: addressLine2.replace(/^__$/, ""),
            address: [addressLine1, addressLine2.replace(/^__$/, "")].filter(Boolean).join(" · "),
            customerType: "foreign",
            prices: {},
            priceLists: {},
          });
        });
        const sheets = await Promise.all(
          Object.entries(foreignPriceSheets).map(async ([key, sheetName]) => [key, await readSheet(file, sheetName)] as const),
        );
        sheets.forEach(([rawListKey, sheet]) => {
          const listKey = rawListKey === "ANTREPO_TRANSIT_FALLBACK" ? "ANTREPO_TRANSIT" : rawListKey;
          const codes = (sheet[1] ?? []).map((value) => String(value ?? "").trim().toLocaleUpperCase("tr"));
          sheet.slice(2).forEach((row) => {
            const name = String(row[0] ?? "").trim();
            if (!name) return;
            const key = name.toLocaleLowerCase("tr");
            const entry = byName.get(key) ?? { name, customerType: "foreign", prices: {}, priceLists: {} };
            const listPrices: Record<string, number> = {};
            row.slice(1).forEach((value, index) => {
              const code = codes[index + 1];
              const price = Number(value);
              if (code && Number.isFinite(price) && price > 0) listPrices[code] = price;
            });
            const priceLists = entry.priceLists as Record<string, Record<string, number>>;
            const existingPrices = priceLists[listKey] ?? {};
            priceLists[listKey] = rawListKey === "ANTREPO_TRANSIT_FALLBACK"
              ? { ...listPrices, ...existingPrices }
              : listPrices;
            if (listKey === "DEPO") entry.prices = listPrices;
            byName.set(key, entry);
          });
        });
        entries = [...byName.values()];
      } else {
        const priceSheet = await readSheet(file, "SQMPRICES");
        const details = new Map<string, Record<string, string>>();
        dataSheet.slice(1).forEach((row) => {
          const name = String(row[5] ?? "").trim();
          if (!name) return;
          const addressLine1 = String(row[7] ?? "").trim();
          const addressLine2 = String(row[8] ?? "").trim();
          details.set(name.toLocaleLowerCase("tr"), {
            name,
            contact: String(row[6] ?? "").trim(),
            salesRepresentative: String(row[3] ?? "").trim(),
            folderName: String(row[4] ?? "").trim(),
            addressLine1,
            addressLine2,
            address: [addressLine1, addressLine2].filter(Boolean).join(" · "),
          });
        });
        const codes = (priceSheet[1] ?? []).map((value) => String(value ?? "").trim());
        entries = priceSheet.slice(2).flatMap((row) => {
          const name = String(row[0] ?? "").trim();
          if (!name) return [];
          const detail = details.get(name.toLocaleLowerCase("tr"));
          const prices: Record<string, number> = {};
          row.slice(1).forEach((value, index) => {
            const code = codes[index + 1];
            const price = Number(value);
            if (code && Number.isFinite(price) && price > 0) prices[code.toLocaleUpperCase("tr")] = price;
          });
          return [{ ...detail, name: detail?.name ?? name, prices }];
        });
      }
      const result = await api<{ imported: number; prices: number }>("/api/orders/customers/import", {
        method: "POST",
        body: JSON.stringify({ entries }),
      });
      setSuccess(`${result.imported} müşteri ve ${result.prices} özel fiyat Excel'den aktarıldı.`);
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Müşteri fiyatları aktarılamadı.");
    } finally {
      setCustomerImporting(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm("Bu müştərini silmək istədiyinizə əminsiniz?")) return;
    try {
      await api(`/api/orders/customers/${id}`, { method: "DELETE" });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Müştəri silinmədi.");
    }
  };

  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrigger.trim() || !newReplacement.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/orders/aliases", {
        method: "POST",
        body: JSON.stringify({
          trigger: newTrigger,
          replacement: newReplacement,
        }),
      });
      setNewTrigger("");
      setNewReplacement("");
      setSuccess("Qayda əlavə edildi.");
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Qayda əlavə edilmədi.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAlias = async (trigger: string) => {
    try {
      await api(`/api/orders/aliases/${encodeURIComponent(trigger)}`, {
        method: "DELETE",
      });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Qayda silinmədi.");
    }
  };

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code || "").toLowerCase().includes(q),
    );
  }, [products, search]);
  const stockSummary = useMemo(() => {
    const available = products.map((product) =>
      Number(product.availableQuantity ?? (Number(product.physicalQuantity ?? 0) - Number(product.reservedQuantity ?? 0))),
    );
    return {
      productCount: products.length,
      availableMeters: available.reduce((total, value) => total + value, 0),
      rollCount: products.reduce((total, product) => total + Number(product.rollCount ?? 0), 0),
      lowCount: available.filter((value) => value > 0 && value <= 100).length,
      outCount: available.filter((value) => value <= 0).length,
    };
  }, [products]);

  const filteredCustomers = useMemo(() => {
    const typeCustomers = customers.filter((customer) =>
      customerTypeFilter === "foreign" ? customer.customerType === "foreign" : customer.customerType !== "foreign",
    );
    if (!search.trim()) return typeCustomers;
    const q = search.toLowerCase();
    return typeCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.contact || "").toLowerCase().includes(q) ||
        (c.salesRepresentative || "").toLowerCase().includes(q) ||
        (c.folderName || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q),
    );
  }, [customers, search, customerTypeFilter]);

  const selectedCustomer = filteredCustomers.find((customer) => customer.id === selectedCustomerId) ?? filteredCustomers[0];

  useEffect(() => {
    if (!selectedCustomer) return;
    setCustomerPriceDraft(
      Object.fromEntries(Object.entries(selectedCustomer.priceLists?.DEPO ?? selectedCustomer.prices ?? {}).map(([code, price]) => [code, String(price)])),
    );
    setCustomerAntrepoPriceDraft(
      Object.fromEntries(Object.entries(selectedCustomer.priceLists?.ANTREPO_TRANSIT ?? {}).map(([code, price]) => [code, String(price)])),
    );
    setCustomerContactDraft(selectedCustomer.contact ?? "");
    setCustomerSalesRepresentativeDraft(selectedCustomer.salesRepresentative ?? "");
    setCustomerFolderNameDraft(selectedCustomer.folderName ?? "");
    setCustomerAddressLine1Draft(selectedCustomer.addressLine1 ?? selectedCustomer.address ?? "");
    setCustomerAddressLine2Draft(selectedCustomer.addressLine2 ?? "");
  }, [selectedCustomer]);

  const saveCustomerPrices = async () => {
    if (!selectedCustomer) return;
    setBusy(true);
    try {
      const prices = Object.fromEntries(
        Object.entries(customerPriceDraft)
          .map(([code, value]) => [code, Number(value)] as const)
          .filter(([, value]) => Number.isFinite(value) && value >= 0),
      );
      const antrepoPrices = Object.fromEntries(
        Object.entries(customerAntrepoPriceDraft)
          .map(([code, value]) => [code, Number(value)] as const)
          .filter(([, value]) => Number.isFinite(value) && value >= 0),
      );
      await api(`/api/orders/customers/${encodeURIComponent(selectedCustomer.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          prices,
          ...(selectedCustomer.customerType === "foreign"
            ? { priceLists: { DEPO: prices, ANTREPO_TRANSIT: antrepoPrices } }
            : {}),
          contact: customerContactDraft,
          salesRepresentative: customerSalesRepresentativeDraft,
          folderName: customerFolderNameDraft,
          addressLine1: customerAddressLine1Draft,
          addressLine2: customerAddressLine2Draft,
        }),
      });
      setSuccess("Müşteri bilgileri ve özel ürün fiyatları kaydedildi.");
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fiyatlar kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const filteredAliases = useMemo(() => {
    if (!search.trim()) return aliases;
    const q = search.toLowerCase();
    return aliases.filter(
      (a) =>
        a.trigger.toLowerCase().includes(q) ||
        a.replacement.toLowerCase().includes(q),
    );
  }, [aliases, search]);

  return (
    <Modal
      title={productsOnly ? "Stok ve ürünler" : ui.settings}
      subtitle={productsOnly ? "Stok miktarları, ürün kataloğu ve hareket geçmişi" : "Marka, müşteriler ve kullanıcı yetkileri"}
      onClose={onClose}
      wide
      className="settings-modal"
    >
      {!productsOnly && <div className="settings-nav">
        {settingsTabs.some((item) => item.id === "branding") && <button className={`settings-tab ${tab === "branding" ? "active" : ""}`} onClick={() => setTab("branding")}>Marka ve belge</button>}
        {settingsTabs.some((item) => item.id === "products") && <button className={`settings-tab ${tab === "products" ? "active" : ""}`} onClick={() => setTab("products")}>📦 {ui.productsTab} ({products.length})</button>}
        {settingsTabs.some((item) => item.id === "customers") && <button className={`settings-tab ${tab === "customers" ? "active" : ""}`} onClick={() => setTab("customers")}>👥 {ui.customersTab} ({customers.length})</button>}
        {settingsTabs.some((item) => item.id === "aliases") && <button className={`settings-tab ${tab === "aliases" ? "active" : ""}`} onClick={() => setTab("aliases")}>⚡ {ui.aliasesTab} ({aliases.length})</button>}
        {settingsTabs.some((item) => item.id === "users") && <button className={`settings-tab ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>Kullanıcılar ({employees.length})</button>}
        {settingsTabs.some((item) => item.id === "access") && <button className={`settings-tab ${tab === "access" ? "active" : ""}`} onClick={() => setTab("access")}>Erişim geçmişi</button>}
      </div>}

      {error && (
        <p className="form-error" style={{ marginBottom: "12px" }}>
          {error}
        </p>
      )}
      {success && (
        <p
          style={{
            color: "#10b981",
            fontSize: "13px",
            fontWeight: "bold",
            marginBottom: "12px",
          }}
        >
          ✓ {success}
        </p>
      )}

      {productsOnly && !stockEditing && (
        <section className="stock-dashboard">
          <div className="stock-dashboard-actions">
            <label className="stock-dashboard-search">
              <ScanText aria-hidden="true" />
              <input
                placeholder="Ürün kodu veya adıyla ara"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            {hasSettingPermission("products.manage") && (
              <button type="button" className="primary" onClick={() => setStockEditing(true)}>
                <Pencil aria-hidden="true" /> Stoku yönet
              </button>
            )}
          </div>

          <div className="stock-summary-grid">
            <article><span>Ürün çeşidi</span><strong>{stockSummary.productCount.toLocaleString(language)}</strong><small>Katalogdaki aktif ürünler</small></article>
            <article><span>Kullanılabilir stok</span><strong>{stockSummary.availableMeters.toLocaleString(language, { maximumFractionDigits: 2 })} mt</strong><small>Rezervler çıkarıldıktan sonra</small></article>
            <article><span>Toplam rulo</span><strong>{stockSummary.rollCount.toLocaleString(language)}</strong><small>Fiziki rulo sayısı</small></article>
            <article className={stockSummary.lowCount || stockSummary.outCount ? "attention" : ""}><span>Stok uyarısı</span><strong>{stockSummary.lowCount + stockSummary.outCount}</strong><small>{stockSummary.outCount} tükenen · {stockSummary.lowCount} kritik</small></article>
          </div>

          <div className="stock-overview-table">
            <header><div><b>Stok durumu</b><span>{filteredProducts.length} ürün gösteriliyor</span></div><span>Son veriler</span></header>
            <div className="stock-overview-head"><span>Ürün</span><span>Fiziki</span><span>Rezerv</span><span>Kullanılabilir</span><span>Rulo</span><span>Durum</span></div>
            <div className="stock-overview-body">
              {filteredProducts.map((product) => {
                const available = Number(product.availableQuantity ?? (Number(product.physicalQuantity ?? 0) - Number(product.reservedQuantity ?? 0)));
                const state = available <= 0 ? "out" : available <= 100 ? "low" : "ok";
                return (
                  <div className="stock-overview-row" key={product.id}>
                    <span><b>{product.code || product.sku || "-"}</b><small>{product.name}</small></span>
                    <strong>{Number(product.physicalQuantity ?? 0).toLocaleString(language)} mt</strong>
                    <span>{Number(product.reservedQuantity ?? 0).toLocaleString(language)} mt</span>
                    <strong>{available.toLocaleString(language)} mt</strong>
                    <span>{Number(product.rollCount ?? 0).toLocaleString(language)}</span>
                    <span className={`stock-state ${state}`}>{state === "out" ? "Tükendi" : state === "low" ? "Kritik" : "Yeterli"}</span>
                  </div>
                );
              })}
              {!filteredProducts.length && <p className="stock-overview-empty">Aramanızla eşleşen ürün bulunamadı.</p>}
            </div>
          </div>

          {orderStockMovements.length > 0 && (
            <div className="stock-recent-movements">
              <header><b>Son stok hareketleri</b><span>Son {Math.min(orderStockMovements.length, 8)} kayıt</span></header>
              {orderStockMovements.slice(0, 8).map((movement) => (
                <div key={movement.id}>
                  <span><b>{movement.productCode || "-"} · {movement.productName}</b><small>{movement.customerName} · {movement.orderNumber}</small></span>
                  <span><strong>-{movement.stockQuantity.toLocaleString(language)} mt</strong><small>{new Date(movement.createdAt).toLocaleString(language)}</small></span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "branding" && settingsTabs.some((item) => item.id === "branding") && (
        <section className="brand-settings">
          <div className="brand-settings-copy">
            <span>ŞİRKET KİMLİĞİ</span>
            <h3>Sipariş formunuzdaki marka görünümü</h3>
            <p>
              Yüklenen logo tüm sipariş onay formlarında ve A4 çıktılarında
              kullanılır.
            </p>
          </div>
          <div className="brand-logo-panel">
            <div className="brand-logo-preview">
              {brand.companyLogo ? (
                <img src={brand.companyLogo} alt="Şirket logosu" />
              ) : (
                <AriXLogo />
              )}
            </div>
            <label className="brand-upload-button">
              Logo seç
              <input
                type="file"
                accept={imageAccept}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setError("");
                  try {
                    const companyLogo = await compressDeliveryPhoto(file);
                    setBrand((current) => ({ ...current, companyLogo }));
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Logo yüklenemedi.",
                    );
                  }
                }}
              />
            </label>
            {brand.companyLogo && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setBrand((current) => ({ ...current, companyLogo: "" }))
                }
              >
                Logoyu kaldır
              </button>
            )}
          </div>
          <div className="brand-settings-fields">
            <label>
              Şirket adı
              <input
                value={brand.companyName}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    companyName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Alt başlık
              <input
                value={brand.brandSubtitle || ""}
                placeholder="Sipariş ve lojistik"
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    brandSubtitle: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Adres
              <input
                value={brand.addressLine || ""}
                onChange={(event) => setBrand((current) => ({ ...current, addressLine: event.target.value }))}
              />
            </label>
            <label>
              Telefon
              <input
                value={brand.phone || ""}
                onChange={(event) => setBrand((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>
            <label>
              E-posta
              <input
                value={brand.email || ""}
                onChange={(event) => setBrand((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label>
              İnternet sitesi
              <input
                value={brand.website || ""}
                onChange={(event) => setBrand((current) => ({ ...current, website: event.target.value }))}
              />
            </label>
            <label>
              Vergi dairesi
              <input
                value={brand.taxOffice || ""}
                onChange={(event) => setBrand((current) => ({ ...current, taxOffice: event.target.value }))}
              />
            </label>
            <label>
              VKN / TCKN
              <input
                value={brand.taxNumber || ""}
                onChange={(event) => setBrand((current) => ({ ...current, taxNumber: event.target.value }))}
              />
            </label>
          </div>
          <button
            type="button"
            className="primary brand-save-button"
            disabled={busy || !brand.companyName.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await api<{
                  printSettings: CompanyPrintSettings;
                }>("/api/company-settings", {
                  method: "PATCH",
                  body: JSON.stringify({ printSettings: brand }),
                });
                setBrand(result.printSettings);
                onPrintSettingsChange(result.printSettings);
                setSuccess("Marka ayarları kaydedildi.");
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Ayarlar kaydedilemedi.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Marka ayarlarını kaydet
          </button>
        </section>
      )}

      {/* TAB 1: PRODUCTS */}
      {tab === "products" && settingsTabs.some((item) => item.id === "products") && (!productsOnly || stockEditing) && (
        <div>
          {productsOnly && (
            <button type="button" className="stock-back-button" onClick={() => setStockEditing(false)}>
              <ArrowLeft aria-hidden="true" /> Stok özetine dön
            </button>
          )}
          <div
            style={{
              display: "flex",
              gap: "10px",
              marginBottom: "14px",
              alignItems: "center",
            }}
          >
            <input
              className="settings-search"
              placeholder={ui.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="secondary"
              style={{
                padding: "8px 14px",
                fontSize: "12px",
                whiteSpace: "nowrap",
              }}
              onClick={() => setBulkMode(!bulkMode)}
            >
              {bulkMode ? "Tek ürün ekle" : "📄 Toplu ürün ekle"}
            </button>
            <label
              className={`stock-import-button ${stockImporting ? "is-busy" : ""}`}
            >
              {stockImporting ? "Yükleniyor…" : "Excel'den stok güncelle"}
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={stockImporting}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importStockExcel(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          {stockImportHistory.length > 0 && (
            <div className="stock-import-history">
              <header><b>Stok güncelleme geçmişi</b><span>Kaynak evraklar arşivlenir</span></header>
              {stockImportHistory.slice(0, 5).map((entry) => (
                <div key={entry.id}>
                  <span><b>{entry.sourceName}</b><small>Sayım tarihi: {new Date(`${entry.sourceDate}T00:00:00`).toLocaleDateString("tr-TR")}</small></span>
                  <span><b>{entry.updated} ürün</b><small>{entry.created} yeni · {entry.importedBy} · {new Date(entry.importedAt).toLocaleString("tr-TR")}</small></span>
                </div>
              ))}
            </div>
          )}

          {orderStockMovements.length > 0 && (
            <details className="stock-movement-history">
              <summary>Stok kullanım geçmişi <span>{orderStockMovements.length} hareket</span></summary>
              <div className="stock-movement-table">
                <div className="stock-movement-head"><span>Ürün / Sipariş</span><span>Müşteri</span><span>Giden</span><span>Kesim payı</span><span>Stok çıkışı</span></div>
                {orderStockMovements.slice(0, 100).map((movement) => (
                  <div key={movement.id}>
                    <span><b>{movement.productCode} · {movement.productName}</b><small>{movement.orderNumber} · {new Date(movement.createdAt).toLocaleString("tr-TR")}</small></span>
                    <span><b>{movement.customerName}</b><small>{movement.createdBy}</small></span>
                    <strong>{movement.customerQuantity.toLocaleString("tr-TR")} mt</strong>
                    <strong>{movement.cutAllowanceQuantity.toLocaleString("tr-TR")} mt <small>{movement.cutPieceCount ? `${movement.cutPieceCount} parça` : "tam rulo"}</small></strong>
                    <strong>{movement.stockQuantity.toLocaleString("tr-TR")} mt</strong>
                  </div>
                ))}
              </div>
            </details>
          )}

          {bulkMode ? (
            <div
              style={{
                marginBottom: "16px",
                padding: "14px",
                background: "rgba(99,102,241,0.06)",
                borderRadius: "12px",
              }}
            >
              <p
                style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 600 }}
              >
                Toplu Məhsul Siyahısı Yapışdırın:
              </p>
              <textarea
                rows={5}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  "HG Beyaz - ERSA 200\nSoft Touch Gri - ERSA 502\nFolyolu Metalik Sedef - ERSA 600"
                }
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontFamily: "monospace",
                }}
              />
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button
                  className="primary"
                  disabled={busy || !bulkText.trim()}
                  onClick={handleBulkAddProducts}
                >
                  Toplu Əlavə Et
                </button>
                <button
                  className="secondary"
                  onClick={() => setBulkMode(false)}
                >
                  Ləğv et
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleAddProduct}
              style={{
                display: "flex",
                gap: "10px",
                marginBottom: "16px",
                flexWrap: "wrap",
              }}
            >
              <input
                required
                style={{
                  flex: 2,
                  minWidth: "160px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                }}
                placeholder={ui.productName}
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
              />
              <input
                style={{
                  flex: 1,
                  minWidth: "120px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                }}
                placeholder={ui.code}
                value={newProductCode}
                onChange={(e) => setNewProductCode(e.target.value)}
              />
              <button
                className="primary"
                disabled={busy || !newProductName.trim()}
                style={{ padding: "8px 16px", whiteSpace: "nowrap" }}
              >
                ＋ {ui.addProduct}
              </button>
            </form>
          )}

          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>{ui.code}</th>
                  <th>{ui.productName}</th>
                  <th>Fiziki mt</th>
                  <th>Rezerv</th>
                  <th>Kullanılabilir</th>
                  <th>Rulo</th>
                  <th style={{ width: "70px", textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b style={{ color: "#4f46e5" }}>
                        {p.code || p.sku || "-"}
                      </b>
                    </td>
                    <td>{p.name}</td>
                    <td>
                      <input
                        className="stock-cell-input"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={p.physicalQuantity ?? 0}
                        onBlur={(event) =>
                          void handleStockChange(
                            p,
                            Number(event.target.value),
                            Number(p.rollCount ?? 0),
                          )
                        }
                      />
                    </td>
                    <td>
                      {Number(p.reservedQuantity ?? 0).toLocaleString(language)}{" "}
                      mt
                    </td>
                    <td>
                      <b
                        className={
                          Number(p.availableQuantity ?? 0) < 0
                            ? "stock-negative"
                            : ""
                        }
                      >
                        {Number(p.availableQuantity ?? 0).toLocaleString(
                          language,
                        )}{" "}
                        mt
                      </b>
                    </td>
                    <td>
                      <input
                        className="stock-cell-input rolls"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={p.rollCount ?? 0}
                        onBlur={(event) =>
                          void handleStockChange(
                            p,
                            Number(p.physicalQuantity ?? 0),
                            Number(event.target.value),
                          )
                        }
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(p.id)}
                        style={{
                          border: "none",
                          background: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                        title={ui.delete}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "access" && settingsTabs.some((item) => item.id === "access") && (
        <section className="access-history">
          <header>
            <div><span>GÜVENLİK VE ERİŞİM</span><h3>Order AriX erişim geçmişi</h3><p>Sayfayı açanlar, görüntülenen bölümler ve siparişler</p></div>
            <button type="button" className="secondary" onClick={() => { setAccessLogsLoading(true); void api<AccessLog[]>("/api/orders/access-logs").then(setAccessLogs).finally(() => setAccessLogsLoading(false)); }}>Yenile</button>
          </header>
          <div className="access-history-filters">
            <label><span>Kullanıcı</span><select value={accessUserFilter} onChange={(event) => setAccessUserFilter(event.target.value)}><option value="">Tüm kullanıcılar</option>{Array.from(new Map(accessLogs.map((entry) => [entry.userId, entry.userName])).entries()).sort((a, b) => a[1].localeCompare(b[1], "tr")).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label><span>İşlem</span><select value={accessActionFilter} onChange={(event) => setAccessActionFilter(event.target.value)}><option value="">Tüm işlemler</option><option value="app_open">Uygulamayı açtı</option><option value="page_view">Sayfayı görüntüledi</option><option value="order_view">Siparişi görüntüledi</option></select></label>
            <label><span>Bölüm</span><select value={accessPageFilter} onChange={(event) => setAccessPageFilter(event.target.value)}><option value="">Tüm bölümler</option><option value="board">Aktif siparişler</option><option value="forms">Sipariş formları</option><option value="days">Günlük raporlar</option><option value="stock">Stok</option></select></label>
            <label><span>Başlangıç</span><input type="date" value={accessDateFrom} onChange={(event) => setAccessDateFrom(event.target.value)} /></label>
            <label><span>Bitiş</span><input type="date" value={accessDateTo} onChange={(event) => setAccessDateTo(event.target.value)} /></label>
            <button type="button" className="secondary" disabled={!accessUserFilter && !accessActionFilter && !accessPageFilter && !accessDateFrom && !accessDateTo} onClick={() => { setAccessUserFilter(""); setAccessActionFilter(""); setAccessPageFilter(""); setAccessDateFrom(""); setAccessDateTo(""); }}>Temizle</button>
            <small>{filteredAccessLogs.length} / {accessLogs.length} kayıt</small>
          </div>
          <div className="access-history-head"><span>Kullanıcı</span><span>İşlem</span><span>Sayfa / sipariş</span><span>Cihaz</span><span>IP</span><span>Tarih</span></div>
          <div className="access-history-list">
            {filteredAccessLogs.map((entry) => {
              const device = /iphone|ipad/i.test(entry.userAgent) ? "iPhone / iPad" : /android/i.test(entry.userAgent) ? "Android" : /windows/i.test(entry.userAgent) ? "Windows" : /macintosh|mac os/i.test(entry.userAgent) ? "Mac" : "Diğer cihaz";
              const browser = /edg\//i.test(entry.userAgent) ? "Edge" : /chrome\//i.test(entry.userAgent) ? "Chrome" : /safari\//i.test(entry.userAgent) ? "Safari" : "Tarayıcı";
              const pageLabel: Record<string, string> = { board: "Aktif siparişler", forms: "Sipariş formları", days: "Günlük raporlar", stock: "Stok" };
              return <div key={entry.id}>
                <span><b>{entry.userName}</b><small>{entry.role}</small></span>
                <span className={`access-action ${entry.action}`}>{entry.action === "app_open" ? "Uygulamayı açtı" : entry.action === "order_view" ? "Siparişi görüntüledi" : "Sayfayı görüntüledi"}</span>
                <span><b>{entry.orderNumber || pageLabel[entry.page] || entry.page || "-"}</b><small>{entry.orderId || ""}</small></span>
                <span><b>{device}</b><small>{browser}</small></span>
                <span>{entry.ip || "-"}</span>
                <time>{new Date(entry.createdAt).toLocaleString("tr-TR")}</time>
              </div>;
            })}
            {!accessLogsLoading && !filteredAccessLogs.length && <p className="stock-overview-empty">Filtreye uygun erişim kaydı bulunamadı.</p>}
            {accessLogsLoading && <div className="orders-loading-state"><span />Erişim kayıtları yükleniyor…</div>}
          </div>
        </section>
      )}

      {tab === "users" && settingsTabs.some((item) => item.id === "users") && (
        <div className="order-users-list">
          <section className="notification-control-panel">
            <div>
              <b>Bildirim gönderimi</b>
              <span>{notificationsPaused ? "Yeni uygulama içi, cihaz ve gün sonu bildirimleri geçici olarak duraklatıldı." : "Yeni sistem bildirimleri aktif olarak gönderiliyor."}</span>
            </div>
            <button
              type="button"
              className={notificationsPaused ? "primary-button" : "secondary-button"}
              disabled={notificationControlBusy}
              onClick={() => void setNotificationPause(!notificationsPaused)}
            >
              {notificationControlBusy ? "Kaydediliyor…" : notificationsPaused ? "Bildirimleri yeniden aç" : "Tüm bildirimleri duraklat"}
            </button>
          </section>
          <section className="broadcast-notification-panel">
            <div>
              <b>Toplu bildirim</b>
              <span>Tüm aktif kullanıcılara uygulama içi ve cihaz bildirimi gönderin.</span>
            </div>
            <input value={broadcastTitle} maxLength={100} onChange={(event) => setBroadcastTitle(event.target.value)} placeholder="Duyuru başlığı" />
            <textarea value={broadcastMessage} maxLength={500} onChange={(event) => setBroadcastMessage(event.target.value)} placeholder="Duyuru mesajı" rows={2} />
            <div className="broadcast-notification-actions">
              <button type="button" className="secondary-button" disabled={broadcastSending} onClick={() => void sendBroadcastNotification(true)}>Herkese test gönder</button>
              <button type="button" className="primary-button" disabled={broadcastSending || !broadcastTitle.trim() || !broadcastMessage.trim()} onClick={() => void sendBroadcastNotification(false)}>Duyuruyu gönder</button>
            </div>
          </section>
          <section className="notification-history-panel">
            <header>
              <div><b>Bildirim geçmişi</b><span>Aynı anda aynı içerikle gönderilen bildirimler tek kayıt altında birleştirilir.</span></div>
              <button type="button" className="secondary-button" disabled={notificationHistoryLoading} onClick={() => void loadNotificationHistory()}>{notificationHistoryLoading ? "Yükleniyor…" : "Yenile"}</button>
            </header>
            <div className="notification-history-list">
              {notificationHistory.length ? notificationHistory.map((entry) => (
                <div className="notification-history-item" key={entry.id}>
                  <div className="notification-history-main">
                    <b>{entry.title}</b>
                    <span>{entry.message}</span>
                    <small>{new Date(entry.createdAt).toLocaleString("tr-TR")} · Gönderen: {entry.createdBy}</small>
                  </div>
                  <div className="notification-history-recipients">
                    <b>{entry.recipients.length} alıcı</b>
                    <span>{(Array.isArray(entry.recipients) ? entry.recipients : []).join(", ") || "Alıcı bilgisi yok"}</span>
                    <small>{entry.readCount}/{entry.recipients.length} okundu</small>
                  </div>
                </div>
              )) : <div className="notification-history-empty">{notificationHistoryLoading ? "Bildirim geçmişi yükleniyor…" : "Henüz bildirim geçmişi yok."}</div>}
            </div>
          </section>
          <div className="order-users-hint">
            Rol temel yetkileri belirler. Her kullanıcının erişimini “İzinleri yönet” bölümünden ayrıca düzenleyebilirsiniz.
          </div>
          {employees.map((employee) => (
            <article key={employee.id}>
              <div className="order-user-identity">
                <b>{employee.name}</b>
                <span>{employee.email}</span>
                <small className={employee.pushDeviceCount ? "push-device-status active" : "push-device-status missing"}>
                  {employee.pushDeviceCount
                    ? `${employee.pushDeviceCount} bildirim cihazı kayıtlı`
                    : "Bildirim cihazı kayıtlı değil"}
                </small>
              </div>
              <select
                value={employee.role}
                onChange={(event) =>
                  void updateEmployeeRole(employee, {
                    role: event.target.value,
                    permissions:
                      roleDefaults[event.target.value.trim().toLocaleLowerCase("az")] ?? [],
                  })
                }
              >
                <option value="Əməkdaş">Çalışan</option>
                <option value="Rəhbər">Yönetici</option>
                <option value="Satış rəhbəri">Satış yöneticisi</option>
                <option value="Satış">Satış temsilcisi</option>
                <option value="Anbar əməliyyatları">Depo görevlisi</option>
                <option value="Təhvilat">Teslimat görevlisi</option>
                <option value="Maliyyə">Finans</option>
                <option value="Sahib">Şirket sahibi</option>
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={employee.active}
                  onChange={(event) =>
                    void updateEmployeeRole(employee, {
                      active: event.target.checked,
                    })
                  }
                />{" "}
                Aktiv
              </label>
              <button
                type="button"
                className="permission-toggle"
                onClick={() => setExpandedEmployeeId((current) => current === employee.id ? "" : employee.id)}
                aria-expanded={expandedEmployeeId === employee.id}
              >
                {expandedEmployeeId === employee.id ? "İzinleri kapat" : "İzinleri yönet"}
              </button>
              {expandedEmployeeId === employee.id && <div className="order-user-permissions">
                {[...new Set(permissionCatalog.map((permission) => permission.group))].map((group) => (
                  <section className="order-permission-group" key={group}>
                    <header>
                      <b>{permissionGroupLabels[group] ?? group}</b>
                      <button
                        type="button"
                        disabled={employee.role.toLocaleLowerCase("az") === "sahib"}
                        onClick={() => {
                          const keys = permissionCatalog.filter((permission) => permission.group === group).map((permission) => permission.key);
                          const current = employee.permissions ?? [];
                          const allChecked = keys.every((key) => current.includes(key));
                          const permissions = allChecked
                            ? current.filter((key) => !keys.includes(key))
                            : [...new Set([...current, ...keys])];
                          void updateEmployeeRole(employee, { permissions });
                        }}
                      >
                        Tümünü seç
                      </button>
                    </header>
                    <div>
                      {permissionCatalog.filter((permission) => permission.group === group).map((permission) => {
                        const checked = employee.role.toLocaleLowerCase("az") === "sahib" || Boolean(employee.permissions?.includes(permission.key));
                        return (
                          <label key={permission.key}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={employee.role.toLocaleLowerCase("az") === "sahib"}
                              onChange={(event) => {
                                const current = employee.permissions ?? [];
                                const permissions = event.target.checked
                                  ? [...new Set([...current, permission.key])]
                                  : current.filter((key) => key !== permission.key);
                                void updateEmployeeRole(employee, { permissions });
                              }}
                            />
                            <span>{permissionLabels[permission.key] ?? permission.key}</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <section className="order-permission-group notification-preferences">
                  <header><b>İzin verilen bildirim türleri</b></header>
                  <div>
                    {notificationEventOptions.map(([key, label]) => (
                      <label key={key}>
                        <input type="checkbox" checked={employee.notificationPermissions?.events?.[key] !== false} onChange={(event) => void updateEmployeeRole(employee, { notificationPermissions: { events: { ...(employee.notificationPermissions?.events ?? {}), [key]: event.target.checked } } })} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </section>
              </div>}
            </article>
          ))}
        </div>
      )}

      {/* TAB 2: CUSTOMERS */}
      {tab === "customers" && settingsTabs.some((item) => item.id === "customers") && (
        <div className="customer-manager">
          <div className="customer-manager-toolbar">
            <input
              className="settings-search"
              placeholder={ui.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="customer-excel-import">
              <span>{customerImportFileName || "Excel dosyası seç"}</span>
              <input
                ref={customerImportInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                disabled={customerImporting}
                onChange={(event) => setCustomerImportFileName(event.currentTarget.files?.[0]?.name ?? "")}
              />
            </label>
            <button
              type="button"
              className="primary"
              disabled={customerImporting || !customerImportFileName}
              onClick={async () => {
                const input = customerImportInputRef.current;
                const file = input?.files?.[0];
                if (!file) return;
                await importCustomersAndPrices(file);
                input.value = "";
                setCustomerImportFileName("");
              }}
            >
              {customerImporting ? "Aktarılıyor…" : "Seçilen Excel'i aktar"}
            </button>
          </div>

          <form onSubmit={handleAddCustomer} className="customer-create-form">
            <input
              list="new-customer-sales-representatives"
              placeholder="Satış temsilcisi"
              value={newCustomerSalesRepresentative}
              onChange={(e) => setNewCustomerSalesRepresentative(e.target.value)}
            />
            <datalist id="new-customer-sales-representatives"><option value="Serkan Şeremet" /><option value="Mustafa Yazman" /><option value="Ekrem Tiryaki" /></datalist>
            <input
              placeholder="Klasör adı"
              value={newCustomerFolderName}
              onChange={(e) => setNewCustomerFolderName(e.target.value)}
            />
            <input
              required
              placeholder="Müşteri adı"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
            />
            <input
              placeholder="Şirket temsilcisi"
              value={newCustomerContact}
              onChange={(e) => setNewCustomerContact(e.target.value)}
            />
            <input
              placeholder="Adres 1"
              value={newCustomerAddressLine1}
              onChange={(e) => setNewCustomerAddressLine1(e.target.value)}
            />
            <input
              placeholder="Adres 2"
              value={newCustomerAddressLine2}
              onChange={(e) => setNewCustomerAddressLine2(e.target.value)}
            />
            <input placeholder={ui.phone} value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
            <input placeholder={ui.note} value={newCustomerNote} onChange={(e) => setNewCustomerNote(e.target.value)} />
            <button
              className="primary"
              disabled={busy || !newCustomerName.trim()}
            >
              ＋ {ui.addCustomer}
            </button>
          </form>

          <div className="customer-manager-grid">
            <section className="customer-list-panel">
              <header><b>Müşteriler</b><span>{filteredCustomers.length}</span></header>
              <div className="customer-type-tabs" role="tablist" aria-label="Müşteri türü">
                <button type="button" role="tab" aria-selected={customerTypeFilter === "domestic"} className={customerTypeFilter === "domestic" ? "active" : ""} onClick={() => setCustomerTypeFilter("domestic")}>Yurtiçi</button>
                <button type="button" role="tab" aria-selected={customerTypeFilter === "foreign"} className={customerTypeFilter === "foreign" ? "active" : ""} onClick={() => setCustomerTypeFilter("foreign")}>Yurtdışı</button>
              </div>
              <div className="customer-list">
                {filteredCustomers.map((customer) => (
                  <button
                    type="button"
                    key={customer.id}
                    className={selectedCustomer?.id === customer.id ? "active" : ""}
                    onClick={() => setSelectedCustomerId(customer.id)}
                  >
                    <span><b>{customer.name}</b><small>{[customer.salesRepresentative, customer.contact].filter(Boolean).join(" · ") || customer.phone || customer.address || "Bilgi eklenmedi"}</small></span>
                    <em>{Object.keys(customer.prices ?? {}).length} fiyat</em>
                  </button>
                ))}
              </div>
            </section>

            <section className="customer-price-panel">
              {selectedCustomer ? (
                <>
                  <header>
                    <span><small>MÜŞTERİ FİYAT KARTI</small><b>{selectedCustomer.name}</b><em>{selectedCustomer.address || "Adres bilgisi yok"}</em></span>
                    {!selectedCustomer.id.startsWith("cp-") && (
                      <button type="button" className="danger-quiet" onClick={() => void handleDeleteCustomer(selectedCustomer.id)}>Sil</button>
                    )}
                  </header>
                  <label className="customer-contact-field">
                    <span>Satış temsilcisi</span>
                    <input
                      list="customer-sales-representatives"
                      value={customerSalesRepresentativeDraft}
                      placeholder="Örn. Serkan Şeremet"
                      onChange={(event) => setCustomerSalesRepresentativeDraft(event.target.value)}
                    />
                    <datalist id="customer-sales-representatives"><option value="Serkan Şeremet" /><option value="Mustafa Yazman" /><option value="Ekrem Tiryaki" /></datalist>
                  </label>
                  <div className="customer-detail-fields">
                    <label><span>Klasör adı</span><input value={customerFolderNameDraft} onChange={(event) => setCustomerFolderNameDraft(event.target.value)} /></label>
                    <label><span>Şirket temsilcisi</span><input value={customerContactDraft} onChange={(event) => setCustomerContactDraft(event.target.value)} /></label>
                    <label><span>Adres 1</span><input value={customerAddressLine1Draft} onChange={(event) => setCustomerAddressLine1Draft(event.target.value)} /></label>
                    <label><span>Adres 2</span><input value={customerAddressLine2Draft} onChange={(event) => setCustomerAddressLine2Draft(event.target.value)} /></label>
                  </div>
                  <div className={selectedCustomer.customerType === "foreign" ? "customer-price-dual" : ""}>
                    {([{
                      title: selectedCustomer.customerType === "foreign" ? "Depo fiyatı" : "Müşteri fiyatı",
                      draft: customerPriceDraft,
                      setDraft: setCustomerPriceDraft,
                    }, ...(selectedCustomer.customerType === "foreign" ? [{
                      title: "Antrepo / Transit fiyatı",
                      draft: customerAntrepoPriceDraft,
                      setDraft: setCustomerAntrepoPriceDraft,
                    }] : [])]).map((priceList) => (
                      <section className="customer-price-column" key={priceList.title}>
                        <div className="customer-price-head"><span>{priceList.title}</span><span>USD / m²</span></div>
                        <div className="customer-price-list">
                          {products.map((product) => {
                            const code = (product.code || product.sku || String(product.id)).toLocaleUpperCase("tr");
                            return (
                              <label key={product.id}>
                                <span><b>{product.name}</b><small>{code}</small></span>
                                <input type="number" min="0" step="0.01" placeholder="—"
                                  value={priceList.draft[code] ?? ""}
                                  onChange={(event) => priceList.setDraft((current) => ({ ...current, [code]: event.target.value }))}
                                />
                              </label>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                  <footer><button type="button" className="primary" disabled={busy} onClick={() => void saveCustomerPrices()}>Bilgileri ve fiyatları kaydet</button></footer>
                </>
              ) : <div className="customer-empty">Müşteri seçin veya Excel'den aktarın.</div>}
            </section>
          </div>
        </div>
      )}

      {/* TAB 3: ALIASES & TEST MATCHING */}
      {tab === "aliases" && settingsTabs.some((item) => item.id === "aliases") && (
        <div>
          <form
            onSubmit={handleAddAlias}
            style={{
              display: "flex",
              gap: "10px",
              marginBottom: "16px",
              flexWrap: "wrap",
            }}
          >
            <input
              required
              style={{
                flex: 1,
                minWidth: "140px",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
              }}
              placeholder={ui.aliasTrigger}
              value={newTrigger}
              onChange={(e) => setNewTrigger(e.target.value)}
            />
            <input
              required
              style={{
                flex: 2,
                minWidth: "180px",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
              }}
              placeholder={ui.aliasReplacement}
              value={newReplacement}
              onChange={(e) => setNewReplacement(e.target.value)}
            />
            <button
              className="primary"
              disabled={busy || !newTrigger.trim() || !newReplacement.trim()}
              style={{ padding: "8px 16px", whiteSpace: "nowrap" }}
            >
              ＋ {ui.addAlias}
            </button>
          </form>

          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Yazılan Qısaltma / Söz</th>
                  <th></th>
                  <th>Eşləşəcək Tam İfadə</th>
                  <th style={{ width: "70px", textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredAliases.map((a, i) => (
                  <tr key={`${a.trigger}-${i}`}>
                    <td>
                      <span className="alias-tag">
                        {a.trigger.toUpperCase()}
                      </span>
                    </td>
                    <td className="alias-arrow">➔</td>
                    <td>
                      <b>{a.replacement}</b>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {a.category !== "abbrev" && a.category !== "synonym" && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAlias(a.trigger)}
                          style={{
                            border: "none",
                            background: "none",
                            color: "#ef4444",
                            cursor: "pointer",
                            fontSize: "14px",
                          }}
                          title={ui.delete}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* LIVE TEST BOX */}
          <div className="test-box">
            <h4
              style={{
                margin: "0 0 8px",
                fontSize: "14px",
                fontWeight: "bold",
              }}
            >
              ⚡ {ui.testMatch}
            </h4>
            <p
              style={{ margin: "0 0 10px", fontSize: "12px", color: "#64748b" }}
            >
              Müştərinin WhatsApp-da yazdığı qeyri-rəsmi mətni daxil edin və
              sistemin necə başa düşdüyünü yoxlayın:
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                }}
                value={testLine}
                onChange={(e) => setTestLine(e.target.value)}
                placeholder={ui.testPlaceholder}
              />
              <button type="button" className="primary" onClick={runTestMatch}>
                Yoxla
              </button>
            </div>

            {testResult && testResult.length > 0 && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  borderRadius: "10px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                }}
              >
                {testResult.map((res, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <small style={{ color: "#64748b", display: "block" }}>
                        Giriş: “{res.source}”
                      </small>
                      <strong
                        style={{
                          fontSize: "14px",
                          color: res.productId ? "#4f46e5" : "#ef4444",
                        }}
                      >
                        {res.productName}{" "}
                        {res.productCode ? `(${res.productCode})` : ""}
                      </strong>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          fontWeight: "bold",
                          fontSize: "14px",
                          marginRight: "12px",
                        }}
                      >
                        {res.quantity
                          ? `${res.quantity} mt`
                          : "Metraj tapılmadı"}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "bold",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          background:
                            res.confidence >= 0.85 ? "#dcfce7" : "#fef3c7",
                          color: res.confidence >= 0.85 ? "#166534" : "#92400e",
                        }}
                      >
                        %{Math.round(res.confidence * 100)} dəqiqlik
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function OrderDetail({
  order,
  allOrders,
  products,
  customers,
  printSettings,
  isOwner,
  session,
  workflowRole,
  onClose,
  onChanged,
  onShowApprovalPdf,
  onDeleted,
  language,
}: {
  order: Order;
  allOrders: Order[];
  products: Product[];
  customers: Customer[];
  printSettings: CompanyPrintSettings;
  isOwner: boolean;
  session: Session;
  workflowRole: WorkflowRole;
  onClose: () => void;
  onChanged: (order: Order) => void;
  onShowApprovalPdf: (order: Order) => void;
  onDeleted: () => void;
  language: Language;
}) {
  const ui = copy[language];
  const workDraftKey = `arix-order-work:${session.id}:${order.id}`;
  const prepareItems = (source: Order) => source.items.map((item) => {
    if (source.status !== "preparing") return item;
    const preparedQuantity = Number(item.preparedQuantity) > 0
      ? Number(item.preparedQuantity)
      : Number(item.quantity) || 0;
    return {
      ...item,
      preparedQuantity,
      preparedRollCount: Math.max(0, Number(item.preparedRollCount) || 0),
      ...requiredCutAllowancePatch(item, preparedQuantity),
    };
  });
  const savedWork = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(workDraftKey) || "{}") as { items?: OrderItem[]; deliveryNote?: string; despatchNumber?: string; withoutDespatch?: boolean };
    } catch {
      return {};
    }
  }, [workDraftKey]);
  const [items, setItems] = useState(() => order.status === "preparing" && Array.isArray(savedWork.items)
    ? savedWork.items
    : prepareItems(order));
  const [customerName, setCustomerName] = useState(order.customerName);
  const [note, setNote] = useState(order.note ?? "");
  const [editReason, setEditReason] = useState("");
  const [removedItems, setRemovedItems] = useState<Array<{ productId?: number; productCode?: string; productName: string; reason: string }>>([]);
  const [rollbackTarget, setRollbackTarget] = useState<Status | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [preparationEditing, setPreparationEditing] = useState(false);
  const [correctingPrepared, setCorrectingPrepared] = useState(false);
  const [preparedCorrectionReason, setPreparedCorrectionReason] = useState("");
  const [activeEditors, setActiveEditors] = useState(order.activeEditors ?? []);
  const draftTimers = useRef<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [attachmentUploadStatus, setAttachmentUploadStatus] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deliveryNote, setDeliveryNote] = useState(savedWork.deliveryNote ?? order.deliveryNote ?? "");
  const [deliverySelection, setDeliverySelection] = useState(() => order.items.map((item) => ({
    selected: true,
    quantity: Number(item.preparedQuantity ?? item.quantity) || 0,
    rollCount: Math.max(0, Math.trunc(Number(item.preparedRollCount ?? item.orderedRollCount) || 0)),
  })));
  const [deliveryPhoto, setDeliveryPhoto] = useState(order.deliveryPhoto ?? "");
  const [despatchNumber, setDespatchNumber] = useState(
    savedWork.despatchNumber ?? order.despatchNumber ?? "",
  );
  const [withoutDespatch, setWithoutDespatch] = useState(
    savedWork.withoutDespatch ?? order.withoutDespatch ?? false,
  );
  const [despatchScope, setDespatchScope] = useState<"full" | "partial">(
    order.despatchScope ?? "full",
  );
  const [expandedProductKey, setExpandedProductKey] = useState("");
  const [previewAttachment, setPreviewAttachment] =
    useState<OrderAttachment | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"documents" | "packing">("documents");
  const preserveRestoredWork = useRef(Boolean(savedWork.items?.length || savedWork.deliveryNote || savedWork.despatchNumber || savedWork.withoutDespatch));
  const canPrepare = workflowRole === "owner" || workflowRole === "warehouse" || Boolean(session.permissions?.includes("orders.prepare"));
  const canRollback = workflowRole === "owner" || Boolean(session.permissions?.includes("orders.rollback"));
  const canSell = workflowRole === "owner" || Boolean(session.permissions?.includes("orders.create")) || Boolean(session.permissions?.includes("order_forms.edit"));
  const canDeliver =
    workflowRole === "owner" || Boolean(session.permissions?.includes("orders.deliver"));
  const canDeliverWithoutProof =
    workflowRole === "owner" || Boolean(session.permissions?.includes("orders.deliver_without_proof"));
  const deliveryProofFiles = (order.attachments || []).filter(
    (attachment) => attachment.kind === "deliveryProof" && !attachment.deletedAt,
  );
  const hasDeliveryProof = Boolean(deliveryPhoto || deliveryProofFiles.length);
  const canManageDocuments =
    workflowRole === "owner" ||
    Boolean(session.permissions?.includes("documents.create")) ||
    Boolean(session.permissions?.includes("documents.edit"));
  const canManageDespatch =
    workflowRole === "owner" || Boolean(session.permissions?.includes("orders.despatch"));
  const canViewAudit = workflowRole === "owner" || Boolean(session.permissions?.includes("orders.audit.view"));
  const canEditOrder = workflowRole === "owner" || Boolean(session.permissions?.includes("orders.edit"));
  const ownsOrder = order.createdByUserId ? order.createdByUserId === session.id : order.createdBy === session.name;
  const canDeleteOrder = workflowRole === "owner" || Boolean(session.permissions?.includes("orders.delete")) || ownsOrder;
  const canLockOrder = workflowRole === "owner" || Boolean(session.permissions?.includes("orders.lock"));
  const toggleOrderLock = async () => {
    const locking = !order.lockedAt;
    const reason = locking ? window.prompt("Kilitleme nedenini yazın (isteğe bağlı):", "Değişiklik bekleniyor") : "";
    if (locking && reason === null) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Order>(`/api/orders/${order.id}/lock`, { method: "PATCH", body: JSON.stringify({ locked: locking, reason }) });
      onChanged(next);
      setNotice(locking ? "Sipariş kilitlendi." : "Sipariş kilidi açıldı.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kilit durumu değiştirilemedi.");
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!["preparing", "ready"].includes(order.status)) {
      localStorage.removeItem(workDraftKey);
      return;
    }
    localStorage.setItem(workDraftKey, JSON.stringify({
      ...(order.status === "preparing" ? { items } : {}),
      deliveryNote,
      despatchNumber,
      withoutDespatch,
    }));
  }, [workDraftKey, order.status, items, deliveryNote, despatchNumber, withoutDespatch]);

  useEffect(() => {
    if (!["ready", "delivered"].includes(order.status) || correctingPrepared) return;
    setItems(order.items.map((item) => ({ ...item })));
  }, [order, correctingPrepared]);
  const beginActivity = (type: "order_editing_started" | "approval_form_preparing_started" | "approval_form_editing_started") => {
    void api(`/api/orders/${order.id}/activity`, { method: "POST", body: JSON.stringify({ type }) }).catch(() => undefined);
  };
  const rootOrder = useMemo(() => {
    if (!order.parentOrderId) return order;
    return (
      allOrders.find((candidate) => candidate.id === order.parentOrderId) ??
      order
    );
  }, [allOrders, order]);
  const relatedBatches = useMemo(
    () =>
      allOrders
        .filter((candidate) => candidate.parentOrderId === rootOrder.id)
        .sort((left, right) =>
          String(left.createdAt).localeCompare(String(right.createdAt)),
        ),
    [allOrders, rootOrder.id],
  );
  const preparedParts = relatedBatches.length
    ? [
        ...relatedBatches,
        ...(["ready", "delivered"].includes(rootOrder.status)
          ? [rootOrder]
          : []),
      ]
    : [rootOrder];
  const requestedItems = useMemo(
    () =>
      Array.isArray(rootOrder.originalItems) && rootOrder.originalItems.length
        ? rootOrder.originalItems
        : safeItems(rootOrder),
    [rootOrder],
  );
  const preparedTotals = useMemo(() => {
    const totals = new Map<string, { quantity: number; rolls: number }>();
    const itemKey = (item: Match) =>
      item.productId
        ? `id:${item.productId}`
        : `code:${String(item.productCode || item.productName || "").trim().toLocaleLowerCase()}`;

    for (const batch of preparedParts) {
      if (!["ready", "delivered"].includes(batch.status)) continue;
      for (const item of safeItems(batch)) {
        const key = itemKey(item);
        const current = totals.get(key) ?? { quantity: 0, rolls: 0 };
        current.quantity += Math.max(
          0,
          Number(item.preparedQuantity ?? item.quantity) || 0,
        );
        current.rolls += Math.max(0, Number(item.preparedRollCount) || 0);
        totals.set(key, current);
      }
    }
    return totals;
  }, [preparedParts]);
  const unpreparedItems = useMemo(() => {
    return requestedItems
      .map((item) => {
        const key = item.productId
          ? `id:${item.productId}`
          : `code:${String(item.productCode || item.productName || "").trim().toLocaleLowerCase()}`;
        const prepared = preparedTotals.get(key) ?? { quantity: 0, rolls: 0 };
        return {
          ...item,
          quantity: Math.max(0, (Number(item.quantity) || 0) - prepared.quantity),
          orderedRollCount: Math.max(
            0,
            (Number(item.orderedRollCount) || 0) - prepared.rolls,
          ),
        };
      })
      .filter(
        (item) =>
          Number(item.quantity) > 0.000001 || Number(item.orderedRollCount) > 0,
      );
  }, [preparedTotals, requestedItems]);
  const traceAudits = useMemo(
    () =>
      [rootOrder, ...relatedBatches]
        .flatMap((candidate) =>
          (candidate.audit ?? []).map((entry) => ({
            ...entry,
            orderNumber: candidate.number,
          })),
        )
        .sort((left, right) => String(left.at).localeCompare(String(right.at))),
    [relatedBatches, rootOrder],
  );

  useEffect(() => {
    const keepLocalWork = preserveRestoredWork.current;
    preserveRestoredWork.current = false;
    if (!keepLocalWork) setItems(prepareItems(order));
    setCustomerName(order.customerName);
    setNote(order.note ?? "");
    setActiveEditors(order.activeEditors ?? []);
    if (!keepLocalWork) setDeliveryNote(order.deliveryNote ?? "");
    if (!keepLocalWork) setDeliverySelection(order.items.map((item, itemIndex) => {
      const despatchItem = order.despatchScope === "partial"
        ? order.despatchItems?.find((entry) => entry.itemIndex === itemIndex)
        : undefined;
      return {
        selected: order.despatchScope === "partial" ? Boolean(despatchItem) : true,
        quantity: despatchItem?.quantity ?? (Number(item.preparedQuantity ?? item.quantity) || 0),
        rollCount: despatchItem?.rollCount ?? Math.max(0, Math.trunc(Number(item.preparedRollCount ?? item.orderedRollCount) || 0)),
      };
    }));
    setDeliveryPhoto(order.deliveryPhoto ?? "");
    if (!keepLocalWork) setDespatchNumber(order.despatchNumber ?? "");
    if (!keepLocalWork) setWithoutDespatch(order.withoutDespatch ?? false);
    setDespatchScope(order.despatchScope ?? "full");
  }, [order]);

  useEffect(() => {
    let cancelled = false;
    const ping = async (active = true) => {
      try {
        const editors = await api<Array<{ id?: string; name: string }>>(
          `/api/orders/${order.id}/presence`,
          {
            method: "POST",
            body: JSON.stringify({ active }),
          },
        );
        if (!cancelled && active) setActiveEditors(editors);
      } catch {
        // Presence is informational; editing must remain usable if a heartbeat fails.
      }
    };
    void ping();
    const timer = window.setInterval(() => void ping(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void ping(false);
    };
  }, [order.id]);

  const saveDraftItem = async (
    itemIndex: number,
    changes: { preparedQuantity?: number; preparedRollCount?: number; cutAllowanceApplied?: boolean; cutPieceCount?: number; cutAllowancePerPiece?: number },
  ) => {
    if (order.status !== "preparing") return;
    if (
      changes.preparedQuantity !== undefined &&
      !(changes.preparedQuantity > 0)
    )
      return;
    if (
      changes.preparedRollCount !== undefined &&
      !(changes.preparedRollCount >= 0)
    )
      return;
    try {
      const next = await api<Order>(`/api/orders/${order.id}/draft`, {
        method: "PATCH",
        body: JSON.stringify({ itemIndex, ...changes }),
      });
      setActiveEditors(next.activeEditors ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Metraj draftı saxlanmadı.",
      );
    }
  };

  const queueDraftItem = (
    itemIndex: number,
    field: "meter" | "roll" | "cut",
    changes: { preparedQuantity?: number; preparedRollCount?: number; cutAllowanceApplied?: boolean; cutPieceCount?: number; cutAllowancePerPiece?: number },
  ) => {
    const key = `${itemIndex}:${field}`;
    window.clearTimeout(draftTimers.current[key]);
    draftTimers.current[key] = window.setTimeout(
      () => void saveDraftItem(itemIndex, changes),
      450,
    );
  };

  const savePreparedCorrection = async () => {
    const missingRoll = items.find((item) => Number(item.preparedQuantity) > 0 && !(Number.isInteger(Number(item.preparedRollCount)) && Number(item.preparedRollCount) > 0));
    if (missingRoll) {
      setError(`${missingRoll.productName}: hazırlanan rulo sayısı en az 1 olmalıdır.`);
      return;
    }
    let correctionReason = preparedCorrectionReason.trim();
    if (!correctionReason) {
      correctionReason = window.prompt("Düzenleme nedenini yazın", "")?.trim() || "";
    }
    if (!correctionReason) {
      setError("Düzenleme nedeni zorunludur.");
      return;
    }
    setPreparedCorrectionReason(correctionReason);
    const missingAllowance = items.find((item) => Number(item.preparedQuantity) > 0 && !hasRequiredCutAllowance(item));
    if (missingAllowance) {
      setError(`${missingAllowance.productName}: 70 mt'den küçük hazırlamalarda kesim payı zorunludur.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<Order>(`/api/orders/${order.id}/prepared-correction`, {
        method: "PATCH",
        body: JSON.stringify({ items, reason: correctionReason }),
      });
      setCorrectingPrepared(false);
      setPreparedCorrectionReason("");
      setNotice("Hazır ürün bilgisi düzeltildi ve bildirim gönderildi.");
      onChanged(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hazır ürün bilgisi düzeltilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: Status, reason = "") => {
    if (status === "ready") {
      const missingRoll = items.find((item) => Number(item.preparedQuantity) > 0 && !(Number.isInteger(Number(item.preparedRollCount)) && Number(item.preparedRollCount) > 0));
      if (missingRoll) {
        setError(`${missingRoll.productName}: hazırlanan rulo sayısı en az 1 olmalıdır.`);
        return;
      }
      const missingAllowance = items.find((item) => Number(item.preparedQuantity) > 0 && !hasRequiredCutAllowance(item));
      if (missingAllowance) {
        setError(`${missingAllowance.productName}: 70 mt'den küçük hazırlamalarda kesim payı zorunludur.`);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      if (status === "ready" && order.status === "preparing") {
        const eligible = items.filter(
          (item) => Number(item.preparedQuantity) > 0,
        );
        const fullyPrepared =
          eligible.length === items.length &&
          eligible.every(
            (item) => Number(item.preparedQuantity) >= Number(item.quantity),
          );
        if (!fullyPrepared) {
          Object.values(draftTimers.current).forEach((timer) =>
            window.clearTimeout(timer),
          );
          const result = await api<{ order: Order; batch: Order }>(
            `/api/orders/${order.id}/partial-ready`,
            { method: "POST", body: JSON.stringify({ items }) },
          );
          onChanged(
            result.order.status === "fulfilled" ? result.batch : result.order,
          );
          return;
        }
      }
      const next = await api<Order>(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(status !== "delivered" ? { items } : {}),
          ...(reason.trim() ? { rollbackReason: reason.trim() } : {}),
          ...(status === "cancelled" ? { cancellationReason: reason.trim() } : {}),
          ...(status === "delivered" ? { deliveryNote } : {}),
        }),
      });
      if (["delivered", "cancelled", "fulfilled"].includes(next.status)) localStorage.removeItem(workDraftKey);
      onChanged(next);
      setRollbackTarget(null);
      setRollbackReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mərhələ dəyişmədi.");
    } finally {
      setBusy(false);
    }
  };

  const deliverSelected = async () => {
    const selected = deliverySelection
      .map((entry, itemIndex) => ({ ...entry, itemIndex }))
      .filter((entry) => entry.selected && (Number(entry.quantity) > 0 || Number(entry.rollCount) > 0));
    if (!selected.length) {
      setError("Teslim edilecek en az bir ürün ve miktar seçin.");
      return;
    }
    const invalid = selected.find((entry) => {
      const item = order.items[entry.itemIndex];
      const availableQuantity = Number(item?.preparedQuantity ?? item?.quantity) || 0;
      const availableRolls = Math.max(0, Math.trunc(Number(item?.preparedRollCount ?? item?.orderedRollCount) || 0));
      return entry.quantity < 0 || entry.rollCount < 0 || entry.quantity > availableQuantity + 0.000001 || entry.rollCount > availableRolls;
    });
    if (invalid) {
      setError(`${order.items[invalid.itemIndex]?.productName || "Ürün"}: teslim miktarı hazır miktarı aşamaz.`);
      return;
    }
    const isFullDelivery = order.items.every((item, index) => {
      const entry = deliverySelection[index];
      const availableQuantity = Number(item.preparedQuantity ?? item.quantity) || 0;
      const availableRolls = Math.max(0, Math.trunc(Number(item.preparedRollCount ?? item.orderedRollCount) || 0));
      return entry?.selected
        && Math.abs(Number(entry.quantity) - availableQuantity) < 0.000001
        && Number(entry.rollCount) === availableRolls;
    });
    if (isFullDelivery) {
      await changeStatus("delivered");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const split = await api<{ order: Order; batch: Order }>(`/api/orders/${order.id}/partial-delivery`, {
        method: "POST",
        body: JSON.stringify({ items: selected.map(({ itemIndex, quantity, rollCount }) => ({ itemIndex, quantity, rollCount })) }),
      });
      await api<Order>(`/api/orders/${split.batch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "delivered", deliveryNote }),
      });
      setNotice("Seçilen ürünler teslim edildi. Kalan miktarlar Hazır bölümünde bırakıldı.");
      onChanged(split.order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kısmi teslimat tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    Object.values(draftTimers.current).forEach((timer) =>
      window.clearTimeout(timer),
    );
    try {
      for (const [itemIndex, item] of items.entries()) {
        if (!(Number(item.preparedQuantity) > 0)) continue;
        await api<Order>(`/api/orders/${order.id}/draft`, {
          method: "PATCH",
          body: JSON.stringify({
            itemIndex,
            preparedQuantity: Number(item.preparedQuantity),
            preparedRollCount: Number(item.preparedRollCount) || 0,
            cutAllowanceApplied: item.cutAllowanceApplied === true,
            cutPieceCount: item.cutAllowanceApplied ? Math.max(1, Number(item.cutPieceCount) || 1) : 0,
            cutAllowancePerPiece: item.cutAllowanceApplied ? cutAllowancePerPieceValue(item) : 0,
          }),
        });
      }
      const next = await api<Order>(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ saveDraft: true }),
      });
      setItems(next.items);
      setNotice(ui.draftSaved);
      onChanged(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Taslaq saxlanmadı.");
    } finally {
      setBusy(false);
    }
  };

  const saveChanges = async () => {
    if (!customerName.trim()) {
      setError("Müşteri adı zorunludur.");
      return;
    }
    const incompleteProduct = items.find((item) => !item.productId);
    if (incompleteProduct) {
      setError("Ürün kodu veya adından listeden geçerli bir ürün seçin.");
      return;
    }
    const missingAmount = items.find((item) => !(Number(item.quantity) > 0) && !(Number(item.orderedRollCount) > 0));
    if (missingAmount) {
      setError(`${missingAmount.productName || "Ürün"}: metre veya rulo sayısından en az birini yazın.`);
      return;
    }
    let reason = editReason.trim();
    if (!reason) reason = window.prompt("Düzenleme nedenini yazın:", "")?.trim() || "";
    if (!reason) {
      setError("Düzenleme nedeni zorunludur.");
      return;
    }
    setEditReason(reason);
    setBusy(true);
    setError("");
    try {
      const next = await api<Order>(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ customerName, note, items, editReason: reason, removedItems }),
      });
      setEditing(false);
      setEditReason("");
      setRemovedItems([]);
      onChanged(next);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Sifariş dəyişdirilmədi.",
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteOrder = async () => {
    const reason = window.prompt(`${order.number} neden siliniyor?`, "")?.trim();
    if (!reason) { setError("Silme sebebi zorunludur."); return; }
    if (!confirm(`${order.number} silinsin?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/orders/${order.id}`, { method: "DELETE", body: JSON.stringify({ reason }) });
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sifariş silinmədi.");
      setBusy(false);
    }
  };
  const cancelOrder = async () => {
    const reason = window.prompt(`${order.number} neden iptal ediliyor?`, "")?.trim();
    if (!reason) { setError("İptal sebebi zorunludur."); return; }
    await changeStatus("cancelled", reason);
  };

  const updateDespatch = async (ready: boolean) => {
    const selectedItems = deliverySelection
      .map((entry, itemIndex) => ({ ...entry, itemIndex }))
      .filter((entry) => entry.selected && (entry.quantity > 0 || entry.rollCount > 0))
      .map(({ itemIndex, quantity, rollCount }) => ({ itemIndex, quantity, rollCount }));
    if (ready && despatchScope === "partial" && !selectedItems.length) {
      setError("İrsaliyeye bağlanacak en az bir ürün ve miktar seçin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<Order>(`/api/orders/${order.id}/despatch`, {
        method: "PATCH",
        body: JSON.stringify({
          ready,
          number: withoutDespatch ? "" : despatchNumber,
          withoutDespatch,
          scope: despatchScope,
          items: despatchScope === "partial" ? selectedItems : [],
        }),
      });
      onChanged(next);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "İrsaliye statusu dəyişmədi.",
      );
    } finally {
      setBusy(false);
    }
  };

  const uploadAttachments = async (
    kind: OrderAttachment["kind"],
    files: File[],
  ) => {
    if (!files.length) return;
    setBusy(true);
    setAttachmentUploadStatus("Resim hazırlanıyor…");
    setError("");
    try {
      let next: Order | null = null;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      for (const [fileIndex, file] of files.entries()) {
        setAttachmentUploadStatus(`${fileIndex + 1}/${files.length} dosya hazırlanıyor…`);
        const isImage = isImageFile(file);
        const isPdf = isPdfFile(file);
        if (!isImage && !isPdf)
          throw new Error("Yalnız PDF və ya şəkil yükləyə bilərsiniz.");
        if (!isImage && file.size > 5_000_000)
          throw new Error("PDF ən çox 5 MB ola bilər.");
        const data = isImage
          ? await prepareImageUpload(file)
          : await fileToDataUrl(file);
        const mimeType = isImage ? "image/jpeg" : "application/pdf";
        const name = isImage
          ? file.name.replace(/\.[^.]+$/, "") + ".jpg"
          : file.name;
        setAttachmentUploadStatus(`${fileIndex + 1}/${files.length} dosya yükleniyor…`);
        next = await api<Order>(`/api/orders/${order.id}/attachments`, {
          method: "POST",
          body: JSON.stringify({ kind, name, mimeType, data }),
        });
      }
      if (next) onChanged(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Fayl yüklənmədi.");
    } finally {
      setBusy(false);
      setAttachmentUploadStatus("");
    }
  };

  const deleteAttachment = async (attachment: OrderAttachment) => {
    if (
      !confirm(
        `${attachment.name} silinsin? Fayl silinən sənədlərə köçürüləcək.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Order>(
        `/api/orders/${order.id}/attachments/${attachment.id}`,
        { method: "DELETE" },
      );
      onChanged(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Fayl silinmədi.");
    } finally {
      setBusy(false);
    }
  };

  const restoreAttachment = async (attachment: OrderAttachment) => {
    setBusy(true);
    setError("");
    try {
      const next = await api<Order>(
        `/api/orders/${order.id}/attachments/${attachment.id}`,
        { method: "PATCH" },
      );
      onChanged(next);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Fayl geri qaytarılmadı.",
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteDeliveryPhoto = async () => {
    if (!confirm("Teslim fotoğrafı silinsin mi?")) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Order>(`/api/orders/${order.id}/delivery-photo`, { method: "DELETE" });
      setDeliveryPhoto("");
      onChanged(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Teslim fotoğrafı silinemedi.");
    } finally {
      setBusy(false);
    }
  };

  const printAttachment = (attachment: OrderAttachment) => {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    frame.src = attachment.url;
    frame.onload = () =>
      window.setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => frame.remove(), 30_000);
      }, 250);
    document.body.appendChild(frame);
  };

  const setOrderTestMode = async (enabled: boolean) => {
    setBusy(true);
    setError("");
    try {
      const next = await api<Order>(`/api/orders/${order.id}/test-mode`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      onChanged(next);
      setNotice(enabled
        ? "Test modu açıldı. Bu sipariş bildirim göndermez ve stok düşmez."
        : "Test modu kapatıldı. Bundan sonraki işlemler gerçek akışta çalışır.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Test modu değiştirilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        className={`order-detail-modal status-${order.status}`}
        title={editing ? ui.editOrder : order.customerName}
        subtitle={`${order.number} · ${order.isLoanReturn ? "Borç iadesi · " : ""}${statusMeta[order.status].label}`}
        onClose={onClose}
      >
        <div className="order-audit">
          <span>{ui.createdBy}</span>
          <b>{order.createdBy}</b>
          {canLockOrder && <button className="order-lock-top-action" type="button" disabled={busy} onClick={() => void toggleOrderLock()}>{order.lockedAt ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}<span>{order.lockedAt ? "Kilidi aç" : "Kilitle"}</span></button>}
        </div>
        {isOwner && <div className={`order-test-mode-banner ${order.isTest ? "active" : ""}`}>
          <div>
            <b>{order.isTest ? "TEST MODU AÇIK" : "Test modu"}</b>
            <span>{order.isTest ? "Bildirim gönderilmez, stok düşmez ve gerçek günlük satışa dahil edilmez." : "Bu siparişi kullanıcıları rahatsız etmeden denemek için test moduna alın."}</span>
          </div>
          <button type="button" className={order.isTest ? "secondary" : "primary"} disabled={busy} onClick={() => void setOrderTestMode(!order.isTest)}>{order.isTest ? "Test modunu kapat" : "Test moduna al"}</button>
        </div>}
        {order.isLoanReturn && <div className="order-test-mode-banner active">
          <div>
            <b>BORÇ İADESİ</b>
            <span>Teslim edildiğinde fiziksel stok ve bu müşteriye ait borç alış bakiyesi azalır; gün sonu teslimat ve satış toplamına dahil edilir.</span>
          </div>
        </div>}
        {order.parentOrderNumber && (
          <div className="parent-order-link detail">
            {ui.originalOrder}: <b>{order.parentOrderNumber}</b>
          </div>
        )}
        {order.mergedOrderNumbers?.length ? (
          <div className="parent-order-link merged-order-link detail">Birleşen hazır siparişler: <b>{order.mergedOrderNumbers.join(" · ")}</b></div>
        ) : null}
        {activeEditors.length > 0 && (
          <div className="active-editors">
            <span>{ui.activeEditors}</span>
            <b>{activeEditors.map((editor) => editor.name).join(", ")}</b>
          </div>
        )}
        {editing ? (
          <div className="owner-edit-fields">
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder={ui.customer}
            />
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={ui.note}
              rows={2}
            />
            <input
              value={editReason}
              onChange={(event) => setEditReason(event.target.value)}
              placeholder="Düzenleme nedeni"
              required
            />
          </div>
        ) : order.note ? (
          <div className="customer-note">{order.note}</div>
        ) : null}
        {editing && <>
          <datalist id={`order-product-codes-${order.id}`}>
            {products.map((product) => <option key={product.id} value={product.code || product.sku || ""}>{product.name}</option>)}
          </datalist>
          <datalist id={`order-product-names-${order.id}`}>
            {products.map((product) => <option key={product.id} value={product.name}>{product.code || product.sku || ""}</option>)}
          </datalist>
        </>}
        {(order.attachments || []).some(
          (attachment) => !attachment.deletedAt,
        ) && (
          <div className="attached-document-summary">
            <strong>{ui.documents}</strong>
            <div>
              {(order.attachments || [])
                .filter((attachment) => !attachment.deletedAt)
                .map((attachment) => (
                  <button
                    type="button"
                    key={attachment.id}
                    onClick={() => setPreviewAttachment(attachment)}
                  >
                    <span>
                      {attachment.kind === "orderForm"
                        ? ui.orderForm
                        : attachment.kind === "despatch"
                          ? ui.despatchFile
                          : ui.deliveryProof}
                    </span>
                    <b>{attachment.name}</b>
                    <small>
                      {formatFileSize(attachment.size)} · {ui.previewFile}
                    </small>
                  </button>
                ))}
            </div>
          </div>
        )}
        {!order.exportPackingRequired && <div className="prep-list">
          {items.map((item, index) => {
            const productKey = `${item.productId ?? item.productCode}-${index}`;
            const productAudits = traceAudits.filter(
              (entry) => Number(entry.productId) === Number(item.productId),
            );
            const originalItem = (
              Array.isArray(rootOrder.originalItems)
                ? rootOrder.originalItems
                : safeItems(rootOrder)
            ).find(
              (candidate) =>
                Number(candidate.productId) === Number(item.productId),
            );
            const productBatches = preparedParts.filter((batch) =>
              safeItems(batch).some(
                (candidate) =>
                  Number(candidate.productId) === Number(item.productId),
              ),
            );
            return (
              <div
                className={`prep-row ${order.status === "delivered" ? "is-expandable" : ""}`}
                key={`order-line-${index}`}
              >
                <div>
                  <small>{item.productCode}</small>
                  <strong>{item.productName}</strong>
                  {item.lineNote && (
                    <em className="line-note">{item.lineNote}</em>
                  )}
                  {item.preparedBy && (
                    <small className="prepared-audit">
                      {item.preparedBy} ·{" "}
                      {item.preparedAt
                        ? new Date(item.preparedAt).toLocaleTimeString(
                            language,
                            { hour: "2-digit", minute: "2-digit" },
                          )
                        : ""}
                    </small>
                  )}
                  <span>
                    {ui.ordered}: {orderedQuantityLabel(item)}
                  </span>
                  {order.status === "delivered" && (
                    <button
                      type="button"
                      className="product-detail-trigger"
                      onClick={() =>
                        setExpandedProductKey((current) =>
                          current === productKey ? "" : productKey,
                        )
                      }
                    >
                      {ui.tapForDetails}{" "}
                      {expandedProductKey === productKey ? "↑" : "↓"}
                    </button>
                  )}
                </div>
                {editing ? (
                  <div className="owner-line-edit">
                    <label className="order-product-lookup">
                      <span>Ürün kodu</span>
                      <input
                      list={`order-product-codes-${order.id}`}
                      value={item.productCode || ""}
                      placeholder="Kod yazın"
                      onChange={(event) => {
                        const value = event.target.value;
                        const product = products.find(
                          (candidate) => String(candidate.code || candidate.sku || "").toLocaleLowerCase("tr") === value.trim().toLocaleLowerCase("tr"),
                        );
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? product ? {
                                  ...row,
                                  productId: product.id,
                                  productName: product.name,
                                  productCode: product.code || product.sku || "",
                                } : { ...row, productId: null, productCode: value }
                              : row,
                          ),
                        );
                      }}
                    />
                    </label>
                    <label className="order-product-lookup">
                      <span>Ürün adı</span>
                      <input
                        list={`order-product-names-${order.id}`}
                        value={item.productName || ""}
                        placeholder="Ürün adı yazın"
                        onChange={(event) => {
                          const value = event.target.value;
                          const product = products.find((candidate) => candidate.name.toLocaleLowerCase("tr") === value.trim().toLocaleLowerCase("tr"));
                          setItems((current) => current.map((row, rowIndex) => rowIndex === index
                            ? product ? { ...row, productId: product.id, productName: product.name, productCode: product.code || product.sku || "" } : { ...row, productId: null, productName: value }
                            : row));
                        }}
                      />
                    </label>
                    <div className="order-amount-choice"><small>Metre veya rulo sayısından en az birini yazın</small><div>
                    <label className="order-product-lookup"><span>Metre</span><input
                      type="number"
                      min="0"
                      step="0.01"
                      value={Number(item.quantity) > 0 ? item.quantity ?? "" : ""}
                      placeholder="Metre"
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, quantity: event.target.value === "" ? null : Number(event.target.value) }
                              : row,
                          ),
                        )
                      }
                    /></label>
                    <label className="order-product-lookup"><span>Rulo sayısı</span><input
                      type="number"
                      min="0"
                      step="1"
                      value={Number(item.orderedRollCount) > 0 ? item.orderedRollCount ?? "" : ""}
                      placeholder="Rulo sayısı"
                      onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index
                        ? { ...row, orderedRollCount: event.target.value === "" ? undefined : Math.max(0, Math.trunc(Number(event.target.value) || 0)) }
                        : row))}
                    /></label>
                    </div></div>
                    <input
                      value={item.lineNote ?? ""}
                      placeholder={ui.lineNote}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, lineNote: event.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="remove-order-line"
                      title="Sipariş satırını kaldır"
                      aria-label={`${item.productName} satırını kaldır`}
                      disabled={items.length <= 1}
                      onClick={() => {
                        const reason = window.prompt(`${item.productName} neden siparişten kaldırılıyor?`, "")?.trim();
                        if (!reason) {
                          setError("Ürün satırını kaldırmak için neden yazmalısınız.");
                          return;
                        }
                        setError("");
                        setRemovedItems((current) => [...current, { productId: item.productId ?? undefined, productCode: item.productCode, productName: item.productName, reason }]);
                        setItems((current) => current.filter((_, rowIndex) => rowIndex !== index));
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                      <span>Satırı kaldır</span>
                    </button>
                  </div>
                ) : (order.status === "preparing" && canPrepare && preparationEditing) || (["ready", "delivered"].includes(order.status) && correctingPrepared) ? (
                  <div className="prep-inputs prepared-quantity-fields">
                    <label className="actual">
                      <small>Hazırlanan mt</small>
                      <EditableNumberInput
                        min={0}
                        step={0.01}
                        value={Number(item.preparedQuantity ?? item.quantity ?? 0)}
                        onValueChange={(preparedQuantity) => {
                          const allowancePatch = requiredCutAllowancePatch(item, preparedQuantity);
                          queueDraftItem(index, "meter", { preparedQuantity, ...allowancePatch });
                          setItems((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, preparedQuantity, ...allowancePatch }
                                : row,
                            ),
                          );
                        }}
                        onValueCommit={(preparedQuantity) => void saveDraftItem(index, {
                          preparedQuantity,
                          ...requiredCutAllowancePatch(item, preparedQuantity),
                        })}
                      />
                      <span>mt</span>
                    </label>
                    <label className="actual roll-count">
                      <small>Hazırlanan rulo</small>
                      <EditableNumberInput
                        min={0}
                        step={1}
                        value={Number(item.preparedRollCount ?? 0)}
                        onValueChange={(value) => {
                          const preparedRollCount = Math.max(0, Math.trunc(value));
                          queueDraftItem(index, "roll", { preparedRollCount });
                          setItems((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, preparedRollCount }
                                : row,
                            ),
                          );
                        }}
                        onValueCommit={(value) => void saveDraftItem(index, { preparedRollCount: Math.max(0, Math.trunc(value)) })}
                      />
                      <span>rulo</span>
                    </label>
                    <div className={`prep-cut-allowance ${item.cutAllowanceApplied ? "is-active" : ""}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={item.cutAllowanceApplied === true}
                          disabled={requiresCutAllowance(item) && item.cutAllowanceApplied === true}
                          onChange={(event) => {
                            const changes = {
                              cutAllowanceApplied: event.target.checked,
                              cutPieceCount: event.target.checked ? Math.max(1, Number(item.cutPieceCount) || 1) : 0,
                              cutAllowancePerPiece: event.target.checked ? Math.max(0.2, cutAllowancePerPieceValue(item)) : 0,
                            };
                            void saveDraftItem(index, changes);
                            setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row));
                          }}
                        />
                        <Scissors aria-hidden="true" />
                        <span>{requiresCutAllowance(item) ? "Kesim payı (zorunlu)" : "Kesim payı"}</span>
                      </label>
                      {item.cutAllowanceApplied && (
                        <>
                          <label className="actual"><EditableNumberInput min={1} step={1} value={item.cutPieceCount || 1} onValueChange={(value) => {
                            const cutPieceCount = Math.max(1, Math.trunc(value));
                            queueDraftItem(index, "cut", { cutPieceCount });
                            setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, cutPieceCount } : row));
                          }} onValueCommit={(value) => void saveDraftItem(index, { cutPieceCount: Math.max(1, Math.trunc(value)) })} /><span>parça</span></label>
                          <label className="actual"><EditableNumberInput min={0} step={1} value={Math.round(cutAllowancePerPieceValue(item) * 100)} onValueChange={(value) => {
                            const cutAllowancePerPiece = value / 100;
                            queueDraftItem(index, "cut", { cutAllowancePerPiece });
                            setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, cutAllowancePerPiece } : row));
                          }} onValueCommit={(value) => void saveDraftItem(index, { cutAllowancePerPiece: value / 100 })} /><span>cm</span></label>
                        </>
                      )}
                      <strong>Stoktan {(Number(item.preparedQuantity || item.quantity || 0) + cutAllowanceTotal(item)).toLocaleString(language)} mt</strong>
                    </div>
                  </div>
                ) : ["preparing", "ready", "delivered"].includes(order.status) ? (
                  <div className="prepared-values">
                    <b>{Number(item.preparedQuantity ?? item.quantity).toLocaleString(language)} mt</b>
                    <span>
                      {item.preparedRollCount || "-"}{" "}
                      {ui.rollCount.toLowerCase()}
                    </span>
                    <span>{item.cutAllowanceApplied ? `${cutAllowanceTotal(item).toLocaleString(language)} mt kesim payı` : "Kesim payı yok"}</span>
                    <strong>Stok: {(Number(item.preparedQuantity ?? item.quantity) + cutAllowanceTotal(item)).toLocaleString(language)} mt</strong>
                  </div>
                ) : null}
                {order.status === "delivered" &&
                  expandedProductKey === productKey && (
                    <div className="product-trace-panel">
                      <h4>{ui.productHistory}</h4>
                      <p>
                        <span>{ui.enteredAs}</span>
                        <b>
                          {originalItem?.source ||
                            rootOrder.originalText ||
                            "-"}
                        </b>
                      </p>
                      <p>
                        <span>{ui.matchedAs}</span>
                        <b>
                          {originalItem?.productCode || item.productCode} ·{" "}
                          {originalItem?.productName || item.productName}
                        </b>
                      </p>
                      {productBatches.map((batch) => {
                        const line = safeItems(batch).find(
                          (candidate) =>
                            Number(candidate.productId) ===
                            Number(item.productId),
                        );
                        return (
                          <p key={`${productKey}-${batch.id}`}>
                            <span>{batch.number}</span>
                            <b>
                              {line?.preparedQuantity ?? line?.quantity ?? "-"}{" "}
                              mt · {line?.preparedRollCount || 0}{" "}
                              {ui.rollCount.toLowerCase()} ·{" "}
                              {line?.preparedBy || batch.preparedBy || "-"}
                            </b>
                          </p>
                        );
                      })}
                      {productAudits.map((entry) => {
                        const isMeter = entry.action === "preparedQuantity";
                        const isRoll = entry.action === "preparedRollCount";
                        const unit = isMeter
                          ? " mt"
                          : isRoll
                            ? ` ${ui.rollCount.toLowerCase()}`
                            : "";
                        const actionLabel = isMeter
                          ? ui.meterChange
                          : isRoll
                            ? ui.rollChange
                            : entry.action;
                        return (
                          <p
                            key={`${productKey}-${entry.orderNumber}-${entry.id}`}
                          >
                            <span>
                              <b>{actionLabel}</b>
                              <br />
                              {new Date(entry.at).toLocaleString(
                                language,
                              )} · {entry.by}
                            </span>
                            <b>
                              {printableAuditValue(entry.oldValue)}
                              {entry.oldValue !== undefined &&
                              entry.oldValue !== null
                                ? unit
                                : ""}{" "}
                              → {printableAuditValue(entry.newValue)}
                              {entry.newValue !== undefined &&
                              entry.newValue !== null
                                ? unit
                                : ""}
                            </b>
                          </p>
                        );
                      })}
                      {!productAudits.length && <small>{ui.noChanges}</small>}
                    </div>
                  )}
              </div>
            );
          })}
          {editing && <button type="button" className="add-order-line" onClick={() => {
            setItems((current) => [...current, {
              source: "Manuel eklenen satır", productId: null, productCode: "", productName: "", quantity: null,
              preparedQuantity: null, preparedRollCount: null, orderedRollCount: undefined, confidence: 1, needsReview: false, alternatives: [],
            }]);
          }}><Plus aria-hidden="true" /><span>Ürün satırı ekle</span></button>}
        </div>}
        {order.preparedBy && (
          <p className="worker">
            {ui.preparedBy}: <b>{order.preparedBy}</b>
          </p>
        )}
        {(order.status === "ready" || order.status === "delivered") && (
          <section className="order-documents">
            <div className="order-documents-heading">
              <h3>{ui.documents}</h3>
              <small>{ui.fileHint}</small>
            </div>
            <div className="order-document-grid">
              {(["orderForm", "despatch"] as const).map((kind) => {
                const files = (order.attachments || []).filter(
                  (attachment) =>
                    attachment.kind === kind && !attachment.deletedAt,
                );
                return (
                  <article className="order-document-slot" key={kind}>
                    <div className="order-document-title">
                      <strong>
                        {kind === "orderForm" ? ui.orderForm : ui.despatchFile}
                      </strong>
                      <span>{files.length}</span>
                    </div>
                    {files.length ? (
                      <div className="order-document-list">
                        {files.map((attachment) => (
                          <div key={attachment.id}>
                            <span>
                              <b>{attachment.name}</b>
                              <small>
                                {formatFileSize(attachment.size)} ·{" "}
                                {attachment.uploadedBy} ·{" "}
                                {new Date(attachment.uploadedAt).toLocaleString(
                                  language,
                                )}
                              </small>
                            </span>
                            <span className="order-document-actions">
                              <button
                                type="button"
                                onClick={() => setPreviewAttachment(attachment)}
                              >
                                {ui.previewFile}
                              </button>
                              <button
                                type="button"
                                onClick={() => printAttachment(attachment)}
                              >
                                {ui.printFile}
                              </button>
                              <a href={`${attachment.url}?download=1`}>
                                {ui.downloadFile}
                              </a>
                              {isOwner && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void deleteAttachment(attachment)
                                  }
                                >
                                  {ui.deleteFile}
                                </button>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>{ui.noFile}</p>
                    )}
                    {canManageDocuments && order.status === "ready" && (
                      <label className="order-document-upload">
                        <span>＋ {ui.uploadFile}</span>
                        <input
                          type="file"
                          accept={`${imageAccept},application/pdf,.pdf`}
                          multiple
                          disabled={busy}
                          onChange={(event) => {
                            const files = Array.from(event.target.files || []);
                            if (files.length) void uploadAttachments(kind, files);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    )}
                  </article>
                );
              })}
            </div>
            {isOwner &&
              (order.attachments || []).some(
                (attachment) => attachment.deletedAt,
              ) && (
                <details className="deleted-document-list">
                  <summary>
                    {ui.deletedFiles} ·{" "}
                    {
                      (order.attachments || []).filter(
                        (attachment) => attachment.deletedAt,
                      ).length
                    }
                  </summary>
                  <div>
                    {(order.attachments || [])
                      .filter((attachment) => attachment.deletedAt)
                      .map((attachment) => (
                        <article key={attachment.id}>
                          <span>
                            <b>{attachment.name}</b>
                            <small>
                              {attachment.deletedBy} ·{" "}
                              {attachment.deletedAt
                                ? new Date(attachment.deletedAt).toLocaleString(
                                    language,
                                  )
                                : ""}
                            </small>
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void restoreAttachment(attachment)}
                          >
                            {ui.restoreFile}
                          </button>
                        </article>
                      ))}
                  </div>
                </details>
              )}
          </section>
        )}
        {!order.isLoanReturn && (order.status === "ready" || order.status === "delivered" || order.isTest || order.exportPackingRequired) &&
          (canSell || (order.exportPackingRequired && canPrepare)) && (
            <section className="approval-entry">
              <div>
                <small>{order.exportPackingRequired ? "İHRACAT PALET HAZIRLIĞI" : "SİPARİŞ ONAY FORMU"}</small>
                <strong>
                  {order.exportPackingRequired
                    ? "Packing List için palet bilgileri bekleniyor"
                    : order.approvalForm
                    ? `${order.approvalForm.number} · ${order.approvalForm.status === "approved" ? "Onaylandı" : "Onay bekliyor"}`
                    : "Müşteriye gönderilecek fiyatlı form"}
                </strong>
                <span>
                  {order.exportPackingRequired
                    ? "Palet dağılımını, brüt ağırlığı, darayı ve ölçüleri girin."
                    : "Hazırlanan metre ve rulo sabittir; fiyat, KDV ve koşullar düzenlenebilir."}
                </span>
              </div>
              <div className="approval-entry-actions">
                {order.exportPackingRequired && canSell && <button type="button" className="secondary" onClick={() => { setApprovalMode("documents"); setApprovalOpen(true); }}>İhracat belgeleri</button>}
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    beginActivity(order.approvalForm ? "approval_form_editing_started" : "approval_form_preparing_started");
                    setApprovalMode(order.exportPackingRequired ? "packing" : "documents");
                    setApprovalOpen(true);
                  }}
                >
                  {order.exportPackingRequired ? "Paletleri hazırla" : order.approvalForm ? "Formu aç" : "Form oluştur"}
                </button>
              </div>
            </section>
          )}
        {order.status === "ready" && (
          <section className="delivery-form readonly">
            <h3>
              {order.despatchReady
                ? order.withoutDespatch
                  ? ui.deliveryWithoutDespatchReady
                  : ui.despatchReady
                : ui.despatchPending}
            </h3>
            {order.despatchReady && (
              <p>
                <b>{order.withoutDespatch ? ui.deliveryWithoutDespatch : order.despatchNumber}</b>
                {order.despatchReadyBy ? ` · ${order.despatchReadyBy}` : ""}
                {` · ${order.despatchScope === "partial" ? "Seçili ürün/miktarlar" : "Siparişin tamamı"}`}
              </p>
            )}
            {canManageDespatch && (
              <div className="despatch-controls">
                {!order.despatchReady && (
                  <div className="despatch-scope" role="group" aria-label="İrsaliye kapsamı">
                    <button type="button" className={despatchScope === "full" ? "active" : ""} onClick={() => {
                      setDespatchScope("full");
                      setDeliverySelection(order.items.map((item) => ({ selected: true, quantity: Number(item.preparedQuantity ?? item.quantity) || 0, rollCount: Math.max(0, Math.trunc(Number(item.preparedRollCount ?? item.orderedRollCount) || 0)) })));
                    }}>Siparişin tamamı</button>
                    <button type="button" className={despatchScope === "partial" ? "active" : ""} onClick={() => setDespatchScope("partial")}>Seçili ürün / miktar</button>
                  </div>
                )}
                {!order.despatchReady && despatchScope === "partial" && (
                  <div className="partial-delivery-picker despatch-item-picker">
                    <header><div><b>İrsaliyeye girecek ürünler</b><small>Kesilen irsaliyedeki gerçek miktarları seçin.</small></div><span>{deliverySelection.filter((entry) => entry.selected).length}/{order.items.length}</span></header>
                    {order.items.map((item, index) => {
                      const entry = deliverySelection[index] || { selected: false, quantity: 0, rollCount: 0 };
                      const maxQuantity = Number(item.preparedQuantity ?? item.quantity) || 0;
                      const maxRolls = Math.max(0, Math.trunc(Number(item.preparedRollCount ?? item.orderedRollCount) || 0));
                      return <article className={entry.selected ? "selected" : ""} key={`despatch-${item.productId}-${index}`}>
                        <label className="partial-delivery-check"><input type="checkbox" checked={entry.selected} onChange={(event) => setDeliverySelection((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, selected: event.target.checked } : row))} /><span><b>{item.productName}</b><small>{item.productCode || "-"} · Hazır: {preparedQuantityLabel(item)}</small></span></label>
                        <label><span>İrsaliye mt</span><input type="number" min="0" max={maxQuantity} step="0.01" disabled={!entry.selected || maxQuantity <= 0} value={entry.selected && entry.quantity > 0 ? entry.quantity : ""} onChange={(event) => setDeliverySelection((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value === "" ? 0 : Math.max(0, Number(event.target.value) || 0) } : row))} /></label>
                        <label><span>İrsaliye rulo</span><input type="number" min="0" max={maxRolls} step="1" disabled={!entry.selected || maxRolls <= 0} value={entry.selected && entry.rollCount > 0 ? entry.rollCount : ""} onChange={(event) => setDeliverySelection((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, rollCount: event.target.value === "" ? 0 : Math.max(0, Math.trunc(Number(event.target.value) || 0)) } : row))} /></label>
                      </article>;
                    })}
                  </div>
                )}
                <div className="prep-inputs">
                <label className="approval-toggle despatch-without-number">
                  <input
                    type="checkbox"
                    checked={withoutDespatch}
                    disabled={order.despatchReady}
                    onChange={(event) => setWithoutDespatch(event.target.checked)}
                  />
                  <span>{ui.deliveryWithoutDespatch}</span>
                </label>
                <label className="actual">
                  <input
                    value={despatchNumber}
                    onChange={(event) => setDespatchNumber(event.target.value)}
                    placeholder={ui.despatchNumber}
                    disabled={withoutDespatch || order.despatchReady}
                  />
                </label>
                <button
                  className={order.despatchReady ? "secondary" : "primary"}
                  disabled={
                    busy || (!order.despatchReady && !withoutDespatch && !despatchNumber.trim())
                  }
                  onClick={() => void updateDespatch(!order.despatchReady)}
                >
                  {order.despatchReady
                    ? ui.revokeDespatch
                    : withoutDespatch
                      ? ui.confirmDeliveryWithoutDespatch
                      : ui.confirmDespatch}
                </button>
                </div>
              </div>
            )}
          </section>
        )}
        {order.status === "ready" && canDeliver && order.despatchReady && (
          <section className="delivery-form">
            <h3>{ui.deliveryProof}</h3>
            <div className="partial-delivery-picker">
              <header><div><b>Teslim edilecek ürünler</b><small>Ürünün tamamını veya bir kısmını seçebilirsiniz.</small></div><span>{deliverySelection.filter((entry) => entry.selected).length}/{order.items.length}</span></header>
              {order.items.map((item, index) => {
                const entry = deliverySelection[index] || { selected: false, quantity: 0, rollCount: 0 };
                const maxQuantity = Number(item.preparedQuantity ?? item.quantity) || 0;
                const maxRolls = Math.max(0, Math.trunc(Number(item.preparedRollCount ?? item.orderedRollCount) || 0));
                return <article className={entry.selected ? "selected" : ""} key={`delivery-${item.productId}-${index}`}>
                  <label className="partial-delivery-check"><input type="checkbox" checked={entry.selected} onChange={(event) => setDeliverySelection((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, selected: event.target.checked } : row))} /><span><b>{item.productName}</b><small>{item.productCode || "-"} · Hazır: {preparedQuantityLabel(item)}</small></span></label>
                  <label><span>Gidecek mt</span><input type="number" min="0" max={maxQuantity} step="0.01" disabled={!entry.selected || maxQuantity <= 0} value={entry.selected && entry.quantity > 0 ? entry.quantity : ""} placeholder={maxQuantity > 0 ? String(maxQuantity) : "-"} onChange={(event) => setDeliverySelection((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value === "" ? 0 : Math.max(0, Number(event.target.value) || 0) } : row))} /></label>
                  <label><span>Gidecek rulo</span><input type="number" min="0" max={maxRolls} step="1" disabled={!entry.selected || maxRolls <= 0} value={entry.selected && entry.rollCount > 0 ? entry.rollCount : ""} placeholder={maxRolls > 0 ? String(maxRolls) : "-"} onChange={(event) => setDeliverySelection((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, rollCount: event.target.value === "" ? 0 : Math.max(0, Math.trunc(Number(event.target.value) || 0)) } : row))} /></label>
                </article>;
              })}
            </div>
            <textarea
              rows={3}
              value={deliveryNote}
              onChange={(event) => setDeliveryNote(event.target.value)}
              placeholder={ui.deliveryNote}
            />
            <div className="delivery-proof-actions">
            <label className="delivery-photo-input">
              <span>Dosya seç</span>
              <input
                type="file"
                accept={`${imageAccept},application/pdf,.pdf`}
                multiple
                disabled={busy}
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  if (files.length) void uploadAttachments("deliveryProof", files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label className="delivery-photo-input camera">
              <span>Fotoğraf çek</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={busy}
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  if (files.length) void uploadAttachments("deliveryProof", files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            </div>
            {attachmentUploadStatus && <div className="attachment-upload-status" role="status"><span />{attachmentUploadStatus}</div>}
            {(order.attachments || []).some((attachment) => attachment.kind === "deliveryProof" && !attachment.deletedAt) && (
              <div className="delivery-proof-files">
                {(order.attachments || []).filter((attachment) => attachment.kind === "deliveryProof" && !attachment.deletedAt).map((attachment) => (
                  <div className="delivery-proof-file" key={attachment.id}>
                    {attachment.mimeType.startsWith("image/") ?
                      <img src={attachment.url} alt={attachment.name} /> :
                      <a href={attachment.url} target="_blank" rel="noreferrer"><FileText aria-hidden="true" />{attachment.name}</a>}
                    {canDeliver && <button type="button" className="delivery-proof-delete" disabled={busy} title="Teslim kanıtını sil" onClick={() => void deleteAttachment(attachment)}><Trash2 aria-hidden="true" /></button>}
                  </div>
                ))}
              </div>
            )}
            {deliveryPhoto && (
              <div className="delivery-proof-file legacy">
                <img className="delivery-photo-preview" src={deliveryPhoto} alt={ui.deliveryPhoto} />
                {canDeliver && <button type="button" className="delivery-proof-delete" disabled={busy} title="Teslim fotoğrafını sil" onClick={() => void deleteDeliveryPhoto()}><Trash2 aria-hidden="true" /></button>}
              </div>
            )}
          </section>
        )}
        {order.status === "delivered" &&
          (order.deliveryNote || order.deliveryPhoto || deliveryProofFiles.length) && (
            <section className="delivery-form readonly">
              <h3>{ui.deliveryProof}</h3>
              <p>{order.deliveryNote}</p>
              {order.deliveryPhoto && (
                <div className="delivery-proof-file legacy">
                  <img className="delivery-photo-preview" src={order.deliveryPhoto} alt={ui.deliveryPhoto} />
                  {canDeliver && <button type="button" className="delivery-proof-delete" disabled={busy} title="Teslim fotoğrafını sil" onClick={() => void deleteDeliveryPhoto()}><Trash2 aria-hidden="true" /></button>}
                </div>
              )}
              {deliveryProofFiles.length > 0 && (
                <div className="delivery-proof-files">
                  {deliveryProofFiles.map((attachment) => <div className="delivery-proof-file" key={attachment.id}>
                    {attachment.mimeType.startsWith("image/") ?
                      <img src={attachment.url} alt={attachment.name} /> :
                      <a href={attachment.url} target="_blank" rel="noreferrer"><FileText aria-hidden="true" />{attachment.name}</a>}
                    {canDeliver && <button type="button" className="delivery-proof-delete" disabled={busy} title="Teslim kanıtını sil" onClick={() => void deleteAttachment(attachment)}><Trash2 aria-hidden="true" /></button>}
                  </div>)}
                </div>
              )}
            </section>
          )}
        {order.status === "delivered" && (
          <section className="delivery-form readonly">
            <h3>{ui.orderSummary}</h3>
            <div className="order-summary-stats">
              <div className="customer-note">
                <small>{ui.deliveredProducts}</small>
                <br />
                <b>
                  {preparedParts.reduce(
                    (total, batch) => total + safeItems(batch).length,
                    0,
                  )}
                </b>
              </div>
              <div className="customer-note">
                <small>{ui.batchCount}</small>
                <br />
                <b>{preparedParts.length}</b>
              </div>
              <div className="customer-note">
                <small>{ui.remaining}</small>
                <br />
                <b>
                  {unpreparedItems.reduce(
                    (total, item) => total + (Number(item.quantity) || 0),
                    0,
                  )}{" "}
                  mt
                </b>
              </div>
            </div>
          </section>
        )}
        {canViewAudit && order.status === "delivered" && (
          <details className="order-history">
            <summary>
              <span>{ui.fullTrace}</span>
              <small>{ui.traceHint}</small>
            </summary>
            <div>
              <section className="delivery-form readonly">
                <h3>{ui.originalText}</h3>
                <p>{rootOrder.originalText || ui.oldRecordMissing}</p>
                <small>
                  {ui.createdBy}: <b>{rootOrder.createdBy}</b> ·{" "}
                  {new Date(rootOrder.createdAt).toLocaleString(language)}
                </small>
              </section>
              <section className="delivery-form readonly">
                <h3>{ui.initialMatches}</h3>
                {(Array.isArray(rootOrder.originalItems)
                  ? rootOrder.originalItems
                  : [
                      ...safeItems(rootOrder),
                      ...relatedBatches.flatMap(safeItems),
                    ]
                ).map((item, index) => (
                  <p key={`initial-${item.productId}-${index}`}>
                    <span>“{item.source || "-"}”</span>
                    <br />
                    <b>
                      {item.productCode} · {item.productName}
                    </b>{" "}
                    · {orderedQuantityLabel(item)}
                    {item.lineNote ? ` · ${item.lineNote}` : ""}
                    {Number.isFinite(item.confidence)
                      ? ` · %${Math.round(item.confidence * 100)}`
                      : ""}
                  </p>
                ))}
              </section>
              <section className="delivery-form readonly">
                <h3>{ui.preparedBatches}</h3>
                {preparedParts.map((batch) => (
                  <div key={batch.id} className="customer-note">
                    <b>
                      {batch.number} ·{" "}
                      {statusMeta[batch.status]?.label ?? batch.status ?? "-"}
                    </b>
                    <p>
                      {ui.preparedBy}: {batch.preparedBy || "-"} ·{" "}
                      {batch.readyAt
                        ? new Date(batch.readyAt).toLocaleString(language)
                        : "-"}
                    </p>
                    <p>
                      {batch.despatchReady
                        ? batch.withoutDespatch
                          ? ui.deliveryWithoutDespatchReady
                          : `${ui.despatchReady}: ${batch.despatchNumber}`
                        : ui.despatchPending}
                    </p>
                    {safeItems(batch).map((item, index) => (
                      <p key={`${batch.id}-${item.productId}-${index}`}>
                        <b>{item.productCode}</b> · {item.productName} ·{" "}
                        {item.preparedQuantity ?? item.quantity} mt ·{" "}
                        {item.preparedRollCount || 0}{" "}
                        {ui.rollCount.toLowerCase()} ·{" "}
                        {item.preparedBy || batch.preparedBy || "-"}
                      </p>
                    ))}
                    {batch.deliveredAt && (
                      <p>
                        {ui.deliveredBy}: <b>{batch.deliveredBy}</b> ·{" "}
                        {new Date(batch.deliveredAt).toLocaleString(language)}
                      </p>
                    )}
                  </div>
                ))}
                {unpreparedItems.length > 0 && (
                  <div className="customer-note">
                    <b>
                      {ui.remaining} · {rootOrder.number}
                    </b>
                    {unpreparedItems.map((item, index) => (
                      <p key={`remaining-${item.productId}-${index}`}>
                        <b>{item.productCode}</b> · {item.productName} ·{" "}
                        {orderedQuantityLabel(item)}
                      </p>
                    ))}
                  </div>
                )}
              </section>
              <section className="delivery-form readonly">
                <h3>{ui.quantityHistory}</h3>
                {traceAudits
                  .filter((entry) =>
                    [
                      "preparedQuantity",
                      "preparedRollCount",
                      "partialReady",
                      "partialReadyCreated",
                      "status",
                      "despatchReady",
                      "despatchRevoked",
                      "draftSaved",
                      "preparedCorrection",
                    ].includes(entry.action),
                  )
                  .map((entry) => (
                    <p key={`${entry.orderNumber}-${entry.id}`}>
                      <b>
                        {entry.orderNumber} ·{" "}
                        {entry.productName || entry.action}
                      </b>
                      {(entry.oldValue !== undefined ||
                        entry.newValue !== undefined) && (
                        <span>
                          {" "}
                          · {printableAuditValue(entry.oldValue)} →{" "}
                          {printableAuditValue(entry.newValue)}
                        </span>
                      )}
                      <br />
                      <small>
                        {entry.by} ·{" "}
                        {new Date(entry.at).toLocaleString(language)}
                        {entry.reason ? ` · Neden: ${entry.reason}` : ""}
                      </small>
                    </p>
                  ))}
              </section>
            </div>
          </details>
        )}
        {canViewAudit &&
          order.status !== "delivered" &&
          (order.audit ?? []).length > 0 && (
            <details className="order-history">
              <summary>{ui.changeHistory}</summary>
              <div>
                {[...(order.audit ?? [])].reverse().map((entry) => (
                  <p key={entry.id}>
                    <b>
                      {entry.action === "preparedQuantity" ||
                      entry.action === "preparedRollCount"
                        ? entry.productName
                        : entry.action === "preparedCorrection"
                          ? "Hazır ürün bilgisi düzeltildi"
                        : entry.action === "created"
                          ? ui.createdBy
                          : entry.action === "status"
                            ? `${entry.oldValue ?? "-"} → ${entry.newValue}`
                            : entry.action === "draftSaved"
                              ? ui.draftSaved
                              : entry.action === "orderEdited"
                                ? ui.editOrder
                                : entry.action === "partialReady"
                                  ? `${ui.done}: ${entry.newValue}`
                                  : entry.action === "partialReadyCreated"
                                    ? ui.originalOrder
                                    : entry.action}
                    </b>
                    {entry.action === "preparedQuantity" && (
                      <span>
                        {entry.oldValue ?? "-"} → {entry.newValue} mt
                      </span>
                    )}
                    {entry.action === "preparedRollCount" && (
                      <span>
                        {entry.oldValue ?? "-"} → {entry.newValue}{" "}
                        {ui.rollCount.toLowerCase()}
                      </span>
                    )}
                    {entry.action === "preparedCorrection" && (
                      <span>{entry.newValue}</span>
                    )}
                    <small>
                      {entry.by} · {new Date(entry.at).toLocaleString(language)}
                      {entry.reason ? ` · Neden: ${entry.reason}` : ""}
                    </small>
                  </p>
                ))}
              </div>
            </details>
          )}
        {order.lockedAt && <div className="order-lock-notice"><Lock aria-hidden="true" /><span><b>Sipariş kilitli</b><small>{order.lockedBy}{order.lockReason ? ` · ${order.lockReason}` : ""}</small></span></div>}
        {notice && <p className="form-success">{notice}</p>}
        {error && <p className="form-error">{error}</p>}
        {correctingPrepared && (
          <label className="prepared-correction-reason">
            <span>Düzenleme nedeni <b>*</b></span>
            <textarea
              value={preparedCorrectionReason}
              onChange={(event) => setPreparedCorrectionReason(event.target.value)}
              placeholder="Metre, rulo veya kesim payının neden düzeltildiğini yazın"
              rows={2}
              maxLength={300}
              required
            />
          </label>
        )}
        <div className="modal-actions">
          {canEditOrder && !editing && !correctingPrepared && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                if (["ready", "delivered"].includes(order.status) && workflowRole === "owner") {
                  setItems(order.items.map((item) => ({ ...item })));
                  setCorrectingPrepared(true);
                  setPreparedCorrectionReason("");
                  setNotice("");
                  setError("");
                  return;
                }
                beginActivity("order_editing_started");
                setEditing(true);
              }}
            >
              {ui.editOrder}
            </button>
          )}
          {canEditOrder && editing && (
            <button
              className="primary"
              disabled={busy}
              onClick={saveChanges}
            >
              {ui.saveChanges}
            </button>
          )}
          {canDeleteOrder && (
            <button
              className="danger-button"
              disabled={busy}
              onClick={deleteOrder}
            >
              {ui.deleteOrder}
            </button>
          )}
          {canDeleteOrder && ["new", "preparing", "ready"].includes(order.status) && (
            <button className="secondary cancel-order-action" disabled={busy} onClick={() => void cancelOrder()}>
              İptal et
            </button>
          )}
          {order.status === "new" && canPrepare && (
            <button
              className="primary full"
              disabled={busy}
              onClick={() => changeStatus("preparing")}
            >
              {ui.start}
            </button>
          )}
          {order.status === "preparing" && !order.exportPackingRequired && (canPrepare || canRollback) && (
            <>
              {canRollback && <button className="secondary" disabled={busy} onClick={() => { setRollbackReason(""); setRollbackTarget("new"); }}>{ui.back}</button>}
              {canPrepare && !preparationEditing && <button className="primary" disabled={busy} onClick={() => setPreparationEditing(true)}>Hazırlamayı düzenle</button>}
              {canPrepare && preparationEditing && <button className="secondary" disabled={busy} onClick={() => { setItems(prepareItems(order)); setPreparationEditing(false); }}>Vazgeç</button>}
              {canPrepare && preparationEditing && <button className="secondary" disabled={busy} onClick={saveDraft}>{ui.saveDraft}</button>}
              {canPrepare && preparationEditing && <button className="primary" disabled={busy || items.every((item) => !(Number(item.preparedQuantity) > 0))} onClick={() => changeStatus("ready")}>{ui.done}</button>}
            </>
          )}
          {order.status === "ready" && canRollback && !order.parentOrderId && (
            <button className="secondary" disabled={busy} onClick={() => { setRollbackReason(""); setRollbackTarget("preparing"); }}>{ui.back}</button>
          )}
          {["ready", "delivered"].includes(order.status) && workflowRole === "owner" && correctingPrepared && (
            <>
              <button className="secondary" disabled={busy} onClick={() => { setItems(order.items.map((item) => ({ ...item }))); setPreparedCorrectionReason(""); setCorrectingPrepared(false); }}>Vazgeç</button>
              <button className="primary" disabled={busy} onClick={savePreparedCorrection}>Düzeltmeyi kaydet</button>
            </>
          )}
          {order.status === "ready" && canDeliver && order.despatchReady && (
            <>
              <button
                className="primary"
                disabled={busy || (!canDeliverWithoutProof && (!deliveryNote.trim() || !hasDeliveryProof))}
                onClick={() => void deliverSelected()}
              >
                {deliverySelection.every((entry) => entry.selected) ? ui.delivered : "Seçilenleri teslim et"}
              </button>
            </>
          )}
        </div>
      </Modal>
      {rollbackTarget && (
        <Modal
          title="Siparişi geri gönder"
          subtitle={`${statusMeta[order.status]?.label || order.status} aşamasından ${statusMeta[rollbackTarget]?.label || rollbackTarget} aşamasına gönderilecek.`}
          onClose={() => { if (!busy) { setRollbackTarget(null); setRollbackReason(""); } }}
        >
          <label className="field full">
            <span>Geri gönderme nedeni</span>
            <textarea
              autoFocus
              rows={4}
              maxLength={500}
              value={rollbackReason}
              onChange={(event) => setRollbackReason(event.target.value)}
              placeholder="Neden geri gönderildiğini açıklayın"
            />
          </label>
          <div className="modal-actions">
            <button className="secondary" type="button" disabled={busy} onClick={() => { setRollbackTarget(null); setRollbackReason(""); }}>Vazgeç</button>
            <button className="primary" type="button" disabled={busy || !rollbackReason.trim()} onClick={() => void changeStatus(rollbackTarget, rollbackReason)}>Geri gönder</button>
          </div>
        </Modal>
      )}
      {previewAttachment && (
        <DocumentPreview
          attachment={previewAttachment}
          language={language}
          onClose={() => setPreviewAttachment(null)}
          onPrint={() => printAttachment(previewAttachment)}
        />
      )}
      {approvalOpen && (
        <ApprovalFormEditor
          key={order.id}
          order={order}
          customers={customers}
          printSettings={printSettings}
          session={session}
          language={language}
          packingMode={approvalMode === "packing"}
          allowApproval={false}
          onClose={() => setApprovalOpen(false)}
          onSaved={(next) => {
            onChanged(next);
            if (next.approvalForm?.status === "approved" && next.approvalForm.archive?.path) onShowApprovalPdf(next);
          }}
        />
      )}
    </>
  );
}

function ApprovalFormEditor({
  order,
  customers,
  printSettings,
  session,
  language,
  initialAction = "view",
  allowApproval = false,
  previewOnly = false,
  packingMode = false,
  onClose,
  onSaved,
}: {
  order: Order;
  customers: Customer[];
  printSettings: CompanyPrintSettings;
  session: Session;
  language: Language;
  initialAction?: "view" | "edit" | "approve" | "reject";
  allowApproval?: boolean;
  previewOnly?: boolean;
  packingMode?: boolean;
  onClose: () => void;
  onSaved: (order: Order) => void;
}) {
  const paperRef = useRef<HTMLElement | null>(null);
  const initial = useMemo<ApprovalForm>(
    () => {
      const normalizedCustomerName = order.customerName.trim().toLocaleLowerCase("tr");
      const customer = customers.find(
        (item) => item.name.trim().toLocaleLowerCase("tr") === normalizedCustomerName,
      );
      const customerPrice = (productCode: string) =>
        Number(customer?.prices?.[productCode.trim().toLocaleUpperCase("tr")]);
      return (
      order.approvalForm
        ? {
            ...order.approvalForm,
            lines: order.approvalForm.lines.map((line) => {
              const sourceItem = safeItems(order).find((item) => Number(item.productId) === Number(line.productId));
              const sourceRollCount = Number(sourceItem?.preparedRollCount) > 0
                ? Number(sourceItem?.preparedRollCount)
                : Number(sourceItem?.orderedRollCount) || 0;
              return Number(line.rollCount) > 0 ? line : { ...line, rollCount: sourceRollCount };
            }),
            documentType: order.approvalForm.documentType ?? "domestic",
            proformaNumber:
              order.approvalForm.proformaNumber ?? `PRF-${order.number.replace(/\D/g, "")}`,
            invoiceNumber: order.approvalForm.invoiceNumber ?? "",
            shipmentDate: order.approvalForm.shipmentDate ?? order.approvalForm.date,
            revisionDate: localDateTimeInput(order.approvalForm.revisionDate ?? order.approvalForm.date),
            salesRepresentative:
              order.approvalForm.salesRepresentative ?? customer?.salesRepresentative ?? "",
            salesRepresentativeUserId:
              order.approvalForm.salesRepresentativeUserId ?? customer?.salesRepresentativeUserId ?? "",
            overallDiscountRate: order.approvalForm.overallDiscountRate ?? 0,
            priceSource: order.approvalForm.priceSource ?? "DEPO",
            priceFactor: 1,
            packageType: order.approvalForm.packageType ?? "STANDARD EXPORT PACKAGING",
            productDescription: order.approvalForm.productDescription ?? "PVC FOIL",
            incoterm: order.approvalForm.incoterm ?? "FCA Istanbul, Türkiye - Incoterms® 2020",
            shipmentPort: order.approvalForm.shipmentPort ?? "Istanbul / Türkiye",
            destination: order.approvalForm.destination ?? customer?.address ?? "",
            countryOfOrigin: order.approvalForm.countryOfOrigin ?? "CHINA",
            bankName: order.approvalForm.bankName ?? "ALBARAKA TÜRK PARTICIPATION BANK",
            swiftCode: order.approvalForm.swiftCode ?? "BTFHTRISXXX",
            iban: order.approvalForm.iban ?? "TR56 0020 3000 0998 7324 0000 02",
            buyerOrderNumber: order.approvalForm.buyerOrderNumber ?? "",
            transportMode: order.approvalForm.transportMode ?? "ROAD",
            vehicleContainerNumber: order.approvalForm.vehicleContainerNumber ?? "",
            transportDocumentNumber: order.approvalForm.transportDocumentNumber ?? "",
            loadingPlace: order.approvalForm.loadingPlace ?? "Istanbul / Türkiye",
            marksAndNumbers: order.approvalForm.marksAndNumbers ?? "",
            freightAmount: order.approvalForm.freightAmount ?? 0,
            insuranceAmount: order.approvalForm.insuranceAmount ?? 0,
            exporterDeclaration: order.approvalForm.exporterDeclaration ?? "We hereby certify that the information contained in this invoice is true and correct.",
          }
        : {
        number: `SOF-${order.number.replace(/\D/g, "")}`,
        documentType: order.isExport || customer?.customerType === "foreign" ? "proforma" : "domestic",
        proformaNumber: `PRF-${order.number.replace(/\D/g, "")}`,
        invoiceNumber: "",
        shipmentDate: new Date().toISOString().slice(0, 10),
        date: new Date().toISOString().slice(0, 10),
        revisionDate: localDateTimeInput(),
        salesRepresentative: customer?.salesRepresentative ?? "",
        salesRepresentativeUserId: customer?.salesRepresentativeUserId ?? "",
        currency: "USD",
        exchangeRate: 1,
        priceSource: "DEPO",
        priceFactor: 1,
        vatIncluded: false,
        lines: safeItems(order).map((item) => ({
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          quantity: Number(item.preparedQuantity ?? item.quantity) || 0,
          rollCount: Number(item.preparedRollCount) > 0 ? Number(item.preparedRollCount) : (Number(item.orderedRollCount) || 0),
          unitPrice: Number.isFinite(customerPrice(item.productCode))
            ? customerPrice(item.productCode)
            : 0,
          discountRate: 0,
          vatRate: order.isExport || customer?.customerType === "foreign" ? 0 : 20,
        })),
        overallDiscountRate: customer?.customerType === "foreign" ? defaultExportDiscount(customer.name) : 0,
        extraCharge: 0,
        extraChargeLabel: "Nakliye / ek ücret",
        paymentTerms: "",
        deliveryTerms: "",
        note: order.note ?? "",
        customerName: customer?.name ?? order.customerName,
        customerContact: customer?.contact ?? "",
        customerAddress: customer?.address ?? "",
        customerPhone: customer?.phone ?? "",
        customerEmail: customer?.email ?? "",
        customerTaxOffice: "",
        customerTaxNumber: "",
        packageType: "STANDARD EXPORT PACKAGING",
        productDescription: "PVC FOIL",
        incoterm: "FCA Istanbul, Türkiye - Incoterms® 2020",
        shipmentPort: "Istanbul / Türkiye",
        destination: customer?.address ?? "",
        countryOfOrigin: "CHINA",
        bankName: "ALBARAKA TÜRK PARTICIPATION BANK",
        swiftCode: "BTFHTRISXXX",
        iban: "TR56 0020 3000 0998 7324 0000 02",
        buyerOrderNumber: "",
        transportMode: "ROAD",
        vehicleContainerNumber: "",
        transportDocumentNumber: "",
        loadingPlace: "Istanbul / Türkiye",
        marksAndNumbers: "",
        freightAmount: 0,
        insuranceAmount: 0,
        exporterDeclaration: "We hereby certify that the information contained in this invoice is true and correct.",
        status: "draft",
      });
    },
    [order, customers],
  );
  const [form, setForm] = useState<ApprovalForm>(() => packingMode && order.exportPackingRequired ? {
    ...initial,
    documentType: "packing_list",
    shipmentDate: new Date().toISOString().slice(0, 10),
    status: "draft",
    approvedAt: undefined,
    approvedBy: undefined,
    archive: undefined,
    palletDistribution: balancedPalletDistribution(initial.lines.reduce((sum, line) => sum + Math.max(0, Math.trunc(Number(line.rollCount) || 0)), 0)),
    palletDetails: [],
  } : initial);
  const [printPriceFactor, setPrintPriceFactor] = useState<1 | 0.5>(1);
  const editableSnapshot = (value: ApprovalForm, displayFactor: 1 | 0.5 = 1) => {
    const content: Partial<ApprovalForm> = { ...value };
    content.lines = value.lines.map((line) => ({ ...line, unitPrice: Number((line.unitPrice / displayFactor).toFixed(4)) }));
    delete content.priceFactor;
    delete content.status;
    delete content.approvedAt;
    delete content.approvedBy;
    delete content.updatedAt;
    delete content.updatedBy;
    delete content.archive;
    return JSON.stringify(content);
  };
  const approvedContentSnapshot = useRef(editableSnapshot(form));
  const hasFormChanges = editableSnapshot(form, printPriceFactor) !== approvedContentSnapshot.current;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [archivePath, setArchivePath] = useState(initial.archive?.windowsPath ?? initial.archive?.path ?? "");
  const [archiveActionNotice, setArchiveActionNotice] = useState("");
  const [palletMoveTargets, setPalletMoveTargets] = useState<Record<string, number>>({});
  const [palletMoveCounts, setPalletMoveCounts] = useState<Record<string, number>>({});
  const [palletMoveQuantities, setPalletMoveQuantities] = useState<Record<string, number>>({});
  const [activePalletMoveKey, setActivePalletMoveKey] = useState("");
  const [packingStep, setPackingStep] = useState<1 | 2>(initial.palletAllocations?.length ? 2 : 1);
  const actorOwnsOrder = order.createdByUserId ? order.createdByUserId === session.id : representativeIdentity(order.createdBy) === representativeIdentity(session.name);
  const actorIsAssignedRepresentative = order.approvalForm?.salesRepresentativeUserId === session.id || Boolean(representativeIdentity(order.approvalForm?.salesRepresentative) && representativeIdentity(order.approvalForm?.salesRepresentative) === representativeIdentity(session.name));
  const canEditRejectedOwn = order.approvalForm?.status === "rejected" && workflowRole(session.role) === "sales" && (actorOwnsOrder || actorIsAssignedRepresentative);
  const canEdit = workflowRole(session.role) === "owner" || Boolean(session.permissions?.includes("order_forms.edit")) || canEditRejectedOwn || (order.exportPackingRequired && (workflowRole(session.role) === "warehouse" || Boolean(session.permissions?.includes("orders.prepare"))));
  const [editing, setEditing] = useState(
    (packingMode && order.exportPackingRequired) ||
    initialAction === "edit" ||
    (!order.approvalForm && canEdit) ||
    (initial.status === "rejected" && canEdit),
  );
  const automaticApprovalStarted = useRef(false);
  const [ratePublicationDate, setRatePublicationDate] = useState("");
  const totals = useMemo(() => approvalTotals(form), [form]);
  const packingTotalRolls = useMemo(() => form.lines.reduce((sum, line) => sum + Math.max(0, Math.trunc(Number(line.rollCount) || 0)), 0), [form.lines]);
  const packingDistribution = useMemo(() => form.palletDistribution?.length ? form.palletDistribution : balancedPalletDistribution(packingTotalRolls), [form.palletDistribution, packingTotalRolls]);
  const packingAllocations = useMemo(() => form.palletAllocations?.length === packingDistribution.length
    ? form.palletAllocations
    : packingAllocationsFromPlan(form.lines, packingDistribution), [form.lines, form.palletAllocations, packingDistribution]);
  const packingPlan = useMemo(() => packingAllocations.map((items, index) => ({
    number: index + 1,
    rollCount: items.reduce((sum, item) => sum + item.rolls, 0),
    remaining: 0,
    items: items.map((item) => {
      const line = form.lines[item.lineIndex];
      const totalRolls = Math.max(1, Number(line?.rollCount) || 0);
      return { line, lineIndex: item.lineIndex, rolls: item.rolls, quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : Number(line?.quantity || 0) * item.rolls / totalRolls };
    }).filter((item) => item.line),
  })), [form.lines, packingAllocations]);
  const packingProductChecks = useMemo(() => form.lines.map((line, lineIndex) => {
    const assignedRolls = packingAllocations.reduce((sum, entries) => sum + entries.filter((entry) => entry.lineIndex === lineIndex).reduce((entrySum, entry) => entrySum + entry.rolls, 0), 0);
    const assignedQuantity = packingAllocations.reduce((sum, entries) => sum + entries.filter((entry) => entry.lineIndex === lineIndex).reduce((entrySum, entry) => entrySum + Number(entry.quantity || 0), 0), 0);
    const orderedRolls = Math.max(0, Math.trunc(Number(line.rollCount) || 0));
    const orderedQuantity = Math.max(0, Number(line.quantity) || 0);
    return { line, lineIndex, assignedRolls, assignedQuantity, orderedRolls, orderedQuantity, rollDifference: assignedRolls - orderedRolls, quantityDifference: assignedQuantity - orderedQuantity };
  }), [form.lines, packingAllocations]);
  const packingHasMismatch = packingProductChecks.some((check) => check.rollDifference !== 0 || Math.abs(check.quantityDifference) > 0.02);
  const packingPalletDetails = useMemo(() => packingDistribution.map((_, index) => form.palletDetails?.[index] ?? ({ grossWeight: 0, tareWeight: 0, lengthCm: 0, widthCm: 0, heightCm: 0 })), [form.palletDetails, packingDistribution]);
  const isProforma = form.documentType !== "domestic";
  const isPackingList = form.documentType === "packing_list";
  const isCommercialInvoice = form.documentType === "commercial_invoice";
  const isPackingTask = packingMode && order.exportPackingRequired && isPackingList;
  const exportDocumentTitle = form.documentType === "commercial_invoice" ? "Commercial Invoice" : isPackingList ? "Packing List" : "Proforma Invoice";
  const exportExtraChargeLabel = form.extraChargeLabel?.trim().toLocaleLowerCase("tr-TR") === "nakliye / ek ücret"
    ? "Freight / additional charge"
    : form.extraChargeLabel;
  const switchExportDocument = (documentType: "proforma" | "commercial_invoice" | "packing_list") => {
    if (form.documentType === documentType) return;
    setError("");
    const isShipmentDocument = documentType === "commercial_invoice" || documentType === "packing_list";
    const wasShipmentDocument = form.documentType === "commercial_invoice" || form.documentType === "packing_list";
    setForm((current) => ({
      ...current,
      documentType,
      palletDistribution: documentType === "packing_list"
        ? (current.palletDistribution?.length ? current.palletDistribution : balancedPalletDistribution(current.lines.reduce((sum, line) => sum + Math.max(0, Math.trunc(Number(line.rollCount) || 0)), 0)))
        : current.palletDistribution,
      palletDetails: documentType === "packing_list" ? (current.palletDetails ?? []) : current.palletDetails,
      shipmentDate: isShipmentDocument && !wasShipmentDocument
        ? new Date().toISOString().slice(0, 10)
        : current.shipmentDate,
      currency: current.currency === "TRY" ? "USD" : current.currency,
      countryOfOrigin: current.countryOfOrigin || "CHINA",
      overallDiscountRate: current.overallDiscountRate === 0
        ? defaultExportDiscount(current.customerName ?? "")
        : current.overallDiscountRate,
      lines: current.lines.map((line) => ({ ...line, vatRate: 0 })),
      status: "draft",
      approvedAt: undefined,
      approvedBy: undefined,
      archive: undefined,
    }));
    setArchivePath("");
  };
  const selectedCustomer = useMemo(() => {
    const name = order.customerName.trim().toLocaleLowerCase("tr");
    return customers.find((customer) => customer.name.trim().toLocaleLowerCase("tr") === name);
  }, [customers, order.customerName]);
  const applyCustomerPriceMode = (priceSource: "DEPO" | "ANTREPO_TRANSIT", priceFactor: 1 | 0.5) => {
    const sourcePrices = selectedCustomer?.priceLists?.[priceSource] ?? selectedCustomer?.prices ?? {};
    setPrintPriceFactor(priceFactor);
    setForm((current) => ({
      ...current,
      priceSource,
      priceFactor: 1,
      lines: current.lines.map((line) => {
        const price = Number(sourcePrices[line.productCode.trim().toLocaleUpperCase("tr")]);
        return Number.isFinite(price) ? { ...line, unitPrice: Number((price * priceFactor).toFixed(4)) } : line;
      }),
    }));
  };
  const vatRateLabel = useMemo(() => {
    const rates = Array.from(
      new Set(form.lines.map((line) => Number(line.vatRate) || 0)),
    ).sort((left, right) => left - right);
    return rates.length === 1
      ? `KDV (%${rates[0]})`
      : `KDV (${rates.map((rate) => `%${rate}`).join(", ")})`;
  }, [form.lines]);
  approvalDisplayRate = Number(form.exchangeRate) || 0;
  useEffect(() => {
    if (!canEdit) return;
    const setPresence = (active: boolean) => api(`/api/orders/${order.id}/approval-form/presence`, {
      method: "POST",
      body: JSON.stringify({ active }),
    }).catch(() => undefined);
    void setPresence(true);
    const timer = window.setInterval(() => void setPresence(true), 12_000);
    return () => {
      window.clearInterval(timer);
      void setPresence(false);
    };
  }, [canEdit, order.id]);
  useEffect(() => {
    if (form.documentType !== "domestic") {
      setRatePublicationDate("");
      setForm((current) => Number(current.exchangeRate) === 1 ? current : ({ ...current, exchangeRate: 1 }));
      return;
    }
    let cancelled = false;
    api<{ rate: number; date: string }>(
      `/api/orders/exchange-rate?currency=${form.currency}&date=${form.date}`,
    )
      .then((result) => {
        if (!cancelled) {
          setForm((current) => ({ ...current, exchangeRate: result.rate }));
          setRatePublicationDate(result.date);
        }
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error ? cause.message : "TCMB kuru alınamadı.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [form.currency, form.date, form.documentType]);
  const labels =
    language === "az"
      ? {
          title: "Sifariş təsdiq formu",
          save: "Yadda saxla və təsdiqə göndər",
          approve: "Təsdiqlə",
          print: "Çap et",
          preview: "A4 önizləmə",
        }
      : language === "en"
        ? {
            title: "Order confirmation form",
            save: "Save and send for approval",
            approve: "Approve",
            print: "Print",
            preview: "A4 preview",
          }
        : language === "ru"
          ? {
              title: "Форма подтверждения заказа",
              save: "Сохранить и отправить на согласование",
              approve: "Подтвердить",
              print: "Печать",
              preview: "Предпросмотр A4",
            }
          : {
              title: "Sipariş onay formu",
              save: "Kaydet ve onaya gönder",
              approve: "Onayla",
              print: "Yazdır",
              preview: "A4 önizleme",
            };
  const updateLine = (index: number, patch: Partial<ApprovalFormLine>) =>
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    }));
  const addManualExportLine = () => setForm((current) => ({
    ...current,
    lines: [...current.lines, {
      productId: null, productCode: "", productName: "", quantity: 1, rollCount: 0,
      width: 1, unitPrice: 0, discountRate: 0, vatRate: 0, unit: "PCS", unitsPerBox: 1, manual: true,
    }],
  }));
  const removeManualExportLine = (index: number) => setForm((current) => ({
    ...current,
    lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
  }));
  const normalizedSessionName = representativeIdentity(session.name);
  const normalizedRepresentative = representativeIdentity(form.salesRepresentative);
  const ownsOrder = order.createdByUserId ? order.createdByUserId === session.id : order.createdBy.trim().toLocaleLowerCase("tr") === normalizedSessionName;
  const isAssignedRepresentative = form.salesRepresentativeUserId === session.id || Boolean(normalizedRepresentative && normalizedRepresentative === normalizedSessionName);
  const canApprove = allowApproval && (
    workflowRole(session.role) === "owner" ||
    Boolean(session.permissions?.includes("order_forms.approve")) ||
    ((Boolean(session.permissions?.includes("orders.approve")) || workflowRole(session.role) === "sales") && (ownsOrder || isAssignedRepresentative)));
  const rejectForm = async () => {
    const reason = window.prompt("Ret sebebini yazın:", "");
    if (reason === null) return;
    if (!reason.trim()) { setError("Ret sebebi zorunludur."); return; }
    setBusy(true);
    setError("");
    try {
      const next = await api<Order>(`/api/orders/${order.id}/approval-form/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      onSaved(next);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sipariş formu reddedilemedi.");
    } finally { setBusy(false); }
  };
  const save = async (status: ApprovalForm["status"]) => {
    setBusy(true);
    setError("");
    try {
      if (form.documentType === "packing_list") {
        const plannedRolls = packingDistribution.reduce((sum, value) => sum + Math.max(0, Math.trunc(Number(value) || 0)), 0);
        if (plannedRolls !== packingTotalRolls) throw new Error(`Palet planı ${plannedRolls} rulo, ürünler ise ${packingTotalRolls} rulo içeriyor.`);
        if (!packingAllocations.length) throw new Error("Önce palet sayılarını yazıp dağılım listesini oluşturun.");
        if (packingHasMismatch) throw new Error("Paletlerdeki rulo ve metre toplamları siparişle uyuşmuyor. Kırmızı uyarıları düzeltin.");
        const invalidPallet = packingPalletDetails.findIndex((detail) => detail.grossWeight <= 0 || detail.tareWeight < 0 || detail.tareWeight > 20 || detail.tareWeight >= detail.grossWeight || detail.lengthCm <= 0 || detail.widthCm <= 0 || detail.heightCm <= 0);
        if (invalidPallet >= 0) throw new Error(`Palet ${invalidPallet + 1} için brüt ağırlık, en fazla 20 kg dara ve ölçüler eksiksiz girilmelidir.`);
      }
      const persistedForm: ApprovalForm = {
        ...form,
        palletDistribution: form.documentType === "packing_list" ? packingDistribution : form.palletDistribution,
        palletAllocations: form.documentType === "packing_list" ? packingAllocations : form.palletAllocations,
        palletDetails: form.documentType === "packing_list" ? packingPalletDetails : form.palletDetails,
        priceFactor: 1,
        lines: form.lines.map((line) => ({ ...line, unitPrice: Number((line.unitPrice / printPriceFactor).toFixed(4)) })),
      };
      const next = await api<Order>(`/api/orders/${order.id}/approval-form`, {
        method: "PUT",
        body: JSON.stringify({ ...persistedForm, status }),
      });
      const savedForm = next.approvalForm ?? persistedForm;
      setForm({ ...savedForm, priceFactor: 1, lines: savedForm.lines.map((line) => ({ ...line, unitPrice: Number((line.unitPrice * printPriceFactor).toFixed(4)) })) });
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      if (!paperRef.current) throw new Error("A4 önizleme bulunamadı.");
      await document.fonts.ready;
      const css = Array.from(document.styleSheets)
        .flatMap((sheet) => {
          try { return Array.from(sheet.cssRules, (rule) => rule.cssText); }
          catch { return []; }
        })
        .join("\n");
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${paperRef.current.outerHTML}</body></html>`;
      const archived = await api<{ path: string; filename: string; order: Order }>(
        `/api/orders/${order.id}/approval-form/archive`,
        { method: "POST", body: JSON.stringify({ html }) },
      );
      setArchivePath(archived.path);
      const archivedForm = archived.order.approvalForm ?? next.approvalForm ?? persistedForm;
      approvedContentSnapshot.current = editableSnapshot(archivedForm);
      setForm({ ...archivedForm, priceFactor: 1, lines: archivedForm.lines.map((line) => ({ ...line, unitPrice: Number((line.unitPrice * printPriceFactor).toFixed(4)) })) });
      onSaved(archived.order);
      if (status === "approved") onClose();
      else setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Form kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (initialAction !== "approve" || !canApprove || form.status === "approved" || automaticApprovalStarted.current) return;
    automaticApprovalStarted.current = true;
    void save("approved");
  }, [initialAction, canApprove, form.status]);
  useEffect(() => {
    if (initialAction !== "reject" || !canApprove || form.status === "approved" || automaticApprovalStarted.current) return;
    automaticApprovalStarted.current = true;
    void rejectForm();
  }, [initialAction, canApprove, form.status]);
  const openArchiveFolder = async () => {
    setError("");
    setArchiveActionNotice("");
    const folderPath = archivePath.replace(/[\\/][^\\/]+$/, "");
    if (!folderPath) {
      setError("Açılacak klasör yolu bulunamadı.");
      return;
    }
    try {
      if (!/Windows/i.test(navigator.userAgent)) {
        await navigator.clipboard.writeText(folderPath);
        setArchiveActionNotice("Bu cihaz klasör açmayı desteklemiyor. Ağ klasörü yolu panoya kopyalandı.");
        return;
      }
      await navigator.clipboard.writeText(folderPath);
      const bytes = new TextEncoder().encode(folderPath);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const encodedPath = btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      window.location.href = `arix-folder:${encodedPath}`;
      setArchiveActionNotice("Klasör açma isteği bu bilgisayara gönderildi. Açılmıyorsa aşağıdaki klasör açıcıyı bu bilgisayara bir kez kurun.");
    } catch {
      try {
        await navigator.clipboard.writeText(folderPath);
        setArchiveActionNotice("Klasör doğrudan açılamadı. Ağ klasörü yolu panoya kopyalandı; Dosya Gezgini adres çubuğuna yapıştırın.");
      } catch {
        setError("Klasör açılamadı ve yolu panoya kopyalanamadı.");
      }
    }
  };
  const copyArchivePath = async () => {
    setError("");
    setArchiveActionNotice("");
    try {
      const folderPath = archivePath.replace(/[\\/][^\\/]+$/, "");
      await navigator.clipboard.writeText(folderPath || archivePath);
      setArchiveActionNotice("Siparişin bulunduğu klasör yolu panoya kopyalandı.");
    } catch {
      setError("Dosya yolu kopyalanamadı. Yolu seçip elle kopyalayın.");
    }
  };
  const print = async () => {
    if (!paperRef.current) return;
    await document.fonts.ready;
    const css = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try { return Array.from(sheet.cssRules, (rule) => rule.cssText); }
        catch { return []; }
      })
      .join("\n");
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument;
    if (!frameDocument) return frame.remove();
    frameDocument.open();
    frameDocument.write(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${paperRef.current.outerHTML}</body></html>`);
    frameDocument.close();
    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 30_000);
    }, 350);
  };
  return (
    <Modal
      title={isProforma ? exportDocumentTitle : labels.title}
      subtitle={`${order.customerName} · ${order.number}`}
      onClose={onClose}
      wide
      showBack
      className={`approval-modal ${isPackingTask ? "packing-task-only" : ""} ${previewOnly && !editing ? "preview-only" : ""}`}
    >
      {isProforma && (
        <nav className="approval-document-switch" aria-label="Export document view">
          <button type="button" className={form.documentType === "proforma" ? "active" : ""} onClick={() => switchExportDocument("proforma")}>Proforma</button>
          <button type="button" className={form.documentType === "commercial_invoice" ? "active" : ""} onClick={() => switchExportDocument("commercial_invoice")}>Commercial Invoice</button>
          <button type="button" className={form.documentType === "packing_list" ? "active" : ""} onClick={() => switchExportDocument("packing_list")}>Packing List</button>
        </nav>
      )}
      <div className="approval-workspace">
        <section className={`approval-editor ${editing ? "" : "is-readonly"}`} aria-disabled={!editing}>
          <div className="approval-fields four">
            <label>
              {isProforma ? "Document type" : "Belge türü"}
              <select
                value={form.documentType ?? "domestic"}
                onChange={(event) => {
                  const documentType = event.target.value as ApprovalForm["documentType"];
                  if (documentType === "proforma" || documentType === "commercial_invoice" || documentType === "packing_list") {
                    switchExportDocument(documentType);
                    return;
                  }
                  setForm({
                    ...form,
                    documentType,
                    proformaNumber: form.proformaNumber || `PRF-${order.number.replace(/\D/g, "")}`,
                  });
                }}
              >
                <option value="domestic">Domestic - Order Confirmation</option>
                <option value="proforma">Export - Proforma Invoice</option>
                <option value="commercial_invoice">Export - Commercial Invoice</option>
                <option value="packing_list">Export - Packing List</option>
              </select>
            </label>
            <label>
              {isProforma ? "Form number" : "Form no"}
              <input
                value={form.number}
                onChange={(event) =>
                  setForm({ ...form, number: event.target.value })
                }
              />
            </label>
            {isProforma && <label>
              Proforma Number
              <input value={form.proformaNumber ?? ""} readOnly />
            </label>}
            {isProforma && <label>
              Invoice Number
              <input
                placeholder="Commercial invoice number"
                required={form.documentType === "commercial_invoice" || form.documentType === "packing_list"}
                value={form.invoiceNumber ?? ""}
                onChange={(event) => setForm({ ...form, invoiceNumber: event.target.value })}
              />
            </label>}
            {(form.documentType === "commercial_invoice" || form.documentType === "packing_list") && <label>
              Document Date
              <input type="date" required value={form.shipmentDate ?? form.date} onChange={(event) => setForm({ ...form, shipmentDate: event.target.value })} />
            </label>}
            <label>
              {form.documentType === "commercial_invoice" || form.documentType === "packing_list" ? "Proforma Date" : isProforma ? "Issue date" : "Belge tarihi"}
              <input
                type="date"
                value={form.date}
                readOnly={form.documentType === "commercial_invoice" || form.documentType === "packing_list"}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
              />
            </label>
            <label>
              {isProforma ? "Sales representative" : "Satış temsilcisi"}
              <input
                list="approval-sales-representatives"
                value={form.salesRepresentative ?? ""}
                onChange={(event) =>
                  setForm({ ...form, salesRepresentative: event.target.value })
                }
              />
              <datalist id="approval-sales-representatives"><option value="Serkan Şeremet" /><option value="Mustafa Yazman" /><option value="Ekrem Tiryaki" /></datalist>
            </label>
            <label>
              {isProforma ? "Currency" : "Para birimi"}
              <select
                value={form.currency}
                onChange={(event) =>
                  setForm({
                    ...form,
                    currency: event.target.value as ApprovalForm["currency"],
                  })
                }
              >
                <option>USD</option>
                <option>EUR</option>
                {!isProforma && <option>TRY</option>}
              </select>
            </label>
            {isProforma && <label>
              Price source
              <select
                value={form.priceSource ?? "DEPO"}
                onChange={(event) => applyCustomerPriceMode(event.target.value as "DEPO" | "ANTREPO_TRANSIT", form.priceFactor ?? 1)}
              >
                <option value="DEPO">Warehouse</option>
                <option value="ANTREPO_TRANSIT">Bonded warehouse / Transit</option>
              </select>
            </label>}
            {isProforma && <label>
              Pricing
              <select
                value={String(printPriceFactor)}
                onChange={(event) => applyCustomerPriceMode(form.priceSource ?? "DEPO", Number(event.target.value) === 0.5 ? 0.5 : 1)}
              >
                <option value="1">Full price</option>
                <option value="0.5">Half price (0.5)</option>
              </select>
            </label>}
            {!isProforma && <label>
              TCMB efektif satış kuru
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                value={form.exchangeRate}
                onChange={(event) =>
                  setForm({ ...form, exchangeRate: Number(event.target.value) })
                }
              />
              <small>
                {ratePublicationDate
                  ? `${ratePublicationDate} tarihli efektif satış kuru`
                  : "Kur alınıyor..."}
              </small>
            </label>}
          </div>
          {isProforma && <div className="approval-customer-fields approval-export-fields">
            <label><span>Packaging</span><input value={form.packageType ?? ""} onChange={(event) => setForm({ ...form, packageType: event.target.value })} /></label>
            <label><span>Description</span><input value={form.productDescription ?? ""} onChange={(event) => setForm({ ...form, productDescription: event.target.value })} /></label>
            <label><span>Delivery Term</span><input value={form.incoterm ?? ""} onChange={(event) => setForm({ ...form, incoterm: event.target.value })} /></label>
            <label><span>Shipment Port</span><input value={form.shipmentPort ?? ""} onChange={(event) => setForm({ ...form, shipmentPort: event.target.value })} /></label>
            <label><span>Destination</span><input value={form.destination ?? ""} onChange={(event) => setForm({ ...form, destination: event.target.value })} /></label>
            <label><span>Country of Origin</span><input value={form.countryOfOrigin ?? ""} onChange={(event) => setForm({ ...form, countryOfOrigin: event.target.value })} /></label>
            <label><span>Bank</span><input value={form.bankName ?? ""} onChange={(event) => setForm({ ...form, bankName: event.target.value })} /></label>
            <label><span>SWIFT Code</span><input value={form.swiftCode ?? ""} onChange={(event) => setForm({ ...form, swiftCode: event.target.value })} /></label>
            <label className="wide-field"><span>IBAN</span><input value={form.iban ?? ""} onChange={(event) => setForm({ ...form, iban: event.target.value })} /></label>
          </div>}
          {isCommercialInvoice && <section className="approval-commercial-fields">
            <div className="approval-commercial-fields-head">
              <div><b>Customs & shipment</b><small>Commercial invoice shipping and customs information</small></div>
            </div>
            <div className="approval-customer-fields approval-export-fields">
              <label><span>Buyer PO / Contract No.</span><input value={form.buyerOrderNumber ?? ""} onChange={(event) => setForm({ ...form, buyerOrderNumber: event.target.value })} /></label>
              <label><span>Transport Mode</span><select value={form.transportMode ?? "ROAD"} onChange={(event) => setForm({ ...form, transportMode: event.target.value })}><option value="ROAD">Road</option><option value="SEA">Sea</option><option value="AIR">Air</option><option value="RAIL">Rail</option><option value="MULTIMODAL">Multimodal</option></select></label>
              <label><span>Vehicle / Container No.</span><input value={form.vehicleContainerNumber ?? ""} onChange={(event) => setForm({ ...form, vehicleContainerNumber: event.target.value })} /></label>
              <label><span>CMR / B/L / AWB No.</span><input value={form.transportDocumentNumber ?? ""} onChange={(event) => setForm({ ...form, transportDocumentNumber: event.target.value })} /></label>
              <label><span>Place of Loading</span><input value={form.loadingPlace ?? ""} onChange={(event) => setForm({ ...form, loadingPlace: event.target.value })} /></label>
              <label><span>Marks & Numbers</span><input value={form.marksAndNumbers ?? ""} onChange={(event) => setForm({ ...form, marksAndNumbers: event.target.value })} /></label>
              <label><span>Freight ({form.currency})</span><input type="number" min="0" step="0.01" value={form.freightAmount || ""} onChange={(event) => setForm({ ...form, freightAmount: Number(event.target.value) })} /></label>
              <label><span>Insurance ({form.currency})</span><input type="number" min="0" step="0.01" value={form.insuranceAmount || ""} onChange={(event) => setForm({ ...form, insuranceAmount: Number(event.target.value) })} /></label>
              <label className="wide-field"><span>Exporter Declaration</span><textarea rows={2} value={form.exporterDeclaration ?? ""} onChange={(event) => setForm({ ...form, exporterDeclaration: event.target.value })} /></label>
            </div>
          </section>}
          <div className="approval-customer-fields">
            <label>
              {isProforma ? "Customer / company name" : "Müşteri / firma adı"}
              <input
                value={form.customerName ?? order.customerName}
                onChange={(event) => setForm({ ...form, customerName: event.target.value })}
              />
            </label>
            <label>
              {isProforma ? "Customer contact" : "Müşteri temsilcisi"}
              <input
                value={form.customerContact ?? ""}
                onChange={(event) => setForm({ ...form, customerContact: event.target.value })}
              />
            </label>
            <label>
              {isProforma ? "Phone" : "Telefon"}
              <input
                value={form.customerPhone ?? ""}
                onChange={(event) => setForm({ ...form, customerPhone: event.target.value })}
              />
            </label>
            <label>
              {isProforma ? "Email" : "E-posta"}
              <input
                value={form.customerEmail ?? ""}
                onChange={(event) => setForm({ ...form, customerEmail: event.target.value })}
              />
            </label>
            <label>
              {isProforma ? "Tax office" : "Vergi dairesi"}
              <input
                value={form.customerTaxOffice ?? ""}
                onChange={(event) => setForm({ ...form, customerTaxOffice: event.target.value })}
              />
            </label>
            <label>
              {isProforma ? "VAT / Tax number" : "VKN / TCKN"}
              <input
                value={form.customerTaxNumber ?? ""}
                onChange={(event) => setForm({ ...form, customerTaxNumber: event.target.value })}
              />
            </label>
            <label className="wide-field">
              {isProforma ? "Customer address" : "Müşteri adresi"}
              <input
                value={form.customerAddress ?? ""}
                onChange={(event) => setForm({ ...form, customerAddress: event.target.value })}
              />
            </label>
          </div>
          <label className="approval-toggle">
            <input
              type="checkbox"
              checked={form.vatIncluded}
              onChange={(event) =>
                setForm({ ...form, vatIncluded: event.target.checked })
              }
            />
            <span>{isProforma ? "Prices include VAT" : "KDV fiyatlara dahil"}</span>
          </label>
          {isPackingList && <section className="approval-pallet-planner">
            <div className="approval-pallet-planner-head">
              <div><b>{packingStep === 1 ? "1. Set pallet quantities" : "2. Adjust product and meter allocation"}</b><small>Total: {packingTotalRolls} rolls</small></div>
              <div className="approval-pallet-toolbar">
                {packingStep === 2 && <button type="button" className="secondary" onClick={() => setPackingStep(1)}>Back to pallet quantities</button>}
                <button type="button" className="secondary" onClick={() => {
                  const distribution = balancedPalletDistribution(packingTotalRolls);
                  setForm((current) => ({ ...current, palletDistribution: distribution, palletAllocations: packingAllocationsFromPlan(current.lines, distribution), palletDetails: distribution.map((_, index) => current.palletDetails?.[index] ?? ({ grossWeight: 0, tareWeight: 0, lengthCm: 0, widthCm: 0, heightCm: 0 })), allowSeventeenRollPallet: false }));
                  setPackingStep(2);
                }}>Auto-distribute</button>
                {packingStep === 1 && <button type="button" className="secondary" onClick={() => setForm((current) => ({ ...current, palletDistribution: [...packingDistribution, 0], palletDetails: [...packingPalletDetails, { grossWeight: 0, tareWeight: 0, lengthCm: 0, widthCm: 0, heightCm: 0 }] }))}>+ Add pallet</button>}
              </div>
            </div>
            {packingStep === 1 && <>
              <div className="approval-pallet-distribution setup">
                {packingDistribution.map((rolls, index) => <label key={index}><span>Pallet {index + 1}</span><div><input type="number" min="0" step="1" value={rolls} onChange={(event) => setForm((current) => ({ ...current, palletDistribution: packingDistribution.map((value, palletIndex) => palletIndex === index ? Math.max(0, Math.trunc(Number(event.target.value) || 0)) : value), palletAllocations: undefined }))} /><button type="button" className="danger-quiet" disabled={packingDistribution.length <= 1} onClick={() => setForm((current) => ({ ...current, palletDistribution: packingDistribution.filter((_, palletIndex) => palletIndex !== index), palletDetails: packingPalletDetails.filter((_, palletIndex) => palletIndex !== index), palletAllocations: undefined }))}>Remove</button></div></label>)}
              </div>
              <div className={`approval-pallet-check ${packingDistribution.reduce((sum, value) => sum + value, 0) === packingTotalRolls ? "valid" : "invalid"}`}>Entered: {packingDistribution.reduce((sum, value) => sum + value, 0)} / Order: {packingTotalRolls} rolls</div>
              <button type="button" className="primary approval-pallet-next" disabled={packingDistribution.some((value) => value <= 0) || packingDistribution.reduce((sum, value) => sum + value, 0) !== packingTotalRolls} onClick={() => { setForm((current) => ({ ...current, palletAllocations: packingAllocationsFromPlan(current.lines, packingDistribution), palletDetails: packingDistribution.map((_, index) => current.palletDetails?.[index] ?? ({ grossWeight: 0, tareWeight: 0, lengthCm: 0, widthCm: 0, heightCm: 0 })) })); setPackingStep(2); }}>Create allocation list</button>
            </>}
            {packingStep === 2 && <div className="approval-pallet-details-grid">
              {packingPlan.map((pallet, index) => {
                const rolls = pallet.rollCount;
                const detail = packingPalletDetails[index];
                const updatePalletDetail = (patch: Partial<(typeof packingPalletDetails)[number]>) => setForm((current) => ({
                  ...current,
                  palletDetails: packingPalletDetails.map((item, palletIndex) => palletIndex === index ? { ...item, ...patch } : item),
                }));
                return <div className="approval-pallet-detail" key={`detail-${index}`}>
                  <div className="approval-pallet-card-head"><span><b>Pallet {index + 1}</b><small>{rolls} rolls assigned</small></span><button type="button" className="danger-quiet" disabled={packingPlan.length <= 1 || rolls > 0} title={rolls > 0 ? "Move the products to another pallet before removing this pallet" : "Remove pallet"} onClick={() => setForm((current) => ({ ...current, palletDistribution: packingDistribution.filter((_, palletIndex) => palletIndex !== index), palletAllocations: packingAllocations.filter((_, palletIndex) => palletIndex !== index), palletDetails: packingPalletDetails.filter((_, palletIndex) => palletIndex !== index) }))}>Remove pallet</button></div>
                  <div className="approval-pallet-products">
                    {pallet.items.map((item) => {
                      const key = `${index}-${item.lineIndex}`;
                      const target = palletMoveTargets[key] ?? packingPlan.findIndex((_, targetIndex) => targetIndex !== index);
                      const moveCount = Math.min(item.rolls, Math.max(1, Math.trunc(palletMoveCounts[key] || 1)));
                      const proportionalMoveQuantity = item.rolls > 0 ? Number(item.quantity) * moveCount / item.rolls : 0;
                      const moveQuantity = Math.min(Number(item.quantity), Math.max(0, Number(palletMoveQuantities[key] ?? proportionalMoveQuantity)));
                      const move = (count: number, requestedQuantity?: number) => {
                        if (target < 0 || target === index || count <= 0) return;
                        const next = packingAllocations.map((entries) => entries.map((entry) => ({ ...entry })));
                        const sourceEntry = next[index].find((entry) => entry.lineIndex === item.lineIndex);
                        if (!sourceEntry) return;
                        const actual = Math.min(sourceEntry.rolls, count);
                        const automaticQuantity = Number.isFinite(Number(sourceEntry.quantity)) ? Number(sourceEntry.quantity) * actual / sourceEntry.rolls : Number(item.quantity) * actual / item.rolls;
                        const movedQuantity = Math.min(Number(sourceEntry.quantity ?? item.quantity), Math.max(0, Number.isFinite(Number(requestedQuantity)) ? Number(requestedQuantity) : automaticQuantity));
                        sourceEntry.rolls -= actual;
                        sourceEntry.quantity = Math.max(0, Number(sourceEntry.quantity ?? item.quantity) - movedQuantity);
                        next[index] = next[index].filter((entry) => entry.rolls > 0);
                        const targetEntry = next[target].find((entry) => entry.lineIndex === item.lineIndex);
                        if (targetEntry) { targetEntry.rolls += actual; targetEntry.quantity = Number(targetEntry.quantity || 0) + movedQuantity; }
                        else next[target].push({ lineIndex: item.lineIndex, rolls: actual, quantity: movedQuantity });
                        const distribution = next.map((entries) => entries.reduce((sum, entry) => sum + entry.rolls, 0));
                        setForm((current) => ({ ...current, palletAllocations: next, palletDistribution: distribution }));
                        setActivePalletMoveKey("");
                      };
                      return <article key={key}>
                        <div><b>{item.line.productCode} · {item.line.productName}</b><div className="approval-pallet-amounts"><label><span>Rolls on this pallet</span><input type="number" min="1" step="1" value={item.rolls} onChange={(event) => { const next = packingAllocations.map((entries) => entries.map((entry) => ({ ...entry }))); const entry = next[index].find((candidate) => candidate.lineIndex === item.lineIndex); if (entry) entry.rolls = Math.max(1, Math.trunc(Number(event.target.value) || 1)); const distribution = next.map((entries) => entries.reduce((sum, allocation) => sum + allocation.rolls, 0)); setForm((current) => ({ ...current, palletAllocations: next, palletDistribution: distribution })); }} /></label><label><span>Meters on this pallet</span><input type="number" min="0" step="0.01" value={Number(item.quantity.toFixed(2))} onChange={(event) => { const next = packingAllocations.map((entries) => entries.map((entry) => ({ ...entry }))); const entry = next[index].find((candidate) => candidate.lineIndex === item.lineIndex); if (entry) entry.quantity = Math.max(0, Number(event.target.value) || 0); setForm((current) => ({ ...current, palletAllocations: next })); }} /></label></div></div>
                        {packingPlan.length > 1 && <><button type="button" className="secondary approval-pallet-transfer-trigger" onClick={() => setActivePalletMoveKey(key)}>Move to another pallet</button>{activePalletMoveKey === key && <div className="approval-pallet-transfer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActivePalletMoveKey(""); }}><section className="approval-pallet-transfer-dialog" role="dialog" aria-modal="true" aria-label="Move product to another pallet"><header><div><b>{item.line.productCode} · {item.line.productName}</b><small>Move from pallet {index + 1}</small></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setActivePalletMoveKey("")}>×</button></header><div className="approval-pallet-move"><label><span>Rolls to move</span><input aria-label="Rolls to move" type="number" min="1" max={item.rolls} value={moveCount} onChange={(event) => { const rolls = Math.min(item.rolls, Math.max(1, Math.trunc(Number(event.target.value) || 1))); setPalletMoveCounts((current) => ({ ...current, [key]: rolls })); setPalletMoveQuantities((current) => ({ ...current, [key]: item.rolls > 0 ? Number((Number(item.quantity) * rolls / item.rolls).toFixed(2)) : 0 })); }} /></label><label><span>Meters to move</span><input aria-label="Meters to move" type="number" min="0" max={item.quantity} step="0.01" value={Number(moveQuantity.toFixed(2))} onChange={(event) => setPalletMoveQuantities((current) => ({ ...current, [key]: Math.max(0, Number(event.target.value) || 0) }))} /></label><label><span>Destination pallet</span><select aria-label="Destination pallet" value={target} onChange={(event) => setPalletMoveTargets((current) => ({ ...current, [key]: Number(event.target.value) }))}>{packingPlan.map((_, targetIndex) => targetIndex !== index && <option key={targetIndex} value={targetIndex}>Pallet {targetIndex + 1}</option>)}</select></label><button type="button" className="primary" onClick={() => move(moveCount, moveQuantity)}>Move selected</button><button type="button" className="secondary approval-pallet-move-all" onClick={() => move(item.rolls, item.quantity)}>Move entire product</button></div></section></div>}</>}
                      </article>;
                    })}
                    {!pallet.items.length && <small>This pallet is empty. Move products from another pallet.</small>}
                  </div>
                  <label><span>Total gross weight (kg)</span><input type="number" min="0" step="0.01" value={detail.grossWeight || ""} onChange={(event) => updatePalletDetail({ grossWeight: Number(event.target.value) })} /></label>
                  <label><span>Pallet tare (kg, max. 20)</span><input type="number" min="0" max="20" step="0.01" value={detail.tareWeight || ""} onChange={(event) => updatePalletDetail({ tareWeight: Number(event.target.value) })} /></label>
                  <span className="approval-pallet-net">Net product weight: {Math.max(0, detail.grossWeight - detail.tareWeight).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</span>
                  <div className="approval-pallet-dimensions">
                    <label><span>Length (cm)</span><input type="number" min="0" step="1" value={detail.lengthCm || ""} onChange={(event) => updatePalletDetail({ lengthCm: Number(event.target.value) })} /></label>
                    <label><span>Width (cm)</span><input type="number" min="0" step="1" value={detail.widthCm || ""} onChange={(event) => updatePalletDetail({ widthCm: Number(event.target.value) })} /></label>
                    <label><span>Height (cm)</span><input type="number" min="0" step="1" value={detail.heightCm || ""} onChange={(event) => updatePalletDetail({ heightCm: Number(event.target.value) })} /></label>
                  </div>
                </div>;
              })}
            </div>}
            {packingStep === 2 && <div className="approval-pallet-product-checks">
              <h4>Check pallet allocation against order</h4>
              {packingProductChecks.map((check) => {
                const valid = check.rollDifference === 0 && Math.abs(check.quantityDifference) <= 0.02;
                return <div key={check.lineIndex} className={valid ? "valid" : "invalid"}><b>{check.line.productCode} · {check.line.productName}</b><span>Rolls: {check.assignedRolls} / {check.orderedRolls}{check.rollDifference > 0 ? ` · ${check.rollDifference} over` : check.rollDifference < 0 ? ` · ${Math.abs(check.rollDifference)} short` : " · Exact"}</span><span>Meters: {check.assignedQuantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} / {check.orderedQuantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}{check.quantityDifference > 0.02 ? ` · ${check.quantityDifference.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m over` : check.quantityDifference < -0.02 ? ` · ${Math.abs(check.quantityDifference).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m short` : " · Exact"}</span></div>;
              })}
            </div>}
            <div className={`approval-pallet-check ${packingDistribution.reduce((sum, value) => sum + value, 0) === packingTotalRolls ? "valid" : "invalid"}`}>
              Allocated to pallets: {packingDistribution.reduce((sum, value) => sum + value, 0)} / Order total: {packingTotalRolls} rolls
            </div>
          </section>}
          <div className="approval-line-head">
            <span>{isProforma ? "Product / prepared" : "Ürün / hazırlanan"}</span>
            <span>{isProforma ? "Width (m) / Unit price (m²)" : "En (m) / Birim fiyat (m²)"}</span>
            <span>{isProforma ? "Discount" : "İskonto"}</span>
            <span>{isProforma ? "VAT" : "KDV"}</span>
          </div>
          {isProforma && <div className="approval-manual-line-action">
            <button type="button" className="secondary" onClick={addManualExportLine}>+ Add manual product</button>
            <small>For box, piece, kilogram, set, pallet and other export items</small>
          </div>}
          <div className="approval-lines">
            {form.lines.map((line, index) => {
              const width = Number(line.width) || 1.42;
              const squareMeters = line.quantity * width;
              return (
                <div
                  className="approval-line"
                  key={`${line.productId}-${index}`}
                >
                  <div>
                    {isProforma && line.manual ? <div className="approval-manual-product-fields">
                      <input placeholder="Product code" value={line.productCode} onChange={(event) => updateLine(index, { productCode: event.target.value })} />
                      <input required placeholder="Product name" value={line.productName} onChange={(event) => updateLine(index, { productName: event.target.value })} />
                      <label><span>Quantity</span><input type="number" min="0.001" step="0.001" value={line.quantity || ""} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></label>
                      <label><span>Unit</span><select value={line.unit ?? "PCS"} onChange={(event) => updateLine(index, { unit: event.target.value as ApprovalFormLine["unit"] })}>
                        <option value="M">Meter (m)</option><option value="M2">Square meter (m²)</option><option value="ROLL">Roll</option>
                        <option value="BOX">Box</option><option value="PCS">Piece (pcs)</option><option value="KG">Kilogram (kg)</option>
                        <option value="SET">Set</option><option value="PALLET">Pallet</option>
                      </select></label>
                      {line.unit === "BOX" && <label><span>Pieces per box</span><input type="number" min="1" step="1" value={line.unitsPerBox || ""} onChange={(event) => updateLine(index, { unitsPerBox: Number(event.target.value) })} /></label>}
                      <button type="button" className="danger-quiet" onClick={() => removeManualExportLine(index)}>Remove</button>
                    </div> : <>
                      <small>{line.productCode}</small>
                      <b>{line.productName}</b>
                      <span>{line.quantity} {isProforma ? "m" : "mt"} · {squareMeters.toLocaleString(isProforma ? "en-US" : "tr-TR", { maximumFractionDigits: 2 })} m² · {line.rollCount} {isProforma ? "rolls" : "rulo"}</span>
                    </>}
                  </div>
                  {isCommercialInvoice && <div className="approval-commercial-line-fields">
                    <label><span>HS Code</span><input value={line.hsCode ?? ""} onChange={(event) => updateLine(index, { hsCode: event.target.value })} /></label>
                    <label><span>Origin</span><input value={line.countryOfOrigin ?? form.countryOfOrigin ?? ""} onChange={(event) => updateLine(index, { countryOfOrigin: event.target.value })} /></label>
                    {(line.manual || Number(line.rollCount) <= 0) && <label><span>Packages</span><input type="number" min="0" step="1" value={line.packageCount || ""} onChange={(event) => updateLine(index, { packageCount: Number(event.target.value) })} /></label>}
                    <label><span>Net kg</span><input type="number" min="0" step="0.01" value={line.netWeight || ""} onChange={(event) => updateLine(index, { netWeight: Number(event.target.value) })} /></label>
                    <label><span>Gross kg</span><input type="number" min="0" step="0.01" value={line.grossWeight || ""} onChange={(event) => updateLine(index, { grossWeight: Number(event.target.value) })} /></label>
                  </div>}
                  {isPackingList ? <div className="approval-packing-fields"><small>Product weights are calculated from the pallet total by meter ratio.</small></div> : <div className="approval-price-pair">
                    {!(isProforma && line.manual && line.unit !== "M2") && <label>
                      <span>{isProforma ? "Width (m)" : "En (m)"}</span>
                      <input
                        aria-label={isProforma ? "Product width" : "Ürün eni"}
                        type="number"
                        min="0.01"
                        step="0.01"
                        title={isProforma ? "Product width (meters)" : "Ürün eni (metre)"}
                        value={width}
                        onChange={(event) =>
                          updateLine(index, {
                            width: Number(event.target.value),
                          })
                        }
                      />
                    </label>}
                    <label className="approval-unit-price">
                      <span>{isProforma ? "Unit price" : "Birim fiyat (m²)"}</span>
                      <input
                        aria-label={isProforma ? "Unit price per m²" : "m² fiyatı"}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        title={isProforma ? "Unit price per m²" : "m² birim fiyatı"}
                        value={line.unitPrice || ""}
                        onChange={(event) =>
                          updateLine(index, {
                            unitPrice: Number(event.target.value),
                          })
                        }
                      />
                      {!isProforma && <small className="approval-local-price">
                        {form.currency === "TRY"
                          ? `${formatMoney(line.unitPrice, "TRY")} / m²`
                          : `${formatMoney(line.unitPrice, form.currency)} × ${Number(form.exchangeRate || 0).toLocaleString("tr-TR", { maximumFractionDigits: 4 })} = ${formatMoney(line.unitPrice * (Number(form.exchangeRate) || 0), "TRY")} / m²`}
                      </small>}
                    </label>
                  </div>}
                  {!isPackingList && <label>
                    <span>{isProforma ? "Discount %" : "İskonto %"}</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={line.discountRate}
                      onChange={(event) =>
                        updateLine(index, {
                          discountRate: Number(event.target.value),
                        })
                      }
                    />
                  </label>}
                  {!isPackingList && <label>
                    <span>{isProforma ? "VAT %" : "KDV %"}</span>
                    <select
                      value={line.vatRate}
                      onChange={(event) =>
                        updateLine(index, {
                          vatRate: Number(event.target.value),
                        })
                      }
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                      <option value="10">10</option>
                      <option value="20">20</option>
                    </select>
                  </label>}
                </div>
              );
            })}
          </div>
          <div className="approval-fields two approval-terms-fields">
            <label className="approval-compact-field">
              {isProforma ? "Overall discount %" : "Genel iskonto %"}
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.overallDiscountRate || ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    overallDiscountRate: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="approval-compact-field">
              {isProforma ? "Additional charge label" : "Ek masraf adı"}
              <input
                value={isProforma ? (exportExtraChargeLabel ?? "") : form.extraChargeLabel}
                onChange={(event) =>
                  setForm({ ...form, extraChargeLabel: event.target.value })
                }
              />
            </label>
            <label className="approval-compact-field">
              {isProforma ? "Additional charge" : "Ek masraf"}
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.extraCharge || ""}
                onChange={(event) =>
                  setForm({ ...form, extraCharge: Number(event.target.value) })
                }
              />
            </label>
            <label className="approval-terms-field">
              {isProforma ? "Payment terms" : "Ödeme koşulu"}
              <textarea
                rows={2}
                placeholder={isProforma ? "e.g. Advance payment upon order confirmation" : "Örn. Sipariş onayında peşin ödeme"}
                value={form.paymentTerms}
                onChange={(event) =>
                  setForm({ ...form, paymentTerms: event.target.value })
                }
              />
            </label>
            <label className="approval-terms-field">
              {isProforma ? "Delivery terms" : "Teslimat koşulu"}
              <textarea
                rows={2}
                placeholder={isProforma ? "e.g. Ex-works; freight payable by the buyer" : "Örn. Depo teslim, nakliye alıcıya aittir"}
                value={form.deliveryTerms}
                onChange={(event) =>
                  setForm({ ...form, deliveryTerms: event.target.value })
                }
              />
            </label>
            <label className="wide-field">
              {isProforma ? "Additional note" : "Ek not"}
              <textarea
                rows={2}
                placeholder={isProforma ? "Additional information for this order" : "Bu siparişe özel ek açıklama"}
                value={form.note}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
              />
            </label>
          </div>
        </section>
        <section className="approval-paper-wrap">
          <div className="approval-preview-label">{labels.preview}</div>
          <article className="approval-paper" ref={paperRef} lang={isProforma ? "en" : "tr"}>
            <header className="approval-paper-header">
              <div className="approval-brand-bar">
                <div className="approval-company-identity">
                  {printSettings.companyLogo ? (
                    <img
                      className="approval-company-logo"
                      src={printSettings.companyLogo}
                      alt={printSettings.companyName}
                    />
                  ) : (
                    <span className="approval-company-monogram">
                      {printSettings.companyName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span>
                    <b>{printSettings.companyName}</b>
                    {printSettings.brandSubtitle && (
                      <small>{printSettings.brandSubtitle}</small>
                    )}
                    {printSettings.addressLine && (
                      <small>{printSettings.addressLine}</small>
                    )}
                    <span className="approval-company-contact-line">
                      {[printSettings.phone, printSettings.email, printSettings.website].filter(Boolean).join(" · ")}
                    </span>
                    <span className="approval-company-tax-line">
                      {isProforma ? "Tax office" : "Vergi dairesi"}: {printSettings.taxOffice || "-"} · {isProforma ? "VAT / Tax No." : "VKN/TCKN"}: {printSettings.taxNumber || "-"}
                    </span>
                  </span>
                </div>
                <div className="approval-provider-block">
                  <div className="approval-brand-lockup">
                    <AriXLogo className="approval-logo" />
                    <span>
                      <b>{isProforma ? "AriX Order system" : "AriX Sipariş sistemi"}</b>
                      <small className="approval-arix-site">www.arix.az</small>
                    </span>
                  </div>
                </div>
              </div>

              <div className="approval-heading-row">
                <div className="approval-title-block">
                  <small>{isProforma ? "EXPORT SALES DOCUMENT" : "SATIŞ BELGESİ"}</small>
                  <h2>{isProforma ? exportDocumentTitle : "Sipariş Onay Formu"}</h2>
                  <span>{isPackingList ? "Packing details for the exported goods." : isProforma ? "Issued for export documentation purposes." : "Sipariş, belirtilen bilgiler doğrultusunda hazırlanmıştır."}</span>
                </div>
                <div className={`approval-status-badge ${form.status}`}>
                  <i aria-hidden="true">{form.status === "approved" && <Check />}</i>
                  <span>
                    <b>{isProforma ? (form.status === "approved" ? "Approved" : "Draft") : (form.status === "approved" ? "Onaylandı" : "Taslak")}</b>
                    <small>
                      {form.status === "approved"
                        ? (isProforma ? `Approved by ${form.approvedBy || form.salesRepresentative || "sales representative"}` : `${form.approvedBy || form.salesRepresentative || "Satış temsilcisi"} onayladı`)
                        : (isProforma ? "Awaiting sales representative approval" : "Satış temsilcisi onayı bekleniyor")}
                    </small>
                  </span>
                </div>
              </div>

              <div className="approval-summary-strip">
                <div><ApprovalIcon kind="document" /><span><small>{isProforma ? "PROFORMA NUMBER" : "FORM NO"}</small><b>{isProforma ? form.proformaNumber : form.number}</b><em>{order.number}</em></span></div>
                <div><ApprovalIcon kind="calendar" /><span><small>{isProforma ? "ISSUE DATE" : "BELGE TARİHİ"}</small><b>{form.documentType === "commercial_invoice" || form.documentType === "packing_list" ? (form.shipmentDate || form.date) : form.date}</b></span></div>
                <div><ApprovalIcon kind="representative" /><span><small>{isProforma ? "SALES REPRESENTATIVE" : "SATIŞ TEMSİLCİSİ"}</small><b>{form.salesRepresentative || "-"}</b></span></div>
                <div><ApprovalIcon kind="source" /><span><small>{isProforma ? "INVOICE NUMBER" : "KAYNAK"}</small><b>{isProforma ? (form.invoiceNumber || "-") : "ERSA DEPO"}</b></span></div>
                <div><ApprovalIcon kind="currency" /><span><small>{isProforma ? "CURRENCY" : "KUR"}</small><b>{isProforma ? form.currency : (form.currency === "TRY" ? "TL · 1" : `${form.currency} · ${form.exchangeRate}`)}</b>{!isProforma && form.currency !== "TRY" && ratePublicationDate && <em>({ratePublicationDate})</em>}</span></div>
              </div>
              {(form.documentType === "commercial_invoice" || form.documentType === "packing_list") && <div className="approval-shipment-date"><b>Proforma date</b><span>{form.date}</span></div>}

              <div className="approval-company-panel">
                <strong>{isProforma ? "BUYER INFORMATION" : "MÜŞTERİ BİLGİLERİ"}</strong>
                <div className="approval-company-panel-content">
                  <ApprovalIcon kind="company" />
                  <div>
                    <b>{form.customerName || order.customerName}</b>
                    <span>{form.customerContact ? `${isProforma ? "Contact" : "Temsilci"}: ${form.customerContact}` : (isProforma ? "Contact not specified" : "Temsilci bilgisi girilmedi")}</span>
                    <span>{form.customerAddress || (isProforma ? "Address not specified" : "Adres bilgisi girilmedi")}</span>
                  </div>
                  <div className="approval-company-panel-contact">
                    <span>{form.customerPhone || (isProforma ? "Phone not specified" : "Telefon bilgisi girilmedi")}</span>
                    <span>{form.customerEmail || (isProforma ? "Email not specified" : "E-posta bilgisi girilmedi")}</span>
                    <span>{isProforma ? "VAT / Tax No" : "Vergi dairesi"}: <b>{isProforma ? (form.customerTaxNumber || "-") : (form.customerTaxOffice || "-")}</b></span>
                    {!isProforma && <span>VKN/TCKN: {form.customerTaxNumber || "-"}</span>}
                  </div>
                </div>
              </div>
            </header>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{isProforma ? "Product" : "Ürün"}</th>
                  <th>{isPackingList ? "Packages" : isProforma ? "Rolls" : "Rulo"}</th>
                  <th>{isProforma ? "Quantity / Unit" : "Miktar"}</th>
                  <th>{isPackingList ? "Net Weight" : isProforma ? "Unit Price" : "m² Fiyatı"}</th>
                  <th>{isPackingList ? "Gross Weight" : isProforma ? "Amount" : "Toplam"}</th>
                </tr>
              </thead>
              <tbody>
                {isPackingList ? packingPlan.map((pallet) => {
                  const detail = packingPalletDetails[pallet.number - 1];
                  const palletMeters = pallet.items.reduce((sum, item) => sum + item.quantity, 0);
                  const palletNet = Math.max(0, detail.grossWeight - detail.tareWeight);
                  return <Fragment key={`pallet-${pallet.number}`}>
                  <tr className="approval-pallet-row">
                    <td colSpan={2}><b>PALLET {pallet.number}</b></td>
                    <td><b>{pallet.rollCount} rolls</b></td>
                    <td><small>{detail.lengthCm} × {detail.widthCm} × {detail.heightCm} cm</small></td>
                    <td><b>{palletNet.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                    <td><b>{detail.grossWeight.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                  </tr>
                  {pallet.items.map((item, itemIndex) => {
                    const ratio = palletMeters > 0 ? item.quantity / palletMeters : 0;
                    return <tr key={`${pallet.number}-${item.lineIndex}-${itemIndex}`}>
                    <td>{item.lineIndex + 1}</td>
                    <td><b>{item.line.productName}</b><small>{item.line.productCode}</small></td>
                    <td>{item.rolls}</td>
                    <td className="approval-quantity-cell"><b>{(item.quantity * (Number(item.line.width) || 1.42)).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m²</b><small>{item.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} mt</small></td>
                    <td><b>{(palletNet * ratio).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                    <td><b>{(detail.grossWeight * ratio).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                  </tr>})}
                </Fragment>}) : form.lines.map((line, index) => {
                  const squareMeters =
                    line.quantity * (Number(line.width) || 1.42);
                  const exportUnitLabels: Record<string, string> = { M2: "m²", M: "m", ROLL: "roll", BOX: "box", PCS: "pcs", KG: "kg", SET: "set", PALLET: "pallet" };
                  const exportUnit = line.unit ?? "M2";
                  const price = dualMoney(line.unitPrice, form);
                  const total = dualMoney(totals.lines[index].net, form);
                  return (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>
                        <b>{line.productName}</b>
                        {isCommercialInvoice
                          ? <small>{line.productCode} · HS {line.hsCode || "-"} · {line.countryOfOrigin || form.countryOfOrigin || "-"}</small>
                          : <small>{line.productCode}</small>}
                        {line.discountRate > 0 && (
                          <small className="approval-line-discount">
                            {isProforma ? `Product discount ${line.discountRate}%` : `Ürün iskontosu %${line.discountRate}`}
                          </small>
                        )}
                      </td>
                      <td>{isProforma ? <>{line.rollCount} rolls</> : line.rollCount}{isCommercialInvoice && (line.manual || Number(line.rollCount) <= 0) && Number(line.packageCount) > 0 && <small>{line.packageCount} packages</small>}</td>
                      <td className="approval-quantity-cell">
                        {isProforma && line.manual ? <>
                          <b>{line.quantity.toLocaleString("en-US", { maximumFractionDigits: 3 })} {exportUnitLabels[exportUnit]}</b>
                          {exportUnit === "BOX" && <small>{line.unitsPerBox || 0} pcs / box · {(line.quantity * Number(line.unitsPerBox || 0)).toLocaleString("en-US", { maximumFractionDigits: 0 })} pcs total</small>}
                        </> : <><b>{squareMeters.toLocaleString(isProforma ? "en-US" : "tr-TR", { maximumFractionDigits: 2 })} m²</b><small>{line.quantity} {isProforma ? "m" : "mt"}</small></>}
                      </td>
                      <td>
                        <>
                        <b>{price.primary}</b>
                        {!isProforma && price.local && <small>{price.local}</small>}
                        </>
                      </td>
                      <td>
                        <>
                        <b>{total.primary}</b>
                        {!isProforma && total.local && <small>{total.local}</small>}
                        </>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="approval-bottom-grid">
              {isCommercialInvoice || isProforma ? <div className={`approval-commercial-panel approval-commercial-shipment-panel${isProforma ? " approval-proforma-shipment-panel" : ""}`}>
                <div className="approval-condition-heading"><ApprovalIcon kind="delivery" /><span><b>{isProforma ? "Proforma & shipment details" : "Shipment & customs"}</b><small>{isProforma ? "Package, delivery and origin information" : "Transport, package and customs details"}</small></span></div>
                <div className="approval-commercial-panel-grid">
                  {isProforma ? <>
                    <span><small>Packaging</small>{form.packageType || "-"}</span>
                    <span><small>Product description</small>{form.productDescription || "-"}</span>
                    <span><small>Buyer PO / Contract</small>{form.buyerOrderNumber || "-"}</span>
                    <span><small>Delivery term</small>{form.incoterm || "-"}</span>
                    <span><small>Shipment port</small>{form.shipmentPort || "-"}</span>
                    <span><small>Destination</small>{form.destination || "-"}</span>
                    <span><small>Country of origin</small>{form.countryOfOrigin || "-"}</span>
                  </> : <>
                    <span><small>Packaging</small>{form.packageType || "-"}</span>
                    <span><small>Buyer PO / Contract</small>{form.buyerOrderNumber || "-"}</span>
                    <span><small>Delivery term</small>{form.incoterm || "-"}</span>
                    <span><small>Transport mode</small>{form.transportMode || "-"}</span>
                    <span><small>Loading / destination</small>{form.loadingPlace || "-"} → {form.destination || "-"}</span>
                    <span><small>Vehicle / Container</small>{form.vehicleContainerNumber || "-"}</span>
                    <span><small>CMR / B/L / AWB</small>{form.transportDocumentNumber || "-"}</span>
                    <span><small>Marks & numbers</small>{form.marksAndNumbers || "-"}</span>
                    {form.lines.some((line) => (line.manual || Number(line.rollCount) <= 0) && Number(line.packageCount) > 0) && <span><small>Packages</small>{form.lines.reduce((sum, line) => sum + ((line.manual || Number(line.rollCount) <= 0) ? (Number(line.packageCount) || 0) : 0), 0)}</span>}
                    <span><small>Net / Gross</small>{form.lines.reduce((sum, line) => sum + (Number(line.netWeight) || 0), 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} / {form.lines.reduce((sum, line) => sum + (Number(line.grossWeight) || 0), 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</span>
                  </>}
                </div>
              </div> : isPackingList ? <div className="approval-commercial-panel approval-packing-summary-panel">
                <div className="approval-condition-heading"><ApprovalIcon kind="terms" /><span><b>Packing summary</b><small>Pallet, roll and weight totals</small></span></div>
                <div className="approval-packing-summary-grid">
                  <span><small>Total pallets</small><b>{packingDistribution.length}</b></span>
                  <span><small>Total rolls</small><b>{packingDistribution.reduce((sum, value) => sum + value, 0)}</b></span>
                  <span><small>Total net weight</small><b>{packingPalletDetails.reduce((sum, item) => sum + Math.max(0, Number(item.grossWeight) - Number(item.tareWeight)), 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></span>
                  <span><small>Total gross weight</small><b>{packingPalletDetails.reduce((sum, item) => sum + (Number(item.grossWeight) || 0), 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></span>
                </div>
              </div> : <div className="approval-general-terms approval-general-terms-main">
                <div className="approval-condition-heading">
                  <ApprovalIcon kind="terms" />
                  <span>
                    <b>{isProforma ? "Terms and export details" : "Genel koşullar"}</b>
                    <small>{isProforma ? "Proforma invoice conditions" : "Yurtiçi satış koşulları"}</small>
                  </span>
                </div>
                <ul>
                  {(isProforma ? EXPORT_GENERAL_TERMS : DOMESTIC_GENERAL_TERMS).map((term) => <li key={term}>{term}</li>)}
                </ul>
                <div className="approval-inline-conditions">
                  <span>
                    <ApprovalIcon kind="payment" />
                    <span>
                      <b>{isProforma ? "Payment terms" : "Ödeme koşulu"}</b>
                      <small>{form.paymentTerms.trim() || (isProforma ? "Not specified" : "Belirtilmedi")}</small>
                    </span>
                  </span>
                  <span>
                    <ApprovalIcon kind="delivery" />
                    <span>
                      <b>{isProforma ? "Delivery terms" : "Teslimat koşulu"}</b>
                      <small>{form.deliveryTerms.trim() || form.incoterm?.trim() || (isProforma ? "Not specified" : "Belirtilmedi")}</small>
                    </span>
                  </span>
                </div>
              </div>}
              {!isPackingList && <div className="approval-totals">
              <span>
                {isProforma ? "Subtotal" : "Ara toplam"}{" "}
                <b>
                  <i>{dualMoney(totals.subtotal, form).primary}</i>
                  {!isProforma && <small>{dualMoney(totals.subtotal, form).local}</small>}
                </b>
              </span>
              {(form.overallDiscountRate || 0) > 0 && (
                <span className="approval-discount-total">
                  {isProforma ? "Discount" : "Genel iskonto"} %{form.overallDiscountRate}{" "}
                  <b>
                    <i>-{dualMoney(totals.overallDiscount, form).primary}</i>
                    {!isProforma && <small>-{dualMoney(totals.overallDiscount, form).local}</small>}
                  </b>
                </span>
              )}
              <span>
                {isProforma ? "Tax" : vatRateLabel}{" "}
                <b>
                  <i>{dualMoney(totals.vat, form).primary}</i>
                  {!isProforma && <small>{dualMoney(totals.vat, form).local}</small>}
                </b>
              </span>
              <span>
                {isProforma ? (exportExtraChargeLabel || "Additional charge") : "Ek masraf"}{" "}
                <b>
                  <i>{dualMoney(form.extraCharge, form).primary}</i>
                  {!isProforma && <small>{dualMoney(form.extraCharge, form).local}</small>}
                </b>
              </span>
              {isCommercialInvoice && totals.freight > 0 && <span>Freight <b><i>{dualMoney(totals.freight, form).primary}</i></b></span>}
              {isCommercialInvoice && totals.insurance > 0 && <span>Insurance <b><i>{dualMoney(totals.insurance, form).primary}</i></b></span>}
              <strong>
                {isProforma ? "Total" : "Genel toplam"}{" "}
                <b>
                  <i>{dualMoney(totals.total, form).primary}</i>
                  {!isProforma && <small>{dualMoney(totals.total, form).local}</small>}
                </b>
              </strong>
              </div>}
              {isPackingList && <div className="approval-commercial-panel approval-packing-shipment-panel">
                <div className="approval-condition-heading"><ApprovalIcon kind="delivery" /><span><b>Shipment details</b><small>Packing list reference information</small></span></div>
                <div className="approval-packing-shipment-grid">
                  <span><small>Invoice no.</small>{form.invoiceNumber || "-"}</span>
                  <span><small>Shipment date</small>{form.shipmentDate || form.date}</span>
                  <span><small>Place of loading</small>{form.loadingPlace || form.shipmentPort || "-"}</span>
                  <span><small>Destination</small>{form.destination || "-"}</span>
                  <span><small>Delivery term</small>{form.incoterm || "-"}</span>
                  <span><small>Country of origin</small>{form.countryOfOrigin || "-"}</span>
                </div>
              </div>}
            </div>
            {(isCommercialInvoice || isProforma) && <div className="approval-commercial-tail"><section className="approval-commercial-panels">
              <div className="approval-general-terms approval-general-terms-main approval-commercial-terms-panel">
                <div className="approval-condition-heading"><ApprovalIcon kind="terms" /><span><b>Terms and export details</b><small>{isProforma ? "Proforma invoice conditions" : "Commercial invoice conditions"}</small></span></div>
                <ul>{EXPORT_GENERAL_TERMS.map((term) => <li key={term}>{term}</li>)}</ul>
                <div className="approval-inline-conditions">
                  <span><ApprovalIcon kind="payment" /><span><b>Payment terms</b><small>{form.paymentTerms.trim() || "Not specified"}</small></span></span>
                  <span><ApprovalIcon kind="delivery" /><span><b>Delivery terms</b><small>{form.deliveryTerms.trim() || form.incoterm?.trim() || "Not specified"}</small></span></span>
                </div>
              </div>
              <div className="approval-commercial-panel approval-commercial-stamp-panel">
                <div className="approval-commercial-declaration">
                  <div className="approval-condition-heading"><ApprovalIcon kind="note" /><span><b>{isProforma ? "Proforma invoice note" : "Exporter declaration"}</b><small>{isProforma ? "Additional information" : "Certified commercial invoice statement"}</small></span></div>
                  <span>{isProforma ? (form.note || "-") : (form.exporterDeclaration || "-")}</span>
                </div>
                <div className="approval-commercial-stamp">
                  <div className="approval-condition-heading"><ApprovalIcon kind="company" /><span><b>Authorized signature / stamp</b><small>Exporter approval</small></span></div>
                  {printSettings.companyStamp ? <img src={printSettings.companyStamp} alt="Company stamp and signature" /> : <span>Stamp / signature</span>}
                </div>
              </div>
              <div className="approval-commercial-panel approval-commercial-bank-panel">
                <div className="approval-condition-heading"><ApprovalIcon kind="payment" /><span><b>Beneficiary bank</b><small>Payment account details</small></span></div>
                <div className="approval-commercial-bank-details">
                  <span><small>Bank</small>{form.bankName || "-"}</span>
                  <span><small>SWIFT</small>{form.swiftCode || "-"}</span>
                  <span><small>IBAN</small>{form.iban || "-"}</span>
                </div>
              </div>
            </section></div>}
            {isPackingList && <section className="approval-packing-approval-tail">
              <div className="approval-commercial-panel approval-packing-declaration-panel">
                <div className="approval-condition-heading"><ApprovalIcon kind="note" /><span><b>Packing declaration</b><small>Shipment contents confirmation</small></span></div>
                <span>We hereby certify that the packages, quantities and weights stated in this packing list are true and correct.</span>
              </div>
              <div className="approval-commercial-panel approval-commercial-stamp-panel">
                <div className="approval-commercial-stamp">
                  <div className="approval-condition-heading"><ApprovalIcon kind="company" /><span><b>Authorized signature / stamp</b><small>Exporter approval</small></span></div>
                  {printSettings.companyStamp ? <img src={printSettings.companyStamp} alt="Company stamp and signature" /> : <span>Stamp / signature</span>}
                </div>
              </div>
            </section>}
            {!isCommercialInvoice && !isPackingList && <section className="approval-document-conditions">
              <div className="approval-note-box approval-note-box-bottom">
                <ApprovalIcon kind="note" />
                <span>
                  <b>{isProforma ? "Additional note" : "Ek not"}</b>
                  <small>{form.note || (isProforma ? "No additional note for this order." : "Bu sipariş için ek not bulunmuyor.")}</small>
                </span>
              </div>
            </section>}
            <footer className="approval-page-footer">
              <span>Powered by <AriXLogo /> <b>AriX</b> {isProforma ? "Order system" : "Sipariş sistemi"}</span>
              <span>{isProforma ? "Secure document management" : "Güvenli belge yönetimi"} &nbsp; | &nbsp; {new Date(form.date).getFullYear() || new Date().getFullYear()}</span>
            </footer>
          </article>
        </section>
      </div>
      {error && <p className="form-error">{error}</p>}
      {archiveActionNotice && <p className="form-success archive-action-notice" role="status">{archiveActionNotice}</p>}
      {archivePath && (
        <div className="approval-archive-location">
          <span><b>{form.status === "approved" ? "Onaylı PDF" : "Onay bekleyen PDF"}</b><small title={archivePath}>{archivePath}</small></span>
          <span className="approval-archive-actions">
            <button className="secondary" type="button" onClick={() => void copyArchivePath()}>Yolu kopyala</button>
            <button className="secondary" type="button" onClick={() => void openArchiveFolder()}>Klasörde göster</button>
            {/Windows/i.test(navigator.userAgent) && (
              <a className="secondary" href="/arix-klasor-acici-kur.cmd" download>
                Klasör açıcıyı kur
              </a>
            )}
          </span>
        </div>
      )}
      <div className="modal-actions">
        <button className="secondary mobile-hide-print" onClick={() => void print()}>
          {labels.print}
        </button>
        {canEdit && !editing && (
          <button className="secondary" disabled={busy} onClick={() => {
            void api(`/api/orders/${order.id}/activity`, { method: "POST", body: JSON.stringify({ type: "approval_form_editing_started" }) }).catch(() => undefined);
            setEditing(true);
          }}>
            Düzenle
          </button>
        )}
        {canEdit && editing && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void save("draft")}
          >
            {labels.save}
          </button>
        )}
        {canApprove && (
          <button className="danger-button" disabled={busy || form.status === "approved"} onClick={() => void rejectForm()}>
            Reddet
          </button>
        )}
        {canApprove && (
          <button
            className="primary"
            disabled={busy || (form.status === "approved" && !hasFormChanges)}
            onClick={() => void save("approved")}
            title={form.status === "approved" && !hasFormChanges ? "Bu form zaten onaylandı. Yeniden onaylamak için önce bir değişiklik yapın." : undefined}
          >
            {labels.approve}
          </button>
        )}
      </div>
    </Modal>
  );
  return (
    <Modal
      title={labels.title}
      subtitle={`${order.customerName} · ${order.number}`}
      onClose={onClose}
      wide
      showBack
      className="approval-modal"
    >
      <div className="approval-workspace">
        <section className="approval-editor">
          <div className="approval-fields four">
            <label>
              Form no
              <input
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
              />
            </label>
            <label>
              Tarih
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label>
              Para birimi
              <select
                value={form.currency}
                onChange={(e) =>
                  setForm({
                    ...form,
                    currency: e.target.value as ApprovalForm["currency"],
                  })
                }
              >
                <option>USD</option>
                <option>TRY</option>
                <option>EUR</option>
              </select>
            </label>
            <label>
              Kur
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                value={form.exchangeRate}
                onChange={(e) =>
                  setForm({ ...form, exchangeRate: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="approval-toggle">
            <input
              type="checkbox"
              checked={form.vatIncluded}
              onChange={(e) =>
                setForm({ ...form, vatIncluded: e.target.checked })
              }
            />
            <span>KDV fiyatlara dahil</span>
          </label>
          <div className="approval-line-head">
            <span>Ürün / hazırlanan</span>
            <span>Fiyat</span>
            <span>İskonto</span>
            <span>KDV</span>
          </div>
          <div className="approval-lines">
            {form.lines.map((line, index) => (
              <div className="approval-line" key={`${line.productId}-${index}`}>
                <div>
                  <small>{line.productCode}</small>
                  <b>{line.productName}</b>
                  <span>
                    {line.quantity} mt · {line.rollCount} rulo
                  </span>
                </div>
                <label>
                  <span>Birim fiyat</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice || ""}
                    onChange={(e) =>
                      updateLine(index, { unitPrice: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  <span>İskonto %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={line.discountRate}
                    onChange={(e) =>
                      updateLine(index, {
                        discountRate: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>KDV %</span>
                  <select
                    value={line.vatRate}
                    onChange={(e) =>
                      updateLine(index, { vatRate: Number(e.target.value) })
                    }
                  >
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="10">10</option>
                    <option value="20">20</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
          <div className="approval-fields two">
            <label>
              Ek masraf adı
              <input
                value={form.extraChargeLabel}
                onChange={(e) =>
                  setForm({ ...form, extraChargeLabel: e.target.value })
                }
              />
            </label>
            <label>
              Ek masraf
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.extraCharge || ""}
                onChange={(e) =>
                  setForm({ ...form, extraCharge: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Ödeme koşulu
              <textarea
                rows={2}
                value={form.paymentTerms}
                onChange={(e) =>
                  setForm({ ...form, paymentTerms: e.target.value })
                }
              />
            </label>
            <label>
              Teslimat koşulu
              <textarea
                rows={2}
                value={form.deliveryTerms}
                onChange={(e) =>
                  setForm({ ...form, deliveryTerms: e.target.value })
                }
              />
            </label>
            <label className="wide-field">
              Not
              <textarea
                rows={2}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
          </div>
        </section>
        <section className="approval-paper-wrap">
          <div className="approval-preview-label">{labels.preview}</div>
          <article className="approval-paper">
            <header>
              <div>
                <AriXLogo className="approval-logo" />
                <h2>SİPARİŞ ONAY FORMU</h2>
                <span>{order.customerName}</span>
              </div>
              <div>
                <b>{form.number}</b>
                <span>{form.date}</span>
                <small>{order.number}</small>
              </div>
            </header>
            <table>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Rulo</th>
                  <th>mt</th>
                  <th>Fiyat</th>
                  <th>Toplam</th>
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, index) => (
                  <tr key={index}>
                    <td>
                      <b>{line.productName}</b>
                      <small>{line.productCode}</small>
                    </td>
                    <td>{line.rollCount}</td>
                    <td>{line.quantity}</td>
                    <td>{money(line.unitPrice, form.currency)}</td>
                    <td>{money(totals.lines[index].net, form.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="approval-totals">
              <span>
                Ara toplam <b>{money(totals.subtotal, form.currency)}</b>
              </span>
              <span>
                KDV <b>{money(totals.vat, form.currency)}</b>
              </span>
              <span>
                Ek masraf <b>{money(form.extraCharge, form.currency)}</b>
              </span>
              <strong>
                Genel toplam <b>{money(totals.total, form.currency)}</b>
              </strong>
            </div>
            <footer>
              <span>
                <small>Ödeme</small>
                {form.paymentTerms || "-"}
              </span>
              <span>
                <small>Teslimat</small>
                {form.deliveryTerms || "-"}
              </span>
            </footer>
          </article>
        </section>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions">
        <button className="secondary mobile-hide-print" onClick={print}>
          {labels.print}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void save("draft")}
        >
          {labels.save}
        </button>
        {canApprove && (
          <button className="danger-button" disabled={busy || form.status === "approved"} onClick={() => void rejectForm()}>
            Reddet
          </button>
        )}
        {canApprove && (
          <button
            className="primary"
            disabled={busy || (form.status === "approved" && !hasFormChanges)}
            onClick={() => void save("approved")}
            title={form.status === "approved" && !hasFormChanges ? "Bu form zaten onaylandı. Yeniden onaylamak için önce bir değişiklik yapın." : undefined}
          >
            {labels.approve}
          </button>
        )}
      </div>
    </Modal>
  );
}

function Login({
  onSuccess,
  language,
  setLanguage,
  isDark,
  setIsDark,
}: {
  onSuccess: (user: Session) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  isDark: boolean;
  setIsDark: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const googleButton = useRef<HTMLDivElement | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [registration, setRegistration] = useState({
    name: "",
    email: "",
    password: "",
    companyCode: "",
  });
  const [googleCredential, setGoogleCredential] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remember, setRemember] = useState(true);

  const googleLogin = useCallback(
    async (credential: string, inviteCode = "") => {
      setBusy(true);
      setError("");
      try {
        const payload = await request<AuthResponse>("/api/auth/google", {
          method: "POST",
          body: JSON.stringify({
            credential,
            companyCode: inviteCode,
            remember,
          }),
        });
        if (payload.pending) {
          setPending(true);
          setGoogleCredential("");
          return;
        }
        if (payload.data) onSuccess(payload.data);
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Google girişi alınmadı.";
        if (message.toLocaleLowerCase("az").includes("dəvət kodu"))
          setGoogleCredential(credential);
        setError(message);
      } finally {
        setBusy(false);
      }
    },
    [onSuccess, remember],
  );

  useEffect(() => {
    api<AuthConfig>("/api/auth/config")
      .then(setConfig)
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Giriş parametrləri alınmadı.",
        ),
      );
  }, []);

  useEffect(() => {
    if (
      mode !== "login" ||
      !config?.enabled ||
      !config.googleClientId ||
      !googleButton.current
    )
      return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !googleButton.current || !window.google) return;
        googleButton.current.replaceChildren();
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
          callback: (response) => {
            if (response.credential) void googleLogin(response.credential);
          },
        });
        window.google.accounts.id.renderButton(googleButton.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: Math.min(360, googleButton.current.clientWidth || 360),
          locale: "az",
        });
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Google giriş xidməti hazır deyil.",
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [config, googleLogin, mode]);

  const passwordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await request<AuthResponse>("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ ...login, remember }),
      });
      if (payload.pending) {
        setPending(true);
        return;
      }
      if (payload.data) onSuccess(payload.data);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Giriş alınmadı.";
      if (message.includes("hesab tapılmadı")) {
        setRegistration((current) => ({ ...current, email: login.email }));
        setMode("register");
        setError("");
      } else setError(message);
    } finally {
      setBusy(false);
    }
  };

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await request<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(registration),
      });
      if (payload.pending) setPending(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Müraciət göndərilmədi.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={`login ${isDark ? "theme-dark" : ""}`}>
      <div className="login-wrap">
        <div className="login-tools">
          <label className="header-select">
            <select
              aria-label="Dil"
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              {languageOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.short} · {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="header-control login-theme"
            onClick={() => setIsDark((current) => !current)}
          >
            {isDark ? "Dark" : "Light"}
          </button>
        </div>
        <section className="login-card">
          <div className="login-brand">
            <div className="login-logo">
              <AriXLogo />
            </div>
            <strong>AriX Panel</strong>
            <small>Əməkdaş girişi</small>
          </div>
          {pending ? (
            <div className="pending-box">
              <b>Müraciət göndərildi</b>
              <span>
                Şirkət sahibi təsdiqlədikdən sonra daxil ola bilərsiniz.
              </span>
            </div>
          ) : mode === "login" ? (
            <>
              <form onSubmit={passwordLogin}>
                <label>
                  <span>E-poçt</span>
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={login.email}
                    onChange={(e) =>
                      setLogin({ ...login, email: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Şifrə</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={login.password}
                    onChange={(e) =>
                      setLogin({ ...login, password: e.target.value })
                    }
                  />
                </label>
                <label className="remember-login">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  <span>{copy[language].rememberMe}</span>
                </label>
                <button disabled={busy} className="primary full">
                  Daxil ol
                </button>
              </form>
              {config?.enabled && (
                <>
                  <div className="separator">
                    <span />
                    və ya
                    <span />
                  </div>
                  <div ref={googleButton} className="google-button" />
                </>
              )}
              <button
                className="text-button login-link"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                Hesabınız yoxdur? Qeydiyyatdan keçin
              </button>
            </>
          ) : (
            <form onSubmit={register}>
              <button
                type="button"
                className="text-button back-link"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                ← Girişe dön
              </button>
              <label>
                <span>Ad soyad</span>
                <input
                  required
                  value={registration.name}
                  onChange={(e) =>
                    setRegistration({ ...registration, name: e.target.value })
                  }
                />
              </label>
              <label>
                <span>E-poçt</span>
                <input
                  type="email"
                  required
                  value={registration.email}
                  onChange={(e) =>
                    setRegistration({ ...registration, email: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Şifre</span>
                <input
                  type="password"
                  minLength={8}
                  required
                  value={registration.password}
                  onChange={(e) =>
                    setRegistration({
                      ...registration,
                      password: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                <span>Davet kodu</span>
                <input
                  className="code-input"
                  required
                  value={registration.companyCode}
                  onChange={(e) =>
                    setRegistration({
                      ...registration,
                      companyCode: e.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
              <button disabled={busy} className="primary full">
                Kayıt isteği gönder
              </button>
            </form>
          )}
          {googleCredential && !pending && (
            <form
              className="invite-box"
              onSubmit={(event) => {
                event.preventDefault();
                void googleLogin(googleCredential, companyCode);
              }}
            >
              <b>Bu Google hesabı sistemde kayıtlı değil</b>
              <span>Şirket davet kodunu girin.</span>
              <input
                className="code-input"
                required
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                placeholder="DAVET KODU"
              />
              <button
                disabled={busy || !companyCode.trim()}
                className="primary full"
              >
                Erişim isteği gönder
              </button>
            </form>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="login-notice">
            Yalnız şirket tarafından yetkilendirilmiş Google hesapları giriş yapabilir.
          </div>
        </section>
      </div>
    </main>
  );
}

function DocumentPreview({
  attachment,
  language,
  onClose,
  onPrint,
}: {
  attachment: OrderAttachment;
  language: Language;
  onClose: () => void;
  onPrint: () => void;
}) {
  const ui = copy[language];
  const isImage = attachment.mimeType.startsWith("image/");
  useBrowserBackLayer(true, onClose);
  return (
    <div
      className="document-preview-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="document-preview-dialog">
        <header>
          <div>
            <strong>{attachment.name}</strong>
            <small>
              {formatFileSize(attachment.size)} · {attachment.uploadedBy}
            </small>
          </div>
          <div className="document-preview-actions">
            <button type="button" onClick={onPrint}>
              {ui.printFile}
            </button>
            <a href={`${attachment.url}?download=1`}>{ui.downloadFile}</a>
            <a href={attachment.url} target="_blank" rel="noreferrer">
              {ui.fullScreen}
            </a>
            <button
              type="button"
              className="document-preview-close"
              aria-label="Bağla"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>
        <div className="document-preview-canvas">
          {isImage ? (
            <img src={attachment.url} alt={attachment.name} />
          ) : (
            <iframe src={attachment.url} title={attachment.name} />
          )}
        </div>
      </section>
    </div>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  wide,
  showBack = false,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  wide?: boolean;
  showBack?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  useBrowserBackLayer(true, onClose);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className={`modal ${wide ? "wide" : ""} ${className}`.trim()}>
        <header>
          {showBack && (
            <button type="button" className="modal-back" aria-label="Geri" onClick={onClose}>
              <ArrowLeft size={19} aria-hidden="true" />
              <span>Geri</span>
            </button>
          )}
          <div className="modal-heading">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="close" aria-label="Bağla" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
