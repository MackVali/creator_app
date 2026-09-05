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
    <section className="w-full overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0D0E11] shadow-[0_24px_70px_-52px_rgba(0,0,0,0.86),inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-1px_0_rgba(0,0,0,0.48)]">
      <MonumentsList areaId={areaId} renderEmptyChildren>
        {(monuments) => {
          const canAddMonument = monuments.length < monumentLimit;

          return (
            <>
              <div className="flex items-center justify-between px-4 pb-2 pt-3.5 sm:px-5 sm:pt-4">
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
                        className="inline-flex h-7 w-7 items-center justify-center text-white/55 transition hover:text-white focus-visible:outline-none active:scale-95"
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

              <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                {monuments.length > 0 ? (
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
                ) : (
                  <div className="flex min-h-[58px] items-center rounded-2xl border border-white/[0.055] bg-white/[0.018] px-3.5">
                    <p className="text-xs text-white/35">
                      No monuments in {areaLabel} yet.
                    </p>
                  </div>
                )}
              </div>
            </>
          );
        }}
      </MonumentsList>
    </section>
  );
}
