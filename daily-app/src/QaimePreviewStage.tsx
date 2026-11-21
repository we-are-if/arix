import { useEffect, useRef, useState } from "react";
import QaimeDocument from "./QaimeDocument";
import type { InvoiceRecord } from "./qaimeParser";

interface QaimePreviewStageProps {
  invoice: InvoiceRecord;
  companyName?: string;
  paperRef?: React.Ref<HTMLElement | null>;
  mode?: "viewer" | "editor";
}

export default function QaimePreviewStage({
  invoice,
  companyName = "AzArt Membran",
  paperRef,
  mode = "viewer",
}: QaimePreviewStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalPaperRef = useRef<HTMLElement | null>(null);

  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      return Math.min(window.innerWidth, 1200);
    }
    return 794;
  });
  const [paperHeight, setPaperHeight] = useState<number>(1123);
  const [zoomMode, setZoomMode] = useState<"fit" | "full">("fit");

  // The device-wide Daily scale uses CSS zoom.  On iPhone Safari, combining
  // that zoom with this stage's A4 fit transform makes the qaimə a twice-
  // scaled composited layer (and text becomes visibly soft).  A viewer is
  // full-screen, so it can use the actual viewport while it is open; the
  // user's chosen scale is restored immediately on close.
  useEffect(() => {
    if (mode !== "viewer") return;

    const root = document.documentElement;
    const previousInlineZoom = root.style.zoom;
    root.dataset.dailyQaimeViewer = "true";
    root.style.zoom = "1";

    return () => {
      delete root.dataset.dailyQaimeViewer;
      root.style.zoom = previousInlineZoom;
    };
  }, [mode]);

  const setRef = (el: HTMLElement | null) => {
    internalPaperRef.current = el;
    if (!paperRef) return;
    if (typeof paperRef === "function") {
      paperRef(el);
    } else if ("current" in paperRef) {
      (paperRef as React.MutableRefObject<HTMLElement | null>).current = el;
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const cw = container.clientWidth;
      if (cw > 0) setContainerWidth(cw);
      if (internalPaperRef.current) {
        const ph = internalPaperRef.current.offsetHeight;
        if (ph > 0) setPaperHeight(ph);
      }
    };

    updateDimensions();

    const ro = new ResizeObserver(() => {
      updateDimensions();
    });
    ro.observe(container);
    if (internalPaperRef.current) {
      ro.observe(internalPaperRef.current);
    }

    window.addEventListener("resize", updateDimensions);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, [invoice]);

  const A4_WIDTH = 794;
  const padding = mode === "viewer" ? (containerWidth < 760 ? 12 : 24) : 8;
  const availableWidth = containerWidth > 0 ? Math.max(260, containerWidth - padding) : A4_WIDTH;

  const fitScale = availableWidth < A4_WIDTH ? Math.min(1, Math.max(0.3, availableWidth / A4_WIDTH)) : 1;
  const scale = zoomMode === "full" ? 1 : fitScale;

  const scaledWidth = Math.round(A4_WIDTH * scale);
  const scaledHeight = Math.round(paperHeight * scale);

  return (
    <div
      ref={containerRef}
      className={`qaime-stage-outer qaime-stage-${mode}`}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowX: zoomMode === "full" && scale === 1 ? "auto" : "hidden",
        WebkitOverflowScrolling: "touch",
        boxSizing: "border-box",
        padding: mode === "viewer" ? "8px 0 24px" : "4px 0",
      }}
    >
      {mode === "viewer" && fitScale < 0.98 && (
        <div className="qaime-stage-toolbar no-print">
          <button
            type="button"
            className={`qaime-scale-btn ${zoomMode === "fit" ? "active" : ""}`}
            onClick={() => setZoomMode("fit")}
          >
            ⛶ Ekrana sığdır ({Math.round(fitScale * 100)}%)
          </button>
          <button
            type="button"
            className={`qaime-scale-btn ${zoomMode === "full" ? "active" : ""}`}
            onClick={() => setZoomMode("full")}
          >
            100% Tam ölçü
          </button>
        </div>
      )}

      <div
        className="qaime-stage-viewport"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          position: "relative",
          overflow: "visible",
          flexShrink: 0,
          margin: "0 auto",
        }}
      >
        <div
          className="qaime-stage-transformer"
          style={{
            width: `${A4_WIDTH}px`,
            height: `${paperHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          <QaimeDocument
            ref={setRef}
            invoice={invoice}
            companyName={companyName}
          />
        </div>
      </div>
    </div>
  );
}
