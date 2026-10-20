import { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "../api";
import { useI18n } from "../i18n";
import { showToast } from "../toast";

type TrashEntry = {
  id: string;
  entityType: string;
  entityId: string;
  subtype: string;
  label: string;
  summary: string;
  deletedAt: string;
  deletedBy: string;
};

type FilterId = "all" | "document" | "product" | "customer" | "supplier" | "store";

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

const Icon = {
  Search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>,
  Trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></svg>,
  Restore: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M4 10a8 8 0 1 1 2 7.5M4 10V5m0 5h5" /></svg>,
  Delete: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></svg>,
};

export default function Trash({ isDark = false }: { isDark?: boolean }) {
  const { locale, t } = useI18n();
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrashEntry | null>(null);
  const [message, setMessage] = useState("");

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await requestJson<{ data: TrashEntry[] }>("/api/trash");
      setEntries(Array.isArray(payload.data) ? payload.data : []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("trash.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadEntries();
    const refresh = () => void loadEntries();
    window.addEventListener("arix:trash-updated", refresh);
    return () => window.removeEventListener("arix:trash-updated", refresh);
  }, [loadEntries]);

  const matchesFilter = (entry: TrashEntry, selected: FilterId) => {
    if (selected === "all") return true;
    if (selected === "customer" || selected === "supplier") return entry.entityType === "counterparty" && entry.subtype === selected;
    return entry.entityType === selected;
  };

  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale);
    return entries.filter((entry) => {
      if (!matchesFilter(entry, filter)) return false;
      if (!normalized) return true;
      return [entry.label, entry.summary, entry.entityId, entry.deletedBy, entry.subtype]
        .some((value) => String(value ?? "").toLocaleLowerCase(locale).includes(normalized));
    });
  }, [entries, filter, locale, query]);

  const filters: Array<{ id: FilterId; label: string }> = [
    { id: "all", label: t("trash.all") },
    { id: "document", label: t("trash.documents") },
    { id: "product", label: t("trash.products") },
    { id: "customer", label: t("trash.customers") },
    { id: "supplier", label: t("trash.suppliers") },
    { id: "store", label: t("trash.stores") },
  ];

  const countFor = (id: FilterId) => entries.filter((entry) => matchesFilter(entry, id)).length;
  const typeLabel = (entry: TrashEntry) => {
    if (entry.entityType === "counterparty") return entry.subtype === "supplier" ? t("trash.supplier") : t("trash.customer");
    if (entry.entityType === "document") return t("trash.document");
    if (entry.entityType === "product") return t("trash.product");
    if (entry.entityType === "store") return t("trash.store");
    return entry.entityType;
  };
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };

  const notifyRestored = (entry: TrashEntry) => {
    window.dispatchEvent(new CustomEvent("arix:trash-updated"));
    if (entry.entityType === "document") window.dispatchEvent(new CustomEvent("arix:documents-updated"));
    if (entry.entityType === "product") window.dispatchEvent(new CustomEvent("arix:products-updated"));
    if (entry.entityType === "counterparty") window.dispatchEvent(new CustomEvent("arix:counterparties-updated"));
    if (entry.entityType === "store") window.dispatchEvent(new CustomEvent("arix:stores-updated"));
  };

  const restoreEntry = async (entry: TrashEntry) => {
    setBusyId(entry.id);
    setMessage("");
    try {
      await requestJson(`/api/trash/${encodeURIComponent(entry.id)}/restore`, { method: "PATCH" });
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setMessage(t("trash.restoreSuccess"));
      showToast(t("trash.restoreSuccess"), { tone: "success", title: t("trash.title") });
      notifyRestored(entry);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t("trash.error");
      setMessage(errorMessage);
      showToast(errorMessage, { tone: "error", title: t("trash.title") });
    } finally {
      setBusyId(null);
    }
  };

  const permanentlyDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setMessage("");
    try {
      await requestJson(`/api/trash/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      setEntries((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setMessage(t("trash.deleteSuccess"));
      showToast(t("trash.deleteSuccess"), { tone: "success", title: t("trash.title") });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t("trash.error");
      setMessage(errorMessage);
      showToast(errorMessage, { tone: "error", title: t("trash.title") });
    } finally {
      setBusyId(null);
    }
  };

  const border = isDark ? "border-white/10" : "border-slate-200";
  const panel = isDark ? "bg-slate-950/60 text-slate-100" : "bg-white text-slate-900";
  const soft = isDark ? "bg-white/5" : "bg-slate-50";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";

  return (
    <div className="space-y-4">
      <header className={cx("rounded-2xl border px-5 py-5", border, panel)}>
        <div className="flex items-start gap-3">
          <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", isDark ? "bg-indigo-400/10 text-indigo-200" : "bg-indigo-50 text-indigo-600")}><Icon.Trash /></span>
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">{t("trash.title")}</h1>
            <p className={cx("mt-1 max-w-3xl text-sm", subtle)}>{t("trash.subtitle")}</p>
          </div>
        </div>
      </header>

      <section className={cx("overflow-hidden rounded-2xl border", border, panel)}>
        <div className={cx("border-b p-4", border)}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className={cx("flex h-11 w-full max-w-xl items-center gap-2 rounded-xl border px-3", border, soft)}>
              <span className={subtle}><Icon.Search /></span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("trash.search")} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </label>
            <span className={cx("text-sm", subtle)}>{t("trash.total")}: <strong className={isDark ? "text-slate-100" : "text-slate-800"}>{visibleEntries.length}</strong></span>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {filters.map((item) => (
              <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={cx("h-9 shrink-0 rounded-lg border px-3 text-sm font-medium transition", filter === item.id ? "border-indigo-600 bg-indigo-600 text-white" : cx(border, isDark ? "text-slate-300 hover:bg-white/5" : "bg-white text-slate-600 hover:bg-slate-50"))}>
                {item.label} <span className={cx("ml-1 tabular-nums", filter === item.id ? "text-indigo-100" : subtle)}>{countFor(item.id)}</span>
              </button>
            ))}
          </div>
          {message && <div className={cx("mt-3 rounded-lg px-3 py-2 text-sm", message === t("trash.restoreSuccess") || message === t("trash.deleteSuccess") ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600")}>{message}</div>}
        </div>

        {loading ? (
          <div className={cx("flex min-h-64 items-center justify-center text-sm", subtle)}>{t("trash.loading")}</div>
        ) : visibleEntries.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <span className={cx("flex h-14 w-14 items-center justify-center rounded-full", soft, subtle)}><Icon.Trash /></span>
            <p className={cx("mt-3 text-sm", subtle)}>{t("trash.empty")}</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[850px] text-sm">
                <thead className={cx(soft, subtle)}><tr><th className="px-5 py-3 text-left font-semibold">{t("trash.type")}</th><th className="px-5 py-3 text-left font-semibold">{t("trash.record")}</th><th className="px-5 py-3 text-left font-semibold">{t("trash.deletedAt")}</th><th className="px-5 py-3 text-left font-semibold">{t("trash.deletedBy")}</th><th className="w-56 px-5 py-3 text-right font-semibold">{t("trash.actions")}</th></tr></thead>
                <tbody>{visibleEntries.map((entry) => <tr key={entry.id} className={cx("border-t", border)}><td className="px-5 py-4"><span className={cx("inline-flex rounded-md px-2 py-1 text-xs font-semibold", isDark ? "bg-white/7 text-slate-300" : "bg-slate-100 text-slate-600")}>{typeLabel(entry)}</span></td><td className="px-5 py-4"><div className="font-medium">{entry.label}</div><div className={cx("mt-1 max-w-xl truncate text-xs", subtle)}>{entry.summary || `#${entry.entityId}`}</div></td><td className="whitespace-nowrap px-5 py-4 tabular-nums">{formatDate(entry.deletedAt)}</td><td className="px-5 py-4">{entry.deletedBy || "—"}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><ActionButtons entry={entry} busy={busyId === entry.id} isDark={isDark} restoreLabel={t("trash.restore")} deleteLabel={t("trash.deleteForever")} onRestore={() => restoreEntry(entry)} onDelete={() => setDeleteTarget(entry)} /></div></td></tr>)}</tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">{visibleEntries.map((entry) => <article key={entry.id} className={cx("p-4", border)}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className={cx("inline-flex rounded-md px-2 py-1 text-xs font-semibold", isDark ? "bg-white/7 text-slate-300" : "bg-slate-100 text-slate-600")}>{typeLabel(entry)}</span><h2 className="mt-2 truncate font-semibold">{entry.label}</h2><p className={cx("mt-1 line-clamp-2 text-xs", subtle)}>{entry.summary}</p></div></div><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className={subtle}>{t("trash.deletedAt")}</dt><dd className="mt-1 tabular-nums">{formatDate(entry.deletedAt)}</dd></div><div><dt className={subtle}>{t("trash.deletedBy")}</dt><dd className="mt-1">{entry.deletedBy || "—"}</dd></div></dl><div className="mt-4 flex gap-2"><ActionButtons entry={entry} busy={busyId === entry.id} isDark={isDark} restoreLabel={t("trash.restore")} deleteLabel={t("trash.deleteForever")} onRestore={() => restoreEntry(entry)} onDelete={() => setDeleteTarget(entry)} /></div></article>)}</div>
          </>
        )}
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => !busyId && setDeleteTarget(null)}>
          <div className={cx("w-full max-w-md rounded-2xl border p-5 shadow-2xl", border, panel)} onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold">{t("trash.deleteForever")}</h2>
            <p className={cx("mt-2 text-sm", subtle)}>{t("trash.confirmDelete")}</p>
            <div className={cx("mt-4 rounded-xl border p-3", border, soft)}><div className="font-medium">{deleteTarget.label}</div><div className={cx("mt-1 text-xs", subtle)}>{deleteTarget.summary}</div></div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => setDeleteTarget(null)} className={cx("h-10 rounded-lg border px-4 text-sm font-medium", border)}>{t("trash.cancel")}</button><button type="button" disabled={Boolean(busyId)} onClick={() => void permanentlyDelete()} className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-60">{busyId ? t("trash.loading") : t("trash.deleteForever")}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButtons({ entry, busy, isDark, restoreLabel, deleteLabel, onRestore, onDelete }: { entry: TrashEntry; busy: boolean; isDark: boolean; restoreLabel: string; deleteLabel: string; onRestore: () => void; onDelete: () => void }) {
  return <><button type="button" disabled={busy} onClick={onRestore} title={`${restoreLabel}: ${entry.label}`} className={cx("inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium text-indigo-600 disabled:opacity-50", isDark ? "border-white/10 hover:bg-white/7" : "border-indigo-200 hover:bg-indigo-50")}><Icon.Restore />{restoreLabel}</button><button type="button" disabled={busy} onClick={onDelete} title={`${deleteLabel}: ${entry.label}`} aria-label={`${deleteLabel}: ${entry.label}`} className={cx("flex h-9 w-9 items-center justify-center rounded-lg border text-rose-600 disabled:opacity-50", isDark ? "border-white/10 hover:bg-rose-500/10" : "border-rose-200 hover:bg-rose-50")}><Icon.Delete /></button></>;
}
