"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CategoryCard from "./CategoryCard";
import useSkillsData from "./useSkillsData";
import { deriveInitialIndex } from "./carouselUtils";

export default function SkillsCarousel() {
  const { categories, skillsByCategory, isLoading } = useSkillsData();
  const router = useRouter();
  const search = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const raf = useRef<number | null>(null);

  // scroll to initial category
  useEffect(() => {
    if (categories.length === 0) return;
    const initialId = search.get("cat") || undefined;
    const idx = deriveInitialIndex(categories, initialId);
    setActiveIndex(idx);
    const el = cardRefs.current[idx];
    const container = containerRef.current;
    if (el && container) {
      container.scrollTo({
        left: el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2,
      });
    }
  }, [categories, search]);

  const updateActiveFromScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const center = container.scrollLeft + container.clientWidth / 2;
    let closest = 0;
    let min = Infinity;
    cardRefs.current.forEach((card, idx) => {
      if (!card) return;
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const dist = Math.abs(center - cardCenter);
      if (dist < min) {
        min = dist;
        closest = idx;
      }
    });
    if (closest !== activeIndex) {
      setActiveIndex(closest);
      const params = new URLSearchParams(search);
      params.set("cat", categories[closest].id);
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [activeIndex, categories, router, search]);

  // passive scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(updateActiveFromScroll);
    };
    container.addEventListener("scroll", handler, { passive: true });
    return () => container.removeEventListener("scroll", handler);
  }, [updateActiveFromScroll]);

  // recalc on resize
  useEffect(() => {
    const onResize = () => updateActiveFromScroll();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateActiveFromScroll]);

  const scrollToIdx = (idx: number) => {
    if (idx < 0 || idx >= categories.length) return;
    const container = containerRef.current;
    const card = cardRefs.current[idx];
    if (!container || !card) return;
    container.scrollTo({
      left: card.offsetLeft - container.clientWidth / 2 + card.clientWidth / 2,
      behavior: "smooth",
    });
    setActiveIndex(idx);
    const params = new URLSearchParams(search);
    params.set("cat", categories[idx].id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollToIdx(activeIndex - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollToIdx(activeIndex + 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      cardRefs.current[activeIndex]?.querySelector("button")?.click();
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-zinc-400">Loading...</div>;
  }

  if (categories.length === 0) {
    return <div className="text-center py-8 text-zinc-400">No skills yet</div>;
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="flex gap-4 px-4 overflow-x-auto snap-x snap-mandatory scroll-smooth"
        role="region"
        aria-roledescription="carousel"
        aria-label="Skill categories"
        tabIndex={0}
        onKeyDown={handleKey}
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
        }}
      >
        {categories.map((cat, idx) => (
          <div
            key={cat.id}
            ref={(el) => {
              cardRefs.current[idx] = el;
            }}
            className="snap-center shrink-0 w-[86%] sm:w-[74%] lg:w-[56%] h-[62vh]"
            role="group"
            aria-label={`Category ${idx + 1} of ${categories.length}`}
          >
            <CategoryCard
              category={cat}
              skills={skillsByCategory[cat.id] || []}
              active={idx === activeIndex}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-2" role="tablist">
        {categories.map((cat, idx) => (
          <button
            key={cat.id}
            role="tab"
            aria-selected={idx === activeIndex}
            aria-label={`Go to ${cat.name}`}
            className={`h-1.5 w-1.5 rounded-full ${
              idx === activeIndex ? "bg-white" : "bg-white/40"
            }`}
            onClick={() => scrollToIdx(idx)}
          />
        ))}
      </div>
    </div>
  );
}

