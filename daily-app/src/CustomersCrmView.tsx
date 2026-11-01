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
  NotepadText,
  Pencil,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Truck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import AriXLogo from "./AriXLogo";
import { parseFlexibleNumber, type InvoiceRecord } from "./qaimeParser";

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
  selectedCustomerName: string | null;
  onSelectCustomerName: (name: string | null) => void;
  formatMoney: (value: number, currency: "TRY" | "AZN" | "USD") => string;
  onApproveInvoice: (invoiceId: string) => void;
  onCancelInvoice: (invoiceId: string, reason?: string) => void;
  onUpdateCustomerDebt: (customer: string, newDebt: number) => void;
  onToggleEntryInvoiced: (entryId: string) => void;
  onCreateInvoiceForCustomer: (customer: string) => void;
  onOpenInvoiceInBuilder: (invoice: InvoiceRecord) => void;
  onAddCustomer?: (name: string, initialDebt: number) => void;
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
  selectedCustomerName,
  onSelectCustomerName,
  formatMoney,
  onApproveInvoice,
  onCancelInvoice,
  onUpdateCustomerDebt,
  onToggleEntryInvoiced,
  onCreateInvoiceForCustomer,
  onOpenInvoiceInBuilder,
  onAddCustomer,
}: Props) {
  const [search, setSearch] = useState("");
  const [newCustomerDraft, setNewCustomerDraft] = useState("");
  const [profiles, setProfiles] = useState<Record<string, CustomerProfileMeta>>(loadCustomerProfiles);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRecord | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Editable customer fields when a customer is opened
  const [repDraft, setRepDraft] = useState("");
  const [contactDraft, setContactDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [addressDraft, setAddressDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [debtDraft, setDebtDraft] = useState("0");

  const modalPaperRef = useRef<HTMLElement | null>(null);

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
      if (!clean) continue;
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
  }, [knownCustomers, customerDebts, pastMonthUninvoiced, invoices, entries, profiles]);

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
    setRepDraft(p?.salesRepresentative || lastInv?.seller || "Arif Mahmud");
    setContactDraft(p?.contactPerson || "");
    setPhoneDraft(p?.phone || "");
    setAddressDraft(p?.address || "");
    setNoteDraft(p?.note || "");
    setDebtDraft(String(activeCustomerData.currentDebt));
    setSaveNotice(null);
  }, [activeCustomerData?.name, activeCustomerData?.currentDebt]);

  const handleAddCustomerSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = newCustomerDraft.trim();
    if (!clean) return;
    onAddCustomer?.(clean, 0);
    setNewCustomerDraft("");
    onSelectCustomerName(clean);
  };

  const handleSaveCustomerProfile = (e: FormEvent) => {
    e.preventDefault();
    if (!activeCustomerData) return;
    const custName = activeCustomerData.name;
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
    const parsedDebt = parseFlexibleNumber(debtDraft);
    onUpdateCustomerDebt(custName, parsedDebt);
    setSaveNotice("Müştəri məlumatları və borc qalığı yadda saxlanıldı.");
    window.setTimeout(() => setSaveNotice(null), 3000);
  };

  const handlePrintModalPaper = () => {
    if (!modalPaperRef.current) return;
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
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${modalPaperRef.current.outerHTML}</body></html>`
    );
    doc.close();
    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 15000);
    }, 300);
  };

  const handleCopyModalPaperImage = async () => {
    if (!modalPaperRef.current || !previewInvoice) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(modalPaperRef.current, {
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

  // ============================================================================
  // CUSTOMER DETAIL WINDOW (Opened when clicking a customer from the normal list)
  // ============================================================================
  if (activeCustomerData) {
    return (
      <>
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
            <h1>{activeCustomerData.name}</h1>
            <p>
              Müştəri məlumatları, sipariş/qaimə onay formları və Gündəlik Dəftərdən gələn ödənişlər.
            </p>
          </div>
          <div className="invoice-header-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => onCreateInvoiceForCustomer(activeCustomerData.name)}
            >
              <FilePlus2 size={16} />
              <span>+ Yeni Sipariş / Qaimə Formu</span>
            </button>
          </div>
        </section>

        <div className="customer-detail-stack">
          {/* 1. MÜŞTƏRİ MƏLUMATLARI */}
          <form className="customer-info-card" onSubmit={handleSaveCustomerProfile}>
            <header className="customer-section-head">
              <div>
                <span className="eyebrow">1. MÜŞTƏRİ KARTI</span>
                <h2>Müştəri Məlumatları</h2>
              </div>
              <div className="customer-section-actions">
                {saveNotice && <span className="customer-save-badge"><Check size={14} /> {saveNotice}</span>}
                <button type="submit" className="primary-button">
                  <Save size={15} />
                  <span>Məlumatları yadda saxla</span>
                </button>
              </div>
            </header>

            <div className="customer-info-grid">
              <label>
                <span><Building2 size={13} /> Müştəri adı</span>
                <input value={activeCustomerData.name} disabled />
              </label>
              <label>
                <span><UserRound size={13} /> Satış təmsilçisi</span>
                <input
                  value={repDraft}
                  onChange={(e) => setRepDraft(e.target.value)}
                  placeholder="Məs: Arif Mahmud, Eşqin..."
                />
              </label>
              <label>
                <span><UserRound size={13} /> Şirkət təmsilçisi / Əlaqədar şəxs</span>
                <input
                  value={contactDraft}
                  onChange={(e) => setContactDraft(e.target.value)}
                  placeholder="Müştəri tərəfindən məsul şəxs"
                />
              </label>
              <label>
                <span><Phone size={13} /> Telefon</span>
                <input
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  placeholder="+994 50 000 00 00"
                />
              </label>
              <label>
                <span><MapPin size={13} /> Ünvan / Şəhər</span>
                <input
                  value={addressDraft}
                  onChange={(e) => setAddressDraft(e.target.value)}
                  placeholder="Bakı, ünvan və ya obyekt adı"
                />
              </label>
              <label className="highlight-debt-field">
                <span><CircleDollarSign size={13} /> Cari Borc Qalığı (AZN)</span>
                <input
                  inputMode="decimal"
                  value={debtDraft}
                  onChange={(e) => setDebtDraft(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label className="wide">
                <span><NotepadText size={13} /> Qeyd / Xüsusi şərt</span>
                <input
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Müştəri haqqında əlavə qeyd..."
                />
              </label>
            </div>
          </form>

          {/* 2. MÜŞTƏRİ FORMLARI (SİPARİŞ / QAİMƏ FORMLARI) */}
          <section className="approval-forms-page">
            <header>
              <div className="approval-forms-title">
                <b>Müştəri Formları (Sipariş / Qaimə)</b>
                <span>{activeCustomerData.custInvoices.length} belge</span>
              </div>
              <div />
              <button
                type="button"
                className="primary-button"
                onClick={() => onCreateInvoiceForCustomer(activeCustomerData.name)}
              >
                <Plus size={15} />
                <span>Yeni Form Yarat</span>
              </button>
            </header>

            {activeCustomerData.custInvoices.length === 0 ? (
              <div className="approval-forms-search-empty">
                <FileText size={28} />
                <b>Bu müştəri üçün hələ sipariş / qaimə formu yoxdur</b>
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
                  <span>Onaylayan / Əməliyyat</span>
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
                            ? "Onaylandı"
                            : stateKey === "rejected"
                              ? "Reddedildi"
                              : "Onay bekliyor"}
                        </b>
                      </span>
                      <div
                        className="approval-form-open"
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenInvoiceInBuilder(inv)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") onOpenInvoiceInBuilder(inv);
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
                          {inv.status === "draft" ? (
                            <div className="inline-approval-btns">
                              <button
                                type="button"
                                className="inline-approve-btn"
                                onClick={() => onApproveInvoice(inv.id)}
                              >
                                <Check size={13} /> Onayla
                              </button>
                              <button
                                type="button"
                                className="inline-reject-btn"
                                onClick={() => onCancelInvoice(inv.id)}
                              >
                                <X size={13} /> Reddet
                              </button>
                            </div>
                          ) : inv.status === "active" ? (
                            <div className="inline-approval-btns">
                              <div>
                                <b>{inv.approvedBy || "Arif Mahmud"}</b>
                                <small>Onaylandı</small>
                              </div>
                              <button
                                type="button"
                                className="inline-reject-btn"
                                onClick={() => onCancelInvoice(inv.id)}
                                title="İptal et və borcu/ödənişi yerinə qaytar"
                              >
                                <RotateCcw size={12} /> İptal
                              </button>
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
                          <small>Təmsilçi: {inv.seller || "Arif Mahmud"}</small>
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* 3. MÜŞTƏRİ ÖDƏNİŞLƏRİ (GÜNDƏLİK DƏFTƏR) */}
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
                {activeCustomerData.totalPendingPayment > 0 && (
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
                {activeCustomerData.pastMonthBalance > 0 && (
                  <article className="customer-payment-row">
                    <span className="pay-icon"><ArrowDownLeft size={15} /></span>
                    <span>
                      <b>Keçən aydan qaiməyə vurulmamış ödəniş qalığı</b>
                      <small>Avtomatik olaraq növbəti formda borcdan çıxılacaq</small>
                    </span>
                    <span><b>Kassa / Bank</b></span>
                    <strong className="income">+{formatMoney(activeCustomerData.pastMonthBalance, "AZN")}</strong>
                    <span className="pay-status pending">⏳ Gözləyir</span>
                  </article>
                )}
                {activeCustomerData.custPayments.map((entry) => (
                  <article key={entry.id} className="customer-payment-row">
                    <span className="pay-icon"><ArrowDownLeft size={15} /></span>
                    <span>
                      <b>{entry.category || "Mədaxil"}{entry.note ? ` — ${entry.note}` : ""}</b>
                      <small>{entry.date}{entry.time ? ` · ${entry.time}` : ""}</small>
                    </span>
                    <span>
                      <b>{entry.bank || "Kassa"}</b>
                      <small>Məsul: {entry.responsible || "Eşqin"}</small>
                    </span>
                    <strong className="income">+{formatMoney(Math.abs(entry.amount), "AZN")}</strong>
                    <button
                      type="button"
                      className={`pay-status ${entry.invoiced ? "done" : "pending"}`}
                      onClick={() => onToggleEntryInvoiced(entry.id)}
                      title="Statusu dəyişmək üçün klikləyin"
                    >
                      {entry.invoiced
                        ? `✓ Formda çıxılıb${entry.invoiceNo ? ` (#${entry.invoiceNo})` : ""}`
                        : "⏳ Gözləyir"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* FULL SCREEN PDF / A4 FORM VIEWER MODAL (Exact AriX Order ApprovalPdfViewer style) */}
        {previewInvoice && (
          <div className="approval-pdf-viewer" role="dialog" aria-modal="true">
            <header>
              <button type="button" onClick={() => setPreviewInvoice(null)}>
                <ArrowLeft size={17} />
                <span>Geri</span>
              </button>
              <div>
                <b>SPF-{previewInvoice.invoiceNo} · {previewInvoice.customer}</b>
                <small>{previewInvoice.seller || "Arif Mahmud"} · {previewInvoice.date}</small>
              </div>
              <nav>
                {previewInvoice.status === "draft" && (
                  <button
                    type="button"
                    className="approval-viewer-approve"
                    onClick={() => {
                      onApproveInvoice(previewInvoice.id);
                      setPreviewInvoice(null);
                    }}
                  >
                    <Check size={16} />
                    <span>Onayla</span>
                  </button>
                )}
                {previewInvoice.status !== "cancelled" && (
                  <button
                    type="button"
                    className="approval-viewer-reject"
                    onClick={() => {
                      onCancelInvoice(previewInvoice.id);
                      setPreviewInvoice(null);
                    }}
                  >
                    <X size={16} />
                    <span>Reddet</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const inv = previewInvoice;
                    setPreviewInvoice(null);
                    onOpenInvoiceInBuilder(inv);
                  }}
                >
                  <Pencil size={16} />
                  <span>Düzenle</span>
                </button>
                <button type="button" onClick={() => void handleCopyModalPaperImage()}>
                  <Copy size={16} />
                  <span>Şəkli kopyala</span>
                </button>
                <button type="button" onClick={handlePrintModalPaper}>
                  <Printer size={16} />
                  <span>Yazdır / PDF</span>
                </button>
              </nav>
            </header>
            <main>
              <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                <article ref={modalPaperRef} className="approval-paper">
                  <div className="approval-paper-top">
                    <div className="approval-brand">
                      <div className="approval-brand-row">
                        <AriXLogo className="approval-arix-logo" />
                        <div className="approval-brand-text">
                          <strong>AzArt Membran</strong>
                          <span>ARIX ORDER & DAILY · RƏSMİ HESABLAŞMA SƏNƏDİ</span>
                        </div>
                      </div>
                      <small>Anbar / Hesab: {previewInvoice.warehouse || "ANAnas"}</small>
                    </div>
                    <div className="approval-doc-box">
                      <span>SATIŞ SİPARİŞ ONAY FORMU / QAİMƏ</span>
                      <strong>SPF-{previewInvoice.invoiceNo}</strong>
                      <small>Sənəd tarixi: {previewInvoice.date}</small>
                      <small>
                        Status:{" "}
                        {previewInvoice.status === "active"
                          ? "ONAYLANDI"
                          : previewInvoice.status === "draft"
                            ? "ONAY GÖZLƏYİR"
                            : "REDDEDİLDİ"}
                      </small>
                    </div>
                  </div>

                  <div className="approval-meta-grid">
                    <div>
                      <span><ApprovalIcon kind="document" /> Sənəd / Qaimə №</span>
                      <b>#{previewInvoice.invoiceNo}</b>
                    </div>
                    <div>
                      <span><ApprovalIcon kind="calendar" /> Tarix</span>
                      <b>{previewInvoice.date}</b>
                    </div>
                    <div>
                      <span><ApprovalIcon kind="representative" /> Satış təmsilçisi</span>
                      <b>{previewInvoice.seller || "Arif Mahmud"}</b>
                    </div>
                    <div>
                      <span><ApprovalIcon kind="source" /> Anbar / Hesab</span>
                      <b>{previewInvoice.warehouse || "ANAnas"}</b>
                    </div>
                    <div>
                      <span><ApprovalIcon kind="currency" /> Valyuta</span>
                      <b>AZN (₼)</b>
                    </div>
                  </div>

                  <div className="approval-parties">
                    <div className="approval-party">
                      <span><ApprovalIcon kind="company" /> MÜŞTƏRİ (ALICI)</span>
                      <strong>{previewInvoice.customer}</strong>
                      <p>Əvvəlki borc qalığı: {formatMoney(previewInvoice.previousDebtSnapshot, "AZN")}</p>
                      <p>Çıxılan ödəniş: −{formatMoney(previewInvoice.paymentDeducted, "AZN")}</p>
                    </div>
                    <div className="approval-party">
                      <span><ApprovalIcon kind="note" /> HESABLAŞMA XÜLASƏSİ</span>
                      <p>
                        Köhnə borc ({formatMoney(previewInvoice.previousDebtSnapshot, "AZN")}) + Cari satış (
                        {formatMoney(previewInvoice.salesAmount, "AZN")}) − Ödəniş (
                        {formatMoney(previewInvoice.paymentDeducted, "AZN")}) ={" "}
                        <b>{formatMoney(previewInvoice.finalDebt, "AZN")}</b>
                      </p>
                    </div>
                  </div>

                  <table className="approval-table">
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Kod</th>
                        <th>Məhsul / Açıqlama</th>
                        <th>Miqdar</th>
                        <th>Birim</th>
                        <th>Qiymət</th>
                        <th>Məbləğ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewInvoice.items.map((item, idx) => (
                        <tr key={`${item.no || idx}-${item.name}`}>
                          <td>{idx + 1}</td>
                          <td>{item.code || "—"}</td>
                          <td><b>{item.name}</b></td>
                          <td>{item.quantity}</td>
                          <td>{item.unit || "metr"}</td>
                          <td>{formatMoney(item.price, "AZN")}</td>
                          <td>{formatMoney(item.total, "AZN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="approval-bottom">
                    <div className="approval-terms">
                      <div>
                        <span><ApprovalIcon kind="payment" /> Çıxılan Ödəniş</span>
                        <b>−{formatMoney(previewInvoice.paymentDeducted, "AZN")}</b>
                      </div>
                      <div>
                        <span><ApprovalIcon kind="delivery" /> Yekun Borc Qalığı</span>
                        <b>{formatMoney(previewInvoice.finalDebt, "AZN")}</b>
                      </div>
                    </div>

                    <div className="approval-totals">
                      <div>
                        <span>Köhnə borc qalığı</span>
                        <b>{formatMoney(previewInvoice.previousDebtSnapshot, "AZN")}</b>
                      </div>
                      <div>
                        <span>Cari qaimə satışı (+)</span>
                        <b>+{formatMoney(previewInvoice.salesAmount, "AZN")}</b>
                      </div>
                      <div className="payment-deducted-row">
                        <span>Ödəniş çıxıldı (−)</span>
                        <b>−{formatMoney(previewInvoice.paymentDeducted, "AZN")}</b>
                      </div>
                      <div className="grand">
                        <span>YEKUN QALIQ BORC</span>
                        <strong>{formatMoney(previewInvoice.finalDebt, "AZN")}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="approval-signatures">
                    <div>
                      <span>Təhvil verən (Satıcı)</span>
                      <b>{previewInvoice.seller || "Arif Mahmud"}</b>
                      <small>İmza / Möhür</small>
                    </div>
                    <div>
                      <span>Təhvil alan (Müştəri)</span>
                      <b>{previewInvoice.customer}</b>
                      <small>Yekun borc qalığı ilə razıyam — İmza</small>
                    </div>
                  </div>
                </article>
              </div>
            </main>
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
          <h1>Müştərilər</h1>
          <p>
            Müştəri üzərinə klikləyərək müştəri məlumatlarını, sipariş/qaimə formlarını və ödənişlərini açın.
          </p>
        </div>
        <em>{customerRows.length} müştəri</em>
      </section>

      <section className="directory-panel">
        <div className="directory-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Siyahıda müştəri axtar..."
            />
          </label>
          <form onSubmit={handleAddCustomerSubmit}>
            <input
              value={newCustomerDraft}
              onChange={(e) => setNewCustomerDraft(e.target.value)}
              placeholder="Yeni müştəri adı daxil edin"
            />
            <button className="primary-button" type="submit">
              <Plus size={16} />
              Əlavə et
            </button>
          </form>
        </div>

        <div className="directory-list customer-clickable-list">
          {filteredCustomerRows.map((row, index) => (
            <article
              key={row.lower}
              className="customer-directory-item"
              role="button"
              tabIndex={0}
              onClick={() => onSelectCustomerName(row.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelectCustomerName(row.name);
              }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div className="customer-directory-name">
                <b>{row.name}</b>
                {(row.profile?.salesRepresentative || row.profile?.phone || row.profile?.address) && (
                  <small>
                    {[row.profile?.salesRepresentative, row.profile?.phone, row.profile?.address]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                )}
              </div>
              <div className="customer-directory-badges">
                {row.custInvoices.length > 0 && (
                  <em className="cust-badge forms">{row.custInvoices.length} form</em>
                )}
                {row.custPayments.length > 0 && (
                  <em className="cust-badge payments">{row.custPayments.length} ödəniş</em>
                )}
                <strong className={row.currentDebt > 0 ? "debt-pos" : ""}>
                  {formatMoney(row.currentDebt, "AZN")}
                </strong>
                <ChevronRight size={16} className="cust-chevron" />
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
