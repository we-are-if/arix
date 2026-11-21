import { useEffect, useId, useRef, useState } from "react";
import "./display-scale.css";

const clampScale = (value: number) => Number.isFinite(value) ? Math.min(150, Math.max(80, Math.round(value / 10) * 10)) : 100;

// A device preference only: never part of a Daily snapshot or API request.
export default function DisplayScaleControl({ companyId = "azartmembran", theme, onToggleTheme }: { companyId?: string; theme: "light" | "dark"; onToggleTheme: () => void }) {
  const storageKey = `arix-daily-${companyId}-display-scale`;
  const viewerAfterDecisionKey = `arix-daily-${companyId}-invoice-viewer-after-decision`;
  const sliderId = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const [scale, setScale] = useState(() => {
    try { return clampScale(Number(localStorage.getItem(storageKey) || 100)); }
    catch { return 100; }
  });
  const [viewerAfterDecision, setViewerAfterDecision] = useState<"stay" | "close">(() => {
    try { return localStorage.getItem(viewerAfterDecisionKey) === "close" ? "close" : "stay"; }
    catch { return "stay"; }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.dailyDisplayScale = String(scale);
    root.style.setProperty("--daily-display-scale", String(scale / 100));
    try { localStorage.setItem(storageKey, String(scale)); } catch { /* Private mode can disable storage. */ }
    return () => {
      delete root.dataset.dailyDisplayScale;
      root.style.removeProperty("--daily-display-scale");
    };
  }, [scale, storageKey]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.dailyInvoiceViewerAfterDecision = viewerAfterDecision;
    try { localStorage.setItem(viewerAfterDecisionKey, viewerAfterDecision); } catch { /* Private mode can disable storage. */ }
    return () => { delete root.dataset.dailyInvoiceViewerAfterDecision; };
  }, [viewerAfterDecision, viewerAfterDecisionKey]);

  return <details className="display-scale-control" ref={details}
    onKeyDown={(event) => { if (event.key === "Escape") { details.current?.removeAttribute("open"); details.current?.querySelector("summary")?.focus(); } }}>
    <summary className="topbar-option display-scale-toggle" aria-label="Görünüş ayarları" title="Görünüş ayarları">
      <span aria-hidden="true" className="display-scale-symbol">A<span>a</span></span>
    </summary>
    <div className="display-scale-panel">
      <button type="button" className="display-theme-toggle" onClick={onToggleTheme} aria-pressed={theme === "dark"}>Qaranlıq mövzu <span aria-hidden="true">{theme === "dark" ? "Açıq" : "Sönülü"}</span></button>
      <div className="display-viewer-after-decision">
        <div><b>Qaimə əməliyyatından sonra</b><small>Təsdiq və ya ləğvdən sonra görüntü pəncərəsi</small></div>
        <div role="group" aria-label="Qaimə əməliyyatından sonra">
          <button type="button" className={viewerAfterDecision === "stay" ? "active" : ""} onClick={() => setViewerAfterDecision("stay")}>Açıq saxla</button>
          <button type="button" className={viewerAfterDecision === "close" ? "active" : ""} onClick={() => setViewerAfterDecision("close")}>Bağla</button>
        </div>
      </div>
      <div className="display-scale-heading"><label htmlFor={sliderId}>Görünüş ölçüsü</label><output htmlFor={sliderId} aria-live="polite">{scale}%</output></div>
      <p>Yazı və düymələr birlikdə böyüyür. Yalnız bu cihazda saxlanır.</p>
      <div className="display-scale-slider">
        <button type="button" aria-label="Görünüşü kiçilt" disabled={scale === 80} onClick={() => setScale((value) => clampScale(value - 10))}>A−</button>
        <input id={sliderId} type="range" min="80" max="150" step="10" value={scale} aria-valuetext={`${scale}%`} onChange={(event) => setScale(clampScale(Number(event.target.value)))} />
        <button type="button" aria-label="Görünüşü böyüt" disabled={scale === 150} onClick={() => setScale((value) => clampScale(value + 10))}>A+</button>
      </div>
      <button type="button" className="display-scale-reset" disabled={scale === 100} onClick={() => setScale(100)}>Standart ölçüyə qaytar</button>
    </div>
  </details>;
}
