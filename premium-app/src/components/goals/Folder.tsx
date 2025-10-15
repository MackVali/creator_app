"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./Folder.module.css";

type PaperOffset = { x: number; y: number };

type FolderProps = {
  color?: string;
  gradient?: string;
  size?: number;
  items?: ReactNode[];
  label?: ReactNode;
  className?: string;
  bareItems?: boolean;
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

const computePositions = (count: number) => {
  if (count <= 0) return [] as number[];
  if (count === 1) return [0];
  const start = -(count - 1) / 2;
  return Array.from({ length: count }, (_, index) => start + index);
};

export function Folder({
  color = "#221042",
  gradient,
  size = 1,
  items = [],
  label,
  className,
  bareItems = false,
}: FolderProps) {
  const visibleItems = items.filter((item) => item != null).slice(0, MAX_ITEMS);
  const positions = computePositions(visibleItems.length);

  const [open, setOpen] = useState(false);
  const [paperOffsets, setPaperOffsets] = useState<PaperOffset[]>(() =>
    Array.from({ length: MAX_ITEMS }, () => ({ x: 0, y: 0 }))
  );

  const folderBackColor = darkenColor(color, -0.18);

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
  };

  if (gradient) {
    folderStyle["--folder-gradient" as string] = gradient;
  }

  const wrapperStyle: CSSProperties = {
    ["--folder-scale" as string]: size,
  };

  return (
    <div className={cn(styles.wrapper, className)} style={wrapperStyle}>
      <div
        className={cn(styles.folder, open && styles.open)}
        style={folderStyle}
        onClick={handleClick}
      >
        <div className={styles.folderBack}>
          {visibleItems.map((item, index) => {
            const magnetStyle: CSSProperties = {
              ["--paper-position" as string]: `${positions[index] ?? 0}`,
              ["--paper-color" as string]:
                paperColors[index] ?? paperColors[paperColors.length - 1],
              ["--paper-z" as string]: `${Math.round(
                MAX_ITEMS - Math.abs(positions[index] ?? 0)
              )}`,
              ["--paper-delay" as string]: `${index * 0.04}s`,
            };

            if (open) {
              magnetStyle["--magnet-x" as string] = `${
                paperOffsets[index]?.x ?? 0
              }px`;
              magnetStyle["--magnet-y" as string] = `${
                paperOffsets[index]?.y ?? 0
              }px`;
            }

            return (
              <div
                key={index}
                className={cn(
                  bareItems ? styles.paperBare : styles.paper
                )}
                onMouseMove={(event) => handlePaperMouseMove(event, index)}
                onMouseLeave={(event) => handlePaperMouseLeave(event, index)}
                style={magnetStyle}
              >
                {item}
              </div>
            );
          })}
          <div className={styles.folderFront}>
            {label ? <div className={styles.folderLabel}>{label}</div> : null}
          </div>
          <div className={styles.folderFrontRight} />
        </div>
      </div>
    </div>
  );
}
