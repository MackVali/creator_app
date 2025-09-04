'use client';

import { motion } from 'framer-motion';
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

const child = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: [0.25, 1, 0.5, 1] },
  },
};

/**
 * Staggered reveal list of goals for a monument. Only the first few
 * goals are shown initially to keep the transition light.
 */
export function MonumentGoals({ id }: MonumentGoalsProps) {
  const { data } = useQuery({ queryKey: ['monumentGoals', id], queryFn: () => fetchGoals(id) });

  return (
    <motion.section
      variants={parent}
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

