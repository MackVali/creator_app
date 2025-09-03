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
  return (
    <nav className="w-full bg-gray-900 text-gray-400 flex justify-around items-center h-16">
      {items.map((item) => {
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
            className={`flex flex-col items-center gap-1 p-2 text-xs rounded-md transition-colors ${
              isActive ? "text-white bg-gray-800 border border-[#9966CC]" : "hover:text-white"
            }`}
            style={isActive ? { boxShadow: "0 0 8px #9966CC" } : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

export default BottomBarNav;

