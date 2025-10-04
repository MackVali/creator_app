"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Edit3, Link2 } from "lucide-react";

import HeroHeader from "@/components/profile/HeroHeader";
import LinkGrid from "@/components/profile/LinkGrid";
import { Button } from "@/components/ui/button";
import { getContentCards, getSocialLinks } from "@/lib/db/profile-management";
import type { ContentCard, Profile, SocialLink } from "@/lib/types";

interface ProfileContentProps {
  profile: Profile;
  userId: string;
}

export default function ProfileContent({ profile, userId }: ProfileContentProps) {
  const ownerId = profile?.user_id || userId;

  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [contentCards, setContentCards] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerId) {
      setSocialLinks([]);
      setContentCards([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPreviewData() {
      try {
        setLoading(true);
        setError(null);

        const [links, cards] = await Promise.all([
          getSocialLinks(ownerId),
          getContentCards(ownerId),
        ]);

        if (cancelled) return;

        setSocialLinks(links);
        setContentCards(cards);
      } catch (err) {
        if (cancelled) return;

        console.error("Error loading profile preview data:", err);
        setError("We couldn't load everything for your preview.");
        setSocialLinks([]);
        setContentCards([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPreviewData();

    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  const socialsData = useMemo(() => {
    const data: Record<string, string | undefined> = {};

    socialLinks.forEach((link) => {
      if (link.url) {
        data[link.platform.toLowerCase()] = link.url;
      }
    });

    return data;
  }, [socialLinks]);

  const activeSocialCount = socialLinks.filter((link) => !!link.url).length;
  const activeLinkCount = contentCards.filter((card) => card.is_active !== false).length;

  return (
    <div className="relative min-h-screen bg-slate-950 pb-[env(safe-area-inset-bottom)] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-24 h-[360px] w-[360px] rounded-full bg-gradient-to-br from-neutral-700/30 via-neutral-900/25 to-transparent blur-[140px]" />
        <div className="absolute -top-32 right-[-10%] h-[300px] w-[300px] rounded-full bg-gradient-to-bl from-neutral-800/30 via-neutral-950/25 to-transparent blur-[160px]" />
        <div className="absolute left-1/2 top-[15%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-neutral-500/15 blur-[170px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-[360px] w-[360px] rounded-full bg-neutral-800/20 blur-[200px]" />
      </div>

      <main className="relative z-10 pb-28 pt-12 sm:pb-36">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4">
          <header className="flex flex-col gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.35em] text-white/60">
                Preview
              </span>
              <div>
                <h1 className="text-3xl font-semibold text-white sm:text-4xl">Your public profile</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">
                  This live preview mirrors what visitors see on your bio link page. Use the quick actions below to edit details or curate new links.
                </p>
              </div>
            </div>

            {profile.username ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="self-center rounded-full border-white/20 bg-white/5 text-white hover:border-white/40 hover:bg-white/10"
              >
                <Link href={`/profile/${profile.username}`} target="_blank" rel="noopener noreferrer">
                  View live page
                </Link>
              </Button>
            ) : null}
          </header>

          <HeroHeader
            profile={profile}
            socials={socialsData}
            stats={{ linkCount: activeLinkCount, socialCount: activeSocialCount }}
          />

          <section className="mx-auto mt-6 w-full max-w-5xl px-1 pb-12 sm:mt-10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">Featured links</h2>
                <p className="mt-1 text-sm text-white/55">
                  {activeLinkCount > 0
                    ? "These are the cards your audience can explore."
                    : "Add links to surface the highlights you want to share."}
                </p>
              </div>

              {activeLinkCount > 0 ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/75 shadow-[0_10px_25px_rgba(15,23,42,0.45)]">
                  <span className="inline-block h-2 w-2 rounded-full bg-white/60" />
                  {activeLinkCount} {activeLinkCount === 1 ? "link" : "links"}
                </span>
              ) : null}
            </div>

            {error ? (
              <div className="mt-6 rounded-3xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="mt-8">
              <LinkGrid links={contentCards} loading={loading} isOwner />
            </div>
          </section>
        </div>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-full border border-white/15 bg-black/70 px-4 py-3 text-sm text-white shadow-[0_18px_36px_rgba(2,6,23,0.55)] backdrop-blur">
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="rounded-full bg-white px-5 text-black shadow-[0_10px_30px_rgba(15,23,42,0.45)] hover:bg-white/90"
          >
            <Link href="/profile/edit">
              <Edit3 className="h-4 w-4" />
              Edit profile
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="rounded-full border-white/25 bg-white/5 px-5 text-white hover:border-white/50 hover:bg-white/10"
          >
            <Link href="/profile/linked-accounts">
              <Link2 className="h-4 w-4" />
              Manage links
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
