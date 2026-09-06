"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import MonumentGridWithSharedTransition, {
  type Monument as MonumentCard,
} from "@/components/MonumentGridWithSharedTransition";
import {
  MonumentsList,
  type MonumentsListHandle,
} from "@/components/monuments/MonumentsList";
import { AddMonumentDialog } from "@/components/monuments/AddMonumentDialog";
import { MAX_MONUMENTS } from "@/lib/monuments/constants";

export type MonumentContainerHandle = {
  refresh: () => Promise<void>;
};

type MonumentContainerProps = {
  embedded?: boolean;
  paginated?: boolean;
  pageSize?: number;
};

export const MonumentContainer = forwardRef<
  MonumentContainerHandle,
  MonumentContainerProps
>(function MonumentContainer(
  {
    embedded = false,
    paginated = false,
    pageSize = 8,
  },
  ref
) {
  const monumentsListRef = useRef<MonumentsListHandle | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      refresh: async () => {
        await monumentsListRef.current?.refresh();
      },
    }),
    [],
  );

  const monumentContent = (
    <MonumentsList
      ref={monumentsListRef}
      limit={MAX_MONUMENTS}
      createHref="/monuments/new"
      renderEmptyChildren
    >
      {(monuments, saveMonumentOrder) => {
        const canAddMonument = monuments.length < MAX_MONUMENTS;
        const monumentCards = monuments.map<MonumentCard>((m) => ({
          id: m.id,
          emoji: m.emoji ?? null,
          title: m.title,
          stats: `${m.goalCount} Goal${m.goalCount === 1 ? "" : "s"}`,
        }));

        if (embedded && paginated) {
          const safePageSize = Math.max(1, pageSize);
          const pages: MonumentCard[][] = [];

          for (
            let start = 0;
            start < monumentCards.length;
            start += safePageSize
          ) {
            pages.push(monumentCards.slice(start, start + safePageSize));
          }

          if (pages.length === 0) {
            pages.push([]);
          }

          return (
            <>
              {pages.map((pageMonuments, pageIndex) => {
                const pageStartIndex = pageIndex * safePageSize;
                const isLastPage = pageIndex === pages.length - 1;
                const canShowNewCard =
                  isLastPage &&
                  canAddMonument &&
                  pageMonuments.length < safePageSize;

                const handlePageReorder = async (pageIds: string[]) => {
                  const fullIds = monuments.map((monument) => monument.id);

                  fullIds.splice(
                    pageStartIndex,
                    pageMonuments.length,
                    ...pageIds
                  );

                  await saveMonumentOrder(fullIds);
                };

                return (
                  <div
                    key={`monument-page-${pageIndex}`}
                    className="w-full shrink-0 snap-start"
                  >
                    <div className="app-dashboard-monuments-panel px-4">
                      <MonumentGridWithSharedTransition
                        monuments={pageMonuments}
                        showNewCard={canShowNewCard}
                        onReorder={handlePageReorder}
                      />
                    </div>
                  </div>
                );
              })}

              {canAddMonument ? <AddMonumentDialog /> : null}
            </>
          );
        }

        return (
          <div className="app-dashboard-monuments-panel px-4">
            <MonumentGridWithSharedTransition
              monuments={monumentCards}
              showNewCard={canAddMonument}
              onReorder={saveMonumentOrder}
            />
            {canAddMonument && <AddMonumentDialog />}
          </div>
        );
      }}
    </MonumentsList>
  );

  if (embedded) {
    return monumentContent;
  }

  return (
    <section className="section app-dashboard-section mt-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="h-label block">Monuments</h2>
      </div>

      {monumentContent}
    </section>
  );
});
