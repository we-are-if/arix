import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TOAST_EVENT_NAME, type ToastRequest, type ToastTone } from "../toast";

type ToastItem = ToastRequest & { id: number };

const toneStyles: Record<ToastTone, { icon: string; border: string; symbol: string }> = {
  success: { icon: "bg-emerald-50 text-emerald-600", border: "border-emerald-200", symbol: "✓" },
  error: { icon: "bg-rose-50 text-rose-600", border: "border-rose-200", symbol: "!" },
  warning: { icon: "bg-amber-50 text-amber-700", border: "border-amber-200", symbol: "!" },
  info: { icon: "bg-indigo-50 text-indigo-600", border: "border-indigo-200", symbol: "i" },
};

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const request = (event as CustomEvent<ToastRequest>).detail;
      if (!request?.message?.trim()) return;
      const item: ToastItem = { id: Date.now() + Math.random(), tone: "info", duration: 4200, ...request };
      setItems((current) => [...current.slice(-3), item]);
      if (item.duration !== 0) window.setTimeout(() => dismiss(item.id), Math.max(1200, item.duration ?? 4200));
    };
    window.addEventListener(TOAST_EVENT_NAME, onToast);
    return () => window.removeEventListener(TOAST_EVENT_NAME, onToast);
  }, [dismiss]);

  return (
    <>
      {children}
      {createPortal(
        <section aria-label="Bildirişlər" aria-live="polite" className="pointer-events-none fixed inset-x-3 top-[max(1rem,env(safe-area-inset-top))] z-[300] flex flex-col items-end gap-2 sm:left-auto sm:right-5 sm:w-[min(25rem,calc(100vw-2.5rem))]">
          {items.map((item) => {
            const tone = toneStyles[item.tone ?? "info"];
            return (
              <article key={item.id} role={item.tone === "error" ? "alert" : "status"} className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-white p-3.5 text-slate-900 shadow-xl shadow-slate-900/10 ${tone.border}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${tone.icon}`}>{tone.symbol}</span>
                <div className="min-w-0 flex-1 pt-0.5">
                  {item.title && <div className="text-sm font-semibold">{item.title}</div>}
                  <p className={`${item.title ? "mt-0.5" : ""} break-words text-sm leading-5 text-slate-600`}>{item.message}</p>
                </div>
                <button type="button" onClick={() => dismiss(item.id)} aria-label="Bağla" title="Bağla" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </button>
              </article>
            );
          })}
        </section>,
        document.body,
      )}
    </>
  );
}
