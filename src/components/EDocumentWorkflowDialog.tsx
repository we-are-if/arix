import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { requestJson } from "../api";
import EDocumentPreviewDialog, { type EDocumentArtifact } from "./EDocumentPreviewDialog";

type EDocumentType = "eInvoice" | "eArchive" | "eDespatch" | "exportInvoice";
type EDocumentRecord = {
  id: string;
  documentType: EDocumentType;
  status: "draft" | "processing" | "completed" | "failed";
  number?: string | null;
  uuid?: string | null;
  createdAt?: string;
  sentAt?: string;
  providerResponse?: { code?: string; message?: string };
  gib?: { profileId?: string; typeCode?: string };
  snapshot?: {
    shipment?: ShipmentDraft;
    exportDetails?: ExportDetailsDraft;
    counterparty?: { registrationName?: string; companyId?: string; address?: string; city?: string; countryCode?: string; countryName?: string };
    lines?: Array<{ name?: string; code?: string; gtip?: string }>;
  };
};
type ShipmentDraft = {
  actualDespatchDate: string;
  actualDespatchTime: string;
  carrierTaxNumber: string;
  carrierName: string;
  plate: string;
  driverFirstName: string;
  driverLastName: string;
  driverNationalId: string;
  deliveryAddress: string;
};
type ExportDetailsDraft = {
  registrationName: string;
  companyId: string;
  buyerAddress: string;
  city: string;
  countryCode: string;
  countryName: string;
  incoterm: string;
  transportModeCode: string;
  packageTypeCode: string;
  packageId: string;
  packageQuantity: number;
  exchangeRate: number;
  deliveryAddress: string;
  gtips: Record<string, string>;
};
type Readiness = { ready: boolean; issues: string[] };
type WorkflowContext = {
  sourceDocument: {
    id: string | number;
    counterpartyName?: string;
    counterpartyTaxNumber?: string;
    counterpartyAddress?: string;
    saleMode?: string;
    exportMode?: boolean;
    total?: number;
    currency?: string;
    lines?: Array<{ name?: string; code?: string; gtip?: string }>;
  };
  plan: {
    recommendedType: EDocumentType;
    availableTypes: EDocumentType[];
    reason: string;
    recipientStatus: string;
  };
  readiness: Partial<Record<EDocumentType, Readiness>>;
  documents: EDocumentRecord[];
  settings: { enabled: boolean; provider: string; environment: string };
};

const labels: Record<EDocumentType, { title: string; description: string }> = {
  eInvoice: { title: "e-Fatura", description: "e-Fatura istifadəçisi olan Türkiyə alıcısı" },
  eArchive: { title: "e-Arşiv", description: "e-Fatura istifadəçisi olmayan alıcı" },
  eDespatch: { title: "e-İrsaliye", description: "Sevkiyyat və mal çıxışı sənədi" },
  exportInvoice: { title: "İhracat faturası", description: "Gömrük ssenarili ixrac faturası" },
};

const statusLabels: Record<string, string> = {
  draft: "Qaralama",
  processing: "Göndərilir",
  completed: "Qəbul edildi",
  failed: "Xəta",
};

