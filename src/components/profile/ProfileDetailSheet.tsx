"use client";

/* eslint-disable @next/next/no-img-element -- Product/service detail media should match the compact profile card treatment. */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ProfileOffer } from "@/lib/types";
import { SourceListing } from "@/types/source";
import {
  DEFAULT_SERVICE_MODE,
  PRODUCT_KIND_LABELS,
  QUANTITY_BEHAVIOR_LABELS,
  SERVICE_MODE_LABELS,
  ServiceMode,
  formatDuration,
  formatInventoryStatus,
  formatListingCurrency,
  formatServicePrice,
  resolveInventoryCount,
  resolveListingImage,
  resolveProductKind,
  resolveQuantityBehavior,
  resolveServiceDeliverables,
  resolveServiceMode,
  resolveServiceRequirements,
  resolveServiceTurnaround,
} from "./detailSheetUtils";

export type ProfileDetailSheetItem =
  | { type: "product"; data: SourceListing }
  | { type: "service"; data: ProfileOffer };

interface ProfileDetailSheetProps {
  item: ProfileDetailSheetItem | null;
  onClose: () => void;
  onProductAddToCart?: (product: SourceListing) => string;
  cartCount?: number;
  isOwner?: boolean;
}

const SheetRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-2.5 text-[9px] leading-tight uppercase tracking-[0.2em] text-white/[0.55]">
    <span>{label}</span>
    <span className="max-w-[58%] text-right font-semibold text-white/90">{value}</span>
  </div>
);

const DetailMedia = ({
  image,
  title,
}: {
  image: string | null;
  title: string;
}) => (
  <div className="relative h-full w-full overflow-hidden rounded-[14px] bg-zinc-900 shadow-[inset_0_-18px_34px_rgba(0,0,0,0.24)]">
    {image ? (
      <img
        src={image}
        alt={title}
        className="h-full w-full object-cover object-center"
        loading="lazy"
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.12),transparent_48%),linear-gradient(145deg,rgba(24,24,27,0.98),rgba(9,9,11,0.98))]">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/[0.35]">
          No image
        </span>
      </div>
    )}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.35] via-transparent to-white/[0.04]" />
  </div>
);

const SERVICE_MODE_NOTES: Record<ServiceMode, string> = {
  bookable: "Reserve a confirmed slot and a calendar invitation once the creator approves your booking.",
  flat_rate: "A packaged service with the deliverables below and a fixed turnaround window.",
  custom_quote: "Share your brief so the creator can reply with a scoped quote and next steps.",
};

