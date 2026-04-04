"use client"

import { SourceListing } from "@/types/source"

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

const DESTINATION_FIELDS = [
  "destination",
  "destinationUrl",
  "destination_url",
  "href",
  "link",
  "url",
  "productUrl",
  "checkoutUrl",
  "purchaseUrl",
  "externalUrl",
] as const

type ProductCarouselProps = {
  error?: string | null
  loading: boolean
  products: SourceListing[]
}

const skeletonCount = 3

export default function ProductCarousel({ products, loading, error }: ProductCarouselProps) {
  const hasProducts = products.length > 0
  const showSection = loading || Boolean(error) || hasProducts

  if (!showSection) {
    return null
  }

  return (
    <section className="space-y-3 rounded-3xl border border-white/5 bg-black p-4 text-white shadow-[0_25px_80px_rgba(2,6,23,0.45)]">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.5em] text-white/60">
            Products
          </p>
        </div>
        {!loading && hasProducts ? (
          <p className="text-xs uppercase tracking-[0.4em] text-white/40">
            {products.length} {products.length === 1 ? "item" : "items"}
          </p>
        ) : null}
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pt-1">
        {loading
          ? Array.from({ length: skeletonCount }).map((_, index) => (
              <div
                key={`product-skeleton-${index}`}
                className="snap-center min-w-[220px] animate-pulse rounded-2xl border border-white/10 bg-slate-900/60 p-3"
              >
                <div className="mb-3 h-32 w-full rounded-xl bg-white/10" />
                <div className="h-3 w-28 rounded-full bg-white/20" />
                <div className="mt-2 h-3 w-20 rounded-full bg-white/10" />
              </div>
            ))
          : hasProducts
            ? products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))
            : (
              <div className="snap-center min-w-[220px] rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-white/70">
                <p className="font-medium text-white">No products yet</p>
                <p className="mt-1 text-xs text-white/60">
                  Publish a product in Source and it automatically appears here.
                </p>
              </div>
            )}
      </div>
    </section>
  )
}

type ProductCardProps = {
  product: SourceListing
}

function ProductCard({ product }: ProductCardProps) {
  const destination = resolveDestination(product)
  const image = resolveImage(product)
  const priceLabel =
    product.price !== null ? formatCurrency(product.price, product.currency) : null

  const content = (
    <div className="snap-center min-w-[220px] flex-shrink-0 flex-col justify-between rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-3 text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(0,0,0,0.65)]">
      <div className="relative mb-3 h-32 overflow-hidden rounded-xl bg-gradient-to-b from-slate-800 to-slate-900">
        {image ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${image})` }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-white/40">
            No cover
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col justify-between gap-1 text-sm">
        <p className="font-semibold leading-tight">{product.title}</p>
        {product.description && (
          <p className="text-xs text-white/60">
            {product.description}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/70">
        {priceLabel ? (
          <span className="font-mono text-sm text-white">{priceLabel}</span>
        ) : (
          <span className="text-white/60">Price n/a</span>
        )}
        <span className="text-white/40">
          {product.status === "published" ? "Live" : "Draft"}
        </span>
      </div>
    </div>
  )

  if (!destination) {
    return content
  }

  return (
    <a
      href={destination}
      target="_blank"
      rel="noopener noreferrer"
      className="snap-center"
    >
      {content}
    </a>
  )
}

function resolveImage(product: SourceListing) {
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

function resolveDestination(product: SourceListing) {
  const metadata = product.metadata
  if (!metadata) return null

  for (const field of DESTINATION_FIELDS) {
    const value = metadata[field]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function formatCurrency(value: number, currency: string) {
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
