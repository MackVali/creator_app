"use client";

import Link from "next/link";
import MonumentGridWithSharedTransition, {
  type Monument as MonumentCard,
} from "@/components/MonumentGridWithSharedTransition";
import { MonumentsList } from "@/components/monuments/MonumentsList";
import { AddMonumentDialog } from "@/components/monuments/AddMonumentDialog";

export function MonumentContainer() {
  return (
    <section className="section mt-2">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/monuments" className="h-label block">
          Monuments
        </Link>
      </div>

      <MonumentsList limit={8} createHref="/monuments/new" renderEmptyChildren>
        {(monuments) => (
          <div className="px-4">
            <MonumentGridWithSharedTransition
              monuments={monuments.map<MonumentCard>((m) => ({
                id: m.id,
                emoji: m.emoji ?? null,
                title: m.title,
                stats: `${m.goalCount} Goal${m.goalCount === 1 ? "" : "s"}`,
              }))}
            />
          </div>
        )}
      </MonumentsList>

      <AddMonumentDialog />
    </section>
  );
}
