"use client";

import React, { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import SkillCard from "./SkillCard";
import { useSkillsTabs } from "./useSkills";

export default function TabsSkills() {
  const { tabs, activeTab, setActiveTab, skillsByTab, isLoading } = useSkillsTabs();
  const tabsRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const update = () => {
      setShowLeft(el.scrollLeft > 0);
      setShowRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
    };
    update();
    el.addEventListener("scroll", update);
    return () => el.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    const threshold = 32;
    const idx = tabs.findIndex((t) => t.id === activeTab);
    if (dx < -threshold && idx < tabs.length - 1) setActiveTab(tabs[idx + 1].id);
    if (dx > threshold && idx > 0) setActiveTab(tabs[idx - 1].id);
    touchStart.current = null;
  };

  const handleKey = (e: React.KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.id === activeTab);
    if (e.key === "ArrowRight" && idx < tabs.length - 1) {
      setActiveTab(tabs[idx + 1].id);
    }
    if (e.key === "ArrowLeft" && idx > 0) {
      setActiveTab(tabs[idx - 1].id);
    }
  };

  const scrollTabs = (dir: number) => {
    const el = tabsRef.current;
    if (el) el.scrollBy({ left: dir * 120, behavior: "smooth" });
  };

  if (isLoading) {
    return <div className="py-8 text-center text-zinc-400">Loading...</div>;
  }

  if (tabs.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-400">
        No skills yet
        <div className="mt-2">
          <Link href="/skills" className="text-accent underline">
            Add Skill
          </Link>
        </div>
      </div>
    );
  }

  const skills = activeTab ? skillsByTab[activeTab] || [] : [];
  const paginated = skills.slice(0, page * 20);

  return (
    <div
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="sticky top-0 z-10 bg-[var(--bg)] pb-3">
        <div className="relative">
          {showLeft && (
            <button
              aria-label="Scroll left"
              onClick={() => scrollTabs(-1)}
              className="absolute left-0 top-1/2 -translate-y-1/2 p-1 bg-zinc-900/80 rounded-full shadow"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div
            ref={tabsRef}
            role="tablist"
            onKeyDown={handleKey}
            className="flex overflow-x-auto scrollbar-none gap-2 px-6 snap-x snap-mandatory"
            style={{ maskImage: "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)" }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={tab.id === activeTab}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl border whitespace-nowrap snap-start ${
                  tab.id === activeTab
                    ? "border-zinc-600 bg-zinc-800 text-zinc-100 shadow"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-300"
                }`}
              >
                {tab.name.toUpperCase()}
              </button>
            ))}
          </div>
          {showRight && (
            <button
              aria-label="Scroll right"
              onClick={() => scrollTabs(1)}
              className="absolute right-0 top-1/2 -translate-y-1/2 p-1 bg-zinc-900/80 rounded-full shadow"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -20, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="grid grid-cols-2 sm:grid-cols-3 gap-3"
        >
          {paginated.length > 0 ? (
            paginated.map((skill) => <SkillCard key={skill.id} skill={skill} />)
          ) : (
            <div className="col-span-full text-center py-8 text-zinc-400">
              No skills yet
              <div className="mt-2">
                <Link href="/skills" className="text-accent underline">
                  Add Skill
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {paginated.length < skills.length && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 text-sm rounded-full border border-zinc-800 bg-zinc-900/60 text-zinc-300"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

