import type { MonumentSnapshot } from '@/app/state/useMonumentView';

// Basic API helpers used for prefetching monument data. The actual
// backend implementation can be swapped later; for now we simply
// fetch from REST endpoints and return JSON.

export interface Goal {
  id: string;
  title?: string;
  name?: string;
}

export async function fetchMonument(id: string): Promise<MonumentSnapshot> {
  const res = await fetch(`/api/monuments/${id}`);
  if (!res.ok) {
    throw new Error('Failed to fetch monument');
  }
  return res.json();
}

export async function fetchGoals(id: string): Promise<Goal[]> {
  const res = await fetch(`/api/monuments/${id}/goals`);
  if (!res.ok) {
    throw new Error('Failed to fetch monument goals');
  }
  return res.json();
}

