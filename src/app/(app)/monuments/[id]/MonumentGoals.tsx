'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { fetchGoals, type Goal } from '@/lib/monuments';

interface MonumentGoalsProps {
  id: string;
}

const parent = {
  hidden: {},
  show: {
    transition: { delayChildren: 0.08, staggerChildren: 0.05 },
  },
};

export function MonumentGoals({ id }: MonumentGoalsProps) {
  const prefersReduced = useReducedMotion();
  const { data } = useQuery({
    queryKey: ['monumentGoals', id],
    queryFn: () => fetchGoals(id),
    staleTime: 30_000,
  });

  const child = prefersReduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.12 } } }
    : {
        hidden: { opacity: 0, y: 12 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.18, ease: [0.25, 1, 0.5, 1] as [number, number, number, number] },
        },
      };

  return (
    <motion.section
      variants={prefersReduced ? undefined : parent}
      initial="hidden"
      animate="show"
      className="p-4 space-y-2"
    >
      {data?.slice(0, 6).map((goal: Goal) => (
        <motion.div key={goal.id} variants={child} className="rounded-md bg-zinc-800 p-3">
          {goal.title || goal.name}
        </motion.div>
      ))}
    </motion.section>
  );
}

export default MonumentGoals;