export default function ProfileDetailSheet({
  item,
  onClose,
  onProductAddToCart,
  cartCount,
  isOwner = false,
}: ProfileDetailSheetProps) {
  const [ctaFeedback, setCtaFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!item) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [item]);

  useEffect(() => {
    if (!item) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose]);

  useEffect(() => {
    if (!ctaFeedback) {
      return;
    }

    const timer = window.setTimeout(() => setCtaFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [ctaFeedback]);

  if (!item) {
    return null;
  }

  const isProduct = item.type === "product";
  const title = item.data.title;
  const description = item.data.description?.trim();
  const image = isProduct
    ? resolveListingImage(item.data)
    : item.data.media_url?.trim() || null;

  const priceLabel = isProduct
    ? item.data.price !== null
      ? formatListingCurrency(item.data.price, item.data.currency)
      : "Pricing varies"
    : formatServicePrice(item.data.price_cents, item.data.currency) ?? "Price on request";

  const productMetadata = isProduct ? item.data.metadata ?? null : null;
  const productKind = isProduct ? resolveProductKind(productMetadata) : null;
  const quantityBehavior = isProduct ? resolveQuantityBehavior(productMetadata) : null;
  const inventoryCount = isProduct ? resolveInventoryCount(productMetadata) : null;
  const inventoryStatusLabel = isProduct
    ? formatInventoryStatus(item.data.inventory_status)
    : null;
  const quantityBehaviorLabel = quantityBehavior
    ? QUANTITY_BEHAVIOR_LABELS[quantityBehavior]
    : null;
  const productKindLabel = productKind ? PRODUCT_KIND_LABELS[productKind] : null;
  const isDigitalProduct = productKind === "digital";

  const productFulfillmentRows: { label: string; value: string }[] = [];
  if (inventoryCount !== null) {
    const roundedQuantity = Math.round(inventoryCount);
    const inventoryValue =
      roundedQuantity <= 0
        ? "Out of stock"
        : `${roundedQuantity.toLocaleString()} ${
            roundedQuantity === 1 ? "unit" : "units"
          } available`;
    productFulfillmentRows.push({ label: "Inventory", value: inventoryValue });
  }
  if (inventoryStatusLabel) {
    productFulfillmentRows.push({ label: "Availability", value: inventoryStatusLabel });
  }
  if (quantityBehaviorLabel) {
    productFulfillmentRows.push({ label: "Purchase style", value: quantityBehaviorLabel });
  }
  const showFulfillmentBlock = !isDigitalProduct && productFulfillmentRows.length > 0;
  const allowsMultipleUnits =
    quantityBehavior === "per_unit" || quantityBehavior === "always_available";

  const serviceMetadata = !isProduct ? item.data.metadata ?? null : null;
  const serviceMode = !isProduct
    ? resolveServiceMode(serviceMetadata) ?? DEFAULT_SERVICE_MODE
    : DEFAULT_SERVICE_MODE;
  const serviceModeLabel = SERVICE_MODE_LABELS[serviceMode];
  const serviceTurnaround = !isProduct
    ? resolveServiceTurnaround(serviceMetadata)
    : null;
  const serviceDeliverables = !isProduct
    ? resolveServiceDeliverables(serviceMetadata)
    : null;
  const serviceRequirements = !isProduct
    ? resolveServiceRequirements(serviceMetadata)
    : null;
  const serviceDurationLabel = !isProduct
    ? formatDuration(item.data.duration_minutes)
    : null;
  const serviceAvailabilityLabel = !isProduct
    ? formatInventoryStatus(item.data.inventory_status)
    : null;
  const serviceCtaLabel = !isProduct ? item.data.cta_label?.trim() : null;

  const detailRows: { label: string; value: string }[] = [];

  if (isProduct) {
    detailRows.push({
      label: "Status",
      value: item.data.status === "published" ? "Live" : "Draft",
    });
  } else {
    if (serviceDurationLabel) {
      detailRows.push({ label: "Duration", value: serviceDurationLabel });
    }

    if (serviceAvailabilityLabel) {
      detailRows.push({ label: "Availability", value: serviceAvailabilityLabel });
    }

    if (serviceCtaLabel) {
      detailRows.push({ label: "CTA", value: serviceCtaLabel });
    }
  }

  const serviceModeRows: { label: string; value: string }[] = [];
  if (serviceMode === "bookable" && serviceDurationLabel) {
    serviceModeRows.push({ label: "Duration", value: serviceDurationLabel });
  }
  if (serviceMode !== "bookable" && serviceTurnaround) {
    serviceModeRows.push({ label: "Turnaround", value: serviceTurnaround });
  }

  const detailTypeLabel = isProduct ? "product" : "service";

  const servicePrimaryActionLabel =
    serviceMode === "bookable"
      ? "Book now"
      : serviceMode === "flat_rate"
        ? "Start order"
        : "Request quote";

  const primaryActionLabel = isProduct ? "Add to cart" : servicePrimaryActionLabel;
  const secondaryActionLabel = isProduct ? "Buy now" : "Send inquiry";
  const servicePrimaryFeedback = `${servicePrimaryActionLabel} flow coming soon`;
  const secondaryFeedback = isProduct ? "Checkout flow coming next" : "Inquiry flow coming soon";
  const ownerFeedback = "You cannot purchase your own listing.";
  const isOwnerFeedback = ctaFeedback === ownerFeedback;

  const handlePrimaryClick = () => {
    if (isProduct && isOwner) {
      setCtaFeedback(ownerFeedback);
      return;
    }
    if (isProduct) {
      const message = onProductAddToCart?.(item.data) ?? "Cart flow coming next";
      setCtaFeedback(message);
      return;
    }
    setCtaFeedback(servicePrimaryFeedback);
  };
  const handleSecondaryClick = () => {
    if (isProduct && isOwner) {
      setCtaFeedback(ownerFeedback);
      return;
    }
    setCtaFeedback(secondaryFeedback);
  };

  const serviceTags =
    !isProduct && Array.isArray(item.data.tags)
      ? item.data.tags
          .map((tag) => tag?.trim())
          .filter((tag): tag is string => Boolean(tag))
      : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-3 pb-3 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/[0.78] backdrop-blur-[2px]" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${title} ${detailTypeLabel} details`}
        className="relative z-10 mx-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[22px] border border-white/10 bg-[radial-gradient(circle_at_12%_-18%,rgba(255,255,255,0.1),transparent_56%),linear-gradient(145deg,rgba(8,8,10,0.98)_0%,rgba(17,18,22,0.97)_56%,rgba(33,34,40,0.9)_100%)] text-white shadow-[0_24px_72px_-36px_rgba(0,0,0,1),0_14px_34px_-24px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.07)] sm:rounded-[24px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2">
          <span className="block h-0.5 w-9 rounded-full bg-white/[0.24]" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-5 pb-3 [-webkit-overflow-scrolling:touch] sm:px-3.5">
          <div className="space-y-2.5">
            <div className="mx-auto w-full max-w-[304px] rounded-[18px] bg-black/20 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:max-w-[320px]">
              <div className="relative aspect-[23/18]">
                <DetailMedia image={image} title={title} />
              </div>
            </div>

            <div className="space-y-0.5 px-0.5">
              <p className="text-lg font-semibold leading-tight text-white sm:text-xl">
                {title}
              </p>
              <p className="text-sm font-semibold text-amber-300 sm:text-base">{priceLabel}</p>
              {description ? (
                <p className="text-xs leading-5 text-white/[0.68]">{description}</p>
              ) : null}
            </div>

            {isProduct ? (
              <>
                {showFulfillmentBlock ? (
                  <div className="rounded-[14px] border border-white/10 bg-black/[0.18] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex items-start justify-between gap-2.5">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.22em] text-white/50">
                          Fulfillment
                        </p>
                        <p className="text-xs font-semibold text-white/90">
                          {productKindLabel ?? "Physical fulfillment"}
                        </p>
                      </div>
                      {productKindLabel ? (
                        <span className="rounded-full border border-white/[0.15] px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/60">
                          {productKindLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2.5 space-y-2">
                      {productFulfillmentRows.map((row) => (
                        <SheetRow key={row.label} label={row.label} value={row.value} />
                      ))}
                    </div>
                    {allowsMultipleUnits ? (
                      <p className="mt-2.5 text-[9px] leading-4 uppercase tracking-[0.18em] text-amber-200/75">
                        Multiple units supported - quantity picker arriving with the cart
                        experience.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {isDigitalProduct ? (
                  <div className="rounded-[14px] border border-white/10 bg-black/[0.18] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex items-start justify-between gap-2.5">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.22em] text-white/50">
                          Delivery
                        </p>
                        <p className="text-xs font-semibold text-white/90">Digital product</p>
                      </div>
                      <span className="rounded-full border border-white/[0.15] px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/60">
                        {productKindLabel ?? "Digital"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/[0.68]">
                      Instant deliverables are sent straight to your inbox once checkout is
                      complete.
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-[14px] border border-white/10 bg-black/[0.18] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-start justify-between gap-2.5">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.22em] text-white/50">
                      Service mode
                    </p>
                    <p className="text-xs font-semibold text-white/90">{serviceModeLabel}</p>
                  </div>
                  <span className="rounded-full border border-white/[0.15] px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/60">
                    {serviceModeLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-white/[0.68]">
                  {SERVICE_MODE_NOTES[serviceMode]}
                </p>
                {serviceModeRows.length > 0 ? (
                  <div className="mt-2.5 flex flex-col gap-2">
                    {serviceModeRows.map((row) => (
                      <SheetRow key={row.label} label={row.label} value={row.value} />
                    ))}
                  </div>
                ) : null}
                {serviceMode === "flat_rate" && serviceDeliverables ? (
                  <div className="mt-2.5 space-y-0.5">
                    <p className="text-[9px] uppercase tracking-[0.22em] text-white/50">
                      Deliverables
                    </p>
                    <p className="text-xs leading-5 text-white/[0.68] whitespace-pre-line">
                      {serviceDeliverables}
                    </p>
                  </div>
                ) : null}
                {serviceMode === "custom_quote" && serviceRequirements ? (
                  <div className="mt-2.5 space-y-0.5">
                    <p className="text-[9px] uppercase tracking-[0.22em] text-white/50">
                      Requirements
                    </p>
                    <p className="text-xs leading-5 text-white/[0.68] whitespace-pre-line">
                      {serviceRequirements}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {detailRows.length > 0 ? (
              <div className="rounded-[14px] border border-white/10 bg-black/[0.18] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex flex-col gap-2">
                  {detailRows.map((row) => (
                    <SheetRow key={row.label} label={row.label} value={row.value} />
                  ))}
                </div>
              </div>
            ) : null}

            {!isProduct && serviceTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {serviceTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/[0.15] px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white/[0.65]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-white/[0.07] bg-black/[0.18] px-3 py-3 sm:px-3.5">
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button size="sm" className="w-full text-xs" onClick={handlePrimaryClick}>
                {primaryActionLabel}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs text-white"
                onClick={handleSecondaryClick}
              >
                {secondaryActionLabel}
              </Button>
            </div>
            {cartCount && cartCount > 0 ? (
              <p className="text-center text-[9px] uppercase tracking-[0.24em] text-white/40">
                {cartCount} item{cartCount === 1 ? "" : "s"} in cart
              </p>
            ) : null}
            {ctaFeedback ? (
              <p
                className={`text-center text-xs ${
                  isOwnerFeedback
                    ? "rounded-lg border border-amber-200/40 bg-amber-200/10 px-2.5 py-1.5 font-semibold text-amber-100"
                    : "font-semibold text-white/90"
                }`}
              >
                {ctaFeedback}
              </p>
            ) : (
              <p className="text-center text-[9px] uppercase tracking-[0.24em] text-white/40">
                Commerce experience coming soon
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
