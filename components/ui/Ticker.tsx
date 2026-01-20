"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export function Ticker<T>({
  items,
  renderItem,
  speed = 60,
  pauseOnHover = true,
  className,
  trackClassName,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  speed?: number;
  pauseOnHover?: boolean;
  className?: string;
  trackClassName?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isStatic, setIsStatic] = useState(false);

  const tickerItems = useMemo(
    () => (items.length > 0 ? [...items, ...items] : []),
    [items]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMode = () => {
      setIsStatic(motionQuery.matches);
    };
    updateMode();
    motionQuery.addEventListener("change", updateMode);
    return () => {
      motionQuery.removeEventListener("change", updateMode);
    };
  }, []);

  useEffect(() => {
    if (isStatic) {
      const track = trackRef.current;
      if (track) {
        track.style.transform = "translateX(0)";
      }
      return;
    }
    const track = trackRef.current;
    if (!track || tickerItems.length === 0) return;

    const container = track.parentElement;
    const containerWidth = container?.clientWidth ?? track.clientWidth;
    // scrollWidth includes both copies of the items; divide by 2 for one loop.
    const loopWidth = tickerItems.length > 0 ? track.scrollWidth / 2 : 0;

    if (!loopWidth || loopWidth <= containerWidth + 2) {
      track.style.transform = "translateX(0)";
      return;
    }

    let animationFrame: number;
    let lastTimestamp: number | null = null;
    let offset = 0;

    const tick = (timestamp: number) => {
      if (paused) {
        lastTimestamp = timestamp;
        animationFrame = window.requestAnimationFrame(tick);
        return;
      }

      if (lastTimestamp != null) {
        const deltaSeconds = (timestamp - lastTimestamp) / 1000;
        offset += deltaSeconds * speed;
        if (loopWidth > 0) {
          offset = offset % loopWidth;
        }
        track.style.transform = `translateX(-${offset}px)`;
      }
      lastTimestamp = timestamp;
      animationFrame = window.requestAnimationFrame(tick);
    };

    track.style.transform = "translateX(0)";
    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      track.style.transform = "";
    };
  }, [items.length, tickerItems.length, paused, layoutVersion, speed, isStatic]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(() => {
      setLayoutVersion((version) => version + 1);
    });
    observer.observe(track);
    if (track.parentElement) {
      observer.observe(track.parentElement);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleResize = () => setLayoutVersion((version) => version + 1);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (tickerItems.length === 0) {
    return <div className={cn("overflow-hidden", className)} />;
  }

  const eventProps = pauseOnHover
    ? {
        onMouseEnter: () => setPaused(true),
        onMouseLeave: () => setPaused(false),
        onFocusCapture: () => setPaused(true),
        onBlurCapture: () => setPaused(false),
      }
    : {};

  return (
    <div
      className={cn(
        "overflow-hidden",
        isStatic && "overflow-x-auto overscroll-x-contain",
        className
      )}
      {...eventProps}
    >
      <div
        ref={trackRef}
        className={cn("flex flex-nowrap will-change-transform", trackClassName)}
        aria-live="off"
      >
        {tickerItems.map((item, index) => (
          <div key={index} className="shrink-0">
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
