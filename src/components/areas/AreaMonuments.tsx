"use client";

import { Plus } from "lucide-react";
import MonumentGridWithSharedTransition, {
  type Monument as MonumentCard,
} from "@/components/MonumentGridWithSharedTransition";
import { MonumentsList } from "@/components/monuments/MonumentsList";
import { AddMonumentDialog } from "@/components/monuments/AddMonumentDialog";
import { useEntitlement } from "@/components/entitlement/EntitlementProvider";
import { getMaxMonumentsPerArea } from "@/lib/monuments/constants";

export function AreaMonuments({
  areaId,
  areaLabel,
}: {
  areaId: string;
  areaLabel: string;
}) {
  const { isPlus } = useEntitlement();
  const monumentLimit = getMaxMonumentsPerArea(isPlus);

  return (
    <section className="w-full">
      <MonumentsList areaId={areaId} renderEmptyChildren>
        {(monuments) => {
          const canAddMonument = monuments.length < monumentLimit;

          return (
            <>
              <div className="mb-1.5 flex items-center justify-between px-2.5 sm:mb-3 sm:px-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
                  Monuments
                </p>

                {canAddMonument ? (
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
                ) : (
                  <span className="text-[10px] font-medium text-white/25">
                    {monuments.length}/{monumentLimit}
                  </span>
                )}
              </div>

              {monuments.length > 0 ? (
                <div className="app-dashboard-areas-panel px-2.5 sm:px-4">
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
                    density="compact"
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
