"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import CategoryCard from "./CategoryCard";
import useSkillProgress from "./useSkillProgress";
import useSkillsData, { type Category } from "./useSkillsData";
import { deriveInitialIndex } from "./carouselUtils";
import { updateCatOrder } from "@/lib/data/cats";

const FALLBACK_COLOR = "#6366f1";

// Carousel tuning constants - adjust for iOS vs desktop trackpads
const CAROUSEL_CONFIG = {
  // Swipe velocity thresholds (pixels per ms)
  VELOCITY_THRESHOLD_TOUCH: 0.15, // Lower for mobile touch gestures
  VELOCITY_THRESHOLD_MOUSE: 0.8, // Higher for mouse/trackpad

  // Minimum swipe distance to trigger snapping (pixels)
  MIN_SWIPE_DISTANCE: 30,

  // Spring animation parameters
  SPRING_STIFFNESS: 120, // Increased for snappier feel
  SPRING_DAMPING: 25, // Adjusted for better bounce
  SPRING_MASS: 1,

  // Overshoot distance in pixels before settling
  SPRING_OVERSHOOT: 4, // Slightly more bounce

  // Precision for stopping animation (pixels)
  SPRING_PRECISION: 0.1,

  // Transition duration for emphasis animations (ms)
  EMPHASIS_DURATION: 300,
} as const;

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
  const {
    categories: fetchedCategories,
    skillsByCategory,
    isLoading,
  } = useSkillsData();
  const { progressBySkillId } = useSkillProgress();
  const router = useRouter();
  const search = useSearchParams();

  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeIndexRef = useRef(0);
  const scrollFrame = useRef<number | null>(null);

  // Touch tracking for swipe velocity
  const touchStartRef = useRef<{ x: number; time: number } | null>(null);
  const touchVelocityRef = useRef<number>(0);

  // Prevent scroll → state feedback loops during programmatic animations
  const isAnimatingScrollRef = useRef<boolean>(false);

  const [categories, setCategories] = useState(fetchedCategories);
  const [activeIndex, setActiveIndex] = useState(0);
  const [skillDragging, setSkillDragging] = useState(false);
  const [catOverrides, setCatOverrides] = useState<
    Record<string, { color?: string | null; icon?: string | null }>
  >({});
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [emphasizedCardIndex, setEmphasizedCardIndex] = useState<number | null>(
    null
  );
  const [isSwiping, setIsSwiping] = useState(false);
  const [isUsingMouse, setIsUsingMouse] = useState(false);

  const skeletonCategoryPlaceholders = [0, 1, 2];
  const skeletonChipPlaceholders = [0, 1, 2, 3];

  const getCategoryColor = (category: (typeof categories)[number]) =>
    catOverrides[category.id]?.color ?? category.color_hex ?? FALLBACK_COLOR;
  const getCategoryIcon = (category: (typeof categories)[number]) =>
    catOverrides[category.id]?.icon ?? category.icon ?? null;

  const activeCategory = categories[activeIndex];
  const activeColor = useMemo(() => {
    if (!activeCategory) {
      return FALLBACK_COLOR;
    }
    const override = catOverrides[activeCategory.id];
    return override?.color ?? activeCategory.color_hex ?? FALLBACK_COLOR;
  }, [activeCategory, catOverrides]);
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < categories.length - 1;

  const firstReorderableIndex = useMemo(
    () => categories.findIndex((category) => category.id !== "uncategorized"),
    [categories]
  );
  const lastReorderableIndex = useMemo(() => {
    for (let idx = categories.length - 1; idx >= 0; idx -= 1) {
      if (categories[idx]?.id !== "uncategorized") {
        return idx;
      }
    }
    return -1;
  }, [categories]);

  useEffect(() => {
    setCategories((previous) => {
      if (previous === fetchedCategories) {
        return previous;
      }

      if (previous.length === fetchedCategories.length) {
        let identical = true;
        for (let idx = 0; idx < previous.length; idx += 1) {
          const a = previous[idx];
          const b = fetchedCategories[idx];
          if (
            a.id !== b.id ||
            a.name !== b.name ||
            a.color_hex !== b.color_hex ||
            a.icon !== b.icon ||
            a.order !== b.order
          ) {
            identical = false;
            break;
          }
        }
        if (identical) {
          return previous;
        }
      }

      return fetchedCategories;
    });
  }, [fetchedCategories]);

  useEffect(() => {
    setCatOverrides((prev) => {
      let changed = false;
      const next: Record<
        string,
        { color?: string | null; icon?: string | null }
      > = {};
      for (const category of categories) {
        const existing = prev[category.id];
        const color = existing?.color ?? category.color_hex ?? FALLBACK_COLOR;
        const icon = existing?.icon ?? category.icon ?? null;
        next[category.id] = { color, icon };
        if (!existing || existing.color !== color || existing.icon !== icon) {
          changed = true;
        }
      }

      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }

      return next;
    });
  }, [categories]);

  // Spring animation for scrollLeft with tunable parameters
  const springScrollTo = useCallback(
    (
      element: HTMLElement,
      targetScrollLeft: number,
      options: {
        stiffness?: number; // Spring stiffness (default: 100)
        damping?: number; // Damping coefficient (default: 20)
        mass?: number; // Mass (default: 1)
        overshoot?: number; // Overshoot amount in pixels (default: 3)
        precision?: number; // Precision for stopping (default: 0.1)
        onComplete?: () => void; // Callback when animation finishes
      } = {}
    ) => {
      const {
        stiffness = CAROUSEL_CONFIG.SPRING_STIFFNESS,
        damping = CAROUSEL_CONFIG.SPRING_DAMPING,
        mass = CAROUSEL_CONFIG.SPRING_MASS,
        overshoot = CAROUSEL_CONFIG.SPRING_OVERSHOOT,
        precision = CAROUSEL_CONFIG.SPRING_PRECISION,
        onComplete,
      } = options;

      // Log spring configuration for testing
      console.log(
        `🎯 Spring animation: stiffness=${stiffness}, damping=${damping}, mass=${mass}, overshoot=${overshoot}px`
      );

      let position = element.scrollLeft;
      let velocity = 0;
      let isAnimating = true;

      // Apply overshoot to target
      const overshootTarget = targetScrollLeft + overshoot;

      const animate = () => {
        if (!isAnimating) return;

        // Spring force: F = -k * (x - target)
        const displacement = position - overshootTarget;
        const springForce = -stiffness * displacement;

        // Damping force: F = -c * v
        const dampingForce = -damping * velocity;

        // Total force and acceleration: F = m*a => a = F/m
        const totalForce = springForce + dampingForce;
        const acceleration = totalForce / mass;

        // Update velocity and position (Euler integration)
        velocity += acceleration * 0.016; // Assume ~60fps (16ms per frame)
        position += velocity * 0.016;

        // Apply to element
        element.scrollLeft = position;

        // Check if animation should stop (close to target with low velocity)
        const distanceToTarget = Math.abs(position - targetScrollLeft);
        if (distanceToTarget < precision && Math.abs(velocity) < precision) {
          // Snap to exact target and stop
          element.scrollLeft = targetScrollLeft;
          isAnimating = false;
          // Call completion callback
          onComplete?.();
        } else {
          requestAnimationFrame(animate);
        }
      };

      // Set animation flag to prevent feedback loops
      isAnimatingScrollRef.current = true;

      requestAnimationFrame(animate);
    },
    []
  );

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
          // For instant scrolls, update state immediately
          activeIndexRef.current = bounded;
          setActiveIndex((prev) => (prev === bounded ? prev : bounded));

          if (!options.skipUrl && categories[bounded]) {
            const nextId = categories[bounded].id;
            if (search.get("cat") !== nextId) {
              const params = new URLSearchParams(search);
              params.set("cat", nextId);
              startTransition(() => {
                router.replace(`?${params.toString()}`, { scroll: false });
              });
            }
          }
        } else {
          // For animated scrolls, delay state updates until animation completes
          springScrollTo(track, nextScroll, {
            onComplete: () => {
              // Clear animation flag
              isAnimatingScrollRef.current = false;

              // Update active state after animation finishes settling
              activeIndexRef.current = bounded;
              setActiveIndex((prev) => (prev === bounded ? prev : bounded));

              // Apply emphasis animation to the settled card
              setEmphasizedCardIndex(bounded);

              if (!options.skipUrl && categories[bounded]) {
                const nextId = categories[bounded].id;
                if (search.get("cat") !== nextId) {
                  const params = new URLSearchParams(search);
                  params.set("cat", nextId);
                  startTransition(() => {
                    router.replace(`?${params.toString()}`, { scroll: false });
                  });
                }
              }
            },
          });
        }
      }
    },
    [categories, router, search, springScrollTo]
  );

  const syncToNearestCard = useCallback(
    (velocityOverride?: number) => {
      const track = trackRef.current;
      if (!track || categories.length === 0) return;

      // Prevent running during programmatic animations to avoid feedback loops
      if (isAnimatingScrollRef.current) return;

      const trackRect = track.getBoundingClientRect();
      const center = trackRect.left + trackRect.width / 2;
      const velocity = velocityOverride ?? touchVelocityRef.current;

      let targetIndex = activeIndexRef.current;

      // Velocity-aware target selection - use different thresholds for touch vs mouse
      const velocityThreshold = isUsingMouse
        ? CAROUSEL_CONFIG.VELOCITY_THRESHOLD_MOUSE
        : CAROUSEL_CONFIG.VELOCITY_THRESHOLD_TOUCH;

      if (Math.abs(velocity) > velocityThreshold && categories.length > 1) {
        // High velocity: snap to next/previous based on swipe direction
        const swipeDirection = velocity > 0 ? -1 : 1; // Negative velocity = right swipe (previous), positive = left swipe (next)

        if (swipeDirection > 0 && targetIndex > 0) {
          targetIndex = targetIndex - 1; // Swipe right: go to previous
        } else if (swipeDirection < 0 && targetIndex < categories.length - 1) {
          targetIndex = targetIndex + 1; // Swipe left: go to next
        }

        console.log(
          `High velocity (${velocity.toFixed(3)} px/ms) detected, direction: ${
            swipeDirection > 0 ? "right" : "left"
          }, snapping to: ${targetIndex}`
        );
      } else {
        // Low velocity: snap to nearest by distance
        let minDistance = Number.POSITIVE_INFINITY;

        cardRefs.current.forEach((card, idx) => {
          if (!card) return;

          const rect = card.getBoundingClientRect();
          const cardCenter = rect.left + rect.width / 2;
          const distance = Math.abs(cardCenter - center);

          if (distance < minDistance) {
            targetIndex = idx;
            minDistance = distance;
          }
        });
      }

      if (targetIndex !== activeIndexRef.current) {
        activeIndexRef.current = targetIndex;
        setActiveIndex((prev) => (prev === targetIndex ? prev : targetIndex));

        const nextId = categories[targetIndex]?.id;
        if (nextId && search.get("cat") !== nextId) {
          const params = new URLSearchParams(search);
          params.set("cat", nextId);
          startTransition(() => {
            router.replace(`?${params.toString()}`, { scroll: false });
          });
        }
      }

      // Reset velocity after use
      touchVelocityRef.current = 0;
    },
    [categories, router, search]
  );

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

  // Removed scroll-based snapping - now only snaps on gesture end

  useEffect(() => {
    const handleResize = () => {
      scrollToIndex(activeIndexRef.current, { instant: true, skipUrl: true });
      requestAnimationFrame(syncToNearestCard);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scrollToIndex, syncToNearestCard]);

  const persistCategoryOrder = useCallback(
    async (nextCategories: Category[]) => {
      const reorderable = nextCategories.filter(
        (category) => category.id !== "uncategorized"
      );
      if (reorderable.length === 0) {
        return;
      }
      setIsSavingOrder(true);
      try {
        await Promise.all(
          reorderable.map((category, index) =>
            updateCatOrder(category.id, index + 1)
          )
        );
      } catch (error) {
        console.error("Failed to update category order", error);
      } finally {
        setIsSavingOrder(false);
      }
    },
    []
  );

  type ReorderDirection = "left" | "right" | "first" | "last";

  const reorderCategory = useCallback(
    (categoryId: string, direction: ReorderDirection) => {
      if (isSavingOrder) return;

      let nextCategories: Category[] | null = null;
      setCategories((previous) => {
        const currentIndex = previous.findIndex(
          (category) => category.id === categoryId
        );
        if (currentIndex === -1) return previous;
        const targetIndex =
          direction === "left" ? currentIndex - 1 : currentIndex + 1;
        if (previous[currentIndex]?.id === "uncategorized") return previous;

        const firstReorderableIndex = previous.findIndex(
          (category) => category.id !== "uncategorized"
        );
        const lastReorderableIndex = (() => {
          for (let idx = previous.length - 1; idx >= 0; idx -= 1) {
            if (previous[idx]?.id !== "uncategorized") {
              return idx;
            }
          }
          return -1;
        })();

        if (firstReorderableIndex === -1 || lastReorderableIndex === -1) {
          return previous;
        }

        let updated: Category[] | null = null;

        if (direction === "left" || direction === "right") {
          if (
            targetIndex < firstReorderableIndex ||
            targetIndex > lastReorderableIndex
          ) {
            return previous;
          }
          if (previous[targetIndex]?.id === "uncategorized") return previous;

          updated = [...previous];
          [updated[currentIndex], updated[targetIndex]] = [
            updated[targetIndex],
            updated[currentIndex],
          ];
        } else if (direction === "first") {
          if (currentIndex === firstReorderableIndex) return previous;
          updated = [...previous];
          const [category] = updated.splice(currentIndex, 1);
          updated.splice(firstReorderableIndex, 0, category);
        } else if (direction === "last") {
          if (currentIndex === lastReorderableIndex) return previous;
          updated = [...previous];
          const [category] = updated.splice(currentIndex, 1);
          // When removing an earlier item, the last index shifts by -1, so insert at updated length constrained by
          // the last reorderable slot.
          const insertionIndex = Math.min(lastReorderableIndex, updated.length);
          updated.splice(insertionIndex, 0, category);
        }

        if (!updated) {
          return previous;
        }

        const mapped = updated.map((category, index) => ({
          ...category,
          order: index + 1,
        }));

        nextCategories = mapped;

        const activeId = previous[activeIndexRef.current]?.id;
        if (activeId) {
          const nextActiveIndex = mapped.findIndex(
            (category) => category.id === activeId
          );
          if (
            nextActiveIndex !== -1 &&
            nextActiveIndex !== activeIndexRef.current
          ) {
            activeIndexRef.current = nextActiveIndex;
            setActiveIndex(nextActiveIndex);
          }
        }

        return mapped;
      });

      if (nextCategories) {
        void persistCategoryOrder(nextCategories);
      }
    },
    [isSavingOrder, persistCategoryOrder]
  );

  if (isLoading) {
    return (
      <div className="relative" role="status" aria-live="polite" aria-busy>
        <span className="sr-only">Loading skill categories…</span>
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/70 px-2 py-6 shadow-lg sm:px-4">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black"
            aria-hidden
          />
          <div className="relative flex gap-5 overflow-hidden px-2 sm:px-3">
            {skeletonCategoryPlaceholders.map((placeholder) => (
              <div
                key={placeholder}
                className="w-[85vw] shrink-0 sm:w-[70vw] lg:w-[52vw] xl:w-[44vw]"
                style={{ scrollMarginInline: "12px" }}
              >
                <div className="flex h-full animate-pulse flex-col justify-between rounded-[26px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-lg">
                  <div className="flex flex-col gap-4">
                    <div className="h-8 w-8 rounded-full bg-white/[0.08]" />
                    <div className="h-6 w-2/3 rounded-full bg-white/[0.08]" />
                    <div className="space-y-3">
                      {skeletonCategoryPlaceholders.map((line) => (
                        <div
                          key={line}
                          className="h-5 w-full rounded-full bg-white/[0.06]"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-white/[0.07]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded-full bg-white/[0.06]" />
                      <div className="h-3 w-1/3 rounded-full bg-white/[0.04]" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {skeletonChipPlaceholders.map((placeholder) => (
            <div
              key={placeholder}
              className="inline-flex animate-pulse items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-1.5 text-sm text-slate-300/80"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-sm" />
              <span className="hidden h-4 w-16 rounded-full bg-white/[0.06] sm:block" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (categories.length === 0) {
    return <div className="py-8 text-center text-zinc-400">No skills yet</div>;
  }

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
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black"
          aria-hidden
        />
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
            skillDragging
              ? "snap-none touch-none"
              : "snap-proximity touch-pan-x"
          }`}
          onTouchStart={(e) => {
            if (skillDragging) return; // Don't track if skills are being dragged
            const touch = e.touches[0];
            if (touch) {
              touchStartRef.current = {
                x: touch.clientX,
                time: Date.now(),
              };
              setIsSwiping(true); // Start swipe state
            }
          }}
          onTouchMove={(e) => {
            if (skillDragging || !touchStartRef.current) return;
            // Update tracking during move if needed for velocity calculation
            // For now, we just maintain the start position
          }}
          onMouseDown={(e) => {
            if (skillDragging) return; // Don't track if skills are being dragged
            setIsUsingMouse(true); // Mark as mouse interaction
            touchStartRef.current = {
              x: e.clientX,
              time: Date.now(),
            };
            setIsSwiping(true); // Start swipe state
          }}
          onMouseUp={(e) => {
            if (skillDragging || !touchStartRef.current) return;

            const deltaX = e.clientX - touchStartRef.current.x;
            const deltaTime = Date.now() - touchStartRef.current.time;

            // Check minimum swipe distance to avoid accidental triggers
            if (
              Math.abs(deltaX) >= CAROUSEL_CONFIG.MIN_SWIPE_DISTANCE &&
              deltaTime > 0
            ) {
              // Calculate pixels per millisecond (negative = left swipe, positive = right swipe)
              const velocity = deltaX / deltaTime;
              touchVelocityRef.current = velocity;

              console.log(
                `🎯 Mouse end: velocity=${velocity.toFixed(
                  3
                )} px/ms, deltaX=${deltaX}px, deltaTime=${deltaTime}ms, threshold=${
                  CAROUSEL_CONFIG.VELOCITY_THRESHOLD_MOUSE
                }`
              );

              // Trigger snapping decision only on gesture end
              syncToNearestCard(velocity);
            }

            // Reset tracking
            touchStartRef.current = null;
            setIsUsingMouse(false);
            setIsSwiping(false); // Clear swipe state
          }}
          onTouchEnd={(e) => {
            if (skillDragging || !touchStartRef.current) return;

            const touch = e.changedTouches[0];
            if (touch) {
              const deltaX = touch.clientX - touchStartRef.current.x;
              const deltaTime = Date.now() - touchStartRef.current.time;

              // Check minimum swipe distance to avoid accidental triggers
              if (
                Math.abs(deltaX) >= CAROUSEL_CONFIG.MIN_SWIPE_DISTANCE &&
                deltaTime > 0
              ) {
                // Calculate pixels per millisecond (negative = left swipe, positive = right swipe)
                const velocity = deltaX / deltaTime;
                touchVelocityRef.current = velocity;

                console.log(
                  `🎯 Touch end: velocity=${velocity.toFixed(
                    3
                  )} px/ms, deltaX=${deltaX}px, deltaTime=${deltaTime}ms, threshold=${
                    CAROUSEL_CONFIG.VELOCITY_THRESHOLD_TOUCH
                  }`
                );

                // Trigger snapping decision only on gesture end
                syncToNearestCard(velocity);
              }
            }

            // Reset touch tracking
            touchStartRef.current = null;
            setIsSwiping(false); // Clear swipe state
          }}
        >
          {categories.map((category, idx) => {
            const isActive = idx === activeIndex;
            const isUncategorized = category.id === "uncategorized";
            const canMoveLeft =
              !isUncategorized &&
              idx > firstReorderableIndex &&
              firstReorderableIndex !== -1;
            const canMoveRight =
              !isUncategorized &&
              idx < lastReorderableIndex &&
              lastReorderableIndex !== -1;
            return (
              <div
                key={category.id}
                ref={(element) => {
                  cardRefs.current[idx] = element;
                }}
                role="group"
                aria-label={`Category ${idx + 1} of ${categories.length}`}
                className={`w-[85vw] shrink-0 snap-center sm:w-[70vw] lg:w-[52vw] xl:w-[44vw] ${
                  isSwiping ? "" : "transition-all duration-300 ease-out"
                }`}
                style={{
                  scrollMarginInline: "12px",
                  transform:
                    emphasizedCardIndex === idx ? "scale(1)" : "scale(0.96)",
                  opacity: 1,
                }}
              >
                <CategoryCard
                  category={category}
                  skills={skillsByCategory[category.id] || []}
                  active={isActive}
                  onSkillDrag={setSkillDragging}
                  colorOverride={getCategoryColor(category)}
                  iconOverride={getCategoryIcon(category)}
                  progressBySkillId={progressBySkillId}
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
                        icon: prev[category.id]?.icon ?? category.icon ?? null,
                      },
                    }))
                  }
                  onIconChange={(icon) =>
                    setCatOverrides((prev) => ({
                      ...prev,
                      [category.id]: {
                        ...(prev[category.id] || {}),
                        icon,
                        color:
                          prev[category.id]?.color ??
                          category.color_hex ??
                          FALLBACK_COLOR,
                      },
                    }))
                  }
                  onReorder={(direction) =>
                    reorderCategory(category.id, direction)
                  }
                  canMoveLeft={canMoveLeft}
                  canMoveRight={canMoveRight}
                  canMoveToStart={canMoveLeft}
                  canMoveToEnd={canMoveRight}
                  isReordering={isSavingOrder}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div
        className="mt-6 flex flex-wrap justify-center gap-2.5"
        role="tablist"
      >
        {categories.map((category, idx) => {
          const isActive = idx === activeIndex;
          const previewSkill = (skillsByCategory[category.id] || []).find(
            (skill) => skill.emoji
          )?.emoji;
          const catIcon = getCategoryIcon(category);
          const resolvedIcon = catIcon?.trim();
          const preview =
            resolvedIcon && resolvedIcon.length > 0
              ? resolvedIcon
              : previewSkill || category.name.charAt(0).toUpperCase();
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
                isActive
                  ? "text-slate-100"
                  : "text-slate-300/85 hover:text-slate-100"
              }`}
              style={{
                backgroundColor: isActive
                  ? withAlpha(chipColor, 0.24)
                  : "rgba(0, 0, 0, 0.65)",
                borderColor: isActive
                  ? withAlpha(chipColor, 0.45)
                  : "rgba(148, 163, 184, 0.25)",
                boxShadow: isActive
                  ? `0 16px 32px ${withAlpha(chipColor, 0.28)}`
                  : "0 6px 18px rgba(0, 0, 0, 0.3)",
              }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-base font-semibold shadow"
                style={{
                  backgroundColor: isActive
                    ? withAlpha(chipColor, 0.55)
                    : withAlpha(chipColor, 0.18),
                  color: isActive
                    ? "rgba(0, 0, 0, 0.85)"
                    : "rgba(255,255,255,0.92)",
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
