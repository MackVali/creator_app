"use client"

import { cn } from "@/lib/utils"
import type { ProfileOffer } from "@/lib/types"
import type { SourceListing } from "@/types/source"
import { formatListingCurrency, resolveListingImage } from "./detailSheetUtils"

const listingInlineStatusLabels: Record<SourceListing["status"], string> = {
  draft: "Draft",
  queued: "Queued",
  published: "Available",
  needs_attention: "Needs attention",
}

const listingInlineStatusTextClass: Record<SourceListing["status"], string> = {
  draft: "text-zinc-500",
  queued: "text-zinc-400",
  published: "text-emerald-300",
  needs_attention: "text-amber-300",
}

type SourceListingCardProps = {
  image: string | null
  title: string
  priceLabel: string
  status: SourceListing["status"]
  secondaryLabel?: string | null
  selected?: boolean
  onClick?: () => void
  ariaLabel?: string
  className?: string
}

export function SourceListingCard({
  image,
  title,
  priceLabel,
  status,
  secondaryLabel,
  selected = false,
  onClick,
  ariaLabel,
  className,
}: SourceListingCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel ?? `Open details for ${title}`}
      onClick={onClick}
      className={cn(
        "goal-card group flex h-full transform-gpu flex-col overflow-hidden !rounded-2xl !border-white/10 !bg-[radial-gradient(circle_at_12%_-18%,rgba(255,255,255,0.1),transparent_56%),linear-gradient(145deg,rgba(8,8,10,0.98)_0%,rgba(17,18,22,0.96)_56%,rgba(33,34,40,0.78)_100%)] text-left text-[11px] text-zinc-300 !shadow-[0_18px_38px_-30px_rgba(0,0,0,0.98),0_8px_18px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.07)] transition duration-200 hover:-translate-y-px hover:!border-white/25 hover:brightness-110 active:translate-y-px active:scale-[0.985] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 select-none",
        selected
          ? "!border-white/35 !shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_20px_42px_-28px_rgba(255,255,255,0.34),0_16px_36px_-26px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.1)] brightness-110"
          : "hover:!shadow-[0_20px_42px_-30px_rgba(255,255,255,0.22),0_14px_30px_-22px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.08)]",
        className,
      )}
    >
      <div className="relative mx-1 mt-1 h-24 overflow-hidden rounded-t-lg bg-zinc-900 shadow-[inset_0_-18px_32px_rgba(0,0,0,0.22)]">
        {image ? (
          <img
            src={image}
            alt={title}
            className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03] group-hover:brightness-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.12),transparent_48%),linear-gradient(145deg,rgba(24,24,27,0.98),rgba(9,9,11,0.98))] text-zinc-500">
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">
              No image
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/[0.04]" />
      </div>
      <div className="flex flex-grow flex-col gap-1.5 px-3 py-3">
        <p className="text-[11px] font-semibold leading-snug text-white line-clamp-2">
          {title}
        </p>
        <p className="text-[10px] font-medium text-zinc-300">{priceLabel}</p>
        {secondaryLabel ? (
          <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            {secondaryLabel}
          </span>
        ) : null}
        <p
          className={cn(
            "text-[9px] font-semibold uppercase tracking-[0.24em]",
            listingInlineStatusTextClass[status],
          )}
        >
          {listingInlineStatusLabels[status]}
        </p>
      </div>
    </button>
  )
}

export function ProductSourceListingCard({
  product,
  onSelect,
  className,
}: {
  product: SourceListing
  onSelect?: (product: SourceListing) => void
  className?: string
}) {
  return (
    <SourceListingCard
      image={resolveListingImage(product)}
      title={product.title}
      priceLabel={
        product.price !== null
          ? formatListingCurrency(product.price, product.currency)
          : "Price TBD"
      }
      status={product.status}
      onClick={() => onSelect?.(product)}
      className={className}
    />
  )
}

export function ServiceSourceListingCard({
  service,
  onSelect,
  className,
}: {
  service: ProfileOffer
  onSelect?: (service: ProfileOffer) => void
  className?: string
}) {
  return (
    <SourceListingCard
      image={resolveServiceImage(service)}
      title={service.title}
      priceLabel={formatOfferCurrency(service.price_cents, service.currency)}
      status={service.is_active ? "published" : "draft"}
      secondaryLabel={formatServiceDurationLabel(service.duration_minutes)}
      onClick={() => onSelect?.(service)}
      className={className}
    />
  )
}

export function SourceListingCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-[178px] animate-pulse overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 p-1",
        className,
      )}
    >
      <div className="h-24 rounded-t-lg bg-white/10" />
      <div className="px-3 py-3">
        <div className="h-3 w-28 rounded-full bg-white/20" />
        <div className="mt-2 h-3 w-20 rounded-full bg-white/10" />
        <div className="mt-2 h-2 w-16 rounded-full bg-white/10" />
      </div>
    </div>
  )
}

function formatOfferCurrency(priceCents?: number | null, currency?: string | null) {
  if (typeof priceCents !== "number" || !currency) {
    return "Price TBD"
  }

  return formatListingCurrency(priceCents / 100, currency)
}

function formatServiceDurationLabel(minutes?: number | null) {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return null

  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`
  }

  if (minutes < 1440) {
    const hours = minutes / 60
    const displayHours = Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(1)))
    return `${displayHours} ${displayHours === "1" ? "hour" : "hours"}`
  }

  const days = minutes / 1440
  const displayDays = Number.isInteger(days) ? String(days) : String(Number(days.toFixed(1)))
  return `${displayDays} ${displayDays === "1" ? "day" : "days"}`
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
