import { ChevronDown, ListChecks, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "./note-summary.css";

type Strictness = "high" | "medium" | "low";
type Row = { id: string; note?: string; kind: string; category: string; amount: number; accountId: string; time?: string; counterparty?: string };
const labels = { income: "Mədaxil", expense: "Məxaric", supplier: "Təchizatçıya ödəniş", transfer: "Köçürmə" };
type Bucket = keyof typeof labels;
const bucketOf = (row: Row): Bucket => row.kind === "expense"
  ? (row.category.toLocaleLowerCase("az").includes("təch") ? "supplier" : "expense")
  : row.kind === "transfer" ? "transfer" : "income";
const clean = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ");
const forms: Record<string, string> = {
  ev: "ev", evi: "ev", evin: "ev",
  anbar: "anbar", anbarı: "anbar", anbarın: "anbar",
  ofis: "ofis", ofisi: "ofis", ofisin: "ofis",
  mağaza: "mağaza", mağazası: "mağaza",
};
function keyFor(note: string, strictness: Strictness) {
  const words = clean(note).toLocaleLowerCase("az").split(" ");
  if (strictness === "high" || words.length < 2) return words.join(" ");
  return words.map((word, index) => {
    if (index === 0 || /\d/u.test(word)) return word;
    if (Object.hasOwn(forms, word)) return forms[word];
    if (strictness === "low") {
      const reduced = word.replace(/(\p{L})\1+/gu, "$1");
      if (Object.hasOwn(forms, reduced)) return forms[reduced];
    }
    return word;
  }).join(" ");
}

export default function NoteSummary<T extends Row, C extends string>({ date, entries, currencyFor, formatMoney, onClose, storageKey, localOnly = false }: {
  storageKey: string; date: string; entries: T[]; currencyFor: (row: T) => C; localOnly?: boolean;
  formatMoney: (amount: number, currency: C) => string; onClose: () => void;
}) {
  const [strictness, setStrictness] = useState<Strictness>("medium");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [legacyMerges, setLegacyMerges] = useState<string[][]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(value) ? value.filter((item): item is string[] => Array.isArray(item) && item.every((id) => typeof id === "string")) : [];
    } catch { return []; }
  });
  const [shared, setShared] = useState<{ revision: number; groups: string[][] } | null>(() => localOnly ? { revision: 0, groups: legacyMerges } : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/daily/note-summary-merges/${encodeURIComponent(date)}`;
  const merges = shared?.groups ?? [];
  useEffect(() => {
    if (localOnly) return;
    let active = true;
    const refresh = async () => {
      try {
        const res = await fetch(endpoint, { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error();
        const { data } = await res.json();
        if (active) setShared((previous) => !previous || data.revision > previous.revision ? data : previous);
      } catch { /* Keep the last confirmed shared view. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [endpoint, localOnly]);
  const availableIds = new Set(entries.filter((entry) => entry.note?.trim() && entry.note.trim() !== ".").map((entry) => entry.id));
  const updateMerges = async (next: string[][]) => {
    if (!shared || saving) return false;
    setSaving(true);
    setError("");
    try {
      const groups = next.map((group) => group.filter((id) => availableIds.has(id))).filter((group) => group.length >= 2);
      if (localOnly) {
        localStorage.setItem(storageKey, JSON.stringify(groups));
        setShared({ revision: shared.revision + 1, groups });
        setLegacyMerges([]);
        return true;
      }
      const res = await fetch(endpoint, {
        method: "PUT", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: shared.revision, groups }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Birləşdirmə saxlanılmadı.");
      setShared((previous) => !previous || result.data.revision > previous.revision ? result.data : previous);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Birləşdirmə saxlanılmadı.");
      return false;
    } finally { setSaving(false); }
  };
  const publishLegacy = async () => {
    const used = new Set(merges.flat());
    const pending = legacyMerges.map((group) => [...new Set(group)].filter((id) => availableIds.has(id)));
    const additions: string[][] = [];
    for (const group of pending) {
      if (group.length < 2 || group.every((id) => used.has(id) && merges.some((current) => group.every((key) => current.includes(key))))) continue;
      if (group.some((id) => used.has(id))) {
        setError("Köhnə seçim ortaq birləşdirmə ilə üst-üstə düşür. Mövcud qrupları yoxlayın.");
        return;
      }
      group.forEach((id) => used.add(id));
      additions.push(group);
    }
    if (!additions.length || await updateMerges([...merges, ...additions])) {
      try { localStorage.removeItem(storageKey); } catch { /* Shared copy remains available. */ }
      setLegacyMerges([]);
    }
  };
  const levelLabel = { low: "Aşağı", medium: "Orta", high: "Yüksək" }[strictness];
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  const groups = useMemo(() => {
    const grouped = new Map<string, { label: string; rows: T[] }>();
    for (const row of entries) {
      const label = clean(row.note || "");
      if (!label || label === ".") continue;
      const key = keyFor(label, strictness);
      const current = grouped.get(key);
      if (current) current.rows.push(row);
      else grouped.set(key, { label, rows: [row] });
    }
    return [...grouped.entries()].sort(([, a], [, b]) => a.label.localeCompare(b.label, "az"));
  }, [entries, strictness]);
  const owned = new Set<string>();
  const combined = merges.flatMap((ids, index) => {
    const lookup = new Set(ids);
    const parts = groups.flatMap(([, group]) => {
      const rows = group.rows.filter((row) => lookup.has(row.id) && !owned.has(row.id));
      return rows.length ? [{ label: group.label, rows }] : [];
    });
    const rows = parts.flatMap((part) => part.rows);
    if (rows.length < 2) return [];
    rows.forEach((row) => owned.add(row.id));
    return [{ key: `merge:${index}`, mergeIndex: index, label: [...new Set(parts.map((part) => part.label))].join(" + "), rows, parts }];
  });
  const visibleGroups = [...combined, ...groups.flatMap(([key, group]) => {
    const rows = group.rows.filter((row) => !owned.has(row.id));
    return rows.length ? [{ key: `group:${key}`, mergeIndex: null, label: group.label, rows, parts: null }] : [];
  })];
  const selectedGroups = visibleGroups.filter((group) => selected.includes(group.key));
  const mergeSelected = async () => {
    if (selectedGroups.length < 2) return;
    const consumed = new Set(selectedGroups.map((group) => group.mergeIndex));
    if (!await updateMerges([...merges.filter((_, index) => !consumed.has(index)), selectedGroups.flatMap((group) => group.rows.map((row) => row.id))])) return;
    setSelected([]);
    setSelecting(false);
  };
  return <dialog ref={dialogRef} className="note-summary-dialog" aria-labelledby="note-summary-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="note-summary-header">
      <i className="note-summary-emblem"><ListChecks size={20} aria-hidden="true" /></i>
      <div className="note-summary-heading"><h2 id="note-summary-title">Qeydlər üzrə yekun</h2><small>{date.split("-").reverse().join(".")} · {visibleGroups.length} qrup</small></div>
      <button type="button" className="note-summary-icon" aria-label="Uyğunluq ayarları" title={`Sərtlik: ${levelLabel}`} aria-expanded={settingsOpen} aria-controls="note-summary-settings" onClick={() => setSettingsOpen(!settingsOpen)}><SlidersHorizontal size={17} aria-hidden="true" /></button>
      <button type="button" className="note-summary-icon" aria-label="Bağla" title="Bağla" onClick={onClose}><X size={19} aria-hidden="true" /></button>
    </header>
    <fieldset id="note-summary-settings" hidden={!settingsOpen}>
      <legend>Uyğunluq sərtliyi</legend>
      <div className="note-summary-levels">
        {([["low", "Aşağı"], ["medium", "Orta"], ["high", "Yüksək"]] as const).map(([value, label]) =>
          <label key={value}><input type="radio" name="note-summary-level" checked={strictness === value} onChange={() => { setStrictness(value); setSelected([]); }} />{label}</label>)}
      </div>
    </fieldset>
    {!shared && <small className="note-summary-merge-tools" role="status">Ortaq birləşdirmələr serverdən yüklənir…</small>}
    {!localOnly && legacyMerges.length > 0 && <div className="note-summary-merge-tools"><button type="button" disabled={!shared || saving} onClick={() => void publishLegacy()}>Bu cihazdakı əvvəlki birləşdirmələri paylaş</button></div>}
    {error && <div className="note-summary-merge-tools" role="alert">{error}</div>}
    {visibleGroups.length >= 2 && <div className="note-summary-merge-tools">
      {selecting ? <>
        <span>{selectedGroups.length} qrup seçilib</span>
        <button type="button" onClick={() => { setSelecting(false); setSelected([]); }}>İmtina</button>
        <button type="button" disabled={!shared || saving || selectedGroups.length < 2} onClick={mergeSelected}>Seçilənləri birləşdir</button>
      </> : <button type="button" disabled={!shared || saving} onClick={() => setSelecting(true)}>Qrupları seç</button>}
    </div>}
    <div className="note-summary-list">
      {groups.length === 0 && <p>Bu gün qeyd yazılmış əməliyyat yoxdur.</p>}
      {visibleGroups.map((group) => {
        const totals = new Map<string, { bucket: Bucket; currency: C; cents: number }>();
        for (const row of group.rows) {
          const bucket = bucketOf(row);
          const currency = currencyFor(row);
          const totalKey = `${bucket}:${currency}`;
          const previous = totals.get(totalKey)?.cents ?? 0;
          totals.set(totalKey, { bucket, currency, cents: previous + Math.round(Math.abs(row.amount) * 100) });
        }
        const combinedTotals = new Map<C, number>();
        if (group.parts) {
          for (const { currency, cents } of totals.values()) {
            combinedTotals.set(currency, (combinedTotals.get(currency) ?? 0) + cents);
          }
        }
        return <div key={`${strictness}:${group.key}`} className="note-summary-group">
          {selecting && <label className="note-summary-select"><input type="checkbox" checked={selected.includes(group.key)} onChange={(event) => {
            const checked = event.target.checked;
            setSelected((current) => checked ? [...current, group.key] : current.filter((key) => key !== group.key));
          }} />{group.label} qrupunu seç</label>}
          <details>
          <summary>
            <div className="note-summary-group-title"><strong>{group.label}</strong><small>{group.mergeIndex !== null ? "Birləşdirilib · " : ""}{group.rows.length} əməliyyat</small><ChevronDown size={15} aria-hidden="true" /></div>
            <div className="note-summary-totals">{group.parts && <strong className="note-summary-total-label">Yekun</strong>}{[...totals.values()].map(({ bucket, currency, cents }) =>
              <span key={`${bucket}:${currency}`}>{labels[bucket]}: <b>{formatMoney(cents / 100, currency)}</b></span>)}
              {group.parts && <span className="note-summary-combined-total">Cəmi: <b>{[...combinedTotals].map(([currency, cents]) => formatMoney(cents / 100, currency)).join(" · ")}</b></span>}
            </div>
          </summary>
          {(group.parts || [{ label: group.label, rows: group.rows }]).map((part) =>
            <div key={part.rows[0].id} className={group.parts ? "note-summary-part" : undefined}>
              {group.parts && <h3>{part.label}</h3>}
          <ul>{part.rows.map((row) => <li key={row.id}>
            <span>{row.note}<small>{[row.time, row.counterparty, labels[bucketOf(row)]].filter(Boolean).join(" · ")}</small></span>
            <b>{formatMoney(Math.abs(row.amount), currencyFor(row))}</b>
          </li>)}</ul>
            </div>
          )}
          {group.mergeIndex !== null && <button type="button" className="note-summary-split" disabled={saving} onClick={async () => {
            if (await updateMerges(merges.filter((_, index) => index !== group.mergeIndex))) setSelected([]);
          }}>Birləşməni ləğv et</button>}
          </details>
        </div>;
      })}
    </div>
  </dialog>;
}
