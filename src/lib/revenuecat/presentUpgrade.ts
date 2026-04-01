import { Capacitor } from "@capacitor/core";
import {
  ErrorCode,
  Purchases,
  PurchasesError,
} from "@revenuecat/purchases-capacitor";

function ensureNativePlatform() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Native upgrade flow is unavailable on web.");
  }
}

type NativeOfferings = Awaited<ReturnType<typeof Purchases.getOfferings>>
type NativeCurrentOffering = NonNullable<NativeOfferings["current"]>

export type NativeUpgradePackages = {
  currentOffering: NativeCurrentOffering
  availablePackages: NonNullable<NativeCurrentOffering["availablePackages"]>
}

export type NativeUpgradePackage = NativeUpgradePackages["availablePackages"][number]
export type RevenueCatPurchaseResult = { cancelled: boolean }

function resolveCurrentOffering(offerings: NativeOfferings) {
  const fallbackOffering = Object.values(offerings.all ?? {})[0];
  return offerings.current ?? fallbackOffering;
}

function isCancellation(error: unknown) {
  return (
    error instanceof PurchasesError &&
    error.errorCode === ErrorCode.UserCancelledError
  );
}

export async function getUpgradePackages(): Promise<NativeUpgradePackages> {
  ensureNativePlatform();

  const offerings = await Purchases.getOfferings();
  const currentOffering = resolveCurrentOffering(offerings);

  if (!currentOffering) {
    throw new Error("Missing current offering");
  }

  const availablePackages = currentOffering.availablePackages;
  if (!availablePackages || availablePackages.length === 0) {
    throw new Error("No packages available");
  }

  return {
    currentOffering,
    availablePackages,
  };
}

export async function purchaseSelectedUpgradePackage(
  pkg: NativeUpgradePackage,
): Promise<RevenueCatPurchaseResult> {
  ensureNativePlatform();

  try {
    await Purchases.purchasePackage(pkg);
    return { cancelled: false };
  } catch (error) {
    if (isCancellation(error)) {
      return { cancelled: true };
    }

    throw new Error(`RevenueCat native checkout failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
