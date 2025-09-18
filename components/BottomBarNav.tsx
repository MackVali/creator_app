import React from "react";

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
}

export function BottomBarNav({ items, currentPath, onNavigate }: BottomBarNavProps) {
  const renderItem = (item: BottomBarNavItem) => {
    const isActive = item.href === currentPath;
    return (
      <a
        key={item.key}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        onClick={(e) => {
          if (isActive) {
            e.preventDefault();
            return;
          }
          if (onNavigate) {
            e.preventDefault();
            onNavigate(item.href);
          }
        }}
        className="flex flex-1 min-w-0 items-center justify-center"
      >
        <div
          className={`flex flex-col items-center gap-1 px-3 py-1 text-xs transition-colors ${
            isActive ? "text-white" : "hover:text-white"
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
            className={`font-bold uppercase ${
              isActive
                ? "drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]"
                : ""
            }`}
          >
            {item.label}
          </span>
        </div>
      </a>
    );
  };

  const mid = Math.ceil(items.length / 2);
  const leftItems = items.slice(0, mid);
  const rightItems = items.slice(mid);
  return (
    <nav className="w-full border-t border-[var(--hairline)] bg-[var(--surface-elevated)] text-[var(--muted)]">
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

