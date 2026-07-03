export const CREATOR_XP_BURST_EVENT = "creator:xp-burst";
export const CREATOR_XP_BURST_ARRIVED_EVENT = "creator:xp-burst-arrived";
export const CREATOR_MATRIX_XP_DEBUG_STORAGE_KEY = "creator:matrix-xp-debug";
export const CREATOR_MATRIX_XP_DEBUG_EVENT = "creator:matrix-xp-debug-change";

export type CreatorXpBurstRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type CreatorXpBurstKind =
  | "schedule_instance_complete"
  | "task_complete"
  | "habit_complete"
  | "project_complete"
  | "goal_complete"
  | "xp_reward";

export type CreatorXpBurstFallback = "source" | "target";
export type CreatorXpBurstSourceOrigin =
  | "card"
  | "currentTarget"
  | "pointer"
  | "viewport fallback";
export type CreatorXpBurstTargetOrigin = "surge hex" | "avatar" | "fallback";

export type CreatorXpBurstDetail = {
  burstId?: string;
  sourceRect?: CreatorXpBurstRect | null;
  targetRect?: CreatorXpBurstRect | null;
  amount?: number;
  kind: CreatorXpBurstKind;
  fallbackUsed?: CreatorXpBurstFallback[];
  sourceOrigin?: CreatorXpBurstSourceOrigin;
  targetOrigin?: CreatorXpBurstTargetOrigin;
  debugLabel?: string;
};

type CreatorXpBurstListener = (detail: CreatorXpBurstDetail) => void;
type CreatorXpBurstStatusListener = (message: string) => void;
type CreatorXpBurstArrivedListener = (detail: { burstId?: string }) => void;
type CreatorMatrixXpDebugListener = (enabled: boolean) => void;

const CREATOR_XP_STATUS_EVENT = "creator:xp-burst-status";

export function isCreatorMatrixXpDebugEnabled() {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return false;
  }

  return window.localStorage.getItem(CREATOR_MATRIX_XP_DEBUG_STORAGE_KEY) === "1";
}

export function setCreatorMatrixXpDebugEnabled(enabled: boolean) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return;
  }

  if (enabled) {
    window.localStorage.setItem(CREATOR_MATRIX_XP_DEBUG_STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(CREATOR_MATRIX_XP_DEBUG_STORAGE_KEY);
  }

  window.dispatchEvent(
    new CustomEvent<boolean>(CREATOR_MATRIX_XP_DEBUG_EVENT, {
      detail: enabled,
    })
  );
}

function toCreatorXpBurstRect(rect: DOMRect | CreatorXpBurstRect) {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

function isUsableCreatorXpBurstRect(rect: CreatorXpBurstRect) {
  return rect.width > 0 && rect.height > 0;
}

function getViewportFallbackSourceRect() {
  if (typeof window === "undefined") return null;
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const offsetLeft = viewport?.offsetLeft ?? 0;
  const offsetTop = viewport?.offsetTop ?? 0;
  const size = 72;
  const left = offsetLeft + width / 2 - size / 2;
  const top = offsetTop + height * 0.68 - size / 2;
  return {
    x: left,
    y: top,
    width: size,
    height: size,
    top,
    right: left + size,
    bottom: top + size,
    left,
  };
}

function getCreatorXpFallbackTargetRect() {
  if (typeof window === "undefined") return null;
  const viewport = window.visualViewport;
  const safeAreaTop = Math.max(0, viewport?.offsetTop ?? 0);
  const width = viewport?.width ?? window.innerWidth;
  const offsetLeft = viewport?.offsetLeft ?? 0;
  const left = offsetLeft + width - 52;
  const top = 22 + safeAreaTop;
  return {
    x: left,
    y: top,
    width: 36,
    height: 36,
    top,
    right: left + 36,
    bottom: top + 36,
    left,
  };
}

export function getCreatorXpViewportFallbackSourceRect() {
  return getViewportFallbackSourceRect();
}

export function getCreatorXpFallbackTargetRectForViewport() {
  return getCreatorXpFallbackTargetRect();
}

export function getCreatorXpSurgeHexTargetRect() {
  if (typeof document === "undefined") return null;
  const target = document.querySelector<HTMLElement>(
    '[data-creator-xp-target="surge-hex"]'
  );
  const targetRect = target
    ? toCreatorXpBurstRect(target.getBoundingClientRect())
    : null;
  return targetRect && isUsableCreatorXpBurstRect(targetRect)
    ? targetRect
    : null;
}

export function getCreatorXpRectFromPoint(clientX: number, clientY: number) {
  const size = 56;
  const left = clientX - size / 2;
  const top = clientY - size / 2;
  return {
    x: left,
    y: top,
    width: size,
    height: size,
    top,
    right: left + size,
    bottom: top + size,
    left,
  };
}

function getCreatorXpTargetWithOrigin(): {
  rect: CreatorXpBurstRect | null;
  origin: CreatorXpBurstTargetOrigin;
} {
  if (typeof document === "undefined") {
    return { rect: null, origin: "fallback" };
  }
  const surgeHexRect = getCreatorXpSurgeHexTargetRect();
  if (surgeHexRect) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[xp-burst] target found", {
        source: "surge-hex",
        rect: surgeHexRect,
      });
      dispatchCreatorXpBurstStatus("XP: target surge hex");
    }
    return { rect: surgeHexRect, origin: "surge hex" };
  }

  const target = document.querySelector<HTMLElement>(
    '[data-creator-xp-target="profile-avatar"]'
  );
  const targetRect = target
    ? toCreatorXpBurstRect(target.getBoundingClientRect())
    : null;
  if (targetRect && isUsableCreatorXpBurstRect(targetRect)) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[xp-burst] target found", {
        source: "profile-avatar",
        rect: targetRect,
      });
      dispatchCreatorXpBurstStatus("XP: target avatar");
    }
    return { rect: targetRect, origin: "avatar" };
  }

  const fallbackRect = getCreatorXpFallbackTargetRect();
  if (process.env.NODE_ENV !== "production") {
    console.info("[xp-burst] target found", {
      source: "viewport-fallback",
      reason: target ? "zero-rect" : "missing",
      rect: fallbackRect,
    });
    dispatchCreatorXpBurstStatus("XP: target fallback");
  }
  return { rect: fallbackRect, origin: "fallback" };
}

