"use client";

import { useState, useEffect, useRef, type HTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import { EventModal } from "./EventModal";
import { NoteModal } from "./NoteModal";
import { ComingSoonModal } from "./ComingSoonModal";
import { PostModal } from "./PostModal";
import { cn } from "@/lib/utils";

interface FabProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  menuVariant?: "default" | "timeline";
  swipeUpToOpen?: boolean;
}

export function Fab({
  className = "",
  menuVariant = "default",
  swipeUpToOpen = false,
  ...wrapperProps
}: FabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [modalEventType, setModalEventType] = useState<
    "GOAL" | "PROJECT" | "TASK" | "HABIT" | null
  >(null);
  const [showNote, setShowNote] = useState(false);
  const [showPost, setShowPost] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [menuPage, setMenuPage] = useState(0);
  const [menuSection, setMenuSection] = useState<"content" | "blank">(
    "content"
  );
  const [touchStartX, setTouchStartX] = useState(0);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const skipClickRef = useRef(false);
  const router = useRouter();
  const VERTICAL_WHEEL_TRIGGER = 20;
  const HORIZONTAL_WHEEL_TRIGGER = 10;

  const clampColorValue = (value: number) => Math.min(255, Math.max(0, value));

  const getMenuBackgroundStyles = () => {
    const progress = menuPage === 1 ? 1 - swipeProgress : swipeProgress;
    const start = [55, 65, 81]; // gray-700
    const end = [0, 0, 0]; // black
    const r = start[0] + (end[0] - start[0]) * progress;
    const g = start[1] + (end[1] - start[1]) * progress;
    const b = start[2] + (end[2] - start[2]) * progress;

    const highlight = [
      clampColorValue(r + 35),
      clampColorValue(g + 35),
      clampColorValue(b + 35),
    ];
    const lowlight = [
      clampColorValue(r - 25),
      clampColorValue(g - 25),
      clampColorValue(b - 25),
    ];

    return {
      backgroundImage: `radial-gradient(circle at top, rgba(${highlight[0]}, ${highlight[1]}, ${highlight[2]}, 0.65), rgba(${r}, ${g}, ${b}, 0.1) 45%), linear-gradient(160deg, rgba(${highlight[0]}, ${highlight[1]}, ${highlight[2]}, 0.95) 0%, rgba(${r}, ${g}, ${b}, 0.97) 50%, rgba(${lowlight[0]}, ${lowlight[1]}, ${lowlight[2]}, 0.98) 100%)`,
      boxShadow:
        "0 18px 36px rgba(15, 23, 42, 0.55), 0 8px 18px rgba(15, 23, 42, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      borderColor: `rgba(${highlight[0]}, ${highlight[1]}, ${highlight[2]}, 0.35)`,
    };
  };

  const menuConfigs = {
    default: {
      primary: [
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
      ],
      secondary: [
        { label: "SERVICE" },
        { label: "PRODUCT" },
        { label: "POST" },
        { label: "NOTE" },
      ],
      menuClassName: "left-1/2 -translate-x-1/2",
      itemAlignmentClass: "text-left",
    },
    timeline: {
      primary: [
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
      ],
      secondary: [
        { label: "NOTE" },
        { label: "POST" },
        { label: "SERVICE" },
        { label: "PRODUCT" },
      ],
      menuClassName: "right-0 origin-bottom-right text-left",
      itemAlignmentClass: "text-left",
    },
  } as const;

  const { primary, secondary, menuClassName, itemAlignmentClass } =
    menuConfigs[menuVariant];

  const menuVariants = {
    closed: {
      opacity: 0,
      clipPath: "inset(100% 0% 0% 0%)",
      transition: { type: "tween", ease: "easeInOut", duration: 0.2 },
    },
    open: {
      opacity: 1,
      clipPath: "inset(0% 0% 0% 0%)",
      transition: {
        type: "tween",
        ease: "easeOut",
        duration: 0.25,
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  } as const;

  const itemVariants = {
    closed: {
      opacity: 0,
      y: 10,
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
    } else if (label === "POST") {
      setShowPost(true);
    } else if (label === "SERVICE" || label === "PRODUCT") {
      router.push(`/source?create=${label.toLowerCase()}`);
    } else {
      setComingSoon(label);
    }
  };

  const toggleMenu = () => {
    setIsOpen(prev => !prev);
  };

  const handleFabButtonClick = () => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    toggleMenu();
  };

  const interpretWheelGesture = (deltaY: number) => {
    if (deltaY < -VERTICAL_WHEEL_TRIGGER) {
      setIsOpen(true);
      return true;
    }
    return false;
  };

  const handleFabButtonTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
    if (!swipeUpToOpen) return;
    setTouchStartY(event.touches[0].clientY);
  };

  const handleFabButtonTouchEnd = (event: React.TouchEvent<HTMLButtonElement>) => {
    if (!swipeUpToOpen || touchStartY === null) return;
    const diffY = event.changedTouches[0].clientY - touchStartY;
    setTouchStartY(null);
    if (diffY < -40) {
      if (isOpen) {
        setMenuSection("blank");
      } else {
        setIsOpen(true);
      }
      skipClickRef.current = true;
    }
  };

  const handleFabButtonTouchCancel = () => {
    if (!swipeUpToOpen) return;
    setTouchStartY(null);
  };

  const handleFabButtonWheel = (event: React.WheelEvent<HTMLButtonElement>) => {
    if (isOpen) {
      if (
        Math.abs(event.deltaY) >= VERTICAL_WHEEL_TRIGGER &&
        menuSection === "content" &&
        event.deltaY < 0
      ) {
        setMenuSection("blank");
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (!swipeUpToOpen) return;
    if (interpretWheelGesture(event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleHorizontalMenuWheel = (
    deltaX: number,
    deltaY: number,
    shiftKey: boolean
  ) => {
    if (menuSection !== "content") return false;
    let horizontalDelta = deltaX;
    if (horizontalDelta === 0 && shiftKey) {
      horizontalDelta = deltaY;
    }
    if (Math.abs(horizontalDelta) < HORIZONTAL_WHEEL_TRIGGER) return false;
    if (horizontalDelta < 0 && menuPage === 0) {
      setMenuPage(1);
      return true;
    }
    if (horizontalDelta > 0 && menuPage === 1) {
      setMenuPage(0);
      return true;
    }
    return false;
  };

  const handleMenuWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const handledHorizontal = handleHorizontalMenuWheel(
      event.deltaX,
      event.deltaY,
      event.shiftKey
    );
    if (handledHorizontal) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (Math.abs(event.deltaY) >= VERTICAL_WHEEL_TRIGGER) {
      if (event.deltaY < 0 && menuSection === "content") {
        setMenuSection("blank");
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.deltaY > 0 && menuSection === "blank") {
        setMenuSection("content");
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (!swipeUpToOpen) return;
    if (interpretWheelGesture(event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setMenuSection("content");
      setMenuPage(0);
    }
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (menuSection !== "content") return;
    setTouchStartX(e.touches[0].clientX);
    setSwipeProgress(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (menuSection !== "content") return;
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
    if (menuSection !== "content") return;
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
    <div className={cn("relative", className)} {...wrapperProps}>
      {/* AddEvents Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={cn(
              "absolute bottom-20 mb-2 z-50 min-w-[200px] border rounded-lg shadow-2xl overflow-hidden",
              menuClassName
            )}
            style={{
              ...getMenuBackgroundStyles(),
              transition: "background-image 0.1s linear, border-color 0.1s linear",
              transformOrigin:
                menuVariant === "timeline" ? "bottom right" : "bottom center",
            }}
            variants={menuVariants}
            initial="closed"
            animate="open"
            exit="closed"
            onWheel={handleMenuWheel}
          >
            {menuSection === "blank" ? (
              <div className="w-full min-h-[210px]" aria-hidden="true" />
            ) : menuPage === 0 ? (
              primary.map((event) => (
                <motion.button
                  key={event.label}
                  variants={itemVariants}
                  onClick={() => handleEventClick(event.eventType)}
                  className={cn(
                    "w-full px-6 py-3 text-white font-medium transition-colors duration-200 border-b border-gray-700 last:border-b-0 whitespace-nowrap",
                    itemAlignmentClass,
                    event.color
                  )}
                >
                  <span className="text-sm opacity-80">add</span>{" "}
                  <span className="text-lg font-bold">{event.label}</span>
                </motion.button>
              ))
            ) : (
              secondary.map((event) => (
                <motion.button
                  key={event.label}
                  variants={itemVariants}
                  onClick={() => handleExtraClick(event.label)}
                  className={cn(
                    "w-full px-6 py-3 text-white font-medium transition-colors duration-200 border-b border-gray-700 last:border-b-0 hover:bg-gray-800 whitespace-nowrap",
                    itemAlignmentClass
                  )}
                >
                  <span className="text-sm opacity-80">add</span>{" "}
                  <span className="text-lg font-bold">{event.label}</span>
                </motion.button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB Button - Restored to your original styling */}
      <motion.button
        ref={buttonRef}
        onClick={handleFabButtonClick}
        aria-label={isOpen ? "Close add events menu" : "Add new item"}
        className={`relative flex items-center justify-center h-14 w-14 rounded-full text-white shadow-lg hover:scale-110 transition ${
          isOpen ? "rotate-45" : ""
        }`}
        onTouchStart={handleFabButtonTouchStart}
        onTouchEnd={handleFabButtonTouchEnd}
        onTouchCancel={handleFabButtonTouchCancel}
        onWheel={handleFabButtonWheel}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        style={{
          background:
            "linear-gradient(145deg, rgba(75, 85, 99, 0.95) 0%, rgba(31, 41, 55, 0.98) 55%, rgba(15, 23, 42, 1) 100%)",
          boxShadow:
            "0 18px 36px rgba(15, 23, 42, 0.55), 0 8px 18px rgba(15, 23, 42, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
        }}
      >
        {isOpen ? (
          <X className="h-8 w-8" aria-hidden="true" />
        ) : (
          <Plus className="h-8 w-8" aria-hidden="true" />
        )}
      </motion.button>

      {/* Event Creation Modal */}
      <EventModal
        isOpen={modalEventType !== null}
        onClose={() => setModalEventType(null)}
        eventType={modalEventType!}
      />
      <NoteModal isOpen={showNote} onClose={() => setShowNote(false)} />
      <PostModal isOpen={showPost} onClose={() => setShowPost(false)} />
      <ComingSoonModal
        isOpen={comingSoon !== null}
        onClose={() => setComingSoon(null)}
        label={comingSoon || ""}
      />
    </div>
  );
}
