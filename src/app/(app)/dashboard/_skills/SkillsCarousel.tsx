"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import CategoryCard from "./CategoryCard";
import useSkillsData from "./useSkillsData";
import { deriveInitialIndex } from "./carouselUtils";

const FALLBACK_COLOR = "#6366f1";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex?: string | null) {
  if (!hex) return { r: 99, g: 102, b: 241 };
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return { r: 99, g: 102, b: 241 };
  }
  return { r, g, b };
}

function mixChannel(channel: number, mix: number, amount: number) {
  return Math.round(channel + (mix - channel) * amount);
}

function adjustColor(hex: string | null | undefined, amount: number) {
  const { r, g, b } = hexToRgb(hex || FALLBACK_COLOR);
  const mixTarget = amount >= 0 ? 255 : 0;
  const ratio = Math.abs(amount);
  const nr = mixChannel(r, mixTarget, ratio);
  const ng = mixChannel(g, mixTarget, ratio);
  const nb = mixChannel(b, mixTarget, ratio);
  return `rgb(${nr}, ${ng}, ${nb})`;
}

function withAlpha(hex: string | null | undefined, alpha: number) {
  const { r, g, b } = hexToRgb(hex || FALLBACK_COLOR);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rgbToRgba(rgb: string, alpha: number) {
  return rgb.replace("rgb", "rgba").replace(")", `, ${alpha})`);
}

function easeOutQuart(t: number) {
  return 1 - (1 - t) ** 4;
}

export default function SkillsCarousel() {
  const { categories, skillsByCategory, isLoading } = useSkillsData();
  const router = useRouter();
  const search = useSearchParams();
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualPauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIndexRef = useRef(0);

  const [activeIndex, setActiveIndex] = useState(0);
  const [skillDragging, setSkillDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [manualPause, setManualPause] = useState(false);

  const glowMotion = useMotionValue(0.5);
  const glowSpring = useSpring(glowMotion, { stiffness: 90, damping: 24, mass: 0.6 });
  const glowX = useTransform(glowSpring, (value) => `${value * 100}%`);

  const activeColor = categories[activeIndex]?.color_hex || FALLBACK_COLOR;

  const galleryGradient = useMemo(() => {
    const soft = withAlpha(activeColor, 0.22);
    const bright = rgbToRgba(adjustColor(activeColor, 0.45), 0.3);
    const deep = rgbToRgba(adjustColor(activeColor, -0.3), 0.28);
    return `radial-gradient(120% 160% at 48% 20%, ${soft} 0%, ${bright} 45%, transparent 75%), radial-gradient(140% 200% at 20% 120%, ${deep} 0%, transparent 70%)`;
  }, [activeColor]);

  const particles = useMemo(
    () => [
      { x: 12, y: 18, size: 140, duration: 8, delay: 0 },
      { x: 76, y: 24, size: 120, duration: 10, delay: 1.4 },
      { x: 36, y: 72, size: 160, duration: 9, delay: 0.6 },
      { x: 82, y: 68, size: 110, duration: 12, delay: 1.1 },
      { x: 8, y: 60, size: 100, duration: 11, delay: 0.3 },
    ],
    []
  );

  const animateToIndex = useCallback(
    (idx: number, options: { instant?: boolean } = {}) => {
      const track = trackRef.current;
      const card = cardRefs.current[idx];
      if (!track || !card) return;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const start = track.scrollLeft;
      const rawTarget = card.offsetLeft - track.clientWidth / 2 + card.clientWidth / 2;
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const target = clamp(rawTarget, 0, maxScroll);

      if (options.instant) {
        track.scrollLeft = target;
        return;
      }

      const duration = 650;
      let startTime: number | null = null;

      const step = (timestamp: number) => {
        if (startTime === null) startTime = timestamp;
        const progress = clamp((timestamp - startTime) / duration, 0, 1);
        const eased = easeOutQuart(progress);
        track.scrollLeft = start + (target - start) * eased;
        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(step);
        } else {
          animationFrameRef.current = null;
        }
      };

      animationFrameRef.current = requestAnimationFrame(step);
    },
    []
  );

  useEffect(() => {
    if (categories.length === 0) return;
    const initialId = search.get("cat") || undefined;
    const idx = deriveInitialIndex(categories, initialId);
    setActiveIndex(idx);
    activeIndexRef.current = idx;
    animateToIndex(idx, { instant: true });
  }, [categories, search, animateToIndex]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const handleScroll = () => {
      const { scrollLeft, clientWidth, scrollWidth } = el;
      const center = scrollLeft + clientWidth / 2;
      let closest = 0;
      let min = Number.POSITIVE_INFINITY;
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
      const progress =
        scrollWidth <= clientWidth ? 0.5 : scrollLeft / Math.max(1, scrollWidth - clientWidth);
      glowMotion.set(clamp(progress, 0, 1));
    };
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [categories, glowMotion]);

  const goToIndex = useCallback(
    (idx: number, options: { instant?: boolean; fromAutoplay?: boolean } = {}) => {
      if (categories.length === 0) return;
      const bounded = ((idx % categories.length) + categories.length) % categories.length;
      animateToIndex(bounded, { instant: options.instant });
      setActiveIndex(bounded);
      activeIndexRef.current = bounded;
      const params = new URLSearchParams(search);
      params.set("cat", categories[bounded].id);
      router.replace(`?${params.toString()}`, { scroll: false });
      if (!options.fromAutoplay) {
        // ensure scroll listener updates immediately
        glowMotion.set(bounded / Math.max(1, categories.length - 1));
      }
    },
    [animateToIndex, categories, glowMotion, router, search]
  );

  const stopAutoplay = useCallback(() => {
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    if (autoplayRef.current || categories.length <= 1 || manualPause || skillDragging || hovering) {
      return;
    }
    autoplayRef.current = setInterval(() => {
      const next = (activeIndexRef.current + 1) % categories.length;
      goToIndex(next, { fromAutoplay: true });
    }, 6500);
  }, [categories.length, goToIndex, hovering, manualPause, skillDragging]);

  const triggerAutoplayDelay = useCallback(() => {
    stopAutoplay();
    if (manualPauseTimeoutRef.current) {
      clearTimeout(manualPauseTimeoutRef.current);
    }
    setManualPause(true);
    manualPauseTimeoutRef.current = setTimeout(() => {
      setManualPause(false);
    }, 4500);
  }, [stopAutoplay]);

  useEffect(() => {
    if (skillDragging || hovering || manualPause) {
      stopAutoplay();
      return;
    }
    startAutoplay();
    return () => {
      stopAutoplay();
    };
  }, [hovering, manualPause, skillDragging, startAutoplay, stopAutoplay]);

  useEffect(() => {
    return () => {
      stopAutoplay();
      if (manualPauseTimeoutRef.current) {
        clearTimeout(manualPauseTimeoutRef.current);
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [stopAutoplay]);

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
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          triggerAutoplayDelay();
          goToIndex(activeIndex - 1);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          triggerAutoplayDelay();
          goToIndex(activeIndex + 1);
        }
        if (e.key === "Enter") {
          e.preventDefault();
          cardRefs.current[activeIndex]?.querySelector("button")?.click();
        }
      }}
    >
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.02] px-2 py-4 sm:px-4 backdrop-blur-xl">
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: galleryGradient }}
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute -inset-28 blur-3xl"
          style={{ background: withAlpha(activeColor, 0.12) }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
        />
        <motion.div
          className="pointer-events-none absolute top-1/2 h-[120%] w-[110%] -translate-y-1/2 -translate-x-1/2"
          style={{ left: glowX, background: `radial-gradient(65% 120% at 50% 50%, ${withAlpha(activeColor, 0.55)} 0%, transparent 65%)` }}
          animate={{ opacity: [0.45, 0.75, 0.45] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
        {particles.map((particle, index) => (
          <motion.span
            key={`${particle.x}-${index}`}
            className="pointer-events-none absolute rounded-full blur-3xl"
            style={{
              width: particle.size,
              height: particle.size,
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              background: withAlpha(activeColor, 0.18),
            }}
            animate={{ y: [0, -12, 0], opacity: [0.2, 0.55, 0.2] }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: particle.delay,
            }}
          />
        ))}
        <div
          ref={trackRef}
          className={`relative flex gap-6 overflow-x-auto overflow-y-hidden scroll-smooth snap-x px-2 ${
            skillDragging ? "snap-none touch-none" : "snap-mandatory touch-pan-x"
          }`}
          onPointerDown={triggerAutoplayDelay}
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
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3" role="tablist">
        {categories.map((cat, idx) => {
          const isActive = idx === activeIndex;
          const previewSkill = (skillsByCategory[cat.id] || []).find((s) => s.emoji)?.emoji;
          const preview = previewSkill || cat.name.charAt(0).toUpperCase();
          const chipColor = cat.color_hex || FALLBACK_COLOR;
          return (
            <motion.button
              key={cat.id}
              role="tab"
              aria-selected={isActive}
              aria-label={`Go to ${cat.name}`}
              onClick={() => {
                triggerAutoplayDelay();
                goToIndex(idx);
              }}
              className="group flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              style={{
                background: isActive ? withAlpha(chipColor, 0.3) : "rgba(255,255,255,0.05)",
                border: `1px solid ${isActive ? withAlpha(chipColor, 0.65) : "rgba(255,255,255,0.08)"}`,
                boxShadow: isActive
                  ? `0 18px 38px ${withAlpha(chipColor, 0.35)}`
                  : "0 8px 24px rgba(15, 23, 42, 0.35)",
                color: isActive ? "rgba(248,250,252,0.96)" : "rgba(226,232,240,0.82)",
              }}
              whileHover={{ scale: 1.06 }}
              whileFocus={{ scale: 1.04 }}
              animate={{
                scale: isActive ? 1.08 : 1,
                opacity: isActive ? 1 : 0.76,
              }}
              transition={{ type: "spring", stiffness: 240, damping: 20 }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-base font-semibold shadow"
                style={{
                  background: isActive ? withAlpha(chipColor, 0.55) : withAlpha(chipColor, 0.2),
                  color: isActive ? "rgba(15, 23, 42, 0.85)" : "rgba(255,255,255,0.95)",
                  boxShadow: isActive
                    ? `0 10px 22px ${withAlpha(chipColor, 0.4)}`
                    : "0 6px 16px rgba(15,23,42,0.35)",
                }}
              >
                {preview}
              </span>
              <span className="hidden sm:block pr-1">{cat.name}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

