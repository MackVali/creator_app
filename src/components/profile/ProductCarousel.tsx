"use client"

import { SourceListing } from "@/types/source"
import {
  ProductSourceListingCard,
  SourceListingCardSkeleton,
} from "./SourceListingCard"

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
              <SourceListingCardSkeleton
                key={`product-skeleton-${index}`}
                className="snap-center min-w-[220px] flex-shrink-0"
              />
            ))
          : hasProducts
            ? products.map((product) => (
                <ProductSourceListingCard
                  key={product.id}
                  product={product}
                  onSelect={onSelectProduct}
                  className="snap-center min-w-[220px] flex-shrink-0"
                />
              ))
            : null}
      </div>
    </section>
  )
}
