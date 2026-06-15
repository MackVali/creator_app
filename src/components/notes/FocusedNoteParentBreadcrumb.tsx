"use client";

import { ChevronLeft } from "lucide-react";

type FocusedNoteParentBreadcrumbProps = {
  icon: string;
  name: string;
  onBack: () => void;
};

export function FocusedNoteParentBreadcrumb({
  icon,
  name,
  onBack,
}: FocusedNoteParentBreadcrumbProps) {
  const trimmedIcon = icon.trim();
  const trimmedName = name.trim();
  const hasImageIcon = /^https?:\/\//i.test(trimmedIcon);

  return (
    <div className="flex h-6 items-center">
      <button
        type="button"
        onClick={onBack}
        aria-label={`Back to ${trimmedName}`}
        className="-ml-1 inline-flex min-w-0 items-center gap-1.5 rounded-full pr-2 text-white/46 outline-none transition hover:bg-white/[0.055] hover:text-white/76 focus-visible:ring-1 focus-visible:ring-white/24"
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </span>
        {hasImageIcon ? (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 rounded-[3px] object-cover"
            style={{
              backgroundImage: `url(${trimmedIcon})`,
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
            }}
          />
        ) : (
          <span className="shrink-0 text-xs leading-none" aria-hidden="true">
            {trimmedIcon}
          </span>
        )}
        <span className="min-w-0 truncate text-xs font-medium leading-none text-white/38">
          {trimmedName}
        </span>
      </button>
    </div>
  );
}
