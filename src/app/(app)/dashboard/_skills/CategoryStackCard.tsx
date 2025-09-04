"use client";

import {
  motion,
  useReducedMotion,
  type MotionStyle,
  type PanInfo,
} from "framer-motion";
import clsx from "clsx";
import type { CategoryWithSkills } from "./useSkillsData";
import { SkillRow } from "./SkillRow";

interface CategoryStackCardProps {
  category: CategoryWithSkills;
  active: boolean;
  layer: number; // 0 active, 1 next, 2 next2
  style: MotionStyle;
  drag?: "x" | false;
  onDrag?: (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => void;
  onDragEnd?: (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => void;
}

export function CategoryStackCard({
  category,
  active,
  layer,
  style,
  drag,
  onDrag,
  onDragEnd,
}: CategoryStackCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const scales = [1, 0.98, 0.96];
  const opacities = [1, 0.85, 0.7];
  const z = [50, 40, 30];
  const scale = prefersReducedMotion ? 1 : scales[layer] ?? 1;
  const opacity = opacities[layer] ?? 0;
  const zIndex = z[layer] ?? 20;

  const cardClass = clsx(
    "absolute inset-x-4 top-0 bottom-0 rounded-[28px] border border-black/10 p-4 sm:p-5 text-white",
    active && "shadow-[0_18px_40px_-18px_rgba(0,0,0,0.75)]",
    !active && "pointer-events-none"
  );

  return (
    <motion.div
      drag={drag}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      style={{ ...style, backgroundColor: category.color_hex ?? "#675CFF", zIndex }}
      animate={{ scale, opacity }}
      transition={{ type: "spring", stiffness: 520, damping: 38 }}
      className={cardClass}
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-white/95 font-semibold">{category.name}</h3>
        <span className="bg-white/10 text-white/80 rounded-xl px-2 py-0.5 text-xs">
          {category.skills.length}
        </span>
      </header>
      <div
        className="space-y-2 overflow-y-auto overscroll-contain pr-1"
        style={{ maskImage: "linear-gradient(to bottom, black 85%, transparent)" }}
      >
        {category.skills.map((skill) => (
          <SkillRow key={skill.id} skill={skill} />
        ))}
      </div>
    </motion.div>
  );
}

