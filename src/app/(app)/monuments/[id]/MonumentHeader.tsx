'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { fetchMonument } from '@/lib/monuments';
import { useMonumentView } from '@/app/state/useMonumentView';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { getMonumentIcon } from '@/lib/monumentIcons';

interface MonumentHeaderProps {
  id: string;
}

/**
 * Header for the monument detail page. It reuses layoutIds from the
 * dashboard card so the icon, title and surface morph into place.
 */
export function MonumentHeader({ id }: MonumentHeaderProps) {
  const router = useRouter();
  const snapshot = useMonumentView((s) => s.snaps[id]);
  const prefersReduced = useReducedMotion();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const { data } = useQuery({
    queryKey: ['monument', id],
    queryFn: () => fetchMonument(id),
    initialData: snapshot,
    staleTime: 30_000,
  });

  useEffect(() => {
    titleRef.current?.focus();
    return () => {
      snapshot?.origin?.focus();
      useMonumentView.getState().clear(id);
    };
  }, [id, snapshot]);

  const handleBack = () => router.back();

  return (
    <motion.header
      className="relative overflow-hidden"
      style={{ backgroundColor: data?.color || '#fff' }}
    >
      <motion.div
        layoutId={`monument:${id}:surface`}
        className="absolute inset-0"
        style={{ backgroundColor: data?.color || '#fff', willChange: 'transform, opacity' }}
        transition={prefersReduced ? { duration: 0.12 } : { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }}
      />
      <div className="relative z-10 p-4">
        <button onClick={handleBack} className="mb-2 text-sm">
          Back
        </button>
        <motion.div layoutId={`monument:${id}:icon`} className="text-4xl">
          {getMonumentIcon(data?.iconKey || snapshot?.iconKey || 'default')}
        </motion.div>
        <motion.h1
          ref={titleRef}
          tabIndex={-1}
          layoutId={`monument:${id}:title`}
          className="mt-2 text-2xl font-bold"
        >
          {data?.title}
        </motion.h1>
      </div>
    </motion.header>
  );
}

export default MonumentHeader;

