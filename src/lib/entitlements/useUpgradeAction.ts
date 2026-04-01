"use client";

import { Capacitor } from "@capacitor/core";
import { AppRouterInstance } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  getUpgradePackages as getWebUpgradePackages,
  purchaseSelectedUpgradePackage as purchaseSelectedWebUpgradePackage,
  WebUpgradePackage,
  WebUpgradePackages,
} from "@/lib/revenuecat/webCheckout";
import {
  getUpgradePackages as getNativeUpgradePackages,
  purchaseSelectedUpgradePackage as purchaseSelectedNativeUpgradePackage,
  NativeUpgradePackage,
  NativeUpgradePackages,
} from "@/lib/revenuecat/presentUpgrade";
import { syncEntitlement } from "@/lib/entitlements/syncEntitlement";
import { useAuth } from "@/components/auth/AuthProvider";
import { useEntitlement } from "@/components/entitlement/EntitlementProvider";

export type UpgradeActionCallbacks = {
  onSuccess?: () => void;
  onCancel?: () => void;
  onFailure?: (error: Error) => void;
};

export type UpgradeActionState = {
  isLaunching: boolean;
  error: Error | null;
};

const initialState: UpgradeActionState = {
  isLaunching: false,
  error: null,
};

const isCancellationError = (error: Error) => {
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("cancel") ||
    message.includes("user cancelled") ||
    message.includes("user canceled") ||
    message.includes("purchase cancelled") ||
    message.includes("purchase canceled")
  );
};

type UpgradePackage = WebUpgradePackage | NativeUpgradePackage
type UpgradePackages = WebUpgradePackages | NativeUpgradePackages

export function useUpgradeAction(callbacks?: UpgradeActionCallbacks) {
  const { user } = useAuth();
  const { refreshEntitlement } = useEntitlement();
  const [state, setState] = useState<UpgradeActionState>(initialState);
  const launchingRef = useRef(false);
  const isNativePlatform = Capacitor.isNativePlatform();

  const loadUpgradePackages = useCallback(async () => {
    if (isNativePlatform) {
      return await getNativeUpgradePackages();
    }

    if (!user?.id) {
      throw new Error(
        "Unable to load web upgrade packages: authenticated user ID is missing.",
      );
    }

    return await getWebUpgradePackages(user.id);
  }, [isNativePlatform, user?.id]);

  const purchaseUpgradePackage = useCallback(
    async (pkg: UpgradePackage) => {
      if (launchingRef.current) {
        return;
      }

      if (!pkg) {
        const missingPackageError = new Error("Upgrade package selection is required.");
        setState({ isLaunching: false, error: missingPackageError });
        callbacks?.onFailure?.(missingPackageError);
        return;
      }

      launchingRef.current = true;
      setState({ isLaunching: true, error: null });

      try {
        const isNative = isNativePlatform;
        if (!isNative && !user?.id) {
          throw new Error(
            "Unable to launch web checkout: authenticated user ID is missing.",
          );
        }

        const result = isNative
          ? await purchaseSelectedNativeUpgradePackage(pkg as NativeUpgradePackage)
          : await purchaseSelectedWebUpgradePackage(user.id, pkg as WebUpgradePackage);

        if (result.cancelled) {
          setState((prev) => ({ ...prev, isLaunching: false }));
          callbacks?.onCancel?.();
          return;
        }

        await syncEntitlement();
        await refreshEntitlement();
        setState({ isLaunching: false, error: null });
        callbacks?.onSuccess?.();
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error("Unknown upgrade error");

        if (isNativePlatform && isCancellationError(normalizedError)) {
          setState((prev) => ({ ...prev, isLaunching: false }));
          callbacks?.onCancel?.();
          return;
        }

        setState({ isLaunching: false, error: normalizedError });
        callbacks?.onFailure?.(normalizedError);
      } finally {
        launchingRef.current = false;
      }
    },
    [callbacks, isNativePlatform, refreshEntitlement, user?.id],
  );

  return {
    state,
    loadUpgradePackages,
    purchaseUpgradePackage,
  };
}

export function goToBillingPage(router: AppRouterInstance) {
  void router.push("/settings/billing");
}
