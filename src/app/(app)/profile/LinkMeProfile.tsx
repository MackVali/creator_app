"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  MapPin,
  Edit3,
  ExternalLink,
  Share2,
  Menu,
  ArrowLeft,
  Plus,
  Copy,
  ShoppingCart,
} from "lucide-react";
import { Profile, SocialLink, ContentCard } from "@/lib/types";
import { getSocialLinks, getContentCards } from "@/lib/db/profile-management";
import { SocialIcon, getSocialIconDefinition } from "@/components/profile/SocialIcon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToastHelpers } from "@/components/ui/toast";
import type { ProductCheckoutResponse } from "@/types/checkout";

export type ProductCartItem = {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  image_url: string | null;
  quantity: number;
};

export type ProfileCartQuickViewProps = {
  enabled: boolean;
  cartItems: ProductCartItem[];
  itemCount: number;
  subtotal: number;
  onCheckout: () => void;
  onClearCart: () => void;
  isCheckoutDisabled?: boolean;
};

export type ProfileCheckoutFullscreenProps = {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  items: ProductCartItem[];
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

export function ProfileCartQuickView({
  enabled,
  cartItems,
  itemCount,
  subtotal,
  onCheckout,
  onClearCart,
  isCheckoutDisabled = false,
}: ProfileCartQuickViewProps) {
  if (!enabled) {
    return null;
  }

  const currencyHint = cartItems.find((item) => item.currency)?.currency;
  const pricingAvailable = cartItems.some((item) => typeof item.price === "number");
  const displayItems = cartItems.slice(0, 4);
  const moreCount = Math.max(0, cartItems.length - displayItems.length);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Open cart quick-view${itemCount > 0 ? ` with ${itemCount} items` : ""}`}
          className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-3 text-xs font-semibold text-white shadow-[0_14px_40px_rgba(0,0,0,0.55)] backdrop-blur transition hover:border-white/40 hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:h-11 sm:min-w-11"
        >
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          <span className="leading-none">{itemCount}</span>
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

export function ProfileCheckoutFullscreen({
  open,
  onOpenChange,
  items,
  subtotal,
  onCheckoutInitiate,
  isSubmitting,
  errorMessage,
  checkoutResponse,
}: ProfileCheckoutFullscreenProps) {
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
                    <p className="text-xs text-white/60">Qty {item.quantity}</p>
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

interface LinkMeProfileProps {
  profile: Profile;
}

export default function LinkMeProfile({ profile }: LinkMeProfileProps) {
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [contentCards, setContentCards] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const toast = useToastHelpers();

  useEffect(() => {
    async function loadProfileData() {
      if (!profile?.user_id) return;

      try {
        setLoading(true);
        const [links, cards] = await Promise.all([
          getSocialLinks(profile.user_id),
          getContentCards(profile.user_id)
        ]);
        
        setSocialLinks(links);
        setContentCards(cards);
      } catch (error) {
        console.error("Error loading profile data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadProfileData();
  }, [profile?.user_id]);

  const isOwner = user?.id === profile.user_id;
  const activeCards = contentCards
    .filter((card) => card.is_active)
    .sort((a, b) => a.position - b.position);
  const showEmptyState = !loading && activeCards.length === 0;

  const getProfileShareUrl = () => {
    if (typeof window === "undefined") {
      return "";
    }

    if (profile.username) {
      return new URL(`/profile/${profile.username}`, window.location.origin).toString();
    }

    return window.location.href;
  };

  const handleCopyLink = async () => {
    const shareUrl = getProfileShareUrl();

    if (!shareUrl) {
      toast.error("Unable to copy link", "We couldn't determine the profile URL.");
      return;
    }

    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      toast.error(
        "Copy not supported",
        "Your browser doesn't allow copying automatically. Try sharing instead.",
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied", "Your profile URL is ready to share.");
    } catch (error) {
      console.error("Failed to copy URL", error);
      toast.error("Copy failed", "Please try copying the link again.");
    }
  };

  const handleShare = async () => {
    const shareUrl = getProfileShareUrl();

    if (!shareUrl) {
      toast.error("Unable to share", "We couldn't determine the profile URL.");
      return;
    }

    const shareTitle = profile.name || profile.username
      ? `${profile.name || profile.username}'s Bio Link`
      : "Check out this profile";

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          url: shareUrl,
        });
        toast.success("Share successful", "Thanks for spreading the word!");
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          return;
        }

        console.error("Share failed, falling back to copy", error);
      }
    }

    await handleCopyLink();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Bio Link</span>
              <ExternalLink className="h-4 w-4 text-gray-400" />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="p-2"
              onClick={handleShare}
              aria-label="Share profile"
            >
              <Share2 className="h-5 w-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="p-2"
                  aria-label="Open profile actions"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Profile actions</DropdownMenuLabel>
                <DropdownMenuItem
                  className="flex items-center gap-2"
                  onSelect={(event) => {
                    event.preventDefault();
                    handleShare();
                  }}
                >
                  <Share2 className="h-4 w-4" />
                  Share profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2"
                  onSelect={(event) => {
                    event.preventDefault();
                    handleCopyLink();
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copy link
                </DropdownMenuItem>
                {profile.username ? (
                  <DropdownMenuItem asChild className="flex items-center gap-2">
                    <Link
                      href={`/profile/${profile.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View public profile
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {isOwner ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="flex items-center gap-2">
                      <Link href="/profile/edit" className="flex w-full items-center gap-2">
                        <Edit3 className="h-4 w-4" />
                        Edit profile
                      </Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main Profile Section */}
      <div className="max-w-md mx-auto px-4 py-6">
        <Card className="overflow-hidden shadow-xl border-0">
          {/* Background Image Section */}
          <div 
            className="relative h-48 bg-gradient-to-br from-blue-600 to-purple-700"
            style={{
              background: profile.banner_url 
                ? `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), url(${profile.banner_url})`
                : `linear-gradient(135deg, ${profile.theme_color || '#3B82F6'} 0%, ${profile.accent_color || '#8B5CF6'} 100%)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            
            {/* Profile Info Overlay */}
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <div className="flex items-center space-x-2 mb-2">
                <h1 className="text-2xl font-bold">{profile.name || "Your Name"}</h1>
                {profile.verified && (
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-white">✓</span>
                  </div>
                )}
              </div>
              <p className="text-lg opacity-90">@{profile.username}</p>
            </div>

            {/* Floating "me" Button */}
            <div className="absolute top-4 left-4">
              <Button 
                variant="secondary" 
                size="sm" 
                className="bg-white/20 text-white border-white/30 hover:bg-white/30 backdrop-blur-sm"
              >
                me
              </Button>
            </div>
          </div>

          {/* Profile Content */}
          <CardContent className="p-6">
            {/* Bio */}
            <div className="text-center mb-6">
              <p className="text-gray-700 text-lg leading-relaxed">
                {profile.bio || "Dad • Creator • Entrepreneur • Philanthropist"}
              </p>
            </div>

            {/* Location */}
            {profile.city && (
              <div className="flex items-center justify-center space-x-2 mb-6 text-gray-600">
                <MapPin className="h-4 w-4 text-red-500" />
                <span>{profile.city}</span>
              </div>
            )}

            {/* Social Media Links */}
            <div className="mb-8 flex flex-wrap justify-center gap-3">
              {socialLinks.length > 0 ? (
                socialLinks.map((link) => {
                  const definition = getSocialIconDefinition(link.platform);

                  return (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      aria-label={`Visit ${profile.name || profile.username} on ${definition.label}`}
                    >
                      <SocialIcon
                        platform={link.platform}
                        className={cn(
                          "group-hover:-translate-y-1 group-hover:shadow-xl group-focus-visible:-translate-y-1",
                          link.color
                        )}
                      />
                    </a>
                  );
                })
              ) : (
                ["instagram", "facebook", "twitter", "linkedin", "youtube", "tiktok", "email"].map((platform) => {
                  const definition = getSocialIconDefinition(platform);

                  return (
                    <div
                      key={platform}
                      className="inline-flex flex-col items-center"
                      title={`Add ${definition.label}`}
                    >
                      <SocialIcon platform={platform} className="opacity-40 shadow-none" />
                      <span className="sr-only">Add {definition.label}</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Content Links Grid */}
            <div className="space-y-4">
              {loading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`content-skeleton-${index}`}
                    className="h-36 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
                  />
                ))
              ) : showEmptyState ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm">
                    <Plus className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">
                    {isOwner ? "Your link collection is empty" : "No links yet"}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    {isOwner
                      ? "Add your first link to start sharing the highlights that matter most."
                      : "This creator hasn’t shared any links yet. Check back soon!"}
                  </p>
                  {isOwner ? (
                    <div className="mt-4">
                      <Link href="/profile/edit">
                        <Button className="inline-flex items-center">
                          <Plus className="mr-2 h-4 w-4" />
                          Add your first link
                        </Button>
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : (
                activeCards.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <div className="relative overflow-hidden rounded-lg border border-gray-200 transition-all duration-200 hover:border-blue-300 hover:shadow-lg">
                      {item.thumbnail_url ? (
                        <div
                          className="aspect-video bg-cover bg-center"
                          style={{ backgroundImage: `url(${item.thumbnail_url})` }}
                        />
                      ) : (
                        <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                          <div className="text-center">
                            <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                              <ExternalLink className="h-8 w-8 text-blue-600" />
                            </div>
                            <p className="text-sm text-gray-500">{item.category || "Link"}</p>
                          </div>
                        </div>
                      )}
                      <div className="p-4">
                        <h3 className="font-semibold text-gray-900 transition-colors group-hover:text-blue-600">
                          {item.title}
                        </h3>
                        {item.description && (
                          <p className="mt-1 text-sm text-gray-600">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </a>
                ))
              )}
            </div>

            {/* Add Content Button */}
            {isOwner && !showEmptyState ? (
              <div className="mt-6 text-center">
                <Link href="/profile/edit">
                  <Button variant="outline" className="w-full border-dashed border-2 border-gray-300 hover:border-blue-400 hover:bg-blue-50">
                    <Plus className="mr-2 h-5 w-5" />
                    Add More Content
                  </Button>
                </Link>
              </div>
            ) : null}

            {/* Edit Profile Button */}
            {isOwner ? (
              <div className="mt-8 text-center">
                <Link href="/profile/edit">
                  <Button className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-3 text-white shadow-lg transition-all duration-200 hover:from-blue-700 hover:to-purple-700 hover:shadow-xl">
                    <Edit3 className="mr-2 h-5 w-5" />
                    Edit Profile
                  </Button>
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>Powered by Premium App</p>
        </div>
      </div>
    </div>
  );
}
