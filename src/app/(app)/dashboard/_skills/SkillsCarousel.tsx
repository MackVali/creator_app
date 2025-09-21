"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CategoryCard from "./CategoryCard";
import useSkillsData from "./useSkillsData";
import { deriveInitialIndex } from "./carouselUtils";

export default function SkillsCarousel() {
  const { categories, skillsByCategory, isLoading } = useSkillsData();
  const router = useRouter();
  const search = useSearchParams();
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [skillDragging, setSkillDragging] = useState(false);

  useEffect(() => {
    if (categories.length === 0) return;
    const initialId = search.get("cat") || undefined;
    const idx = deriveInitialIndex(categories, initialId);
    setActiveIndex(idx);
    const el = cardRefs.current[idx];
    el?.scrollIntoView({
      behavior: "instant",
      inline: "center",
      block: "nearest",
    });
  }, [categories, search]);

  const changeIndex = (idx: number) => {
    if (idx < 0 || idx >= categories.length) return;
    cardRefs.current[idx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    setActiveIndex(idx);
    const params = new URLSearchParams(search);
    params.set("cat", categories[idx].id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollLeft, offsetWidth } = el;
      const center = scrollLeft + offsetWidth / 2;
      let closest = 0;
      let min = Infinity;
      cardRefs.current.forEach((child, idx) => {
        if (!child) return;
        const middle = child.offsetLeft + child.offsetWidth / 2;
        const dist = Math.abs(center - middle);
        if (dist < min) {
          min = dist;
          closest = idx;
        }
      });
      setActiveIndex(closest);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [categories]);

  if (isLoading) {
    return <div className="py-8 text-center text-zinc-400">Loading...</div>;
  }

  if (categories.length === 0) {
    return <div className="text-center py-8 text-zinc-400">No skills yet</div>;
  }

  return (
    <div
      className="relative"
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
    >
      <div
        ref={trackRef}
        className={`flex gap-4 overflow-x-auto overflow-y-hidden scroll-smooth snap-x px-4 ${
          skillDragging ? "snap-none touch-none" : "snap-mandatory touch-pan-x"
        }`}
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
        }}
      >
        {categories.map((cat, idx) => {
          if (categories.length > 20 && Math.abs(idx - activeIndex) > 5) {
            return <div key={cat.id} className="snap-center shrink-0 w-[86vw] sm:w-[74vw] lg:w-[56vw]" />;
          }
          const isActive = idx === activeIndex;
          return (
            <div
              key={cat.id}
              ref={(el) => {
                cardRefs.current[idx] = el;
              }}
              role="group"
              aria-label={`Category ${idx + 1} of ${categories.length}`}
              className="snap-center shrink-0 w-[86vw] sm:w-[74vw] lg:w-[56vw]"
            >
              <CategoryCard
                category={cat}
                skills={skillsByCategory[cat.id] || []}
                active={isActive}
                onSkillDrag={setSkillDragging}
              />
            </div>
          );
        })}
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

