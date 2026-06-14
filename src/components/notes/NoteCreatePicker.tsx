"use client";

import { useEffect, useRef, useState } from "react";
import { Database, LayoutTemplate, NotebookPen, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

type NoteCreatePickerProps = {
  label: string;
  className: string;
  innerClassName: string;
  onCreateNote: () => void;
  onCreateDatabase: () => void | Promise<void>;
};

export function NoteCreatePicker({
  label,
  className,
  innerClassName,
  onCreateNote,
  onCreateDatabase,
}: NoteCreatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreatingDatabase, setIsCreatingDatabase] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: Event) {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  async function handleDatabaseClick() {
    setIsCreatingDatabase(true);
    try {
      await onCreateDatabase();
      setIsOpen(false);
    } finally {
      setIsCreatingDatabase(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className={cn(innerClassName, "w-full min-w-0")}>
          <div className="flex w-full min-w-0 flex-col items-center justify-center gap-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-500 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)] sm:h-10 sm:w-10">
              <Plus className="h-3.5 w-3.5 text-zinc-500 sm:h-4 sm:w-4" aria-hidden="true" />
            </div>
            <div className="flex w-full min-w-0 items-center justify-center">
              <span
                className="line-clamp-3 w-full min-w-0 break-words px-0.5 text-center text-[9px] font-semibold leading-tight text-white whitespace-normal sm:text-[10px]"
                style={{ hyphens: "auto" }}
              >
                {label}
              </span>
            </div>
          </div>
        </div>
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Create note item"
          className="absolute left-1/2 top-1/2 z-30 h-[8.75rem] w-[8.75rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.08] bg-[#050608]/92 shadow-[0_22px_46px_-24px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
        >
          <button
            type="button"
            role="menuitem"
            title="Create note"
            aria-label="Create note"
            onClick={() => {
              setIsOpen(false);
              onCreateNote();
            }}
            className="absolute left-1/2 top-2 flex h-12 w-12 -translate-x-1/2 flex-col items-center justify-center rounded-full border border-white/[0.13] bg-[#121419] text-white shadow-[0_10px_22px_-14px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-white/25 hover:bg-[#191c22] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            <NotebookPen className="h-4 w-4" aria-hidden="true" />
            <span className="mt-0.5 text-[8px] font-semibold leading-none">Note</span>
          </button>

          <button
            type="button"
            role="menuitem"
            title="Create database"
            aria-label="Create database"
            disabled={isCreatingDatabase}
            onClick={handleDatabaseClick}
            className="absolute bottom-3 left-3 flex h-12 w-12 flex-col items-center justify-center rounded-full border border-emerald-200/[0.16] bg-[#0d1714] text-emerald-100 shadow-[0_10px_22px_-14px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.07)] transition hover:border-emerald-100/30 hover:bg-[#11201b] disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-100/70"
          >
            <Database className="h-4 w-4" aria-hidden="true" />
            <span className="mt-0.5 text-[8px] font-semibold leading-none">DB</span>
          </button>

          <button
            type="button"
            role="menuitem"
            title="Template unavailable"
            aria-label="Template unavailable"
            disabled
            className="absolute bottom-3 right-3 flex h-12 w-12 cursor-not-allowed flex-col items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.035] text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
            <span className="mt-0.5 text-[8px] font-semibold leading-none">Tpl</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
