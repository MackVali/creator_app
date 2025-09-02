"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import { EventModal } from "./EventModal";
import { NoteModal } from "./NoteModal";
import { ComingSoonModal } from "./ComingSoonModal";

interface FabProps {
  className?: string;
}

export function Fab({ className = "" }: FabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [modalEventType, setModalEventType] = useState<
    "GOAL" | "PROJECT" | "TASK" | "HABIT" | null
  >(null);
  const [showNote, setShowNote] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [menuPage, setMenuPage] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const getMenuBackground = () => {
    const progress = menuPage === 1 ? 1 - swipeProgress : swipeProgress;
    const start = [55, 65, 81]; // gray-700
    const end = [0, 0, 0]; // black
    const r = start[0] + (end[0] - start[0]) * progress;
    const g = start[1] + (end[1] - start[1]) * progress;
    const b = start[2] + (end[2] - start[2]) * progress;
    return `rgb(${r}, ${g}, ${b})`;
  };

  const addEvents = [
    {
      label: "GOAL",
      eventType: "GOAL" as const,
      color: "hover:bg-gray-600",
    },
    {
      label: "PROJECT",
      eventType: "PROJECT" as const,
      color: "hover:bg-gray-600",
    },
    {
      label: "TASK",
      eventType: "TASK" as const,
      color: "hover:bg-gray-600",
    },
    {
      label: "HABIT",
      eventType: "HABIT" as const,
      color: "hover:bg-gray-600",
    },
  ];

  const extraEvents = [
    { label: "SERVICE" },
    { label: "PRODUCT" },
    { label: "REQUEST" },
    { label: "NOTE" },
  ];

  const menuVariants = {
    closed: {
      opacity: 0,
      scale: 0.8,
      y: 20,
      transition: { type: "tween", ease: "easeIn", duration: 0.1 },
    },
    open: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: "tween",
        ease: "easeOut",
        duration: 0.2,
        staggerChildren: 0.05,
        delayChildren: 0.05,
      },
    },
  } as const;

  const itemVariants = {
    closed: {
      opacity: 0,
      y: 20,
      transition: { type: "tween", ease: "easeIn", duration: 0.15 },
    },
    open: {
      opacity: 1,
      y: 0,
      transition: { type: "tween", ease: "easeOut", duration: 0.15 },
    },
  } as const;

  const handleEventClick = (
    eventType: "GOAL" | "PROJECT" | "TASK" | "HABIT"
  ) => {
    setIsOpen(false);
    setModalEventType(eventType);
  };

  const handleExtraClick = (label: string) => {
    setIsOpen(false);
    if (label === "NOTE") {
      setShowNote(true);
    } else {
      setComingSoon(label);
    }
  };

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setSwipeProgress(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX;
    if (menuPage === 0 && diff < 0) {
      setSwipeProgress(Math.min(-diff / 100, 1));
    } else if (menuPage === 1 && diff > 0) {
      setSwipeProgress(Math.min(diff / 100, 1));
    } else {
      setSwipeProgress(0);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX;
    if (diff < -50) setMenuPage(1);
    if (diff > 50) setMenuPage(0);
    setSwipeProgress(0);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={className}>
      {/* AddEvents Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 mb-2 z-50 border border-gray-700 rounded-lg shadow-2xl overflow-hidden min-w-[200px]"
            style={{
              backgroundColor: getMenuBackground(),
              transition: "background-color 0.1s linear",
              transformOrigin: "bottom center",
            }}
            variants={menuVariants}
            initial="closed"
            animate="open"
            exit="closed"
          >
            {menuPage === 0
              ? addEvents.map((event) => (
                  <motion.button
                    key={event.label}
                    variants={itemVariants}
                    onClick={() => handleEventClick(event.eventType)}
                    className={`w-full px-6 py-3 text-left text-white font-medium transition-all duration-200 border-b border-gray-700 last:border-b-0 hover:scale-105 whitespace-nowrap ${event.color}`}
                  >
                    <span className="text-sm opacity-80">add</span>{" "}
                    <span className="text-lg font-bold">{event.label}</span>
                  </motion.button>
                ))
              : extraEvents.map((event) => (
                  <motion.button
                    key={event.label}
                    variants={itemVariants}
                    onClick={() => handleExtraClick(event.label)}
                    className="w-full px-6 py-3 text-left text-white font-medium transition-all duration-200 border-b border-gray-700 last:border-b-0 hover:bg-gray-800 hover:scale-105 whitespace-nowrap"
                  >
                    <span className="text-sm opacity-80">add</span>{" "}
                    <span className="text-lg font-bold">{event.label}</span>
                  </motion.button>
                ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB Button - Restored to your original styling */}
      <button
        ref={buttonRef}
        onClick={toggleMenu}
        aria-label={isOpen ? "Close add events menu" : "Add new item"}
        className={`flex items-center justify-center h-14 w-14 rounded-full bg-gradient-to-br from-gray-900 to-black text-gray-300 drop-shadow-lg hover:scale-110 transition ${
          isOpen ? "rotate-45" : ""
        }`}
      >
        {isOpen ? (
          <X className="h-8 w-8" aria-hidden="true" />
        ) : (
          <Plus className="h-8 w-8" aria-hidden="true" />
        )}
      </button>

      {/* Event Creation Modal */}
      <EventModal
        isOpen={modalEventType !== null}
        onClose={() => setModalEventType(null)}
        eventType={modalEventType!}
      />
      <NoteModal isOpen={showNote} onClose={() => setShowNote(false)} />
      <ComingSoonModal
        isOpen={comingSoon !== null}
        onClose={() => setComingSoon(null)}
        label={comingSoon || ""}
      />
    </div>
  );
}
