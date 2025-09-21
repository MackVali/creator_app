"use client";

import Link from "next/link";
import MonumentGridWithSharedTransition, {
  type Monument as MonumentCard,
} from "@/components/MonumentGridWithSharedTransition";
import { MonumentsList } from "@/components/monuments/MonumentsList";
import { Section } from "@/components/ui/Section";

interface MonumentContainerProps {
  tone?: "plain" | "frosted";
}

export function MonumentContainer({ tone = "plain" }: MonumentContainerProps) {
  return (
    <Section
      tone={tone}
      title={
        <Link href="/monuments" className="block">
          Monuments
        </Link>
      }
      className="mt-2"
    >
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
    </Section>
  );
}

