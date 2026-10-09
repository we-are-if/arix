import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { requestJson } from "../api";

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

  const createDraft = async () => {
    if (!selectedType) return null;
    const payload = await requestJson<{ data: EDocumentRecord }>("/api/e-documents/drafts", {
      method: "POST",
      body: JSON.stringify({ sourceDocumentId, documentType: selectedType }),
    });
    return payload.data;
  };

  const prepare = async () => {
    setWorking(true);
    setMessage("");
    try {
      await createDraft();
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

  const sendDocument = async () => {
    setWorking(true);
    setMessage("");
    try {
      const draft = selectedDocument ?? await createDraft();
      if (!draft) return;
      const payload = await requestJson<{ data: EDocumentRecord; testMode?: boolean }>(`/api/e-documents/${draft.id}/send`, { method: "POST" });
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
          {context && selectedType && selectedDocument?.status !== "completed" && (
            <>
              {!selectedDocument && <button type="button" onClick={() => void prepare()} disabled={working} className={cx("h-11 rounded-xl border px-5 text-sm font-semibold", border, soft, working && "opacity-60")}>Qaralama saxla</button>}
              <button type="button" onClick={() => void sendDocument()} disabled={working || !readiness?.ready} className={cx("surface-primary h-11 rounded-xl px-5 text-sm font-semibold", (working || !readiness?.ready) && "opacity-50")}>{working ? "İşlənir..." : context.settings.provider === "mock" ? "Test göndərişi" : "Provayderə göndər"}</button>
            </>
          )}
        </footer>
      </section>
    </div>,
    window.document.body,
  );
}

function Info({ label, value, border, soft, subtle }: { label: string; value: string; border: string; soft: string; subtle: string }) {
  return <div className={cx("rounded-xl border p-4", border, soft)}><div className={cx("text-xs font-semibold", subtle)}>{label}</div><div className="mt-1 truncate text-sm font-semibold">{value}</div></div>;
}
