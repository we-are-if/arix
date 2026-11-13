import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, Copy, Check, X, Package, FileText } from "lucide-react";

export type ContextMenuTarget =
  | {
      type: "product";
      product: {
        id?: string | number | null;
        name: string;
        code?: string | null;
        unit?: string | null;
        quantity?: number | string | null;
        rollCount?: number | string | null;
      };
      order?: {
        id: string;
        number: string;
        customerName?: string;
        status?: string;
      } | null;
    }
  | {
      type: "order";
      order: {
        id: string;
        number: string;
        customerName?: string;
        status?: string;
        itemsCount?: number;
      };
    };

export interface AriXContextMenuProps {
  target: ContextMenuTarget | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onShareInChat: (target: ContextMenuTarget) => void;
  onCopySuccess?: (msg: string) => void;
}

export function AriXContextMenu({
  target,
  position,
  onClose,
  onShareInChat,
  onCopySuccess,
}: AriXContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!position || !target) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleScroll = () => {
      onClose();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [position, target, onClose]);

  if (!position || !target) return null;

  // Calculate safe clamping so menu never overflows screen bounds
  const menuWidth = 250;
  const menuHeight = 220;
  const padding = 12;

  let left = position.x;
  let top = position.y;

  if (typeof window !== "undefined") {
    if (left + menuWidth > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - menuWidth - padding);
    }
    if (top + menuHeight > window.innerHeight - padding) {
      top = Math.max(padding, top - menuHeight);
    }
  }

  const handleCopy = async () => {
    let copyText = "";
    if (target.type === "product") {
      const p = target.product;
      const parts = [];
      if (p.code) parts.push(`[${p.code}]`);
      parts.push(p.name);
      if (Number(p.quantity) > 0) parts.push(`${p.quantity} ${p.unit || "mt"}`);
      if (Number(p.rollCount) > 0) parts.push(`${p.rollCount} rulo`);
      if (target.order?.number) parts.push(`(Sipariş: ${target.order.number})`);
      copyText = parts.join(" ");
    } else {
      const o = target.order;
      copyText = `Sipariş #${o.number}${o.customerName ? ` - ${o.customerName}` : ""}`;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else {
        const area = document.createElement("textarea");
        area.value = copyText;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      if (onCopySuccess) onCopySuccess(copyText);
      setTimeout(() => {
        onClose();
      }, 400);
    } catch {
      onClose();
    }
  };

  return createPortal(
    <div className="arix-context-menu-backdrop" onClick={onClose}>
      <div
        ref={menuRef}
        className="arix-context-menu"
        style={{ left: `${left}px`, top: `${top}px` }}
        onClick={(e) => e.stopPropagation()}
        role="menu"
        aria-label="İşlem Menüsü"
      >
        {/* Header Preview */}
        <div className="arix-cm-header">
          {target.type === "product" ? (
            <>
              <div className="arix-cm-tag">
                <Package size={13} className="arix-cm-icon-mini" />
                <span>{target.product.code || "Ürün"}</span>
              </div>
              <strong className="arix-cm-title" title={target.product.name}>
                {target.product.name}
              </strong>
              {target.order?.number && (
                <small className="arix-cm-subtitle">
                  Sipariş: {target.order.number}
                </small>
              )}
            </>
          ) : (
            <>
              <div className="arix-cm-tag">
                <FileText size={13} className="arix-cm-icon-mini" />
                <span>Sipariş</span>
              </div>
              <strong className="arix-cm-title">
                #{target.order.number}
              </strong>
              {target.order.customerName && (
                <small className="arix-cm-subtitle">
                  {target.order.customerName}
                </small>
              )}
            </>
          )}
        </div>

        <div className="arix-cm-divider" />

        {/* Action Items */}
        <div className="arix-cm-items">
          <button
            type="button"
            className="arix-cm-action primary"
            onClick={() => {
              onShareInChat(target);
              onClose();
            }}
          >
            <span className="arix-cm-action-icon chat">
              <MessageSquare size={16} />
            </span>
            <div className="arix-cm-action-label">
              <b>Sohbette Ekiple Konuş</b>
              <small>Bu {target.type === "product" ? "ürünü" : "siparişi"} sohbete bağla</small>
            </div>
          </button>

          <button
            type="button"
            className="arix-cm-action"
            onClick={handleCopy}
          >
            <span className="arix-cm-action-icon">
              {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
            </span>
            <div className="arix-cm-action-label">
              <b>{copied ? "Kopyalandı!" : "Bilgiyi Kopyala"}</b>
              <small>{target.type === "product" ? "Kod, ad ve miktar panoya" : "Sipariş no ve müşteri"}</small>
            </div>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
