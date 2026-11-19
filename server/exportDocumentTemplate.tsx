// Export-only PDF template. Domestic rendering stays in App.tsx.
// @ts-nocheck
import React, { Fragment } from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FileText,CalendarDays,UserRound,Layers3,CircleDollarSign,Building2,NotepadText,ListChecks,HandCoins,Truck,Check} from 'lucide-react';
import AriXLogo from '../src/components/AriXLogo';
import css from '../order-app/src/styles.css';
import { matchOrderFormItems } from '../shared/orderFormItems.js';
const EXPORT_GENERAL_TERMS = [
  "Prices and amounts are stated in the currency shown on this proforma invoice.",
  "Bank charges outside Türkiye are payable by the buyer.",
  "Delivery, cost and risk responsibilities are governed by the stated Incoterms® 2020 rule.",
  "Final quantities and shipment details will be confirmed on the commercial invoice and packing list.",
] as const;

const DEFAULT_PROFORMA_NOTE = "We hereby confirm that the information stated in this Proforma Invoice is accurate and complete to the best of our knowledge.";

function formatMoney(value: number, currency: ApprovalForm["currency"]) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
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
    const billableQuantity = approvalLineBillableQuantity(line);
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

function approvalLineInnerQuantity(line: ApprovalFormLine) {
  return Math.max(0, Number(line.innerQuantity ?? line.unitsPerBox) || 0);
}

function approvalLineInnerUnit(line: ApprovalFormLine): ApprovalFormLine["innerUnit"] | undefined {
  const innerQuantity = approvalLineInnerQuantity(line);
  if (innerQuantity <= 0) return line.innerUnit;
  return line.innerUnit ?? (line.unit === "BOX" ? "PCS" : (line.unit === "BUCKET" ? "KG" : undefined));
}

function approvalLineHasPackageContent(line: ApprovalFormLine) {
  return Boolean(line.manual && approvalLineInnerQuantity(line) > 0 && approvalLineInnerUnit(line));
}

function approvalLineUsesContentPrice(line: ApprovalFormLine) {
  return line.priceBasis === "CONTENT" || line.priceBasis === "PCS";
}

function approvalLineBillableQuantity(line: ApprovalFormLine) {
  const unit = line.unit ?? "M2";
  if (unit === "M2") return line.quantity * (Number(line.width) || 1.42);
  if (line.manual && approvalLineUsesContentPrice(line) && approvalLineInnerQuantity(line) > 0) {
    return line.quantity * approvalLineInnerQuantity(line);
  }
  return line.quantity;
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
    if (totalRolls === 0 && pallets.length) pallets[pallets.length - 1].items.push({ line, lineIndex, rolls: 0, quantity: Number(line.quantity || 0) });
  });
  return pallets;
}

function packingAllocationsFromPlan(lines: ApprovalFormLine[], distribution: number[]): Array<Array<{ lineIndex: number; rolls: number; quantity?: number; netWeight?: number }>> {
  return packingPalletPlan(lines, distribution).map((pallet) => pallet.items
    .filter((item) => item.rolls > 0 || Number(item.quantity || 0) > 0)
    .map((item) => ({ lineIndex: item.lineIndex, rolls: item.rolls, quantity: item.quantity, netWeight: undefined })));
}

function lineHasRolls(line?: ApprovalFormLine) {
  if (!line) return false;
  return Math.max(0, Math.trunc(Number(line.rollCount) || 0)) > 0 || (line.unit as string) === "ROLL" || (line.unit as string) === "rulo";
}

