import { Fragment, type Ref } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  FileText,
  HandCoins,
  Layers3,
  ListChecks,
  NotepadText,
  Truck,
  UserRound,
} from "lucide-react";
import AriXLogo from "./AriXLogo";

export type OrderDocumentLine = {
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

export type OrderDocumentForm = {
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
  lines: OrderDocumentLine[];
  overallDiscountRate?: number;
  extraCharge: number;
  extraChargeLabel: string;
  paymentTerms: string;
  deliveryTerms: string;
  note: string;
  status: "draft" | "approved";
  approvedAt?: string;
  approvedBy?: string;
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

export type OrderDocumentPrintSettings = {
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

type Props = {
  form: OrderDocumentForm;
  order: { number: string; customerName: string };
  printSettings: OrderDocumentPrintSettings;
  ratePublicationDate?: string;
  pdfExport?: boolean;
  paperRef?: Ref<HTMLElement>;
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

function formatMoney(value: number, currency: OrderDocumentForm["currency"]) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function dualMoney(
  value: number,
  form: Pick<OrderDocumentForm, "currency" | "exchangeRate">,
) {
  const primary = formatMoney(value, form.currency);
  if (form.currency === "TRY") return { primary, local: "" };
  return {
    primary,
    local: formatMoney(value * (Number(form.exchangeRate) || 0), "TRY"),
  };
}

function approvalTotals(form: OrderDocumentForm) {
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

function packingPalletPlan(lines: OrderDocumentLine[], distribution: number[]) {
  const pallets = distribution.map((rollCount, index) => ({
    number: index + 1,
    rollCount,
    remaining: rollCount,
    items: [] as Array<{
      line: OrderDocumentLine;
      lineIndex: number;
      rolls: number;
      quantity: number;
    }>,
  }));
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
    if (totalRolls === 0 && pallets.length) {
      pallets[0].items.push({
        line,
        lineIndex,
        rolls: 0,
        quantity: Number(line.quantity || 0),
      });
    }
  });
  return pallets;
}

function packingAllocationsFromPlan(lines: OrderDocumentLine[], distribution: number[]) {
  return packingPalletPlan(lines, distribution).map((pallet) => pallet.items
    .filter((item) => item.rolls > 0)
    .map((item) => ({
      lineIndex: item.lineIndex,
      rolls: item.rolls,
      quantity: item.quantity,
    })));
}

function ApprovalIcon({
  kind,
}: {
  kind: "document" | "calendar" | "representative" | "source" | "currency" | "company" | "note" | "terms" | "payment" | "delivery";
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
  return <Icon className={"approval-vector-icon " + kind} aria-hidden="true" />;
}

export default function OrderDocumentPaper({
  form,
  order,
  printSettings,
  ratePublicationDate = "",
  pdfExport = false,
  paperRef,
}: Props) {
  const totals = approvalTotals(form);
  const packingTotalRolls = form.lines.reduce(
    (sum, line) => sum + Math.max(0, Math.trunc(Number(line.rollCount) || 0)),
    0,
  );
  const packingDistribution = form.palletDistribution?.length
    ? form.palletDistribution
    : balancedPalletDistribution(packingTotalRolls);
  const packingAllocations = form.palletAllocations?.length === packingDistribution.length
    ? form.palletAllocations
    : packingAllocationsFromPlan(form.lines, packingDistribution);
  const packingPlan = packingAllocations.map((items, index) => ({
    number: index + 1,
    rollCount: items.reduce((sum, item) => sum + item.rolls, 0),
    remaining: 0,
    items: items.map((item) => {
      const line = form.lines[item.lineIndex];
      const totalRolls = Math.max(1, Number(line?.rollCount) || 0);
      return {
        line,
        lineIndex: item.lineIndex,
        rolls: item.rolls,
        quantity: Number.isFinite(Number(item.quantity))
          ? Number(item.quantity)
          : Number(line?.quantity || 0) * item.rolls / totalRolls,
      };
    }).filter((item): item is typeof item & { line: OrderDocumentLine } => Boolean(item.line)),
  }));
  const packingPalletDetails = packingDistribution.map(
    (_, index) => form.palletDetails?.[index] ?? ({
      grossWeight: 0,
      tareWeight: 0,
      lengthCm: 0,
      widthCm: 0,
      heightCm: 0,
    }),
  );
  const isProforma = form.documentType !== "domestic";
  const isPackingList = form.documentType === "packing_list";
  const isCommercialInvoice = form.documentType === "commercial_invoice";
  const exportDocumentTitle = form.documentType === "commercial_invoice"
    ? "Commercial Invoice"
    : isPackingList
      ? "Packing List"
      : "Proforma Invoice";
  const rates = Array.from(
    new Set(form.lines.map((line) => Number(line.vatRate) || 0)),
  ).sort((left, right) => left - right);
  const vatRateLabel = rates.length === 1
    ? "KDV (%" + rates[0] + ")"
    : "KDV (" + rates.map((rate) => "%" + rate).join(", ") + ")";

  return (
    <article
      className={["approval-paper", pdfExport && "pdf-export"].filter(Boolean).join(" ")}
      ref={paperRef}
      lang={isProforma ? "en" : "tr"}
    >
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
              {printSettings.brandSubtitle && <small>{printSettings.brandSubtitle}</small>}
              {printSettings.addressLine && <small>{printSettings.addressLine}</small>}
              <span className="approval-company-contact-line">
                {[printSettings.phone, printSettings.email, printSettings.website].filter(Boolean).join(" · ")}
              </span>
              <span className="approval-company-tax-line">
                Vergi dairesi: {printSettings.taxOffice || "-"} · VKN/TCKN: {printSettings.taxNumber || "-"}
              </span>
            </span>
          </div>
          <div className="approval-provider-block">
            <div className="approval-brand-lockup">
              <AriXLogo className="approval-logo" />
              <span>
                <b>AriX Sipariş sistemi</b>
                <small className="approval-arix-site">www.arix.az</small>
              </span>
            </div>
          </div>
        </div>

        <div className="approval-heading-row">
          <div className="approval-title-block">
            <small>{isProforma ? "EXPORT SALES DOCUMENT" : "SATIŞ BELGESİ"}</small>
            <h2>{isProforma ? exportDocumentTitle : "Sipariş Onay Formu"}</h2>
            <span>
              {isPackingList
                ? "Packing details for the exported goods."
                : isProforma
                  ? "Issued for export documentation purposes."
                  : "Sipariş, belirtilen bilgiler doğrultusunda hazırlanmıştır."}
            </span>
          </div>
          <div className={"approval-status-badge " + form.status}>
            <i aria-hidden="true">{form.status === "approved" && <Check />}</i>
            <span>
              <b>{form.status === "approved" ? "Onaylandı" : "Taslak"}</b>
              <small>
                {form.status === "approved"
                  ? (form.approvedBy || form.salesRepresentative || "Satış temsilcisi") + " onayladı"
                  : "Satış temsilcisi onayı bekleniyor"}
              </small>
            </span>
          </div>
        </div>

        <div className="approval-summary-strip">
          <div><ApprovalIcon kind="document" /><span><small>{isProforma ? "PROFORMA NO" : "FORM NO"}</small><b>{isProforma ? form.proformaNumber : form.number}</b><em>{order.number}</em></span></div>
          <div><ApprovalIcon kind="calendar" /><span><small>{isProforma ? "ISSUE DATE" : "BELGE TARİHİ"}</small><b>{form.documentType === "commercial_invoice" || form.documentType === "packing_list" ? (form.shipmentDate || form.date) : form.date}</b></span></div>
          <div><ApprovalIcon kind="representative" /><span><small>{isProforma ? "SALES REPRESENTATIVE" : "SATIŞ TEMSİLCİSİ"}</small><b>{form.salesRepresentative || "-"}</b></span></div>
          <div><ApprovalIcon kind="source" /><span><small>{isProforma ? "INVOICE NO" : "KAYNAK"}</small><b>{isProforma ? (form.invoiceNumber || "-") : "ERSA DEPO"}</b></span></div>
          <div>
            <ApprovalIcon kind="currency" />
            <span>
              <small>{isProforma ? "CURRENCY" : "KUR"}</small>
              <b>{isProforma ? form.currency : (form.currency === "TRY" ? "TL · 1" : form.currency + " · " + form.exchangeRate)}</b>
              {!isProforma && form.currency !== "TRY" && ratePublicationDate && <em>({ratePublicationDate})</em>}
            </span>
          </div>
        </div>
        {(form.documentType === "commercial_invoice" || form.documentType === "packing_list") && (
          <div className="approval-shipment-date"><b>Proforma date</b><span>{form.date}</span></div>
        )}

        <div className="approval-company-panel">
          <strong>{isProforma ? "BUYER INFORMATION" : "MÜŞTERİ BİLGİLERİ"}</strong>
          <div className="approval-company-panel-content">
            <ApprovalIcon kind="company" />
            <div>
              <b>{form.customerName || order.customerName}</b>
              <span>{form.customerContact ? (isProforma ? "Contact" : "Temsilci") + ": " + form.customerContact : (isProforma ? "Contact not specified" : "Temsilci bilgisi girilmedi")}</span>
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
            <th>{isPackingList ? "Packages" : isProforma ? "Roll" : "Rulo"}</th>
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
            return (
              <Fragment key={"pallet-" + pallet.number}>
                <tr className="approval-pallet-row">
                  <td colSpan={2}><b>PALLET {pallet.number}</b></td>
                  <td><b>{pallet.rollCount} rolls</b></td>
                  <td><small>{detail.lengthCm} × {detail.widthCm} × {detail.heightCm} cm</small></td>
                  <td><b>{palletNet.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                  <td><b>{detail.grossWeight.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                </tr>
                {pallet.items.map((item, itemIndex) => {
                  const ratio = palletMeters > 0 ? item.quantity / palletMeters : 0;
                  return (
                    <tr key={pallet.number + "-" + item.lineIndex + "-" + itemIndex}>
                      <td>{item.lineIndex + 1}</td>
                      <td><b>{item.line.productName}</b><small>{item.line.productCode}</small></td>
                      <td>{item.rolls}</td>
                      <td className="approval-quantity-cell">
                        <b>{(item.quantity * (Number(item.line.width) || 1.42)).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m²</b>
                        <small>{item.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} mt</small>
                      </td>
                      <td><b>{(palletNet * ratio).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                      <td><b>{(detail.grossWeight * ratio).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          }) : form.lines.map((line, index) => {
            const squareMeters = line.quantity * (Number(line.width) || 1.42);
            const exportUnitLabels: Record<string, string> = {
              M2: "m²",
              M: "m",
              ROLL: "roll",
              BOX: "box",
              PCS: "pcs",
              KG: "kg",
              SET: "set",
              PALLET: "pallet",
            };
            const exportUnit = line.unit ?? "M2";
            const price = dualMoney(line.unitPrice, form);
            const total = dualMoney(totals.lines[index].net, form);
            return (
              <tr key={index}>
                <td>{index + 1}</td>
                <td>
                  <b>{line.productName}</b>
                  {isCommercialInvoice ? <small>{line.productCode} · HS {line.hsCode || "-"} · {line.countryOfOrigin || form.countryOfOrigin || "-"}</small> : <small>{line.productCode}</small>}
                  {line.discountRate > 0 && <small className="approval-line-discount">Ürün iskontosu %{line.discountRate}</small>}
                </td>
                <td>
                  {isCommercialInvoice ? (
                    <>
                      <b>{line.rollCount} rolls</b>
                      {(line.manual || Number(line.rollCount) <= 0) && Number(line.packageCount) > 0 && <small>{line.packageCount} packages</small>}
                    </>
                  ) : line.rollCount}
                </td>
                <td className="approval-quantity-cell">
                  {isProforma && line.manual ? (
                    <>
                      <b>{line.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} {exportUnitLabels[exportUnit]}</b>
                      {exportUnit === "BOX" && <small>{line.unitsPerBox || 0} pcs / box · {(line.quantity * Number(line.unitsPerBox || 0)).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} pcs total</small>}
                    </>
                  ) : (
                    <><b>{squareMeters.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m²</b><small>{line.quantity} mt</small></>
                  )}
                </td>
                <td><b>{price.primary}</b>{!isProforma && price.local && <small>{price.local}</small>}</td>
                <td><b>{total.primary}</b>{!isProforma && total.local && <small>{total.local}</small>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="approval-bottom-grid">
        {isCommercialInvoice ? (
          <div className="approval-commercial-panel approval-commercial-shipment-panel">
            <div className="approval-condition-heading"><ApprovalIcon kind="delivery" /><span><b>Shipment & customs</b><small>Transport, package and customs details</small></span></div>
            <div className="approval-commercial-panel-grid">
              <span><small>Packaging</small>{form.packageType || "-"}</span>
              <span><small>Buyer PO / Contract</small>{form.buyerOrderNumber || "-"}</span>
              <span><small>Delivery term</small>{form.incoterm || "-"}</span>
              <span><small>Transport mode</small>{form.transportMode || "-"}</span>
              <span><small>Loading / destination</small>{form.loadingPlace || "-"} → {form.destination || "-"}</span>
              <span><small>Vehicle / Container</small>{form.vehicleContainerNumber || "-"}</span>
              <span><small>CMR / B/L / AWB</small>{form.transportDocumentNumber || "-"}</span>
              <span><small>Marks & numbers</small>{form.marksAndNumbers || "-"}</span>
              {form.lines.some((line) => (line.manual || Number(line.rollCount) <= 0) && Number(line.packageCount) > 0) && (
                <span><small>Packages</small>{form.lines.reduce((sum, line) => sum + ((line.manual || Number(line.rollCount) <= 0) ? (Number(line.packageCount) || 0) : 0), 0)}</span>
              )}
              <span><small>Net / Gross</small>{form.lines.reduce((sum, line) => sum + (Number(line.netWeight) || 0), 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} / {form.lines.reduce((sum, line) => sum + (Number(line.grossWeight) || 0), 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</span>
            </div>
          </div>
        ) : isPackingList ? (
          <div className="approval-commercial-panel approval-packing-summary-panel">
            <div className="approval-condition-heading"><ApprovalIcon kind="terms" /><span><b>Packing summary</b><small>Pallet, roll and weight totals</small></span></div>
            <div className="approval-packing-summary-grid">
              <span><small>Total pallets</small><b>{packingDistribution.length}</b></span>
              <span><small>Total rolls</small><b>{packingDistribution.reduce((sum, value) => sum + value, 0)}</b></span>
              <span><small>Total net weight</small><b>{packingPalletDetails.reduce((sum, item) => sum + Math.max(0, Number(item.grossWeight) - Number(item.tareWeight)), 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></span>
              <span><small>Total gross weight</small><b>{packingPalletDetails.reduce((sum, item) => sum + (Number(item.grossWeight) || 0), 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></span>
            </div>
          </div>
        ) : (
          <div className="approval-general-terms approval-general-terms-main">
            <div className="approval-condition-heading"><ApprovalIcon kind="terms" /><span><b>{isProforma ? "Terms and export details" : "Genel koşullar"}</b><small>{isProforma ? "Proforma invoice conditions" : "Yurtiçi satış koşulları"}</small></span></div>
            <ul>{(isProforma ? EXPORT_GENERAL_TERMS : DOMESTIC_GENERAL_TERMS).map((term) => <li key={term}>{term}</li>)}</ul>
            {isProforma && !isCommercialInvoice && (
              <div className="approval-export-summary">
                <span><b>Packaging</b>{form.packageType || "-"}</span>
                <span><b>Description</b>{form.productDescription || "-"}</span>
                <span><b>Delivery term</b>{form.incoterm || "-"}</span>
                <span><b>Shipment port</b>{form.shipmentPort || "-"}</span>
                <span><b>Destination</b>{form.destination || "-"}</span>
                <span><b>Country of origin</b>{form.countryOfOrigin || "-"}</span>
              </div>
            )}
            <div className="approval-inline-conditions">
              <span><ApprovalIcon kind="payment" /><span><b>{isProforma ? "Payment terms" : "Ödeme koşulu"}</b><small>{form.paymentTerms.trim() || (isProforma ? "Not specified" : "Belirtilmedi")}</small></span></span>
              <span><ApprovalIcon kind="delivery" /><span><b>{isProforma ? "Delivery terms" : "Teslimat koşulu"}</b><small>{form.deliveryTerms.trim() || form.incoterm?.trim() || (isProforma ? "Not specified" : "Belirtilmedi")}</small></span></span>
            </div>
            {isProforma && !isCommercialInvoice && <div className="approval-bank-line"><b>Bank</b><span>{form.bankName || "-"} · SWIFT: {form.swiftCode || "-"} · IBAN: {form.iban || "-"}</span></div>}
          </div>
        )}
        {!isPackingList && (
          <div className="approval-totals">
            <span>{isProforma ? "Subtotal" : "Ara toplam"} <b><i>{dualMoney(totals.subtotal, form).primary}</i>{!isProforma && <small>{dualMoney(totals.subtotal, form).local}</small>}</b></span>
            {(form.overallDiscountRate || 0) > 0 && <span className="approval-discount-total">{isProforma ? "Discount" : "Genel iskonto"} %{form.overallDiscountRate} <b><i>-{dualMoney(totals.overallDiscount, form).primary}</i>{!isProforma && <small>-{dualMoney(totals.overallDiscount, form).local}</small>}</b></span>}
            <span>{isProforma ? "Tax" : vatRateLabel} <b><i>{dualMoney(totals.vat, form).primary}</i>{!isProforma && <small>{dualMoney(totals.vat, form).local}</small>}</b></span>
            <span>{isProforma ? (form.extraChargeLabel || "Additional charge") : "Ek masraf"} <b><i>{dualMoney(form.extraCharge, form).primary}</i>{!isProforma && <small>{dualMoney(form.extraCharge, form).local}</small>}</b></span>
            {isCommercialInvoice && totals.freight > 0 && <span>Freight <b><i>{dualMoney(totals.freight, form).primary}</i></b></span>}
            {isCommercialInvoice && totals.insurance > 0 && <span>Insurance <b><i>{dualMoney(totals.insurance, form).primary}</i></b></span>}
            <strong>{isProforma ? "Total" : "Genel toplam"} <b><i>{dualMoney(totals.total, form).primary}</i>{!isProforma && <small>{dualMoney(totals.total, form).local}</small>}</b></strong>
          </div>
        )}
        {isPackingList && (
          <div className="approval-commercial-panel approval-packing-shipment-panel">
            <div className="approval-condition-heading"><ApprovalIcon kind="delivery" /><span><b>Shipment details</b><small>Packing list reference information</small></span></div>
            <div className="approval-packing-shipment-grid">
              <span><small>Invoice no.</small>{form.invoiceNumber || "-"}</span>
              <span><small>Shipment date</small>{form.shipmentDate || form.date}</span>
              <span><small>Place of loading</small>{form.loadingPlace || form.shipmentPort || "-"}</span>
              <span><small>Destination</small>{form.destination || "-"}</span>
              <span><small>Delivery term</small>{form.incoterm || "-"}</span>
              <span><small>Country of origin</small>{form.countryOfOrigin || "-"}</span>
            </div>
          </div>
        )}
      </div>

      {isCommercialInvoice && (
        <div className="approval-commercial-tail">
          <section className="approval-commercial-panels">
            <div className="approval-general-terms approval-general-terms-main approval-commercial-terms-panel">
              <div className="approval-condition-heading"><ApprovalIcon kind="terms" /><span><b>Terms and export details</b><small>Commercial invoice conditions</small></span></div>
              <ul>{EXPORT_GENERAL_TERMS.map((term) => <li key={term}>{term}</li>)}</ul>
              <div className="approval-inline-conditions">
                <span><ApprovalIcon kind="payment" /><span><b>Payment terms</b><small>{form.paymentTerms.trim() || "Not specified"}</small></span></span>
                <span><ApprovalIcon kind="delivery" /><span><b>Delivery terms</b><small>{form.deliveryTerms.trim() || form.incoterm?.trim() || "Not specified"}</small></span></span>
              </div>
            </div>
            <div className="approval-commercial-panel approval-commercial-stamp-panel">
              <div className="approval-commercial-declaration">
                <div className="approval-condition-heading"><ApprovalIcon kind="note" /><span><b>Exporter declaration</b><small>Certified commercial invoice statement</small></span></div>
                <span>{form.exporterDeclaration || "-"}</span>
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
          </section>
        </div>
      )}

      {isPackingList && (
        <section className="approval-packing-approval-tail">
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
        </section>
      )}

      {!isCommercialInvoice && !isPackingList && (
        <section className="approval-document-conditions">
          <div className="approval-note-box approval-note-box-bottom">
            <ApprovalIcon kind="note" />
            <span><b>Ek not</b><small>{form.note || "Bu sipariş için ek not bulunmuyor."}</small></span>
          </div>
        </section>
      )}

      <footer className="approval-page-footer">
        <span>Powered by <AriXLogo /> <b>AriX</b> Sipariş sistemi</span>
        <span>Güvenli belge yönetimi &nbsp; | &nbsp; {new Date(form.date).getFullYear() || new Date().getFullYear()}</span>
      </footer>
    </article>
  );
}
