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
import { Skeleton } from "@/components/ui/skeleton";
import { buildEmbeddedMonumentPages } from "@/components/ui/monumentPagination";

export type MonumentContainerHandle = {
  refresh: () => Promise<void>;
};

type MonumentContainerProps = {
  embedded?: boolean;
  paginated?: boolean;
  pageSize?: number;
  onEmbeddedPageRef?: (pageIndex: number, node: HTMLDivElement | null) => void;
};

export const MonumentContainer = forwardRef<
  MonumentContainerHandle,
  MonumentContainerProps
>(function MonumentContainer(
  {
    embedded = false,
    paginated = false,
    pageSize = 8,
    onEmbeddedPageRef,
  },
  ref
) {
  const monumentsListRef = useRef<MonumentsListHandle | null>(null);
  const onEmbeddedPageRefRef = useRef(onEmbeddedPageRef);
  const embeddedPageRefCallbacks = useRef<
    Map<number, (node: HTMLDivElement | null) => void>
  >(new Map());

  onEmbeddedPageRefRef.current = onEmbeddedPageRef;

  const getEmbeddedPageRef = (pageIndex: number) => {
    const existingCallback = embeddedPageRefCallbacks.current.get(pageIndex);

    if (existingCallback) {
      return existingCallback;
    }

    const nextCallback = (node: HTMLDivElement | null) => {
      onEmbeddedPageRefRef.current?.(pageIndex, node);
    };

    embeddedPageRefCallbacks.current.set(pageIndex, nextCallback);

    return nextCallback;
  };

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
      createHref="/monuments/new"
      renderEmptyChildren
      loadingChildren={
        embedded && paginated ? (
          <div
            ref={getEmbeddedPageRef(0)}
            className="w-full shrink-0 snap-start lg:hidden"
          >
            <div className="app-dashboard-monuments-panel px-4">
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: Math.max(1, pageSize) }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="app-dashboard-monument-skeleton aspect-square w-full rounded-2xl bg-white/[0.06]"
                  />
                ))}
              </div>
            </div>
          </div>
        ) : undefined
      }
    >
      {(monuments, saveMonumentOrder) => {
        const monumentCards = monuments.map<MonumentCard>((m) => ({
          id: m.id,
          emoji: m.emoji ?? null,
          title: m.title,
          stats: `${m.goalCount} Goal${m.goalCount === 1 ? "" : "s"}`,
        }));

        if (embedded && paginated) {
          const pages = buildEmbeddedMonumentPages(monumentCards, pageSize);

          return (
            <>
              {pages.map((page, pageIndex) => {
                const handlePageReorder = async (pageIds: string[]) => {
                  const fullIds = monuments.map((monument) => monument.id);

                  fullIds.splice(
                    page.pageStartIndex,
                    page.monuments.length,
                    ...pageIds
                  );

                  await saveMonumentOrder(fullIds);
                };

                return (
                  <div
                    key={`monument-page-${pageIndex}`}
                    ref={getEmbeddedPageRef(pageIndex)}
                    className="w-full shrink-0 snap-start lg:hidden"
                  >
                    <div className="app-dashboard-monuments-panel px-4">
                      <MonumentGridWithSharedTransition
                        monuments={page.monuments}
                        showNewCard={page.showNewCard}
                        onReorder={handlePageReorder}
                        emptyPlaceholderCount={0}
                      />
                    </div>
                  </div>
                );
              })}

              <AddMonumentDialog />
            </>
          );
        }

        return (
          <div className="app-dashboard-monuments-panel px-4">
            <MonumentGridWithSharedTransition
              monuments={monumentCards}
              showNewCard
              onReorder={saveMonumentOrder}
            />
            <AddMonumentDialog />
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
