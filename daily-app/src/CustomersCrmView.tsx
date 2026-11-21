import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Copy,
  Eye,
  FilePlus2,
  FileText,
  HandCoins,
  Layers3,
  ListChecks,
  MapPin,
  MoreHorizontal,
  NotepadText,
  Pencil,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Share2,
  AlertTriangle,
  Trash2,
  Truck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import AriXLogo from "./AriXLogo";
import QaimePreviewStage from "./QaimePreviewStage";
import { printQaimeDocument, QaimePrintButton, type PrintMode } from "./QaimePrintDropdown";
import { parseFlexibleNumber, type InvoiceRecord } from "./qaimeParser";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

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

type CustomerProfileMeta = {
  salesRepresentative: string;
  contactPerson: string;
  phone: string;
  address: string;
  note: string;
};

const CUSTOMER_PROFILES_STORAGE_KEY = "arix-daily-customer-profiles-v1";

function loadCustomerProfiles(): Record<string, CustomerProfileMeta> {
  try {
    const raw = localStorage.getItem(CUSTOMER_PROFILES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    // ignore
  }
  return {
    "Membran Group": {
      salesRepresentative: "Arif Mahmud",
      contactPerson: "Rəşad bəy",
      phone: "+994 50 210 44 55",
      address: "Bakı, Dərnəgül şossesi",
      note: "Topdan membran sifarişçisi",
    },
  };
}

type Props = {
  entries: EntryItem[];
  customerDebts: Record<string, number>;
  pastMonthUninvoiced: Record<string, number>;
  invoices: InvoiceRecord[];
  knownCustomers: string[];
  directoryLabel?: string;
  directorySingle?: string;
  includeCustomer?: (name: string) => boolean;
  selectedCustomerName: string | null;
  onSelectCustomerName: (name: string | null) => void;
  formatMoney: (value: number, currency: "TRY" | "AZN" | "USD") => string;
  currentUserName: string;
  canManageInvoice: boolean;
  canApproveInvoice: boolean;
  canEditEntries: boolean;
  canManageDirectories: boolean;
  onApproveInvoice: (invoiceId: string) => void;
  onCancelInvoice: (invoiceId: string, reason?: string) => void;
  onUpdateCustomerDebt: (customer: string, newDebt: number) => void;
  onToggleEntryInvoiced: (entryId: string) => void;
  onCreateInvoiceForCustomer: (customer: string) => void;
  onOpenInvoiceInBuilder: (invoice: InvoiceRecord) => void;
  onAddCustomer?: (name: string, initialDebt: number) => string | void;
  onRenameCustomer?: (oldName: string, newName: string) => string | void;
  onDeleteCustomer?: (customerName: string) => void;
  hasQaime?: boolean;
};

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

export default function CustomersCrmView({
  entries,
  customerDebts,
  pastMonthUninvoiced,
  invoices,
  knownCustomers,
  directoryLabel = "Müştərilər",
  directorySingle = "Müştəri",
  includeCustomer,
  selectedCustomerName,
  onSelectCustomerName,
  formatMoney,
  currentUserName,
  canManageInvoice,
  canApproveInvoice,
  canEditEntries,
  canManageDirectories,
  onApproveInvoice,
  onCancelInvoice,
  onUpdateCustomerDebt,
  onToggleEntryInvoiced,
  onCreateInvoiceForCustomer,
  onOpenInvoiceInBuilder,
  onAddCustomer,
  onRenameCustomer,
  onDeleteCustomer,
  hasQaime = true,
}: Props) {
  const [search, setSearch] = useState("");
  const [newCustomerDraft, setNewCustomerDraft] = useState("");
  const [profiles, setProfiles] = useState<Record<string, CustomerProfileMeta>>(loadCustomerProfiles);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRecord | null>(null);
  const [invoiceDecisionConfirmation, setInvoiceDecisionConfirmation] = useState<{ invoice: InvoiceRecord; action: "approve" | "cancel" } | null>(null);
  const [invoiceDecisionReason, setInvoiceDecisionReason] = useState("");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [viewerExportAction, setViewerExportAction] = useState<"share" | "copy" | "print" | null>(null);
  const [activeTab, setActiveTab] = useState<"invoices" | "payments" | "profile">(() => (hasQaime ? "invoices" : "payments"));

  // Editable customer fields when a customer is opened
  const [nameDraft, setNameDraft] = useState("");
  const [repDraft, setRepDraft] = useState("");
  const [contactDraft, setContactDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [addressDraft, setAddressDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [debtDraft, setDebtDraft] = useState("0");

  // Modals for actions
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [addCustomerModalOpen, setAddCustomerModalOpen] = useState(false);

  // Add Customer modal fields
  const [newCustName, setNewCustName] = useState("");
  const [newCustDebt, setNewCustDebt] = useState("0");
  const [newCustRep, setNewCustRep] = useState("");
  const [newCustContact, setNewCustContact] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");

  const modalPaperRef = useRef<HTMLElement | null>(null);
  const viewerExportBusyRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOMER_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch {
      // ignore
    }
  }, [profiles]);

  // Build unified normal customer list
  const customerRows = useMemo(() => {
    const nameSet = new Set<string>([
      ...knownCustomers,
      ...Object.keys(customerDebts),
      ...Object.keys(pastMonthUninvoiced),
    ]);
    for (const inv of invoices) {
      if (inv.customer?.trim()) nameSet.add(inv.customer.trim());
    }
    for (const e of entries) {
      if (e.kind === "income" && e.counterparty?.trim() && e.counterparty !== "Qeyd edilməyib") {
        nameSet.add(e.counterparty.trim());
      }
    }

    const canonicalMap = new Map<string, string>();
    for (const rawName of nameSet) {
      const clean = rawName.trim();
      if (!clean || (includeCustomer && !includeCustomer(clean))) continue;
      const lower = clean.toLocaleLowerCase("az-AZ");
      if (!canonicalMap.has(lower)) {
        canonicalMap.set(lower, clean);
      }
    }

    const rows = Array.from(canonicalMap.entries()).map(([lower, name]) => {
      const debtKey = Object.keys(customerDebts).find((k) => k.toLocaleLowerCase("az-AZ") === lower);
      const currentDebt = debtKey !== undefined ? customerDebts[debtKey] : 0;

      const pastKey = Object.keys(pastMonthUninvoiced).find((k) => k.toLocaleLowerCase("az-AZ") === lower);
      const pastMonthBalance = pastKey !== undefined ? pastMonthUninvoiced[pastKey] : 0;

      const custPayments = entries
        .filter((e) => e.kind === "income" && e.counterparty.trim().toLocaleLowerCase("az-AZ") === lower)
        .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));

      const totalPaidThisMonth = Math.round(custPayments.reduce((s, e) => s + Math.abs(e.amount), 0) * 100) / 100;
      const invoicedPaidThisMonth = Math.round(
        custPayments.filter((e) => e.invoiced).reduce((s, e) => s + Math.abs(e.amount), 0) * 100
      ) / 100;
      const pendingPaidThisMonth = Math.max(0, Math.round((totalPaidThisMonth - invoicedPaidThisMonth) * 100) / 100);
      const totalPendingPayment = Math.round(
        (pendingPaidThisMonth + (pastMonthBalance > 0 ? pastMonthBalance : 0)) * 100
      ) / 100;

      const custInvoices = invoices.filter((inv) => inv.customer.trim().toLocaleLowerCase("az-AZ") === lower);
      const profileKey = Object.keys(profiles).find((k) => k.toLocaleLowerCase("az-AZ") === lower);
      const profile = profileKey ? profiles[profileKey] : undefined;

      return {
        name,
        lower,
        currentDebt,
        pastMonthBalance,
        custPayments,
        totalPaidThisMonth,
        pendingPaidThisMonth,
        totalPendingPayment,
        custInvoices,
        profile,
      };
    });

    return rows.sort((a, b) => a.name.localeCompare(b.name, "az-AZ"));
  }, [knownCustomers, customerDebts, pastMonthUninvoiced, invoices, entries, profiles, includeCustomer]);

  const filteredCustomerRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("az-AZ");
    if (!q) return customerRows;
    return customerRows.filter(
      (row) =>
        row.name.toLocaleLowerCase("az-AZ").includes(q) ||
        (row.profile?.phone ?? "").toLocaleLowerCase("az-AZ").includes(q) ||
        (row.profile?.salesRepresentative ?? "").toLocaleLowerCase("az-AZ").includes(q) ||
        (row.profile?.contactPerson ?? "").toLocaleLowerCase("az-AZ").includes(q)
    );
  }, [customerRows, search]);

  const activeCustomerData = useMemo(() => {
    if (!selectedCustomerName) return null;
    const lower = selectedCustomerName.trim().toLocaleLowerCase("az-AZ");
    return (
      customerRows.find((r) => r.lower === lower) || {
        name: selectedCustomerName,
        lower,
        currentDebt: customerDebts[selectedCustomerName] ?? 0,
        pastMonthBalance: pastMonthUninvoiced[selectedCustomerName] ?? 0,
        custPayments: [],
        totalPaidThisMonth: 0,
        pendingPaidThisMonth: 0,
        totalPendingPayment: 0,
        custInvoices: [],
        profile: profiles[selectedCustomerName],
      }
    );
  }, [selectedCustomerName, customerRows, customerDebts, pastMonthUninvoiced, profiles]);

  // Sync editable fields when selectedCustomerName changes
  useEffect(() => {
    if (!activeCustomerData) return;
    const p = activeCustomerData.profile;
    const lastInv = activeCustomerData.custInvoices[0];
    setNameDraft(activeCustomerData.name);
    setRepDraft(p?.salesRepresentative || lastInv?.seller || currentUserName);
    setContactDraft(p?.contactPerson || "");
    setPhoneDraft(p?.phone || "");
    setAddressDraft(p?.address || "");
    setNoteDraft(p?.note || "");
    setDebtDraft(String(activeCustomerData.currentDebt));
    setSaveNotice(null);
  }, [activeCustomerData?.name, activeCustomerData?.currentDebt]);

  const handleAddCustomerSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canManageDirectories) return;
    const clean = newCustomerDraft.trim();
    if (!clean) return;
    const savedCustName = onAddCustomer?.(clean, 0) || clean;
    setNewCustomerDraft("");
    if (!hasQaime) setActiveTab("profile");
    onSelectCustomerName(savedCustName);
  };

  const handleSaveCustomerProfile = (e: FormEvent) => {
    e.preventDefault();
    if (!activeCustomerData || (!canManageDirectories && !canEditEntries)) return;
    const custName = activeCustomerData.name;

    // Check if customer name has changed
    const cleanNewName = nameDraft.trim();
    if (canManageDirectories && cleanNewName && cleanNewName.toLocaleLowerCase("az-AZ") !== custName.toLocaleLowerCase("az-AZ")) {
      setRenameModalOpen(true);
      return;
    }

    if (canManageDirectories) {
      setProfiles((prev) => ({
        ...prev,
        [custName]: {
          salesRepresentative: repDraft.trim(),
          contactPerson: contactDraft.trim(),
          phone: phoneDraft.trim(),
          address: addressDraft.trim(),
          note: noteDraft.trim(),
        },
      }));
    }
    if (canEditEntries) {
      const parsedDebt = parseFlexibleNumber(debtDraft);
      onUpdateCustomerDebt(custName, parsedDebt);
    }
    setSaveNotice("Müştəri məlumatları və borc qalığı yadda saxlanıldı.");
    window.setTimeout(() => setSaveNotice(null), 3000);
  };

  const handleConfirmRenameCustomer = () => {
    if (!activeCustomerData) return;
    const oldName = activeCustomerData.name;
    const cleanNewName = nameDraft.trim();
    if (!cleanNewName || cleanNewName.toLocaleLowerCase("az-AZ") === oldName.toLocaleLowerCase("az-AZ")) {
      setRenameModalOpen(false);
      return;
    }

    // 1. Trigger parent rename (updates entries, debts, invoices, customerList)
    const finalNewName = onRenameCustomer?.(oldName, cleanNewName) || cleanNewName;

    // 2. Update local profiles record
    setProfiles((prev) => {
      const next = { ...prev };
      delete next[oldName];
      next[finalNewName] = {
        salesRepresentative: repDraft.trim(),
        contactPerson: contactDraft.trim(),
        phone: phoneDraft.trim(),
        address: addressDraft.trim(),
        note: noteDraft.trim(),
      };
      return next;
    });

    if (canEditEntries) {
      const parsedDebt = parseFlexibleNumber(debtDraft);
      onUpdateCustomerDebt(finalNewName, parsedDebt);
    }

    setRenameModalOpen(false);
    onSelectCustomerName(finalNewName);
    setSaveNotice("Müştəri adı və məlumatlar yeniləndi");
    window.setTimeout(() => setSaveNotice(null), 3000);
  };

  const handleConfirmDeleteCustomer = () => {
    if (!activeCustomerData) return;
    const custName = activeCustomerData.name;

    onDeleteCustomer?.(custName);

    setProfiles((prev) => {
      const next = { ...prev };
      delete next[custName];
      return next;
    });

    setDeleteModalOpen(false);
    onSelectCustomerName(null);
  };

  const handleCreateCustomerFromModal = (e: FormEvent) => {
    e.preventDefault();
    const clean = newCustName.trim();
    if (!clean) return;

    const parsedDebt = parseFlexibleNumber(newCustDebt);
    const savedCustName = onAddCustomer?.(clean, parsedDebt) || clean;

    if (newCustRep.trim() || newCustContact.trim() || newCustPhone.trim() || newCustAddress.trim()) {
      setProfiles((prev) => ({
        ...prev,
        [savedCustName]: {
          salesRepresentative: newCustRep.trim() || currentUserName,
          contactPerson: newCustContact.trim(),
          phone: newCustPhone.trim(),
          address: newCustAddress.trim(),
          note: "",
        },
      }));
    }

    setAddCustomerModalOpen(false);
    setNewCustName("");
    setNewCustDebt("0");
    setNewCustRep("");
    setNewCustContact("");
    setNewCustPhone("");
    setNewCustAddress("");
    if (!hasQaime) setActiveTab("profile");
    onSelectCustomerName(savedCustName);
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
        clonedEl.style.transform = "none";
        clonedEl.style.transformOrigin = "initial";
        clonedEl.style.width = "794px";
        clonedEl.style.minWidth = "794px";
        clonedEl.style.maxWidth = "794px";
        clonedEl.style.boxShadow = "none";
      },
    });
  };

  const runViewerExport = async (
    action: "share" | "copy" | "print",
    work: () => Promise<void> | void,
  ) => {
    if (viewerExportBusyRef.current) return;
    viewerExportBusyRef.current = true;
    setViewerExportAction(action);
    try {
      await work();
    } finally {
      const release = () => {
        viewerExportBusyRef.current = false;
        setViewerExportAction(null);
      };
      if (action === "print") window.setTimeout(release, 900);
      else release();
    }
  };

  const handlePrintPdf = (mode: PrintMode = "bw") => {
    const targetPaper = modalPaperRef.current;
    if (!targetPaper) return;
    printQaimeDocument(targetPaper, mode);
  };

  const handleSharePdf = async () => {
    const targetPaper = modalPaperRef.current;
    if (!targetPaper || !previewInvoice) return;
    try {
      const [{ jsPDF }] = await Promise.all([import("jspdf")]);
      const canvas = await generateHighResCanvas(targetPaper);
      const imgWidthMm = 210;
      const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;
      const pdf = new jsPDF({
        unit: "mm",
        format: imgHeightMm > 297 ? [imgWidthMm, imgHeightMm] : "a4",
        orientation: "portrait",
        compress: true,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidthMm, imgHeightMm, undefined, "FAST");
      const pdfBlob = pdf.output("blob");
      const fileName = `SPF-${previewInvoice.invoiceNo}-${previewInvoice.customer.replace(/\\s+/g, "_")}.pdf`;
      const file = new File([pdfBlob], fileName, { type: "application/pdf" });
      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `SPF-${previewInvoice.invoiceNo} · ${previewInvoice.customer}`,
          text: `AzArt Membran satış təsdiq formu (Qaimə №${previewInvoice.invoiceNo})`,
        });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // ignore
    }
  };

  const handleCopyModalPaperImage = async () => {
    if (!modalPaperRef.current || !previewInvoice) return;
    try {
      const canvas = await generateHighResCanvas(modalPaperRef.current);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob && navigator.clipboard && "write" in navigator.clipboard) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setSaveNotice("Formun şəkli panoya kopyalandı!");
        window.setTimeout(() => setSaveNotice(null), 2500);
      }
    } catch {
      // ignore
    }
  };

  const isViewerExportBusy = viewerExportAction !== null;
  const shouldCloseViewerAfterDecision = () => document.documentElement.dataset.dailyInvoiceViewerAfterDecision === "close";

  // ============================================================================
  // CUSTOMER DETAIL WINDOW (Opened when clicking a customer from the normal list)
  // ============================================================================
  if (activeCustomerData) {
    return (
      <>
        <div className="customer-detail-navigation">
        <section className="page-heading page-heading-split">
          <div>
            <button
              type="button"
              className="crm-back-link"
              onClick={() => onSelectCustomerName(null)}
            >
              <ArrowLeft size={16} />
              <span>Müştəri siyahısına qayıt</span>
            </button>
            <div className="cust-title-row">
              <h1>{activeCustomerData.name}</h1>
              {canManageDirectories && (
                <div className="cust-title-actions">
                  <button
                    type="button"
                    className="cust-action-pill-btn edit"
                    onClick={() => {
                      setNameDraft(activeCustomerData.name);
                      setRenameModalOpen(true);
                    }}
                    title="Müştəri adını dəyişdir"
                  >
                    <Pencil size={13} />
                    <span>Adı dəyiş</span>
                  </button>
                  <button
                    type="button"
                    className="cust-action-pill-btn delete"
                    onClick={() => setDeleteModalOpen(true)}
                    title="Müştərini sistemdən sil"
                  >
                    <Trash2 size={13} />
                    <span>Müştərini sil</span>
                  </button>
                </div>
              )}
            </div>
            <p>
              Müştəri məlumatları, sifariş/qaimə təsdiq formaları və Gündəlik Dəftərdən gələn ödənişlər.
            </p>
          </div>
          {hasQaime && canManageInvoice && (
            <div className="invoice-header-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => onCreateInvoiceForCustomer(activeCustomerData.name)}
              >
                <FilePlus2 size={16} />
                <span>+ Yeni sifariş / qaimə formu</span>
              </button>
            </div>
          )}
        </section>

        {/* TOP SUMMARY KPI BAR */}
        <div className="customer-summary-kpis">
          <div className="cust-kpi-item debt">
            <span>Cari Borc Qalığı</span>
            <b className={activeCustomerData.currentDebt > 0 ? "debt-pos" : ""}>
              {formatMoney(activeCustomerData.currentDebt, "AZN")}
            </b>
          </div>
          <div className="cust-kpi-item payments">
            <span>Bu Aykı Ödənişlər</span>
            <b className="income">+{formatMoney(activeCustomerData.totalPaidThisMonth, "AZN")}</b>
          </div>
          {hasQaime && (
            <div className="cust-kpi-item invoices">
              <span>Sifariş / Qaimə Formları</span>
              <b>{activeCustomerData.custInvoices.length} sənəd</b>
            </div>
          )}
          {hasQaime && activeCustomerData.totalPendingPayment > 0 && (
            <div className="cust-kpi-item pending">
              <span>Form Gözləyən Ödəniş</span>
              <b className="pending">{formatMoney(activeCustomerData.totalPendingPayment, "AZN")}</b>
            </div>
          )}
        </div>

        {/* SEGMENTED TABS BAR */}
        <div className="customer-detail-tabs" role="tablist" aria-label="Müştəri bölmələri">
          {hasQaime && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "invoices"}
              className={activeTab === "invoices" ? "active" : ""}
              onClick={() => setActiveTab("invoices")}
            >
              <FileText size={15} />
              <span>Qaimələr</span>
              <em className="tab-badge">{activeCustomerData.custInvoices.length}</em>
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "payments"}
            className={activeTab === "payments" ? "active" : ""}
            onClick={() => setActiveTab("payments")}
          >
            <WalletCards size={15} />
            <span>Ödənişlər</span>
            <em className="tab-badge">{activeCustomerData.custPayments.length}</em>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "profile"}
            className={activeTab === "profile" ? "active" : ""}
            onClick={() => setActiveTab("profile")}
          >
            <UserRound size={15} />
            <span>Profil</span>
          </button>
        </div>

        </div>

        <div className="customer-tab-content">
          {/* TAB 1: QAİMƏLƏR VƏ SİFARİŞ FORMLARI */}
          {activeTab === "invoices" && hasQaime && (
            <section className="approval-forms-page">
              <header>
                <div className="approval-forms-title">
                  <b>Müştəri formaları (sifariş / qaimə)</b>
                  <span>{activeCustomerData.custInvoices.length} sənəd</span>
                </div>
                <div />
                {canManageInvoice && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => onCreateInvoiceForCustomer(activeCustomerData.name)}
                  >
                    <Plus size={15} />
                    <span>Yeni Form Yarat</span>
                  </button>
                )}
              </header>

              {activeCustomerData.custInvoices.length === 0 ? (
                <div className="approval-forms-search-empty">
                  <FileText size={28} />
                  <b>Bu müştəri üçün hələ sifariş / qaimə formu yoxdur</b>
                  <span>Yeni form yaratmaq üçün yuxarıdakı düyməyə klikləyin.</span>
                </div>
              ) : (
                <div className="approval-forms-table">
                  <div className="approval-forms-table-head">
                    <span>PDF</span>
                    <span>Durum</span>
                    <span>Form / Qaimə</span>
                    <span>Müştəri / Detal</span>
                    <span>Satış / Ödəniş</span>
                    <span>Təsdiqləyən / Əməliyyat</span>
                    <span>Sənəd tarixi</span>
                  </div>
                  {activeCustomerData.custInvoices.map((inv) => {
                    const stateKey =
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
                            onClick={() => setPreviewInvoice(inv)}
                          >
                            <Eye size={14} />
                            <span>Göstər</span>
                          </button>
                        </span>
                        <span className={`approval-form-state ${stateKey}`}>
                          <i>
                            {stateKey === "approved" ? (
                              <Check size={11} />
                            ) : stateKey === "rejected" ? (
                              <X size={11} />
                            ) : (
                              <Clock size={11} />
                            )}
                          </i>
                          <b>
                            {stateKey === "approved"
                              ? "Təsdiqləndi"
                              : stateKey === "rejected"
                                ? "Reddedildi"
                                : "Təsdiq gözləyir"}
                          </b>
                        </span>
                        <div
                          className="approval-form-open"
                          role={canManageInvoice ? "button" : undefined}
                          tabIndex={canManageInvoice ? 0 : undefined}
                          onClick={() => { if (canManageInvoice) onOpenInvoiceInBuilder(inv); }}
                          onKeyDown={(e) => {
                            if (canManageInvoice && (e.key === "Enter" || e.key === " ")) onOpenInvoiceInBuilder(inv);
                          }}
                        >
                          <span>
                            <b>SPF-{inv.invoiceNo}</b>
                            <small>Qaimə №{inv.invoiceNo} · {inv.items.length} kalem</small>
                          </span>
                          <span>
                            <b>{inv.customer}</b>
                            <small>
                              Köhnə borc: {formatMoney(inv.previousDebtSnapshot, "AZN")} → Yekun:{" "}
                              {formatMoney(inv.finalDebt, "AZN")}
                            </small>
                          </span>
                          <span>
                            <b>Satış: {formatMoney(inv.salesAmount, "AZN")}</b>
                            <small>Çıxılan ödəniş: −{formatMoney(inv.paymentDeducted, "AZN")}</small>
                          </span>
                          <span onClick={(e) => e.stopPropagation()}>
                            {inv.status === "draft" && canApproveInvoice ? (
                              <div className="inline-approval-btns">
                                <button
                                  type="button"
                                  className="inline-approve-btn"
                                  onClick={() => onApproveInvoice(inv.id)}
                                >
                                  <Check size={13} /> Təsdiqlə
                                </button>
                                <button
                                  type="button"
                                  className="inline-reject-btn"
                                  onClick={() => {
                                    const reason = window.prompt("Ləğv səbəbini yazın:", "");
                                    if (reason !== null) onCancelInvoice(inv.id, reason);
                                  }}
                                >
                                  <X size={13} /> Rədd et
                                </button>
                              </div>
                            ) : inv.status === "draft" ? (
                              <div><b>Gözləyir</b><small>Təsdiq səlahiyyəti tələb olunur</small></div>
                            ) : inv.status === "active" ? (
                              <div className="inline-approval-btns">
                                <div>
                                  <b>{inv.approvedBy || currentUserName}</b>
                                  <small>Təsdiqləndi</small>
                                </div>
                                {canApproveInvoice && (
                                  <button
                                    type="button"
                                    className="inline-reject-btn"
                                    onClick={() => {
                                      const reason = window.prompt("Ləğv səbəbini yazın:", "");
                                      if (reason !== null) onCancelInvoice(inv.id, reason);
                                    }}
                                    title="İptal et və borcu/ödənişi yerinə qaytar"
                                  >
                                    <RotateCcw size={12} /> İptal
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div>
                                <b>İptal edildi</b>
                                <small>Bərpa olundu</small>
                              </div>
                            )}
                          </span>
                          <span>
                            <b>{inv.date}</b>
                            <small>Təmsilçi: {inv.seller || currentUserName}</small>
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* TAB 2: ÖDƏNİŞLƏR (GÜNDƏLİK DƏFTƏR) */}
          {activeTab === "payments" && (
            <section className="approval-forms-page">
              <header>
                <div className="approval-forms-title">
                  <b>Müştəri Ödənişləri (Gündəlik Dəftər)</b>
                  <span>{activeCustomerData.custPayments.length} ödəniş</span>
                </div>
                <div />
                <div className="customer-payment-summary-pills">
                  <span>
                    Cəmi ödəniş: <b>{formatMoney(activeCustomerData.totalPaidThisMonth, "AZN")}</b>
                  </span>
                  {hasQaime && activeCustomerData.totalPendingPayment > 0 && (
                    <span className="pending">
                      Form gözləyən: <b>{formatMoney(activeCustomerData.totalPendingPayment, "AZN")}</b>
                    </span>
                  )}
                </div>
              </header>

              {activeCustomerData.custPayments.length === 0 && activeCustomerData.pastMonthBalance <= 0 ? (
                <div className="approval-forms-search-empty">
                  <WalletCards size={28} />
                  <b>Bu müştəri üzrə ödəniş qeydi tapılmadı</b>
                  <span>Gündəlik Dəftərdə bu müştəri adına mədaxil yazıldıqda burada görünür.</span>
                </div>
              ) : (
                <div className="customer-payments-list">
                  {hasQaime && activeCustomerData.pastMonthBalance > 0 && (
                    <article className="customer-payment-row compact-pay-card">
                      <div className="pay-row-top pay-card-line1">
                        <div className="pay-row-identity pay-card-left">
                          <span className="pay-icon"><ArrowDownLeft size={13} /></span>
                          <span className="pay-card-title"><b>Keçən aydan qaiməyə vurulmamış qalıq</b></span>
                        </div>
                        <strong className="pay-amount pay-card-amount income">+{formatMoney(activeCustomerData.pastMonthBalance, "AZN")}</strong>
                      </div>
                      <div className="pay-row-bottom pay-card-line2">
                        <div className="pay-channel-pill pay-card-meta">
                          <span className="pay-channel-badge">Kassa / Bank</span>
                          <span className="pay-time-stamp"> · Növbəti formda avtomatik çıxılacaq</span>
                        </div>
                        <div className="pay-card-action">
                          <span className="pay-status pay-status-pill pending">⏳ Gözləyir</span>
                        </div>
                      </div>
                    </article>
                  )}
                  {activeCustomerData.custPayments.map((entry) => {
                    const cleanNote = entry.note && entry.note.trim() && entry.note !== "." && entry.note !== "—" ? entry.note.trim() : "";
                    const categoryLabel = entry.category || "Vəsait qəbulu";
                    return (
                      <article key={entry.id} className="customer-payment-row compact-pay-card">
                        <div className="pay-row-top pay-card-line1">
                          <div className="pay-row-identity pay-card-left">
                            <span className="pay-icon"><ArrowDownLeft size={13} /></span>
                            <span className="pay-card-title">
                              <b>{categoryLabel}</b>
                              {cleanNote && <span className="pay-note"> · {cleanNote}</span>}
                            </span>
                          </div>
                          <strong className="pay-amount pay-card-amount income">+{formatMoney(Math.abs(entry.amount), "AZN")}</strong>
                        </div>
                        <div className="pay-row-bottom pay-card-line2">
                          <div className="pay-channel-pill pay-card-meta">
                            <span className="pay-channel-badge">{entry.bank || "Kassa"}</span>
                            {entry.responsible && <span className="pay-resp"> · {entry.responsible}</span>}
                            <span className="pay-time-stamp"> · {entry.date}{entry.time ? ` ${entry.time}` : ""}</span>
                          </div>
                          <div className="pay-card-action">
                            {hasQaime && (canManageInvoice ? (
                              <button
                                type="button"
                                className={`pay-status pay-status-pill ${entry.invoiced ? "done" : "pending"}`}
                                onClick={() => onToggleEntryInvoiced(entry.id)}
                                title="Statusu dəyişmək üçün klikləyin"
                              >
                                {entry.invoiced
                                  ? `✓ Formda (#${entry.invoiceNo || ""})`
                                  : "⏳ Gözləyir"}
                              </button>
                            ) : (
                              <span className={`pay-status pay-status-pill ${entry.invoiced ? "done" : "pending"}`}>
                                {entry.invoiced ? `✓ Formda (#${entry.invoiceNo || ""})` : "⏳ Gözləyir"}
                              </span>
                            ))}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* TAB 3: MÜŞTƏRİ MƏLUMATLARI & PROFİL */}
          {activeTab === "profile" && (
            <form className="customer-info-card" onSubmit={handleSaveCustomerProfile}>
              <header className="customer-section-head">
                <div>
                  <span className="eyebrow">MÜŞTƏRİ KARTI</span>
                  <h2>Müştəri Məlumatları & Profil</h2>
                </div>
                <div className="customer-section-actions">
                  {saveNotice && <span className="customer-save-badge"><Check size={14} /> {saveNotice}</span>}
                  {(canManageDirectories || canEditEntries) && (
                    <button type="submit" className="primary-button">
                      <Save size={15} />
                      <span>Məlumatları yadda saxla</span>
                    </button>
                  )}
                </div>
              </header>

              <div className="customer-info-grid">
                <label>
                  <span><Building2 size={13} /> Müştəri adı</span>
                  <div className="customer-name-edit-wrap">
                    <input
                      value={nameDraft}
                      disabled={!canManageDirectories}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Müştərinin tam adı"
                    />
                    {canManageDirectories && nameDraft.trim() !== activeCustomerData.name && nameDraft.trim() && (
                      <button
                        type="button"
                        className="customer-rename-btn"
                        onClick={() => setRenameModalOpen(true)}
                        title="Müştəri adını dəyişdir"
                      >
                        <Pencil size={13} />
                        <span>Adı dəyiş</span>
                      </button>
                    )}
                  </div>
                </label>
                <label>
                  <span><UserRound size={13} /> Satış təmsilçisi</span>
                  <input
                    value={repDraft}
                    disabled={!canManageDirectories}
                    onChange={(e) => setRepDraft(e.target.value)}
                    placeholder="Məs: Arif Mahmud, Eşqin..."
                  />
                </label>
                <label>
                  <span><UserRound size={13} /> Şirkət təmsilçisi / Əlaqədar şəxs</span>
                  <input
                    value={contactDraft}
                    disabled={!canManageDirectories}
                    onChange={(e) => setContactDraft(e.target.value)}
                    placeholder="Müştəri tərəfindən məsul şəxs"
                  />
                </label>
                <label>
                  <span><Phone size={13} /> Telefon</span>
                  <input
                    value={phoneDraft}
                    disabled={!canManageDirectories}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    placeholder="+994 50 000 00 00"
                  />
                </label>
                <label>
                  <span><MapPin size={13} /> Ünvan / Şəhər</span>
                  <input
                    value={addressDraft}
                    disabled={!canManageDirectories}
                    onChange={(e) => setAddressDraft(e.target.value)}
                    placeholder="Bakı, ünvan və ya obyekt adı"
                  />
                </label>
                <label className="highlight-debt-field">
                  <span><CircleDollarSign size={13} /> Cari Borc Qalığı (AZN)</span>
                  <input
                    inputMode="decimal"
                    value={debtDraft}
                    disabled={!canEditEntries}
                    onChange={(e) => setDebtDraft(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label className="wide">
                  <span><NotepadText size={13} /> Qeyd / Xüsusi şərt</span>
                  <input
                    value={noteDraft}
                    disabled={!canManageDirectories}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Müştəri haqqında əlavə qeyd..."
                  />
                </label>
              </div>

              {canManageDirectories && (
                <div className="customer-danger-zone">
                  <div className="danger-zone-info">
                    <AlertTriangle size={18} className="danger-icon" />
                    <div>
                      <b>Müştərini sistemdən sil</b>
                      <small>Müştəri kartı və borc qeydi silinir. Əməliyyat üçün təsdiq tələb olunur.</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => setDeleteModalOpen(true)}
                  >
                    <Trash2 size={14} />
                    <span>Müştərini sil</span>
                  </button>
                </div>
              )}
            </form>
          )}
        </div>

        {/* FULL SCREEN PDF / QAİME PREVIEW VIEWER (Identical to Qaimələr Viewer) */}
        {previewInvoice && (
          <div className="approval-pdf-viewer" role="dialog" aria-modal="true">
            <header>
              <button type="button" onClick={() => setPreviewInvoice(null)}>
                <ArrowLeft size={17} />
                <span>Geri</span>
              </button>
              <div>
                <b>SPF-{previewInvoice.invoiceNo} · {previewInvoice.customer}</b>
                <small>{previewInvoice.seller || currentUserName} · {previewInvoice.date}</small>
              </div>
              <nav>
                {previewInvoice.status === "draft" && canApproveInvoice && (
                  <button
                    type="button"
                    className="approval-viewer-approve"
                    onClick={() => {
                      setInvoiceDecisionReason("");
                      setInvoiceDecisionConfirmation({ invoice: previewInvoice, action: "approve" });
                    }}
                  >
                    <Check size={16} />
                    <span>Təsdiqlə</span>
                  </button>
                )}
                {previewInvoice.status !== "cancelled" && canApproveInvoice && (
                  <button
                    type="button"
                    className="approval-viewer-reject"
                    onClick={() => {
                      setInvoiceDecisionReason("");
                      setInvoiceDecisionConfirmation({ invoice: previewInvoice, action: "cancel" });
                    }}
                  >
                    <X size={16} />
                    <span>Rədd et</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`approval-viewer-share${viewerExportAction === "share" ? " is-busy" : ""}`}
                  disabled={isViewerExportBusy}
                  aria-busy={viewerExportAction === "share" || undefined}
                  onClick={() => void runViewerExport("share", handleSharePdf)}
                >
                  <Share2 size={16} />
                  <span>{viewerExportAction === "share" ? "Hazırlanır…" : "Paylaş"}</span>
                </button>
                <QaimePrintButton
                  className={`approval-viewer-print${viewerExportAction === "print" ? " is-busy" : ""}`}
                  size={16}
                  disabled={isViewerExportBusy}
                  onPrint={(mode) => void runViewerExport("print", () => handlePrintPdf(mode))}
                />
                <button
                  type="button"
                  className={`approval-viewer-copy${viewerExportAction === "copy" ? " is-busy" : ""}`}
                  disabled={isViewerExportBusy}
                  aria-busy={viewerExportAction === "copy" || undefined}
                  onClick={() => void runViewerExport("copy", handleCopyModalPaperImage)}
                >
                  <Copy size={16} />
                  <span>{viewerExportAction === "copy" ? "Hazırlanır…" : "Şəkli kopyala"}</span>
                </button>
                {previewInvoice.status !== "cancelled" && canManageInvoice && (
                  <button
                    type="button"
                    className="approval-viewer-secondary"
                    onClick={() => {
                      const inv = previewInvoice;
                      setPreviewInvoice(null);
                      onOpenInvoiceInBuilder(inv);
                    }}
                  >
                    <Pencil size={16} />
                    <span>Düzəlt</span>
                  </button>
                )}
                {previewInvoice.status !== "cancelled" && canManageInvoice && (
                  <details className={`approval-viewer-more${isViewerExportBusy ? " is-disabled" : ""}`} aria-disabled={isViewerExportBusy || undefined}>
                    <summary aria-label="Digər qaimə əməliyyatları" title="Digər əməliyyatlar"><MoreHorizontal size={19} /></summary>
                    <div className="approval-viewer-more-menu">
                      <button type="button" onClick={() => {
                        const inv = previewInvoice;
                        setPreviewInvoice(null);
                        onOpenInvoiceInBuilder(inv);
                      }}><Pencil size={16} /><span>Düzəlt</span></button>
                    </div>
                  </details>
                )}
              </nav>
            </header>
            <main>
              <QaimePreviewStage
                invoice={previewInvoice}
                paperRef={modalPaperRef}
                mode="viewer"
              />
            </main>
          </div>
        )}

        {invoiceDecisionConfirmation && (
          <div className="qaime-viewer-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="customer-qaime-viewer-confirm-title">
            <section className="qaime-viewer-confirm-card">
              <div className="qaime-viewer-confirm-icon" aria-hidden="true"><AlertTriangle size={22} /></div>
              <div>
                <span>{invoiceDecisionConfirmation.action === "approve" ? "QAİMƏ TƏSDİQİ" : "QAİMƏNİ LƏĞV ET"}</span>
                <h2 id="customer-qaime-viewer-confirm-title">{invoiceDecisionConfirmation.action === "approve" ? "Bu qaiməni təsdiqləyirsiniz?" : "Bu qaiməni ləğv edirsiniz?"}</h2>
                <p><b>SPF-{invoiceDecisionConfirmation.invoice.invoiceNo}</b>{" "}{invoiceDecisionConfirmation.action === "approve" ? "aktiv qaimə kimi qeyd ediləcək." : "ləğv edilmiş kimi tarixçədə qalacaq."}</p>
              </div>
              {invoiceDecisionConfirmation.action === "cancel" && (
                <label className="qaime-viewer-confirm-reason">
                  <span>Ləğv səbəbi <em>(istəyə bağlı)</em></span>
                  <textarea autoFocus value={invoiceDecisionReason} onChange={(event) => setInvoiceDecisionReason(event.target.value)} placeholder="Məsələn: məbləğ və ya məhsul məlumatı səhvdir" />
                </label>
              )}
              <footer>
                <button type="button" className="secondary" onClick={() => { setInvoiceDecisionConfirmation(null); setInvoiceDecisionReason(""); }}>Xeyr</button>
                <button
                  type="button"
                  className={invoiceDecisionConfirmation.action === "approve" ? "approve" : "cancel"}
                  onClick={() => {
                    const target = invoiceDecisionConfirmation;
                    const reason = invoiceDecisionReason.trim() || undefined;
                    const closeViewer = shouldCloseViewerAfterDecision();
                    setInvoiceDecisionConfirmation(null);
                    setInvoiceDecisionReason("");
                    if (target.action === "cancel") {
                      onCancelInvoice(target.invoice.id, reason);
                      if (closeViewer) setPreviewInvoice(null);
                      else setPreviewInvoice((current) => current?.id === target.invoice.id ? { ...current, status: "cancelled" } : current);
                      return;
                    }
                    onApproveInvoice(target.invoice.id);
                    if (closeViewer) { setPreviewInvoice(null); return; }
                    setPreviewInvoice((current) => current?.id === target.invoice.id ? { ...current, status: "active", approvedBy: currentUserName, approvedAt: new Date().toISOString() } : current);
                  }}
                >
                  {invoiceDecisionConfirmation.action === "approve" ? <Check size={16} /> : <X size={16} />}
                  {invoiceDecisionConfirmation.action === "approve" ? "Bəli, təsdiqlə" : "Bəli, ləğv et"}
                </button>
              </footer>
            </section>
          </div>
        )}

        {/* MODAL 1: RENAME CUSTOMER CONFIRMATION WARNING */}
        {renameModalOpen && (
          <div className="crm-modal-backdrop" role="dialog" aria-modal="true">
            <div className="crm-modal rename-modal">
              <header className="crm-modal-head warning">
                <div className="modal-title-with-icon">
                  <AlertTriangle size={20} className="warning-icon" />
                  <h3>Müştəri Adının Dəyişdirilməsi</h3>
                </div>
                <button type="button" className="close-btn" onClick={() => setRenameModalOpen(false)}>
                  <X size={18} />
                </button>
              </header>
              <div className="crm-modal-body">
                <p style={{ margin: "0 0 10px", fontSize: "13px" }}>
                  Cari müştəri: <strong>«{activeCustomerData.name}»</strong>
                </p>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569" }}>Yeni Müştəri Adı *</span>
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Yeni adı daxil edin..."
                    style={{
                      height: "38px",
                      padding: "0 10px",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                      outline: "none",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </label>
                <div className="crm-warning-box">
                  <p>
                    <b>Diqqət:</b> Bu müştəriyə aid olan bütün mövcud qaimələr, sifariş formaları və
                    gündəlik dəftərdəki mədaxil əməliyyatlarında müştəri adı avtomatik olaraq yenilənəcəkdir.
                  </p>
                </div>
              </div>
              <footer className="crm-modal-foot">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setNameDraft(activeCustomerData.name);
                    setRenameModalOpen(false);
                  }}
                >
                  İmtina
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleConfirmRenameCustomer}
                >
                  <Check size={16} />
                  Bəli, adı dəyiş
                </button>
              </footer>
            </div>
          </div>
        )}

        {/* MODAL 2: DELETE CUSTOMER CONFIRMATION WARNING */}
        {deleteModalOpen && (
          <div className="crm-modal-backdrop" role="dialog" aria-modal="true">
            <div className="crm-modal delete-modal">
              <header className="crm-modal-head danger">
                <div className="modal-title-with-icon">
                  <Trash2 size={20} className="danger-icon" />
                  <h3>Müştərini Silmək İstədiyinizə Əminsiniz?</h3>
                </div>
                <button type="button" className="close-btn" onClick={() => setDeleteModalOpen(false)}>
                  <X size={18} />
                </button>
              </header>
              <div className="crm-modal-body">
                <p>
                  <strong>«{activeCustomerData.name}»</strong> adlı müştəri sistemdən tamamilə silinəcəkdir.
                </p>
                <div className="crm-danger-box">
                  <p>
                    <b>Xəbərdarlıq:</b> Müştərinin cari borc qeydi və profil məlumatları silinir.
                    Əgər bu müştəriyə aid əvvəlki qaimələr və ya ödənişlər varsa, sənəd tarixçəsində ad saxlanıla bilər, lakin müştəri siyahısından çıxarılacaq. Bu əməliyyat geri qaytarılmır.
                  </p>
                </div>
              </div>
              <footer className="crm-modal-foot">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setDeleteModalOpen(false)}
                >
                  İmtina
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={handleConfirmDeleteCustomer}
                >
                  <Trash2 size={16} />
                  Bəli, müştərini sil
                </button>
              </footer>
            </div>
          </div>
        )}
      </>
    );
  }

  // ============================================================================
  // NORMAL CUSTOMER LIST (Default View — clean numbered list like DirectoryView)
  // ============================================================================
  return (
    <>
      <section className="page-heading directory-heading">
        <div>
          <span className="eyebrow">MÜŞTƏRİLƏR BAZASI</span>
          <h1>{directoryLabel}</h1>
          <p>
            {hasQaime ? "Müştəri üzərinə klikləyərək müştəri məlumatlarını, sifariş/qaimə formalarını və ödənişlərini açın." : "Qeydin üzərinə toxunaraq məlumatları və ödənişləri açın."}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <em>{customerRows.length} {directorySingle.toLocaleLowerCase("az-AZ")}</em>
          {canManageDirectories && (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setNewCustName("");
                setNewCustDebt("0");
                setNewCustRep(currentUserName);
                setNewCustContact("");
                setNewCustPhone("");
                setNewCustAddress("");
                setAddCustomerModalOpen(true);
              }}
            >
              <Plus size={16} />
              <span>Yeni {directorySingle}</span>
            </button>
          )}
        </div>
      </section>

      <section className="directory-panel">
        <div className="directory-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Siyahıda ${directorySingle.toLocaleLowerCase("az-AZ")} axtar...`}
            />
          </label>
          {canManageDirectories && (
            <button
              type="button"
              className="primary-button add-cust-modal-btn"
              onClick={() => {
                setNewCustName("");
                setNewCustDebt("0");
                setNewCustRep(currentUserName);
                setNewCustContact("");
                setNewCustPhone("");
                setNewCustAddress("");
                setAddCustomerModalOpen(true);
              }}
            >
              <Plus size={16} />
              <span>Yeni {directorySingle} əlavə et</span>
            </button>
          )}
        </div>

        <div className="customer-cards-list">
          {filteredCustomerRows.map((row, index) => (
            <article
              key={row.lower}
              className="customer-card-item"
              role="button"
              tabIndex={0}
              onClick={() => onSelectCustomerName(row.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelectCustomerName(row.name);
              }}
            >
              <div className="cust-card-top">
                <div className="cust-card-identity">
                  <span className="cust-card-avatar">
                    {row.name.trim().slice(0, 2).toLocaleUpperCase("az-AZ")}
                  </span>
                  <div className="cust-card-title-group">
                    <b className="cust-card-name" title={row.name}>{row.name}</b>
                    {(row.profile?.salesRepresentative || row.profile?.contactPerson || row.profile?.phone) && (
                      <span className="cust-card-meta">
                        {[row.profile?.salesRepresentative, row.profile?.contactPerson, row.profile?.phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="cust-card-debt-wrap">
                  <span className="cust-debt-label">Cari Borc</span>
                  <strong className={cx("cust-card-debt", row.currentDebt > 0 && "debt-pos")}>
                    {formatMoney(row.currentDebt, "AZN")}
                  </strong>
                </div>
              </div>

              <div className="cust-card-bottom">
                <div className="cust-card-pills">
                  {hasQaime && (row.custInvoices.length > 0 ? (
                    <span className="cust-pill forms">
                      <FileText size={12} />
                      <b>{row.custInvoices.length}</b> form
                    </span>
                  ) : (
                    <span className="cust-pill empty">Form yoxdur</span>
                  ))}
                  {row.custPayments.length > 0 ? (
                    <span className="cust-pill payments">
                      <ArrowDownLeft size={12} />
                      <b>{row.custPayments.length}</b> ödəniş ({formatMoney(row.totalPaidThisMonth, "AZN")})
                    </span>
                  ) : (
                    <span className="cust-pill empty">Ödəniş yoxdur</span>
                  )}
                  {hasQaime && row.totalPendingPayment > 0 && (
                    <span className="cust-pill pending">
                      ⏳ {formatMoney(row.totalPendingPayment, "AZN")} gözləyir
                    </span>
                  )}
                </div>
                <div className="cust-card-arrow">
                  <ChevronRight size={17} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>



      {/* MODAL 3: ADD NEW CUSTOMER MODAL */}
      {addCustomerModalOpen && (
        <div className="crm-modal-backdrop" role="dialog" aria-modal="true">
          <form className="crm-modal add-cust-modal" onSubmit={handleCreateCustomerFromModal}>
            <header className="crm-modal-head">
              <div className="modal-title-with-icon">
                <Building2 size={20} className="text-primary" />
                <h3>Yeni {directorySingle} əlavə et</h3>
              </div>
              <button type="button" className="close-btn" onClick={() => setAddCustomerModalOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="crm-modal-body">
              <div className="crm-modal-grid">
                <label className="wide">
                  <span>Müştəri / Şirkət Adı *</span>
                  <input
                    required
                    autoFocus
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    placeholder="Məs: Azart Membran, Rəşad usta..."
                  />
                </label>
                <label>
                  <span>İlkin Borc Qalığı (AZN)</span>
                  <input
                    inputMode="decimal"
                    value={newCustDebt}
                    onChange={(e) => setNewCustDebt(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  <span>Satış Təmsilçisi</span>
                  <input
                    value={newCustRep}
                    onChange={(e) => setNewCustRep(e.target.value)}
                    placeholder="Məs: Arif Mahmud"
                  />
                </label>
                <label>
                  <span>Əlaqədar Şəxs</span>
                  <input
                    value={newCustContact}
                    onChange={(e) => setNewCustContact(e.target.value)}
                    placeholder="Müştəri tərəfindən şəxs"
                  />
                </label>
                <label>
                  <span>Telefon</span>
                  <input
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="+994 50 000 00 00"
                  />
                </label>
                <label className="wide">
                  <span>Ünvan / Obyekt yeri</span>
                  <input
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                    placeholder="Bakı, Dərnəgül və s."
                  />
                </label>
              </div>
            </div>
            <footer className="crm-modal-foot">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAddCustomerModalOpen(false)}
              >
                İmtina
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={!newCustName.trim()}
              >
                <Plus size={16} />
                Əlavə et və Profili aç
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
