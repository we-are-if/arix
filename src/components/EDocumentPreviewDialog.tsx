import { useEffect, useState } from "react";
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
        <article className="gib-document-print mx-auto min-h-[297mm] w-[210mm] min-w-[210mm] bg-white p-[12mm] text-[11px] text-slate-900 shadow-2xl">
          {artifact.draft && <div className="mb-4 border border-amber-400 bg-amber-50 px-3 py-2 text-center font-semibold text-amber-900">TASLAK · GİB-ə göndərilməyib</div>}
          {artifact.compliance && (
            <div className={`mb-4 border px-3 py-3 ${artifact.compliance.readyForSigning ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
              <div className="flex items-center justify-between gap-3"><b>GİB texniki ön yoxlama</b><span>{artifact.compliance.passed}/{artifact.compliance.total}</span></div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">{artifact.compliance.checks.map((check) => <div key={check.id} className="flex items-start gap-2 text-[9px]"><span className={check.ok ? "text-emerald-600" : "text-amber-700"}>{check.ok ? "✓" : "!"}</span><span><b>{check.label}:</b> {check.detail}</span></div>)}</div>
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-5 border-b-2 border-slate-900 pb-4">
            <div>
              <div className="text-lg font-bold tracking-normal">{model.supplier.title || "Firma adı"}</div>
              <div className="mt-2 leading-5 text-slate-600">{model.supplier.address}<br />{[model.supplier.district, model.supplier.city].filter(Boolean).join(" / ")} {model.supplier.postalCode}</div>
              {model.supplier.phone && <div className="text-slate-600">Tel: {model.supplier.phone}</div>}
              {model.supplier.email && <div className="text-slate-600">E-poçt: {model.supplier.email}</div>}
            </div>
            <div className="text-center">
              <div className="mx-auto inline-flex h-11 items-center justify-center border-2 border-teal-800 px-3 text-[10px] font-black text-teal-800">GİB UBL-TR</div>
              <div className="mt-2 text-xl font-black text-teal-900">{titles[model.documentType]}</div>
              <div className="mt-1 text-[9px] font-semibold text-slate-500">UBL-TR {model.customizationId}</div>
            </div>
            <div className="flex justify-end">
              {qrUrl ? <img src={qrUrl} alt="GİB karekod" className="h-28 w-28" /> : <div className="flex h-28 w-28 items-center justify-center border text-[9px] text-slate-400">Karekod hazırlanır</div>}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-8">
            <section>
              <div className="text-[9px] font-bold uppercase text-slate-500">Alıcı</div>
              <div className="mt-1 text-base font-bold">{model.buyer.name || "-"}</div>
              <div className="mt-2 leading-5 text-slate-600">{model.buyer.address || "Adres eklenmemiş"}</div>
              {model.buyer.email && <div className="text-slate-600">{model.buyer.email}</div>}
              <div className="mt-2"><b>VKN/TCKN:</b> {model.buyer.originalTaxNumber || model.buyer.taxNumber || "-"}</div>
              {model.buyer.taxOffice && <div><b>Vergi dairesi:</b> {model.buyer.taxOffice}</div>}
            </section>
            <section className="ml-auto min-w-64">
              <Meta label="Belge no" value={model.number || "Taslak"} />
              <Meta label="ETTN" value={model.uuid || "-"} breakAll />
              <Meta label="Düzenleme tarihi" value={`${model.issueDate} ${model.issueTime}`} />
              <Meta label="Senaryo" value={model.profileId} />
              <Meta label="Belge tipi" value={model.typeCode} />
              {!isDespatch && <Meta label="Para birimi" value={model.currency} />}
            </section>
          </div>

          {isDespatch && (
            <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 border-y border-slate-300 bg-slate-50 px-3 py-3">
              <Meta label="Fiili sevk tarihi" value={model.shipment.actualDespatchDate || "-"} />
              <Meta label="Fiili sevk zamanı" value={model.shipment.actualDespatchTime || "-"} />
              <Meta label="Taşıyıcı" value={model.shipment.carrierName || "-"} />
              <Meta label="Taşıyıcı VKN / Plaka" value={[model.shipment.carrierTaxNumber, model.shipment.plate].filter(Boolean).join(" · ") || "-"} />
              <Meta label="Sürücü" value={[model.shipment.driverFirstName, model.shipment.driverLastName].filter(Boolean).join(" ") || "-"} />
              <Meta label="Sürücü TCKN" value={model.shipment.driverNationalId || "-"} />
            </div>
          )}

          {isExport && (
            <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 border-y border-slate-300 bg-slate-50 px-3 py-3">
              <Meta label="Gömrük alıcısı" value={model.accountingCustomer ? `${model.accountingCustomer.title} · ${model.accountingCustomer.taxNumber}` : "-"} />
              <Meta label="Xarici alıcı" value={model.buyer.registrationName || model.buyer.name || "-"} />
              <Meta label="Incoterms" value={model.exportDetails?.incoterm || "-"} />
              <Meta label="Nəqliyyat" value={model.exportDetails?.transportModeCode || "-"} />
              <Meta label="Qab" value={[model.exportDetails?.packageTypeCode, model.exportDetails?.packageId, model.exportDetails?.packageQuantity].filter(Boolean).join(" · ") || "-"} />
              <Meta label="KDV istisnası" value={model.taxExemption ? `${model.taxExemption.code} · ${model.taxExemption.reason}` : "-"} />
            </div>
          )}

          <table className="mt-6 w-full border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="border border-slate-700 px-2 py-2 text-left">#</th>
                <th className="border border-slate-700 px-2 py-2 text-left">Mal / Hizmet</th>
                <th className="border border-slate-700 px-2 py-2 text-left">Kod</th>
                {isExport && <th className="border border-slate-700 px-2 py-2 text-left">GTİP</th>}
                <th className="border border-slate-700 px-2 py-2 text-right">Miktar</th>
                {!isDespatch && <><th className="border border-slate-700 px-2 py-2 text-right">Birim fiyat</th><th className="border border-slate-700 px-2 py-2 text-right">KDV</th><th className="border border-slate-700 px-2 py-2 text-right">Tutar</th></>}
              </tr>
            </thead>
            <tbody>
              {model.lines.map((line) => (
                <tr key={line.id}>
                  <td className="border border-slate-300 px-2 py-2">{line.id}</td>
                  <td className="border border-slate-300 px-2 py-2 font-medium">{line.name}</td>
                  <td className="border border-slate-300 px-2 py-2">{line.code || "-"}</td>
                  {isExport && <td className="border border-slate-300 px-2 py-2">{line.gtip || "-"}</td>}
                  <td className="border border-slate-300 px-2 py-2 text-right">{formatQuantity(line.quantity)} {line.unit}</td>
                  {!isDespatch && <><td className="border border-slate-300 px-2 py-2 text-right">{formatMoney(line.unitPrice, model.currency)}</td><td className="border border-slate-300 px-2 py-2 text-right">%{line.taxRate}</td><td className="border border-slate-300 px-2 py-2 text-right font-semibold">{formatMoney(line.extensionAmount, model.currency)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>

          {!isDespatch && (
            <div className="mt-5 ml-auto w-full max-w-80 space-y-2 border-t-2 border-slate-900 pt-3">
              <Total label="Mal / hizmet toplamı" value={formatMoney(model.totals.goodsTotal, model.currency)} />
              {model.taxBreakdown.map((tax) => <Total key={tax.rate} label={`Hesaplanan KDV (%${tax.rate})`} value={formatMoney(tax.taxAmount, model.currency)} />)}
              <Total label="Vergiler dahil toplam" value={formatMoney(model.totals.taxInclusive, model.currency)} />
              <Total label="Ödenecek tutar" value={formatMoney(model.totals.payable, model.currency)} strong />
            </div>
          )}

          <div className="mt-12 border-t border-slate-300 pt-4 text-[9px] leading-4 text-slate-500">
            <div>Bu belge UBL-TR {model.customizationId} veri modeli esas alınarak oluşturulmuştur.</div>
            <div>Karekod içeriği GİB Karekod Standardı v1.2 alanları ilə hazırlanmışdır.</div>
            <div>XML daxilində XSLT görünüşü mövcuddur; rəsmi göndərişdə provayder XAdES-BES mali möhür/e-imza əlavə etməlidir.</div>
            <div className="mt-1 break-all">ETTN: {model.uuid || "Taslak"}</div>
          </div>
        </article>
      </div>
    </div>,
    document.body,
  );
}

function Meta({ label, value, breakAll = false }: { label: string; value: string; breakAll?: boolean }) {
  return <div className="grid grid-cols-[112px_1fr] gap-2 border-b border-slate-200 py-1.5"><span className="font-semibold text-slate-500">{label}</span><span className={breakAll ? "break-all" : ""}>{value}</span></div>;
}

function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-4 ${strong ? "border-t border-slate-400 pt-2 text-sm font-bold" : ""}`}><span>{label}</span><span>{value}</span></div>;
}
