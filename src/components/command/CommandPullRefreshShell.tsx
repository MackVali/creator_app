"use client";

import {
  type ReactNode,
  type RefObject,
  useCallback,
  useRef,
} from "react";

import {
  CommandCirclesSection,
  type CommandCirclesSectionHandle,
} from "@/components/command/CommandCirclesSection";
import { PullRefreshShell } from "@/components/ui/PullRefreshShell";
import { cn } from "@/lib/utils";

type CommandPullRefreshShellProps = {
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  lockDocumentScroll?: boolean;
  onRefresh?: () => Promise<void> | void;
  refreshRef?: RefObject<CommandCirclesSectionHandle | null>;
};

export function CommandPullRefreshShell({
  children,
  className,
  contentClassName,
  lockDocumentScroll = true,
  onRefresh,
  refreshRef,
}: CommandPullRefreshShellProps) {
  const fallbackCommandRef = useRef<CommandCirclesSectionHandle | null>(null);
  const commandRef = refreshRef ?? fallbackCommandRef;

  const isBlockedRef = useRef<() => boolean>(() => {
    return commandRef.current?.isDetailOpen() ?? false;
  });

  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
    } else {
      await commandRef.current?.refresh();
    }
  }, [commandRef, onRefresh]);

  const hasWrappedContent = children !== undefined;

  return (
    <PullRefreshShell
      className={cn(
        hasWrappedContent
          ? undefined
          : "h-[calc(100dvh-4rem)] min-h-[calc(100dvh-4rem)]",
        className,
      )}
      contentClassName={cn(
        hasWrappedContent
          ? undefined
          : "mx-auto w-full max-w-6xl px-4 pb-10 pt-4",
        contentClassName,
      )}
      lockDocumentScroll={lockDocumentScroll}
      onRefresh={handleRefresh}
      isBlockedRef={isBlockedRef}
    >
      {hasWrappedContent ? (
        children
      ) : (
        <CommandCirclesSection ref={fallbackCommandRef} />
      )}
    </PullRefreshShell>
  );
}
