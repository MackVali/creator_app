"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import CategoryCard from "./CategoryCard";
import useSkillsData from "./useSkillsData";
import { deriveInitialIndex } from "./carouselUtils";

const FALLBACK_COLOR = "#6366f1";

function parseHex(hex?: string | null) {
  if (!hex) {
    return { r: 99, g: 102, b: 241 };
  }

  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return { r: 99, g: 102, b: 241 };
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return { r: 99, g: 102, b: 241 };
  }

  return { r, g, b };
}

function withAlpha(hex: string | null | undefined, alpha: number) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function SkillsCarousel() {
  const { categories, skillsByCategory, isLoading } = useSkillsData();
  const router = useRouter();
  const search = useSearchParams();

  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeIndexRef = useRef(0);
  const scrollFrame = useRef<number | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [skillDragging, setSkillDragging] = useState(false);
  const [catOverrides, setCatOverrides] = useState<
    Record<string, { color?: string | null; icon?: string | null }>
  >({});
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

  useEffect(() => {
    setCatOverrides((prev) => {
      const next: Record<string, { color?: string | null; icon?: string | null }> = {};
      for (const category of categories) {
        const existing = prev[category.id];
        next[category.id] = {
          color: existing?.color ?? category.color_hex ?? FALLBACK_COLOR,
          icon: existing?.icon ?? category.icon_emoji ?? null,
        };
      }
      return next;
    });
  }, [categories]);

  const scrollToIndex = useCallback(
    (index: number, options: { instant?: boolean; skipUrl?: boolean } = {}) => {
      if (categories.length === 0) return;

      const bounded = Math.max(0, Math.min(index, categories.length - 1));
      const track = trackRef.current;
      const card = cardRefs.current[bounded];

      if (track && card) {
        const trackRect = track.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const offset = cardRect.left - trackRect.left;
        const target =
          track.scrollLeft + offset - (trackRect.width - cardRect.width) / 2;
        const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
        const nextScroll = Math.max(0, Math.min(target, maxScroll));

        if (options.instant) {
          track.scrollLeft = nextScroll;
        } else if (typeof track.scrollTo === "function") {
          track.scrollTo({ left: nextScroll, behavior: "smooth" });
        } else {
          track.scrollLeft = nextScroll;
        }
      }

      activeIndexRef.current = bounded;
      setActiveIndex((prev) => (prev === bounded ? prev : bounded));

      if (!options.skipUrl && categories[bounded]) {
        const nextId = categories[bounded].id;
        if (search.get("cat") !== nextId) {
          const params = new URLSearchParams(search);
          params.set("cat", nextId);
          router.replace(`?${params.toString()}`, { scroll: false });
        }
      }
    },
    [categories, router, search]
  );

  const syncToNearestCard = useCallback(() => {
    const track = trackRef.current;
    if (!track || categories.length === 0) return;

    const trackRect = track.getBoundingClientRect();
    const center = trackRect.left + trackRect.width / 2;

    let nearest = activeIndexRef.current;
    let minDistance = Number.POSITIVE_INFINITY;

    cardRefs.current.forEach((card, idx) => {
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const distance = Math.abs(cardCenter - center);

      if (distance < minDistance) {
        nearest = idx;
        minDistance = distance;
      }
    });

    if (nearest !== activeIndexRef.current) {
      activeIndexRef.current = nearest;
      setActiveIndex((prev) => (prev === nearest ? prev : nearest));

      const nextId = categories[nearest]?.id;
      if (nextId && search.get("cat") !== nextId) {
        const params = new URLSearchParams(search);
        params.set("cat", nextId);
        router.replace(`?${params.toString()}`, { scroll: false });
      }
    }
  }, [categories, router, search]);

  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, categories.length);
    if (categories.length === 0) {
      return;
    }

    if (activeIndexRef.current >= categories.length) {
      const fallback = Math.max(0, categories.length - 1);
      scrollToIndex(fallback, { instant: true });
    } else {
      scrollToIndex(activeIndexRef.current, { instant: true, skipUrl: true });
    }
  }, [categories.length, scrollToIndex]);

  useEffect(() => {
    setOpenMenuFor((current) => {
      if (!current) return null;
      const activeCategory = categories[activeIndex];
      return activeCategory?.id === current ? current : null;
    });
  }, [activeIndex, categories]);

  useEffect(() => {
    if (categories.length === 0) return;

    const initialId = search.get("cat") || undefined;
    const initialIndex = deriveInitialIndex(categories, initialId);

    activeIndexRef.current = initialIndex;
    setActiveIndex(initialIndex);

    const frame = requestAnimationFrame(() => {
      scrollToIndex(initialIndex, { instant: true, skipUrl: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [categories, scrollToIndex, search]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || categories.length === 0) return;

    const handleScroll = () => {
      if (scrollFrame.current != null) {
        cancelAnimationFrame(scrollFrame.current);
      }

      scrollFrame.current = requestAnimationFrame(() => {
        scrollFrame.current = null;
        syncToNearestCard();
      });
    };

    handleScroll();
    track.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (scrollFrame.current != null) {
        cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = null;
      }
      track.removeEventListener("scroll", handleScroll);
    };
  }, [categories.length, syncToNearestCard]);

  useEffect(() => {
    const handleResize = () => {
      scrollToIndex(activeIndexRef.current, { instant: true, skipUrl: true });
      requestAnimationFrame(syncToNearestCard);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scrollToIndex, syncToNearestCard]);

  if (isLoading) {
    return <div className="py-8 text-center text-zinc-400">Loading...</div>;
  }

  if (categories.length === 0) {
    return <div className="py-8 text-center text-zinc-400">No skills yet</div>;
  }

  const getCategoryColor = (category: (typeof categories)[number]) =>
    catOverrides[category.id]?.color ?? category.color_hex ?? FALLBACK_COLOR;
  const getCategoryIcon = (category: (typeof categories)[number]) =>
    catOverrides[category.id]?.icon ?? category.icon_emoji ?? null;

  const activeColor = categories[activeIndex]
    ? getCategoryColor(categories[activeIndex]) || FALLBACK_COLOR
    : FALLBACK_COLOR;
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < categories.length - 1;

  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label="Skill categories"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          scrollToIndex(activeIndexRef.current - 1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          scrollToIndex(activeIndexRef.current + 1);
        } else if (event.key === "Enter") {
          event.preventDefault();
          cardRefs.current[activeIndexRef.current]
            ?.querySelector<HTMLButtonElement>("button")
            ?.click();
        }
      }}
    >
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/70 px-2 py-6 shadow-lg sm:px-4">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black" aria-hidden />
        {categories.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous category"
              onClick={() => scrollToIndex(activeIndexRef.current - 1)}
              disabled={!canGoPrev}
              className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border text-slate-100 shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-35 sm:flex"
              style={{
                backgroundColor: withAlpha(activeColor, 0.18),
                borderColor: withAlpha(activeColor, 0.35),
                boxShadow: `0 16px 40px ${withAlpha(activeColor, 0.22)}`,
              }}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next category"
              onClick={() => scrollToIndex(activeIndexRef.current + 1)}
              disabled={!canGoNext}
              className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border text-slate-100 shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-35 sm:flex"
              style={{
                backgroundColor: withAlpha(activeColor, 0.18),
                borderColor: withAlpha(activeColor, 0.35),
                boxShadow: `0 16px 40px ${withAlpha(activeColor, 0.22)}`,
              }}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
        <div
          ref={trackRef}
          className={`relative flex snap-x gap-5 overflow-x-auto overflow-y-hidden px-2 sm:px-3 ${
            skillDragging ? "snap-none touch-none" : "snap-mandatory touch-pan-x"
          }`}
        >
          {categories.map((category, idx) => {
            const isActive = idx === activeIndex;
            return (
              <div
                key={category.id}
                ref={(element) => {
                  cardRefs.current[idx] = element;
                }}
                role="group"
                aria-label={`Category ${idx + 1} of ${categories.length}`}
                className="w-[85vw] shrink-0 snap-center sm:w-[70vw] lg:w-[52vw] xl:w-[44vw]"
                style={{ scrollMarginInline: "12px" }}
              >
                <CategoryCard
                  category={category}
                  skills={skillsByCategory[category.id] || []}
                  active={isActive}
                  onSkillDrag={setSkillDragging}
                  colorOverride={getCategoryColor(category)}
                  iconOverride={getCategoryIcon(category)}
                  menuOpen={openMenuFor === category.id}
                  onMenuOpenChange={(open) => {
                    setOpenMenuFor((current) => {
                      if (open) {
                        return category.id;
                      }
                      return current === category.id ? null : current;
                    });
                  }}
                  onColorChange={(color) =>
                    setCatOverrides((prev) => ({
                      ...prev,
                      [category.id]: {
                        ...(prev[category.id] || {}),
                        color,
                        icon: prev[category.id]?.icon ?? category.icon_emoji ?? null,
                      },
                    }))
                  }
                  onIconChange={(icon) =>
                    setCatOverrides((prev) => ({
                      ...prev,
                      [category.id]: {
                        ...(prev[category.id] || {}),
                        icon,
                        color: prev[category.id]?.color ?? category.color_hex ?? FALLBACK_COLOR,
                      },
                    }))
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5" role="tablist">
        {categories.map((category, idx) => {
          const isActive = idx === activeIndex;
          const previewSkill = (skillsByCategory[category.id] || []).find((skill) => skill.emoji)?.emoji;
          const catIcon = getCategoryIcon(category);
          const preview = catIcon || previewSkill || category.name.charAt(0).toUpperCase();
          const chipColor = getCategoryColor(category) || FALLBACK_COLOR;

          return (
            <button
              key={category.id}
              role="tab"
              aria-selected={isActive}
              aria-label={`Go to ${category.name}`}
              onClick={() => {
                const alreadyActive = idx === activeIndexRef.current;
                scrollToIndex(idx);
                setOpenMenuFor((current) => {
                  if (!alreadyActive) {
                    return null;
                  }
                  return current === category.id ? null : category.id;
                });
              }}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                isActive ? "text-slate-100" : "text-slate-300/85 hover:text-slate-100"
              }`}
              style={{
                backgroundColor: isActive ? withAlpha(chipColor, 0.24) : "rgba(0, 0, 0, 0.65)",
                borderColor: isActive ? withAlpha(chipColor, 0.45) : "rgba(148, 163, 184, 0.25)",
                boxShadow: isActive
                  ? `0 16px 32px ${withAlpha(chipColor, 0.28)}`
                  : "0 6px 18px rgba(0, 0, 0, 0.3)",
              }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-base font-semibold shadow"
                style={{
                  backgroundColor: isActive ? withAlpha(chipColor, 0.55) : withAlpha(chipColor, 0.18),
                  color: isActive ? "rgba(0, 0, 0, 0.85)" : "rgba(255,255,255,0.92)",
                  boxShadow: isActive
                    ? `0 12px 24px ${withAlpha(chipColor, 0.32)}`
                    : "0 6px 14px rgba(0,0,0,0.28)",
                }}
              >
                {preview}
              </span>
              <span className="hidden pr-1 sm:block">{category.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

