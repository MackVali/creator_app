"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { EventModal } from "./EventModal";

interface FabProps {
  className?: string;
}

export function Fab({ className = "" }: FabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [modalEventType, setModalEventType] = useState<
    "GOAL" | "PROJECT" | "TASK" | "HABIT" | null
  >(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const addEvents = [
    {
      label: "GOAL",
      eventType: "GOAL" as const,
      color: "bg-gray-700 hover:bg-gray-600",
    },
    {
      label: "PROJECT",
      eventType: "PROJECT" as const,
      color: "bg-gray-700 hover:bg-gray-600",
    },
    {
      label: "TASK",
      eventType: "TASK" as const,
      color: "bg-gray-700 hover:bg-gray-600",
    },
    {
      label: "HABIT",
      eventType: "HABIT" as const,
      color: "bg-gray-700 hover:bg-gray-600",
    },
  ];

  const handleEventClick = (
    eventType: "GOAL" | "PROJECT" | "TASK" | "HABIT"
  ) => {
    setIsOpen(false);
    setModalEventType(eventType);
  };

  const toggleMenu = () => {
    setIsOpen(!isOpen);
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
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div
            ref={menuRef}
            className="bg-gray-900/80 border border-gray-700 rounded-lg shadow-2xl overflow-hidden min-w-[200px]"
          >
            {addEvents.map((event, index) => (
              <button
                key={event.label}
                onClick={() => handleEventClick(event.eventType)}
                className={`w-full px-6 py-3 text-left text-white font-medium transition-all duration-200 border-b border-gray-700 last:border-b-0 hover:bg-gray-800 hover:scale-105 whitespace-nowrap ${event.color}`}
                style={{
                  animationDelay: `${index * 50}ms`,
                  transform: `translateY(${isOpen ? "0" : "20px"})`,
                  opacity: isOpen ? 1 : 0,
                  transition: `all 0.2s ease ${index * 50}ms`,
                }}
              >
                <span className="text-sm opacity-80">add</span>{" "}
                <span className="text-lg font-bold">{event.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
    </div>
  );
}
