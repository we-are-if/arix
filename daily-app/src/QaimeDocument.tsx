import { forwardRef } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock,
  FileText,
  HandCoins,
  Layers3,
  NotepadText,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import AriXLogo from "./AriXLogo";
import type { InvoiceRecord } from "./qaimeParser";

type IconKind =
  | "document"
  | "calendar"
  | "representative"
  | "source"
  | "currency"
  | "company"
  | "note"
  | "payment"
  | "delivery";

const ICON_CONFIG: Record<
  IconKind,
  {
    Icon: React.ComponentType<{ size?: number | string; color?: string; stroke?: string; strokeWidth?: number | string; style?: React.CSSProperties; className?: string }>;
    color: string;
    bg: string;
    size: number;
    boxSize: number;
    radius: string;
  }
> = {
  document: { Icon: FileText, color: "#3979d6", bg: "#edf4ff", size: 14, boxSize: 26, radius: "50%" },
  calendar: { Icon: CalendarDays, color: "#6755e7", bg: "#f2efff", size: 14, boxSize: 26, radius: "50%" },
  representative: { Icon: UserRound, color: "#3478c8", bg: "#eaf4ff", size: 14, boxSize: 26, radius: "50%" },
  source: { Icon: Layers3, color: "#e97a39", bg: "#fff1e8", size: 14, boxSize: 26, radius: "50%" },
  currency: { Icon: CircleDollarSign, color: "#1ba96a", bg: "#eaf9f1", size: 14, boxSize: 26, radius: "50%" },
  company: { Icon: Building2, color: "#2685a5", bg: "#e7f5fb", size: 14, boxSize: 24, radius: "5px" },
  note: { Icon: NotepadText, color: "#4285e5", bg: "#e7f2ff", size: 12, boxSize: 22, radius: "6px" },
  payment: { Icon: HandCoins, color: "#4285e5", bg: "#e7f2ff", size: 12, boxSize: 22, radius: "50%" },
  delivery: { Icon: Truck, color: "#e7782f", bg: "#fff1e8", size: 12, boxSize: 22, radius: "50%" },
};

function ApprovalIcon({
  kind,
  colorOverride,
  bgOverride,
  className = "",
}: {
  kind: IconKind;
  colorOverride?: string;
  bgOverride?: string;
  className?: string;
}) {
  const cfg = ICON_CONFIG[kind];
  const Icon = cfg.Icon;
  const color = colorOverride || cfg.color;
  const bg = bgOverride || cfg.bg;
  const boxSize = `${cfg.boxSize}px`;

  return (
    <span
      className={`approval-vector-icon ${kind} ${className}`.trim()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: boxSize,
        height: boxSize,
        minWidth: boxSize,
        minHeight: boxSize,
        borderRadius: cfg.radius,
        backgroundColor: bg,
        color: color,
        flexShrink: 0,
        boxSizing: "border-box",
        padding: 0,
      }}
      aria-hidden="true"
    >
      <Icon
        size={cfg.size}
        color={color}
        stroke={color}
        strokeWidth={1.9}
        style={{ display: "block", width: `${cfg.size}px`, height: `${cfg.size}px` }}
      />
    </span>
  );
}

function formatMoney(value: number) {
  const [whole, decimal] = Math.abs(Number(value || 0)).toFixed(2).split(".");
  const amount = `${value < 0 ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimal}`;
  return `${amount} ₼`;
}

function formatQuantitySummary(items?: { quantity: number; unit?: string }[]): string {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return "0 metr";
  const unitsMap = new Map<string, number>();
  for (const item of safeItems) {
    const u = String(item?.unit || "").trim() || "metr";
    const q = Number(item?.quantity || 0);
    unitsMap.set(u, (unitsMap.get(u) || 0) + q);
  }
  const parts: string[] = [];
  if (unitsMap.has("metr")) {
    const m = Math.round((unitsMap.get("metr") || 0) * 100) / 100;
    parts.push(`${m.toLocaleString("az-AZ", { maximumFractionDigits: 2 })} metr`);
  }
  for (const [u, total] of unitsMap.entries()) {
    if (u === "metr") continue;
    const rounded = Math.round(total * 100) / 100;
    parts.push(`${rounded.toLocaleString("az-AZ", { maximumFractionDigits: 2 })} ${u}`);
  }
  return parts.join(" · ") || "0 metr";
}

type Props = {
  invoice: InvoiceRecord;
  companyName?: string;
};

