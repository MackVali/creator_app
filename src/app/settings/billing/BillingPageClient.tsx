"use client";

import { Capacitor } from "@capacitor/core";
import { ArrowRight, BarChart3, Box, CalendarDays, Map } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useEntitlement } from "@/components/entitlement/EntitlementProvider";
import { useUpgradeAction } from "@/lib/entitlements/useUpgradeAction";
import { syncEntitlement } from "@/lib/entitlements/syncEntitlement";
import { restorePurchases as restoreNativePurchases } from "@/lib/revenuecat/presentUpgrade";

import type { Product as RevenueCatWebProduct } from "@revenuecat/purchases-js";
import type { PurchasesStoreProduct } from "@revenuecat/purchases-typescript-internal-esm";

const PREMIUM_BENEFITS = [
  {
    label: "More room for goals, projects, tasks, and habits",
    Icon: Box,
  },
  {
    label: "Bigger roadmaps",
    Icon: Map,
  },
  {
    label: "Progress analytics",
    Icon: BarChart3,
  },
  {
    label: "Advanced scheduling",
    Icon: CalendarDays,
  },
];
const UPGRADE_PLAN_NAME = "CREATOR Pro";
const MONTHLY_PLAN_NAME = "CREATOR Pro Monthly";
const PLAN_LOAD_FAILED_MESSAGE =
  "CREATOR Pro plans could not be loaded. Please try again.";
const PURCHASE_FAILED_MESSAGE =
  "Purchase could not be completed. Please try again.";
const RESTORE_FAILED_MESSAGE =
  "Restore could not be completed. Please try again.";
const premiumIconShellClassName =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-200/25 bg-[linear-gradient(145deg,rgba(255,255,255,0.14),rgba(16,185,129,0.16)_32%,rgba(0,0,0,0.58)_100%)] text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-10px_18px_rgba(0,0,0,0.42),0_8px_18px_rgba(0,0,0,0.45),0_0_18px_rgba(52,211,153,0.16)] md:h-11 md:w-11";
const recommendedPillClassName =
  "inline-flex shrink-0 items-center justify-center rounded-full border border-emerald-300/50 bg-[linear-gradient(180deg,rgba(110,231,183,0.16),rgba(16,185,129,0.08))] px-2 py-1 text-[0.58rem] font-bold uppercase tracking-[0.18em] text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-10px_20px_rgba(0,0,0,0.35),0_0_24px_rgba(52,211,153,0.18)] md:px-2.5 md:text-[0.6rem]";
const selectedPlanOuterClassName =
  "relative w-full overflow-hidden rounded-2xl bg-[linear-gradient(145deg,rgba(236,253,245,0.95)_0%,rgba(167,243,208,0.86)_10%,rgba(52,211,153,0.82)_24%,rgba(5,150,105,0.78)_48%,rgba(6,78,59,0.92)_72%,rgba(16,185,129,0.68)_88%,rgba(255,255,255,0.42)_100%)] p-[2px] text-left shadow-[0_0_0_1px_rgba(110,231,183,0.12),0_0_28px_rgba(52,211,153,0.18),0_14px_28px_rgba(0,0,0,0.28)] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300";
const selectedPlanInnerClassName =
  "relative z-10 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-[0.9rem] bg-[linear-gradient(145deg,rgba(9,12,11,0.98)_0%,rgba(13,17,16,0.98)_46%,rgba(4,7,6,0.99)_100%)] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-14px_24px_rgba(0,0,0,0.48)] md:gap-4 md:px-5 md:py-4";
const unselectedPlanClassName =
  "relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 overflow-hidden rounded-2xl border border-white/[0.12] bg-white/[0.025] px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/25 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 md:gap-4 md:px-5 md:py-4";
const selectedPlanTextOutlineStyle = {
  WebkitTextStroke: "0.55px rgba(2,4,3,0.88)",
  paintOrder: "stroke fill",
  textShadow:
    "0.75px 0 0 rgba(2,4,3,0.82), -0.75px 0 0 rgba(2,4,3,0.82), 0 0.75px 0 rgba(2,4,3,0.82), 0 -0.75px 0 rgba(2,4,3,0.82)",
} satisfies CSSProperties;

type UpgradeActionReturn = ReturnType<typeof useUpgradeAction>;
type LoadedUpgradePackages = Awaited<
  ReturnType<UpgradeActionReturn["loadUpgradePackages"]>
