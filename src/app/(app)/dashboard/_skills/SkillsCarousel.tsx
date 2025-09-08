"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const scrollRaf = useRef<number | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [cardSpan, setCardSpan] = useState(0); // card width + gutter for virtualization

  const scrollToIdx = useCallback(
    (idx: number, smooth = true) => {
      const clamped = Math.min(Math.max(idx, 0), categories.length - 1);
      const card = cardRefs.current[clamped];
      const container = containerRef.current;
      if (!card || !container) return;
      const left =
        card.offsetLeft - container.clientWidth / 2 + card.offsetWidth / 2;
      container.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
    },
    [categories.length]
  );

  // derive initial card from query param
  useEffect(() => {
    if (categories.length === 0) return;
    const initialId = search.get("cat") || undefined;
    const idx = deriveInitialIndex(categories, initialId);
    setActiveIndex(idx);
    // scroll to the initial card after next paint
    requestAnimationFrame(() => scrollToIdx(idx, false));
  }, [categories, search, scrollToIdx]);

  // measure card width so we can pad when virtualizing
  useEffect(() => {
    const first = cardRefs.current[0];
    if (first) {
      const marginRight = parseFloat(
        getComputedStyle(first).marginRight || "0"
      );
      setCardSpan(first.offsetWidth + marginRight);
    }
  }, [categories.length]);

  const updateQuery = useCallback(
    (idx: number) => {
      const params = new URLSearchParams(search);
      params.set("cat", categories[idx].id);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [categories, router, search]
  );

  const handleScroll = useCallback(() => {
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const center = container.scrollLeft + container.clientWidth / 2;
      let closest = 0;
      let minDist = Infinity;
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const cardCenter = el.offsetLeft + el.offsetWidth / 2;
        const dist = Math.abs(cardCenter - center);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      });
      if (closest !== activeIndex) {
        setActiveIndex(closest);
        updateQuery(closest);
      }
    });
  }, [activeIndex, updateQuery]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

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

  const virtual = cardSpan > 0 && categories.length > 20;
  const rangeStart = virtual ? Math.max(0, activeIndex - 5) : 0;
  const rangeEnd = virtual
    ? Math.min(categories.length, activeIndex + 6)
    : categories.length;

  const padStyle = virtual
    ? {
        paddingLeft: rangeStart * cardSpan,
        paddingRight: (categories.length - rangeEnd) * cardSpan,
      }
    : undefined;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="flex h-[62vh] overflow-x-auto gap-4 px-4 snap-x snap-mandatory scroll-smooth outline-none"
        role="region"
        aria-roledescription="carousel"
        aria-label="Skill categories"
        tabIndex={0}
        onKeyDown={handleKey}
        style={padStyle}
      >
        {categories.slice(rangeStart, rangeEnd).map((cat, i) => {
          const idx = rangeStart + i;
          return (
            <div
              key={cat.id}
              ref={(el) => {
                cardRefs.current[idx] = el;
              }}
              className="flex-none w-[86%] sm:w-[74%] lg:w-[56%] snap-center"
              role="group"
              aria-label={`Category ${idx + 1} of ${categories.length}`}
            >
              <CategoryCard
                category={cat}
                skills={skillsByCategory[cat.id] || []}
                active={idx === activeIndex}
              />
            </div>
          );
        })}
      </div>
      {/* overflow indicators */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-zinc-900/70 to-zinc-900/0"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-zinc-900/70 to-zinc-900/0"
      />
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

