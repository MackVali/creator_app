"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import CategoryCard from "./CategoryCard";
import useSkillsData from "./useSkillsData";
import { deriveInitialIndex } from "./carouselUtils";

const FALLBACK_COLOR = "#6366f1";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function channelToHex(channel: number) {
  return Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0");
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

function mixHexColors(a?: string | null, b?: string | null, amount = 0) {
  const start = hexToRgb(a);
  const end = hexToRgb(b);
  const ratio = clamp(amount, 0, 1);
  const r = start.r + (end.r - start.r) * ratio;
  const g = start.g + (end.g - start.g) * ratio;
  const blue = start.b + (end.b - start.b) * ratio;
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(blue)}`;
}

function withAlpha(hex: string | null | undefined, alpha: number) {
  const { r, g, b } = hexToRgb(hex || FALLBACK_COLOR);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rgbToRgba(rgb: string, alpha: number) {
  return rgb.replace("rgb", "rgba").replace(")", `, ${alpha})`);
}

export default function SkillsCarousel() {
  const { categories, skillsByCategory, isLoading } = useSkillsData();
  const router = useRouter();
  const search = useSearchParams();
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualPauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIndexRef = useRef(0);
  const cardCentersRef = useRef<number[]>([]);
  const scrollFrameRef = useRef<number | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [skillDragging, setSkillDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [manualPause, setManualPause] = useState(false);
  const [stageColor, setStageColor] = useState(FALLBACK_COLOR);

  const glowMotion = useMotionValue(0.5);
  const glowSpring = useSpring(glowMotion, { stiffness: 90, damping: 24, mass: 0.6 });
  const glowX = useTransform(glowSpring, (value) => `${value * 100}%`);

  const measureCards = useCallback(() => {
    cardCentersRef.current = cardRefs.current.map((card) =>
      card ? card.offsetLeft + card.offsetWidth / 2 : Number.NaN
    );
  }, []);

  const computeStageColor = useCallback(
    (center: number) => {
      if (categories.length === 0) return FALLBACK_COLOR;
      const centers = cardCentersRef.current;
      if (centers.length === 0) return categories[activeIndexRef.current]?.color_hex || FALLBACK_COLOR;

      let leftIdx = -1;
      let rightIdx = -1;
      let leftCenter = -Infinity;
      let rightCenter = Infinity;

      centers.forEach((middle, idx) => {
        if (!Number.isFinite(middle)) return;
        if (middle <= center && middle > leftCenter) {
          leftIdx = idx;
          leftCenter = middle;
        }
        if (middle >= center && middle < rightCenter) {
          rightIdx = idx;
          rightCenter = middle;
        }
      });

      if (leftIdx === -1 && rightIdx === -1) {
        return FALLBACK_COLOR;
      }
      if (leftIdx === -1) {
        return categories[rightIdx]?.color_hex || FALLBACK_COLOR;
      }
      if (rightIdx === -1) {
        return categories[leftIdx]?.color_hex || FALLBACK_COLOR;
      }
      if (leftIdx === rightIdx) {
        return categories[leftIdx]?.color_hex || FALLBACK_COLOR;
      }
      const span = rightCenter - leftCenter;
      if (!Number.isFinite(span) || span <= 0) {
        return categories[rightIdx]?.color_hex || FALLBACK_COLOR;
      }
      const ratio = clamp((center - leftCenter) / span, 0, 1);
      return mixHexColors(categories[leftIdx]?.color_hex, categories[rightIdx]?.color_hex, ratio);
    },
    [categories]
  );

  const updateStageColor = useCallback(
    (centerOverride?: number) => {
      if (categories.length === 0) {
        setStageColor((prev) => (prev === FALLBACK_COLOR ? prev : FALLBACK_COLOR));
        return;
      }

      const track = trackRef.current;
      if (!track) {
        const fallbackColor =
          categories[activeIndexRef.current]?.color_hex || categories[0]?.color_hex || FALLBACK_COLOR;
        setStageColor((prev) => (prev === fallbackColor ? prev : fallbackColor));
        return;
      }

      if (!cardCentersRef.current.some((middle) => Number.isFinite(middle))) {
        measureCards();
      }

      const center =
        typeof centerOverride === "number" ? centerOverride : track.scrollLeft + track.clientWidth / 2;
      const color = computeStageColor(center);
      setStageColor((prev) => (prev === color ? prev : color));
    },
    [categories, computeStageColor, measureCards]
  );

  const galleryGradient = useMemo(() => {
    const soft = withAlpha(stageColor, 0.22);
    const bright = rgbToRgba(adjustColor(stageColor, 0.45), 0.3);
    const deep = rgbToRgba(adjustColor(stageColor, -0.3), 0.28);
    return `radial-gradient(120% 160% at 48% 20%, ${soft} 0%, ${bright} 45%, transparent 75%), radial-gradient(140% 200% at 20% 120%, ${deep} 0%, transparent 70%)`;
  }, [stageColor]);

  const railTint = useMemo(() => withAlpha(stageColor, 0.12), [stageColor]);

  const animateToIndex = useCallback(
    (idx: number, options: { instant?: boolean } = {}) => {
      const track = trackRef.current;
      const card = cardRefs.current[idx];
      if (!track || !card) return;

      measureCards();

      const rawTarget = card.offsetLeft - track.clientWidth / 2 + card.clientWidth / 2;
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const target = clamp(rawTarget, 0, maxScroll);

    if (options.instant) {
      track.scrollLeft = target;
      updateStageColor(target + track.clientWidth / 2);
      return;
    }

      if (typeof track.scrollTo === "function") {
        track.scrollTo({ left: target, behavior: "smooth" });
      } else {
        track.scrollLeft = target;
        updateStageColor(target + track.clientWidth / 2);
      }
    },
    [measureCards, updateStageColor]
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
    cardRefs.current = cardRefs.current.slice(0, categories.length);
  }, [categories.length]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (categories.length === 0) {
      setStageColor(FALLBACK_COLOR);
      return;
    }
    updateStageColor();
  }, [categories, updateStageColor]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || categories.length === 0) return;

    const handleScroll = () => {
      if (scrollFrameRef.current != null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        const { scrollLeft, clientWidth, scrollWidth } = el;
        const center = scrollLeft + clientWidth / 2;
        updateStageColor(center);

        let centers = cardCentersRef.current;
        if (!centers.some((middle) => Number.isFinite(middle))) {
          measureCards();
          centers = cardCentersRef.current;
        }
        let closest = activeIndexRef.current;
        let min = Number.POSITIVE_INFINITY;
        centers.forEach((middle, idx) => {
          if (!Number.isFinite(middle)) return;
          const dist = Math.abs(center - middle);
          if (dist < min) {
            min = dist;
            closest = idx;
          }
        });

        if (closest !== activeIndexRef.current) {
          activeIndexRef.current = closest;
          setActiveIndex(closest);
          const params = new URLSearchParams(search);
          if (categories[closest]) {
            params.set("cat", categories[closest].id);
            router.replace(`?${params.toString()}`, { scroll: false });
          }
        }

        const progress =
          scrollWidth <= clientWidth ? 0.5 : scrollLeft / Math.max(1, scrollWidth - clientWidth);
        glowMotion.set(clamp(progress, 0, 1));
      });
    };

    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (scrollFrameRef.current != null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
      el.removeEventListener("scroll", handleScroll);
    };
  }, [categories, glowMotion, measureCards, router, search, updateStageColor]);

  useLayoutEffect(() => {
    if (categories.length === 0) return;
    measureCards();
    const track = trackRef.current;
    if (track) {
      updateStageColor(track.scrollLeft + track.clientWidth / 2);
    }
  }, [activeIndex, categories.length, measureCards, updateStageColor]);

  useEffect(() => {
    const handleResize = () => {
      measureCards();
      updateStageColor();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [measureCards, updateStageColor]);

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
      <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-slate-950/40 px-2 py-5 sm:px-4">
        <motion.div
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{ background: galleryGradient }}
          animate={{ opacity: 1 }}
        />
        <motion.div
          className="pointer-events-none absolute -inset-24 blur-3xl"
          style={{ background: railTint }}
          animate={{ opacity: 0.5 }}
          transition={{ duration: 0.6 }}
        />
        <motion.div
          className="pointer-events-none absolute top-1/2 h-[120%] w-[115%] -translate-y-1/2 -translate-x-1/2"
          style={{
            left: glowX,
            background: `radial-gradient(60% 120% at 50% 50%, ${withAlpha(stageColor, 0.52)} 0%, transparent 70%)`,
          }}
          animate={{ opacity: 0.55 }}
          transition={{ duration: 0.6 }}
        />
        <div
          ref={trackRef}
          className={`relative flex snap-x gap-5 overflow-x-auto overflow-y-hidden px-2 sm:px-3 ${
            skillDragging ? "snap-none touch-none" : "snap-mandatory touch-pan-x"
          }`}
          onPointerDown={triggerAutoplayDelay}
          onTouchStart={triggerAutoplayDelay}
        >
          {categories.map((cat, idx) => {
            if (categories.length > 20 && Math.abs(idx - activeIndex) > 6) {
              return (
                <div
                  key={cat.id}
                  className="snap-center shrink-0 w-[85vw] sm:w-[70vw] lg:w-[52vw] xl:w-[44vw]"
                  aria-hidden
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
                className="snap-center shrink-0 w-[85vw] sm:w-[70vw] lg:w-[52vw] xl:w-[44vw]"
                style={{ scrollMarginInline: "12px" }}
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
      <div className="mt-6 flex flex-wrap justify-center gap-2.5" role="tablist">
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
              className="group inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              style={{
                background: isActive ? withAlpha(chipColor, 0.28) : "rgba(15,23,42,0.55)",
                border: `1px solid ${isActive ? withAlpha(chipColor, 0.55) : "rgba(148,163,184,0.25)"}`,
                boxShadow: isActive
                  ? `0 16px 34px ${withAlpha(chipColor, 0.28)}`
                  : "0 6px 18px rgba(15, 23, 42, 0.35)",
                color: isActive ? "rgba(248,250,252,0.97)" : "rgba(226,232,240,0.82)",
              }}
              whileHover={isActive ? undefined : { scale: 1.045 }}
              whileFocus={isActive ? undefined : { scale: 1.035 }}
              animate={{
                scale: isActive ? 1.055 : 1,
                opacity: isActive ? 1 : 0.8,
              }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-base font-semibold shadow"
                style={{
                  background: isActive ? withAlpha(chipColor, 0.5) : withAlpha(chipColor, 0.18),
                  color: isActive ? "rgba(15, 23, 42, 0.85)" : "rgba(255,255,255,0.92)",
                  boxShadow: isActive
                    ? `0 10px 20px ${withAlpha(chipColor, 0.32)}`
                    : "0 6px 14px rgba(15,23,42,0.32)",
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

