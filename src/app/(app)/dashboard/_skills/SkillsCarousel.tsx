"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, type PanInfo, useReducedMotion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import CategoryCard from "./CategoryCard";
import useSkillsData from "./useSkillsData";
import { deriveInitialIndex, computeNextIndex, shouldPreventScroll } from "./carouselUtils";

export default function SkillsCarousel() {
  const { categories, skillsByCategory, isLoading } = useSkillsData();
  const router = useRouter();
  const search = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [cardWidth, setCardWidth] = useState(0);
  const touchStart = useRef({ x: 0, y: 0 });
  const swiping = useRef(false);
  const [skillDragging, setSkillDragging] = useState(false);

  useEffect(() => {
    if (categories.length === 0) return;
    const initialId = search.get("cat") || undefined;
    setActiveIndex(deriveInitialIndex(categories, initialId));
  }, [categories, search]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setCardWidth(el.clientWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const changeIndex = (idx: number) => {
    if (idx < 0 || idx >= categories.length) return;
    setActiveIndex(idx);
    const params = new URLSearchParams(search);
    params.set("cat", categories[idx].id);
    router.replace(`?${params.toString()}`, { scroll: false });
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

  const onTouchStart = (e: React.TouchEvent) => {
    if (skillDragging) return;
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    swiping.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (skillDragging) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (!swiping.current && shouldPreventScroll(dx, dy)) {
      swiping.current = true;
    }
    if (swiping.current) {
      e.preventDefault();
    }
  };

  const onTouchEnd = () => {
    if (skillDragging) return;
    swiping.current = false;
  };

  const cards = useMemo(() => {
    return categories.map((cat, idx) => {
      const offset = idx - activeIndex;
      if (Math.abs(offset) > 3) return null;
      const isActive = offset === 0;

      const PEEK = 48;
      const GAP = 8;
      let x = 0;
      if (offset > 0) {
        x = cardWidth - PEEK * offset - GAP * (offset - 1);
      } else if (offset < 0) {
        const n = Math.abs(offset);
        x = -cardWidth + PEEK * n + GAP * (n - 1);
      }

      const depth = categories.length - Math.abs(offset);
      const animate = prefersReducedMotion
        ? {
            x,
            opacity: isActive ? 1 : 0.6 - Math.abs(offset) * 0.1,
            zIndex: depth,
          }
        : {
            x,
            scale: isActive ? 1 : 1 - Math.min(Math.abs(offset) * 0.08, 0.24),
            opacity: isActive ? 1 : 0.6 - Math.abs(offset) * 0.1,
            filter: isActive ? "blur(0px)" : "blur(1.5px)",
            y: isActive ? 0 : 6,
            zIndex: depth,
          };
      return (
        <motion.div
          key={cat.id}
          ref={(el) => {
            cardRefs.current[idx] = el;
          }}
          role="group"
          aria-label={`Category ${idx + 1} of ${categories.length}`}
          className="absolute inset-0"
          style={{ pointerEvents: isActive ? "auto" : "none" }}
          animate={animate}
          transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
          drag={isActive && !skillDragging ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={handleDragEnd}
          onTouchStart={isActive && !skillDragging ? onTouchStart : undefined}
          onTouchMove={isActive && !skillDragging ? onTouchMove : undefined}
          onTouchEnd={isActive && !skillDragging ? onTouchEnd : undefined}
        >
          <CategoryCard
            category={cat}
            skills={skillsByCategory[cat.id] || []}
            active={isActive}
            onSkillDrag={setSkillDragging}
          />
        </motion.div>
      );
    });
  }, [
    categories,
    activeIndex,
    skillsByCategory,
    prefersReducedMotion,
    cardWidth,
    skillDragging,
  ]);

  if (isLoading) {
    return <div className="py-8 text-center text-zinc-400">Loading...</div>;
  }

  if (categories.length === 0) {
    return <div className="text-center py-8 text-zinc-400">No skills yet</div>;
  }

  return (
    <div
      className="relative px-3 sm:px-4"
      role="region"
      aria-roledescription="carousel"
      aria-label="Skill categories"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") changeIndex(activeIndex - 1);
        if (e.key === "ArrowRight") changeIndex(activeIndex + 1);
        if (e.key === "Enter") {
          cardRefs.current[activeIndex]?.querySelector("button")?.click();
        }
      }}
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 48px, black calc(100% - 48px), transparent)",
      }}
    >
      <div ref={containerRef} className="relative min-h-[62vh]">
        {cards}
      </div>
      <div className="flex justify-center gap-2 mt-4" role="tablist">
        {categories.map((cat, idx) => (
          <button
            key={cat.id}
            role="tab"
            aria-selected={idx === activeIndex}
            aria-label={`Go to ${cat.name}`}
            className={`h-2 w-2 rounded-full ${
              idx === activeIndex ? "scale-110 bg-white" : "bg-white/40"
            }`}
            onClick={() => changeIndex(idx)}
          />
        ))}
      </div>
    </div>
  );
}

