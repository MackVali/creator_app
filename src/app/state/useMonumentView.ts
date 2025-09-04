'use client';

import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface MonumentSnapshot {
  id: string;
  title: string;
  color: string;
  progress: number;
  icon: ReactNode;
}

interface MonumentViewState {
  last?: MonumentSnapshot;
  setSnapshot: (snap: MonumentSnapshot) => void;
  clear: () => void;
}

/**
 * Small Zustand store that remembers the most recently opened
 * monument card. During navigation we paint the detail page from
 * this snapshot instantly while the real data is fetched in the
 * background.
 */
export const useMonumentView = create<MonumentViewState>((set) => ({
  last: undefined,
  setSnapshot: (snap) => set({ last: snap }),
  clear: () => set({ last: undefined }),
}));

