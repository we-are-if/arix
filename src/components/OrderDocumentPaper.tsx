import { Building2, CalendarDays, Check, CircleDollarSign, FileText, HandCoins, Layers3, ListChecks, NotepadText, Truck, UserRound } from "lucide-react";
import AriXLogo from "./AriXLogo";

export type OrderPaperKind = "domestic" | "proforma" | "commercial_invoice" | "packing_list";

export type OrderPaperLine = {
  name: string;
  code: string;
  rolls: number;
  quantity: number;
  width?: number;
  unitPrice: string;
  amount: string;
  hsCode?: string;
  origin?: string;
  pallet?: number;
  netWeight?: number;
  grossWeight?: number;
  dimensions?: string;
};

export type OrderDocumentPaperProps = {
  kind: OrderPaperKind;
  company: { name: string; subtitle?: string; address?: string; phone?: string; email?: string; website?: string; taxOffice?: string; taxNumber?: string; logo?: string; stamp?: string };
  status: "draft" | "approved";
  approvedBy?: string;
  number: string;
  orderNumber: string;
  date: string;
  proformaDate?: string;
  representative: string;
  invoiceNumber?: string;
  currency: string;
  customer: { name: string; contact?: string; address?: string; phone?: string; email?: string; taxOffice?: string; taxNumber?: string };
  lines: OrderPaperLine[];
  totals: { subtotal: string; tax: string; extra: string; total: string };
  paymentTerms?: string;
  deliveryTerms?: string;
  note?: string;
  bank?: { name?: string; swift?: string; iban?: string };
  exportDetails?: { packageType?: string; description?: string; incoterm?: string; shipmentPort?: string; destination?: string; origin?: string; transportMode?: string; loadingPlace?: string; container?: string; transportDocument?: string; marks?: string; buyerOrderNumber?: string; declaration?: string };
};

function ApprovalIcon({ kind }: { kind: "document" | "calendar" | "representative" | "source" | "currency" | "company" | "note" | "terms" | "payment" | "delivery" }) {
  const icons = { document: FileText, calendar: CalendarDays, representative: UserRound, source: Layers3, currency: CircleDollarSign, company: Building2, note: NotepadText, terms: ListChecks, payment: HandCoins, delivery: Truck };
  const Icon = icons[kind];
  return <Icon className={`approval-vector-icon ${kind}`} aria-hidden="true" />;
}

const exportTerms = [
  "Prices and amounts are stated in the currency shown on this proforma invoice.",
  "Bank charges outside Türkiye are payable by the buyer.",
  "Delivery, cost and risk responsibilities are governed by the stated Incoterms® 2020 rule.",
  "Final quantities and shipment details will be confirmed on the commercial invoice and packing list.",
];

const domesticTerms = [
  "Fiyatlarımıza KDV dahil değildir.",
  "Faturadaki döviz kuru, bir önceki iş gününün TCMB efektif satış kuru olacak şekilde alınacaktır.",
  "Yukarıda belirtilen malzemelerin fiyatları depo teslim fiyatlarıdır. Kargo ve nakliye bedeli alıcıya aittir.",
  "Ürünler, mümkün olan en kısa sürede alıcının belirttiği kargo ya da nakliye firmasına yönlendirilir.",
  "Anlaşılmayan hususlarda lütfen ilgili satış sorumlumuz ile temasa geçiniz.",
];

