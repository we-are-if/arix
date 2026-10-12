import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import AriXLogo from "./AriXLogo";

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
  note?: string;
  currency: string;
  supplier: { title: string; taxNumber: string; taxOffice: string; country: string; address: string; city: string; district: string; postalCode: string; email: string; phone: string; fax?: string; website?: string; bankAccounts?: Array<{ bank: string; currency: string; iban: string }> };
  buyer: { name: string; taxNumber: string; originalTaxNumber: string; taxOffice: string; address: string; city?: string; countryCode?: string; countryName?: string; registrationName?: string; companyId?: string; email: string; phone?: string; fax?: string };
  accountingCustomer?: { title: string; taxNumber: string } | null;
  shipment: { actualDespatchDate?: string; actualDespatchTime?: string; carrierTaxNumber?: string; carrierName?: string; plate?: string; driverFirstName?: string; driverLastName?: string; driverNationalId?: string; deliveryAddress?: string };
  exportDetails?: { incoterm?: string; transportModeCode?: string; packageTypeCode?: string; packageId?: string; packageQuantity?: number; exchangeRate?: number; deliveryAddress?: string; countryName?: string };
  lines: Array<{ id: string; name: string; code: string; quantity: number; unit: string; unitCode: string; unitPrice: number; discountRate: number; taxRate: number; extensionAmount: number; taxAmount: number; gtip?: string; labelNumber?: string; outstandingQuantity?: number }>;
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
  companyLogo?: string;
  companyStamp?: string;
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
  exportInvoice: "e-FATURA",
};

