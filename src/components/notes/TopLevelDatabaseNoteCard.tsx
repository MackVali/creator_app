"use client";

import Link from "next/link";
import { ArrowUpRight, Table2 } from "lucide-react";

import type { TopLevelDatabaseNoteDisplay } from "@/lib/topLevelDatabaseNotes";
import { cn } from "@/lib/utils";

type TopLevelDatabaseNoteCardProps = {
  href: string;
  database: TopLevelDatabaseNoteDisplay;
  className: string;
};

export function TopLevelDatabaseNoteCard({
  href,
  database,
  className,
}: TopLevelDatabaseNoteCardProps) {
  return (
    <Link
      href={href}
      aria-label={`Open database ${database.title}`}
      className={cn(
        className,
        "border-emerald-200/20 bg-[radial-gradient(circle_at_0%_0%,rgba(16,185,129,0.16),transparent_58%),linear-gradient(140deg,rgba(5,7,8,0.98)_0%,rgba(10,18,16,0.96)_48%,rgba(26,43,39,0.72)_100%)]",
      )}
    >
      <div className="relative z-[2] flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        <div className="flex w-full min-w-0 flex-col items-center justify-center gap-1.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-100/15 bg-emerald-100/[0.06] text-emerald-100 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)] sm:h-10 sm:w-10">
            <Table2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
          </div>
          <div className="flex w-full min-w-0 items-center justify-center">
            <span
              className="line-clamp-2 w-full min-w-0 break-words px-0.5 text-center text-[9px] font-semibold leading-tight text-white whitespace-normal sm:text-[10px]"
              style={{ hyphens: "auto" }}
            >
              {database.title}
            </span>
          </div>
          <span className="max-w-full truncate rounded-full border border-emerald-100/[0.1] bg-emerald-100/[0.045] px-1.5 py-0.5 text-[8px] font-semibold leading-none text-emerald-50/58 sm:text-[9px]">
            {database.entryCount} row{database.entryCount === 1 ? "" : "s"} /{" "}
            {database.fieldCount} field{database.fieldCount === 1 ? "" : "s"}
          </span>
          <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/[0.08] bg-black/20 px-1.5 py-0.5 text-[8px] font-semibold leading-none text-white/58 sm:text-[9px]">
            Open
            <ArrowUpRight className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}
