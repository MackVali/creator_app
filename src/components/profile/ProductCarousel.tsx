"use client"

import type { KeyboardEvent } from "react"
import { SourceListing } from "@/types/source"
import { formatListingCurrency, resolveListingImage } from "./detailSheetUtils"

type ProductCarouselProps = {
  error?: string | null
  loading: boolean
  products: SourceListing[]
  onSelectProduct?: (product: SourceListing) => void
}

const skeletonCount = 3

export default function ProductCarousel({
  products,
  loading,
  error,
  onSelectProduct,
}: ProductCarouselProps) {
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
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={onSelectProduct}
                />
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
  onSelect?: (product: SourceListing) => void
}

function ProductCard({ product, onSelect }: ProductCardProps) {
  const image = resolveListingImage(product)
  const priceLabel =
    product.price !== null ? formatListingCurrency(product.price, product.currency) : null

  const handleSelect = () => {
    onSelect?.(product)
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
      aria-label={`Open details for ${product.title}`}
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
            No cover
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col justify-between gap-1 text-sm">
        <p className="font-semibold leading-tight">{product.title}</p>
        {product.description ? (
          <p className="text-xs text-white/60">{product.description}</p>
        ) : null}
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
    </article>
  )
}
