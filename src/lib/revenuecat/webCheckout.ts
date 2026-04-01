import {
  ErrorCode,
  Purchases,
  PurchasesError,
} from "@revenuecat/purchases-js"

const webApiKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY_WEB;
let configuredUserId: string | null = null;

type WebOfferings = Awaited<ReturnType<typeof Purchases.getOfferings>>
type WebCurrentOffering = NonNullable<WebOfferings["current"]>

export type WebUpgradePackages = {
  currentOffering: WebCurrentOffering
  availablePackages: NonNullable<WebCurrentOffering["availablePackages"]>
}

export type WebUpgradePackage = WebUpgradePackages["availablePackages"][number]
export type RevenueCatPurchaseResult = { cancelled: boolean }

async function ensurePurchasesConfigured(userId: string) {
  if (!webApiKey) {
    throw new Error("NEXT_PUBLIC_REVENUECAT_API_KEY_WEB is required for web checkout");
  }

  if (configuredUserId === userId && Purchases.isConfigured()) {
    return Purchases.getSharedInstance();
  }

  const instance = Purchases.configure({ apiKey: webApiKey, appUserId: userId });
  configuredUserId = userId;
  return instance;
}

function ensureBrowserEnv() {
  if (typeof window === "undefined") {
    throw new Error("launchWebCheckout may only be called in a browser environment");
  }
}

function isCancellation(error: unknown) {
  return (
    error instanceof PurchasesError &&
    error.errorCode === ErrorCode.UserCancelledError
  )
}

function resolveCurrentOffering(offerings: WebOfferings) {
  const fallbackOffering = Object.values(offerings.all ?? {})[0];
  return offerings.current ?? fallbackOffering;
}

export async function getUpgradePackages(userId: string): Promise<WebUpgradePackages> {
  ensureBrowserEnv();

  const purchases = await ensurePurchasesConfigured(userId);
  const offerings = await purchases.getOfferings();
  const currentOffering = resolveCurrentOffering(offerings);

  if (!currentOffering) {
    throw new Error("RevenueCat web checkout could not find a current offering");
  }

  const availablePackages = currentOffering.availablePackages;
  if (!availablePackages || availablePackages.length === 0) {
    throw new Error("RevenueCat web checkout could not find any packages");
  }

  return {
    currentOffering,
    availablePackages,
  };
}

export async function purchaseSelectedUpgradePackage(
  userId: string,
  pkg: WebUpgradePackage,
): Promise<RevenueCatPurchaseResult> {
  ensureBrowserEnv();

  const purchases = await ensurePurchasesConfigured(userId);

  try {
    await purchases.purchasePackage(pkg);
    return { cancelled: false };
  } catch (error) {
    if (isCancellation(error)) {
      return { cancelled: true };
    }

    throw new Error(`RevenueCat web checkout failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
