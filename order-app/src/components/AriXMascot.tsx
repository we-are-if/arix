import React, { useEffect, useState } from "react";

export type MascotState = "idle" | "thinking" | "happy" | "alert";

export interface AriXMascotProps {
  state?: MascotState;
  size?: "xs" | "sm" | "md" | "fab" | "lg";
  bubbleText?: string | null;
  showBubble?: boolean;
  onClick?: () => void;
  className?: string;
  badgeCount?: number;
  interactive?: boolean;
}

export function AriXMascot({
  state = "idle",
  size = "fab",
  bubbleText,
  showBubble = false,
  onClick,
  className = "",
  badgeCount = 0,
  interactive = true,
}: AriXMascotProps) {
  const [internalState, setInternalState] = useState<MascotState>(state);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setInternalState(state);
  }, [state]);

  const handlePointerEnter = () => {
    setIsHovered(true);
    if (internalState === "idle") {
      // Subtle friendly reaction on hover
      setInternalState("happy");
      setTimeout(() => setInternalState("idle"), 2200);
    }
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
  };

  const isThinking = internalState === "thinking";
  const isHappy = internalState === "happy";
  const isAlert = internalState === "alert";

  // Size mapping
  const sizeClasses = {
    xs: "w-6 h-6",
    sm: "w-9 h-9",
    md: "w-12 h-12",
    fab: "w-[68px] h-[68px]",
    lg: "w-32 h-32 sm:w-40 sm:h-40",
  }[size];

  return (
    <div
      className={`arix-mascot-root ${size} ${className} ${interactive ? "cursor-pointer" : ""}`}
      onClick={onClick}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      title={isThinking ? "AriX Asistan düşünüyor..." : "AriX Akıllı Saha Asistanı"}
    >
      {/* Dynamic Contextual Speech / Thought Bubble */}
      {(showBubble || (isHovered && size === "fab") || isThinking) && (
        <div className={`arix-mascot-bubble ${isThinking ? "is-thinking" : ""}`}>
          <div className="arix-mascot-bubble-inner">
            {isThinking ? (
              <span className="flex items-center gap-1.5 text-blue-600 dark:text-cyan-400 font-semibold">
                <span className="arix-mascot-think-dots">● ● ●</span>
                <span>Analiz ediyorum...</span>
              </span>
            ) : (
              <span>{bubbleText || "Selam! Bir şey sormak için dokunun 👋"}</span>
            )}
          </div>
          <div className="arix-mascot-bubble-tail" />
        </div>
      )}

      {/* Mascot Main Character Box */}
      <div className={`arix-mascot-avatar-wrap ${sizeClasses} anim-${internalState}`}>
        {/* Glow Aura */}
        <div className={`arix-mascot-aura ${isThinking ? "is-thinking" : ""} ${isHappy ? "is-happy" : ""}`} />

        {/* Character Image */}
        <img
          src="/arix-mascot.jpg"
          alt="AriX Asistan Maskotu"
          className="arix-mascot-img"
          loading="eager"
          draggable={false}
        />

        {/* Dynamic Visor Overlay during Thinking */}
        {isThinking && (
          <div className="arix-mascot-visor-scan">
            <div className="arix-mascot-scan-line" />
          </div>
        )}

        {/* Unread / Attention Badge */}
        {badgeCount > 0 && (
          <span className="arix-mascot-badge">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}

        {/* Mini Operational Pulse Indicator */}
        {isAlert && <span className="arix-mascot-alert-pulse" />}
      </div>

      {/* Ambient Floor Shadow for 3D Floating Effect */}
      {(size === "fab" || size === "lg") && (
        <div className="arix-mascot-shadow-wrap">
          <div className={`arix-mascot-shadow anim-shadow-${internalState}`} />
          <div className="arix-mascot-floor-glow" />
        </div>
      )}
    </div>
  );
}

export default AriXMascot;
