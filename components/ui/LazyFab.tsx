"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FabProps } from "./Fab";

type FabComponent = React.ComponentType<FabProps>;

let fabImportPromise: Promise<FabComponent> | null = null;

const loadFab = () => {
  if (!fabImportPromise) {
    fabImportPromise = import("./Fab").then((module) => module.Fab);
  }

  return fabImportPromise;
};

const DynamicFab = dynamic<FabProps>(loadFab, {
  ssr: false,
  loading: () => null,
});

export type LazyFabProps = FabProps & {
  prewarm?: boolean;
};

const FAB_ONLY_PROP_NAMES = new Set<string>([
  "className",
  "menuVariant",
  "swipeUpToOpen",
  "editTarget",
  "onEditTargetChange",
  "onEditTargetConsumed",
  "onEditClose",
  "onEditSaved",
  "hideLauncher",
  "portalToBody",
  "openOnMount",
  "creationRequest",
  "prewarm",
]);

export function LazyFab(props: LazyFabProps) {
  const {
    className,
    editTarget = null,
    openOnMount = false,
    hideLauncher = false,
    creationRequest = null,
    prewarm = false,
    ...fabProps
  } = props;
  const wrapperProps = Object.fromEntries(
    Object.entries(props).filter(([key]) => !FAB_ONLY_PROP_NAMES.has(key))
  ) as React.HTMLAttributes<HTMLDivElement>;
  const shouldOpenHeavyFab =
    Boolean(editTarget) || openOnMount || Boolean(creationRequest);
  const [shouldLoadFab, setShouldLoadFab] = React.useState(shouldOpenHeavyFab);
  const [isFabReady, setIsFabReady] = React.useState(false);
  const [openWhenReady, setOpenWhenReady] = React.useState(false);
  const shouldRenderHeavyFab =
    isFabReady && (openWhenReady || shouldOpenHeavyFab);

  const requestFabLoad = React.useCallback(() => {
    setShouldLoadFab(true);
  }, []);

  const handleLauncherClick = React.useCallback(() => {
    setOpenWhenReady(true);
    setShouldLoadFab(true);
  }, []);

  React.useEffect(() => {
    if (shouldOpenHeavyFab) {
      setShouldLoadFab(true);
    }
  }, [shouldOpenHeavyFab]);

  React.useEffect(() => {
    if (!prewarm || shouldLoadFab) {
      return;
    }

    const warmFab = () => {
      setShouldLoadFab(true);
    };

    if (typeof window === "undefined") {
      return;
    }

    if ("requestIdleCallback" in window) {
      const idleCallbackId = window.requestIdleCallback(warmFab);

      return () => {
        window.cancelIdleCallback(idleCallbackId);
      };
    }

    const timeoutId = window.setTimeout(warmFab, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [prewarm, shouldLoadFab]);

  React.useEffect(() => {
    if (!shouldLoadFab || isFabReady) {
      return;
    }

    let cancelled = false;
    loadFab().then(() => {
      if (!cancelled) {
        setIsFabReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isFabReady, shouldLoadFab]);

  if (shouldRenderHeavyFab) {
    return (
      <DynamicFab
        {...fabProps}
        className={className}
        editTarget={editTarget}
        onEditTargetChange={props.onEditTargetChange}
        onEditTargetConsumed={props.onEditTargetConsumed}
        onEditClose={props.onEditClose}
        onEditSaved={props.onEditSaved}
        hideLauncher={hideLauncher}
        creationRequest={creationRequest}
        openOnMount={openOnMount || openWhenReady || Boolean(editTarget)}
      />
    );
  }

  if (hideLauncher || shouldOpenHeavyFab) {
    return null;
  }

  return (
    <div className={cn("relative", className)} {...wrapperProps}>
      <button
        type="button"
        data-tour="fab"
        aria-label="Add new item"
        aria-busy={openWhenReady && !isFabReady}
        className="relative flex h-14 w-14 items-center justify-center overflow-visible rounded-full border border-white/[0.12] text-white shadow-lg backdrop-blur-xl transition hover:scale-110 hover:border-white/[0.18] active:scale-90"
        onPointerEnter={requestFabLoad}
        onFocus={requestFabLoad}
        onTouchStart={requestFabLoad}
        onClick={handleLauncherClick}
        style={{
          background:
            "linear-gradient(145deg, rgba(18,18,22,0.94) 0%, rgba(8,9,12,0.88) 48%, rgba(2,3,6,0.92) 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -10px 18px rgba(0,0,0,0.36), 0 18px 38px rgba(0,0,0,0.52), 0 8px 18px rgba(0,0,0,0.38)",
          filter: "none",
        }}
      >
        <Plus className="h-8 w-8" aria-hidden="true" />
      </button>
    </div>
  );
}