export default function OrderDocumentPaper(props: OrderDocumentPaperProps) {
  const { kind, company, customer, lines, exportDetails = {}, bank = {}, totals } = props;
  const isExport = kind !== "domestic";
  const isCommercial = kind === "commercial_invoice";
  const isPacking = kind === "packing_list";
  const title = isPacking ? "Packing List" : isCommercial ? "Commercial Invoice" : kind === "proforma" ? "Proforma Invoice" : "Sipariş Onay Formu";
  const palletGroups = [...new Set(lines.map((line) => line.pallet || 1))];
  const totalRolls = lines.reduce((sum, line) => sum + line.rolls, 0);
  const totalNet = lines.reduce((sum, line) => sum + Number(line.netWeight || 0), 0);
  const totalGross = lines.reduce((sum, line) => sum + Number(line.grossWeight || 0), 0);

  return <article className="approval-paper" lang={isExport ? "en" : "tr"}>
    <header className="approval-paper-header">
      <div className="approval-brand-bar">
        <div className="approval-company-identity">
          {company.logo ? <img className="approval-company-logo" src={company.logo} alt={company.name} /> : <span className="approval-company-monogram">{company.name.slice(0, 2).toUpperCase()}</span>}
          <span><b>{company.name}</b>{company.subtitle && <small>{company.subtitle}</small>}{company.address && <small>{company.address}</small>}<span className="approval-company-contact-line">{[company.phone, company.email, company.website].filter(Boolean).join(" · ")}</span><span className="approval-company-tax-line">Vergi dairesi: {company.taxOffice || "-"} · VKN/TCKN: {company.taxNumber || "-"}</span></span>
        </div>
        <div className="approval-provider-block"><div className="approval-brand-lockup"><AriXLogo className="approval-logo" /><span><b>AriX Sipariş sistemi</b><small className="approval-arix-site">www.arix.az</small></span></div></div>
      </div>
      <div className="approval-heading-row">
        <div className="approval-title-block"><small>{isExport ? "EXPORT SALES DOCUMENT" : "SATIŞ BELGESİ"}</small><h2>{title}</h2><span>{isPacking ? "Packing details for the exported goods." : isExport ? "Issued for export documentation purposes." : "Sipariş, belirtilen bilgiler doğrultusunda hazırlanmıştır."}</span></div>
        <div className={`approval-status-badge ${props.status}`}><i aria-hidden="true">{props.status === "approved" && <Check />}</i><span><b>{props.status === "approved" ? "Onaylandı" : "Taslak"}</b><small>{props.status === "approved" ? `${props.approvedBy || props.representative || "Satış temsilcisi"} onayladı` : "Satış temsilcisi onayı bekleniyor"}</small></span></div>
      </div>
      <div className="approval-summary-strip">
        <div><ApprovalIcon kind="document" /><span><small>{isExport ? "PROFORMA NO" : "FORM NO"}</small><b>{props.number}</b><em>{props.orderNumber}</em></span></div>
        <div><ApprovalIcon kind="calendar" /><span><small>{isExport ? "ISSUE DATE" : "BELGE TARİHİ"}</small><b>{props.date}</b></span></div>
        <div><ApprovalIcon kind="representative" /><span><small>{isExport ? "SALES REPRESENTATIVE" : "SATIŞ TEMSİLCİSİ"}</small><b>{props.representative || "-"}</b></span></div>
        <div><ApprovalIcon kind="source" /><span><small>{isExport ? "INVOICE NO" : "KAYNAK"}</small><b>{isExport ? (props.invoiceNumber || "-") : "ERSA DEPO"}</b></span></div>
        <div><ApprovalIcon kind="currency" /><span><small>{isExport ? "CURRENCY" : "KUR"}</small><b>{props.currency}</b></span></div>
      </div>
      {(isCommercial || isPacking) && <div className="approval-shipment-date"><b>Proforma date</b><span>{props.proformaDate || props.date}</span></div>}
      <div className="approval-company-panel"><strong>{isExport ? "BUYER INFORMATION" : "MÜŞTERİ BİLGİLERİ"}</strong><div className="approval-company-panel-content"><ApprovalIcon kind="company" /><div><b>{customer.name}</b><span>{customer.contact ? `${isExport ? "Contact" : "Temsilci"}: ${customer.contact}` : (isExport ? "Contact not specified" : "Temsilci bilgisi girilmedi")}</span><span>{customer.address || (isExport ? "Address not specified" : "Adres bilgisi girilmedi")}</span></div><div className="approval-company-panel-contact"><span>{customer.phone || (isExport ? "Phone not specified" : "Telefon bilgisi girilmedi")}</span><span>{customer.email || (isExport ? "Email not specified" : "E-posta bilgisi girilmedi")}</span><span>{isExport ? "VAT / Tax No" : "Vergi dairesi"}: <b>{isExport ? (customer.taxNumber || "-") : (customer.taxOffice || "-")}</b></span>{!isExport && <span>VKN/TCKN: {customer.taxNumber || "-"}</span>}</div></div></div>
    </header>
    <table><thead><tr><th>#</th><th>{isExport ? "Product" : "Ürün"}</th><th>{isPacking ? "Packages" : isExport ? "Roll" : "Rulo"}</th><th>{isExport ? "Quantity / Unit" : "Miktar"}</th><th>{isPacking ? "Net Weight" : isExport ? "Unit Price" : "m² Fiyatı"}</th><th>{isPacking ? "Gross Weight" : isExport ? "Amount" : "Toplam"}</th></tr></thead><tbody>
      {isPacking ? palletGroups.flatMap((pallet) => {
        const palletLines = lines.filter((line) => (line.pallet || 1) === pallet);
        const rolls = palletLines.reduce((sum, line) => sum + line.rolls, 0);
        const net = palletLines.reduce((sum, line) => sum + Number(line.netWeight || 0), 0);
        const gross = palletLines.reduce((sum, line) => sum + Number(line.grossWeight || 0), 0);
        return [<tr className="approval-pallet-row" key={`p-${pallet}`}><td colSpan={2}><b>PALLET {pallet}</b></td><td><b>{rolls} rolls</b></td><td><small>{palletLines[0]?.dimensions || "-"}</small></td><td><b>{net.toLocaleString("tr-TR")} kg</b></td><td><b>{gross.toLocaleString("tr-TR")} kg</b></td></tr>, ...palletLines.map((line, index) => <tr key={`${pallet}-${line.code}-${index}`}><td>{index + 1}</td><td><b>{line.name}</b><small>{line.code}</small></td><td>{line.rolls}</td><td className="approval-quantity-cell"><b>{(line.quantity * (line.width || 1.42)).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m²</b><small>{line.quantity.toLocaleString("tr-TR")} mt</small></td><td><b>{Number(line.netWeight || 0).toLocaleString("tr-TR")} kg</b></td><td><b>{Number(line.grossWeight || 0).toLocaleString("tr-TR")} kg</b></td></tr>)];
      }) : lines.map((line, index) => <tr key={`${line.code}-${index}`}><td>{index + 1}</td><td><b>{line.name}</b><small>{isCommercial ? `${line.code} · HS ${line.hsCode || "-"} · ${line.origin || exportDetails.origin || "-"}` : line.code}</small></td><td>{isCommercial ? <b>{line.rolls} rolls</b> : line.rolls}</td><td className="approval-quantity-cell"><b>{(line.quantity * (line.width || 1.42)).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m²</b><small>{line.quantity.toLocaleString("tr-TR")} mt</small></td><td><b>{line.unitPrice}</b></td><td><b>{line.amount}</b></td></tr>)}
    </tbody></table>
    <div className="approval-bottom-grid">
      {isCommercial ? <div className="approval-commercial-panel approval-commercial-shipment-panel"><div className="approval-condition-heading"><ApprovalIcon kind="delivery" /><span><b>Shipment & customs</b><small>Transport, package and customs details</small></span></div><div className="approval-commercial-panel-grid"><span><small>Packaging</small>{exportDetails.packageType || "-"}</span><span><small>Buyer PO / Contract</small>{exportDetails.buyerOrderNumber || "-"}</span><span><small>Delivery term</small>{exportDetails.incoterm || "-"}</span><span><small>Transport mode</small>{exportDetails.transportMode || "-"}</span><span><small>Loading / destination</small>{exportDetails.loadingPlace || "-"} → {exportDetails.destination || "-"}</span><span><small>Vehicle / Container</small>{exportDetails.container || "-"}</span><span><small>CMR / B/L / AWB</small>{exportDetails.transportDocument || "-"}</span><span><small>Marks & numbers</small>{exportDetails.marks || "-"}</span><span><small>Net / Gross</small>{totalNet.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} / {totalGross.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</span></div></div> : isPacking ? <div className="approval-commercial-panel approval-packing-summary-panel"><div className="approval-condition-heading"><ApprovalIcon kind="terms" /><span><b>Packing summary</b><small>Pallet, roll and weight totals</small></span></div><div className="approval-packing-summary-grid"><span><small>Total pallets</small><b>{palletGroups.length}</b></span><span><small>Total rolls</small><b>{totalRolls}</b></span><span><small>Total net weight</small><b>{totalNet.toLocaleString("tr-TR")} kg</b></span><span><small>Total gross weight</small><b>{totalGross.toLocaleString("tr-TR")} kg</b></span></div></div> : <div className="approval-general-terms approval-general-terms-main"><div className="approval-condition-heading"><ApprovalIcon kind="terms" /><span><b>{isExport ? "Terms and export details" : "Genel koşullar"}</b><small>{isExport ? "Proforma invoice conditions" : "Yurtiçi satış koşulları"}</small></span></div><ul>{(isExport ? exportTerms : domesticTerms).map((term) => <li key={term}>{term}</li>)}</ul>{isExport && <div className="approval-export-summary"><span><b>Packaging</b>{exportDetails.packageType || "-"}</span><span><b>Description</b>{exportDetails.description || "-"}</span><span><b>Delivery term</b>{exportDetails.incoterm || "-"}</span><span><b>Shipment port</b>{exportDetails.shipmentPort || "-"}</span><span><b>Destination</b>{exportDetails.destination || "-"}</span><span><b>Country of origin</b>{exportDetails.origin || "-"}</span></div>}<div className="approval-inline-conditions"><span><ApprovalIcon kind="payment" /><span><b>{isExport ? "Payment terms" : "Ödeme koşulu"}</b><small>{props.paymentTerms || (isExport ? "Not specified" : "Belirtilmedi")}</small></span></span><span><ApprovalIcon kind="delivery" /><span><b>{isExport ? "Delivery terms" : "Teslimat koşulu"}</b><small>{props.deliveryTerms || exportDetails.incoterm || (isExport ? "Not specified" : "Belirtilmedi")}</small></span></span></div>{isExport && <div className="approval-bank-line"><b>Bank</b><span>{bank.name || "-"} · SWIFT: {bank.swift || "-"} · IBAN: {bank.iban || "-"}</span></div>}</div>}
      {!isPacking && <div className="approval-totals"><span>{isExport ? "Subtotal" : "Ara toplam"}<b><i>{totals.subtotal}</i></b></span><span>{isExport ? "Tax" : "KDV"}<b><i>{totals.tax}</i></b></span><span>{isExport ? "Additional charge" : "Ek masraf"}<b><i>{totals.extra}</i></b></span><strong>{isExport ? "Total" : "Genel toplam"}<b><i>{totals.total}</i></b></strong></div>}
      {isPacking && <div className="approval-commercial-panel approval-packing-shipment-panel"><div className="approval-condition-heading"><ApprovalIcon kind="delivery" /><span><b>Shipment details</b><small>Packing list reference information</small></span></div><div className="approval-packing-shipment-grid"><span><small>Invoice no.</small>{props.invoiceNumber || "-"}</span><span><small>Shipment date</small>{props.date}</span><span><small>Place of loading</small>{exportDetails.loadingPlace || exportDetails.shipmentPort || "-"}</span><span><small>Destination</small>{exportDetails.destination || "-"}</span><span><small>Delivery term</small>{exportDetails.incoterm || "-"}</span><span><small>Country of origin</small>{exportDetails.origin || "-"}</span></div></div>}
    </div>
    {isCommercial && <div className="approval-commercial-tail"><section className="approval-commercial-panels"><div className="approval-general-terms approval-general-terms-main approval-commercial-terms-panel"><div className="approval-condition-heading"><ApprovalIcon kind="terms" /><span><b>Terms and export details</b><small>Commercial invoice conditions</small></span></div><ul>{exportTerms.map((term) => <li key={term}>{term}</li>)}</ul><div className="approval-inline-conditions"><span><ApprovalIcon kind="payment" /><span><b>Payment terms</b><small>{props.paymentTerms || "Not specified"}</small></span></span><span><ApprovalIcon kind="delivery" /><span><b>Delivery terms</b><small>{props.deliveryTerms || exportDetails.incoterm || "Not specified"}</small></span></span></div></div><div className="approval-commercial-panel approval-commercial-stamp-panel"><div className="approval-commercial-declaration"><div className="approval-condition-heading"><ApprovalIcon kind="note" /><span><b>Exporter declaration</b><small>Certified commercial invoice statement</small></span></div><span>{exportDetails.declaration || "-"}</span></div><div className="approval-commercial-stamp"><div className="approval-condition-heading"><ApprovalIcon kind="company" /><span><b>Authorized signature / stamp</b><small>Exporter approval</small></span></div>{company.stamp ? <img src={company.stamp} alt="Company stamp and signature" /> : <span>Stamp / signature</span>}</div></div><div className="approval-commercial-panel approval-commercial-bank-panel"><div className="approval-condition-heading"><ApprovalIcon kind="payment" /><span><b>Beneficiary bank</b><small>Payment account details</small></span></div><div className="approval-commercial-bank-details"><span><small>Bank</small>{bank.name || "-"}</span><span><small>SWIFT</small>{bank.swift || "-"}</span><span><small>IBAN</small>{bank.iban || "-"}</span></div></div></section></div>}
    {isPacking && <section className="approval-packing-approval-tail"><div className="approval-commercial-panel approval-packing-declaration-panel"><div className="approval-condition-heading"><ApprovalIcon kind="note" /><span><b>Packing declaration</b><small>Shipment contents confirmation</small></span></div><span>We hereby certify that the packages, quantities and weights stated in this packing list are true and correct.</span></div><div className="approval-commercial-panel approval-commercial-stamp-panel"><div className="approval-commercial-stamp"><div className="approval-condition-heading"><ApprovalIcon kind="company" /><span><b>Authorized signature / stamp</b><small>Exporter approval</small></span></div>{company.stamp ? <img src={company.stamp} alt="Company stamp and signature" /> : <span>Stamp / signature</span>}</div></div></section>}
    {!isCommercial && !isPacking && <section className="approval-document-conditions"><div className="approval-note-box approval-note-box-bottom"><ApprovalIcon kind="note" /><span><b>Ek not</b><small>{props.note || "Bu sipariş için ek not bulunmuyor."}</small></span></div></section>}
    <footer className="approval-page-footer"><span>Powered by <AriXLogo /> <b>AriX</b> Sipariş sistemi</span><span>Güvenli belge yönetimi &nbsp; | &nbsp; {new Date(props.date).getFullYear() || new Date().getFullYear()}</span></footer>
  </article>;
}
