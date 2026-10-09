import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";

export type GibDocumentModel = {
  standard: string;
  ublVersion: string;
  customizationId: string;
  documentType: "eInvoice" | "eArchive" | "eDespatch" | "exportInvoice";
  profileId: string;
  typeCode: string;
  number: string;
  uuid: string;
  issueDate: string;
  issueTime: string;
  currency: string;
  supplier: { title: string; taxNumber: string; taxOffice: string; country: string; address: string; city: string; district: string; postalCode: string; email: string; phone: string };
  buyer: { name: string; taxNumber: string; originalTaxNumber: string; taxOffice: string; address: string; city?: string; countryCode?: string; countryName?: string; registrationName?: string; companyId?: string; email: string };
  accountingCustomer?: { title: string; taxNumber: string } | null;
  shipment: { actualDespatchDate?: string; actualDespatchTime?: string; carrierTaxNumber?: string; carrierName?: string; plate?: string; driverFirstName?: string; driverLastName?: string; driverNationalId?: string; deliveryAddress?: string };
  exportDetails?: { incoterm?: string; transportModeCode?: string; packageTypeCode?: string; packageId?: string; packageQuantity?: number; exchangeRate?: number; deliveryAddress?: string; countryName?: string };
  lines: Array<{ id: string; name: string; code: string; quantity: number; unit: string; unitCode: string; unitPrice: number; discountRate: number; taxRate: number; extensionAmount: number; taxAmount: number; gtip?: string }>;
  totals: { goodsTotal: number; taxTotal: number; taxInclusive: number; payable: number; discountTotal: number };
  taxBreakdown: Array<{ rate: number; taxableAmount: number; taxAmount: number }>;
  taxExemption?: { code: string; reason: string } | null;
  standards?: { ublTr: string; qr: string; signature: string };
  relatedDocuments?: Array<{ documentType: string; number: string; issueDate: string }>;
};

export type EDocumentArtifact = {
  model: GibDocumentModel;
  qrPayload: Record<string, string>;
  qrText: string;
  xml: string;
  draft: boolean;
  compliance?: {
    checks: Array<{ id: string; label: string; ok: boolean; detail: string }>;
    passed: number;
    total: number;
    readyForSigning: boolean;
    signatureState: string;
  };
};

const titles = {
  eInvoice: "e-FATURA",
  eArchive: "e-ARŞİV FATURA",
  eDespatch: "e-İRSALİYE",
  exportInvoice: "İHRACAT FATURASI",
};