>;
type AvailableUpgradePackage = LoadedUpgradePackages["availablePackages"][number];
type RevenueCatProduct = RevenueCatWebProduct | PurchasesStoreProduct;
type PackageLoadState = "idle" | "loading" | "success" | "error";
type RestoreState = "idle" | "restoring" | "success" | "error";

function getReviewSafeCopy(value: string) {
  return value.replace(/CREATOR\s+PLUS/gi, UPGRADE_PLAN_NAME);
}

function formatRenewalDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPackageProduct(pkg: AvailableUpgradePackage): RevenueCatProduct | null {
  if ("webBillingProduct" in pkg && pkg.webBillingProduct) {
    return pkg.webBillingProduct;
  }
  if ("rcBillingProduct" in pkg && pkg.rcBillingProduct) {
    return pkg.rcBillingProduct;
  }
  if ("product" in pkg && pkg.product) {
    return pkg.product;
  }
  return null;
}

function getProductPriceLabel(product: RevenueCatProduct | null) {
  if (!product) {
    return "Price unavailable";
  }

  if ("priceString" in product && product.priceString) {
    return product.priceString;
  }

  if ("price" in product) {
    const price = product.price;
    if (price && typeof price === "object" && "formattedPrice" in price) {
      return price.formattedPrice;
    }

    if (typeof price === "number") {
      const currency =
        "currencyCode" in product && typeof product.currencyCode === "string"
          ? product.currencyCode
          : "USD";
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(price);
    }
  }

  return "Price unavailable";
}

function normalizePriceValue(
  value: number | { amountMicros: number } | null | undefined,
): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "amountMicros" in value &&
    typeof value.amountMicros === "number"
  ) {
    return value.amountMicros / 1_000_000;
  }

  return null;
}

function getNumericProductPrice(
  product: RevenueCatProduct,
  field: "price" | "pricePerMonth" | "pricePerYear",
) {
  const raw = (product as Record<string, unknown>)[field];
  return normalizePriceValue(raw as number | { amountMicros: number } | null | undefined);
}

function getAnnualSavingsLabel(
  annualPkg: AvailableUpgradePackage | null,
  monthlyPkg: AvailableUpgradePackage | null,
) {
  if (!annualPkg || !monthlyPkg) {
    return null;
  }

  const annualProduct = getPackageProduct(annualPkg);
  const monthlyProduct = getPackageProduct(monthlyPkg);
  if (!annualProduct || !monthlyProduct) {
    return null;
  }

  const annualValue =
    getNumericProductPrice(annualProduct, "pricePerYear") ??
    getNumericProductPrice(annualProduct, "price");
  const monthlyValue =
    getNumericProductPrice(monthlyProduct, "pricePerMonth") ??
    getNumericProductPrice(monthlyProduct, "price");

  if (!annualValue || !monthlyValue) {
    return null;
  }

  const monthlyTotal = monthlyValue * 12;
  if (annualValue >= monthlyTotal) {
    return null;
  }

  const savingsPercent = Math.round((1 - annualValue / monthlyTotal) * 100);
  return `Save ${savingsPercent}% vs 12 months of the monthly plan.`;
}

function getBillingCadenceLabel(pkg: AvailableUpgradePackage) {
  const rawType = String(pkg.packageType ?? pkg.identifier ?? "").toLowerCase();
  if (rawType.includes("annual")) {
    return "Annual";
  }
  if (rawType.includes("monthly")) {
    return "Monthly";
  }
  if (rawType.includes("weekly")) {
    return "Weekly";
  }
  if (rawType.includes("year")) {
    return "Annual";
  }
  return "Plan";
}

function getPlanDescription(pkg: AvailableUpgradePackage) {
  const product = getPackageProduct(pkg);
  if (product?.description) {
    return getReviewSafeCopy(product.description);
  }

  return "The full CREATOR Pro planning and execution layer.";
}

function getPlanLabel(pkg: AvailableUpgradePackage) {
  const cadenceLabel = getBillingCadenceLabel(pkg);
  if (cadenceLabel === "Monthly") {
    return MONTHLY_PLAN_NAME;
  }
  if (cadenceLabel === "Annual") {
    return `${UPGRADE_PLAN_NAME} Annual`;
  }

  const product = getPackageProduct(pkg);
  return product?.title ? getReviewSafeCopy(product.title) : UPGRADE_PLAN_NAME;
}

