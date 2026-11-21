import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Palette, Printer } from "lucide-react";

export type PrintMode = "bw" | "color";

export const printQaimeDocument = (targetPaper: HTMLElement, mode: PrintMode = "bw") => {
  const css = Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules, (rule) => rule.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.left = "-9999px";
  frame.style.top = "0";
  frame.style.width = "210mm";
  frame.style.height = "297mm";
  frame.style.border = "none";
  frame.style.visibility = "hidden";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }

  const baseSharedCss = `
    @page {
      size: A4 portrait;
      margin: 6mm 8mm 12mm 8mm;
    }
    * {
      box-sizing: border-box !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .approval-paper {
      position: relative !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 0 10mm !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      aspect-ratio: auto !important;
      min-height: auto !important;
      display: block !important;
      box-sizing: border-box !important;
      font-family: Aptos, "Segoe UI", Arial, sans-serif !important;
      font-size: 11.5px !important;
      background: #ffffff !important;
    }
    /* Table wrapper and table */
    .approval-paper-table-wrap {
      width: calc(100% - 24px) !important;
      margin: 8px 12px 0 !important;
      border-radius: 6px !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      padding: 0 !important;
    }
    .approval-paper-table-wrap table {
      width: 100% !important;
      margin: 0 !important;
      border-collapse: collapse !important;
      border: none !important;
      table-layout: fixed !important;
      box-shadow: none !important;
      font-size: 11.5px !important;
    }
    .approval-paper-table-wrap th,
    .approval-paper-table-wrap td {
      padding: 6px 8px !important;
      font-size: 11.5px !important;
    }
    .approval-paper-table-wrap tr th:first-child,
    .approval-paper-table-wrap tr td:first-child {
      border-left: none !important;
      width: 6% !important;
      text-align: center !important;
    }
    .approval-paper-table-wrap tr th:last-child,
    .approval-paper-table-wrap tr td:last-child {
      border-right: none !important;
    }
    .approval-paper-table-wrap thead tr:first-child th {
      border-top: none !important;
    }
    .approval-paper-table-wrap tfoot tr:last-child td,
    .approval-paper-table-wrap tbody tr:last-child td {
      border-bottom: none !important;
    }
    .approval-paper-table-wrap th:first-child,
    .approval-paper-table-wrap td:first-child,
    .approval-paper-table-wrap .approval-col-index,
    .approval-paper-table-wrap .approval-cell-index {
      width: 6% !important;
      text-align: center !important;
    }
    .approval-paper-table-wrap th:nth-child(2),
    .approval-paper-table-wrap td:nth-child(2),
    .approval-paper-table-wrap .approval-col-name,
    .approval-paper-table-wrap .approval-cell-name { width: 38% !important; text-align: left !important; }
    .approval-paper-table-wrap th:nth-child(3),
    .approval-paper-table-wrap td:nth-child(3),
    .approval-paper-table-wrap .approval-col-code,
    .approval-paper-table-wrap .approval-cell-code { width: 15% !important; text-align: center !important; }
    .approval-paper-table-wrap th:nth-child(4),
    .approval-paper-table-wrap td:nth-child(4),
    .approval-paper-table-wrap .approval-col-qty,
    .approval-paper-table-wrap .approval-quantity-cell { width: 13% !important; text-align: right !important; }
    .approval-paper-table-wrap th:nth-child(5),
    .approval-paper-table-wrap td:nth-child(5),
    .approval-paper-table-wrap .approval-col-price,
    .approval-paper-table-wrap .approval-cell-price { width: 14% !important; text-align: right !important; }
    .approval-paper-table-wrap th:nth-child(6),
    .approval-paper-table-wrap td:nth-child(6),
    .approval-paper-table-wrap .approval-col-total,
    .approval-paper-table-wrap .approval-cell-total { width: 14% !important; text-align: right !important; }
    .approval-paper-table-wrap thead th {
      font-size: 10.5px !important;
      font-weight: 800 !important;
      text-transform: uppercase !important;
    }
    .approval-page-footer {
      position: fixed !important;
      bottom: 2.5mm !important;
      left: 8mm !important;
      right: 8mm !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      margin: 0 !important;
      padding: 5px 2px 0 !important;
      border-top: 1px solid #dfe5ed !important;
      color: #66758b !important;
      font-size: 8.5px !important;
      background: #ffffff !important;
      z-index: 9999 !important;
    }
    .approval-page-footer > span {
      display: flex !important;
      align-items: center !important;
      gap: 5px !important;
    }
    .approval-page-footer svg {
      width: 15px !important;
      height: 15px !important;
    }
    .approval-page-footer b {
      color: #172033 !important;
      font-size: 9.5px !important;
    }
    .approval-totals span {
      font-size: 11px !important;
      font-weight: 700 !important;
    }
    .approval-totals span b {
      font-weight: 700 !important;
    }
    .approval-totals strong {
      font-size: 13.5px !important;
    }
  `;

  const colorPrintCss = `
    ${baseSharedCss}
    html, body {
      color: #172033 !important;
    }
    .approval-paper-table-wrap {
      border: 1px solid #dfe5ed !important;
      background: #ffffff !important;
    }
    .approval-paper-table-wrap table {
      background: #ffffff !important;
    }
    .approval-paper-table-wrap th,
    .approval-paper-table-wrap td {
      border: 1px solid #e8ecf1 !important;
      color: #182236 !important;
    }
    .approval-paper-table-wrap thead {
      background: #f2f6fa !important;
    }
    .approval-paper-table-wrap thead th {
      border-bottom: 1px solid #e8ecf1 !important;
    }
    .approval-paper-table-wrap tfoot tr {
      background: #f1f5f9 !important;
    }
    .approval-paper-table-wrap .approval-table-total-row td,
    .approval-paper-table-wrap tfoot tr td {
      border-top: 2px solid #cbd5e1 !important;
      font-weight: 800 !important;
    }
    .approval-paper-return-wrap {
      border-color: #fca5a5 !important;
    }
    .approval-paper-return-wrap th,
    .approval-paper-return-wrap td {
      border-color: #fecaca !important;
    }
    .approval-paper-return-wrap tfoot td,
    .approval-paper-return-wrap .approval-table-total-row td {
      border-top: 2px solid #f87171 !important;
    }
  `;

  const bwPrintCss = `
    ${baseSharedCss}
    html, body {
      color: #000000 !important;
    }
    .approval-paper {
      color: #000000 !important;
    }

    /* B&W Laser: All background fills become pure crisp white (no toner tramming/blur) */
    .approval-brand-bar,
    .approval-summary-strip,
    .approval-summary-strip > div,
    .approval-company-panel,
    .approval-general-terms,
    .approval-bottom-grid .approval-totals,
    .approval-note-box,
    .approval-status-badge,
    .approval-paper table,
    .approval-paper thead,
    .approval-paper thead th,
    .approval-paper tbody tr,
    .approval-paper tbody td,
    .approval-paper tfoot tr,
    .approval-paper tfoot td {
      background: #ffffff !important;
      background-color: #ffffff !important;
    }

    /* All text & labels become sharp solid black */
    .approval-paper * {
      color: #000000 !important;
      -webkit-text-fill-color: #000000 !important;
    }

    /* Header brand accent line */
    .approval-brand-bar::after {
      background: #000000 !important;
      height: 1.5px !important;
    }

    /* Company monogram */
    .approval-company-monogram {
      background: #ffffff !important;
      color: #000000 !important;
      border: 1.5px solid #000000 !important;
    }

    /* Status badge */
    .approval-status-badge {
      border: 1.5px solid #000000 !important;
      background: #ffffff !important;
    }
    .approval-status-badge i {
      background: #000000 !important;
    }
    .approval-status-badge i svg {
      color: #ffffff !important;
      stroke: #ffffff !important;
      fill: none !important;
    }

    /* Meta summary strip */
    .approval-summary-strip {
      border: 1px solid #000000 !important;
      box-shadow: none !important;
    }
    .approval-summary-strip > div + div {
      border-left: 1px solid #000000 !important;
    }

    /* Vector icons */
    .approval-vector-icon {
      background: #ffffff !important;
      border: 1px solid #000000 !important;
      color: #000000 !important;
    }
    .approval-vector-icon svg {
      color: #000000 !important;
      stroke: #000000 !important;
      fill: none !important;
    }

    /* Customer details panel */
    .approval-company-panel {
      border: 1px solid #000000 !important;
      box-shadow: none !important;
    }
    .approval-company-panel-contact {
      border-left: 1px solid #000000 !important;
    }

    /* Product Lines Table - Single frame with rounded corners, uniform 1px lines everywhere except total row */
    .approval-paper-table-wrap {
      border: 1px solid #000000 !important;
      background: #ffffff !important;
    }
    .approval-paper-table-wrap table {
      background: #ffffff !important;
    }
    .approval-paper-table-wrap th,
    .approval-paper-table-wrap td {
      border: 1px solid #000000 !important;
      background: #ffffff !important;
      color: #000000 !important;
    }
    .approval-paper-table-wrap thead th {
      border-bottom: 1px solid #000000 !important;
      font-weight: 800 !important;
    }
    /* Only the final total row gets a thicker divider */
    .approval-paper-table-wrap .approval-table-total-row td,
    .approval-paper-table-wrap tfoot tr td {
      border-top: 2px solid #000000 !important;
      font-weight: 800 !important;
    }
    .approval-paper-return-wrap {
      border: 1px solid #000000 !important;
    }
    .approval-paper-return-wrap th,
    .approval-paper-return-wrap td {
      border: 1px solid #000000 !important;
    }

    /* Terms and conditions */
    .approval-general-terms {
      border: 1px solid #000000 !important;
    }
    .approval-general-terms li::before {
      background: #000000 !important;
    }
    .approval-inline-conditions {
      border-top: 1px solid #000000 !important;
    }
    .approval-inline-conditions > span + span {
      border-left: 1px solid #000000 !important;
    }

    /* Debt and Totals Summary Box */
    .approval-bottom-grid .approval-totals {
      border: 1.5px solid #000000 !important;
      box-shadow: none !important;
    }
    .approval-totals span {
      border-bottom: 1px dashed #888888 !important;
      font-weight: 700 !important;
    }
    .approval-totals span b {
      font-weight: 700 !important;
    }
    .approval-totals strong {
      border-top: 2px solid #000000 !important;
      font-size: 14px !important;
      font-weight: 900 !important;
    }

    /* Note box */
    .approval-note-box {
      border: 1px solid #000000 !important;
    }

    /* Page Footer */
    .approval-page-footer {
      border-top: 1px solid #000000 !important;
      color: #000000 !important;
    }
    .approval-page-footer b {
      color: #000000 !important;
    }
  `;

  const selectedCss = mode === "bw" ? bwPrintCss : colorPrintCss;

  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><style>${css}\n${selectedCss}</style></head><body>${targetPaper.outerHTML}</body></html>`
  );
  doc.close();

  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 15000);
  }, 300);
};

export function QaimePrintButton({
  onPrint,
  className = "",
  size = 16,
  label = "Çap et / PDF",
  dropUp = false,
  disabled = false,
}: {
  onPrint: (mode: PrintMode) => void;
  className?: string;
  size?: number;
  label?: string;
  dropUp?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    if (disabled) return;
    if (!open) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const shouldDropUp = dropUp || rect.bottom + 200 > window.innerHeight;
        if (shouldDropUp) {
          setMenuPos({
            bottom: Math.max(10, window.innerHeight - rect.top + 6),
            right: Math.max(10, window.innerWidth - rect.right),
          });
        } else {
          setMenuPos({
            top: rect.bottom + 6,
            right: Math.max(10, window.innerWidth - rect.right),
          });
        }
      }
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div
      ref={containerRef}
      className={`qaime-print-dropdown-wrap ${dropUp ? "drop-up" : ""}`}
      style={{ position: "relative", display: "inline-flex" }}
    >
      <button
        type="button"
        className={className}
        onClick={handleToggle}
        disabled={disabled}
        aria-expanded={open}
        aria-busy={disabled || undefined}
        title="Çap etmə rejimini seçin"
        style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
      >
        <Printer size={size} />
        <span>{label}</span>
        <ChevronDown size={13} style={{ opacity: 0.75, marginLeft: 1 }} />
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="qaime-print-dropdown-menu"
            role="menu"
            style={{
              position: "fixed",
              top: menuPos.top !== undefined ? `${menuPos.top}px` : "auto",
              bottom: menuPos.bottom !== undefined ? `${menuPos.bottom}px` : "auto",
              right: `${menuPos.right}px`,
              zIndex: 99999,
            }}
          >
            <button
              type="button"
              className="qaime-print-menu-item"
              onClick={() => {
                setOpen(false);
                onPrint("bw");
              }}
            >
              <span className="qaime-print-menu-desc">
                <strong>Ağ-Qara / Lazer (Eko)</strong>
                <small>Lazer printer üçün ağ zəmin, xalis qara şrift və toner qənaəti</small>
              </span>
              <span className="qaime-print-menu-icon bw">
                <Printer size={16} />
              </span>
            </button>

            <button
              type="button"
              className="qaime-print-menu-item"
              onClick={() => {
                setOpen(false);
                onPrint("color");
              }}
            >
              <span className="qaime-print-menu-desc">
                <strong>Rəngli / Orijinal</strong>
                <small>Orijinal rəngli dizayn və vurğularla çap</small>
              </span>
              <span className="qaime-print-menu-icon color">
                <Palette size={16} />
              </span>
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
