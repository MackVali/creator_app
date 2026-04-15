import type { SourceListing } from "@/types/source"

const IMAGE_FIELDS = [
  "cover",
  "coverImage",
  "image",
  "imageUrl",
  "image_url",
  "heroImage",
  "hero",
  "thumbnail",
  "thumbnailUrl",
] as const

export function resolveListingImage(product: SourceListing) {
  const metadata = product.metadata
  if (!metadata) return null

  for (const field of IMAGE_FIELDS) {
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

const PRODUCT_KIND_KEYS = ["product_kind", "productKind"] as const
const PRODUCT_KIND_VALUES = ["physical", "digital"] as const

export type ProductKind = (typeof PRODUCT_KIND_VALUES)[number]
export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  physical: "Physical product",
  digital: "Digital product",
}

const QUANTITY_BEHAVIOR_KEYS = ["quantity_behavior", "quantityBehavior"] as const
const QUANTITY_BEHAVIOR_VALUES = ["per_unit", "per_order", "always_available"] as const

export type QuantityBehavior = (typeof QUANTITY_BEHAVIOR_VALUES)[number]
export const QUANTITY_BEHAVIOR_LABELS: Record<QuantityBehavior, string> = {
  per_unit: "Track stock per unit",
  per_order: "Reserve per order",
  always_available: "Always available",
}

const SERVICE_MODE_KEYS = ["service_mode", "serviceMode"] as const
const SERVICE_MODE_VALUES = ["bookable", "flat_rate", "custom_quote"] as const

export type ServiceMode = (typeof SERVICE_MODE_VALUES)[number]
export const SERVICE_MODE_LABELS: Record<ServiceMode, string> = {
  bookable: "Bookable",
  flat_rate: "Flat rate",
  custom_quote: "Custom quote",
}
export const DEFAULT_SERVICE_MODE: ServiceMode = "bookable"

const INVENTORY_KEYS = ["inventory"] as const

export function resolveProductKind(metadata: Record<string, unknown> | null) {
  const raw = extractFirstMatchingString(metadata, PRODUCT_KIND_KEYS)
  if (raw && PRODUCT_KIND_VALUES.includes(raw as ProductKind)) {
    return raw as ProductKind
  }
  return null
}

export function resolveQuantityBehavior(metadata: Record<string, unknown> | null) {
  const raw = extractFirstMatchingString(metadata, QUANTITY_BEHAVIOR_KEYS)
  if (raw && QUANTITY_BEHAVIOR_VALUES.includes(raw as QuantityBehavior)) {
    return raw as QuantityBehavior
  }
  return null
}

export function resolveInventoryCount(metadata: Record<string, unknown> | null) {
  return extractFirstMatchingNumber(metadata, INVENTORY_KEYS)
}

export function resolveServiceMode(metadata: Record<string, unknown> | null) {
  const raw = extractFirstMatchingString(metadata, SERVICE_MODE_KEYS)
  if (raw && SERVICE_MODE_VALUES.includes(raw as ServiceMode)) {
    return raw as ServiceMode
  }
  return null
}

export function resolveServiceTurnaround(metadata: Record<string, unknown> | null) {
  return extractFirstMatchingString(metadata, ["service_turnaround", "serviceTurnaround"])
}

export function resolveServiceDeliverables(metadata: Record<string, unknown> | null) {
  return extractFirstMatchingString(metadata, ["service_deliverables", "serviceDeliverables"])
}

export function resolveServiceRequirements(metadata: Record<string, unknown> | null) {
  return extractFirstMatchingString(metadata, ["service_requirements", "serviceRequirements"])
}

export function formatListingCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export function formatServicePrice(priceCents?: number | null, currency?: string | null) {
  if (typeof priceCents !== "number" || !currency) {
    return null
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(priceCents / 100)
  } catch {
    return `${currency} ${(priceCents / 100).toFixed(2)}`
  }
}

export function formatDuration(durationMinutes?: number | null) {
  if (!durationMinutes || durationMinutes <= 0) {
    return null
  }

  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60
  if (hours && minutes) {
    return `${hours}h ${minutes}m`
  }

  if (hours) {
    return `${hours}h`
  }

  return `${minutes}m`
}

export function formatInventoryStatus(status?: string | null) {
  if (!status) {
    return null
  }

  return status
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

function extractFirstMatchingNumber(
  metadata: Record<string, unknown> | null,
  keys: readonly string[],
) {
  if (!metadata) return null

  for (const key of keys) {
    const value = metadata[key]
    const normalized = normalizeMetadataNumber(value)
    if (typeof normalized === "number") {
      return normalized
    }
  }

  return null
}

function normalizeMetadataNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    const parsed = Number.parseFloat(trimmed)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }

  return null
}

function extractFirstMatchingString(
  metadata: Record<string, unknown> | null,
  keys: readonly string[],
) {
  if (!metadata) return null

  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return null
}
