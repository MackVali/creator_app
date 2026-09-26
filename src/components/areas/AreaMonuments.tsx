"use client";

import { Plus } from "lucide-react";
import MonumentGridWithSharedTransition, {
  type Monument as MonumentCard,
} from "@/components/MonumentGridWithSharedTransition";
import { MonumentsList } from "@/components/monuments/MonumentsList";
import { AddMonumentDialog } from "@/components/monuments/AddMonumentDialog";

export function AreaMonuments({
  areaId,
  areaLabel,
}: {
  areaId: string;
  areaLabel: string;
}) {
  return (
    <section className="w-full">
      <MonumentsList areaId={areaId} renderEmptyChildren>
        {(monuments) => {
          return (
            <>
              <div className="mb-1.5 flex items-center justify-between px-2.5 sm:mb-3 sm:px-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
                  Monuments
                </p>

                <AddMonumentDialog
                  defaultAreaId={areaId}
                  trigger={
                    <button
                      type="button"
                      aria-label={`Add Monument to ${areaLabel}`}
                      className="inline-flex h-6 w-6 items-center justify-center text-white/55 transition hover:text-white focus-visible:outline-none active:scale-95 sm:h-7 sm:w-7"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  }
                />
              </div>

              {monuments.length > 0 ? (
                <div className="app-dashboard-areas-panelpx-2.5 sm:px-4">
                  <MonumentGridWithSharedTransition
                    monuments={monuments.map<MonumentCard>((monument) => ({
                      id: monument.id,
                      emoji: monument.emoji ?? null,
                      title: monument.title,
                      stats: `${monument.goalCount} Goal${
                        monument.goalCount === 1 ? "" : "s"
                      }`,
                    }))}
                    showNewCard={false}
                  />
                </div>
              ) : null}
            </>
          );
        }}
      </MonumentsList>
    </section>
  );
}
