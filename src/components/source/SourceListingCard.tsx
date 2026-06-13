"use client"

/* eslint-disable @next/next/no-img-element -- Preserve the Source listing card media treatment exactly. */

import { cn } from "@/lib/utils"
import type { SourceListing } from "@/types/source"
import type { CSSProperties } from "react"

// Mirrors Source.tsx: max-w-6xl, px-4, grid-cols-3, gap-3.
export const SOURCE_LISTING_CARD_BASE_WIDTH = 1096 / 3
export const SOURCE_LISTING_CARD_BASE_HEIGHT = 178

export const listingInlineStatusLabels: Record<SourceListing["status"], string> = {
  draft: "Draft",
  queued: "Queued",
  published: "Available",
  needs_attention: "Needs attention",
}

export const listingInlineStatusTextClass: Record<SourceListing["status"], string> = {
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
  style?: CSSProperties
}

export type SourceListingCardViewModel = Pick<
  SourceListingCardProps,
  "image" | "title" | "priceLabel" | "status" | "secondaryLabel"
>

export function normalizeSourceListingCardProps(
  listing: SourceListing,
): SourceListingCardViewModel {
  const coverImage =
    listing.metadata && typeof listing.metadata["coverImage"] === "string"
      ? listing.metadata["coverImage"]
      : null
  const priceLabel =
    listing.price !== null
      ? formatSourceListingCardCurrency(listing.price, listing.currency)
      : "Price TBD"
  const durationMinutes =
    listing.type === "service" &&
    listing.metadata &&
    typeof listing.metadata["duration_minutes"] === "number"
      ? listing.metadata["duration_minutes"]
      : null

  return {
    image: coverImage,
    title: listing.title,
    priceLabel,
    status: listing.status,
    secondaryLabel:
      durationMinutes !== null ? formatSourceListingCardDuration(durationMinutes) : null,
  }
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
  style,
}: SourceListingCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel ?? `Open details for ${title}`}
      onClick={onClick}
      style={style}
      className={cn(
        "goal-card group flex h-full transform-gpu flex-col overflow-hidden !rounded-2xl !border-white/10 !bg-[radial-gradient(circle_at_12%_-18%,rgba(255,255,255,0.1),transparent_56%),linear-gradient(145deg,rgba(8,8,10,0.98)_0%,rgba(17,18,22,0.96)_56%,rgba(33,34,40,0.78)_100%)] text-left text-[11px] text-zinc-300 !shadow-[0_18px_38px_-30px_rgba(0,0,0,0.98),0_8px_18px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.07)] transition duration-200 hover:-translate-y-px hover:!border-white/25 hover:brightness-110 active:translate-y-px active:scale-[0.985] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 select-none",
        style?.width ? null : "w-full",
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

function formatSourceListingCardCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function formatSourceListingCardDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return ""

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