function BillingPageClient() {
  const {
    isPlus,
    current_period_end,
    refreshEntitlement,
  } = useEntitlement();
  const { state: upgradeState, loadUpgradePackages, purchaseUpgradePackage } =
    useUpgradeAction();
  const { isLaunching, error: upgradeError } = upgradeState;
  const isNativePlatform = Capacitor.isNativePlatform();
  const renewalDate = formatRenewalDate(current_period_end);
  const [packages, setPackages] = useState<LoadedUpgradePackages | null>(null);
  const [loadState, setLoadState] = useState<PackageLoadState>("idle");
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [restoreState, setRestoreState] = useState<RestoreState>("idle");
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [purchaseAttempted, setPurchaseAttempted] = useState(false);

  useEffect(() => {
    if (isPlus) {
      setPackages(null);
      setLoadState("idle");
      setLoadError(null);
      setSelectedPackageId(null);
      setPurchaseAttempted(false);
      return;
    }

    let isMounted = true;
    setLoadState("loading");
    setLoadError(null);
    setPackages(null);

    (async () => {
      try {
        const loaded = await loadUpgradePackages();
        if (!isMounted) {
          return;
        }
        setPackages(loaded);
        setLoadState("success");
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const normalizedError = error instanceof Error ? error : new Error("Unable to load plans.");
        console.error("Unable to load billing plans", {
          platform: Capacitor.getPlatform(),
          isNativePlatform,
          error: normalizedError,
        });
        setLoadError(normalizedError);
        setLoadState("error");
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isNativePlatform, isPlus, loadUpgradePackages, reloadAttempt]);

  const { planOptions, annualPackage, monthlyPackage } = useMemo(() => {
    if (!packages) {
      return { planOptions: [], annualPackage: null, monthlyPackage: null };
    }

    const matchesType = (pkg: AvailableUpgradePackage, keyword: string) => {
      const normalized = String(pkg.packageType ?? pkg.identifier ?? "").toLowerCase();
      return normalized.includes(keyword);
    };

    const annual = packages.availablePackages.find((pkg) => matchesType(pkg, "annual"));
    const monthly = packages.availablePackages.find((pkg) => matchesType(pkg, "monthly"));
    const options: AvailableUpgradePackage[] = [];

    if (annual) {
      options.push(annual);
    }
    if (monthly && monthly.identifier !== annual?.identifier) {
      options.push(monthly);
    }
    if (options.length === 0) {
      packages.availablePackages.forEach((pkg) => options.push(pkg));
    }

    return { planOptions: options, annualPackage: annual ?? null, monthlyPackage: monthly ?? null };
  }, [packages]);

  useEffect(() => {
    if (planOptions.length === 0) {
      setSelectedPackageId(null);
      return;
    }

    setSelectedPackageId((prev) => {
      if (prev && planOptions.some((pkg) => pkg.identifier === prev)) {
        return prev;
      }

      const monthlyId = monthlyPackage?.identifier;
      if (monthlyId && planOptions.some((pkg) => pkg.identifier === monthlyId)) {
        return monthlyId;
      }

      return planOptions[0].identifier;
    });
  }, [planOptions, monthlyPackage?.identifier]);

  const selectedPackage = useMemo(
    () => planOptions.find((pkg) => pkg.identifier === selectedPackageId) ?? null,
    [planOptions, selectedPackageId],
  );
  const hasLoadedPlanOptions = loadState === "success" && planOptions.length > 0;
  const availablePackageCount = packages?.availablePackages.length ?? 0;

  useEffect(() => {
    if (hasLoadedPlanOptions && loadError) {
      setLoadError(null);
    }
  }, [hasLoadedPlanOptions, loadError]);

  useEffect(() => {
    console.info("Billing page state", {
      platform: Capacitor.getPlatform(),
      isNativePlatform,
      loadState,
      availablePackageCount,
      selectedPackageIdentifier: selectedPackage?.identifier ?? null,
      hasLoadError: Boolean(loadError),
      hasUpgradeError: Boolean(upgradeError),
    });
  }, [
    availablePackageCount,
    isNativePlatform,
    loadError,
    loadState,
    selectedPackage?.identifier,
    upgradeError,
  ]);

  const recommendedPackageId = annualPackage?.identifier ?? planOptions[0]?.identifier ?? null;
  const savingsLabel = useMemo(
    () => getAnnualSavingsLabel(annualPackage, monthlyPackage),
    [annualPackage, monthlyPackage],
  );

  const selectPackage = (pkg: AvailableUpgradePackage) => {
    setSelectedPackageId(pkg.identifier);
  };

  const handlePurchase = useCallback(async () => {
    if (!selectedPackage) {
      return;
    }

    setPurchaseAttempted(true);
    await purchaseUpgradePackage(selectedPackage);
  }, [purchaseUpgradePackage, selectedPackage]);

  const handleRetryLoadPlans = useCallback(() => {
    setLoadError(null);
    setLoadState("loading");
    setReloadAttempt((attempt) => attempt + 1);
  }, []);

  const handleRestorePurchases = useCallback(async () => {
    setRestoreState("restoring");

    if (!isNativePlatform) {
      setRestoreState("success");
      return;
    }

    try {
      await restoreNativePurchases();
      await syncEntitlement();
      await refreshEntitlement();
      setRestoreState("success");
    } catch {
      setRestoreState("error");
    }
  }, [isNativePlatform, refreshEntitlement]);

  const canPurchase = Boolean(selectedPackage && loadState === "success");
  return (
    <div className="mx-auto max-w-[930px] space-y-3 pb-3 pt-1 text-zinc-100 sm:px-4 sm:pb-5 sm:pt-2 md:space-y-4">
      <Card className="relative overflow-hidden rounded-[1.35rem] border-white/15 bg-[#070808] shadow-[0_14px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] md:rounded-[1.65rem]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.22]"
          style={{ backgroundImage: "url('/images/paywall-stone-bg.png')" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_30%,rgba(16,185,129,0.13),transparent_26%),linear-gradient(135deg,rgba(0,0,0,0.06),rgba(0,0,0,0.82))]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />
        <CardContent className="relative z-10 p-6 sm:p-9 md:p-10">
          <div className="min-w-0">
            <div className="flex items-start gap-5 md:gap-7">
              <span className="relative flex h-20 w-20 shrink-0 overflow-hidden rounded-[1.45rem] bg-[linear-gradient(145deg,rgba(236,253,245,0.7)_0%,rgba(110,231,183,0.72)_18%,rgba(5,150,105,0.58)_42%,rgba(6,78,59,0.72)_68%,rgba(255,255,255,0.22)_100%)] p-[1px] shadow-[0_16px_34px_rgba(0,0,0,0.52),0_0_30px_rgba(52,211,153,0.18)] md:h-28 md:w-28 md:rounded-[1.7rem]">
                <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[1.35rem] bg-[linear-gradient(145deg,rgba(255,255,255,0.16),rgba(16,185,129,0.16)_28%,rgba(0,0,0,0.62)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.24),inset_0_-18px_28px_rgba(0,0,0,0.58)] md:rounded-[1.6rem]">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-1.5 z-20 rounded-[1rem] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] md:rounded-[1.25rem]"
                  />
                  <Image
                    src="/images/creator-logo.png"
                    alt=""
                    width={112}
                    height={112}
                    className="relative z-10 h-full w-full object-cover"
                  />
                </span>
              </span>
              <div className="min-w-0 pt-1 md:pt-1.5">
                <p className="text-[0.72rem] font-bold uppercase tracking-[0.32em] text-emerald-300 md:text-[0.9rem] md:tracking-[0.36em]">
                  CREATOR PRO
                </p>
                <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-normal text-white md:text-4xl">
                  Build beyond the free roadmap
                </h2>
              </div>
            </div>
            <p className="mt-7 max-w-[31rem] text-lg leading-8 text-zinc-300 md:mt-8 md:text-2xl md:leading-10">
              Upgrade when your system outgrows the free tier. CREATOR Pro gives you more room
              for goals, projects, tasks, and habits.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden rounded-[1.35rem] border-white/15 bg-[#070808] shadow-[0_14px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] md:rounded-[1.65rem]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.14]"
          style={{ backgroundImage: "url('/images/paywall-stone-bg.png')" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(16,185,129,0.06),transparent_36%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.75))]"
        />
        <CardContent className="relative z-10 space-y-3 p-4 md:space-y-4 md:p-5">
          <div>
            <h2 className="text-xl font-semibold tracking-normal text-white md:text-2xl">Choose your plan</h2>
            <p className="mt-1 text-sm leading-5 text-zinc-400 md:mt-1.5 md:text-base md:leading-6">
              Monthly or annual access to the full CREATOR Pro planning layer.
            </p>
          </div>
          {isPlus ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-emerald-300/35 bg-emerald-400/[0.075] p-4 md:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-emerald-300">
                      Active subscription
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {UPGRADE_PLAN_NAME}
                    </p>
                    <p className="mt-1 max-w-2xl text-sm leading-5 text-zinc-300">
                      Manage your subscription through the store or web billing portal you used to
                      purchase it.
                    </p>
                  </div>
                  <span className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-semibold text-zinc-300">
                    Subscription managed through your purchase provider
                  </span>
                </div>
                {renewalDate && (
                  <p className="mt-3 text-xs font-medium text-zinc-500">
                    Current period ends {renewalDate}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 md:space-y-4">
              {loadState === "loading" && (
                <div
                  className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-sm text-zinc-400 sm:rounded-2xl sm:px-4 sm:py-3"
                  role="status"
                >
                  Loading CREATOR Pro plans...
                </div>
              )}
              {loadState === "error" && loadError && !hasLoadedPlanOptions && (
                <div
                  className="flex flex-col gap-2 rounded-xl border border-rose-300/15 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 sm:rounded-2xl sm:px-4 sm:py-3 md:flex-row md:items-center md:justify-between"
                  role="alert"
                >
                  <span>{PLAN_LOAD_FAILED_MESSAGE}</span>
                  <Button
                    className="h-8 rounded-lg border-rose-200/20 bg-transparent px-3 text-xs font-semibold text-rose-100 hover:bg-rose-100/10"
                    type="button"
                    variant="outline"
                    onClick={handleRetryLoadPlans}
                  >
                    Retry
                  </Button>
                </div>
              )}

              {planOptions.length > 0 && (
                <div className="space-y-2.5 md:space-y-3">
                  {planOptions.map((pkg) => {
                    const product = getPackageProduct(pkg);
                    const priceLabel = getProductPriceLabel(product);
                    const cadenceLabel = getBillingCadenceLabel(pkg);
                    const planDescription = getPlanDescription(pkg);
                    const planTitle = getPlanLabel(pkg);
                    const isSelected = selectedPackage?.identifier === pkg.identifier;
                    const isRecommended = recommendedPackageId === pkg.identifier;
                    const compactSavingsLabel = savingsLabel?.replace(
                      / vs 12 months of the monthly plan\.$/,
                      "",
                    );

                    const priceSuffix =
                      cadenceLabel === "Annual"
                        ? "/ year"
                        : cadenceLabel === "Monthly"
                          ? "/ month"
                          : "";
                    const cardClasses = isSelected
                      ? selectedPlanOuterClassName
                      : unselectedPlanClassName;
                    const planCardContent = (
                      <>
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-5 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent"
                        />
                        <span className="relative z-10 min-w-0 flex-1">
                          <span className="min-w-0">
                            <span
                              className="block text-lg font-semibold leading-tight text-zinc-100 md:text-xl"
                              style={isSelected ? selectedPlanTextOutlineStyle : undefined}
                            >
                              {planTitle}
                            </span>
                            <span
                              className={[
                                "mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-2xl font-semibold tracking-normal md:mt-1.5",
                                isSelected ? "text-emerald-300" : "text-white",
                              ].join(" ")}
                              style={isSelected ? selectedPlanTextOutlineStyle : undefined}
                            >
                              {priceLabel}
                              {priceSuffix && (
                                <span
                                  className="text-sm font-medium text-zinc-400 md:text-base"
                                  style={isSelected ? selectedPlanTextOutlineStyle : undefined}
                                >
                                  {priceSuffix}
                                </span>
                              )}
                            </span>
                            {cadenceLabel === "Annual" &&
                              compactSavingsLabel &&
                              (isSelected || isRecommended) && (
                                <span
                                  className="mt-0.5 block text-xs font-semibold text-emerald-300 md:mt-1 md:text-sm"
                                  style={isSelected ? selectedPlanTextOutlineStyle : undefined}
                                >
                                  {compactSavingsLabel}
                                </span>
                              )}
                          </span>
                        </span>
                        {isRecommended && (
                          <span className={`relative z-10 ${recommendedPillClassName}`}>
                            Recommended
                          </span>
                        )}
                      </>
                    );

                    return (
                      <button
                        key={pkg.identifier}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => selectPackage(pkg)}
                        aria-label={`${planTitle}: ${planDescription}`}
                        className={cardClasses}
                      >
                        {isSelected ? (
                          <span className={selectedPlanInnerClassName}>
                            {planCardContent}
                          </span>
                        ) : (
                          planCardContent
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {planOptions.length === 0 && loadState === "success" && (
                <p
                  className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-sm text-zinc-400 sm:rounded-2xl sm:px-4 sm:py-3"
                  role="status"
                >
                  No CREATOR Pro plans are available right now.
                </p>
              )}

              {purchaseAttempted && upgradeError && (
                <p
                  className="rounded-xl border border-rose-300/15 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 sm:rounded-2xl sm:px-4 sm:py-3"
                  role="alert"
                >
                  {PURCHASE_FAILED_MESSAGE}
                </p>
              )}

              {restoreState === "success" && (
                <p
                  className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200 sm:rounded-2xl sm:px-4 sm:py-3"
                  role="status"
                >
                  {isNativePlatform
                    ? "Purchases restored. Your access will update shortly."
                    : "Restore or manage purchases from the store or web billing portal you used to subscribe."}
                </p>
              )}

              {restoreState === "error" && (
                <p
                  className="rounded-xl border border-rose-300/15 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 sm:rounded-2xl sm:px-4 sm:py-3"
                  role="alert"
                >
                  {RESTORE_FAILED_MESSAGE}
                </p>
              )}

              <ul className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/[0.12] bg-white/[0.02] text-xs text-zinc-100 sm:text-sm">
                {PREMIUM_BENEFITS.map(({ label, Icon }) => (
                  <li
                    key={label}
                    className="flex min-h-20 items-center gap-3 border-white/[0.09] px-3 py-3 odd:border-r odd:border-b even:border-b [&:nth-child(n+3)]:border-b-0 md:gap-3.5 md:px-5 md:py-4"
                  >
                    <span
                      className={premiumIconShellClassName}
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5" strokeWidth={2.2} />
                    </span>
                    <span className="leading-4 md:leading-5">{label}</span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2.5">
                <div className="flex flex-col gap-2.5 md:gap-3">
                  <Button
                    className="relative h-12 w-full rounded-2xl border border-emerald-100/40 bg-[linear-gradient(145deg,#6ee7b7_0%,#22c55e_36%,#059669_68%,#064e3b_100%)] px-5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.58),0_16px_32px_rgba(16,185,129,0.22)] transition hover:bg-[linear-gradient(145deg,#a7f3d0_0%,#34d399_40%,#10b981_70%,#047857_100%)] focus:outline-none focus:ring-2 focus:ring-emerald-200/60 md:h-12 md:text-base"
                    type="button"
                    onClick={handlePurchase}
                    disabled={!canPurchase || isLaunching}
                  >
                    <span className="flex w-full items-center justify-center">
                      Upgrade to CREATOR Pro
                      <ArrowRight className="absolute right-4 h-5 w-5 md:right-5" aria-hidden="true" />
                    </span>
                  </Button>
                  <Button
                    className="h-10 w-full rounded-xl border-white/15 bg-transparent text-sm font-semibold text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-12px_24px_rgba(0,0,0,0.34)] hover:border-white/30 hover:bg-white/[0.04] md:h-11 md:text-base"
                    type="button"
                    variant="outline"
                    onClick={handleRestorePurchases}
                    disabled={restoreState === "restoring" || isLaunching}
                  >
                    Restore purchases
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-center gap-5 text-xs text-zinc-500 md:text-sm">
            <Link
              href="https://trycreator.app/legal/privacy"
              className="font-medium transition hover:text-zinc-100"
            >
              Privacy
            </Link>
            <span aria-hidden="true" className="h-4 w-px bg-zinc-500/70" />
            <Link
              href="https://trycreator.app/legal/terms"
              className="font-medium transition hover:text-zinc-100"
            >
              Terms
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default BillingPageClient;
