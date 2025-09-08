"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CategoryCard from "./CategoryCard";
import useSkillsData from "./useSkillsData";
import { deriveInitialIndex } from "./carouselUtils";

const ANGLE_STEP = 20; // degrees between cards
const RADIUS = 380; // translateZ distance
const OPACITY_K = 0.35;

export default function SkillsCarousel() {
  const { categories, skillsByCategory, isLoading } = useSkillsData();
  const router = useRouter();
  const search = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rotation = useRef(0);
  const [tick, setTick] = useState(0); // trigger re-render on rotation
  const [activeIndex, setActiveIndex] = useState(0);
  const animRef = useRef<number | null>(null);
  const wheelTimeout = useRef<number | null>(null);
  const pointerState = useRef<{
    id: number;
    lastX: number;
    velocity: number;
  } | null>(null);

  useEffect(() => {
    if (categories.length === 0) return;
    const initialId = search.get("cat") || undefined;
    const idx = deriveInitialIndex(categories, initialId);
    setActiveIndex(idx);
  }, [categories, search]);

  const scheduleRender = () => setTick((t) => t + 1);

  const clampIndex = (idx: number) =>
    Math.min(Math.max(idx, 0), categories.length - 1);

  const animateTo = (target: number) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const start = rotation.current;
    const diff = target - start;
    const duration = 200;
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      rotation.current = start + diff * eased;
      scheduleRender();
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    };
    animRef.current = requestAnimationFrame(step);
  };

  const snapToClosest = () => {
    const offsetSteps = Math.round(rotation.current / ANGLE_STEP);
    const nextIdx = clampIndex(activeIndex - offsetSteps);
    rotation.current -= offsetSteps * ANGLE_STEP;
    setActiveIndex(nextIdx);
    const params = new URLSearchParams(search);
    params.set("cat", categories[nextIdx].id);
    router.replace(`?${params.toString()}`, { scroll: false });
    animateTo(0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerState.current = {
      id: e.pointerId,
      lastX: e.clientX,
      velocity: 0,
    };
    containerRef.current?.setPointerCapture(e.pointerId);
    if (animRef.current) cancelAnimationFrame(animRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerState.current || !containerRef.current) return;
    const dx = e.clientX - pointerState.current.lastX;
    pointerState.current.lastX = e.clientX;
    pointerState.current.velocity = dx;
    const width = containerRef.current.clientWidth;
    rotation.current += (dx / width) * ANGLE_STEP;
    scheduleRender();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerState.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth;
    rotation.current +=
      (pointerState.current.velocity / width) * ANGLE_STEP * 4;
    pointerState.current = null;
    snapToClosest();
    containerRef.current?.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const delta = (e.deltaY || e.deltaX) / width * ANGLE_STEP;
    rotation.current += delta;
    scheduleRender();
    if (wheelTimeout.current !== null) {
      window.clearTimeout(wheelTimeout.current);
    }
    wheelTimeout.current = window.setTimeout(snapToClosest, 80);
  };

  const rotateToIdx = (idx: number) => {
    const clamped = clampIndex(idx);
    const deltaSteps = clamped - activeIndex;
    setActiveIndex(clamped);
    const params = new URLSearchParams(search);
    params.set("cat", categories[clamped].id);
    router.replace(`?${params.toString()}`, { scroll: false });
    rotation.current = -deltaSteps * ANGLE_STEP;
    animateTo(0);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      rotateToIdx(activeIndex - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      rotateToIdx(activeIndex + 1);
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

  const rangeStart =
    categories.length > 30 ? Math.max(0, activeIndex - 5) : 0;
  const rangeEnd =
    categories.length > 30
      ? Math.min(categories.length, activeIndex + 6)
      : categories.length;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="relative h-[62vh] overflow-hidden outline-none"
        role="region"
        aria-roledescription="carousel"
        aria-label="Skill categories"
        tabIndex={0}
        onKeyDown={handleKey}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        style={{
          perspective: "1000px",
          maskImage:
            "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
        }}
      >
        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          {categories.slice(rangeStart, rangeEnd).map((cat, i) => {
            const idx = rangeStart + i;
            const theta = (idx - activeIndex) * ANGLE_STEP + rotation.current;
            const rad = (theta * Math.PI) / 180;
            const scale = 1 - 0.06 * Math.abs(Math.sin(rad));
            const opacity = Math.min(
              1,
              Math.max(0.35, 1 - OPACITY_K * Math.abs(Math.sin(rad)))
            );
            const zIndex = 1000 - Math.abs(theta);
            return (
              <div
                key={cat.id}
                ref={(el) => {
                  cardRefs.current[idx] = el;
                }}
                className="absolute top-1/2 left-1/2 w-[86%] sm:w-[74%] lg:w-[56%] h-full"
                role="group"
                aria-label={`Category ${idx + 1} of ${categories.length}`}
                style={{
                  transform: `translate(-50%, -50%) rotateY(${theta}deg) translateZ(${RADIUS}px) scale(${scale})`,
                  opacity,
                  zIndex,
                  willChange: "transform, opacity",
                }}
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
            onClick={() => rotateToIdx(idx)}
          />
        ))}
      </div>
    </div>
  );
}