const formatMoney = (value: number, currency: string) => `${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const formatQuantity = (value: number) => Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 3 });

export default function EDocumentPreviewDialog({ artifact, onClose }: { artifact: EDocumentArtifact; onClose: () => void }) {
  const [qrUrl, setQrUrl] = useState("");
  const model = artifact.model;
  const isDespatch = model.documentType === "eDespatch";
  const isExport = model.documentType === "exportInvoice";
  const documentLabel = isDespatch ? "İrsaliye" : "Fatura";
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
    <div className="gib-print-portal fixed inset-0 z-[170] flex flex-col bg-slate-950/55 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="gib-preview-title">
      <style>{`@media print {
        @page { size: A4; margin: 0; }
        html, body { width: 210mm !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
        body > * { display: none !important; }
        body > .gib-print-portal { display: block !important; position: static !important; width: 210mm !important; height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; }
        .gib-print-scroll { display: block !important; position: static !important; height: auto !important; min-height: 0 !important; overflow: visible !important; padding: 0 !important; }
        .gib-document-print { position: static !important; width: 210mm !important; min-width: 0 !important; min-height: 0 !important; margin: 0 !important; box-shadow: none !important; break-after: auto !important; }
      }`}</style>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/85 px-4 py-3 text-white print:hidden">
        <div>
          <div className="text-xs font-semibold text-slate-400">GİB texniki önizləmə</div>
          <h2 id="gib-preview-title" className="mt-0.5 text-lg font-semibold">{titles[model.documentType]} · {model.number || "Taslak"}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={downloadXml} className="h-10 rounded-lg border border-white/20 px-4 text-sm font-semibold hover:bg-white/10">XML endir</button>
          <button type="button" onClick={() => window.print()} className="h-10 rounded-lg bg-indigo-500 px-4 text-sm font-semibold hover:bg-indigo-400">Çap et</button>
          <button type="button" onClick={onClose} aria-label="Bağla" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-xl hover:bg-white/10">×</button>
        </div>
      </header>

      <div className="gib-print-scroll min-h-0 flex-1 overflow-auto p-3 sm:p-6">
        <div className="mx-auto mb-6 w-[210mm] min-w-[210mm] space-y-3 print:hidden">
          {artifact.draft && <div className="mb-4 border border-amber-400 bg-amber-50 px-3 py-2 text-center font-semibold text-amber-900">TASLAK · GİB-ə göndərilməyib</div>}
          {artifact.compliance && (
            <div className={`border px-3 py-3 ${artifact.compliance.readyForSigning ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
              <div className="flex items-center justify-between gap-3"><b>GİB texniki ön yoxlama</b><span>{artifact.compliance.passed}/{artifact.compliance.total}</span></div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">{artifact.compliance.checks.map((check) => <div key={check.id} className="flex items-start gap-2 text-[9px]"><span className={check.ok ? "text-emerald-600" : "text-amber-700"}>{check.ok ? "✓" : "!"}</span><span><b>{check.label}:</b> {check.detail}</span></div>)}</div>
            </div>
          )}
        </div>

        <article className="gib-document-print mx-auto min-h-[297mm] w-[210mm] min-w-[210mm] bg-white p-[8mm] text-[9px] leading-tight text-slate-900 shadow-2xl">
          <div className={`grid ${artifact.companyLogo ? "grid-cols-4" : "grid-cols-3"} items-center gap-4 border-b-2 border-slate-900 pb-2`}>
            {artifact.companyLogo && (
              <div className="flex h-20 items-center justify-center">
                <img src={artifact.companyLogo} alt="Şirkət loqosu" className="max-h-16 max-w-36 object-contain" />
              </div>
            )}
            <div className="flex h-20 flex-col items-center justify-center text-center">
              <AriXLogo className="h-11 w-11" />
              <div className="mt-0.5 text-[10px] font-medium text-slate-700">AriX</div>
            </div>
            <div className="flex h-20 flex-col items-center justify-center text-center">
              <img src={isDespatch ? "/gib/e-irsaliye.jpg" : "/gib/e-fatura.jpg"} alt="Gelir İdaresi Başkanlığı" className="h-13 w-16 object-contain" />
              <div className="mt-0.5 text-[9px] font-bold text-slate-800">
                {titles[model.documentType]}
              </div>
            </div>
            <div className="flex h-20 items-center justify-center">
              {qrUrl ? <img src={qrUrl} alt="GİB karekod" className="h-20 w-20" /> : <div className="flex h-20 w-20 items-center justify-center border text-[8px] text-slate-400">Karekod hazırlanır</div>}
            </div>
          </div>

          <div className="grid grid-cols-[1.35fr_1fr] gap-5 border-b border-slate-300 py-2.5">
            <div className="min-w-0">
              <div className="text-[15px] font-bold leading-5 tracking-normal">{model.supplier.title || "Firma adı"}</div>
              <div className="mt-1.5 leading-4 text-slate-600">
                {model.supplier.address || "Adres eklenmemiş"}<br />
                {[model.supplier.district, model.supplier.city].filter(Boolean).join(" / ")} {model.supplier.postalCode}
              </div>
            </div>
            <div className="leading-4">
              <div><b>Vergi dairesi:</b> {model.supplier.taxOffice || "-"}</div>
              <div className="mb-0.5"><b>VKN/TCKN:</b> {model.supplier.taxNumber || "-"}</div>
              {model.supplier.phone && <div className="text-slate-600">Tel: {model.supplier.phone}</div>}
              {model.supplier.fax && <div className="text-slate-600">Faks: {model.supplier.fax}</div>}
              {model.supplier.website && <div className="text-slate-600">Web: {model.supplier.website}</div>}
              {model.supplier.email && <div className="text-slate-600">E-poçt: {model.supplier.email}</div>}
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-4">
            <section>
              <div className="text-[8px] font-bold uppercase text-slate-500">Alıcı</div>
              <div className="mt-0.5 text-[11px] font-bold">{model.buyer.name || "-"}</div>
              <div className="mt-1 leading-4 text-slate-600">{model.buyer.address || "Adres eklenmemiş"}</div>
              {model.buyer.email && <div className="text-slate-600">{model.buyer.email}</div>}
              {model.buyer.phone && <div className="text-slate-600">Tel: {model.buyer.phone}</div>}
              {model.buyer.fax && <div className="text-slate-600">Faks: {model.buyer.fax}</div>}
              <div className="mt-1"><b>VKN/TCKN:</b> {model.buyer.originalTaxNumber || model.buyer.taxNumber || "-"}</div>
              {model.buyer.taxOffice && <div><b>Vergi dairesi:</b> {model.buyer.taxOffice}</div>}
            </section>
            <section className="ml-auto w-full min-w-64 border-l border-t border-slate-300">
              <Meta label="ETTN" value={model.uuid || "-"} breakAll />
              <Meta label="Özelleştirme no" value={model.customizationId || "-"} />
              <Meta label="Senaryo" value={model.profileId} />
              <Meta label={`${documentLabel} tipi`} value={model.typeCode} />
              <Meta label={`${documentLabel} no`} value={model.number || "Taslak"} />
              <Meta label={`${documentLabel} tarihi`} value={model.issueDate || "-"} />
              <Meta label="Oluşturma zamanı" value={model.issueTime || "-"} />
              {relatedDespatch && <Meta label="İrsaliye no" value={relatedDespatch.number || "-"} />}
              {relatedDespatch && <Meta label="İrsaliye tarihi" value={relatedDespatch.issueDate?.slice(0, 10) || "-"} />}
              {!isDespatch && <Meta label="Para birimi" value={model.currency} />}
            </section>
          </div>

          {isDespatch && (
            <div className="mt-2.5 grid grid-cols-2 border-l border-t border-slate-300 bg-slate-50">
              <Meta label="Fiili sevk tarihi" value={model.shipment.actualDespatchDate || "-"} />
              <Meta label="Fiili sevk zamanı" value={model.shipment.actualDespatchTime || "-"} />
              <Meta label="Taşıyıcı" value={model.shipment.carrierName || "-"} />
              <Meta label="Taşıyıcı VKN / Plaka" value={[model.shipment.carrierTaxNumber, model.shipment.plate].filter(Boolean).join(" · ") || "-"} />
              <Meta label="Sürücü" value={[model.shipment.driverFirstName, model.shipment.driverLastName].filter(Boolean).join(" ") || "-"} />
              <Meta label="Sürücü TCKN" value={model.shipment.driverNationalId || "-"} />
            </div>
          )}

          {isExport && (
            <div className="mt-2.5 grid grid-cols-2 border-l border-t border-slate-300 bg-slate-50">
              <Meta label="Gömrük alıcısı" value={model.accountingCustomer ? `${model.accountingCustomer.title} · ${model.accountingCustomer.taxNumber}` : "-"} />
              <Meta label="Xarici alıcı" value={model.buyer.registrationName || model.buyer.name || "-"} />
              <Meta label="Incoterms" value={model.exportDetails?.incoterm || "-"} />
              <Meta label="Nəqliyyat" value={model.exportDetails?.transportModeCode || "-"} />
              <Meta label="Qab" value={[model.exportDetails?.packageTypeCode, model.exportDetails?.packageId, model.exportDetails?.packageQuantity].filter(Boolean).join(" · ") || "-"} />
              <Meta label="KDV istisnası" value={model.taxExemption ? `${model.taxExemption.code} · ${model.taxExemption.reason}` : "-"} />
            </div>
          )}

          <table className="mt-3.5 w-full border-collapse text-[8px] leading-tight">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="border border-slate-700 px-1 py-0.5 text-left">#</th>
                <th className="whitespace-nowrap border border-slate-700 px-1 py-0.5 text-left">Mal / Hizmet</th>
                <th className="whitespace-nowrap border border-slate-700 px-1 py-0.5 text-left">Kod</th>
                {isExport && <th className="whitespace-nowrap border border-slate-700 px-1 py-0.5 text-left">GTİP</th>}
                <th className="whitespace-nowrap border border-slate-700 px-1 py-0.5 text-right">Miktar</th>
                {isDespatch && <><th className="whitespace-nowrap border border-slate-700 px-1 py-0.5 text-left">Etiket numarası</th><th className="whitespace-nowrap border border-slate-700 px-1 py-0.5 text-right">Sonra gönderilecek</th></>}
                {!isDespatch && <><th className="whitespace-nowrap border border-slate-700 px-1 py-0.5 text-right">Birim fiyat</th><th className="whitespace-nowrap border border-slate-700 px-1 py-0.5 text-right">KDV oranı</th><th className="whitespace-nowrap border border-slate-700 px-1 py-0.5 text-right">KDV tutarı</th><th className="whitespace-nowrap border border-slate-700 px-1 py-0.5 text-right">Tutar</th></>}
              </tr>
            </thead>
            <tbody>
              {model.lines.map((line) => (
                <tr key={line.id}>
                  <td className="whitespace-nowrap border border-slate-300 px-1 py-0.5">{line.id}</td>
                  <td className="whitespace-nowrap border border-slate-300 px-1 py-0.5 font-medium">{line.name}</td>
                  <td className="whitespace-nowrap border border-slate-300 px-1 py-0.5">{line.code || "-"}</td>
                  {isExport && <td className="whitespace-nowrap border border-slate-300 px-1 py-0.5">{line.gtip || "-"}</td>}
                  <td className="whitespace-nowrap border border-slate-300 px-1 py-0.5 text-right">{formatQuantity(line.quantity)} {line.unit}</td>
                  {isDespatch && <><td className="whitespace-nowrap border border-slate-300 px-1 py-0.5">{line.labelNumber || "-"}</td><td className="whitespace-nowrap border border-slate-300 px-1 py-0.5 text-right">{line.outstandingQuantity ? `${formatQuantity(line.outstandingQuantity)} ${line.unit}` : "-"}</td></>}
                  {!isDespatch && <><td className="whitespace-nowrap border border-slate-300 px-1 py-0.5 text-right">{formatMoney(line.unitPrice, model.currency)}</td><td className="whitespace-nowrap border border-slate-300 px-1 py-0.5 text-right">%{line.taxRate}</td><td className="whitespace-nowrap border border-slate-300 px-1 py-0.5 text-right">{formatMoney(line.taxAmount, model.currency)}</td><td className="whitespace-nowrap border border-slate-300 px-1 py-0.5 text-right font-semibold">{formatMoney(line.extensionAmount, model.currency)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>

          {!isDespatch && (
            <div className="mt-3 ml-auto w-full max-w-80 space-y-1 border-t-2 border-slate-900 pt-2">
              <Total label="Mal / hizmet toplamı" value={formatMoney(model.totals.goodsTotal, model.currency)} />
              <Total label="Toplam iskonto" value={formatMoney(model.totals.discountTotal, model.currency)} />
              {model.taxBreakdown.map((tax) => <Total key={tax.rate} label={`Hesaplanan KDV (%${tax.rate})`} value={formatMoney(tax.taxAmount, model.currency)} />)}
              <Total label="Vergiler dahil toplam" value={formatMoney(model.totals.taxInclusive, model.currency)} />
              <Total label="Ödenecek tutar" value={formatMoney(model.totals.payable, model.currency)} strong />
            </div>
          )}

          {isDespatch && model.relatedDocuments?.length ? (
            <section className="mt-4">
              <div className="mb-1 text-[10px] font-bold">İlgili Dokümanlar</div>
              <table className="w-full border-collapse">
                <thead><tr className="bg-slate-100"><th className="border border-slate-300 px-1.5 py-0.5 text-left">Doküman no</th><th className="border border-slate-300 px-1.5 py-0.5 text-left">Tarih</th><th className="border border-slate-300 px-1.5 py-0.5 text-left">Doküman tipi</th></tr></thead>
                <tbody>{model.relatedDocuments.map((item) => <tr key={`${item.documentType}-${item.number}`}><td className="border border-slate-300 px-1.5 py-0.5">{item.number || "-"}</td><td className="border border-slate-300 px-1.5 py-0.5">{item.issueDate?.slice(0, 10) || "-"}</td><td className="border border-slate-300 px-1.5 py-0.5">{titles[item.documentType as keyof typeof titles] || item.documentType}</td></tr>)}</tbody>
              </table>
            </section>
          ) : null}

          {isDespatch && (
            <div className="mt-4 grid grid-cols-2 border border-slate-300">
              <section className="border-r border-slate-300 p-2">
                <div className="font-bold">Açıklamalar</div>
                <div className="mt-1"><b>Asıl alıcı:</b> {model.buyer.name || "-"}</div>
                <div>{model.shipment.deliveryAddress || model.buyer.address || "-"}</div>
              </section>
              <section className="p-2">
                <div className="font-bold">Taşıyıcı Bilgileri</div>
                <div className="mt-1"><b>Taşıyıcı:</b> {model.shipment.carrierName || "-"}</div>
                <div><b>Araç plakası:</b> {model.shipment.plate || "-"}</div>
                <div><b>Şoför:</b> {[model.shipment.driverFirstName, model.shipment.driverLastName].filter(Boolean).join(" ") || "-"}{model.shipment.driverNationalId ? ` · TCKN: ${model.shipment.driverNationalId}` : ""}</div>
              </section>
            </div>
          )}

          {!isDespatch && model.supplier.bankAccounts?.length ? (
            <section className="mt-4">
              <div className="mb-1 text-[10px] font-bold">Banka Hesapları</div>
              <table className="w-full border-collapse">
                <thead><tr className="bg-slate-100"><th className="border border-slate-300 px-1.5 py-0.5 text-left">Banka</th><th className="border border-slate-300 px-1.5 py-0.5 text-left">Para birimi</th><th className="border border-slate-300 px-1.5 py-0.5 text-left">IBAN</th></tr></thead>
                <tbody>{model.supplier.bankAccounts.map((account) => <tr key={`${account.bank}-${account.currency}-${account.iban}`}><td className="border border-slate-300 px-1.5 py-0.5">{account.bank}</td><td className="border border-slate-300 px-1.5 py-0.5">{account.currency}</td><td className="border border-slate-300 px-1.5 py-0.5">{account.iban}</td></tr>)}</tbody>
              </table>
            </section>
          ) : null}

          <section className="mt-4 border border-slate-300">
            <div className="grid grid-cols-[110px_1fr] leading-tight">
              <div className="border-r border-slate-300 bg-slate-100 px-1.5 py-1 font-bold">
                {isDespatch ? "İrsaliye Açıklaması" : "Fatura Açıklaması"}
              </div>
              <div className="whitespace-pre-line px-1.5 py-1">{model.note || "-"}</div>
            </div>
          </section>

          {model.documentType === "eArchive" && artifact.companyStamp && (
            <section className="mt-4 flex justify-end">
              <div className="w-[65mm] text-center">
                <div className="mb-0.5 text-[8px] font-semibold uppercase text-slate-500">Kaşe / İmza</div>
                <div className="flex h-[44mm] w-[65mm] items-center justify-center">
                  <img src={artifact.companyStamp} alt="Şirkət kaşesi və imzası" className="max-h-[44mm] max-w-[65mm] object-contain" />
                </div>
              </div>
            </section>
          )}

        </article>
      </div>
    </div>,
    document.body,
  );
}

function Meta({ label, value, breakAll = false }: { label: string; value: string; breakAll?: boolean }) {
  return <div className="grid min-w-0 grid-cols-[96px_1fr] gap-1.5 border-b border-r border-slate-300 px-1.5 py-0.5 leading-tight"><span className="whitespace-nowrap font-semibold text-slate-500">{label}</span><span className={breakAll ? "break-all text-[8px]" : "min-w-0 break-words"}>{value}</span></div>;
}

function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-4 ${strong ? "border-t border-slate-400 pt-1 text-[10px] font-bold" : ""}`}><span>{label}</span><span>{value}</span></div>;
}
