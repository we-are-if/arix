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

      {/* 3. Fully-Rigged Articulated SVG Character */}
      <div className="arix-mascot-rig-wrap">
        <svg viewBox="0 0 200 220" className="arix-mascot-svg" width="96" height="106">
          <defs>
            <linearGradient id="liveBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="70%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>

            <linearGradient id="liveBlueAccent" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>

            <linearGradient id="liveGreenAccent" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>

            <linearGradient id="liveVisorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="60%" stopColor="#1e1b4b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            <radialGradient id="liveThrusterCyan" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
              <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Floor Ambient Thruster Glow */}
          <ellipse cx="100" cy="208" rx="36" ry="8" fill="url(#liveThrusterCyan)" className="rig-thruster" />

          {/* Legs & Boots */}
          <g className="rig-legs">
            <rect x="74" y="145" width="18" height="26" rx="9" fill="url(#liveBodyGrad)" />
            <ellipse cx="83" cy="172" rx="12" ry="7" fill="url(#liveBlueAccent)" />
            <rect x="108" y="145" width="18" height="26" rx="9" fill="url(#liveBodyGrad)" />
            <ellipse cx="117" cy="172" rx="12" ry="7" fill="url(#liveBlueAccent)" />
          </g>

          {/* Left Arm (Gentle breathing) */}
          <g className="rig-arm-left">
            <path d="M65 125 C50 135 48 148 55 160" stroke="url(#liveBodyGrad)" strokeWidth="15" strokeLinecap="round" fill="none" />
            <circle cx="55" cy="162" r="10" fill="url(#liveBlueAccent)" />
            <circle cx="59" cy="158" r="4" fill="url(#liveBlueAccent)" />
          </g>

          {/* Torso */}
          <g className="rig-torso">
            <rect x="66" y="108" width="68" height="52" rx="26" fill="url(#liveBodyGrad)" stroke="#e2e8f0" strokeWidth="1.5" />
            <polygon points="86,140 94,122 101,122 93,140" fill="url(#liveGreenAccent)" />
            <path d="M102 127 L114 139" stroke="url(#liveBlueAccent)" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M114 127 L102 139" stroke="url(#liveBlueAccent)" strokeWidth="4.5" strokeLinecap="round" />
            <ellipse cx="100" cy="110" rx="22" ry="4.5" fill="#38bdf8" opacity="0.75" />
          </g>

          {/* Right Arm (Articulated Waving / Thinking / Pointing) */}
          <g className="rig-arm-right">
            <path d="M135 122 C146 126 156 116 158 98" stroke="url(#liveBodyGrad)" strokeWidth="15" strokeLinecap="round" fill="none" />
            <circle cx="158" cy="95" r="10.5" fill="url(#liveBlueAccent)" />
            <circle cx="150" cy="94" r="4.5" fill="url(#liveBlueAccent)" />
            {state !== "thinking" && (
              <g className="rig-wave-sparks">
                <path d="M168 85 C172 87 174 91 172 95" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                <path d="M174 88 C178 91 180 96 177 101" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" fill="none" />
              </g>
            )}
          </g>

          {/* Head & Tilting Visor */}
          <g className="rig-head">
            {/* Headphones */}
            <ellipse cx="46" cy="74" rx="9" ry="16" fill="url(#liveBodyGrad)" stroke="#cbd5e1" strokeWidth="1" />
            <ellipse cx="44" cy="74" rx="4.5" ry="10" fill="#38bdf8" />
            <ellipse cx="154" cy="74" rx="9" ry="16" fill="url(#liveBodyGrad)" stroke="#cbd5e1" strokeWidth="1" />
            <ellipse cx="156" cy="74" rx="4.5" ry="10" fill="#38bdf8" />

            {/* Helmet */}
            <rect x="48" y="30" width="104" height="88" rx="44" fill="url(#liveBodyGrad)" stroke="#e2e8f0" strokeWidth="1.5" />
            <polygon points="72,31 82,31 104,50 94,50" fill="url(#liveGreenAccent)" />

            {/* Top X Mark */}
            <g transform="translate(112, 33)">
              <rect x="0" y="3" width="16" height="5" rx="2.5" fill="url(#liveBlueAccent)" transform="rotate(45 8 5.5)" />
              <rect x="0" y="3" width="16" height="5" rx="2.5" fill="url(#liveBlueAccent)" transform="rotate(-45 8 5.5)" />
            </g>

            {/* Visor Screen */}
            <rect x="62" y="50" width="76" height="52" rx="24" fill="url(#liveVisorGrad)" stroke="#38bdf8" strokeWidth="1.2" />

            {/* Eyes depending on state */}
            {state === "thinking" ? (
              <g className="rig-eyes-thinking">
                <rect x="74" y="68" width="52" height="4" rx="2" fill="#38bdf8" opacity="0.9" />
                <circle cx="85" cy="78" r="3" fill="#34d399" />
                <circle cx="100" cy="78" r="3.5" fill="#38bdf8" />
                <circle cx="115" cy="78" r="3" fill="#34d399" />
              </g>
            ) : (
              <g className="rig-eyes-normal">
                <path d="M76 75 C79 69 87 69 90 75" stroke="#38bdf8" strokeWidth="4.5" strokeLinecap="round" fill="none" />
                <path d="M110 75 C113 69 121 69 124 75" stroke="#38bdf8" strokeWidth="4.5" strokeLinecap="round" fill="none" />
                <path d="M96 84 C98 88 102 88 104 84" stroke="#38bdf8" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                <line x1="72" y1="83" x2="75" y2="87" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                <line x1="76" y1="83" x2="79" y2="87" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                <line x1="121" y1="83" x2="124" y2="87" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                <line x1="125" y1="83" x2="128" y2="87" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
              </g>
            )}
          </g>
        </svg>
      </div>
    </aside>
  );
}

export default AriXLiveMascot;
