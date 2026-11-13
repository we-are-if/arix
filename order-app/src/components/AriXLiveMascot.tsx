import React, { useState, useRef, useEffect } from "react";

export type MascotState = "idle" | "thinking" | "happy";

interface AriXLiveMascotProps {
  onAskQuestion?: (question: string) => Promise<string | null>;
  currentUser?: { id: string; name: string };
}

export function AriXLiveMascot({ onAskQuestion, currentUser }: AriXLiveMascotProps) {
  const [state, setState] = useState<MascotState>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState<string | null>(null);
  const [bubbleMessage, setBubbleMessage] = useState<string>("Selam! Ben AriX 👋");
  const [isMinimized, setIsMinimized] = useState(false);

  // Dragging support
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem("arix_mascot_pos_v1");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number; moved: boolean } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag on mascot itself, not inner controls
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input") || target.closest("form")) return;

    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: rect.left,
      posY: rect.top,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragRef.current.moved = true;
      const nextX = Math.max(10, Math.min(window.innerWidth - 130, dragRef.current.posX + dx));
      const nextY = Math.max(10, Math.min(window.innerHeight - 150, dragRef.current.posY + dy));
      setPosition({ x: nextX, y: nextY });
    }
  };

  const handlePointerUp = () => {
    if (!dragRef.current) return;
    if (dragRef.current.moved && position) {
      try {
        localStorage.setItem("arix_mascot_pos_v1", JSON.stringify(position));
      } catch {}
    } else if (!dragRef.current.moved) {
      // Toggle interaction dialog
      setIsOpen((prev) => !prev);
    }
    dragRef.current = null;
  };

  // Quick Ask
  const handleAsk = async (query: string) => {
    if (!query.trim()) return;
    setQuestionText("");
    setState("thinking");
    setAnswerText(null);
    setBubbleMessage("Kayıtları tarıyorum, bir saniye... 🔍");

    try {
      let reply: string | null = null;
      if (onAskQuestion) {
        reply = await onAskQuestion(query);
      } else {
        // Direct API call to assistant
        const res = await fetch("/api/orders/chat/assistant-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: query }),
        });
        if (res.ok) {
          const data = await res.json();
          reply = data?.text || data?.answer || null;
        }
      }

      if (reply) {
        setState("happy");
        setAnswerText(reply);
        setBubbleMessage("Cevap hazır! 🎉");
        setTimeout(() => setState("idle"), 4000);
      } else {
        setState("idle");
        setAnswerText("Bu konuda bilgi bulunamadı.");
        setBubbleMessage("Tam bulamadım, tekrar dener misiniz?");
      }
    } catch {
      setState("idle");
      setAnswerText("Bir hata oluştu, lütfen tekrar deneyin.");
      setBubbleMessage("Bağlantı sağlanamadı.");
    }
  };

  return (
    <aside
      className={`arix-live-mascot-container state-${state} ${isOpen ? "is-open" : ""}`}
      style={
        position
          ? {
              left: `${position.x}px`,
              top: `${position.y}px`,
              bottom: "auto",
              right: "auto",
            }
          : undefined
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="region"
      aria-label="AriX Canlı Saha Asistanı"
    >
      {/* 1. Speech / Interaction Dialog Card */}
      {isOpen && (
        <div
          className="arix-mascot-dialog-card"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Card Header */}
          <div className="arix-mascot-dialog-header">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <strong className="text-sm font-bold text-slate-800 dark:text-slate-100">AriX Saha Asistanı</strong>
            </div>
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded-lg"
              onClick={() => setIsOpen(false)}
            >
              ✕
            </button>
          </div>

          {/* Quick Context / Answer Area */}
          <div className="arix-mascot-dialog-body">
            {state === "thinking" ? (
              <div className="flex items-center gap-2.5 text-xs text-blue-600 font-semibold p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl animate-pulse">
                <span className="animate-spin text-base">⚙️</span>
                <span>Depo hazırlık, teslimat ve irsaliye kayıtları taranıyor...</span>
              </div>
            ) : answerText ? (
              <div className="text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {answerText}
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                Merhaba {currentUser?.name ? `${currentUser.name} Bey` : ""}! 
                İrsaliye numaraları, teslimat kanıt fotoğrafları, kimin hazırlayıp teslim ettiği ve stok durumlarını sorabilirsiniz.
              </p>
            )}

            {/* Quick Action Chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button
                type="button"
                className="chip-btn"
                onClick={() => handleAsk("Form grup son siparişini kim hazırladı?")}
              >
                📦 Form Grup Hazırlık
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => handleAsk("Form grubun irsaliye numarası nedir?")}
              >
                📄 İrsaliye No
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => handleAsk("ORD-0315660 teslimat fotoğrafları var mı?")}
              >
                📸 Teslimat Kanıtı
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => handleAsk("ersa 011 elimizde ne kadar var?")}
              >
                📊 Ersa 011 Stok
              </button>
            </div>
          </div>

          {/* Ask Input */}
          <form
            className="arix-mascot-dialog-footer"
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk(questionText);
            }}
          >
            <input
              type="text"
              placeholder="Sorunuzu yazın (örn: irsaliye no, kim hazırladı?)..."
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              className="text-xs flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!questionText.trim() || state === "thinking"}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
            >
              Sor
            </button>
          </form>
        </div>
      )}

      {/* 2. Floating Thought / Greeting Bubble (When closed) */}
      {!isOpen && (
        <div className="arix-mascot-floating-bubble">
          <span>{bubbleMessage}</span>
          <div className="bubble-tail" />
        </div>
      )}

      {/* 3. Original High-Res 3D Mascot with Preserved Logos & Live Animation */}
      <div className="arix-mascot-body-wrap">
        {/* Glowing Aura around character during thinking */}
        <div className={`arix-mascot-3d-aura ${state === "thinking" ? "is-thinking" : ""}`} />

        {/* 100% Original High-Res 3D Image */}
        <img
          src="/arix-mascot.jpg"
          alt="AriX 3D Asistan Maskotu"
          className="arix-mascot-3d-img"
          draggable={false}
        />

        {/* Dynamic Visor Overlay during Thinking */}
        {state === "thinking" && (
          <div className="arix-mascot-3d-scanner">
            <div className="arix-mascot-3d-scanline" />
            <span className="text-[10px] font-mono font-bold text-cyan-300">ANALİZ...</span>
          </div>
        )}

        {/* Animated Hand Sparkles for Waving Right Hand */}
        {state !== "thinking" && (
          <div className="arix-mascot-sparkle-wave">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 18 L10 12" stroke="#34d399" strokeWidth="3" strokeLinecap="round" />
              <path d="M12 20 L20 12" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {/* 3D Ambient Floor Shadow & Cyan Glow */}
        <div className="arix-mascot-3d-floor">
          <div className="floor-shadow" />
          <div className="floor-glow" />
        </div>
      </div>
    </aside>
  );
}

export default AriXLiveMascot;
