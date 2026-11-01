import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import {
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
import {
  matchKnownCustomer,
  parseCloudShopInvoiceText,
  parseFlexibleNumber,
  preloadOcrWorker,
  preprocessImageForOcr,
  recognizeImageFast,
  type InvoiceRecord,
  type ParsedSalesDoc,
  type ParsedSalesItem,
} from "./qaimeParser";

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
  entries: EntryItem[];
  customerDebts: Record<string, number>;
  pastMonthUninvoiced: Record<string, number>;
  invoices: InvoiceRecord[];
  knownCustomers: string[];
  formatMoney: (value: number, currency: "TRY" | "AZN" | "USD") => string;
  onConfirmInvoice: (record: InvoiceRecord) => void;
  onApproveInvoice: (invoiceId: string) => void;
  onCancelInvoice: (invoiceId: string, reason?: string) => void;
  onUpdateCustomerDebt: (customer: string, newDebt: number) => void;
  onToggleEntryInvoiced: (entryId: string) => void;
  onResetAllInvoices: () => void;
  onOpenCustomerProfile?: (customerName: string) => void;
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

export default function InvoiceAttachmentView({
  entries,
  customerDebts,
  pastMonthUninvoiced,
  invoices,
  knownCustomers,
  formatMoney,
  onConfirmInvoice,
  onApproveInvoice,
  onCancelInvoice,
  onUpdateCustomerDebt,
  onToggleEntryInvoiced,
  onResetAllInvoices,
  onOpenCustomerProfile,
  externalSelectedCustomer,
  externalEditingInvoice,
  onClearExternalEditing,
}: Props) {
  // Main view state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "active" | "cancelled">("all");

  // Modals
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [pdfViewerInvoice, setPdfViewerInvoice] = useState<InvoiceRecord | null>(null);

  // Editor form state
  const [invoiceNo, setInvoiceNo] = useState("32609");
  const [invoiceDate, setInvoiceDate] = useState(() => new Intl.DateTimeFormat("tr-TR").format(new Date()));
  const [selectedCustomer, setSelectedCustomer] = useState("Membran Group");
  const [sellerName, setSellerName] = useState("Arif Mahmud");
  const [warehouseName, setWarehouseName] = useState("ANAnas");
  const [docNote, setDocNote] = useState("");
  const [salesInput, setSalesInput] = useState("872.70");
  const [returnInput, setReturnInput] = useState("0");
  const [purchaseInput, setPurchaseInput] = useState("0");
  const [customDebtOverride, setCustomDebtOverride] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string>("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [parsedDoc, setParsedDoc] = useState<ParsedSalesDoc | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedSalesItem[]>([]);
  const [editorBanner, setEditorBanner] = useState<{ type: "success" | "warning" | "info"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfPaperRef = useRef<HTMLElement | null>(null);
  const editorPaperRef = useRef<HTMLElement | null>(null);

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

  const allCustomerOptions = useMemo(() => {
    const set = new Set<string>([
      ...Object.keys(customerDebts),
      ...Object.keys(pastMonthUninvoiced),
      ...knownCustomers,
    ]);
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, "az-AZ"));
  }, [customerDebts, pastMonthUninvoiced, knownCustomers]);

  // Bulk invoices grouped by Date (Exact AriX Order layout)
  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("az-AZ");
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.invoiceNo.toLocaleLowerCase("az-AZ").includes(q) ||
        inv.customer.toLocaleLowerCase("az-AZ").includes(q) ||
        (inv.seller ?? "").toLocaleLowerCase("az-AZ").includes(q) ||
        inv.date.includes(q)
      );
    });
  }, [invoices, statusFilter, search]);

  const dateGroups = useMemo(() => {
    const map = new Map<string, InvoiceRecord[]>();
    for (const inv of filteredInvoices) {
      const d = inv.date || "Digər";
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(inv);
    }
    return Array.from(map.entries()).map(([date, list]) => ({
      date,
      list,
    }));
  }, [filteredInvoices]);

  // Calculations for active customer inside editor modal
  const customerPendingEntries = useMemo(() => {
    const cleanTarget = selectedCustomer.trim().toLocaleLowerCase("az-AZ");
    if (!cleanTarget) return [];
    return entries.filter(
      (e) =>
        e.kind === "income" &&
        !e.invoiced &&
        e.counterparty.trim().toLocaleLowerCase("az-AZ") === cleanTarget
    );
  }, [entries, selectedCustomer]);

  const pendingCurrentMonthSum = useMemo(
    () => Math.round(customerPendingEntries.reduce((sum, e) => sum + Math.abs(e.amount), 0) * 100) / 100,
    [customerPendingEntries]
  );

  const storedPastMonthBalance = useMemo(() => {
    const exact = pastMonthUninvoiced[selectedCustomer];
    if (exact !== undefined) return exact;
    const foundKey = Object.keys(pastMonthUninvoiced).find(
      (k) => k.toLocaleLowerCase("az-AZ") === selectedCustomer.trim().toLocaleLowerCase("az-AZ")
    );
    return foundKey ? pastMonthUninvoiced[foundKey] : 0;
  }, [pastMonthUninvoiced, selectedCustomer]);

  const storedPreviousDebt = useMemo(() => {
    const exact = customerDebts[selectedCustomer];
    if (exact !== undefined) return exact;
    const foundKey = Object.keys(customerDebts).find(
      (k) => k.toLocaleLowerCase("az-AZ") === selectedCustomer.trim().toLocaleLowerCase("az-AZ")
    );
    return foundKey ? customerDebts[foundKey] : 0;
  }, [customerDebts, selectedCustomer]);

  const effectivePreviousDebt =
    customDebtOverride !== null
      ? parseFlexibleNumber(customDebtOverride)
      : storedPreviousDebt;

  const totalDeductiblePayment = useMemo(
    () => Math.round((pendingCurrentMonthSum + (storedPastMonthBalance > 0 ? storedPastMonthBalance : 0)) * 100) / 100,
    [pendingCurrentMonthSum, storedPastMonthBalance]
  );

  const currentSalesAmount = parseFlexibleNumber(salesInput);
  const currentReturnAmount = parseFlexibleNumber(returnInput);
  const currentPurchaseAmount = parseFlexibleNumber(purchaseInput);

  const calculatedFinalDebt = useMemo(() => {
    const result =
      effectivePreviousDebt +
      currentSalesAmount -
      currentReturnAmount -
      currentPurchaseAmount -
      totalDeductiblePayment;
    return Math.round(result * 100) / 100;
  }, [
    effectivePreviousDebt,
    currentSalesAmount,
    currentReturnAmount,
    currentPurchaseAmount,
    totalDeductiblePayment,
  ]);

  const existingEditorInvoice = editingTargetId
    ? invoices.find((invoice) => invoice.id === editingTargetId)
    : undefined;
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
    previousPastMonthSnapshot: storedPastMonthBalance,
    salesAmount: currentSalesAmount,
    returnAmount: currentReturnAmount,
    purchaseAmount: currentPurchaseAmount,
    paymentDeducted: totalDeductiblePayment,
    currentMonthDeducted: pendingCurrentMonthSum,
    pastMonthDeducted: storedPastMonthBalance,
    finalDebt: calculatedFinalDebt,
    linkedEntryIds: customerPendingEntries.map((entry) => entry.id),
    linkedEntriesSummary: customerPendingEntries.map((entry) => ({
      id: entry.id,
      date: entry.date,
      amount: Math.abs(entry.amount),
      channel: entry.bank?.trim() || "Kassa",
    })),
    items: parsedItems,
    screenshotDataUrl: screenshotUrl || undefined,
    status: existingEditorInvoice?.status || "draft",
    approvedBy: existingEditorInvoice?.approvedBy,
    approvedAt: existingEditorInvoice?.approvedAt,
    cancelledAt: existingEditorInvoice?.cancelledAt,
    cancelledBy: existingEditorInvoice?.cancelledBy,
    rejectionReason: existingEditorInvoice?.rejectionReason,
    printedAt: existingEditorInvoice?.printedAt,
  };

  // Open editor helpers
  const nextManualInvoiceNumber = () => String(
    Math.max(32609, ...invoices.map((invoice) => Number(invoice.invoiceNo)).filter(Number.isFinite)) + 1
  );
  const currentInvoiceDate = () => new Intl.DateTimeFormat("tr-TR").format(new Date());

  const openNewForm = () => {
    const nextNo = nextManualInvoiceNumber();
    setEditingTargetId(null);
    setInvoiceNo(nextNo);
    setInvoiceDate(currentInvoiceDate());
    setSelectedCustomer(allCustomerOptions[0] || "Membran Group");
    setSellerName("Arif Mahmud");
    setWarehouseName("ANAnas");
    setDocNote("");
    setSalesInput("0");
    setReturnInput("0");
    setPurchaseInput("0");
    setParsedItems([]);
    setParsedDoc(null);
    setScreenshotUrl("");
    setCustomDebtOverride(null);
    setEditorBanner(null);
    setEditorModalOpen(true);
  };

  const openNewFormForCustomer = (cust: string) => {
    const nextNo = nextManualInvoiceNumber();
    setEditingTargetId(null);
    setInvoiceNo(nextNo);
    setInvoiceDate(currentInvoiceDate());
    setSelectedCustomer(cust);
    setSellerName("Arif Mahmud");
    setWarehouseName("ANAnas");
    setDocNote("");
    setSalesInput("0");
    setReturnInput("0");
    setPurchaseInput("0");
    setParsedItems([]);
    setParsedDoc(null);
    setScreenshotUrl("");
    setCustomDebtOverride(null);
    setEditorBanner(null);
    setEditorModalOpen(true);
  };

  const openEditorWithInvoice = (inv: InvoiceRecord) => {
    setEditingTargetId(inv.id);
    setInvoiceNo(inv.invoiceNo);
    setInvoiceDate(inv.date);
    setSelectedCustomer(inv.customer);
    setSellerName(inv.seller || "Arif Mahmud");
    setWarehouseName(inv.warehouse || "ANAnas");
    setDocNote(inv.note || "");
    setSalesInput(String(inv.salesAmount));
    setReturnInput(String(inv.returnAmount));
    setPurchaseInput(String(inv.purchaseAmount));
    setParsedItems(inv.items || []);
    setParsedDoc(null);
    setScreenshotUrl(inv.screenshotDataUrl || "");
    setCustomDebtOverride(String(inv.previousDebtSnapshot));
    setEditorBanner(null);
    setEditorModalOpen(true);
  };

  // OCR processing (Pre-warmed fast OCR with Option A self-check)
  const processImageFile = async (file: File | Blob, dataUrl?: string) => {
    try {
      setOcrBusy(true);
      setOcrProgress(5);
      setEditorBanner({ type: "info", text: "Şəkil oxunur və riyazi Option A balansı yoxlanılır..." });

      let finalDataUrl = dataUrl;
      if (!finalDataUrl) {
        finalDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      setScreenshotUrl(finalDataUrl);

      const preprocessed = await preprocessImageForOcr(file);
      setOcrProgress(30);

      const ocrText = await recognizeImageFast(preprocessed);
      setOcrProgress(90);

      const parsed = parseCloudShopInvoiceText(ocrText, allCustomerOptions);
      setParsedDoc(parsed);
      setOcrProgress(100);

      if (parsed.invoiceNo) setInvoiceNo(parsed.invoiceNo);
      if (parsed.date) setInvoiceDate(parsed.date);
      if (parsed.matchedCustomer) setSelectedCustomer(parsed.matchedCustomer);
      if (parsed.seller) setSellerName(parsed.seller);
      if (parsed.warehouse) setWarehouseName(parsed.warehouse);
      if (parsed.salesAmount > 0) setSalesInput(String(parsed.salesAmount));
      if (parsed.items.length > 0) setParsedItems(parsed.items);

      if (parsed.verified) {
        setEditorBanner({
          type: "success",
          text: `Şəkil uğurla oxundu! Option A riyazi balansı təsdiqləndi: ${parsed.items.length} məhsul cəmi = ${parsed.salesAmount.toFixed(2)} ₼ tam uyğundur.`,
        });
      } else {
        setEditorBanner({
          type: "info",
          text: `Şəkildən ${parsed.items.length} məhsul oxundu. Məlumatları nəzərdən keçirin.`,
        });
      }
    } catch (err) {
      setEditorBanner({
        type: "warning",
        text: `OCR zamanı xəta oldu: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setOcrBusy(false);
      setOcrProgress(0);
    }
  };

  // Global & editor paste handler
  const handlePasteEvent = (e: ClipboardEvent<HTMLDivElement> | Event) => {
    const clipboardData = (e as ClipboardEvent).clipboardData || (window as unknown as { clipboardData?: DataTransfer }).clipboardData;
    if (!clipboardData || !clipboardData.items) return;
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          if (!editorModalOpen) {
            setEditorModalOpen(true);
          }
          void processImageFile(file);
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
  }, [editorModalOpen, allCustomerOptions]);

  // Form actions inside modal: Send to Approval (Draft), Approve, or Reject
  const handleSaveDraft = () => {
    const record: InvoiceRecord = {
      id: editingTargetId || `inv-${Date.now()}`,
      invoiceNo: invoiceNo.trim(),
      date: invoiceDate.trim(),
      customer: selectedCustomer.trim(),
      seller: sellerName.trim(),
      warehouse: warehouseName.trim(),
      salesAmount: currentSalesAmount,
      returnAmount: currentReturnAmount,
      purchaseAmount: currentPurchaseAmount,
      previousDebtSnapshot: effectivePreviousDebt,
      previousPastMonthSnapshot: storedPastMonthBalance,
      paymentDeducted: totalDeductiblePayment,
      currentMonthDeducted: pendingCurrentMonthSum,
      pastMonthDeducted: storedPastMonthBalance,
      finalDebt: calculatedFinalDebt,
      linkedEntryIds: customerPendingEntries.map((e) => e.id),
      linkedEntriesSummary: customerPendingEntries.map((e) => ({
        id: e.id,
        date: e.date,
        amount: Math.abs(e.amount),
        channel: e.bank?.trim() || "Kassa",
      })),
      items: parsedItems,
      screenshotDataUrl: screenshotUrl || undefined,
      note: docNote.trim(),
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    onConfirmInvoice(record);
    setEditorModalOpen(false);
  };

  const handleSaveAndApprove = () => {
    const recordId = editingTargetId || `inv-${Date.now()}`;
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
      previousPastMonthSnapshot: storedPastMonthBalance,
      paymentDeducted: totalDeductiblePayment,
      currentMonthDeducted: pendingCurrentMonthSum,
      pastMonthDeducted: storedPastMonthBalance,
      finalDebt: calculatedFinalDebt,
      linkedEntryIds: customerPendingEntries.map((e) => e.id),
      linkedEntriesSummary: customerPendingEntries.map((e) => ({
        id: e.id,
        date: e.date,
        amount: Math.abs(e.amount),
        channel: e.bank?.trim() || "Kassa",
      })),
      items: parsedItems,
      screenshotDataUrl: screenshotUrl || undefined,
      note: docNote.trim(),
      status: "active",
      createdAt: new Date().toISOString(),
      approvedBy: "Arif Mahmud",
      approvedAt: new Date().toISOString(),
    };
    onConfirmInvoice(record);
    setEditorModalOpen(false);
  };

  const handlePrintPdf = () => {
    const targetPaper = pdfPaperRef.current || editorPaperRef.current;
    if (!targetPaper) return;
    const css = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules, (rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .join("\n");
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.opacity = "0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      return;
    }
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${targetPaper.outerHTML}</body></html>`
    );
    doc.close();
    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 15000);
    }, 300);
  };

  const handleCopyPaperImage = async () => {
    const targetPaper = pdfPaperRef.current || editorPaperRef.current;
    if (!targetPaper) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(targetPaper, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob && navigator.clipboard && "write" in navigator.clipboard) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }
    } catch {
      // ignore
    }
  };

  const handleSharePdf = async () => {
    const targetPaper = pdfPaperRef.current;
    if (!targetPaper || !pdfViewerInvoice) return;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(targetPaper, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      const blob = pdf.output("blob");
      const file = new File([blob], `QAIME-${pdfViewerInvoice.invoiceNo}.pdf`, { type: "application/pdf" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: `Qaimə ${pdfViewerInvoice.invoiceNo}`,
          text: `${pdfViewerInvoice.customer} üçün AriX qaiməsi`,
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
      setEditorBanner({ type: "warning", text: "PDF paylaşma hazırlanmadı. Yazdır / PDF düyməsini istifadə edin." });
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
            </div>
            <button type="button" className="primary-button" onClick={openNewForm}>
              <Plus size={16} />
              <span>Yeni qaimə</span>
              <small>Ctrl+V</small>
            </button>
          </div>
        </header>

        {filteredInvoices.length === 0 ? (
          <div className="approval-forms-search-empty">
            <FileText size={32} />
            <b>Qaimə və ya sipariş formu tapılmadı</b>
            <span>Ekran görüntüsünü birbaşa buraya yapışdırın (Ctrl+V) və ya yeni form yaradın.</span>
            <button type="button" onClick={openNewForm}>
              + Yeni Form Yarat
            </button>
          </div>
        ) : (
          <div className="approval-forms-table">
            <div className="approval-forms-table-head">
              <span>PDF</span>
              <span>Durum</span>
              <span>Form / Qaimə</span>
              <span>Müştəri</span>
              <span>Satış təmsilçisi</span>
              <span>Onaylayan</span>
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
                    <article key={inv.id} className="approval-form-row">
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
                            ? "Onaylandı"
                            : stateClass === "rejected"
                              ? "Reddedildi"
                              : "Onay bekliyor"}
                        </b>
                      </span>

                      <div
                        className="approval-form-open"
                        role="button"
                        tabIndex={0}
                        onClick={() => openEditorWithInvoice(inv)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") openEditorWithInvoice(inv);
                        }}
                      >
                        <span>
                          <b>SPF-{inv.invoiceNo}</b>
                          <small>Qaimə #{inv.invoiceNo} · {inv.items.length} kalem</small>
                        </span>
                        <span>
                          <b>{inv.customer}</b>
                          <small>Borc: {formatMoney(inv.finalDebt, "AZN")}</small>
                        </span>
                        <span>
                          <b>{inv.seller || "Arif Mahmud"}</b>
                          <small>Satış: {formatMoney(inv.salesAmount, "AZN")}</small>
                        </span>
                        <span>
                          <b>{inv.approvedBy || (inv.status === "draft" ? "Gözləyir" : "İptal")}</b>
                          <small>{inv.status === "active" ? "Onaylandı" : "—"}</small>
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
                onClick={() => setEditorModalOpen(false)}
              >
                <ArrowLeft size={16} />
                <span>Geri</span>
              </button>
              <div className="modal-heading">
                <h2>SPF-{invoiceNo} · Sipariş Onay Formu</h2>
                <p>Ekran görüntüsünü yapışdırın (Ctrl+V) və ya xanaları redaktə edin.</p>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setEditorModalOpen(false)}
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
                  {/* OCR & Paste Trigger Bar */}
                  <div className="approval-domestic-line-action">
                    <label>
                      <ImageIcon size={16} />
                      <button
                        type="button"
                        className="brand-upload-button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={ocrBusy}
                      >
                        <Upload size={14} />
                        <span>{ocrBusy ? `Oxunur... ${ocrProgress}%` : "Ekran görüntüsü seç və ya Ctrl+V"}</span>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void processImageFile(file);
                        }}
                      />
                    </label>
                    <small>İstər veb, istərsə də qaimə ekran görüntüsü dəstəklənir.</small>
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
                        onChange={(e) => setSelectedCustomer(e.target.value)}
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
                  <div className="approval-fields two">
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
                      <span>Əvvəlki Borc Qalığı (AZN)</span>
                      <input
                        inputMode="decimal"
                        value={
                          customDebtOverride !== null
                            ? customDebtOverride
                            : String(effectivePreviousDebt)
                        }
                        onChange={(e) => setCustomDebtOverride(e.target.value)}
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
                      Cari ayda {customerPendingEntries.length} qaiməsiz ödəniş (
                      {formatMoney(pendingCurrentMonthSum, "AZN")})
                      {storedPastMonthBalance > 0 &&
                        ` + Keçən aydan qalan qalıq (${formatMoney(storedPastMonthBalance, "AZN")})`}
                    </small>
                  </div>

                  {/* Product items table */}
                  <div>
                    <div className="approval-line-head">
                      <span>Məhsul adı</span>
                      <span>Miqdar</span>
                      <span>Qiymət</span>
                      <span>Məbləğ</span>
                    </div>
                    <div className="approval-lines">
                      {parsedItems.length === 0 ? (
                        <div style={{ padding: "20px", textAlign: "center", color: "#667085", fontSize: "11px" }}>
                          Məhsul siyahısı boşdur. Ekran görüntüsü yapışdırın və ya aşağıdan məhsul əlavə edin.
                        </div>
                      ) : (
                        parsedItems.map((item, idx) => (
                          <div key={`${item.no || idx}-${item.name}`} className="approval-line">
                            <label>
                              <input
                                value={item.name}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setParsedItems((prev) =>
                                    prev.map((it, i) => (i === idx ? { ...it, name: val } : it))
                                  );
                                }}
                              />
                            </label>
                            <label>
                              <input
                                inputMode="decimal"
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = parseFlexibleNumber(e.target.value);
                                  setParsedItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx
                                        ? { ...it, quantity: val, total: Math.round(val * it.price * 100) / 100 }
                                        : it
                                    )
                                  );
                                }}
                              />
                            </label>
                            <label>
                              <input
                                inputMode="decimal"
                                value={item.price}
                                onChange={(e) => {
                                  const val = parseFlexibleNumber(e.target.value);
                                  setParsedItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx
                                        ? { ...it, price: val, total: Math.round(it.quantity * val * 100) / 100 }
                                        : it
                                    )
                                  );
                                }}
                              />
                            </label>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <b style={{ fontSize: "11px" }}>{item.total.toFixed(2)} ₼</b>
                              <button
                                type="button"
                                style={{ border: 0, background: "none", color: "#c8283c", cursor: "pointer" }}
                                onClick={() => setParsedItems((prev) => prev.filter((_, i) => i !== idx))}
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
                      onClick={() =>
                        setParsedItems((prev) => [
                          ...prev,
                          {
                            no: prev.length + 1,
                            name: "Yeni Məhsul",
                            code: "",
                            quantity: 1,
                            unit: "metr",
                            price: 0,
                            discount: 0,
                            total: 0,
                          },
                        ])
                      }
                    >
                      <Plus size={14} /> <span>+ Sətir əlavə et</span>
                    </button>
                  </div>
                </div>

                {/* RIGHT: APPROVAL PAPER PREVIEW (Exact A4 Form) */}
                <div className="approval-paper-wrap">
                  <div className="approval-preview-label">A4 Form Önizləməsi</div>
                  <QaimeDocument ref={editorPaperRef} invoice={editorPreviewInvoice} />
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditorModalOpen(false)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void handleCopyPaperImage()}
              >
                <Copy size={15} />
                <span>Şəkli kopyala</span>
              </button>
              <button
                type="button"
                className="secondary"
                onClick={handlePrintPdf}
              >
                <Printer size={15} />
                <span>Yazdır / PDF</span>
              </button>
              <button
                type="button"
                className="secondary"
                onClick={handleSaveDraft}
              >
                <Clock size={15} />
                <span>Onaya göndər (Qaralama)</span>
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleSaveAndApprove}
              >
                <Check size={16} />
                <span>✓ Formu Onayla</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          FULL SCREEN PDF VIEWER (AriX Order ApprovalPdfViewer style with
          Top Bar: Geri | Info | Onayla | Reddet | Düzenle | Kopyala | Yazdır)
      ========================================================================= */}
      {pdfViewerInvoice && (
        <div className="approval-pdf-viewer" role="dialog" aria-modal="true">
          <header>
            <button type="button" onClick={() => setPdfViewerInvoice(null)}>
              <ArrowLeft size={17} />
              <span>Geri</span>
            </button>
            <div>
              <b>SPF-{pdfViewerInvoice.invoiceNo} · {pdfViewerInvoice.customer}</b>
              <small>{pdfViewerInvoice.seller || "Arif Mahmud"} · {pdfViewerInvoice.date}</small>
            </div>
            <nav>
              {pdfViewerInvoice.status === "draft" && (
                <button
                  type="button"
                  className="approval-viewer-approve"
                  onClick={() => {
                    onApproveInvoice(pdfViewerInvoice.id);
                    setPdfViewerInvoice(null);
                  }}
                >
                  <Check size={16} />
                  <span>Onayla</span>
                </button>
              )}
              {pdfViewerInvoice.status !== "cancelled" && (
                <button
                  type="button"
                  className="approval-viewer-reject"
                  onClick={() => {
                    onCancelInvoice(pdfViewerInvoice.id);
                    setPdfViewerInvoice(null);
                  }}
                >
                  <X size={16} />
                  <span>Reddet / İptal</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const inv = pdfViewerInvoice;
                  setPdfViewerInvoice(null);
                  openEditorWithInvoice(inv);
                }}
              >
                <Pencil size={16} />
                <span>Düzenle</span>
              </button>
              <button type="button" onClick={() => void handleCopyPaperImage()}>
                <Copy size={16} />
                <span>Şəkli kopyala</span>
              </button>
              <button type="button" onClick={() => void handleSharePdf()}>
                <Share2 size={16} />
                <span>Paylaş</span>
              </button>
              <button type="button" onClick={handlePrintPdf}>
                <Printer size={16} />
                <span>Yazdır / PDF</span>
              </button>
            </nav>
          </header>
          <main>
            <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
              {pdfViewerInvoice && (
              <>
              <QaimeDocument ref={pdfPaperRef} invoice={pdfViewerInvoice} />
              </>
              )}
            </div>
          </main>
        </div>
      )}
    </>
  );
}
