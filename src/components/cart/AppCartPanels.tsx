"use client";

import { ShoppingCart } from "lucide-react";
import { useEffect, useRef } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ProductCheckoutResponse } from "@/types/checkout";

import type { AppCartItem } from "./AppCartProvider";

type AppCartQuickViewProps = {
  cartItems: AppCartItem[];
  itemCount: number;
  subtotal: number;
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onCheckout: () => void;
  onClearCart: () => void;
  isCheckoutDisabled?: boolean;
};

type AppCheckoutFullscreenProps = {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  items: AppCartItem[];
  subtotal: number;
  onCheckoutInitiate: () => void;
  isSubmitting: boolean;
  errorMessage: string | null;
  checkoutResponse: ProductCheckoutResponse | null;
};

const formatCurrencyValue = (value: number, currencyCode?: string) => {
  const resolvedCurrency = typeof currencyCode === "string" && currencyCode.length > 0 ? currencyCode : "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: resolvedCurrency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch (error) {
    console.error("Invalid currency code", resolvedCurrency, error);
    return `${resolvedCurrency} ${value.toFixed(2)}`;
  }
};

export function AppCartQuickView({
  cartItems,
  itemCount,
  subtotal,
  open,
  onOpenChange,
  onCheckout,
  onClearCart,
  isCheckoutDisabled = false,
}: AppCartQuickViewProps) {
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  const previousItemCountRef = useRef(itemCount);
  const currencyHint = cartItems.find((item) => item.currency)?.currency;
  const pricingAvailable = cartItems.some((item) => typeof item.price === "number");
  const displayItems = cartItems.slice(0, 4);
  const moreCount = Math.max(0, cartItems.length - displayItems.length);

  useEffect(() => {
    const previousCount = previousItemCountRef.current;
    if (itemCount > 0 && itemCount !== previousCount) {
      badgeRef.current?.animate(
        [
          { transform: "scale(0.92)", opacity: 0.82 },
          { transform: "scale(1.06)", opacity: 1 },
          { transform: "scale(1)", opacity: 1 },
        ],
        {
          duration: 180,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    }
    previousItemCountRef.current = itemCount;
  }, [itemCount]);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Open cart quick-view${itemCount > 0 ? ` with ${itemCount} items` : ""}`}
          className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:h-11 sm:w-11 ${
            itemCount > 0
              ? "border-white/25 bg-black/60 text-white shadow-[0_12px_32px_rgba(0,0,0,0.45)] hover:border-white/45 hover:bg-black/75"
              : "border-white/10 bg-black/35 text-white/65 hover:border-white/25 hover:bg-black/50"
          }`}
        >
          <ShoppingCart className="h-[18px] w-[18px]" aria-hidden="true" />
          {itemCount > 0 ? (
            <span
              ref={badgeRef}
              className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold leading-4 text-black"
            >
              {itemCount > 99 ? "99+" : itemCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[min(92vw,340px)] rounded-2xl border border-white/15 bg-[#05070c]/95 p-0 text-white shadow-[0_26px_70px_rgba(0,0,0,0.75)] backdrop-blur"
      >
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.45em] text-white/50">Cart</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="text-sm font-semibold text-white">
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </p>
            <p className="text-sm font-semibold text-white">
              {pricingAvailable ? formatCurrencyValue(subtotal, currencyHint) : "Price pending"}
            </p>
          </div>
        </div>

        {cartItems.length > 0 ? (
          <div className="max-h-[260px] overflow-y-auto px-2 py-2">
            {displayItems.map((item) => {
              const lineTotal =
                typeof item.price === "number" ? item.price * Math.max(1, item.quantity) : null;
              return (
                <div
                  key={`${item.id}-${item.quantity}`}
                  className="flex items-center justify-between rounded-xl px-3 py-2"
                >
                  <div className="pr-3">
                    <p className="line-clamp-1 text-sm font-medium text-white">{item.title}</p>
                    <p className="text-[11px] text-white/60">Qty {item.quantity}</p>
                  </div>
                  <p className="text-xs font-semibold text-white/85">
                    {lineTotal !== null ? formatCurrencyValue(lineTotal, item.currency) : "Pending"}
                  </p>
                </div>
              );
            })}
            {moreCount > 0 ? (
              <p className="px-3 pb-2 text-[11px] text-white/60">+{moreCount} more item{moreCount === 1 ? "" : "s"}</p>
            ) : null}
          </div>
        ) : (
          <p className="px-4 py-4 text-sm text-white/65">Your cart is empty.</p>
        )}

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onCheckout}
            disabled={cartItems.length === 0 || isCheckoutDisabled}
            className="inline-flex w-full items-center justify-center rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:border-white/15 disabled:text-white/40"
          >
            Checkout
          </button>
          <button
            type="button"
            onClick={onClearCart}
            disabled={cartItems.length === 0}
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-transparent px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/55 transition hover:text-white disabled:cursor-not-allowed disabled:text-white/30"
          >
            Clear cart
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppCheckoutFullscreen({
  open,
  onOpenChange,
  items,
  subtotal,
  onCheckoutInitiate,
  isSubmitting,
  errorMessage,
  checkoutResponse,
}: AppCheckoutFullscreenProps) {
  const currencyHint = items.find((item) => item.currency)?.currency;
  const pricingAvailable = items.some((item) => typeof item.price === "number");
  const paymentReady = Boolean(checkoutResponse?.payment?.checkoutUrl);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] max-h-[100dvh] rounded-none border-0 bg-[#05070c] p-0 text-white sm:mx-auto sm:h-[96vh] sm:max-w-2xl sm:rounded-[30px] sm:border sm:border-white/10"
      >
        <SheetHeader className="border-b border-white/10 px-5 py-4 text-left">
          <SheetTitle className="text-xl font-semibold text-white">Checkout</SheetTitle>
          <SheetDescription className="text-sm text-white/65">
            Review your items before moving to the hosted payment screen.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6">
          <div className="space-y-3">
            {items.map((item) => {
              const lineTotal =
                typeof item.price === "number" ? item.price * Math.max(1, item.quantity) : null;
              return (
                <div
                  key={`${item.id}-${item.quantity}`}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-white/60">
                      Qty {item.quantity} • @{item.sellerHandle}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {lineTotal !== null ? formatCurrencyValue(lineTotal, item.currency) : "Price pending"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
            <span className="text-white/60">Subtotal</span>
            <span className="font-semibold text-white">
              {pricingAvailable ? formatCurrencyValue(subtotal, currencyHint) : "Price pending"}
            </span>
          </div>

          {errorMessage ? <p className="mt-3 text-sm text-rose-300">{errorMessage}</p> : null}
          {checkoutResponse ? (
            <div className="mt-3 rounded-2xl border border-white/20 bg-white/[0.04] px-4 py-3 text-sm text-white/80">
              <p className="text-[11px] uppercase tracking-[0.35em] text-white/55">Checkout prepared</p>
              <p className="font-semibold text-white">ID {checkoutResponse.checkoutId}</p>
              <p className="text-[12px] text-white/70">
                Total {formatCurrencyValue(checkoutResponse.totalAmount, checkoutResponse.currency)}
              </p>
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/10 bg-black/30 p-4">
          <button
            type="button"
            onClick={onCheckoutInitiate}
            disabled={items.length === 0 || isSubmitting || paymentReady}
            className="inline-flex w-full items-center justify-center rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:border-white/15 disabled:text-white/45"
          >
            {isSubmitting ? "Preparing checkout..." : paymentReady ? "Checkout prepared" : "Checkout"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