export function getCreatorXpTargetRect() {
  return getCreatorXpTargetWithOrigin()?.rect ?? null;
}

export function getCreatorXpSourceRect(instanceId: string) {
  if (typeof document === "undefined" || !instanceId) return null;
  const escapedId =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(instanceId)
      : instanceId.replace(/"/g, '\\"');
  const source = document.querySelector<HTMLElement>(
    `[data-creator-xp-source-id="${escapedId}"]`
  ) ?? document.querySelector<HTMLElement>(
    `[data-schedule-instance-id="${escapedId}"]`
  );
  const sourceRect = source
    ? toCreatorXpBurstRect(source.getBoundingClientRect())
    : null;
  if (sourceRect && isUsableCreatorXpBurstRect(sourceRect)) {
    return sourceRect;
  }

  return getViewportFallbackSourceRect();
}

export function dispatchCreatorXpBurst(detail: CreatorXpBurstDetail) {
  if (typeof window === "undefined") return;
  const fallbackUsed = new Set(detail.fallbackUsed ?? []);
  let sourceRect = detail.sourceRect
    ? toCreatorXpBurstRect(detail.sourceRect)
    : null;
  let targetRect = detail.targetRect
    ? toCreatorXpBurstRect(detail.targetRect)
    : null;

  if (!sourceRect || !isUsableCreatorXpBurstRect(sourceRect)) {
    sourceRect = getViewportFallbackSourceRect();
    fallbackUsed.add("source");
    detail.sourceOrigin = "viewport fallback";
    if (process.env.NODE_ENV !== "production") {
      dispatchCreatorXpBurstStatus("XP: skipped missing source, using fallback");
    }
  }

  let targetOrigin = detail.targetOrigin;
  if (!targetRect || !isUsableCreatorXpBurstRect(targetRect)) {
    const target = getCreatorXpTargetWithOrigin();
    targetRect = target?.rect ?? null;
    targetOrigin = target?.origin ?? "fallback";
    if (targetOrigin === "fallback") {
      fallbackUsed.add("target");
      if (process.env.NODE_ENV !== "production") {
        dispatchCreatorXpBurstStatus("XP: skipped missing target, using fallback");
      }
    }
  }

  if (!sourceRect || !targetRect) return;

  if (process.env.NODE_ENV !== "production") {
    dispatchCreatorXpBurstStatus(
      detail.sourceOrigin
        ? `XP: source ${detail.sourceOrigin}`
        : (detail.debugLabel ?? "XP: event dispatched")
    );
  }
  window.dispatchEvent(
    new CustomEvent<CreatorXpBurstDetail>(CREATOR_XP_BURST_EVENT, {
      detail: {
        ...detail,
        sourceRect,
        targetRect,
        targetOrigin,
        fallbackUsed: Array.from(fallbackUsed),
      },
    })
  );
}

export function dispatchCreatorXpBurstArrived(burstId?: string) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") {
    dispatchCreatorXpBurstStatus("XP: burst arrived");
  }
  window.dispatchEvent(
    new CustomEvent<{ burstId?: string }>(CREATOR_XP_BURST_ARRIVED_EVENT, {
      detail: { burstId },
    })
  );
}

export function dispatchCreatorXpBurstStatus(message: string) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<string>(CREATOR_XP_STATUS_EVENT, { detail: message })
  );
}

export function subscribeToCreatorXpBursts(listener: CreatorXpBurstListener) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<CreatorXpBurstDetail>;
    if (!customEvent.detail) return;
    listener(customEvent.detail);
  };
  window.addEventListener(CREATOR_XP_BURST_EVENT, handler);
  return () => window.removeEventListener(CREATOR_XP_BURST_EVENT, handler);
}

export function subscribeToCreatorXpBurstStatus(
  listener: CreatorXpBurstStatusListener
) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return () => {};
  }
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<string>;
    if (!customEvent.detail) return;
    listener(customEvent.detail);
  };
  window.addEventListener(CREATOR_XP_STATUS_EVENT, handler);
  return () => window.removeEventListener(CREATOR_XP_STATUS_EVENT, handler);
}

export function subscribeToCreatorXpBurstArrivals(
  listener: CreatorXpBurstArrivedListener
) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ burstId?: string }>;
    listener(customEvent.detail ?? {});
  };
  window.addEventListener(CREATOR_XP_BURST_ARRIVED_EVENT, handler);
  return () => window.removeEventListener(CREATOR_XP_BURST_ARRIVED_EVENT, handler);
}

export function subscribeToCreatorMatrixXpDebug(
  listener: CreatorMatrixXpDebugListener
) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return () => {};
  }
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<boolean>;
    listener(Boolean(customEvent.detail));
  };
  const storageHandler = (event: StorageEvent) => {
    if (event.key !== CREATOR_MATRIX_XP_DEBUG_STORAGE_KEY) return;
    listener(isCreatorMatrixXpDebugEnabled());
  };
  window.addEventListener(CREATOR_MATRIX_XP_DEBUG_EVENT, handler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(CREATOR_MATRIX_XP_DEBUG_EVENT, handler);
    window.removeEventListener("storage", storageHandler);
  };
}
