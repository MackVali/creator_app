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

export default function LinkMeProfile({ profile }: LinkMeProfileProps) {
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [contentCards, setContentCards] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const { session } = useAuth();
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

  const isOwner = session?.user?.id === profile.user_id;
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950/95 to-slate-900 text-white">
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Back to dashboard</span>
              </Button>
            </Link>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.3em] text-white/70">
              <ExternalLink className="h-3.5 w-3.5 text-white/50" />
              <span>Bio link</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={handleShare}
              aria-label="Share profile"
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  aria-label="Open profile actions"
                >
                  <Menu className="h-4 w-4" />
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
      <div className="mx-auto w-full max-w-md px-3 py-6 sm:px-4">
        <Card className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_45px_80px_-40px_rgba(15,23,42,0.6)] backdrop-blur">
          {/* Background Image Section */}
          <div
            className="relative h-56 bg-gradient-to-br from-sky-500 via-violet-500 to-purple-600 sm:h-60"
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
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{profile.name || "Your Name"}</h1>
                {profile.verified && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500">
                    <span className="text-[0.65rem] font-semibold text-white">✓</span>
                  </div>
                )}
              </div>
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-white/80 sm:text-base">
                @{profile.username}
              </p>
            </div>

            {/* Floating "me" Button */}
            <div className="absolute top-4 left-4">
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full border border-white/30 bg-white/20 px-4 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-white/30"
              >
                me
              </Button>
            </div>
          </div>

          {/* Profile Content */}
          <CardContent className="space-y-8 bg-gradient-to-b from-white/5 to-transparent p-6 text-slate-100 sm:p-8">
            {/* Bio */}
            <div className="text-center">
              <p className="text-base leading-relaxed text-white/80 sm:text-lg">
                {profile.bio || "Dad • Creator • Entrepreneur • Philanthropist"}
              </p>
            </div>

            {/* Location */}
            {profile.city && (
              <div className="flex items-center justify-center gap-2 text-sm font-medium text-white/70">
                <MapPin className="h-4 w-4 text-rose-400" />
                <span>{profile.city}</span>
              </div>
            )}

            {/* Social Media Links */}
            <div className="flex flex-wrap justify-center gap-3">
              {socialLinks.length > 0 ? (
                socialLinks.map((link) => {
                  const definition = getSocialIconDefinition(link.platform);

                  return (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
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
                      <SocialIcon platform={platform} className="opacity-30 shadow-none" />
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
                    className="h-24 animate-pulse rounded-[26px] border border-white/10 bg-white/5"
                  />
                ))
              ) : showEmptyState ? (
                <div className="rounded-[28px] border border-dashed border-white/20 bg-white/5 p-6 text-center text-white/80">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white">
                    <Plus className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold sm:text-lg">
                    {isOwner ? "Your link collection is empty" : "No links yet"}
                  </h3>
                  <p className="mt-2 text-sm text-white/70">
                    {isOwner
                      ? "Add your first link to start sharing the highlights that matter most."
                      : "This creator hasn’t shared any links yet. Check back soon!"}
                  </p>
                  {isOwner ? (
                    <div className="mt-4">
                      <Link href="/profile/edit">
                        <Button className="rounded-full bg-white px-6 text-sm font-semibold text-slate-900 hover:bg-white/90">
                          Add link
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
                    className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  >
                    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/5 transition-all duration-200 hover:-translate-y-1 hover:border-white/25 hover:bg-white/10 hover:shadow-[0_28px_65px_-35px_rgba(15,23,42,0.7)]">
                      {item.thumbnail_url ? (
                        <div
                          className="aspect-video bg-cover bg-center"
                          style={{ backgroundImage: `url(${item.thumbnail_url})` }}
                        />
                      ) : (
                        <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-black">
                          <div className="text-center text-white/80">
                            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10">
                              <ExternalLink className="h-6 w-6" />
                            </div>
                            <p className="text-xs uppercase tracking-[0.35em]">{item.category || "Link"}</p>
                          </div>
                        </div>
                      )}
                      <div className="space-y-2 p-5">
                        <h3 className="text-lg font-semibold text-white transition-colors group-hover:text-white/90">
                          {item.title}
                        </h3>
                        {item.description && (
                          <p className="text-sm leading-relaxed text-white/70">
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
                  <Button className="rounded-full border border-white/20 bg-white/10 px-6 text-sm font-semibold text-white hover:bg-white/20">
                    Manage links
                  </Button>
                </Link>
              </div>
            ) : null}

            {/* Edit Profile Button */}
            {isOwner ? (
              <div className="mt-8 text-center">
                <Link href="/profile/edit">
                  <Button className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-slate-900 shadow-[0_22px_45px_-25px_rgba(15,23,42,0.7)] transition hover:bg-white/90">
                    <Edit3 className="mr-2 h-5 w-5" />
                    Edit profile
                  </Button>
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-white/40">
          <p>Powered by Premium App</p>
        </div>
      </div>
    </div>
  );
}
