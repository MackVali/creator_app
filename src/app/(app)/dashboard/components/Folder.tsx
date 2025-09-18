"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./Folder.module.css";

type PaperOffset = { x: number; y: number };

type FolderProps = {
  color?: string;
  size?: number;
  items?: ReactNode[];
  className?: string;
};

const MAX_ITEMS = 3;

const paperClasses = [styles.paper1, styles.paper2, styles.paper3];

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

export function Folder({
  color = "#5227FF",
  size = 1,
  items = [],
  className,
}: FolderProps) {
  const papers = items.slice(0, MAX_ITEMS);
  while (papers.length < MAX_ITEMS) {
    papers.push(null);
  }

  const [open, setOpen] = useState(false);
  const [paperOffsets, setPaperOffsets] = useState<PaperOffset[]>(() =>
    Array.from({ length: MAX_ITEMS }, () => ({ x: 0, y: 0 }))
  );

  const folderBackColor = darkenColor(color, 0.08);
  const paper1 = darkenColor("#ffffff", 0.1);
  const paper2 = darkenColor("#ffffff", 0.05);
  const paper3 = "#ffffff";

  const handleClick = () => {
    setOpen((prev) => {
      if (prev) {
        setPaperOffsets(Array.from({ length: MAX_ITEMS }, () => ({ x: 0, y: 0 })));
      }
      return !prev;
    });
  };

  const handlePaperMouseMove = (event: MouseEvent<HTMLDivElement>, index: number) => {
    if (!open) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const offsetX = (event.clientX - centerX) * 0.15;
    const offsetY = (event.clientY - centerY) * 0.15;
    setPaperOffsets((prev) => {
      const next = [...prev];
      next[index] = { x: offsetX, y: offsetY };
      return next;
    });
  };

  const handlePaperMouseLeave = (_event: MouseEvent<HTMLDivElement>, index: number) => {
    setPaperOffsets((prev) => {
      const next = [...prev];
      next[index] = { x: 0, y: 0 };
      return next;
    });
  };

  const folderStyle: CSSProperties = {
    ["--folder-color" as string]: color,
    ["--folder-back-color" as string]: folderBackColor,
    ["--paper-1" as string]: paper1,
    ["--paper-2" as string]: paper2,
    ["--paper-3" as string]: paper3,
  };

  const scaleStyle: CSSProperties = { transform: `scale(${size})` };

  return (
    <div className={cn(styles.wrapper, className)} style={scaleStyle}>
      <div
        className={cn(styles.folder, open && styles.open)}
        style={folderStyle}
        onClick={handleClick}
      >
        <div className={styles.folderBack}>
          {papers.map((item, index) => {
            const isEmpty = item == null;
            const magnetStyle: CSSProperties | undefined = open
              ? {
                  ["--magnet-x" as string]: `${paperOffsets[index]?.x ?? 0}px`,
                  ["--magnet-y" as string]: `${paperOffsets[index]?.y ?? 0}px`,
                }
              : undefined;

            return (
              <div
                key={index}
                className={cn(
                  styles.paper,
                  paperClasses[index] ?? "",
                  isEmpty && styles.emptyPaper
                )}
                onMouseMove={(event) => handlePaperMouseMove(event, index)}
                onMouseLeave={(event) => handlePaperMouseLeave(event, index)}
                style={magnetStyle}
                aria-hidden={isEmpty || undefined}
              >
                {item}
              </div>
            );
          })}
          <div className={styles.folderFront} />
          <div className={styles.folderFrontRight} />
        </div>
      </div>
    </div>
  );
}
