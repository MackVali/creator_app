'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MonumentHeader } from '@/app/(app)/monuments/[id]/MonumentHeader';
import { MonumentGoals } from '@/app/(app)/monuments/[id]/MonumentGoals';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MonumentOverlayPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const prefersReduced = useReducedMotion();
  const close = () => router.back();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReduced ? 0.12 : 0.2 }}
      >
        <motion.div
          className="absolute inset-0 bg-black/30 backdrop-blur-sm"
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReduced ? 0.12 : 0.18 }}
        />
        <motion.div className="absolute inset-0 overflow-y-auto">
          <MonumentHeader id={id} />
          <MonumentGoals id={id} />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

