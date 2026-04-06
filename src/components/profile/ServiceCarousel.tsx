"use client"

import type { KeyboardEvent } from "react"
import { ProfileOffer } from "@/lib/types"
import {
  formatDuration,
  formatInventoryStatus,
  formatServicePrice,
} from "./detailSheetUtils"

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
              <div
                key={`service-skeleton-${index}`}
                className="snap-center min-w-[220px] animate-pulse rounded-2xl border border-white/10 bg-slate-900/60 p-3"
              >
                <div className="mb-3 h-32 w-full rounded-xl bg-white/10" />
                <div className="h-3 w-28 rounded-full bg-white/20" />
                <div className="mt-2 h-3 w-20 rounded-full bg-white/10" />
              </div>
            ))
          : hasServices
            ? services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onSelect={onSelectService}
                />
              ))
            : (
              <div className="snap-center min-w-[220px] rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-white/70">
                <p className="font-medium text-white">No services yet</p>
                <p className="mt-1 text-xs text-white/60">
                  Publish a service in Source and it automatically appears here.
                </p>
              </div>
            )}
      </div>
    </section>
  )
}

type ServiceCardProps = {
  service: ProfileOffer
  onSelect?: (service: ProfileOffer) => void
}

function ServiceCard({ service, onSelect }: ServiceCardProps) {
  const image = resolveServiceImage(service)
  const priceLabel = formatServicePrice(service.price_cents, service.currency)
  const durationLabel = formatDuration(service.duration_minutes)
  const availabilityLabel = formatInventoryStatus(service.inventory_status)
  const secondaryLabel = durationLabel ?? availabilityLabel ?? "Live"

  const handleSelect = () => {
    onSelect?.(service)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      handleSelect()
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${service.title}`}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      className="snap-center min-w-[220px] flex-shrink-0 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-3 text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(0,0,0,0.65)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
    >
      <div className="relative mb-3 h-32 overflow-hidden rounded-xl bg-gradient-to-b from-slate-800 to-slate-900">
        {image ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${image})` }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-white/40">
            Service
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col justify-between gap-1 text-sm">
        <p className="font-semibold leading-tight">{service.title}</p>
        {service.description ? (
          <p className="text-xs text-white/60">{service.description}</p>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/70">
        {priceLabel ? (
          <span className="font-mono text-sm text-white">{priceLabel}</span>
        ) : (
          <span className="text-white/60">Price on request</span>
        )}
        <span className="text-white/40">{secondaryLabel}</span>
      </div>
    </article>
  )
}

function resolveServiceImage(service: ProfileOffer) {
  const direct = service.media_url?.trim()
  if (direct) {
    return direct
  }

  const metadata = service.metadata
  if (!metadata) {
    return null
  }

  const imageFields = [
    "cover",
    "coverImage",
    "image",
    "imageUrl",
    "image_url",
    "heroImage",
    "hero",
    "thumbnail",
    "thumbnailUrl",
  ]

  for (const field of imageFields) {
    const value = metadata[field]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  const media = Array.isArray(metadata.media) ? metadata.media : []
  for (const entry of media) {
    if (!entry || typeof entry !== "object") continue
    const url = typeof entry.url === "string" ? entry.url.trim() : ""
    if (!url) continue
    const type = typeof entry.type === "string" ? entry.type.toLowerCase() : ""
    if (!type || type === "image" || type === "photo" || type === "cover") {
      return url
    }
  }

  return null
}
