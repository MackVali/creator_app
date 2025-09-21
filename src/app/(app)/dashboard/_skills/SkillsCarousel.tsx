"use client";

import {
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import CategoryCard from "./CategoryCard";
import useSkillsData from "./useSkillsData";
import { deriveInitialIndex, FALLBACK_ACCENT, getReadableColor, rgba, tintColor } from "./carouselUtils";

export default function SkillsCarousel() {
  const { categories, skillsByCategory, isLoading } = useSkillsData();
  const router = useRouter();
  const search = useSearchParams();
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [skillDragging, setSkillDragging] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (categories.length === 0) return;
    const initialId = search.get("cat") || undefined;
    const idx = deriveInitialIndex(categories, initialId);
    setActiveIndex(idx);
    const el = cardRefs.current[idx];
    el?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "instant",
      inline: "center",
    });
  }, [categories, search, prefersReducedMotion]);

  const changeIndex = useCallback(
    (idx: number, options?: { fromAutoplay?: boolean }) => {
      if (idx < 0 || idx >= categories.length) return;
      cardRefs.current[idx]?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        inline: "center",
        block: "nearest",
      });
      setActiveIndex(idx);
      if (!options?.fromAutoplay) {
        const params = new URLSearchParams(search);
        params.set("cat", categories[idx].id);
        router.replace(`?${params.toString()}`, { scroll: false });
      }
    },
    [categories, prefersReducedMotion, router, search]
  );

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

  const activeCategory = categories[activeIndex];
  const accentColor = activeCategory?.color_hex || FALLBACK_ACCENT;
  const stagePalette = useMemo(
    () => ({
      glow: rgba(accentColor, 0.34),
      halo: tintColor(accentColor, 0.9, 0.18),
      frame: rgba(accentColor, 0.28),
      surface: tintColor(accentColor, 0.86, 0.14),
      sheen: tintColor(accentColor, 0.7, 0.38),
      shadow: rgba(accentColor, 0.22),
    }),
    [accentColor]
  );

  const autoplayEnabled = !prefersReducedMotion && categories.length > 1;

  useEffect(() => {
    if (!autoplayEnabled || skillDragging || isInteracting) return;
    const id = window.setInterval(() => {
      const nextIndex = (activeIndex + 1) % categories.length;
      changeIndex(nextIndex, { fromAutoplay: true });
    }, 6500);
    return () => window.clearInterval(id);
  }, [
    autoplayEnabled,
    skillDragging,
    isInteracting,
    activeIndex,
    categories.length,
    changeIndex,
  ]);

  const handleBlurCapture = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!event.currentTarget.contains(nextTarget)) {
      setIsInteracting(false);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      setIsInteracting(false);
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-zinc-400">Loading...</div>;
  }

  if (categories.length === 0) {
    return <div className="text-center py-8 text-zinc-400">No skills yet</div>;
  }

  const maskGradient =
    "linear-gradient(to right, transparent, black 48px, black calc(100% - 48px), transparent)";

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
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={() => setIsInteracting(false)}
      onPointerEnter={() => setIsInteracting(true)}
      onPointerLeave={() => setIsInteracting(false)}
      onPointerDown={() => setIsInteracting(true)}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setIsInteracting(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={handleBlurCapture}
    >
      <motion.div className="relative mx-auto w-full px-2 sm:px-4 lg:px-6">
        <motion.div
          className="relative overflow-hidden rounded-[40px] border backdrop-blur-2xl"
          style={{
            borderColor: stagePalette.frame,
            background: `linear-gradient(140deg, ${stagePalette.surface}, rgba(10, 12, 28, 0.35))`,
          }}
          animate={{ boxShadow: `0 42px 120px -60px ${stagePalette.shadow}` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            animate={{ opacity: skillDragging ? 0.5 : 0.85 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ background: `radial-gradient(circle at 18% 18%, ${stagePalette.glow}, transparent 65%)` }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            animate={{ opacity: isInteracting ? 0.4 : 0.6 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{ background: `radial-gradient(90% 140% at 82% 0%, ${stagePalette.halo}, transparent 70%)` }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-10 top-0 h-px"
            animate={{ opacity: isInteracting ? 0.25 : 0.45 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={{ background: `linear-gradient(90deg, transparent, ${stagePalette.sheen}, transparent)` }}
          />
          <div className="relative">
            <div
              ref={trackRef}
              className={`relative flex gap-6 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth px-6 py-10 sm:px-10 ${
                skillDragging ? "snap-none touch-none" : "snap-mandatory touch-pan-x"
              } snap-x`}
              style={{ maskImage: maskGradient, WebkitMaskImage: maskGradient }}
            >
              {categories.map((cat, idx) => {
                if (categories.length > 20 && Math.abs(idx - activeIndex) > 5) {
                  return (
                    <div
                      key={cat.id}
                      className="snap-center shrink-0 w-[86vw] sm:w-[70vw] lg:w-[54vw] xl:w-[46vw]"
                    />
                  );
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
                    className={`snap-center shrink-0 transition-all duration-500 ease-out w-[86vw] sm:w-[70vw] lg:w-[54vw] xl:w-[46vw] 2xl:w-[42vw] ${
                      isActive ? "opacity-100" : "opacity-80"
                    }`}
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
          </div>
        </motion.div>
      </motion.div>
      <div className="mt-8 px-2 sm:px-4 lg:px-6">
        <div
          className="mx-auto flex max-w-3xl items-center gap-2 overflow-x-auto rounded-full border border-white/10 bg-white/5 px-2 py-2 backdrop-blur-xl"
          role="tablist"
        >
          {categories.map((cat, idx) => {
            const isActive = idx === activeIndex;
            const accent = cat.color_hex || FALLBACK_ACCENT;
            const previewSkill = (skillsByCategory[cat.id] || [])[0];
            const preview =
              previewSkill?.emoji || (cat.name?.charAt(0) || "?").toUpperCase();
            const textColor = isActive
              ? getReadableColor(accent)
              : tintColor(accent, 0.8, 0.9);
            return (
              <motion.button
                key={cat.id}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                aria-label={`Go to ${cat.name}`}
                onClick={() => changeIndex(idx)}
                className="relative inline-flex min-w-[3.25rem] items-center gap-2 overflow-hidden rounded-full px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-white/70 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                style={{ color: textColor }}
              >
                {isActive && (
                  <motion.span
                    layoutId="carousel-nav-pill"
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `linear-gradient(135deg, ${rgba(accent, 0.7)}, ${tintColor(accent, 0.75, 0.6)})`,
                      boxShadow: `0 18px 42px -26px ${rgba(accent, 0.55)}`,
                    }}
                    transition={{ type: "spring", stiffness: 320, damping: 32 }}
                  />
                )}
                <span
                  className="relative z-10 flex size-6 items-center justify-center rounded-full text-base"
                  style={{
                    background: tintColor(accent, 0.85, isActive ? 0.32 : 0.22),
                    color: getReadableColor(accent),
                  }}
                >
                  {preview}
                </span>
                <span className="relative z-10 hidden max-w-[12ch] truncate tracking-[0.22em] sm:inline">
                  {cat.name}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

