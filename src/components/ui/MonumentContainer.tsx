"use client";

import Link from "next/link";
import MonumentGridWithSharedTransition, {
  type Monument as MonumentCard,
} from "@/components/MonumentGridWithSharedTransition";
import { MonumentsList } from "@/components/monuments/MonumentsList";

export function MonumentContainer() {
  return (
    <section className="section mt-2">
      <div className="mb-3">
        <Link href="/monuments" className="h-label block">
          Monuments
        </Link>
      </div>

      <MonumentsList limit={8} createHref="/monuments/new">
        {(monuments) => (
          <div className="px-4">
            <MonumentGridWithSharedTransition
              monuments={monuments.map<MonumentCard>((m) => ({
                id: m.id,
                emoji: m.emoji || "\uD83C\uDFDB\uFE0F",
                title: m.title,
                stats: "0 Goals",
              }))}
            />
          </div>
        )}
      </MonumentsList>
    </section>
  );
}

