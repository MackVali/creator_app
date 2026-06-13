import React from "react";
import Link from "next/link";

export interface BottomBarNavItem {
  key: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
}

export interface BottomBarNavProps {
  items: BottomBarNavItem[];
  currentPath: string;
  onNavigate?: (href: string) => void;
  shouldHandleActiveClick?: (href: string) => boolean;
  onPrefetch?: (href: string) => void;
}

export function BottomBarNav({
  items,
  currentPath,
  onNavigate,
  shouldHandleActiveClick,
  onPrefetch,
}: BottomBarNavProps) {
  const renderItem = (item: BottomBarNavItem) => {
    const isActive =
      item.href === currentPath ||
      (item.href !== "/" && currentPath.startsWith(`${item.href}/`));
    return (
      <Link
        key={item.key}
        href={item.href}
        prefetch
        aria-current={isActive ? "page" : undefined}
        onClick={(e) => {
          if (isActive) {
            if (!shouldHandleActiveClick?.(item.href)) {
              e.preventDefault();
              return;
            }
          }
          if (onNavigate) {
            e.preventDefault();
            onNavigate(item.href);
          }
        }}
        onPointerEnter={() => onPrefetch?.(item.href)}
        onFocus={() => onPrefetch?.(item.href)}
        onTouchStart={() => onPrefetch?.(item.href)}
        data-tour={item.href === "/schedule" ? "nav-schedule" : undefined}
        className="flex min-w-0 flex-1 items-center justify-center"
      >
        <div
          className={`flex min-w-0 flex-col items-center gap-0.5 px-2 py-1 transition-colors ${
            isActive
              ? "text-[var(--text)]"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          <div
            className={
              isActive
                ? "drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]"
                : undefined
            }
          >
            {item.icon}
          </div>
          <span
            className={`whitespace-nowrap text-[0.6rem] font-bold uppercase leading-none tracking-[0.08em] ${
              isActive ? "drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]" : ""
            }`}
          >
            {item.label}
          </span>
        </div>
      </Link>
    );
  };

  const mid = Math.ceil(items.length / 2);
  const leftItems = items.slice(0, mid);
  const rightItems = items.slice(mid);
  return (
    <nav className="app-bottom-nav pointer-events-auto mx-auto w-full max-w-md rounded-[22px] border backdrop-blur-xl">
      <div className="grid h-16 w-full grid-cols-[1fr_3.5rem_1fr] items-center">
        <div className="flex h-full min-w-0 items-center justify-evenly">
          {leftItems.map(renderItem)}
        </div>
        <div />
        <div className="flex h-full min-w-0 items-center justify-evenly">
          {rightItems.map(renderItem)}
        </div>
      </div>
    </nav>
  );
}

export default BottomBarNav;
