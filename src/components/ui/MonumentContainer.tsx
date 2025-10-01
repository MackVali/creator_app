import Link from "next/link";
import MonumentGridWithSharedTransition, {
  type Monument as MonumentCard,
} from "@/components/MonumentGridWithSharedTransition";
import {
  MonumentsList,
  type Monument,
} from "@/components/monuments/MonumentsList";

interface MonumentContainerProps {
  monuments: Monument[];
}

export function MonumentContainer({ monuments }: MonumentContainerProps) {
  return (
    <section className="section mt-2">
      <div className="mb-3">
        <Link href="/monuments" className="h-label block">
          Monuments
        </Link>
      </div>

      <MonumentsList monuments={monuments} createHref="/monuments/new">
        {(items) => (
          <div className="px-4">
            <MonumentGridWithSharedTransition
              monuments={items.map<MonumentCard>((m) => ({
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

