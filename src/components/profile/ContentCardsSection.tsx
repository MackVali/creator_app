"use client";

import { ProfileModuleLinkCards } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ContentCardTile } from "@/components/profile/modules/ProfileModules";

interface ContentCardsSectionProps {
  module: ProfileModuleLinkCards;
}

export function ContentCardsSection({ module }: ContentCardsSectionProps) {
  const activeCards = module.cards.filter((card) => card.is_active !== false);

  if (activeCards.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="grid grid-cols-2 gap-4">
        {activeCards.map((card) => {
          const isMedium = (card.size ?? "small") === "medium";
          return (
            <ContentCardTile
              key={card.id}
              card={card}
              module={module}
              className={cn(isMedium && "col-span-2")}
            />
          );
        })}
      </div>
    </section>
  );
}
