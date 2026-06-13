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
    <section className="space-y-2 text-white">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-zinc-500">
            Products
          </p>
        </div>
        {!loading && hasProducts ? (
          <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">
            {products.length} {products.length === 1 ? "item" : "items"}
          </p>
        ) : null}
      </div>

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-start gap-3">
        {loading
          ? Array.from({ length: skeletonCount }).map((_, index) => (
              <SourceListingCardSkeleton
                key={`product-skeleton-${index}`}
              />
            ))
          : hasProducts
            ? products.map((product) => (
                <ProductSourceListingCard
                  key={product.id}
                  product={product}
                  onSelect={onSelectProduct}
                />
              ))
            : null}
      </div>
    </section>
  )
}
