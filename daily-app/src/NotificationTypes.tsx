import { useEffect, useState } from "react";

const options = [
  ["income", "Mədaxil"], ["expense", "Məxaric"], ["supplier", "Təchizatçıya ödəniş"],
  ["transfer", "Köçürmə"], ["invoice", "Qaimə bildirişləri"], ["approval", "Əməliyyat təsdiqləri"], ["day_close", "Gün bağlanışı"],
] as const;
const endpoint = "/api/daily/notification-preferences";

export default function NotificationTypes({ isSparexpert = false }: { isSparexpert?: boolean }) {
  const visibleOptions = isSparexpert ? options.filter(([key]) => key !== "invoice" && key !== "supplier") : options;
  const [saved, setSaved] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const { data } = await res.json();
        if (!controller.signal.aborted) { setSaved(data); setDraft(data); }
      })
      .catch(() => { if (!controller.signal.aborted) setMessage("Bildiriş seçimləri yüklənmədi."); });
    return () => controller.abort();
  }, []);
  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(endpoint, {
        method: "PUT", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ disabled: draft }),
      });
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      setSaved(data);
      setDraft(data);
      setMessage("Seçimlər yadda saxlanıldı.");
    } catch { setMessage("Seçimlər yadda saxlanılmadı."); }
    finally { setBusy(false); }
  };
  const changed = saved && options.some(([key]) => saved.includes(key) !== draft.includes(key));
  return <fieldset style={{ margin: "8px 0", maxHeight: "32dvh", overflow: "auto", border: "1px solid var(--arix-line)", borderRadius: 8 }}>
    <legend>Bildiriş növləri</legend>
    <p>Bu seçimlər hesabınıza bağlıdır və bütün cihazlarda işləyir.</p>
    {visibleOptions.map(([key, label]) => <label key={key}>
      <span>{label}</span><input type="checkbox" checked={Boolean(saved && !draft.includes(key))} disabled={!saved || busy}
        onChange={(event) => setDraft((current) => event.target.checked ? current.filter((item) => item !== key) : [...current, key])} />
    </label>)}
    <button type="button" className="notification-action-link" disabled={!changed || busy} onClick={() => void save()}>Yadda saxla</button>
    {message && <p role="status">{message}</p>}
  </fieldset>;
}
