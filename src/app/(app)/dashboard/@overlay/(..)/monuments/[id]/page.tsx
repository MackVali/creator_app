'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import useMonumentView from '@/app/state/useMonumentView';

export default function MonumentOverlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const snap = useMonumentView((s) => s.getSnapshot(id));
  const { data } = useQuery({
    queryKey: ['monument', id],
    queryFn: async () => {
      const res = await fetch(`/api/monuments/${id}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 30000,
  });

  const header = data || snap;

  const close = () => router.back();

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={close} />
        <motion.div
          layoutId={`monument:${id}:surface`}
          className="relative m-4 rounded-xl bg-white p-4 dark:bg-zinc-900"
        >
          <motion.div layoutId={`monument:${id}:icon`}>
            {header?.icon}
          </motion.div>
          <motion.h1 layoutId={`monument:${id}:title`} className="text-xl font-bold">
            {header?.title}
          </motion.h1>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
