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
        className="flex flex-col items-center text-xs"
      >
        <div
          className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
            isActive ? "text-white" : "hover:text-white"
          }`}
        >
          <div
            className={
              isActive
                ? "filter drop-shadow-[0_0_6px_rgba(153,102,204,0.6)]"
                : undefined
            }
          >
            {item.icon}
          </div>
          <span
            className={
              isActive
                ? "filter drop-shadow-[0_0_6px_rgba(153,102,204,0.6)]"
                : undefined
            }
          >
            {item.label}
          </span>
        </div>
      </a>
    );
  };

  const mid = Math.ceil(items.length / 2);
  return (
    <nav className="w-full bg-gray-900 text-gray-400 flex justify-around items-center h-16">
      {items.slice(0, mid).map(renderItem)}
      <div className="w-14" aria-hidden="true" />
      {items.slice(mid).map(renderItem)}
    </nav>
  );
}

export default BottomBarNav;

