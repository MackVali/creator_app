'use client';

import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { fetchMonument } from '@/lib/monuments';
import { useMonumentView } from '@/app/state/useMonumentView';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface MonumentHeaderProps {
  id: string;
}

/**
 * Header for the monument detail page. It reuses layoutIds from the
 * dashboard card so the icon, title and surface morph into place.
 */
export function MonumentHeader({ id }: MonumentHeaderProps) {
  const router = useRouter();
  const snapshot = useMonumentView((s) => s.last);
  const { data } = useQuery({
    queryKey: ['monument', id],
    queryFn: () => fetchMonument(id),
    initialData: snapshot && snapshot.id === id ? snapshot : undefined,
  });

  useEffect(() => {
    return () => {
      // clear snapshot when leaving
      useMonumentView.getState().clear();
    };
  }, []);

  const handleBack = () => router.back();

  return (
    <motion.header
      className="relative overflow-hidden"
      style={{ backgroundColor: data?.color || '#fff' }}
    >
      <motion.div
        layoutId={`monument:${id}:surface`}
        className="absolute inset-0"
        style={{ backgroundColor: data?.color || '#fff' }}
        transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }}
      />
      <div className="relative z-10 p-4">
        <button onClick={handleBack} className="mb-2 text-sm">Back</button>
        <motion.div layoutId={`monument:${id}:icon`} className="text-4xl">
          {data?.icon}
        </motion.div>
        <motion.h1
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

