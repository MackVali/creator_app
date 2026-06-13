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

const DetailChip = ({ label, value }: { label: string; value: string }) => (
  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/[0.055] px-2 py-1 text-[10px] leading-tight text-white/[0.72]">
    <span className="shrink-0 text-white/[0.42]">{label}</span>
    <span className="min-w-0 font-medium text-white/[0.82]">{value}</span>
  </span>
);

const DetailNote = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <p className="text-[10px] font-medium text-white/[0.46]">{label}</p>
    <p className="whitespace-pre-line text-[12px] leading-[1.5] text-white/[0.68]">
      {value}
    </p>
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

const DETAIL_SHEET_WIDTH_CLASS = "w-full max-w-[304px] sm:max-w-[320px]";
const DETAIL_SHEET_CTA_CLASS =
  "h-8 w-full border border-white/10 bg-zinc-800 text-xs font-medium text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-white/15 hover:bg-zinc-700 active:bg-zinc-900";

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
    const hadModalOpenClass = document.body.classList.contains("modal-open");

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.classList.add("modal-open");

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      if (!hadModalOpenClass) {
        document.body.classList.remove("modal-open");
      }
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
    if (productKindLabel) {
      detailRows.push({ label: "Type", value: productKindLabel });
    }

    productFulfillmentRows.forEach((row) => detailRows.push(row));
  } else {
    detailRows.push({ label: "Mode", value: serviceModeLabel });

    if (serviceCtaLabel) {
      detailRows.push({ label: "CTA", value: serviceCtaLabel });
    }
  }

  const serviceModeRows: { label: string; value: string }[] = [];
  if (serviceMode !== "bookable" && serviceTurnaround) {
    serviceModeRows.push({ label: "Turnaround", value: serviceTurnaround });
  }

  const detailTypeLabel = isProduct ? "product" : "service";
  const summaryMeta = isProduct
    ? [priceLabel, item.data.status === "published" ? "Live" : "Draft"]
    : [priceLabel, serviceDurationLabel, serviceAvailabilityLabel].filter(
        (value): value is string => Boolean(value),
      );

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto px-3 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(env(safe-area-inset-top,0px)+1rem)] sm:p-6">
      <div className="absolute inset-0 bg-black/[0.78] backdrop-blur-[2px]" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${title} ${detailTypeLabel} details`}
        className={`relative z-10 mx-auto flex max-h-[calc(100dvh_-_5.75rem_-_env(safe-area-inset-top,0px)_-_env(safe-area-inset-bottom,0px))] ${DETAIL_SHEET_WIDTH_CLASS} flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_12%_-18%,rgba(255,255,255,0.1),transparent_56%),linear-gradient(145deg,rgba(8,8,10,0.98)_0%,rgba(17,18,22,0.97)_56%,rgba(33,34,40,0.9)_100%)] text-white shadow-[0_24px_72px_-36px_rgba(0,0,0,1),0_14px_34px_-24px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.07)] sm:max-h-[calc(100dvh_-_3rem)] sm:rounded-[24px]`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0 pb-2 pt-2 [-webkit-overflow-scrolling:touch]">
          <div className="space-y-2">
            <div
              className={`mx-auto ${DETAIL_SHEET_WIDTH_CLASS} rounded-[18px] bg-black/20 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`}
            >
              <div className="relative aspect-[23/18]">
                <DetailMedia image={image} title={title} />
              </div>
            </div>

            <div className={`mx-auto ${DETAIL_SHEET_WIDTH_CLASS} px-2`}>
              <div className="space-y-2.5">
                <div className="space-y-1.5">
                  <p className="text-[1.02rem] font-semibold leading-tight text-white sm:text-[1.08rem]">
                    {title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-white/[0.58]">
                    {summaryMeta.map((value, index) => (
                      <span key={`${value}-${index}`} className="flex items-center gap-2">
                        {index > 0 ? (
                          <span className="h-1 w-1 rounded-full bg-white/[0.22]" />
                        ) : null}
                        <span className={index === 0 ? "text-amber-300" : undefined}>
                          {value}
                        </span>
                      </span>
                    ))}
                  </div>
                  {description ? (
                    <p className="pt-0.5 text-[12px] leading-[1.55] text-white/[0.68]">
                      {description}
                    </p>
                  ) : null}
                </div>

                {isProduct ? (
                  <>
                    {detailRows.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {detailRows.map((row) => (
                          <DetailChip
                            key={`${row.label}-${row.value}`}
                            label={row.label}
                            value={row.value}
                          />
                        ))}
                      </div>
                    ) : null}

                    {isDigitalProduct ? (
                      <DetailNote
                        label="Delivery"
                        value="Instant deliverables are sent straight to your inbox once checkout is complete."
                      />
                    ) : null}

                    {showFulfillmentBlock && allowsMultipleUnits ? (
                      <p className="text-[11px] leading-4 text-amber-200/70">
                        Multiple units supported. Quantity controls arrive with cart.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    {detailRows.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {detailRows.map((row) => (
                          <DetailChip
                            key={`${row.label}-${row.value}`}
                            label={row.label}
                            value={row.value}
                          />
                        ))}
                      </div>
                    ) : null}
                    <p className="text-[12px] leading-[1.5] text-white/[0.68]">
                      {SERVICE_MODE_NOTES[serviceMode]}
                    </p>
                    {serviceModeRows.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {serviceModeRows.map((row) => (
                          <DetailChip
                            key={`${row.label}-${row.value}`}
                            label={row.label}
                            value={row.value}
                          />
                        ))}
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      {serviceMode === "flat_rate" && serviceDeliverables ? (
                        <DetailNote label="Deliverables" value={serviceDeliverables} />
                      ) : null}
                      {serviceMode === "custom_quote" && serviceRequirements ? (
                        <DetailNote label="Requirements" value={serviceRequirements} />
                      ) : null}
                    </div>
                  </>
                )}

                {!isProduct && serviceTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {serviceTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-white/[0.52]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 bg-black/[0.1] px-0 pb-[calc(0.55rem+env(safe-area-inset-bottom,0px))] pt-2 sm:pb-2.5">
          <div className={`mx-auto ${DETAIL_SHEET_WIDTH_CLASS} space-y-1.5 px-2`}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                size="sm"
                className={DETAIL_SHEET_CTA_CLASS}
                onClick={handlePrimaryClick}
              >
                {primaryActionLabel}
              </Button>
              <Button
                size="sm"
                className={DETAIL_SHEET_CTA_CLASS}
                onClick={handleSecondaryClick}
              >
                {secondaryActionLabel}
              </Button>
            </div>
            {cartCount && cartCount > 0 ? (
              <p className="text-center text-[10px] text-white/[0.42]">
                {cartCount} item{cartCount === 1 ? "" : "s"} in cart
              </p>
            ) : null}
            {ctaFeedback ? (
              <p
                className={`text-center text-[11px] ${
                  isOwnerFeedback
                    ? "rounded-md bg-amber-200/10 px-2 py-1 font-medium text-amber-100"
                    : "font-medium text-white/[0.82]"
                }`}
              >
                {ctaFeedback}
              </p>
            ) : (
              <p className="text-center text-[10px] text-white/[0.38]">
                Commerce experience coming soon
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
