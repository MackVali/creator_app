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
    <section className="space-y-2 text-white">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-zinc-500">
            Services
          </p>
        </div>
        {!loading && hasServices ? (
          <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">
            {services.length} {services.length === 1 ? "service" : "services"}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-start gap-3">
        {loading
          ? Array.from({ length: skeletonCount }).map((_, index) => (
              <SourceListingCardSkeleton
                key={`service-skeleton-${index}`}
              />
            ))
          : hasServices
            ? services.map((service) => (
                <ServiceSourceListingCard
                  key={service.id}
                  service={service}
                  onSelect={onSelectService}
                />
              ))
            : null}
      </div>
    </section>
  )
}
