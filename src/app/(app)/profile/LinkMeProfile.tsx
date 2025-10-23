"use client";

import { useState, useEffect, useMemo } from "react";
import type Lenis from "lenis";
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
import {
  MapPin,
  Edit3,
  ExternalLink,
  Share2,
  Menu,
  ArrowLeft,
  Plus,
  Copy,
} from "lucide-react";
import { Profile, SocialLink, ContentCard } from "@/lib/types";
import { getSocialLinks, getContentCards } from "@/lib/db/profile-management";
import { SocialIcon, getSocialIconDefinition } from "@/components/profile/SocialIcon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToastHelpers } from "@/components/ui/toast";

interface LinkMeProfileProps {
  profile: Profile;
}

function useLenisSmoothScroll() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    let lenis: Lenis | undefined;
    let rafId: number | null = null;
    let disposed = false;

    const cancelAnimation = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const teardownLenis = () => {
      cancelAnimation();
      if (lenis) {
        lenis.destroy();
        lenis = undefined;
      }
    };

    const startLenis = async () => {
      try {
        const { default: LenisCtor } = await import("lenis");

        if (disposed || motionQuery.matches) {
          return;
        }

        teardownLenis();

        lenis = new LenisCtor({
          duration: 1.05,
          smoothWheel: true,
          smoothTouch: false,
          touchMultiplier: 1,
          syncTouch: true,
        });

        lenis.scrollTo(window.scrollY, { immediate: true });

        const animate = (time: number) => {
          lenis?.raf(time);
          rafId = requestAnimationFrame(animate);
        };

        rafId = requestAnimationFrame(animate);
      } catch (error) {
        if (!disposed) {
          console.error("Failed to initialize smooth scrolling", error);
        }
      }
    };

    if (!motionQuery.matches) {
      startLenis();
    }

    const handleMotionChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        teardownLenis();
      } else {
        startLenis();
      }
    };

    if (typeof motionQuery.addEventListener === "function") {
      motionQuery.addEventListener("change", handleMotionChange);
    } else if (typeof motionQuery.addListener === "function") {
      motionQuery.addListener(handleMotionChange);
    }

    return () => {
      disposed = true;
      if (typeof motionQuery.removeEventListener === "function") {
        motionQuery.removeEventListener("change", handleMotionChange);
      } else if (typeof motionQuery.removeListener === "function") {
        motionQuery.removeListener(handleMotionChange);
      }

      teardownLenis();
    };
  }, []);
}

function useStickyHeaderScrollPadding() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const root = document.documentElement;
    const stickyHeader = document.querySelector<HTMLElement>(
      "[data-profile-sticky-header]",
    );

    if (!stickyHeader) {
      return undefined;
    }

    const previousScrollPaddingTop = root.style.scrollPaddingTop;
    let lastOffset: number | undefined;
    let rafId: number | null = null;

    const applyOffset = (offset: number) => {
      if (offset <= 0) {
        if (typeof lastOffset === "number") {
          root.style.scrollPaddingTop = previousScrollPaddingTop;
          lastOffset = undefined;
        }
        return;
      }

      if (lastOffset === offset) {
        return;
      }

      root.style.scrollPaddingTop = `${offset}px`;
      lastOffset = offset;
    };

    const scheduleMeasurement = () => {
      if (rafId !== null) {
        return;
      }

      rafId = requestAnimationFrame(() => {
        rafId = null;
        const offset = Math.round(stickyHeader.getBoundingClientRect().height);
        applyOffset(offset);
      });
    };

    scheduleMeasurement();

    let resizeObserver: ResizeObserver | undefined;
    const fallbackResizeHandler = () => scheduleMeasurement();

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => scheduleMeasurement());
      resizeObserver.observe(stickyHeader);
    } else {
      window.addEventListener("resize", fallbackResizeHandler);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", fallbackResizeHandler);
      }

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      root.style.scrollPaddingTop = previousScrollPaddingTop;
    };
  }, []);
}

export default function LinkMeProfile({ profile }: LinkMeProfileProps) {
  useLenisSmoothScroll();
  useStickyHeaderScrollPadding();
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

  const bioSegments = useMemo(() => {
    const sourceBio = profile.bio?.trim();
    const rawSegments = sourceBio
      ? sourceBio.split(/[•\n,|]+/)
      : "Dad • Creator • Entrepreneur • Philanthropist".split("•");

    return rawSegments
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }, [profile.bio]);

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
    <div className="min-h-screen scroll-smooth bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Top Navigation Bar */}
      <div
        data-profile-sticky-header
        className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-md"
      >
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
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 rounded-[28px] bg-gradient-to-br from-blue-500/40 via-purple-500/30 to-pink-500/40 blur-2xl opacity-70"
          />
          <Card className="overflow-hidden rounded-[24px] border border-white/40 bg-white/70 shadow-2xl backdrop-blur-xl">
            {/* Background Image Section */}
            <div
              className="relative h-48 bg-gradient-to-br from-blue-600 to-purple-700"
              style={{
                background: profile.banner_url
                  ? `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), url(${profile.banner_url})`
                  : `linear-gradient(135deg, ${profile.theme_color || '#3B82F6'} 0%, ${profile.accent_color || '#8B5CF6'} 100%)`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {/* Background Pattern */}
              <div className="absolute inset-0 bg-black/20" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

              {/* Profile Info Overlay */}
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <div className="mb-2 flex items-center space-x-2">
                  <h1 className="text-2xl font-bold">{profile.name || "Your Name"}</h1>
                  {profile.verified && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                      <span className="text-xs font-bold text-white">✓</span>
                    </div>
                  )}
                </div>
                <p className="text-lg opacity-90">@{profile.username}</p>
              </div>

              {/* Floating "me" Button */}
              <div className="absolute left-4 top-4">
                <Button
                  variant="secondary"
                  size="sm"
                  className="border-white/30 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
                >
                  me
                </Button>
              </div>
            </div>

            {/* Profile Content */}
            <CardContent className="bg-white/80 p-6">
              {/* Bio */}
              <div className="mb-6 flex flex-wrap justify-center gap-2">
                {bioSegments.map((segment, index) => (
                  <span
                    key={`${segment}-${index}`}
                    className="rounded-full bg-gradient-to-r from-blue-100 via-purple-100 to-pink-100 px-3 py-1 text-sm font-medium text-slate-700 shadow-sm"
                  >
                    {segment}
                  </span>
                ))}
              </div>

              {/* Location */}
              {profile.city && (
                <div className="mb-6 flex items-center justify-center space-x-2 text-gray-600">
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
                      className="group block"
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
                            <p className="mt-1 text-sm text-gray-600">{item.description}</p>
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
                    <Button variant="outline" className="w-full border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50">
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
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>Powered by Premium App</p>
        </div>
      </div>
    </div>
  );
}
