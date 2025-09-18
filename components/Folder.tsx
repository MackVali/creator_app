"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

import "./Folder.css";

const DEFAULT_COLOR = "#5227FF";

interface FolderProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  color?: string;
  size?: number;
  items: (React.ReactNode | null | undefined)[];
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeHex(color: string | undefined) {
  if (!color) return DEFAULT_COLOR;
  const trimmed = color.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return (
      "#" +
      hex
        .split("")
        .map((char) => char + char)
        .join("")
        .toLowerCase()
    );
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toLowerCase()}`;
  }
  return DEFAULT_COLOR;
}

function darkenHex(color: string, amount: number) {
  const normalized = normalizeHex(color);
  const hex = normalized.slice(1);
  const value = parseInt(hex, 16);
  if (Number.isNaN(value)) {
    return DEFAULT_COLOR;
  }
  const factor = clamp(1 - amount / 100, 0, 1);
  const r = clamp(Math.round(((value >> 16) & 0xff) * factor), 0, 255);
  const g = clamp(Math.round(((value >> 8) & 0xff) * factor), 0, 255);
  const b = clamp(Math.round((value & 0xff) * factor), 0, 255);
  const next = (r << 16) | (g << 8) | b;
  return `#${next.toString(16).padStart(6, "0")}`;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
}

const Folder = forwardRef<HTMLButtonElement, FolderProps>((props, forwardedRef) => {
  const {
    color = DEFAULT_COLOR,
    size = 1,
    items,
    className,
    open: controlledOpen,
    defaultOpen = false,
    onOpenChange,
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerLeave,
    onPointerCancel,
    style: styleProp,
    ...rest
  } = props;

  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const prefersReducedMotion = usePrefersReducedMotion();
  const folderRef = useRef<HTMLButtonElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pointerOffset = useRef({ x: 0, y: 0 });

  useImperativeHandle(forwardedRef, () => folderRef.current as HTMLButtonElement, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const node = folderRef.current;
    if (!node) return;
    node.setAttribute("data-pressed", "false");
  }, []);

  useEffect(() => {
    const node = folderRef.current;
    if (!node) return;
    node.setAttribute("data-reduced-motion", prefersReducedMotion ? "true" : "false");
  }, [prefersReducedMotion]);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? Boolean(controlledOpen) : uncontrolledOpen;

  const colors = useMemo(() => {
    const base = normalizeHex(color);
    const back = darkenHex(base, 8);
    return { base, back };
  }, [color]);

  const style = useMemo<React.CSSProperties>(() => {
    const baseVariables: Record<string, string> = {
      "--folder-size": size.toString(),
      "--folder-color": colors.base,
      "--folder-back-color": colors.back,
      "--paper-1": "rgba(255, 255, 255, 1)",
      "--paper-2": "rgba(246, 247, 255, 1)",
      "--paper-3": "rgba(239, 241, 255, 1)",
      "--paper-translate-x": "0px",
      "--paper-translate-y": "0px",
    };
    return { ...baseVariables, ...(styleProp as React.CSSProperties) };
  }, [colors.base, colors.back, size, styleProp]);

  const schedulePointerUpdate = () => {
    if (prefersReducedMotion) return;
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      const node = folderRef.current;
      rafRef.current = null;
      if (!node) return;
      node.style.setProperty("--paper-translate-x", `${pointerOffset.current.x}px`);
      node.style.setProperty("--paper-translate-y", `${pointerOffset.current.y}px`);
    });
  };

  const resetPointer = () => {
    pointerOffset.current = { x: 0, y: 0 };
    schedulePointerUpdate();
  };

  const commitOpenChange = (nextOpen: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!rest.disabled) {
      commitOpenChange(!open);
    }
    onClick?.(event);
  };

  const handlePointerMoveInternal = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!folderRef.current || prefersReducedMotion) {
      onPointerMove?.(event);
      return;
    }
    const rect = folderRef.current.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width - 0.5) * 10 * size;
    const relativeY = ((event.clientY - rect.top) / rect.height - 0.5) * 8 * size;
    pointerOffset.current = { x: relativeX, y: relativeY };
    schedulePointerUpdate();
    onPointerMove?.(event);
  };

  const setPressed = (pressed: boolean) => {
    const node = folderRef.current;
    if (!node) return;
    node.setAttribute("data-pressed", pressed ? "true" : "false");
  };

  const handlePointerDownInternal = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!prefersReducedMotion) {
      setPressed(true);
    }
    onPointerDown?.(event);
  };

  const handlePointerUpInternal = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!prefersReducedMotion) {
      setPressed(false);
      resetPointer();
    }
    onPointerUp?.(event);
  };

  const handlePointerLeaveInternal = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!prefersReducedMotion) {
      setPressed(false);
      resetPointer();
    }
    onPointerLeave?.(event);
  };

  const handlePointerCancelInternal = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!prefersReducedMotion) {
      setPressed(false);
      resetPointer();
    }
    onPointerCancel?.(event);
  };

  const papers = items
    .slice(0, 3)
    .map((item, index) => {
      if (item === null || item === undefined || item === false) {
        return null;
      }
      return (
        <div key={index} className={cn("paper", `paper-${index + 1}`)} aria-hidden>
          <div className="paper__content">{item}</div>
        </div>
      );
    })
    .filter(Boolean);

  return (
    <button
      {...rest}
      ref={(node) => {
        folderRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      }}
      type="button"
      className={cn("folder", open && "open", className)}
      aria-expanded={open}
      onClick={handleClick}
      onPointerMove={handlePointerMoveInternal}
      onPointerDown={handlePointerDownInternal}
      onPointerUp={handlePointerUpInternal}
      onPointerLeave={handlePointerLeaveInternal}
      onPointerCancel={handlePointerCancelInternal}
      style={style}
      data-reduced-motion={prefersReducedMotion ? "true" : "false"}
    >
      <div className="folder__back" aria-hidden />
      <div className="folder__papers" aria-hidden>
        {papers.length > 0 ? papers : null}
      </div>
      <div className="folder__front" aria-hidden />
      <div className="folder__front right" aria-hidden />
    </button>
  );
});

Folder.displayName = "Folder";

export default Folder;
export { Folder };
