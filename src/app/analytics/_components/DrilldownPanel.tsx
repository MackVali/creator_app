"use client";

import { useEffect, ReactNode } from "react";
import { X } from "lucide-react";

interface DrilldownPanelProps {
  title: string;
  content: ReactNode;
  onClose: () => void;
}

export function DrilldownPanel({
  title,
  content,
  onClose,
}: DrilldownPanelProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if ((event.target as Element)?.id === "drilldown-overlay") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("click", handleClickOutside);

    // Focus trap
    const focusableElements = document.querySelectorAll(
      "#drilldown-panel [tabindex], #drilldown-panel button, #drilldown-panel input, #drilldown-panel select, #drilldown-panel textarea"
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[
      focusableElements.length - 1
    ] as HTMLElement;

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleTabKey);
    firstElement?.focus();

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleTabKey);
    };
  }, [onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        id="drilldown-overlay"
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        id="drilldown-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drilldown-title"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[78vh] w-full overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl md:top-0 md:right-0 md:left-auto md:h-full md:max-h-none md:max-w-md md:rounded-none md:rounded-l-2xl md:border-l md:border-t-0 md:p-6"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-zinc-800 md:hidden" />
        <div className="flex items-center justify-between">
          <h3 id="drilldown-title" className="text-lg font-semibold text-white">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white"
            aria-label="Close drilldown panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">{content}</div>
      </div>
    </>
  );
}
