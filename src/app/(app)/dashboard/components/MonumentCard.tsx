'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchMonument, fetchGoals } from '@/lib/monuments';
import { useMonumentView } from '@/app/state/useMonumentView';

export interface MonumentCardProps {
  id: string;
  title: string;
  color: string;
  icon: ReactNode;
  progress: number;
}

/**
 * Card shown on the dashboard for a monument. It participates in the
 * shared-element transition to the monument detail view by using
 * consistent `layoutId` values for its surface, icon and title.
 *
 * Data for the detail view is prefetched on pointer down so that when
 * the route changes there is no loading indicator and the header can
 * paint instantly from a snapshot stored in Zustand.
 */
export function MonumentCard({ id, title, color, icon, progress }: MonumentCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setSnapshot = useMonumentView((s) => s.setSnapshot);

  const warm = () => {
    setSnapshot({ id, title, color, progress, icon });
    queryClient.prefetchQuery({ queryKey: ['monument', id], queryFn: () => fetchMonument(id) });
    queryClient.prefetchQuery({ queryKey: ['monumentGoals', id], queryFn: () => fetchGoals(id) });
    router.prefetch(`/monuments/${id}`);
  };

  return (
    <motion.button
      layoutId={`monument:${id}:surface`}
      style={{ backgroundColor: color }}
      className="relative w-full overflow-hidden rounded-lg text-left"
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }}
      onPointerDown={warm}
      onClick={() => router.push(`/monuments/${id}`)}
    >
      <motion.div layoutId={`monument:${id}:icon`} className="p-4 text-3xl">
        {icon}
      </motion.div>
      <motion.div layoutId={`monument:${id}:title`} className="px-4 pb-4 font-semibold">
        {title}
      </motion.div>
    </motion.button>
  );
}

export default MonumentCard;

