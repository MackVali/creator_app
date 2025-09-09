"use client";

import { ReactNode, useEffect, useRef, useState, KeyboardEvent } from "react";
import { useReducedMotion } from "framer-motion";

interface DayPagerProps {
  currentDate: Date;
  onChangeDate(date: Date): void;
  renderDay(date: Date): ReactNode;
}

export function DayPager({ currentDate, onChangeDate, renderDay }: DayPagerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const dragStart = useRef<number | null>(null);
  const directionRef = useRef<0 | -1 | 1>(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    function update() {
      setWidth(containerRef.current?.clientWidth ?? 0);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  function getPrevDate() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    return d;
  }

  function getNextDate() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    return d;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragStart.current = e.clientX;
    containerRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStart.current !== null) {
      setOffset(e.clientX - dragStart.current);
    }
  }

  function finalizeSwipe() {
    const start = dragStart.current;
    dragStart.current = null;

    if (start === null) return;

    if (prefersReducedMotion) {
      if (Math.abs(offset) > 50) {
        onChangeDate(offset < 0 ? getNextDate() : getPrevDate());
      }
      setOffset(0);
      return;
    }

    if (Math.abs(offset) > width / 3) {
      directionRef.current = offset < 0 ? -1 : 1; // -1 next, 1 prev
      setOffset(directionRef.current * width);
    } else {
      directionRef.current = 0;
      setOffset(0);
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    containerRef.current?.releasePointerCapture(e.pointerId);
    finalizeSwipe();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (prefersReducedMotion) {
        onChangeDate(getPrevDate());
      } else {
        directionRef.current = 1;
        setOffset(width);
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (prefersReducedMotion) {
        onChangeDate(getNextDate());
      } else {
        directionRef.current = -1;
        setOffset(-width);
      }
    }
  }

  function handleTransitionEnd() {
    if (directionRef.current !== 0) {
      onChangeDate(directionRef.current === -1 ? getNextDate() : getPrevDate());
      directionRef.current = 0;
      setOffset(0);
    }
  }

  const transition =
    dragStart.current !== null || prefersReducedMotion
      ? "none"
      : "transform 0.3s ease-out";

  const prevDate = getPrevDate();
  const nextDate = getNextDate();

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden touch-pan-y"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      <div
        className="flex w-[300%]"
        style={{ transform: `translateX(calc(-100% + ${offset}px))`, transition }}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className="w-full flex-shrink-0">{renderDay(prevDate)}</div>
        <div className="w-full flex-shrink-0">{renderDay(currentDate)}</div>
        <div className="w-full flex-shrink-0">{renderDay(nextDate)}</div>
      </div>
    </div>
  );
}

export default DayPager;

