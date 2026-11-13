import React, { useState, useRef, useEffect } from "react";

export type MascotState = "idle" | "thinking" | "happy";

interface AriXLiveMascotProps {
  onAskQuestion?: (question: string) => Promise<string | null>;
  currentUser?: { id: string; name: string };
  orders?: any[];
  products?: any[];
  customers?: any[];
  approvalOrders?: any[];
  deliveryWaiting?: any[];
}

export function AriXLiveMascot({
  onAskQuestion,
  currentUser,
  orders = [],
  products = [],
  customers = [],
  approvalOrders = [],
  deliveryWaiting = [],
}: AriXLiveMascotProps) {
  const [state, setState] = useState<MascotState>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState<string | null>(null);
  const [bubbleMessage, setBubbleMessage] = useState<string>("Selam! Ben AriX, her şeye hâkimim 👋");
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
    if (target.closest("button") || target.closest("input") || target.closest("form") || target.closest(".arix-mascot-dialog-card")) return;

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

  // =========================================================================
  // SMART CONTEXT AWARENESS (HOVER & MOBILE TOUCH OBSERVER)
  // "Mausum neyin üzerinde olsa, telefonda neye dokunsam kafasında uygun fikir/teklif çıksın"
  // =========================================================================
  useEffect(() => {
    let lastTarget: HTMLElement | null = null;
    let idleTimer: any = null;
    let throttleTimer: any = null;

    const analyzeElement = (target: HTMLElement | null): string | null => {
      if (!target || typeof target.closest !== "function") return null;
      if (target.closest(".arix-live-mascot-container")) return null;

      const text = (target.textContent || "").trim();

      // 1. Order Match
      const orderMatch = text.match(/(?:ORD|SOF|PRF)-\d{4,}/i);
      let matchedOrder: any = null;

      if (orderMatch && orders.length) {
        const num = orderMatch[0].toUpperCase();
        matchedOrder = orders.find((o) => o.number?.toUpperCase() === num || o.approvalForm?.number?.toUpperCase() === num);
      }
      if (!matchedOrder && orders.length) {
        const cardEl = target.closest(".order-card, .approval-form-row, .order-block, tr, [data-order-id]");
        if (cardEl) {
          const cardText = (cardEl.textContent || "").trim();
          const m = cardText.match(/(?:ORD|SOF|PRF)-\d{4,}/i);
          if (m) {
            const num = m[0].toUpperCase();
            matchedOrder = orders.find((o) => o.number?.toUpperCase() === num);
          }
        }
      }

      if (matchedOrder) {
        const prep = matchedOrder.preparedBy || matchedOrder.items?.find((i: any) => i.preparedBy)?.preparedBy;
        const deliv = matchedOrder.deliveredBy;
        const hasDespatch = matchedOrder.despatchNumber || matchedOrder.withoutDespatch;
        const proofCount = (matchedOrder.attachments || []).filter((a: any) => a.kind === "deliveryProof" || a.mimeType?.startsWith("image/")).length;
        const itemCount = matchedOrder.items?.length || 0;

        switch (matchedOrder.status) {
          case "waiting":
            return `⏳ ${matchedOrder.number} (${matchedOrder.customerName}): Hazırlık bekliyor. ${itemCount} kalem ürün var, depoya öncelik verelim mi?`;
          case "preparing":
            return `⚙️ ${matchedOrder.number} (${matchedOrder.customerName}): Hazırlanıyor (${prep || "Depo"}). ${hasDespatch ? "İrsaliye hazır." : "İrsaliye henüz kesilmedi, sevk için hazırlansın mı?"}`;
          case "ready":
            return `✅ ${matchedOrder.number} (${matchedOrder.customerName}) hazır! ${hasDespatch ? "Kuryeye verilebilir." : "Sevk irsaliyesi yazdırılmaya hazır."}`;
          case "on_way":
            return `🚚 ${matchedOrder.number} (${matchedOrder.customerName}) yolda! Kurye: ${deliv || "Zimmetli"}. Teslimat fotoğrafı bekleniyor.`;
          case "delivered":
            return `🎉 ${matchedOrder.number} (${matchedOrder.customerName}): Teslim edildi (${deliv || "Kurye"}). ${proofCount ? `${proofCount} teslimat fotoğrafı mevcut.` : ""}`;
          default:
            return `📦 ${matchedOrder.number} (${matchedOrder.customerName}): Durum: ${matchedOrder.status}. ${itemCount} kalem mevcut.`;
        }
      }

      // 2. Customer Match
      if (customers.length) {
        for (const c of customers) {
          if (c.name && c.name.length >= 3 && text.includes(c.name)) {
            const bal = Number(c.balance || 0);
            if (bal < 0) {
              return `👤 ${c.name}: Bakiye borçlu (${bal.toLocaleString("tr-TR")} ₼). Yeni sipariş öncesi tahsilat öneririm.`;
            } else if (bal > 0) {
              return `👤 ${c.name}: Bakiye alacaklı (+${bal.toLocaleString("tr-TR")} ₼). Güvenilir cari hesap.`;
            } else {
              return `👤 ${c.name}: Bakiye kapalı (0 ₼). Hesap düzenli.`;
            }
          }
        }
      }

      // 3. Product Match
      if (products.length) {
        for (const p of products.slice(0, 80)) {
          if ((p.code && text.includes(p.code)) || (p.name && p.name.length >= 4 && text.includes(p.name))) {
            const wh = Object.entries(p.warehouses || {}).filter(([, v]) => Number(v));
            const totalStock = wh.reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
            return `🏷️ ${p.name} (${p.code || "-"}): Toplam Stok: ${totalStock} ${p.unit || "mt"}. Fiyat: ${p.salePrice || 0} ₼.`;
          }
        }
      }

      // 4. Interactive Buttons & Form Actions
      const btn = target.closest("button, a, input, select");
      if (btn) {
        const bText = (btn.textContent || "").trim().toLowerCase();
        const bTitle = (btn.getAttribute("title") || btn.getAttribute("aria-label") || "").toLowerCase();
        const combined = `${bText} ${bTitle}`;

        if (combined.includes("yeni sipariş") || combined.includes("sipariş oluştur")) {
          return "✨ Yeni bir müşteri sipariş formu oluşturmak için tıklayın.";
        }
        if (combined.includes("yazdır") || combined.includes("pdf") || combined.includes("irsaliye")) {
          return "📄 Sevk irsaliyesi, çeki listesi veya depo fişini yazdırmak için tıklayın.";
        }
        if (combined.includes("onay")) {
          return "✔️ Sipariş formunu onaylayıp hazırlık sürecine aktarabilirsiniz.";
        }
        if (btn.tagName === "INPUT" && (btn.getAttribute("type") === "text" || btn.getAttribute("type") === "search")) {
          return "🔍 Sipariş numarası, müşteri adı veya ürün aramak için yazmaya başlayın.";
        }
      }

      return null;
    };

    const handlePointerAction = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target === lastTarget) return;
      lastTarget = target;

      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        const tip = analyzeElement(target);
        if (tip) {
          setBubbleMessage(tip);
          clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            rotateIdle();
          }, 9000);
        }
      }, 90);
    };

    const rotateIdle = () => {
      const tips = [
        "💡 Bir sipariş veya müşterinin üzerine gelin, analiz edeyim!",
        "📊 Tüm siparişler, cari bakiyeler ve depolar anlık kontrolümde.",
        "💬 Aklınıza gelen her şeyi sormak için üzerime tıklayabilirsiniz!",
        "⚡ Hazır olan siparişlerin sevk irsaliyelerini tek tıkla yazdırabilirsiniz.",
      ];
      setBubbleMessage(tips[Math.floor(Math.random() * tips.length)]);
    };

    document.addEventListener("mouseover", handlePointerAction, { passive: true });
    document.addEventListener("touchstart", handlePointerAction, { passive: true });
    document.addEventListener("focusin", handlePointerAction as any, { passive: true });

    return () => {
      document.removeEventListener("mouseover", handlePointerAction);
      document.removeEventListener("touchstart", handlePointerAction);
      document.removeEventListener("focusin", handlePointerAction as any);
      clearTimeout(idleTimer);
      clearTimeout(throttleTimer);
    };
  }, [orders, products, customers]);

  // Quick Ask Universal Engine
  const handleAsk = async (query: string) => {
    if (!query.trim()) return;
    setQuestionText("");
    setState("thinking");
    setAnswerText(null);
    setBubbleMessage("Sistem kayıtlarını analiz ediyorum... 🔍");

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
        setBubbleMessage("Cevap hazır! 🚀");
        setTimeout(() => setState("idle"), 4000);
      } else {
        setState("idle");
        setAnswerText("Bu konuda detaylı bilgi bulunamadı.");
        setBubbleMessage("Sorunuzu biraz daha detaylandırabilir misiniz?");
      }
    } catch {
      setState("idle");
      setAnswerText("Bağlantı sağlanamadı, lütfen tekrar deneyin.");
      setBubbleMessage("Bağlantı hatası.");
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
      aria-label="AriX Akıllı Saha ve Operasyon Asistanı"
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
              <div>
                <strong className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  AriX Saha Asistanı <span className="text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold px-1.5 py-0.5 rounded-full">Yapay Zeka</span>
                </strong>
                <p className="text-[10px] text-slate-400 leading-none mt-0.5">Sipariş, Stok, Cari, Sevkiyat & Operasyon Uzmanı</p>
              </div>
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
                <span>Tüm operasyonel veritabanı taranıyor...</span>
              </div>
            ) : answerText ? (
              <div className="text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto font-sans">
                {answerText}
              </div>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                Merhaba {currentUser?.name ? `${currentUser.name} Bey` : ""}!
                Şirketin tüm siparişleri, cari borç-alacak durumları, depo stokları, kurye teslimatları veya operasyonel tavsiyeler hakkında <strong>aklınıza gelen her şeyi</strong> sorabilirsiniz.
              </p>
            )}

            {/* Smart Multi-Category Action Chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button
                type="button"
                className="chip-btn"
                onClick={() => handleAsk("Bugünün genel operasyon ve sipariş durumu nedir?")}
              >
                📊 Genel Durum
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => handleAsk("Hangi siparişler gecikti?")}
              >
                ⚠️ Gecikenler
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => handleAsk("En çok borcu olan müşteriler kimler?")}
              >
                💰 Borçlu Cariler
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => handleAsk("Operasyonel olarak ne önerirsin, neye dikkat etmeliyiz?")}
              >
                💡 Operasyonel Teklif
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => handleAsk("011 folyo stok durumu nedir?")}
              >
                📦 011 Folyo Stok
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
              placeholder="Her şeyi sorabilirsiniz (örn: gecikenler, borçlular, ne önerirsin)..."
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              className="text-xs flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!questionText.trim() || state === "thinking"}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
            >
              Sor
            </button>
          </form>
        </div>
      )}

      {/* 2. Floating Thought / Context Tip Bubble (When closed) */}
      {!isOpen && (
        <div className="arix-mascot-floating-bubble">
          <span>{bubbleMessage}</span>
          <div className="bubble-tail" />
        </div>
      )}

      {/* 3. Fully-Rigged Animated Mascot with Real Reference Logos */}
      <div className="arix-mascot-rig-wrap">
        <svg viewBox="0 0 200 220" className="arix-mascot-svg" width="98" height="108">
          <defs>
            <radialGradient id="liveHelmetGrad" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="55%" stopColor="#f1f5f9" />
              <stop offset="85%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </radialGradient>

            <linearGradient id="liveBodyGrad" x1="20%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="60%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>

            <radialGradient id="liveBlueBall" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1e40af" />
            </radialGradient>

            <linearGradient id="liveVisorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#090d16" />
              <stop offset="45%" stopColor="#111827" />
              <stop offset="80%" stopColor="#1e1b4b" />
              <stop offset="100%" stopColor="#090d16" />
            </linearGradient>

            <radialGradient id="liveThrusterCyan" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Floor Ambient Thruster Glow */}
          <ellipse cx="100" cy="210" rx="36" ry="8" fill="url(#liveThrusterCyan)" className="rig-thruster" />

          {/* Legs & Boots */}
          <g className="rig-legs">
            <rect x="74" y="145" width="18" height="26" rx="9" fill="url(#liveBodyGrad)" />
            <ellipse cx="83" cy="172" rx="12" ry="7" fill="url(#liveBlueBall)" />
            <rect x="108" y="145" width="18" height="26" rx="9" fill="url(#liveBodyGrad)" />
            <ellipse cx="117" cy="172" rx="12" ry="7" fill="url(#liveBlueBall)" />
          </g>

          {/* Left Arm (Passive gentle sway) */}
          <g className="rig-arm-left">
            <path d="M66 125 C50 135 48 148 55 160" stroke="url(#liveBodyGrad)" strokeWidth="15" strokeLinecap="round" fill="none" />
            <circle cx="55" cy="162" r="11" fill="url(#liveBlueBall)" />
            <circle cx="59" cy="158" r="4" fill="url(#liveBlueBall)" />
          </g>

          {/* Torso with EXACT Real Collar & Chest Logo from Reference Picture */}
          <g className="rig-torso">
            <rect x="66" y="108" width="68" height="52" rx="26" fill="url(#liveBodyGrad)" stroke="#e2e8f0" strokeWidth="1.2" />
            
            {/* Glowing Neon Cyan Collar Ring */}
            <ellipse cx="100" cy="110" rx="24" ry="5.5" fill="#38bdf8" opacity="0.95" />
            <ellipse cx="100" cy="110" rx="16" ry="3" fill="#e0f2fe" opacity="0.8" />

            {/* Side waist mint accents from reference */}
            <path d="M68 136 C72 145 76 150 80 153" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85" />
            <path d="M132 136 C128 145 124 150 120 153" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85" />

            {/* Exact Authentic Chest Ax Logo from Reference Picture */}
            <image
              href="/arix-logo-chest.png"
              xlinkHref="/arix-logo-chest.png"
              x="76"
              y="112"
              width="48"
              height="44"
              preserveAspectRatio="xMidYMid meet"
            />
          </g>

          {/* Right Arm (ACTIVE MOVING / WAVING / THINKING SCRATCH) */}
          <g className="rig-arm-right">
            <path d="M134 122 C146 126 156 116 158 98" stroke="url(#liveBodyGrad)" strokeWidth="15" strokeLinecap="round" fill="none" />
            <circle cx="158" cy="95" r="11" fill="url(#liveBlueBall)" />
            <circle cx="150" cy="94" r="4.5" fill="url(#liveBlueBall)" />
            {state !== "thinking" && (
              <g className="rig-wave-sparks">
                <path d="M168 85 C172 87 174 91 172 95" stroke="#34d399" strokeWidth="3" strokeLinecap="round" fill="none" />
                <path d="M174 88 C178 91 180 96 177 101" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" fill="none" />
              </g>
            )}
          </g>

          {/* Head with EXACT Real Head Logo from Reference Picture */}
          <g className="rig-head">
            {/* Headphones */}
            <ellipse cx="46" cy="74" rx="10" ry="17" fill="url(#liveHelmetGrad)" stroke="#cbd5e1" strokeWidth="1" />
            <ellipse cx="45" cy="74" rx="4.5" ry="11" fill="#38bdf8" />
            <ellipse cx="45" cy="74" rx="2" ry="7" fill="#ffffff" opacity="0.7" />

            <ellipse cx="154" cy="74" rx="10" ry="17" fill="url(#liveHelmetGrad)" stroke="#cbd5e1" strokeWidth="1" />
            <ellipse cx="155" cy="74" rx="4.5" ry="11" fill="#38bdf8" />
            <ellipse cx="155" cy="74" rx="2" ry="7" fill="#ffffff" opacity="0.7" />

            {/* Helmet */}
            <rect x="46" y="26" width="108" height="92" rx="46" fill="url(#liveHelmetGrad)" stroke="#e2e8f0" strokeWidth="1.2" />

            {/* EXACT Real Head Logo (Green angled stripe + 3D Blue X) */}
            <image
              href="/arix-logo-head.png"
              xlinkHref="/arix-logo-head.png"
              x="65"
              y="18"
              width="70"
              height="40"
              preserveAspectRatio="xMidYMid meet"
            />

            {/* Visor Screen */}
            <rect x="62" y="48" width="76" height="54" rx="24" fill="url(#liveVisorGrad)" stroke="#38bdf8" strokeWidth="1.5" />

            {/* Visor Expressions */}
            {state === "thinking" ? (
              <g className="rig-eyes-thinking">
                <rect x="74" y="68" width="52" height="4" rx="2" fill="#38bdf8" opacity="0.9" />
                <circle cx="85" cy="78" r="3" fill="#34d399" />
                <circle cx="100" cy="78" r="3.5" fill="#38bdf8" />
                <circle cx="115" cy="78" r="3" fill="#34d399" />
              </g>
            ) : (
              <g className="rig-eyes-normal">
                <path d="M76 75 C79 68 87 68 90 75" stroke="#38bdf8" strokeWidth="4.5" strokeLinecap="round" fill="none" />
                <path d="M110 75 C113 68 121 68 124 75" stroke="#38bdf8" strokeWidth="4.5" strokeLinecap="round" fill="none" />
                <path d="M96 84 C98 88 102 88 104 84" stroke="#38bdf8" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                <line x1="72" y1="83" x2="75" y2="87" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                <line x1="76" y1="83" x2="79" y2="87" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                <line x1="121" y1="83" x2="124" y2="87" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                <line x1="125" y1="83" x2="128" y2="87" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
              </g>
            )}
          </g>
        </svg>
      </div>
    </aside>
  );
}

export default AriXLiveMascot;
