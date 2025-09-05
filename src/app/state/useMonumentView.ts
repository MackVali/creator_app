import { create } from 'zustand';
import { QueryClient } from '@tanstack/react-query';

export interface MonumentSnapshot {
  id: string;
  title: string;
  color: string;
  icon?: string;
  progress?: number;
}

interface MonumentViewState {
  snaps: Record<string, MonumentSnapshot>;
  warm: (
    snap: MonumentSnapshot,
    client?: QueryClient
  ) => void;
  getSnapshot: (id: string) => MonumentSnapshot | undefined;
}

export const useMonumentView = create<MonumentViewState>((set, get) => ({
  snaps: {},
  warm: (snap, client) => {
    set((state) => ({ snaps: { ...state.snaps, [snap.id]: snap } }));
    if (client) {
      // prefetch monument and goals
      client.prefetchQuery({ queryKey: ['monument', snap.id] });
      client.prefetchQuery({ queryKey: ['monumentGoals', snap.id] });
    }
  },
  getSnapshot: (id) => get().snaps[id],
}));

export default useMonumentView;