function computePalletItemWeights(
  items: Array<{ line: ApprovalFormLine; lineIndex: number; rolls: number; quantity: number; netWeight?: number }>,
  detail: { grossWeight: number; tareWeight: number }
): ComputedPalletItemWeight[] {
  const palletGross = Math.max(0, Number(detail?.grossWeight) || 0);
  const palletTare = Math.max(0, Number(detail?.tareWeight) || 0);
  const palletNet = Math.max(0, palletGross - palletTare);

  const itemConfigs = items.map((item) => {
    if (item.netWeight != null && !Number.isNaN(Number(item.netWeight)) && Number(item.netWeight) > 0) {
      return { fixedNet: Number(item.netWeight), isManual: true, isKg: false };
    }

    const line = item.line;
    const isDirectKg = line.unit === "KG" || (line.unit as string)?.toLowerCase() === "kg";
    const innerUnit = approvalLineInnerUnit(line);
    const innerQty = approvalLineInnerQuantity(line);
    const isInnerKg = (innerUnit === "KG" || (innerUnit as string)?.toLowerCase() === "kg") && innerQty > 0;

    if (isDirectKg) {
      return { fixedNet: Number(item.quantity) || 0, isManual: false, isKg: true };
    }
    if (isInnerKg) {
      return { fixedNet: Number((Number(item.quantity || 0) * innerQty).toFixed(3)), isManual: false, isKg: true };
    }

    return { fixedNet: null, isManual: false, isKg: false };
  });

  const totalFixedNet = itemConfigs.reduce((sum, cfg) => sum + (cfg.fixedNet ?? 0), 0);
  const nonFixedItems = items.filter((_, idx) => itemConfigs[idx].fixedNet == null);
  const nonFixedQtySum = nonFixedItems.reduce((sum, it) => sum + Math.max(0, Number(it.quantity) || 0), 0);
  const remainingNet = Math.max(0, palletNet - totalFixedNet);

  return items.map((item, idx) => {
    const cfg = itemConfigs[idx];
    let net = 0;
    if (cfg.fixedNet != null) {
      net = cfg.fixedNet;
    } else if (nonFixedQtySum > 0 && remainingNet > 0) {
      const ratio = Math.max(0, Number(item.quantity) || 0) / nonFixedQtySum;
      net = Number((remainingNet * ratio).toFixed(2));
    }

    const gross = palletNet > 0
      ? Number(((net / palletNet) * palletGross).toFixed(2))
      : (items.length > 0 ? Number((palletGross / items.length).toFixed(2)) : 0);

    return {
      netWeight: net,
      grossWeight: gross,
      isFixed: cfg.fixedNet != null,
      isIntrinsicKg: cfg.isKg,
      isManual: cfg.isManual,
    };
  });
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
export function exportHtml(order, saved, printSettings, products=[]) {
 const form=structuredClone(saved);
 if (!['proforma','commercial_invoice','packing_list'].includes(form.documentType)) throw new Error('Yalnız yurtdışı belge oluşturulabilir.');
 const sourceItems=Array.isArray(order.items)?order.items:[];
 const matches=matchOrderFormItems(form.lines,sourceItems);
 form.lines=form.lines.map((line,index)=> {
   if (Number(line.rollCount)>0) return line;
   const source=sourceItems[matches[index]];
   const rolls=Number(source?.preparedRollCount)>0?Number(source.preparedRollCount):Number(source?.orderedRollCount)||0;
   return {...line,rollCount:rolls};
 });
 const isProforma=true, isPackingList=form.documentType==='packing_list', isCommercialInvoice=form.documentType==='commercial_invoice', isProformaDocument=form.documentType==='proforma';
 const labels={}, domesticUnitLabels={}, DOMESTIC_GENERAL_TERMS=[], ratePublicationDate='', vatRateLabel='';
 const exportUnitLabels={M2:'m²',M:'m',ROLL:'roll',BOX:'box',BUCKET:'bucket',PCS:'pcs',KG:'kg',LT:'lt',ML:'ml',GR:'g',SET:'set',PALLET:'pallet',BAG:'bag',CRATE:'crate',BUNDLE:'bundle'};
 const totals=approvalTotals(form);
 const hasNestedExportPackages=form.lines.some(approvalLineHasPackageContent);
 const packingDistribution=form.palletDistribution || [];
 const packingPalletDetails=form.palletDetails || [];
 const packingPlan=(form.palletAllocations || []).map((items,index)=>({number:index+1,rollCount:items.reduce((s,e)=>s+e.rolls,0),items:items.map(e=>({line:form.lines[e.lineIndex],lineIndex:e.lineIndex,rolls:e.rolls,quantity:Number(e.quantity),netWeight:e.netWeight}))}));
 const palletCalculatedWeights=packingPlan.map((p,i)=>computePalletItemWeights(p.items,packingPalletDetails[i]));
 const packingTotalNetWeight=packingPalletDetails.reduce((s,d)=>s+d.grossWeight-d.tareWeight,0);
 const packingTotalGrossWeight=packingPalletDetails.reduce((s,d)=>s+d.grossWeight,0);
 const exportTableRowCount = isPackingList
   ? (packingPlan.length > 0 ? packingPlan.reduce((s, p) => s + 1 + p.items.length, 0) : form.lines.length)
   : form.lines.length;
 const isSinglePageFit = form.pageFit === 'single';
 const isForcedMultiPage = form.pageFit === 'multi';
 const isMultiPage = isForcedMultiPage || (!isSinglePageFit && exportTableRowCount > 10);
 const exportExtraChargeLabel=form.extraChargeLabel?.trim().toLocaleLowerCase('tr-TR')==='nakliye / ek ücret'?'Freight / additional charge':form.extraChargeLabel;
 const exportDocumentTitle=isCommercialInvoice?'Commercial Invoice':isPackingList?'Packing List':'Proforma Invoice';
 const content=renderToStaticMarkup(<article className={`approval-paper ${!isMultiPage ? 'is-single-page-fit' : 'is-multi-page'}`} lang={isProforma ? "en" : "tr"}>
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
                <div><ApprovalIcon kind="document" /><span><small>{form.documentType === "commercial_invoice" ? "COMMERCIAL INVOICE NUMBER" : form.documentType === "packing_list" ? "PACKING LIST NUMBER" : isProforma ? "PROFORMA NUMBER" : "FORM NO"}</small><b>{form.number}</b><em>{order.number}</em></span></div>
                <div><ApprovalIcon kind="calendar" /><span><small>{form.documentType === "commercial_invoice" || form.documentType === "packing_list" ? "SHIPMENT DATE" : (isProforma ? "ISSUE DATE" : "BELGE TARİHİ")}</small><b>{form.documentType === "commercial_invoice" || form.documentType === "packing_list" ? (form.shipmentDate || form.date) : form.date}</b>{(form.documentType === "commercial_invoice" || form.documentType === "packing_list") && form.date ? <em>Proforma date: {form.date}</em> : null}</span></div>
                <div><ApprovalIcon kind="representative" /><span><small>{isProforma ? "SALES REPRESENTATIVE" : "SATIŞ TEMSİLCİSİ"}</small><b>{form.salesRepresentative || "-"}</b></span></div>
                <div><ApprovalIcon kind="source" /><span><small>{isProforma ? "INVOICE NUMBER" : "KAYNAK"}</small><b>{isProforma ? (form.invoiceNumber || "-") : "ERSA DEPO"}</b></span></div>
                <div><ApprovalIcon kind="currency" /><span><small>{isProforma ? "CURRENCY" : "KUR"}</small><b>{isProforma ? form.currency : (form.currency === "TRY" ? "TL · 1" : `${form.currency} · ${form.exchangeRate}`)}</b>{!isProforma && form.currency !== "TRY" && ratePublicationDate && <em>({ratePublicationDate})</em>}</span></div>
              </div>
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
                  <th>{isPackingList || hasNestedExportPackages ? "Packages" : isProforma ? "Rolls" : "Rulo"}</th>
                  <th>{isProforma ? (hasNestedExportPackages ? "Contents / Unit" : "Quantity / Unit") : "Miktar"}</th>
                  <th>{isPackingList ? "Net Weight" : isProforma ? "Unit Price" : "m² Fiyatı"}</th>
                  <th>{isPackingList ? "Gross Weight" : isProforma ? "Amount" : "Toplam"}</th>
                </tr>
              </thead>
              <tbody>
                {isPackingList ? packingPlan.map((pallet, pIdx) => {
                  const detail = packingPalletDetails[pIdx];
                  const palletNet = Math.max(0, detail.grossWeight - detail.tareWeight);
                  const palletWeights = palletCalculatedWeights[pIdx] ?? [];
                  return <Fragment key={`pallet-${pallet.number}`}>
                  <tr className="approval-pallet-row">
                    <td colSpan={2}><b>PALLET {pallet.number}</b></td>
                    <td><b>{pallet.rollCount > 0 ? `${pallet.rollCount} rolls` : ""}</b></td>
                    <td className="approval-pallet-dimensions-cell"><span>{detail.lengthCm} × {detail.widthCm} × {detail.heightCm}</span><small>cm · L × W × H</small></td>
                    <td><b>{palletNet.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                    <td><b>{detail.grossWeight.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                  </tr>
                  {pallet.items.map((item, itemIndex) => {
                    const itemWeight = palletWeights[itemIndex] ?? { netWeight: 0, grossWeight: 0 };
                    const hasRolls = lineHasRolls(item.line) || item.rolls > 0;
                    return <tr key={`${pallet.number}-${item.lineIndex}-${itemIndex}`}>
                    <td>{item.lineIndex + 1}</td>
                    <td><b>{item.line.productName}</b><small>{item.line.productCode}</small></td>
                    <td>{hasRolls ? `${item.rolls} ${item.rolls === 1 ? "roll" : "rolls"}` : `${item.quantity.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${exportUnitLabels[item.line.unit ?? "PCS"]}`}</td>
                    <td className="approval-quantity-cell">{hasRolls ? <b>{item.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m</b> : (approvalLineHasPackageContent(item.line) ? <><b>{(item.quantity * approvalLineInnerQuantity(item.line)).toLocaleString("en-US", { maximumFractionDigits: 3 })} {exportUnitLabels[approvalLineInnerUnit(item.line) ?? "PCS"]}</b><small>{approvalLineInnerQuantity(item.line).toLocaleString("en-US", { maximumFractionDigits: 3 })} {exportUnitLabels[approvalLineInnerUnit(item.line) ?? "PCS"]} / {exportUnitLabels[item.line.unit ?? "PCS"]}</small></> : <b>{item.quantity.toLocaleString("en-US", { maximumFractionDigits: 3 })} {exportUnitLabels[item.line.unit ?? "PCS"]}</b>)}</td>
                    <td><b>{itemWeight.netWeight.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                    <td><b>{itemWeight.grossWeight.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                  </tr>;})}
                </Fragment>}) : form.lines.map((line, index) => {
                  const catalogLine = products.some((product) =>
                    (line.productId != null && String(product.id) === String(line.productId)) ||
                    (Boolean(line.productCode?.trim()) && [product.code, product.sku].some((code) => code?.trim().toLocaleUpperCase("tr") === line.productCode.trim().toLocaleUpperCase("tr"))));
                  const showExternalUnits = line.manual === true && !catalogLine;
                  const squareMeters =
                    line.quantity * (Number(line.width) || 1.42);
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
                      <td>{isProforma && showExternalUnits && approvalLineHasPackageContent(line) ? <>{line.quantity.toLocaleString(isProforma ? "en-US" : "tr-TR", { maximumFractionDigits: 3 })} {(isProforma ? exportUnitLabels : domesticUnitLabels)[exportUnit]}</> : (Number(line.rollCount) > 0 ? (isProforma ? <>{line.rollCount} rolls</> : line.rollCount) : "")}{isCommercialInvoice && !approvalLineHasPackageContent(line) && (line.manual || Number(line.rollCount) <= 0) && Number(line.packageCount) > 0 && <small>{line.packageCount} packages</small>}</td>
                      <td className="approval-quantity-cell">
                        {isProforma && showExternalUnits ? (approvalLineHasPackageContent(line) ? <><b>{(line.quantity * approvalLineInnerQuantity(line)).toLocaleString(isProforma ? "en-US" : "tr-TR", { maximumFractionDigits: 3 })} {(isProforma ? exportUnitLabels : domesticUnitLabels)[approvalLineInnerUnit(line) ?? "PCS"]}</b><small>{approvalLineInnerQuantity(line).toLocaleString(isProforma ? "en-US" : "tr-TR", { maximumFractionDigits: 3 })} {(isProforma ? exportUnitLabels : domesticUnitLabels)[approvalLineInnerUnit(line) ?? "PCS"]} / {(isProforma ? exportUnitLabels : domesticUnitLabels)[exportUnit]}</small></> : <b>{line.quantity.toLocaleString(isProforma ? "en-US" : "tr-TR", { maximumFractionDigits: 3 })} {(isProforma ? exportUnitLabels : domesticUnitLabels)[exportUnit]}{line.innerUnit ? ` (${(isProforma ? exportUnitLabels : domesticUnitLabels)[line.innerUnit]})` : ""}</b>) : <><b>{squareMeters.toLocaleString(isProforma ? "en-US" : "tr-TR", { maximumFractionDigits: 2 })} m²</b><small>{line.quantity} {isProforma ? "m" : "mt"}</small></>}
                      </td>
                      <td>
                        <>
                        <b>{price.primary}</b>
                        {isProforma && showExternalUnits && <small>{isProforma ? `per ${approvalLineHasPackageContent(line) && approvalLineUsesContentPrice(line) ? exportUnitLabels[approvalLineInnerUnit(line) ?? "PCS"] : exportUnitLabels[exportUnit]}` : `/ ${approvalLineHasPackageContent(line) && approvalLineUsesContentPrice(line) ? domesticUnitLabels[approvalLineInnerUnit(line) ?? "PCS"] : domesticUnitLabels[exportUnit]}`}</small>}
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
              {isPackingList && <tfoot className="approval-packing-totals">
                <tr>
                  <td colSpan={4}><b>TOTAL WEIGHT</b><small>{packingDistribution.length} pallets · {packingDistribution.reduce((sum, value) => sum + value, 0)} rolls</small></td>
                  <td><small>Total net</small><b>{packingTotalNetWeight.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                  <td><small>Total gross</small><b>{packingTotalGrossWeight.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></td>
                </tr>
              </tfoot>}
            </table>
            {isMultiPage && (
              <footer className="approval-page-footer approval-page-1-footer">
                <span>Powered by <AriXLogo /> <b>AriX</b> {isProforma ? "Order system" : "Sipariş sistemi"}</span>
                <span className="approval-footer-page-tag">{isProforma ? "Page 1 / 2" : "Sayfa 1 / 2"}</span>
                <span>{isProforma ? "Secure document management" : "Güvenli belge yönetimi"} &nbsp; | &nbsp; {new Date(form.date).getFullYear() || new Date().getFullYear()}</span>
              </footer>
            )}
            {isMultiPage && (
              <div className="approval-running-header">
                <div className="approval-running-brand">
                  {printSettings.companyLogo ? (
                    <img className="approval-running-logo" src={printSettings.companyLogo} alt={printSettings.companyName} />
                  ) : (
                    <span className="approval-running-monogram">{printSettings.companyName.slice(0, 2).toUpperCase()}</span>
                  )}
                  <span>
                    <b>{printSettings.companyName}</b> · {exportDocumentTitle}
                  </span>
                </div>
                <div className="approval-running-meta">
                  <span><b>{form.number}</b> · {form.documentType === "commercial_invoice" || form.documentType === "packing_list" ? (form.shipmentDate || form.date) : form.date}</span>
                  <span className="approval-running-page-badge">{isProforma ? "Page 2 / 2" : "Sayfa 2 / 2"}</span>
                </div>
              </div>
            )}
            <div className={`approval-bottom-grid ${isMultiPage ? "approval-detail-page-break" : ""}`}>
              {isCommercialInvoice || isProformaDocument ? <div className={`approval-commercial-panel approval-commercial-shipment-panel${isProforma ? " approval-proforma-shipment-panel" : ""}`}>
                <div className="approval-condition-heading"><ApprovalIcon kind="delivery" /><span><b>{isProformaDocument ? "Proforma & shipment details" : "Shipment & customs"}</b><small>{isProformaDocument ? "Package, delivery and origin information" : "Transport, package and customs details"}</small></span></div>
                <div className="approval-commercial-panel-grid">
                  {isProformaDocument ? <>
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
                  </>}
                </div>
              </div> : isPackingList ? <div className="approval-commercial-panel approval-packing-summary-panel">
                <div className="approval-condition-heading"><ApprovalIcon kind="terms" /><span><b>Packing summary</b><small>Pallet, roll and weight totals</small></span></div>
                <div className="approval-packing-summary-grid">
                  <span><small>Total pallets</small><b>{packingDistribution.length}</b></span>
                  <span><small>Total rolls</small><b>{packingDistribution.reduce((sum, value) => sum + value, 0)}</b></span>
                  <span><small>Total net weight</small><b>{packingTotalNetWeight.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></span>
                  <span><small>Total gross weight</small><b>{packingTotalGrossWeight.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg</b></span>
                </div>
              </div> : <div className="approval-general-terms approval-general-terms-main">
                <div className="approval-condition-heading">
                  <ApprovalIcon kind="terms" />
                  <span>
                    <b>{isProforma ? "Terms and export details" : "Genel koşullar"}</b>
                    <small>{isProformaDocument ? "Proforma invoice conditions" : "Yurtiçi satış koşulları"}</small>
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
              {isPackingList && <div className="approval-commercial-panel approval-packing-declaration-panel">
                <div className="approval-condition-heading"><ApprovalIcon kind="note" /><span><b>Packing declaration</b><small>Shipment contents confirmation</small></span></div>
                <span>We hereby certify that the packages, quantities and weights stated in this packing list are true and correct.</span>
              </div>}
            </div>
            {!isPackingList && (isCommercialInvoice || isProforma) && <div className="approval-commercial-tail"><section className="approval-commercial-panels">
              <div className="approval-general-terms approval-general-terms-main approval-commercial-terms-panel">
                <div className="approval-condition-heading"><ApprovalIcon kind="terms" /><span><b>Terms and export details</b><small>{isProformaDocument ? "Proforma invoice conditions" : "Commercial invoice conditions"}</small></span></div>
                <ul>{EXPORT_GENERAL_TERMS.map((term) => <li key={term}>{term}</li>)}</ul>
                <div className="approval-inline-conditions">
                  <span><ApprovalIcon kind="payment" /><span><b>Payment terms</b><small>{form.paymentTerms.trim() || "Not specified"}</small></span></span>
                  <span><ApprovalIcon kind="delivery" /><span><b>Delivery terms</b><small>{form.deliveryTerms.trim() || form.incoterm?.trim() || "Not specified"}</small></span></span>
                </div>
              </div>
              <div className="approval-commercial-panel approval-commercial-stamp-panel">
                <div className="approval-commercial-declaration">
                  <div className="approval-condition-heading"><ApprovalIcon kind="note" /><span><b>{isProformaDocument ? "Proforma invoice note" : "Exporter declaration"}</b><small>{isProformaDocument ? "Additional information" : "Certified commercial invoice statement"}</small></span></div>
                  <span>{isProformaDocument ? (form.note || DEFAULT_PROFORMA_NOTE) : (form.exporterDeclaration || "-")}</span>
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
              <div className="approval-commercial-panel approval-commercial-stamp-panel">
                <div className="approval-commercial-stamp">
                  <div className="approval-condition-heading"><ApprovalIcon kind="company" /><span><b>Authorized signature / stamp</b><small>Exporter approval</small></span></div>
                  {printSettings.companyStamp ? <img src={printSettings.companyStamp} alt="Company stamp and signature" /> : <span>Stamp / signature</span>}
                </div>
              </div>
            </section>}
            {!isCommercialInvoice && !isPackingList && !isProforma && <section className="approval-document-conditions">
              <div className="approval-note-box approval-note-box-bottom">
                <ApprovalIcon kind="note" />
                <span>
                  <b>{isProforma ? "Additional note" : "Ek not"}</b>
                  <small>{form.note || (isProforma ? "No additional note for this order." : "Bu sipariş için ek not bulunmuyor.")}</small>
                </span>
              </div>
            </section>}
            <footer className={`approval-page-footer ${isMultiPage ? "approval-page-2-footer" : ""}`}>
              <span>Powered by <AriXLogo /> <b>AriX</b> {isProforma ? "Order system" : "Sipariş sistemi"}</span>
              <span className="approval-footer-page-tag">{isMultiPage ? (isProforma ? "Page 2 / 2" : "Sayfa 2 / 2") : (isProforma ? "Page 1 / 1" : "Sayfa 1 / 1")}</span>
              <span>{isProforma ? "Secure document management" : "Güvenli belge yönetimi"} &nbsp; | &nbsp; {new Date(form.date).getFullYear() || new Date().getFullYear()}</span>
            </footer>
          </article>);
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+exportDocumentTitle+'</title><style>'+css+' body { background: #fff !important; } </style></head><body>'+content+'</body></html>';
}
export {approvalTotals,computePalletItemWeights};
