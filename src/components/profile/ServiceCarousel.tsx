"use client"

import { ProfileOffer } from "@/lib/types"
import {
  ServiceSourceListingCard,
  SourceListingCardSkeleton,
} from "./SourceListingCard"

type ServiceCarouselProps = {
  services: ProfileOffer[]
  loading: boolean
  error?: string | null
  onSelectService?: (service: ProfileOffer) => void
}

const skeletonCount = 3

export default function ServiceCarousel({
  services,
  loading,
  error,
  onSelectService,
}: ServiceCarouselProps) {
  const hasServices = services.length > 0
  const showSection = loading || Boolean(error) || hasServices

  if (!showSection) {
    return null
  }

  return (
    <section className="space-y-3 rounded-3xl border border-white/5 bg-black p-4 text-white shadow-[0_25px_80px_rgba(2,6,23,0.45)]">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.5em] text-white/60">
            Services
          </p>
        </div>
        {!loading && hasServices ? (
          <p className="text-xs uppercase tracking-[0.4em] text-white/40">
            {services.length} {services.length === 1 ? "service" : "services"}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pt-1">
        {loading
          ? Array.from({ length: skeletonCount }).map((_, index) => (
              <SourceListingCardSkeleton
                key={`service-skeleton-${index}`}
                className="snap-center min-w-[220px] flex-shrink-0"
              />
            ))
          : hasServices
            ? services.map((service) => (
                <ServiceSourceListingCard
                  key={service.id}
                  service={service}
                  onSelect={onSelectService}
                  className="snap-center min-w-[220px] flex-shrink-0"
                />
              ))
            : null}
      </div>
    </section>
  )
}
