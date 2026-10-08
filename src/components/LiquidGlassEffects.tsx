import { useEffect } from "react";

const GLASS_SELECTOR = [
  ".glass-panel",
  ".glass-panel-dark",
  ".glass-header",
  ".glass-header-dark",
  ".glass-control",
  ".glass-control-dark",
].join(",");

const INTERACTIVE_SELECTOR = "button,a,input,select,textarea,[role='button'],[role='switch']";
const EDGE_SIZE = 18;

type StretchState = {
  element: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
  edge: "left" | "right" | "top" | "bottom";
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function glassElement(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(GLASS_SELECTOR) : null;
}

function edgeAt(element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  const distances = [
    { edge: "left" as const, value: Math.abs(clientX - rect.left) },
    { edge: "right" as const, value: Math.abs(rect.right - clientX) },
    { edge: "top" as const, value: Math.abs(clientY - rect.top) },
    { edge: "bottom" as const, value: Math.abs(rect.bottom - clientY) },
  ].sort((a, b) => a.value - b.value);
  return distances[0].value <= EDGE_SIZE ? { edge: distances[0].edge, rect } : null;
}

function setReflection(element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  element.style.setProperty("--glass-x", `${clamp(((clientX - rect.left) / rect.width) * 100, 0, 100)}%`);
  element.style.setProperty("--glass-y", `${clamp(((clientY - rect.top) / rect.height) * 100, 0, 100)}%`);
  element.classList.add("liquid-glass-active");
}

function clearStretch(element: HTMLElement) {
  element.classList.remove("liquid-glass-stretching", "liquid-glass-edge-ready");
  element.classList.add("liquid-glass-releasing");
  element.style.setProperty("--glass-stretch-x", "1");
  element.style.setProperty("--glass-stretch-y", "1");
  element.style.setProperty("--glass-shift-x", "0px");
  element.style.setProperty("--glass-shift-y", "0px");
  window.setTimeout(() => element.classList.remove("liquid-glass-releasing"), 520);
}

export default function LiquidGlassEffects() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touchOnly = window.matchMedia("(hover: none), (pointer: coarse)");
    let activeElement: HTMLElement | null = null;
    let stretch: StretchState | null = null;
    let frame = 0;
    let nextPointer: { element: HTMLElement; x: number; y: number } | null = null;

    const markGlass = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLElement>(GLASS_SELECTOR).forEach((element) => {
        element.dataset.liquidGlass = "true";
      });
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches(GLASS_SELECTOR)) node.dataset.liquidGlass = "true";
          markGlass(node);
        }
      }
    });

    const paintPointer = () => {
      frame = 0;
      if (!nextPointer) return;
      setReflection(nextPointer.element, nextPointer.x, nextPointer.y);
      nextPointer = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (stretch && stretch.pointerId === event.pointerId) {
        const dx = event.clientX - stretch.startX;
        const dy = event.clientY - stretch.startY;
        const horizontal = stretch.edge === "left" || stretch.edge === "right";
        const outward = stretch.edge === "left"
          ? -dx
          : stretch.edge === "right"
            ? dx
            : stretch.edge === "top"
              ? -dy
              : dy;
        const pull = clamp(outward, -8, 38);
        const cross = clamp(horizontal ? dy : dx, -22, 22);
        const scaleX = horizontal ? 1 + pull / Math.max(stretch.width, 320) * 0.42 : 1;
        const scaleY = horizontal ? 1 : 1 + pull / Math.max(stretch.height, 240) * 0.42;
        const shiftX = horizontal ? (stretch.edge === "left" ? -pull : pull) * 0.12 : cross * 0.025;
        const shiftY = horizontal ? cross * 0.025 : (stretch.edge === "top" ? -pull : pull) * 0.12;
        stretch.element.style.setProperty("--glass-stretch-x", String(scaleX));
        stretch.element.style.setProperty("--glass-stretch-y", String(scaleY));
        stretch.element.style.setProperty("--glass-shift-x", `${shiftX}px`);
        stretch.element.style.setProperty("--glass-shift-y", `${shiftY}px`);
        setReflection(stretch.element, event.clientX, event.clientY);
        return;
      }

      const element = glassElement(event.target);
      if (!element) {
        activeElement?.classList.remove("liquid-glass-active", "liquid-glass-edge-ready");
        activeElement = null;
        return;
      }
      if (activeElement && activeElement !== element) {
        activeElement.classList.remove("liquid-glass-active", "liquid-glass-edge-ready");
      }
      activeElement = element;
      nextPointer = { element, x: event.clientX, y: event.clientY };
      if (!frame) frame = window.requestAnimationFrame(paintPointer);

      if (!touchOnly.matches && !reducedMotion.matches && !element.matches(".glass-control,.glass-control-dark")) {
        const edge = edgeAt(element, event.clientX, event.clientY);
        element.classList.toggle("liquid-glass-edge-ready", Boolean(edge));
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === "touch" || touchOnly.matches || reducedMotion.matches) return;
      if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return;
      const element = glassElement(event.target);
      if (!element || element.matches(".glass-control,.glass-control-dark")) return;
      const edge = edgeAt(element, event.clientX, event.clientY);
      if (!edge) return;
      stretch = {
        element,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        width: edge.rect.width,
        height: edge.rect.height,
        edge: edge.edge,
      };
      element.classList.remove("liquid-glass-releasing");
      element.classList.add("liquid-glass-stretching");
      element.style.transformOrigin = edge.edge === "left"
        ? "right center"
        : edge.edge === "right"
          ? "left center"
          : edge.edge === "top"
            ? "center bottom"
            : "center top";
      element.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    const endStretch = (event: PointerEvent) => {
      if (!stretch || stretch.pointerId !== event.pointerId) return;
      const element = stretch.element;
      if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
      stretch = null;
      clearStretch(element);
    };

    const onPointerOut = (event: PointerEvent) => {
      const element = glassElement(event.target);
      if (!element || stretch?.element === element) return;
      const related = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (related && element.contains(related)) return;
      element.classList.remove("liquid-glass-active", "liquid-glass-edge-ready");
      if (activeElement === element) activeElement = null;
    };

    markGlass();
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", endStretch);
    document.addEventListener("pointercancel", endStretch);
    document.addEventListener("pointerout", onPointerOut);

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", endStretch);
      document.removeEventListener("pointercancel", endStretch);
      document.removeEventListener("pointerout", onPointerOut);
    };
  }, []);

  return null;
}