const formatMoney = (value: number, currency: string) => `${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const formatQuantity = (value: number) => Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 3 });

export default function EDocumentPreviewDialog({ artifact, onClose }: { artifact: EDocumentArtifact; onClose: () => void }) {
  const [qrUrl, setQrUrl] = useState("");
  const model = artifact.model;
  const isDespatch = model.documentType === "eDespatch";
  const isExport = model.documentType === "exportInvoice";
  const relatedDespatch = model.relatedDocuments?.find((item) => item.documentType === "eDespatch");

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(artifact.qrText, { errorCorrectionLevel: "M", margin: 1, width: 240, color: { dark: "#111827", light: "#ffffff" } })
      .then((url) => { if (active) setQrUrl(url); });
    return () => { active = false; };
  }, [artifact.qrText]);

  const downloadXml = () => {
    const blob = new Blob([artifact.xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${model.number || "GIB-TASLAK"}.xml`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div className="fixed inset-0 z-[170] flex flex-col bg-slate-950/55 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="gib-preview-title">
      <style>{`@media print { body * { visibility: hidden !important; } .gib-document-print, .gib-document-print * { visibility: visible !important; } .gib-document-print { position: absolute !important; inset: 0 !important; width: 210mm !important; min-height: 297mm !important; margin: 0 !important; box-shadow: none !important; } @page { size: A4; margin: 0; } }`}</style>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/85 px-4 py-3 text-white print:hidden">
        <div>
          <div className="text-xs font-semibold text-slate-400">GİB UBL-TR önizləmə</div>
          <h2 id="gib-preview-title" className="mt-0.5 text-lg font-semibold">{titles[model.documentType]} · {model.number || "Taslak"}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={downloadXml} className="h-10 rounded-lg border border-white/20 px-4 text-sm font-semibold hover:bg-white/10">UBL-TR XML</button>
          <button type="button" onClick={() => window.print()} className="h-10 rounded-lg bg-indigo-500 px-4 text-sm font-semibold hover:bg-indigo-400">Çap et</button>
          <button type="button" onClick={onClose} aria-label="Bağla" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-xl hover:bg-white/10">×</button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">
        <article className="gib-document-print mx-auto min-h-[297mm] w-[210mm] min-w-[210mm] bg-white p-[7mm] font-[Arial] text-[9px] text-black shadow-2xl">
          {artifact.draft && <div className="mb-3 border border-amber-400 bg-amber-50 px-3 py-2 text-center font-semibold text-amber-900 print:hidden">TASLAK · GİB-ə göndərilməyib</div>}
          {artifact.compliance && (
            <div className={`mb-3 border px-3 py-3 print:hidden ${artifact.compliance.readyForSigning ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
              <div className="flex items-center justify-between gap-3"><b>GİB texniki ön yoxlama</b><span>{artifact.compliance.passed}/{artifact.compliance.total}</span></div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">{artifact.compliance.checks.map((check) => <div key={check.id} className="flex items-start gap-2 text-[9px]"><span className={check.ok ? "text-emerald-600" : "text-amber-700"}>{check.ok ? "✓" : "!"}</span><span><b>{check.label}:</b> {check.detail}</span></div>)}</div>
            </div>
          )}
          <div className="grid grid-cols-[1.25fr_.7fr_.85fr] items-start gap-7">
            <PartyBlock party={model.supplier} supplier />
            <DocumentEmblem label={titles[model.documentType]} isDespatch={isDespatch} />
            <div className="flex justify-end">
              {qrUrl ? <img src={qrUrl} alt="GİB karekod" className="h-[42mm] w-[42mm]" /> : <div className="flex h-[42mm] w-[42mm] items-center justify-center border text-[8px]">Karekod hazırlanır</div>}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[1.2fr_.8fr] items-end gap-9">
            <PartyBlock party={{ ...model.buyer, title: model.buyer.name }} />
            <DocumentMeta model={model} />
          </div>

          <div className="mt-4 border-t-2 border-black pt-2"><b>ETTN:</b> <span className="break-all">{model.uuid || "-"}</span></div>

          {isExport && (
            <div className="mt-4 grid grid-cols-2 border border-black bg-slate-50">
              <PrintMeta label="Gömrük alıcısı" value={model.accountingCustomer ? `${model.accountingCustomer.title} · ${model.accountingCustomer.taxNumber}` : "-"} />
              <PrintMeta label="Xarici alıcı" value={model.buyer.registrationName || model.buyer.name || "-"} />
              <PrintMeta label="Incoterms" value={model.exportDetails?.incoterm || "-"} />
              <PrintMeta label="Nəqliyyat" value={model.exportDetails?.transportModeCode || "-"} />
              <PrintMeta label="Qab" value={[model.exportDetails?.packageTypeCode, model.exportDetails?.packageId, model.exportDetails?.packageQuantity].filter(Boolean).join(" · ") || "-"} />
              <PrintMeta label="KDV istisnası" value={model.taxExemption ? `${model.taxExemption.code} · ${model.taxExemption.reason}` : "-"} />
            </div>
          )}

          <table className="mt-4 w-full table-fixed border-collapse">
            <thead>
              <tr className="bg-[#e4e7e9]">
                <PrintTh className="w-8">#</PrintTh>
                <PrintTh className="w-[18%]">Stok Kodu</PrintTh>
                <PrintTh>Mal / Hizmet</PrintTh>
                {isExport && <PrintTh className="w-[14%]">GTİP</PrintTh>}
                <PrintTh className="w-[15%]">Miktar</PrintTh>
                {isDespatch ? <><PrintTh className="w-[13%]">Etiket Numarası</PrintTh><PrintTh className="w-[14%]">Sonra Gönderilecek Miktar</PrintTh></> : <><PrintTh className="w-[14%]">Birim Fiyat</PrintTh><PrintTh className="w-[10%]">KDV Oranı</PrintTh><PrintTh className="w-[13%]">KDV Tutarı</PrintTh><PrintTh className="w-[14%]">Tutar</PrintTh>{relatedDespatch && <PrintTh className="w-[15%]">İrsaliye No</PrintTh>}</>}
              </tr>
            </thead>
            <tbody>
              {model.lines.map((line) => (
                <tr key={line.id}>
                  <PrintTd>{line.id}</PrintTd>
                  <PrintTd>{line.code || "-"}</PrintTd>
                  <PrintTd>{line.name}</PrintTd>
                  {isExport && <PrintTd>{line.gtip || "-"}</PrintTd>}
                  <PrintTd>{formatQuantity(line.quantity)} {line.unit}</PrintTd>
                  {isDespatch ? <><PrintTd>-</PrintTd><PrintTd>-</PrintTd></> : <><PrintTd>{formatMoney(line.unitPrice, model.currency)}</PrintTd><PrintTd>%{line.taxRate}</PrintTd><PrintTd>{formatMoney(line.taxAmount, model.currency)}</PrintTd><PrintTd>{formatMoney(line.extensionAmount, model.currency)}</PrintTd>{relatedDespatch && <PrintTd>{relatedDespatch.number}</PrintTd>}</>}
                </tr>
              ))}
            </tbody>
          </table>

          {isDespatch ? (
            <DespatchFooter model={model} />
          ) : (
            <InvoiceFooter model={model} />
          )}

          <div className="mt-8 border-t border-black pt-2 text-[8px] leading-4 text-slate-600 print:hidden">
            UBL-TR {model.customizationId} · GİB Karekod Standardı v1.2 · Rəsmi göndərişdə provayder XAdES-BES mali möhür/e-imza əlavə etməlidir.
          </div>
        </article>
      </div>
    </div>,
    document.body,
  );
}

type PrintableParty = {
  title?: string;
  name?: string;
  taxNumber?: string;
  originalTaxNumber?: string;
  taxOffice?: string;
  address?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  email?: string;
  phone?: string;
};

function displayDate(value?: string) {
  const date = String(value ?? "").slice(0, 10).split("-");
  return date.length === 3 ? `${date[2]}-${date[1]}-${date[0]}` : value || "-";
}

function PartyBlock({ party, supplier = false }: { party: PrintableParty; supplier?: boolean }) {
  const taxNumber = party.originalTaxNumber || party.taxNumber || "-";
  return (
    <section className="border-y-2 border-black py-2 leading-[1.25]">
      {!supplier && <div className="mb-1 font-bold">SAYIN</div>}
      <div className="text-[12px] font-bold uppercase">{party.title || party.name || "-"}</div>
      <div className="mt-1">Adres: {party.address || "-"}</div>
      <div>{[party.postalCode, party.district, party.city].filter(Boolean).join(" / ") || "-"}</div>
      {party.phone && <div className="mt-1">Tel: {party.phone}</div>}
      {party.email && <div>E-Posta: {party.email}</div>}
      <div className="mt-1">Vergi Dairesi: {party.taxOffice || "-"}</div>
      <div>VKN/TCKN: {taxNumber}</div>
    </section>
  );
}

function DocumentEmblem({ label, isDespatch }: { label: string; isDespatch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <img src={isDespatch ? "/gib/e-irsaliye.jpg" : "/gib/e-fatura.jpg"} alt="Gelir İdaresi Başkanlığı" className="h-20 w-20 object-contain" />
      <div className="mt-1 text-[11px] font-bold">{label}</div>
    </div>
  );
}

function DocumentMeta({ model }: { model: GibDocumentModel }) {
  const isDespatch = model.documentType === "eDespatch";
  const relatedDespatch = model.relatedDocuments?.find((item) => item.documentType === "eDespatch");
  const rows = isDespatch
    ? [
        ["Özelleştirme No", model.customizationId],
        ["Senaryo", model.profileId],
        ["İrsaliye Tipi", model.typeCode],
        ["İrsaliye No", model.number || "-"],
        ["İrsaliye Tarihi", displayDate(model.issueDate)],
        ["İrsaliye Zamanı", model.issueTime || "-"],
        ["Sevk Tarihi", displayDate(model.shipment.actualDespatchDate || model.issueDate)],
        ["Sevk Zamanı", model.shipment.actualDespatchTime || model.issueTime || "-"],
      ]
    : [
        ["Özelleştirme No", model.customizationId],
        ["Fatura Tipi", model.typeCode],
        ["Fatura No", model.number || "-"],
        ["Fatura Tarihi", displayDate(model.issueDate)],
        ["Fatura Zamanı", model.issueTime || "-"],
        ["Senaryo", model.profileId],
        ...(relatedDespatch ? [["İrsaliye No", relatedDespatch.number], ["İrsaliye Tarihi", displayDate(relatedDespatch.issueDate)]] : []),
      ];

  return (
    <table className="w-full border-collapse text-[8px]">
      <tbody>{rows.map(([label, value]) => <tr key={label}><td className="w-[48%] border border-black bg-[#e4e7e9] px-1 py-0.5 font-bold">{label} :</td><td className="border border-black px-1 py-0.5">{value}</td></tr>)}</tbody>
    </table>
  );
}

function PrintMeta({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[100px_1fr] border-b border-r border-black px-2 py-1"><b>{label}</b><span>{value}</span></div>;
}

function PrintTh({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`border border-black px-1 py-1.5 text-center align-middle font-bold ${className}`}>{children}</th>;
}

function PrintTd({ children }: { children?: ReactNode }) {
  return <td className="border border-black px-1 py-1 align-top">{children}</td>;
}

function DespatchFooter({ model }: { model: GibDocumentModel }) {
  const driver = [model.shipment.driverFirstName, model.shipment.driverLastName].filter(Boolean).join(" ") || "-";
  return (
    <>
      <div className="mt-16 text-[11px] font-bold">İlgili Dokümanlar</div>
      <table className="w-full border-collapse text-[8px]">
        <thead><tr className="bg-[#e4e7e9]"><PrintTh>Doküman No</PrintTh><PrintTh className="w-28">Tarih</PrintTh><PrintTh className="w-28">Doküman Tipi</PrintTh><PrintTh className="w-28">Açıklama</PrintTh></tr></thead>
        <tbody><tr><PrintTd>{model.uuid || "-"}</PrintTd><PrintTd>{displayDate(model.issueDate)}</PrintTd><PrintTd>XSLT</PrintTd><PrintTd /></tr></tbody>
      </table>
      <div className="mt-8 grid grid-cols-2 border border-black">
        <section className="min-h-28 border-r border-black p-1.5">
          <div className="border-b border-black font-bold">Açıklamalar</div>
          <div className="mt-5"><b>Asıl Alıcı VKN:</b> {model.buyer.originalTaxNumber || model.buyer.taxNumber || "-"}</div>
          <div><b>Asıl Alıcı Ünvan:</b> {model.buyer.name || "-"}</div>
          <div><b>Teslimat Adresi:</b> {model.shipment.deliveryAddress || model.buyer.address || "-"}</div>
        </section>
        <section className="min-h-28 p-1.5">
          <div className="border-b border-black font-bold">Taşıyıcı Bilgileri</div>
          <div className="mt-5"><b>Taşıyıcı:</b> {model.shipment.carrierName || "-"} {model.shipment.carrierTaxNumber ? `· ${model.shipment.carrierTaxNumber}` : ""}</div>
          <div><b>Araç plaka numarası:</b> {model.shipment.plate || "-"}</div>
          <div><b>Şoför:</b> {driver}, TCKN: {model.shipment.driverNationalId || "-"}</div>
        </section>
      </div>
    </>
  );
}

function InvoiceFooter({ model }: { model: GibDocumentModel }) {
  return (
    <>
      <table className="mt-3 ml-auto w-[44%] border-collapse text-[8px]">
        <tbody>
          <SummaryRow label="Mal Hizmet Toplam Tutarı" value={formatMoney(model.totals.goodsTotal, model.currency)} />
          <SummaryRow label="Toplam İskonto" value={formatMoney(model.totals.discountTotal, model.currency)} />
          {model.taxBreakdown.map((tax) => <SummaryRow key={tax.rate} label={`Hesaplanan KDV (%${tax.rate})`} value={formatMoney(tax.taxAmount, model.currency)} />)}
          <SummaryRow label="Vergiler Dahil Toplam Tutar" value={formatMoney(model.totals.taxInclusive, model.currency)} />
          <SummaryRow label="Ödenecek Tutar" value={formatMoney(model.totals.payable, model.currency)} strong />
        </tbody>
      </table>
      <div className="mt-3 border border-black p-1.5"><b>Fatura Açıklaması:</b><div>{model.documentType === "exportInvoice" ? "KDV istisnası: 301 · 11/1-a Mal ihracatı" : "-"}</div></div>
    </>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <tr className={strong ? "font-bold" : ""}><td className="border border-black bg-[#e4e7e9] px-1 py-1 font-bold">{label}</td><td className="border border-black px-1 py-1">{value}</td></tr>;
}
