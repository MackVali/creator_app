"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, type PanInfo, useReducedMotion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SkillCategoryCard from "./SkillCategoryCard";
import useSkillsData from "./useSkillsData";
import { deriveInitialIndex, computeNextIndex } from "./carouselUtils";

export default function SkillsCarousel() {
  const { categories, skillsByCategory, isLoading } = useSkillsData();
  const router = useRouter();
  const search = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (categories.length === 0) return;
    const initialId = search.get("cat") || undefined;
    setActiveIndex(deriveInitialIndex(categories, initialId));
  }, [categories, search]);

  const changeIndex = (idx: number) => {
    if (idx < 0 || idx >= categories.length) return;
    setActiveIndex(idx);
    const params = new URLSearchParams(search);
    params.set("cat", categories[idx].id);
    router.replace(`?${params.toString()}`);
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const next = computeNextIndex(
      activeIndex,
      info.offset.x,
      info.velocity.x,
      categories.length
    );
    if (next !== activeIndex) changeIndex(next);
  };

  const cards = useMemo(() => {
    return categories.map((cat, idx) => {
      const offset = idx - activeIndex;
      const isActive = offset === 0;
      const animate = prefersReducedMotion
        ? {
            x: offset * 40,
            opacity: isActive ? 1 : 0.6,
            zIndex: categories.length - Math.abs(offset),
          }
        : {
            x: offset * 40,
            scale: isActive ? 1 : 0.92,
            opacity: isActive ? 1 : 0.6,
            filter: isActive ? "blur(0px)" : "blur(2px)",
            y: isActive ? 0 : 6,
            zIndex: categories.length - Math.abs(offset),
          };
      return (
        <motion.div
          key={cat.id}
          className="absolute inset-0 flex items-stretch"
          style={{ pointerEvents: isActive ? "auto" : "none" }}
          animate={animate}
          transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.9 }}
          drag={isActive ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={handleDragEnd}
        >
          <SkillCategoryCard
            category={cat}
            skills={skillsByCategory[cat.id] || []}
            active={isActive}
          />
        </motion.div>
      );
    });
  }, [categories, activeIndex, skillsByCategory, prefersReducedMotion]);

  if (isLoading) {
    return <div className="py-8 text-center text-zinc-400">Loading...</div>;
  }

  if (categories.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-400">
        No skills yet
        <div className="mt-2">
          <Link href="/skills" className="text-zinc-200 underline">
            Add Skill
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative px-3 sm:px-4"
      role="region"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") changeIndex(activeIndex - 1);
        if (e.key === "ArrowRight") changeIndex(activeIndex + 1);
      }}
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
      }}
    >
      <div className="relative h-[60vh]">{cards}</div>
      <div className="flex justify-center gap-2 mt-4" role="tablist">
        {categories.map((cat, idx) => (
          <button
            key={cat.id}
            role="tab"
            aria-selected={idx === activeIndex}
            aria-label={`Go to ${cat.name}`}
            className={`h-2 w-2 rounded-full ${
              idx === activeIndex ? "bg-zinc-200" : "bg-zinc-700"
            }`}
            onClick={() => changeIndex(idx)}
          />
        ))}
      </div>
    </div>
  );
}