const QaimeDocument = forwardRef<HTMLElement, Props>(function QaimeDocument(
  { invoice, companyName = "AzArt Membran" },
  ref,
) {
  const sellerName = invoice.seller || "Arif Mahmud";
  const preparerName = invoice.createdBy || sellerName;
  const warehouseName = invoice.warehouse || "ANAnas";
  const paymentSummaries = invoice.linkedEntriesSummary || [];
  const salesQtySummary = formatQuantitySummary(invoice.items);
  const returnItems = invoice.returnItems || [];
  const returnQtySummary = formatQuantitySummary(returnItems);
  const status =
    invoice.status === "active"
      ? { className: "approved", label: "Təsdiqləndi", Icon: Check, color: "#ffffff", strokeWidth: 3, size: 15, detail: `Təsdiq etdi: ${invoice.approvedBy || sellerName}`, preparer: `Tərtib edən: ${preparerName}` }
      : invoice.status === "draft"
        ? { className: "pending", label: "Təsdiq gözləyir", Icon: Clock, color: "#ffffff", strokeWidth: 2.5, size: 15, detail: `Tərtib edən: ${preparerName}`, preparer: undefined }
        : { className: "rejected", label: "Rədd edildi", Icon: X, color: "#ffffff", strokeWidth: 3, size: 15, detail: invoice.rejectionReason || `${invoice.cancelledBy || sellerName} tərəfindən rədd edildi`, preparer: `Tərtib edən: ${preparerName}` };

  return (
    <article className="approval-paper" ref={ref} id="qaime-printable-sheet">
      <header className="approval-paper-header">
        <div className="approval-brand-bar">
          <div className="approval-company-identity">
            <span className="approval-company-monogram">
              {companyName.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <b>{companyName}</b>
              <small>Membran, Folyolu Mebel Materialları və Aksesuar Təchizatı</small>
              <small>Anbar: «{warehouseName}» · Bakı, Azərbaycan</small>
              <span className="approval-company-contact-line">
                Satış təmsilçisi: {sellerName} · Valyuta: AZN (₼)
              </span>
              <span className="approval-company-tax-line">
                Rəsmi Qaimə və Müştəri Cari Hesab Üzləşmə Sənədi
              </span>
            </span>
          </div>
          <div className="approval-provider-block">
            <div className="approval-brand-lockup">
              <AriXLogo className="approval-logo" />
              <span>
                <b>AriX Qaimə sistemi</b>
                <small className="approval-arix-site">www.arix.az</small>
              </span>
            </div>
          </div>
        </div>

        <div className="approval-heading-row">
          <div className="approval-title-block">
            <small>SATIŞ VƏ BORC HESABLAŞMA SƏNƏDİ</small>
            <h2>Satış Qaiməsi Formu</h2>
            <span>
              Qaimə üzrə məhsullar, müştəri ödənişləri və cari borc qalığı göstərilən məlumatlar əsasında hazırlanmışdır.
            </span>
          </div>
          <div className={`approval-status-badge ${status.className}`}>
            <i aria-hidden="true">
              <status.Icon color={status.color} stroke={status.color} strokeWidth={status.strokeWidth} size={status.size} />
            </i>
            <span>
              <b>{status.label}</b>
              <small>{status.detail}</small>
              {status.preparer && <small>{status.preparer}</small>}
            </span>
          </div>
        </div>

        <div className="approval-summary-strip">
          <div>
            <ApprovalIcon kind="document" />
            <span>
              <small>QAİMƏ NO</small>
              <b>QA-{invoice.invoiceNo}</b>
              <em>Satış #{invoice.invoiceNo}</em>
            </span>
          </div>
          <div>
            <ApprovalIcon kind="calendar" />
            <span>
              <small>SƏNƏD TARİXİ</small>
              <b>{invoice.date}</b>
            </span>
          </div>
          <div>
            <ApprovalIcon kind="representative" />
            <span>
              <small>SATIŞ TƏMSİLÇİSİ</small>
              <b>{sellerName}</b>
            </span>
          </div>
          <div>
            <ApprovalIcon kind="source" />
            <span>
              <small>ANBAR / MƏNBƏ</small>
              <b>{warehouseName}</b>
            </span>
          </div>
          <div>
            <ApprovalIcon kind="currency" />
            <span>
              <small>HESAB VALYUTASI</small>
              <b>AZN · ₼</b>
            </span>
          </div>
        </div>

        <div className="approval-company-panel">
          <strong>MÜŞTƏRİ VƏ CARİ HESAB MƏLUMATLARI</strong>
          <div className="approval-company-panel-content">
            <ApprovalIcon kind="company" />
            <div>
              <b>{invoice.customer || "Müştəri seçilməyib"}</b>
              <span>Əvvəldən qalıq borc: {formatMoney(invoice.previousDebtSnapshot)}</span>
              <span>Cari sənəd üzrə satış: {formatMoney(invoice.salesAmount)}</span>
            </div>
            <div className="approval-company-panel-contact">
              <span>
                Çıxılan ödəniş: <b>{formatMoney(invoice.paymentDeducted)}</b>
              </span>
              <span>
                Geriqaytarma / Alış: <b>{formatMoney(invoice.returnAmount + invoice.purchaseAmount)}</b>
              </span>
              <span>
                Yekun Cəmi Borc: <b>{formatMoney(invoice.finalDebt)}</b>
              </span>
              <span>Ödəniş sayı: {paymentSummaries.length} əməliyyat</span>
            </div>
          </div>
        </div>
      </header>

      <div className="approval-paper-table-wrap">
        <table>
          <thead>
            <tr>
              <th className="approval-col-index">#</th>
              <th className="approval-col-name">Məhsul</th>
              <th className="approval-col-code">Artikul / Kod</th>
              <th className="approval-col-qty">Miqdar</th>
              <th className="approval-col-price">Vahid Qiyməti</th>
              <th className="approval-col-total">Toplam Məbləğ</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((line, index) => (
              <tr key={`${line.no || index}-${index}`}>
                <td className="approval-cell-index">{index + 1}</td>
                <td className="approval-cell-name">
                  <b>{line.name}</b>
                </td>
                <td className="approval-cell-code">
                  <b>{line.code || "—"}</b>
                </td>
                <td className="approval-quantity-cell">
                  <b>
                    {Number(line.quantity || 0).toLocaleString("az-AZ", { maximumFractionDigits: 2 })} {line.unit || "metr"}
                  </b>
                </td>
                <td className="approval-cell-price"><b>{formatMoney(line.price)}</b></td>
                <td className="approval-cell-total"><b>{formatMoney(line.total)}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="approval-table-total-row">
              <td colSpan={3} style={{ textAlign: "right", paddingRight: "14px" }}>
                <strong>TOPLAM:</strong>
              </td>
              <td className="approval-quantity-cell">
                <strong>
                  {salesQtySummary}
                </strong>
              </td>
              <td style={{ textAlign: "center" }}>—</td>
              <td>
                <strong style={{ color: "#1d4ed8", fontSize: "1.1em" }}>
                  {formatMoney(invoice.salesAmount || (invoice.items || []).reduce((sum, item) => sum + Number(item.total || 0), 0))}
                </strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {returnItems.length > 0 && (
        <div style={{ marginTop: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "6px 14px", color: "#b91c1c", fontWeight: 700, fontSize: "11px", textTransform: "uppercase" }}>
            <span>↩ GERİ QAYTARILAN MƏHSULLAR</span>
          </div>
          <div className="approval-paper-table-wrap approval-paper-return-wrap" style={{ borderColor: "#fca5a5" }}>
            <table className="approval-return-table">
              <thead>
                <tr style={{ background: "#fef2f2" }}>
                  <th className="approval-col-index" style={{ color: "#991b1b" }}>#</th>
                  <th className="approval-col-name" style={{ color: "#991b1b" }}>Məhsul</th>
                  <th className="approval-col-code" style={{ color: "#991b1b" }}>Artikul / Kod</th>
                  <th className="approval-col-qty" style={{ color: "#991b1b" }}>Miqdar</th>
                  <th className="approval-col-price" style={{ color: "#991b1b" }}>Vahid Qiyməti</th>
                  <th className="approval-col-total" style={{ color: "#991b1b" }}>Toplam Məbləğ</th>
                </tr>
              </thead>
              <tbody>
                {(returnItems || []).map((line, index) => (
                  <tr key={`return-${line.no || index}-${index}`}>
                    <td className="approval-cell-index">{index + 1}</td>
                    <td className="approval-cell-name"><b>{line.name}</b></td>
                    <td className="approval-cell-code"><b>{line.code || "—"}</b></td>
                    <td className="approval-quantity-cell">
                      <b>{Number(line.quantity || 0).toLocaleString("az-AZ", { maximumFractionDigits: 2 })} {line.unit || "metr"}</b>
                    </td>
                    <td className="approval-cell-price"><b>{formatMoney(line.price)}</b></td>
                    <td className="approval-cell-total" style={{ color: "#b91c1c" }}><b>{formatMoney(line.total)}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="approval-table-total-row" style={{ background: "#fef2f2", borderTop: "2px solid #f87171" }}>
                  <td colSpan={3} style={{ textAlign: "right", paddingRight: "14px" }}>
                    <strong style={{ color: "#991b1b" }}>TOPLAM QAYTARMA:</strong>
                  </td>
                  <td className="approval-quantity-cell">
                    <strong style={{ color: "#991b1b" }}>
                      {returnQtySummary}
                    </strong>
                  </td>
                  <td style={{ textAlign: "center" }}>—</td>
                  <td>
                    <strong style={{ color: "#b91c1c", fontSize: "1.1em" }}>
                      {formatMoney(invoice.returnAmount || (returnItems || []).reduce((sum, item) => sum + Number(item.total || 0), 0))}
                    </strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="approval-bottom-grid">
        <div className="approval-general-terms approval-general-terms-main">
          <div className="approval-condition-heading">
            <ApprovalIcon kind="payment" colorOverride="#4285e5" bgOverride="#e7f2ff" />
            <span>
              <b>QAİMƏDƏ ÇIXILAN ÖDƏNİŞLƏR VƏ ŞƏRTLƏR</b>
              <small>Müştərinin ödədiyi məbləğlər cari qaimə üzrə borcdan çıxılmışdır</small>
            </span>
          </div>
          <ul>
            {paymentSummaries.length > 0 ? (
              paymentSummaries.map((payment) => (
                <li key={payment.id}>
                  <b>{payment.date.split("-").reverse().join(".")} tarixli ödəniş:</b>{" "}
                  {formatMoney(payment.amount)} ({payment.channel}) — cari borcdan çıxıldı.
                </li>
              ))
            ) : (
              <li>Cari dövr üzrə qaimədən çıxılacaq yeni ödəniş qeydə alınmayıb (0,00 ₼).</li>
            )}
            {invoice.pastMonthDeducted > 0 && (
              <li>
                <b>Ötən aylardan qalıq ödəniş:</b> {formatMoney(invoice.pastMonthDeducted)} — cari borcdan çıxıldı.
              </li>
            )}
            <li>
              Məhsullar tam və zədəsiz şəkildə yoxlanılaraq təhvil verilmişdir. Yekun qalıq borc tərəflər arasında təsdiq olunur.
            </li>
          </ul>

          <div className="approval-inline-conditions">
            <span>
              <ApprovalIcon kind="payment" colorOverride="#19a96f" bgOverride="#e7f8ef" />
              <span>
                <b>TƏHVİL VERDİ (SATICI)</b>
                <small>{sellerName}{"\n"}İmza: ______________________</small>
              </span>
            </span>
            <span>
              <ApprovalIcon kind="delivery" colorOverride="#e7782f" bgOverride="#fff1e8" />
              <span>
                <b>TƏHVİL ALDI (MÜŞTƏRİ)</b>
                <small>{invoice.customer || "Alıcı"}{"\n"}İmza: ______________________</small>
              </span>
            </span>
          </div>
        </div>

        <div className="approval-totals">
          <span><b>Əvvəldən qalıq</b> <b><i>{formatMoney(invoice.previousDebtSnapshot)}</i></b></span>
          <span>
            <b>Satış {salesQtySummary ? `(${salesQtySummary})` : ""}</b>{" "}
            <b><i>{formatMoney(invoice.salesAmount)}</i></b>
          </span>
          <span className={invoice.returnAmount > 0 ? "approval-discount-total" : ""}>
            <b>Satışın geriqaytarılması</b> <b><i>{formatMoney(invoice.returnAmount)}</i></b>
          </span>
          <span className={invoice.purchaseAmount > 0 ? "approval-discount-total" : ""}>
            <b>Alış</b> <b><i>{formatMoney(invoice.purchaseAmount)}</i></b>
          </span>
          {(!invoice.explicitPaymentSelection || invoice.paymentDeducted > 0) && <span className="approval-discount-total">
            <b>Ödəniş (Çıxılan)</b> <b><i>{formatMoney(invoice.paymentDeducted)}</i></b>
          </span>}
          <strong>Cəmi Borc <b><i>{formatMoney(invoice.finalDebt)}</i></b></strong>
        </div>
      </div>

      <section className="approval-document-conditions">
        <div className="approval-note-box approval-note-box-bottom">
          <ApprovalIcon kind="note" colorOverride="#4285e5" bgOverride="#e7f2ff" />
          <span>
            <b>Əlavə qeyd və açıqlama</b>
            <small>
              {invoice.note?.trim() ||
                `Qaimə №${invoice.invoiceNo} üzrə əvvəlki qalıq (${formatMoney(invoice.previousDebtSnapshot)}) + cari satış (${formatMoney(invoice.salesAmount)}) − ödəniş (${formatMoney(invoice.paymentDeducted)}) = Yekun Cəmi Borc: ${formatMoney(invoice.finalDebt)}.`}
            </small>
          </span>
        </div>
      </section>

      <footer className="approval-page-footer">
        <span>
          Powered by <AriXLogo /> <b>AriX</b> Qaimə və Hesablaşma sistemi
        </span>
        <span className="approval-footer-page-tag">Səhifə 1 / 1</span>
        <span>
          Təhlükəsiz sənəd idarəetməsi &nbsp; | &nbsp; {invoice.date?.split(".").pop() || new Date().getFullYear()}
        </span>
      </footer>
    </article>
  );
});

export default QaimeDocument;
