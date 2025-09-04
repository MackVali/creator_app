"use client";

import { useEffect, useRef, useState } from "react";
import type { PanInfo } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useSkillsData } from "./useSkillsData";
import { CategoryStackCard } from "./CategoryStackCard";

export function SkillsStack() {
  const { categories } = useSkillsData();
  const router = useRouter();
  const search = useSearchParams();
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [lockScroll, setLockScroll] = useState(false);

  // derive initial index from query
  useEffect(() => {
    if (!categories.length) return;
    const slug = search.get("cat");
    const idx = slug
      ? categories.findIndex((c) => c.slug === slug)
      : 0;
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [categories, search]);

  // persist index
  useEffect(() => {
    if (categories[activeIndex]) {
      const params = new URLSearchParams(search.toString());
      params.set("cat", categories[activeIndex].slug);
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [activeIndex, categories, router, search]);

  // measure card width
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setCardWidth(containerRef.current.offsetWidth - 32); // inset-x-4
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    document.body.style.overflow = lockScroll ? "hidden" : "";
  }, [lockScroll]);

  const handleDrag = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    setDragX(info.offset.x);
    if (!lockScroll && Math.abs(info.offset.x) > 16) setLockScroll(true);
  };

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    setLockScroll(false);
    const swipe = info.offset.x + info.velocity.x * 100;
    let next = activeIndex;
    if (swipe < -100 && activeIndex < categories.length - 1) next++;
    if (swipe > 100 && activeIndex > 0) next--;
    setActiveIndex(next);
    setDragX(0);
  };

  const baseX = (index: number) => {
    if (!cardWidth) return 0;
    const diff = index - activeIndex;
    const layer = diff > 0 ? Math.min(diff, 2) : 0;
    const offsets = [0, 14, 28];
    return diff * (cardWidth * 0.86) + (diff > 0 ? offsets[layer] : 0);
  };

  return (
    <div
      ref={containerRef}
      className="relative min-h-[62vh] w-full"
      role="region"
      aria-roledescription="carousel"
      aria-label="Skill categories"
    >
      {categories.map((cat, index) => {
        const layer = index > activeIndex ? Math.min(index - activeIndex, 2) : 0;
        const x = baseX(index) +
          (index === activeIndex
            ? dragX
            : index > activeIndex
            ? dragX * 0.2
            : 0);
        return (
          <CategoryStackCard
            key={cat.id}
            category={cat}
            active={index === activeIndex}
            layer={layer}
            style={{ x }}
            drag={index === activeIndex ? "x" : false}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
          />
        );
      })}
      <div
        className="mt-4 flex justify-center gap-2"
        role="tablist"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && activeIndex < categories.length - 1) {
            setActiveIndex(activeIndex + 1);
          } else if (e.key === "ArrowLeft" && activeIndex > 0) {
            setActiveIndex(activeIndex - 1);
          }
        }}
      >
        {categories.map((cat, i) => (
          <button
            key={cat.id}
            role="tab"
            aria-selected={i === activeIndex}
            className={`h-2 w-2 rounded-full ${
              i === activeIndex ? "bg-white/80" : "bg-white/40"
            }`}
            onClick={() => setActiveIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}

