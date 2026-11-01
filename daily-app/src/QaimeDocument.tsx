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
    payment: HandCoins,
    delivery: Truck,
  };
  const Icon = icons[kind];
  return <Icon className={`approval-vector-icon ${kind}`} aria-hidden="true" />;
}

function formatMoney(value: number) {
  const [whole, decimal] = Math.abs(Number(value || 0)).toFixed(2).split(".");
  const amount = `${value < 0 ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimal}`;
  return `${amount} ₼`;
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
  const warehouseName = invoice.warehouse || "ANAnas";
  const paymentSummaries = invoice.linkedEntriesSummary || [];
  const totalMeters = Math.round(
    invoice.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) * 100,
  ) / 100;
  const status =
    invoice.status === "active"
      ? { className: "approved", label: "Təsdiqləndi", Icon: Check, detail: `${invoice.approvedBy || sellerName} tərəfindən tərtib edildi` }
      : invoice.status === "draft"
        ? { className: "pending", label: "Təsdiq gözləyir", Icon: Clock, detail: `${sellerName} tərəfindən tərtib edildi` }
        : { className: "rejected", label: "Rədd edildi", Icon: X, detail: invoice.rejectionReason || `${sellerName} tərəfindən tərtib edildi` };

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
              <status.Icon />
            </i>
            <span>
              <b>{status.label}</b>
              <small>{status.detail}</small>
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
              <span>Cari sənəd üzrə satış: +{formatMoney(invoice.salesAmount)}</span>
            </div>
            <div className="approval-company-panel-contact">
              <span>
                Çıxılan ödəniş: <b>−{formatMoney(invoice.paymentDeducted)}</b>
              </span>
              <span>
                Geriqaytarma / Alış: <b>−{formatMoney(invoice.returnAmount + invoice.purchaseAmount)}</b>
              </span>
              <span>
                Yekun Cəmi Borc: <b>{formatMoney(invoice.finalDebt)}</b>
              </span>
              <span>Ödəniş sayı: {paymentSummaries.length} əməliyyat</span>
            </div>
          </div>
        </div>
      </header>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Məhsul (Ad / Model)</th>
            <th>Artikul / Kod</th>
            <th>Miqdar</th>
            <th>Vahid Qiyməti</th>
            <th>Toplam Məbləğ</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((line, index) => (
            <tr key={`${line.no}-${index}`}>
              <td>{index + 1}</td>
              <td>
                <b>{line.name}</b>
                {line.code && <small>{line.code}</small>}
              </td>
              <td>{line.code || "—"}</td>
              <td className="approval-quantity-cell">
                <b>
                  {line.quantity.toLocaleString("az-AZ", { maximumFractionDigits: 2 })} {line.unit || "metr"}
                </b>
              </td>
              <td><b>{formatMoney(line.price)}</b></td>
              <td><b>{formatMoney(line.total)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="approval-bottom-grid">
        <div className="approval-general-terms approval-general-terms-main">
          <div className="approval-condition-heading">
            <ApprovalIcon kind="payment" />
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
              <ApprovalIcon kind="payment" />
              <span>
                <b>TƏHVİL VERDİ (SATICI)</b>
                <small>{sellerName}{"\n"}İmza: ______________________</small>
              </span>
            </span>
            <span>
              <ApprovalIcon kind="delivery" />
              <span>
                <b>TƏHVİL ALDI (MÜŞTƏRİ)</b>
                <small>{invoice.customer || "Alıcı"}{"\n"}İmza: ______________________</small>
              </span>
            </span>
          </div>
        </div>

        <div className="approval-totals">
          <span>= Əvvəldən qalıq <b><i>{formatMoney(invoice.previousDebtSnapshot)}</i></b></span>
          <span>
            + Satış {totalMeters > 0 ? `(${totalMeters} metr)` : ""}{" "}
            <b><i>+{formatMoney(invoice.salesAmount)}</i></b>
          </span>
          <span className={invoice.returnAmount > 0 ? "approval-discount-total" : ""}>
            − Satışın geriqaytarılması <b><i>−{formatMoney(invoice.returnAmount)}</i></b>
          </span>
          <span className={invoice.purchaseAmount > 0 ? "approval-discount-total" : ""}>
            − Alış <b><i>−{formatMoney(invoice.purchaseAmount)}</i></b>
          </span>
          <span className="approval-discount-total">
            − Ödəniş (Çıxılan) <b><i>−{formatMoney(invoice.paymentDeducted)}</i></b>
          </span>
          <strong>Cəmi Borc <b><i>{formatMoney(invoice.finalDebt)}</i></b></strong>
        </div>
      </div>

      <section className="approval-document-conditions">
        <div className="approval-note-box approval-note-box-bottom">
          <ApprovalIcon kind="note" />
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
        <span>Powered by <AriXLogo /> <b>AriX</b> Qaimə və Hesablaşma sistemi</span>
        <span>
          Təhlükəsiz sənəd idarəetməsi &nbsp; | &nbsp; {invoice.date.split(".").pop() || new Date().getFullYear()}
        </span>
      </footer>
    </article>
  );
});

export default QaimeDocument;
