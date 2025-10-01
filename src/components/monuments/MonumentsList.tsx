"use client";

import { type ReactNode } from "react";
import { MonumentsEmptyState } from "@/components/ui/empty-state";

export interface Monument {
  id: string;
  title: string;
  emoji: string | null;
}

interface MonumentsListProps {
  monuments: Monument[];
  createHref?: string;
  children?: (monuments: Monument[]) => ReactNode;
}

export function MonumentsList({
  monuments,
  createHref = "/monuments/new",
  children,
}: MonumentsListProps) {
  if (monuments.length === 0) {
    return <MonumentsEmptyState createHref={createHref} />;
  }

  if (children) {
    return <>{children(monuments)}</>;
  }

  return (
    <ul className="space-y-3">
      {monuments.map((m) => (
        <li
          key={m.id}
          className="card flex items-center gap-3 p-3"
          style={{ borderRadius: "var(--radius-sm)" }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-2xl">
            {m.emoji || "\uD83C\uDFDB\uFE0F"}
          </div>
          <p className="flex-1 truncate font-medium">{m.title}</p>
        </li>
      ))}
    </ul>
  );
}

export default MonumentsList;