const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");
const money = (value?: number, currency = "TRY") => `${Number(value ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const now = new Date();
const initialShipment: ShipmentDraft = {
  actualDespatchDate: now.toISOString().slice(0, 10),
  actualDespatchTime: now.toTimeString().slice(0, 5),
  carrierTaxNumber: "",
  carrierName: "",
  plate: "",
  driverFirstName: "",
  driverLastName: "",
  driverNationalId: "",
  deliveryAddress: "",
};
const initialExportDetails: ExportDetailsDraft = {
  registrationName: "",
  companyId: "",
  buyerAddress: "",
  city: "",
  countryCode: "",
  countryName: "",
  incoterm: "",
  transportModeCode: "",
  packageTypeCode: "",
  packageId: "",
  packageQuantity: 0,
  exchangeRate: 0,
  deliveryAddress: "",
  gtips: {},
};

export default function EDocumentWorkflowDialog({
  sourceDocumentId,
  isDark,
  onClose,
}: {
  sourceDocumentId: string | number;
  isDark: boolean;
  onClose: () => void;
}) {
  const [context, setContext] = useState<WorkflowContext | null>(null);
  const [selectedType, setSelectedType] = useState<EDocumentType | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [profileId, setProfileId] = useState("TEMELFATURA");
  const [shipment, setShipment] = useState<ShipmentDraft>(initialShipment);
  const [exportDetails, setExportDetails] = useState<ExportDetailsDraft>(initialExportDetails);
  const [previewArtifact, setPreviewArtifact] = useState<EDocumentArtifact | null>(null);
  const border = isDark ? "border-white/10" : "border-slate-200";
  const panel = isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900";
  const soft = isDark ? "bg-white/5" : "bg-slate-50";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await requestJson<{ data: WorkflowContext }>(`/api/e-documents/context?sourceDocumentId=${encodeURIComponent(sourceDocumentId)}`);
      setContext(payload.data);
      setSelectedType((current) => current && payload.data.plan.availableTypes.includes(current) ? current : payload.data.plan.recommendedType);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "e-Belge məlumatları açılmadı.");
    } finally {
      setLoading(false);
    }
  }, [sourceDocumentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedDocument = useMemo(
    () => context?.documents.find((item) => item.documentType === selectedType),
    [context?.documents, selectedType],
  );
  const readiness = selectedType ? context?.readiness[selectedType] : undefined;

  useEffect(() => {
    if (!selectedType) return;
    const current = context?.documents.find((item) => item.documentType === selectedType);
    setProfileId(current?.gib?.profileId ?? (selectedType === "eArchive" ? "EARSIVFATURA" : selectedType === "eDespatch" ? "TEMELIRSALIYE" : selectedType === "exportInvoice" ? "IHRACAT" : "TEMELFATURA"));
    if (current?.snapshot?.shipment) setShipment((value) => ({ ...value, ...current.snapshot?.shipment }));
    if (selectedType === "exportInvoice") {
      setExportDetails((value) => ({
        ...value,
        ...(current?.snapshot?.exportDetails ?? {}),
        registrationName: current?.snapshot?.counterparty?.registrationName ?? context?.sourceDocument.counterpartyName ?? value.registrationName,
        companyId: current?.snapshot?.counterparty?.companyId ?? value.companyId,
        buyerAddress: current?.snapshot?.counterparty?.address ?? context?.sourceDocument.counterpartyAddress ?? value.buyerAddress,
        city: current?.snapshot?.counterparty?.city || current?.snapshot?.exportDetails?.city || value.city,
        countryCode: current?.snapshot?.counterparty?.countryCode || current?.snapshot?.exportDetails?.countryCode || value.countryCode,
        countryName: current?.snapshot?.counterparty?.countryName || current?.snapshot?.exportDetails?.countryName || value.countryName,
        gtips: current?.snapshot?.exportDetails?.gtips ?? value.gtips,
      }));
    }
  }, [context?.documents, context?.sourceDocument.counterpartyAddress, context?.sourceDocument.counterpartyName, selectedType]);

  const createDraft = async () => {
    if (!selectedType) return null;
    const payload = await requestJson<{ data: EDocumentRecord }>("/api/e-documents/drafts", {
      method: "POST",
      body: JSON.stringify({ sourceDocumentId, documentType: selectedType }),
    });
    return payload.data;
  };

  const saveConfiguration = async (document: EDocumentRecord) => {
    if (document.status === "completed") return document;
    const payload = await requestJson<{ data: EDocumentRecord }>(`/api/e-documents/${document.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        profileId,
        shipment: selectedType === "eDespatch" ? { ...shipment, actualDespatchTime: shipment.actualDespatchTime.length === 5 ? `${shipment.actualDespatchTime}:00` : shipment.actualDespatchTime } : undefined,
        exportDetails: selectedType === "exportInvoice" ? exportDetails : undefined,
      }),
    });
    return payload.data;
  };

  const prepare = async () => {
    setWorking(true);
    setMessage("");
    try {
      const draft = await createDraft();
      if (draft) await saveConfiguration(draft);
      setMessageTone("success");
      setMessage("e-Belge qaralaması hazırlandı.");
      window.dispatchEvent(new CustomEvent("arix:e-documents-updated"));
      await load();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Qaralama yaradıla bilmədi.");
    } finally {
      setWorking(false);
    }
  };

  const saveDetails = async () => {
    if (!selectedDocument) return;
    setWorking(true);
    setMessage("");
    try {
      await saveConfiguration(selectedDocument);
      setMessageTone("success");
      setMessage("GİB sənəd məlumatları saxlandı.");
      await load();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Sənəd məlumatları saxlanmadı.");
    } finally {
      setWorking(false);
    }
  };

  const openPreview = async () => {
    setWorking(true);
    setMessage("");
    try {
      const draft = selectedDocument ?? await createDraft();
      if (!draft) return;
      const configured = await saveConfiguration(draft);
      const payload = await requestJson<{ data: EDocumentArtifact }>(`/api/e-documents/${configured.id}/artifact`);
      setPreviewArtifact(payload.data);
      window.dispatchEvent(new CustomEvent("arix:e-documents-updated"));
      await load();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Sənəd önizləməsi hazırlanmadı.");
    } finally {
      setWorking(false);
    }
  };

  const sendDocument = async () => {
    setWorking(true);
    setMessage("");
    try {
      const draft = selectedDocument ?? await createDraft();
      if (!draft) return;
      const configured = await saveConfiguration(draft);
      const payload = await requestJson<{ data: EDocumentRecord; testMode?: boolean }>(`/api/e-documents/${configured.id}/send`, { method: "POST" });
      setMessageTone("success");
      setMessage(payload.testMode ? "Test sənədi qəbul edildi. GİB-ə məlumat göndərilmədi." : "e-Belge provayderə göndərildi.");
      window.dispatchEvent(new CustomEvent("arix:e-documents-updated"));
      await load();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "e-Belge göndərilmədi.");
    } finally {
      setWorking(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-md" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="e-document-workflow-title" className={cx("flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl", border, panel)} onClick={(event) => event.stopPropagation()}>
        <header className={cx("flex items-center justify-between gap-4 border-b px-5 py-4", border)}>
          <div>
            <div className={cx("text-xs font-semibold uppercase", subtle)}>Satışdan rəsmi sənəd</div>
            <h2 id="e-document-workflow-title" className="mt-1 text-xl font-semibold">e-Belge hazırla və göndər</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Bağla" className={cx("flex h-10 w-10 items-center justify-center rounded-xl border text-xl", border, soft)}>×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading && <div className={cx("py-16 text-center text-sm", subtle)}>Məlumatlar hazırlanır...</div>}
          {!loading && context && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Info label="Müştəri" value={context.sourceDocument.counterpartyName || "-"} border={border} soft={soft} subtle={subtle} />
                <Info label="VKN / TCKN" value={context.sourceDocument.counterpartyTaxNumber || "Əlavə edilməyib"} border={border} soft={soft} subtle={subtle} />
                <Info label="Satış məbləği" value={money(context.sourceDocument.total, context.sourceDocument.currency)} border={border} soft={soft} subtle={subtle} />
              </div>

              <section>
                <div className="mb-3">
                  <h3 className="font-semibold">Sənəd növü</h3>
                  <p className={cx("mt-1 text-sm", subtle)}>{context.plan.reason}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {context.plan.availableTypes.map((type) => {
                    const active = selectedType === type;
                    const existing = context.documents.find((item) => item.documentType === type);
                    return (
                      <button key={type} type="button" onClick={() => setSelectedType(type)} className={cx("rounded-xl border p-4 text-left transition", active ? "border-indigo-500 bg-indigo-500/10" : border, !active && soft)}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold">{labels[type].title}</span>
                          {existing && <span className={cx("rounded-full px-2 py-1 text-xs font-semibold", existing.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{statusLabels[existing.status] ?? existing.status}</span>}
                        </div>
                        <p className={cx("mt-1 text-xs", subtle)}>{labels[type].description}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {selectedType === "eInvoice" && (
                <section className={cx("rounded-xl border p-4", border, soft)}>
                  <label className="block text-sm font-semibold">GİB fatura ssenarisi</label>
                  <select value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={selectedDocument?.status === "completed"} className={cx("mt-2 h-11 w-full rounded-xl border bg-transparent px-3 text-sm outline-none sm:max-w-sm", border)}>
                    <option value="TEMELFATURA">TEMELFATURA</option>
                    <option value="TICARIFATURA">TICARIFATURA</option>
                  </select>
                </section>
              )}

              {selectedType === "eDespatch" && (
                <section className={cx("rounded-xl border p-4", border, soft)}>
                  <div className="mb-3">
                    <h3 className="font-semibold">Sevkiyyat məlumatları</h3>
                    <p className={cx("mt-1 text-xs", subtle)}>Karekod və UBL-TR e-İrsaliye üçün faktiki tarix və saat məcburidir.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <WorkflowField label="Faktiki sevk tarixi" border={border}><input type="date" value={shipment.actualDespatchDate} onChange={(event) => setShipment((value) => ({ ...value, actualDespatchDate: event.target.value }))} /></WorkflowField>
                    <WorkflowField label="Faktiki sevk saatı" border={border}><input type="time" step="1" value={shipment.actualDespatchTime} onChange={(event) => setShipment((value) => ({ ...value, actualDespatchTime: event.target.value }))} /></WorkflowField>
                    <WorkflowField label="Daşıyıcı adı" border={border}><input value={shipment.carrierName} onChange={(event) => setShipment((value) => ({ ...value, carrierName: event.target.value }))} placeholder="Firma və ya şəxs" /></WorkflowField>
                    <WorkflowField label="Daşıyıcı VKN/TCKN" border={border}><input value={shipment.carrierTaxNumber} onChange={(event) => setShipment((value) => ({ ...value, carrierTaxNumber: event.target.value.replace(/\D/g, "").slice(0, 11) }))} inputMode="numeric" /></WorkflowField>
                    <WorkflowField label="Nəqliyyat plakası" border={border}><input value={shipment.plate} onChange={(event) => setShipment((value) => ({ ...value, plate: event.target.value.toUpperCase() }))} placeholder="34ABC123" /></WorkflowField>
                    <WorkflowField label="Sürücünün adı" border={border}><input value={shipment.driverFirstName} onChange={(event) => setShipment((value) => ({ ...value, driverFirstName: event.target.value }))} /></WorkflowField>
                    <WorkflowField label="Sürücünün soyadı" border={border}><input value={shipment.driverLastName} onChange={(event) => setShipment((value) => ({ ...value, driverLastName: event.target.value }))} /></WorkflowField>
                    <WorkflowField label="Sürücü TCKN" border={border}><input value={shipment.driverNationalId} onChange={(event) => setShipment((value) => ({ ...value, driverNationalId: event.target.value.replace(/\D/g, "").slice(0, 11) }))} inputMode="numeric" /></WorkflowField>
                    <div className="sm:col-span-2"><WorkflowField label="Təslim ünvanı" border={border}><input value={shipment.deliveryAddress} onChange={(event) => setShipment((value) => ({ ...value, deliveryAddress: event.target.value }))} /></WorkflowField></div>
                  </div>
                </section>
              )}

              {selectedType === "exportInvoice" && (
                <section className={cx("rounded-xl border p-4", border, soft)}>
                  <div className="mb-4">
                    <h3 className="font-semibold">Gömrük və ixrac məlumatları</h3>
                    <p className={cx("mt-1 text-xs", subtle)}>GİB IHRACAT/ISTISNA ssenarisi üçün xarici alıcı, GTİP, Incoterms, qab və nəqliyyat məlumatları.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <WorkflowField label="Xarici alıcının rəsmi adı" border={border}><input value={exportDetails.registrationName} onChange={(event) => setExportDetails((value) => ({ ...value, registrationName: event.target.value }))} /></WorkflowField>
                    <WorkflowField label="Xarici vergi / qeydiyyat kodu" border={border}><input value={exportDetails.companyId} onChange={(event) => setExportDetails((value) => ({ ...value, companyId: event.target.value }))} /></WorkflowField>
                    <div className="sm:col-span-2"><WorkflowField label="Alıcı ünvanı" border={border}><input value={exportDetails.buyerAddress} onChange={(event) => setExportDetails((value) => ({ ...value, buyerAddress: event.target.value }))} /></WorkflowField></div>
                    <WorkflowField label="Ölkə kodu" border={border}><input value={exportDetails.countryCode} onChange={(event) => setExportDetails((value) => ({ ...value, countryCode: event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) }))} placeholder="AZ" /></WorkflowField>
                    <WorkflowField label="Ölkə adı" border={border}><input value={exportDetails.countryName} onChange={(event) => setExportDetails((value) => ({ ...value, countryName: event.target.value }))} placeholder="Azerbaijan" /></WorkflowField>
                    <WorkflowField label="Şəhər" border={border}><input value={exportDetails.city} onChange={(event) => setExportDetails((value) => ({ ...value, city: event.target.value }))} /></WorkflowField>
                    <WorkflowField label="Incoterms" border={border}>
                      <select value={exportDetails.incoterm} onChange={(event) => setExportDetails((value) => ({ ...value, incoterm: event.target.value }))}>
                        <option value="">Seçin</option><option value="EXW">EXW</option><option value="FCA">FCA</option><option value="CPT">CPT</option><option value="CIP">CIP</option><option value="DAP">DAP</option><option value="DPU">DPU</option><option value="DDP">DDP</option><option value="FAS">FAS</option><option value="FOB">FOB</option><option value="CFR">CFR</option><option value="CIF">CIF</option>
                      </select>
                    </WorkflowField>
                    <WorkflowField label="Nəqliyyat üsulu" border={border}>
                      <select value={exportDetails.transportModeCode} onChange={(event) => setExportDetails((value) => ({ ...value, transportModeCode: event.target.value }))}>
                        <option value="">Seçin</option><option value="1">1 · Dəniz</option><option value="2">2 · Dəmir yolu</option><option value="3">3 · Avtomobil yolu</option><option value="4">4 · Hava yolu</option><option value="5">5 · Poçt</option><option value="7">7 · Boru xətti</option><option value="8">8 · Daxili su yolu</option>
                      </select>
                    </WorkflowField>
                    <WorkflowField label="Qab növü" border={border}>
                      <select value={exportDetails.packageTypeCode} onChange={(event) => setExportDetails((value) => ({ ...value, packageTypeCode: event.target.value }))}>
                        <option value="">Seçin</option><option value="PX">PX · Palet</option><option value="CN">CN · Konteyner</option><option value="BX">BX · Qutu</option><option value="RL">RL · Rulo</option><option value="NE">NE · Qabsız</option>
                      </select>
                    </WorkflowField>
                    <WorkflowField label="Qab / konteyner nömrəsi" border={border}><input value={exportDetails.packageId} onChange={(event) => setExportDetails((value) => ({ ...value, packageId: event.target.value }))} /></WorkflowField>
                    <WorkflowField label="Qab sayı" border={border}><input type="number" min="0" step="1" value={exportDetails.packageQuantity || ""} onChange={(event) => setExportDetails((value) => ({ ...value, packageQuantity: Number(event.target.value) }))} /></WorkflowField>
                    {context.sourceDocument.currency && context.sourceDocument.currency !== "TRY" && <WorkflowField label={`${context.sourceDocument.currency} / TRY məzənnəsi`} border={border}><input type="number" min="0" step="0.0001" value={exportDetails.exchangeRate || ""} onChange={(event) => setExportDetails((value) => ({ ...value, exchangeRate: Number(event.target.value) }))} /></WorkflowField>}
                    <div className="sm:col-span-2"><WorkflowField label="Təslim və ödəniş yeri" border={border}><input value={exportDetails.deliveryAddress} onChange={(event) => setExportDetails((value) => ({ ...value, deliveryAddress: event.target.value }))} /></WorkflowField></div>
                  </div>
                  <div className={cx("mt-4 border-t pt-4", border)}>
                    <div className="mb-2 text-sm font-semibold">Məhsul GTİP kodları</div>
                    <div className="space-y-2">
                      {(selectedDocument?.snapshot?.lines ?? context.sourceDocument.lines ?? []).map((line, index) => {
                        const key = String(index + 1);
                        return <div key={`${line.code ?? line.name}-${key}`} className="grid items-center gap-2 sm:grid-cols-[1fr_180px]"><div className="min-w-0"><div className="truncate text-sm font-medium">{line.name || `Məhsul ${key}`}</div><div className={cx("text-xs", subtle)}>{line.code || `Sətir ${key}`}</div></div><input aria-label={`${line.name || `Məhsul ${key}`} GTİP`} className={cx("h-10 rounded-lg border bg-transparent px-3 text-sm outline-none", border)} value={exportDetails.gtips[key] ?? line.gtip ?? ""} onChange={(event) => setExportDetails((value) => ({ ...value, gtips: { ...value.gtips, [key]: event.target.value.replace(/\D/g, "").slice(0, 12) } }))} inputMode="numeric" placeholder="12 rəqəm GTİP" /></div>;
                      })}
                    </div>
                  </div>
                </section>
              )}

              {selectedType && readiness && !readiness.ready && (
                <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                  <div className="font-semibold">Göndərişdən əvvəl tamamlanmalıdır</div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {readiness.issues.map((issue) => <li key={issue}>• {issue}</li>)}
                  </ul>
                  <a href="/company/e-documents" className="mt-3 inline-flex text-sm font-semibold text-indigo-700 hover:underline">e-Belge ayarlarına keç</a>
                </section>
              )}

              {selectedDocument && (
                <section className={cx("rounded-xl border p-4", border, soft)}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className={cx("text-xs font-semibold", subtle)}>Cari sənəd</div>
                      <div className="mt-1 font-semibold">{selectedDocument.number || `${labels[selectedDocument.documentType].title} qaralaması`}</div>
                    </div>
                    <span className={cx("rounded-full px-3 py-1 text-xs font-semibold", selectedDocument.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{statusLabels[selectedDocument.status] ?? selectedDocument.status}</span>
                  </div>
                  {selectedDocument.providerResponse?.message && <p className={cx("mt-2 text-sm", subtle)}>{selectedDocument.providerResponse.message}</p>}
                </section>
              )}

              {message && <div className={cx("rounded-xl border px-4 py-3 text-sm", messageTone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>{message}</div>}
            </div>
          )}
        </div>

        <footer className={cx("flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end", border)}>
          <button type="button" onClick={onClose} className={cx("h-11 rounded-xl border px-5 text-sm font-semibold", border, soft)}>Bağla</button>
          {context && selectedType && <button type="button" onClick={() => void openPreview()} disabled={working} className={cx("h-11 rounded-xl border px-5 text-sm font-semibold", border, soft, working && "opacity-60")}>Önizlə / XML</button>}
          {context && selectedType && selectedDocument?.status !== "completed" && (
            <>
              {!selectedDocument && <button type="button" onClick={() => void prepare()} disabled={working} className={cx("h-11 rounded-xl border px-5 text-sm font-semibold", border, soft, working && "opacity-60")}>Qaralama saxla</button>}
              {selectedDocument && <button type="button" onClick={() => void saveDetails()} disabled={working} className={cx("h-11 rounded-xl border px-5 text-sm font-semibold", border, soft, working && "opacity-60")}>Məlumatları saxla</button>}
              <button type="button" onClick={() => void sendDocument()} disabled={working || !readiness?.ready} className={cx("surface-primary h-11 rounded-xl px-5 text-sm font-semibold", (working || !readiness?.ready) && "opacity-50")}>{working ? "İşlənir..." : context.settings.provider === "mock" ? "Test göndərişi" : "Provayderə göndər"}</button>
            </>
          )}
        </footer>
      </section>
      {previewArtifact && <EDocumentPreviewDialog artifact={previewArtifact} onClose={() => setPreviewArtifact(null)} />}
    </div>,
    window.document.body,
  );
}

function WorkflowField({ label, border, children }: { label: string; border: string; children: React.ReactElement<{ className?: string }> }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold">{label}</span>{children && <div className={cx("[&>input]:h-10 [&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:bg-transparent [&>input]:px-3 [&>input]:text-sm [&>input]:outline-none [&>select]:h-10 [&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:bg-transparent [&>select]:px-3 [&>select]:text-sm [&>select]:outline-none", border)}>{children}</div>}</label>;
}

function Info({ label, value, border, soft, subtle }: { label: string; value: string; border: string; soft: string; subtle: string }) {
  return <div className={cx("rounded-xl border p-4", border, soft)}><div className={cx("text-xs font-semibold", subtle)}>{label}</div><div className="mt-1 truncate text-sm font-semibold">{value}</div></div>;
}
