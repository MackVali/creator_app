"use client";

import {
  showCreatorXpSurge,
  showScheduledEventCreatorXpSurge,
  type CreatorXpSurgePayload,
} from "@/components/xp/CreatorXpSurgeHud";
import {
  dispatchCreatorXpBurst,
  dispatchCreatorXpBurstStatus,
  getCreatorXpRectFromPoint,
  type CreatorXpBurstKind,
  type CreatorXpBurstRect,
  type CreatorXpBurstSourceOrigin,
} from "@/lib/effects/creatorXpBurstBus";

const CREATOR_XP_REWARD_VISUAL_TARGET_DELAY_MS = 90;

export type CreatorXpRewardVisualSourcePoint = {
  clientX: number;
  clientY: number;
};

export type CreatorXpRewardVisualInput = {
  surge?: CreatorXpSurgePayload | null;
  scheduleInstanceId?: string | null;
  completedAt?: string | null;
  topOffsetPx?: number | null;
  sourceRect?: CreatorXpBurstRect | DOMRect | null;
  sourcePoint?: CreatorXpRewardVisualSourcePoint | null;
  sourceOrigin?: CreatorXpBurstSourceOrigin;
  amount?: number | null;
  kind?: CreatorXpBurstKind;
  burstId?: string;
  debugLabel?: string;
};

function normalizeSourceRect(
  sourceRect?: CreatorXpBurstRect | DOMRect | null,
  sourcePoint?: CreatorXpRewardVisualSourcePoint | null
) {
  if (sourceRect) return sourceRect;
  if (
    sourcePoint &&
    Number.isFinite(sourcePoint.clientX) &&
    Number.isFinite(sourcePoint.clientY)
  ) {
    return getCreatorXpRectFromPoint(sourcePoint.clientX, sourcePoint.clientY);
  }
  return null;
}

export function dispatchCreatorXpRewardVisual({
  surge,
  scheduleInstanceId,
  completedAt,
  topOffsetPx,
  sourceRect,
  sourcePoint,
  sourceOrigin,
  amount,
  kind = "xp_reward",
  burstId,
  debugLabel,
}: CreatorXpRewardVisualInput) {
  if (typeof window === "undefined") return;

  if (!surge) {
    dispatchCreatorXpBurstStatus("XP: skipped no XP payload");
    return;
  }

  dispatchCreatorXpBurstStatus("XP: visual helper");

  if (scheduleInstanceId?.trim()) {
    showScheduledEventCreatorXpSurge({
      ...surge,
      scheduleInstanceId,
      completedAt,
      topOffsetPx: topOffsetPx ?? surge.topOffsetPx,
    });
  } else {
    showCreatorXpSurge({
      ...surge,
      topOffsetPx: topOffsetPx ?? surge.topOffsetPx,
    });
  }

  const resolvedSourceRect = normalizeSourceRect(sourceRect, sourcePoint);
  const resolvedSourceOrigin =
    sourceOrigin ?? (sourcePoint ? "pointer" : undefined);

  window.setTimeout(() => {
    dispatchCreatorXpBurst({
      burstId,
      sourceRect: resolvedSourceRect,
      amount: amount ?? surge.displayXp ?? undefined,
      kind,
      sourceOrigin: resolvedSourceOrigin,
      debugLabel: debugLabel ?? "XP: visual helper",
    });
  }, CREATOR_XP_REWARD_VISUAL_TARGET_DELAY_MS);
}
