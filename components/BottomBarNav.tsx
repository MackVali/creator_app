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
        className="flex items-center justify-center"
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
  return (
    <nav className="w-full bg-gray-900 text-gray-400">
      <div
        className="grid h-16 items-center"
        style={{
          gridTemplateColumns: `repeat(${mid},1fr) 3.5rem repeat(${items.length - mid},1fr)`,
        }}
      >
        {items.map((item, idx) => (
          <React.Fragment key={item.key}>
            {idx === mid ? <div /> : null}
            {renderItem(item)}
          </React.Fragment>
        ))}
      </div>
    </nav>
  );
}

export default BottomBarNav;

