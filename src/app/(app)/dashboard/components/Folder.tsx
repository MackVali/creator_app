"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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

const MAX_ITEMS = 5;

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
  color = "#221042",
  gradient,
  size = 1,
  items = [],
  label,
  className,
}: FolderProps) {
  const visibleItems = items.filter((item) => item != null).slice(0, MAX_ITEMS);

  const [open, setOpen] = useState(false);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);

  const folderBackColor = darkenColor(color, -0.18);

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

  useEffect(() => {
    const content = panelContentRef.current;
    if (!content) {
      setPanelHeight(0);
      return;
    }

    const updateHeight = () => {
      setPanelHeight(content.scrollHeight);
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(content);

    return () => {
      observer.disconnect();
    };
  }, [size, visibleItems.length]);

  const panelStyle: CSSProperties = {
    ["--panel-height" as string]: open ? `${panelHeight}px` : "0px",
    ["--panel-opacity" as string]: open ? "1" : "0",
  };

  return (
    <div className={cn(styles.wrapper, className)} style={wrapperStyle}>
      <div
        className={cn(styles.folder, open && styles.open)}
        style={folderStyle}
        onClick={handleClick}
      >
        <div className={styles.folderBack}>
          <div
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
