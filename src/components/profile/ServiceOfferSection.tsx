"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { ProfileOffer } from "@/lib/types";
import {
  formatDuration,
  formatInventoryStatus,
  formatServicePrice,
} from "./detailSheetUtils";

interface ServiceOfferSectionProps {
  services: ProfileOffer[];
  loading?: boolean;
  error?: string | null;
  onSelectService?: (service: ProfileOffer) => void;
}

const skeletonCount = 3;

export default function ServiceOfferSection({
  services,
  loading = false,
  error,
  onSelectService,
}: ServiceOfferSectionProps) {
  const hasOffers = services.length > 0;
  const shouldRender = loading || Boolean(error) || hasOffers;

  if (!shouldRender) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-3xl border border-white/5 bg-black/70 p-5 text-white shadow-[0_25px_80px_rgba(2,6,23,0.45)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.5em] text-white/60">Services</p>
          <h2 className="text-2xl font-semibold text-white">Bookable experiences</h2>
        </div>

        {hasOffers ? (
          <p className="text-xs uppercase tracking-[0.4em] text-white/40">
            {services.length} {services.length === 1 ? "service" : "services"}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {loading
          ? Array.from({ length: skeletonCount }).map((_, index) => (
              <ServiceCardSkeleton key={`service-skeleton-${index}`} />
            ))
          : hasOffers
            ? services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onSelect={onSelectService}
                />
              ))
            : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-white/60">
                <p className="font-semibold text-white">No services yet</p>
                <p className="mt-2 text-xs text-white/40">
                  Connect your services in the profile builder and they will appear here for visitors to book.
                </p>
              </div>
            )}
      </div>
    </section>
  );
}

function ServiceCard({
  service,
  onSelect,
}: {
  service: ProfileOffer;
  onSelect?: (service: ProfileOffer) => void;
}) {
  const priceLabel = formatServicePrice(service.price_cents, service.currency);
  const durationLabel = formatDuration(service.duration_minutes);
  const availabilityLabel = formatInventoryStatus(service.inventory_status);
  const ctaLabel = service.cta_label?.trim() || "Book now";

  const handleSelect = () => {
    onSelect?.(service);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLArticleElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSelect();
    }
  };

  const handleCtaClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    handleSelect();
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${service.title}`}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      className="flex h-full flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/80 to-neutral-950/90 p-5 transition hover:-translate-y-0.5 hover:shadow-[0_15px_35px_rgba(0,0,0,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold leading-tight text-white">{service.title}</h3>
          {service.description ? (
            <p className="mt-2 text-sm text-white/60">{service.description}</p>
          ) : null}
        </div>
        {availabilityLabel ? (
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-white/60">
            {availabilityLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-white/60">
        {priceLabel ? (
          <p className="text-base font-semibold text-white">{priceLabel}</p>
        ) : (
          <span className="uppercase tracking-[0.4em] text-white/40">Price on request</span>
        )}

        {durationLabel ? (
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.4em] text-white/70">
            {durationLabel}
          </span>
        ) : null}
      </div>

      {service.tags && service.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.35em] text-white/60">
          {service.tags.filter(Boolean).map((tag) => (
            <span
              key={`${service.id}-${tag}`}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-white/60"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-1 items-end">
        <Button size="sm" onClick={handleCtaClick} className="w-full">
          {ctaLabel}
        </Button>
      </div>
    </article>
  );
}

function ServiceCardSkeleton() {
  return (
    <div className="h-full animate-pulse rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <div className="h-5 w-2/3 rounded-full bg-white/20" />
      <div className="mt-3 h-3 w-1/2 rounded-full bg-white/10" />
      <div className="mt-4 h-3 w-1/4 rounded-full bg-white/10" />
      <div className="mt-6 flex h-9 items-center justify-between rounded-xl border border-white/20 bg-white/5 px-4">
        <span className="h-3 w-16 rounded-full bg-white/10" />
        <span className="h-3 w-10 rounded-full bg-white/10" />
      </div>
    </div>
  );
}
