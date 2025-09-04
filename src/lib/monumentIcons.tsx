import type { ReactNode } from 'react';

const ICONS: Record<string, ReactNode> = {
  mountain: <span>🏔️</span>,
  default: <span>🏔️</span>,
};

export function getMonumentIcon(key: string): ReactNode {
  return ICONS[key] ?? ICONS.default;
}

