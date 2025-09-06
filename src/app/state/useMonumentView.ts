'use client';

import { create } from 'zustand';

export interface MonumentSnapshot {
  id: string;
  title: string;
  color: string;
  progress: number;
  iconKey: string;
  origin?: HTMLElement;
}

interface MonumentViewState {
  snaps: Record<string, MonumentSnapshot>;
  warm: (snap: MonumentSnapshot) => void;
  clear: (id: string) => void;
}

/**
 * Tiny store that keeps snapshots of monuments so the overlay header
 * can paint instantly while live data loads in the background.
 */
export const useMonumentView = create<MonumentViewState>((set) => ({
  snaps: {},
  warm: (snap) =>
    set((s) => ({ snaps: { ...s.snaps, [snap.id]: snap } })),
  clear: (id) =>
    set((s) => {
      const snaps = { ...s.snaps };
      delete snaps[id];
      return { snaps };
    }),
}));

