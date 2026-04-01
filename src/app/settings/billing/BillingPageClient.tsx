"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEntitlement } from "@/components/entitlement/EntitlementProvider";
import { useUpgradeAction } from "@/lib/entitlements/useUpgradeAction";

import type { Product as RevenueCatWebProduct } from "@revenuecat/purchases-js";
import type { PurchasesStoreProduct } from "@revenuecat/purchases-typescript-internal-esm";

const PREMIUM_BENEFITS = [
  "Unlimited private templates, prompts, and retrospectives.",
  "Priority chat support plus early access drops and experiments.",
  "Faster sync, deeper backups, and uninterrupted access on all devices.",
];
const UPGRADE_PLAN_NAME = "CREATOR PLUS";

type UpgradeActionReturn = ReturnType<typeof useUpgradeAction>;
type LoadedUpgradePackages = Awaited<
  ReturnType<UpgradeActionReturn["loadUpgradePackages"]>
>;
type AvailableUpgradePackage = LoadedUpgradePackages["availablePackages"][number];
type RevenueCatProduct = RevenueCatWebProduct | PurchasesStoreProduct;
type PackageLoadState = "idle" | "loading" | "success" | "error";

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
  return pkg.identifier ?? "Plan";
}

function getPlanDescription(pkg: AvailableUpgradePackage) {
  const product = getPackageProduct(pkg);
  if (product?.description) {
    return product.description;
  }

  return pkg.identifier ?? "Premium access";
}

function getPlanLabel(pkg: AvailableUpgradePackage) {
  const product = getPackageProduct(pkg);
  return product?.title ?? UPGRADE_PLAN_NAME;
}

function BillingPageClient() {
  const { tier, isPlus, is_active, isReady, current_period_end } = useEntitlement();
  const { state: upgradeState, loadUpgradePackages, purchaseUpgradePackage } =
    useUpgradeAction();
  const { isLaunching, error: upgradeError } = upgradeState;
  const planLabel = tier || "CREATOR";
  const statusLabel = !isReady ? "Loading" : is_active ? "Active" : "Free plan";
  const renewalDate = formatRenewalDate(current_period_end);
  const [packages, setPackages] = useState<LoadedUpgradePackages | null>(null);
  const [loadState, setLoadState] = useState<PackageLoadState>("idle");
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  useEffect(() => {
    if (isPlus) {
      setPackages(null);
      setLoadState("idle");
      setLoadError(null);
      setSelectedPackageId(null);
      return;
    }

    let isMounted = true;
    setLoadState("loading");
    setLoadError(null);

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
        setLoadError(normalizedError);
        setLoadState("error");
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isPlus, loadUpgradePackages]);

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

    await purchaseUpgradePackage(selectedPackage);
  }, [purchaseUpgradePackage, selectedPackage]);

  const canPurchase = selectedPackage && loadState === "success";
  const cadenceForCta = selectedPackage ? getBillingCadenceLabel(selectedPackage) : "plan";

  return (
    <div className="space-y-6">
      <Card className="bg-[#15161A]/80 border-white/5">
        <CardHeader className="items-center gap-3">
          <CardTitle>Billing overview</CardTitle>
          <span className="ml-auto rounded-full border border-white/10 px-3 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-zinc-300">
            {statusLabel}
          </span>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1">
            <p className="text-[0.65rem] uppercase tracking-[0.3em] text-zinc-400">Current plan</p>
            <p className="text-3xl font-semibold text-zinc-100">{planLabel}</p>
          </div>
          <div className="grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-zinc-500">Status</p>
              <p className="text-lg text-zinc-100">{statusLabel}</p>
            </div>
            {renewalDate && (
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.3em] text-zinc-500">
                  Renewal date
                </p>
                <p className="text-lg text-zinc-100">{renewalDate}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#15161A]/80 border-white/5">
        <CardHeader className="gap-1">
          <CardTitle>Choose your plan</CardTitle>
          <CardDescription>
            Select the cadence that fits your workflow and unlock {UPGRADE_PLAN_NAME}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isPlus ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-300">
                You&apos;re already on {UPGRADE_PLAN_NAME}. Manage your subscription through the
                store or web billing portal you used to purchase it.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button className="w-full sm:w-auto" type="button" disabled>
                  Subscription managed through third-party billing
                </Button>
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-zinc-400 transition hover:text-zinc-100"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {loadState === "loading" && (
                <p className="text-sm text-zinc-400">Loading plans…</p>
              )}
              {loadError && (
                <p className="text-sm text-rose-400" role="alert">
                  {loadError.message}
                </p>
              )}

              {planOptions.length > 0 && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {planOptions.map((pkg) => {
                      const product = getPackageProduct(pkg);
                      const priceLabel = getProductPriceLabel(product);
                      const cadenceLabel = getBillingCadenceLabel(pkg);
                      const planDescription = getPlanDescription(pkg);
                      const planTitle = getPlanLabel(pkg);
                      const isSelected = selectedPackage?.identifier === pkg.identifier;
                      const isRecommended = recommendedPackageId === pkg.identifier;

                      const cardClasses = [
                        "rounded-2xl border px-5 py-6 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400",
                        isSelected
                          ? "border-emerald-500 bg-white/5 shadow-[0_0_0_3px] shadow-emerald-600/20"
                          : "border-white/5 hover:border-white/40 hover:bg-white/5",
                      ].join(" ");

                      return (
                        <button
                          key={pkg.identifier}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => selectPackage(pkg)}
                          className={`${cardClasses} ${
                            !isSelected ? "hover:shadow-[0_0_0_1px] hover:shadow-white/20" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-zinc-500">
                                {cadenceLabel} plan
                              </p>
                              <p className="text-lg font-semibold text-zinc-100">{planTitle}</p>
                            </div>
                            {isRecommended && (
                              <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-emerald-300">
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="mt-4 text-3xl font-semibold text-zinc-100">{priceLabel}</p>
                          <p className="mt-2 text-sm text-zinc-400">{planDescription}</p>
                        </button>
                      );
                    })}
                  </div>
                  {savingsLabel && (
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-300">
                      {savingsLabel}
                    </p>
                  )}
                </div>
              )}

              {planOptions.length === 0 && loadState === "success" && (
                <p className="text-sm text-zinc-400">No plans are available right now.</p>
              )}

              {upgradeError && (
                <p className="text-sm text-rose-400" role="alert">
                  {upgradeError.message}
                </p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  className="w-full sm:w-auto"
                  type="button"
                  onClick={handlePurchase}
                  disabled={!canPurchase}
                  isLoading={isLaunching}
                >
                  {canPurchase
                    ? `Start ${UPGRADE_PLAN_NAME} ${cadenceForCta.toLowerCase()}`
                    : "Select a plan"}
                </Button>
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-zinc-400 transition hover:text-zinc-100"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#15161A]/60 border-white/5">
        <CardHeader className="gap-1">
          <CardTitle>Premium benefits</CardTitle>
          <CardDescription>A few highlights you unlock with CREATOR PLUS.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-zinc-300">
            {PREMIUM_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-400"
                />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default BillingPageClient;
