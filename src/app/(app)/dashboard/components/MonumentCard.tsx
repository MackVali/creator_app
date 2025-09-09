'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { fetchMonument, fetchGoals } from '@/lib/monuments';
import { useMonumentView } from '@/app/state/useMonumentView';
import { getMonumentIcon } from '@/lib/monumentIcons';
import { transitionLink } from '@/app/lib/transitionLink';

export interface MonumentCardProps {
  id: string;
  title: string;
  color: string;
  iconKey: string;
  progress: number;
}

/**
 * Card shown on the dashboard for a monument. It participates in the
 * shared-element transition to the monument detail view by using
 * consistent `layoutId` values for its surface, icon and title.
 */
export function MonumentCard({ id, title, color, iconKey, progress }: MonumentCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const warmStore = useMonumentView((s) => s.warm);
  const prefersReduced = useReducedMotion();

  const warm = (target: HTMLElement) => {
    warmStore({ id, title, color, progress, iconKey, origin: target });
    queryClient.prefetchQuery({ queryKey: ['monument', id], queryFn: () => fetchMonument(id) });
    queryClient.prefetchQuery({ queryKey: ['monumentGoals', id], queryFn: () => fetchGoals(id) });
    router.prefetch(`/dashboard/monuments/${id}`);
  };

  const handleClick = () => {
    transitionLink(router, `/dashboard/monuments/${id}`);
  };

  return (
    <motion.button
      layoutId={`monument:${id}:surface`}
      style={{ backgroundColor: color, willChange: 'transform, opacity' }}
      className="relative w-full overflow-hidden rounded-lg text-left"
      whileTap={prefersReduced ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }}
      onPointerDown={(e) => warm(e.currentTarget)}
      onClick={handleClick}
    >
      <motion.div layoutId={`monument:${id}:icon`} className="p-4 text-3xl">
        {getMonumentIcon(iconKey)}
      </motion.div>
      <motion.h3 layoutId={`monument:${id}:title`} className="px-4 pb-4 font-semibold">
        {title}
      </motion.h3>
    </motion.button>
  );
}

export default MonumentCard;

