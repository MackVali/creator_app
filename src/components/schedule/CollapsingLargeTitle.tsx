"use client";

import { ReactNode } from "react";

interface CollapsingLargeTitleProps {
  title: string;
  scrollY: number;
  rightSlot?: ReactNode;
}

export function CollapsingLargeTitle({
  title,
  scrollY,
  rightSlot,
}: CollapsingLargeTitleProps) {
  const clamped = Math.min(Math.max(scrollY, 0), 80);
  const progress = clamped / 80;

  const largeTitleHeight = 64;
  const toolbarHeight = 44;

  const currentLargeHeight = largeTitleHeight * (1 - progress);
  const headerHeight = toolbarHeight + currentLargeHeight;
  const titleScale = 1 - 0.25 * progress;
  const smallTitleOpacity = progress;
  const largeTitleOpacity = 1 - progress;

  return (
    <header
      className="flex flex-col bg-black text-white overflow-hidden transition-[height] motion-reduce:transition-none"
      style={{
        "--header-height": `${headerHeight}px`,
        "--large-title-height": `${currentLargeHeight}px`,
        "--title-scale": titleScale,
        "--toolbar-title-opacity": smallTitleOpacity,
        "--large-title-opacity": largeTitleOpacity,
      } as React.CSSProperties}
    >
      <div className="flex items-center h-11 px-4">
        <div className="toolbar-title flex-1 text-sm font-medium transition-opacity motion-reduce:transition-none">
          {title}
        </div>
        {rightSlot}
      </div>
      <div className="title-row px-4 flex items-end transition-[height,opacity] motion-reduce:transition-none">
        <h1 className="title-text text-3xl font-bold transition-transform motion-reduce:transition-none">
          {title}
        </h1>
      </div>
      <style jsx>{`
        header {
          height: var(--header-height);
        }
        .title-row {
          height: var(--large-title-height);
          opacity: var(--large-title-opacity);
        }
        .title-text {
          transform: scale(var(--title-scale));
          transform-origin: left bottom;
        }
        .toolbar-title {
          opacity: var(--toolbar-title-opacity);
        }
      `}</style>
    </header>
  );
}

