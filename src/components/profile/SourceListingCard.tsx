"use client"

/* eslint-disable @next/next/no-img-element -- Match the Source listing card media treatment in a compact profile card. */

import { cn } from "@/lib/utils"
import type { ProfileOffer } from "@/lib/types"
import type { SourceListing } from "@/types/source"
import {
  listingInlineStatusLabels,
  listingInlineStatusTextClass,
  normalizeSourceListingCardProps,
} from "@/components/source/SourceListingCard"

export const PROFILE_SOURCE_LISTING_CARD_WIDTH = 100
export const PROFILE_SOURCE_LISTING_CARD_HEIGHT = 140
export const PROFILE_SOURCE_LISTING_IMAGE_HEIGHT = 72
export const PROFILE_SOURCE_LISTING_MEDIA_INSET = 4

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
        "goal-card group flex shrink-0 transform-gpu flex-col overflow-hidden !rounded-2xl !border-white/10 !bg-[radial-gradient(circle_at_12%_-18%,rgba(255,255,255,0.1),transparent_56%),linear-gradient(145deg,rgba(8,8,10,0.98)_0%,rgba(17,18,22,0.96)_56%,rgba(33,34,40,0.78)_100%)] text-left text-[11px] text-zinc-300 !shadow-[0_18px_38px_-30px_rgba(0,0,0,0.98),0_8px_18px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.07)] transition duration-200 hover:-translate-y-px hover:!border-white/25 hover:brightness-110 active:translate-y-px active:scale-[0.985] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 select-none",
        selected
          ? "!border-white/35 !shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_20px_42px_-28px_rgba(255,255,255,0.34),0_16px_36px_-26px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.1)] brightness-110"
          : "hover:!shadow-[0_20px_42px_-30px_rgba(255,255,255,0.22),0_14px_30px_-22px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.08)]",
        className,
      )}
      style={{
        width: PROFILE_SOURCE_LISTING_CARD_WIDTH,
        minWidth: PROFILE_SOURCE_LISTING_CARD_WIDTH,
        maxWidth: PROFILE_SOURCE_LISTING_CARD_WIDTH,
        height: PROFILE_SOURCE_LISTING_CARD_HEIGHT,
      }}
    >
      <div
        className="relative overflow-hidden rounded-t-lg bg-zinc-900 shadow-[inset_0_-18px_32px_rgba(0,0,0,0.22)]"
        style={{
          height: PROFILE_SOURCE_LISTING_IMAGE_HEIGHT,
          marginLeft: PROFILE_SOURCE_LISTING_MEDIA_INSET,
          marginRight: PROFILE_SOURCE_LISTING_MEDIA_INSET,
          marginTop: PROFILE_SOURCE_LISTING_MEDIA_INSET,
        }}
      >
        {image ? (
          <img
            src={image}
            alt={title}
            className="h-full w-full object-cover object-center transition duration-200 group-hover:scale-[1.03] group-hover:brightness-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.12),transparent_48%),linear-gradient(145deg,rgba(24,24,27,0.98),rgba(9,9,11,0.98))] text-zinc-500">
            <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/35">
              No image
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/[0.04]" />
      </div>
      <div className="flex min-h-0 flex-grow flex-col gap-0.5 px-2 py-1.5">
        <p className="text-[9px] font-semibold leading-tight text-white line-clamp-2">
          {title}
        </p>
        <p className="truncate text-[8px] font-medium text-zinc-300">{priceLabel}</p>
        {secondaryLabel ? (
          <span className="truncate text-[7px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            {secondaryLabel}
          </span>
        ) : null}
        <p
          className={cn(
            "mt-auto truncate text-[7px] font-semibold uppercase tracking-[0.14em]",
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
  const cardProps = normalizeSourceListingCardProps(product)

  return (
    <SourceListingCard
      {...cardProps}
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
  const cardProps = normalizeSourceListingCardProps(profileOfferToSourceListing(service))

  return (
    <SourceListingCard
      {...cardProps}
      onClick={() => onSelect?.(service)}
      className={className}
    />
  )
}

export function SourceListingCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "shrink-0 animate-pulse overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70",
        className,
      )}
      style={{
        width: PROFILE_SOURCE_LISTING_CARD_WIDTH,
        minWidth: PROFILE_SOURCE_LISTING_CARD_WIDTH,
        maxWidth: PROFILE_SOURCE_LISTING_CARD_WIDTH,
        height: PROFILE_SOURCE_LISTING_CARD_HEIGHT,
      }}
    >
      <div
        className="rounded-t-lg bg-white/10"
        style={{
          height: PROFILE_SOURCE_LISTING_IMAGE_HEIGHT,
          marginLeft: PROFILE_SOURCE_LISTING_MEDIA_INSET,
          marginRight: PROFILE_SOURCE_LISTING_MEDIA_INSET,
          marginTop: PROFILE_SOURCE_LISTING_MEDIA_INSET,
        }}
      />
      <div className="px-2 py-1.5">
        <div className="h-2 w-16 rounded-full bg-white/20" />
        <div className="mt-1.5 h-2 w-12 rounded-full bg-white/10" />
        <div className="mt-1.5 h-1.5 w-10 rounded-full bg-white/10" />
      </div>
    </div>
  )
}

function profileOfferToSourceListing(service: ProfileOffer): SourceListing {
  const metadata = { ...(service.metadata ?? {}) }
  const image = resolveServiceImage(service)

  if (image) {
    metadata.coverImage = image
  }

  if (
    typeof service.duration_minutes === "number" &&
    Number.isFinite(service.duration_minutes)
  ) {
    metadata.duration_minutes = service.duration_minutes
  }

  return {
    id: service.id,
    type: "service",
    title: service.title,
    description: service.description ?? null,
    price:
      typeof service.price_cents === "number" && Number.isFinite(service.price_cents)
        ? service.price_cents / 100
        : null,
    currency: service.currency || "USD",
    status: service.is_active ? "published" : "draft",
    metadata,
    publish_results: null,
    published_at: service.is_active ? service.updated_at : null,
    created_at: service.created_at,
    updated_at: service.updated_at,
  }
}

export function resolveServiceImage(service: ProfileOffer) {
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
