"use client";

import { motion, type PanInfo } from "framer-motion";
import { useCallback } from "react";
import Link from "next/link";
import SkillCategoryCard from "./SkillCategoryCard";
import { useSkillsCarousel } from "./useSkills";

export default function SkillsCarousel() {
  const { categories, activeId, setActiveId, skillsByCategory, isLoading } =
    useSkillsCarousel();

  const activeIndex = categories.findIndex((c) => c.id === activeId);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const threshold = 30;
      const velocity = 300;
      if (
        (info.offset.x < -threshold || info.velocity.x < -velocity) &&
        activeIndex < categories.length - 1
      ) {
        setActiveId(categories[activeIndex + 1].id);
      } else if (
        (info.offset.x > threshold || info.velocity.x > velocity) &&
        activeIndex > 0
      ) {
        setActiveId(categories[activeIndex - 1].id);
      }
    },
    [activeIndex, categories, setActiveId]
  );

  if (isLoading) {
    return <div className="py-8 text-center text-zinc-400">Loading...</div>;
  }

  if (categories.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-400">
        No skills yet
        <div className="mt-2">
          <Link href="/skills" className="text-accent underline">
            Add Skill
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative h-96">
        {categories.map((cat, idx) => {
          const offset = idx - activeIndex;
          return (
            <motion.div
              key={cat.id}
              className="absolute inset-0"
              style={{ pointerEvents: offset === 0 ? "auto" : "none" }}
              animate={{
                x: offset * 40,
                scale: offset === 0 ? 1 : 0.9,
                opacity: offset === 0 ? 1 : 0.5,
                zIndex: -Math.abs(offset),
              }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              drag={offset === 0 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.3}
              onDragEnd={handleDragEnd}
            >
              <SkillCategoryCard
                category={cat}
                skills={skillsByCategory[cat.id] || []}
              />
            </motion.div>
          );
        })}
      </div>
      <div className="flex justify-center gap-1 mt-4">
        {categories.map((cat, idx) => (
          <button
            key={cat.id}
            onClick={() => setActiveId(cat.id)}
            className={`h-2 w-2 rounded-full ${
              idx === activeIndex ? "bg-accent" : "bg-zinc-700"
            }`}
            aria-label={`Go to ${cat.name}`}
          />
        ))}
      </div>
    </div>
  );
}

