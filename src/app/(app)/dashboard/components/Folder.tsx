"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./Folder.module.css";

type FolderProps = {
  color?: string;
  gradient?: string;
  size?: number;
  items?: ReactNode[];
  label?: ReactNode;
  className?: string;
};

const darkenColor = (hex: string, percent: number) => {
  let color = hex.startsWith("#") ? hex.slice(1) : hex;
  if (color.length === 3) {
    color = color
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(color, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.floor(r * (1 - percent))));
  g = Math.max(0, Math.min(255, Math.floor(g * (1 - percent))));
  b = Math.max(0, Math.min(255, Math.floor(b * (1 - percent))));
  return (
    "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
  );
};

const paperColors = [
  darkenColor("#ffffff", 0.16),
  darkenColor("#ffffff", 0.1),
  darkenColor("#ffffff", 0.05),
  "#ffffff",
  darkenColor("#ffffff", -0.05),
];

export function Folder({
  color = "#E5E7EB",
  gradient,
  size = 1,
  items = [],
  label,
  className,
}: FolderProps) {
  const visibleItems = items.filter((item) => item != null);

  const [open, setOpen] = useState(false);
  const folderBackRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const [panelShift, setPanelShift] = useState(0);

  const folderBackColor = darkenColor(color, 0.12);

  const handleClick = () => {
    setOpen((prev) => !prev);
  };

  const folderStyle: CSSProperties = {
    ["--folder-color" as string]: color,
    ["--folder-back-color" as string]: folderBackColor,
  };

  if (gradient) {
    folderStyle["--folder-gradient" as string] = gradient;
  }

  const wrapperStyle: CSSProperties = {
    ["--folder-scale" as string]: size,
  };

  const recomputePanelMetrics = useCallback(() => {
    const content = panelContentRef.current;

    if (content) {
      setPanelHeight(content.scrollHeight);
    } else {
      setPanelHeight(0);
    }

    if (!open) {
      setPanelShift(0);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const folderBack = folderBackRef.current;
    const panel = panelRef.current;

    if (!folderBack || !panel) {
      setPanelShift(0);
      return;
    }

    const backRect = folderBack.getBoundingClientRect();
    const panelWidth = panel.getBoundingClientRect().width;
    const baseLeft = backRect.left + panel.offsetLeft;
    const folderCenter = backRect.left + backRect.width / 2;

    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth || panelWidth;
    const desiredLeft = folderCenter - panelWidth / 2;
    const viewportPadding = 16;
    const minLeft = viewportPadding;
    const maxLeft = viewportWidth - panelWidth - viewportPadding;

    let clampedLeft = desiredLeft;

    if (maxLeft < minLeft) {
      clampedLeft = Math.max((viewportWidth - panelWidth) / 2, 0);
    } else if (desiredLeft < minLeft) {
      clampedLeft = minLeft;
    } else if (desiredLeft > maxLeft) {
      clampedLeft = maxLeft;
    }

    setPanelShift(clampedLeft - baseLeft);
  }, [open]);

  useLayoutEffect(() => {
    let frame: number | undefined;

    const scheduleMeasurement = () => {
      if (typeof window === "undefined") {
        return;
      }

      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }

      frame = requestAnimationFrame(() => {
        frame = undefined;
        recomputePanelMetrics();
      });
    };

    scheduleMeasurement();

    const content = panelContentRef.current;

    if (content && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        scheduleMeasurement();
      });

      observer.observe(content);

      return () => {
        observer.disconnect();

        if (frame !== undefined) {
          cancelAnimationFrame(frame);
        }
      };
    }

    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [recomputePanelMetrics, size, visibleItems.length]);

  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      recomputePanelMetrics();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [open, recomputePanelMetrics]);

  const safePanelShift = Number.isFinite(panelShift) ? panelShift : 0;

  const panelStyle: CSSProperties = {
    ["--panel-height" as string]: open ? `${panelHeight}px` : "0px",
    ["--panel-opacity" as string]: open ? "1" : "0",
    ["--panel-shift" as string]: `${safePanelShift}px`,
  };

  return (
    <div className={cn(styles.wrapper, className)} style={wrapperStyle}>
      <div
        className={cn(styles.folder, open && styles.open)}
        style={folderStyle}
        onClick={handleClick}
      >
        <div ref={folderBackRef} className={styles.folderBack}>
          <div
            ref={panelRef}
            className={cn(styles.paperPanel, open && styles.paperPanelOpen)}
            style={panelStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div ref={panelContentRef} className={styles.paperTrack}>
              {visibleItems.map((item, index) => {
                const cardStyle: CSSProperties = {
                  ["--paper-color" as string]:
                    paperColors[index] ?? paperColors[paperColors.length - 1],
                };

                return (
                  <div key={index} className={styles.paper} style={cardStyle}>
                    {item}
                  </div>
                );
              })}
            </div>
          </div>
          <div className={styles.folderFront}>
            {label ? <div className={styles.folderLabel}>{label}</div> : null}
          </div>
          <div className={styles.folderFrontRight} />
        </div>
      </div>
    </div>
  );
}
