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
  snapshot?: { shipment?: ShipmentDraft };
};
type ShipmentDraft = { actualDespatchDate: string; actualDespatchTime: string; carrierTaxNumber: string; carrierName: string; plate: string };
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
  }, [context?.documents, selectedType]);

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
      body: JSON.stringify({ profileId, shipment: selectedType === "eDespatch" ? { ...shipment, actualDespatchTime: shipment.actualDespatchTime.length === 5 ? `${shipment.actualDespatchTime}:00` : shipment.actualDespatchTime } : undefined }),
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
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold">{label}</span>{children && <div className={cx("[&>input]:h-10 [&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:bg-transparent [&>input]:px-3 [&>input]:text-sm [&>input]:outline-none", border)}>{children}</div>}</label>;
}

function Info({ label, value, border, soft, subtle }: { label: string; value: string; border: string; soft: string; subtle: string }) {
  return <div className={cx("rounded-xl border p-4", border, soft)}><div className={cx("text-xs font-semibold", subtle)}>{label}</div><div className="mt-1 truncate text-sm font-semibold">{value}</div></div>;
}
