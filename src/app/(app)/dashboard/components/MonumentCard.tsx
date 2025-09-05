'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import useMonumentView from '@/app/state/useMonumentView';
import { transitionLink } from '@/app/lib/transitionLink';

interface MonumentCardProps {
  monument: {
    id: string;
    title: string;
    color: string;
    icon: React.ReactNode;
    iconKey: string;
    progress?: number;
  };
}

export default function MonumentCard({ monument }: MonumentCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const warm = useMonumentView((s) => s.warm);

  const onPointerDown = () => {
    warm(
      {
        id: monument.id,
        title: monument.title,
        color: monument.color,
        icon: monument.iconKey,
        progress: monument.progress,
      },
      queryClient
    );
  };

  const onClick = () => {
    transitionLink(() => router.push(`/dashboard/monuments/${monument.id}`));
  };

  return (
    <motion.button
      onPointerDown={onPointerDown}
      onClick={onClick}
      layoutId={`monument:${monument.id}:surface`}
      className="rounded-lg p-4 text-left"
      style={{ backgroundColor: monument.color }}
    >
      <motion.div layoutId={`monument:${monument.id}:icon`} className="mb-2">
        {monument.icon}
      </motion.div>
      <motion.h3
        layoutId={`monument:${monument.id}:title`}
        className="text-sm font-medium"
      >
        {monument.title}
      </motion.h3>
    </motion.button>
  );
}
