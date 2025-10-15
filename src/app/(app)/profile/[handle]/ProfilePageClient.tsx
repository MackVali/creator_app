"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import HeroHeader from "@/components/profile/HeroHeader";
import ProfileModules from "@/components/profile/modules/ProfileModules";
import { buildProfileModules } from "@/components/profile/modules/buildProfileModules";
import { ProfileSkeleton } from "@/components/profile/ProfileSkeleton";
import type {
  ProfileModule,
  ProfileModuleLinkCards,
  ProfileModuleSocialProofStrip,
  PublicProfileReadModel,
} from "@/lib/types";

import type { LoadPublicProfileResult } from "./loader";

type ProfilePageClientProps = {
  handle: string;
  loaderResult: LoadPublicProfileResult;
};

function renderNotFound(handle: string) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[-20%] h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-neutral-500/15 blur-[160px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-[260px] w-[260px] rounded-full bg-neutral-800/15 blur-[200px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg space-y-4 rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-center shadow-[0_25px_45px_rgba(15,23,42,0.45)] backdrop-blur">
        <h1 className="text-2xl font-semibold text-white">We couldn't find @{handle}</h1>
        <p className="text-sm text-white/65">
          Double-check the profile link or ask the creator to publish their page again.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Go home
          </Link>
          <Link
            href="/auth"
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

function renderSkeletonFallback(status: LoadPublicProfileResult["status"], error?: string) {
  const messageMap: Record<LoadPublicProfileResult["status"], { title: string; description: string }> = {
    ok: {
      title: "Loading cinematic profile",
      description: "We're composing the hero and modules for this creator.",
    },
    config_missing: {
      title: "Supabase configuration required",
      description:
        "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to load public profile data.",
    },
    error: {
      title: "We hit a snag",
      description: "Retry in a moment or refresh the page to attempt loading again.",
    },
    not_found: {
      title: "Profile not found",
      description: "We couldn't find a published profile for this handle.",
    },
  };

  const preset = messageMap[status] ?? messageMap.error;

  return (
    <div className="relative">
      <ProfileSkeleton />
      <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center px-4">
        <div className="pointer-events-auto max-w-xl rounded-3xl border border-white/12 bg-black/75 px-6 py-5 text-center text-white shadow-[0_30px_90px_rgba(15,23,42,0.6)] backdrop-blur">
          <h2 className="text-lg font-semibold">{preset.title}</h2>
          <p className="mt-2 text-sm text-white/70">
            {error ? `${preset.description} (${error})` : preset.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function buildSocialRecord(model: PublicProfileReadModel | null) {
  const socials: Record<string, string | undefined> = {};

  if (!model) {
    return socials;
  }

  (model.profile.quick_action_badges ?? []).forEach((badge) => {
    if (!badge.href) return;
    const key = badge.label?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? `badge-${badge.id}`;
    socials[key] = badge.href;
  });

  model.ctas.forEach((cta) => {
    if (!cta.href) return;
    const key = (cta.intent || cta.label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    socials[key || `cta-${cta.id}`] = cta.href;
  });

  return socials;
}

export default function ProfilePageClient({ handle, loaderResult }: ProfilePageClientProps) {
  const router = useRouter();
  const { readModel, isOwner, status, error } = loaderResult;
  const profile = readModel?.profile ?? null;

  const modules = useMemo<ProfileModule[]>(() => {
    if (!readModel) return [];
    return buildProfileModules({
      profile: readModel.profile,
      ctas: readModel.ctas,
      offers: readModel.offers,
      testimonials: readModel.testimonials,
      availability: readModel.availability,
    });
  }, [readModel]);

  const linkCardsModule = useMemo(
    () =>
      modules.find(
        (module): module is ProfileModuleLinkCards => module.type === "link_cards",
      ) ?? null,
    [modules],
  );

  const socialModule = useMemo(
    () =>
      modules.find(
        (module): module is ProfileModuleSocialProofStrip =>
          module.type === "social_proof_strip",
      ) ?? null,
    [modules],
  );

  const activeModuleCount = useMemo(
    () =>
      modules.filter((module) => {
        switch (module.type) {
          case "featured_carousel":
            return module.slides.length > 0;
          case "link_cards":
            return module.cards.some((card) => card.is_active !== false);
          case "social_proof_strip":
            return module.items.length > 0;
          case "embedded_media_accordion":
            return module.sections.length > 0;
          default:
            return false;
        }
      }).length,
    [modules],
  );

  const stats = useMemo(
    () => ({
      linkCount: linkCardsModule
        ? linkCardsModule.cards.filter((card) => card.is_active !== false).length
        : 0,
      socialCount: socialModule ? socialModule.items.length : 0,
    }),
    [linkCardsModule, socialModule],
  );

  const socials = useMemo(() => buildSocialRecord(readModel ?? null), [readModel]);

  const handleShare = () => {
    if (!profile) return;

    if (typeof navigator === "undefined" || typeof window === "undefined") {
      return;
    }

    if (navigator.share) {
      navigator
        .share({
          title: `${profile.name || profile.username}'s Bio Link`,
          url: window.location.href,
        })
        .catch((shareError) => {
          console.warn("Share cancelled", shareError);
        });
      return;
    }

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(window.location.href)
        .catch((clipboardError) => {
          console.error("Failed to copy URL", clipboardError);
        });
    }
  };

  const handleBack = () => {
    if (isOwner) {
      router.push("/dashboard");
      return;
    }
    router.back();
  };

  if (!profile) {
    if (status === "not_found") {
      return renderNotFound(handle);
    }

    return renderSkeletonFallback(status, error);
  }

  return (
    <div className="relative min-h-screen bg-slate-950 pb-[env(safe-area-inset-bottom)] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -left-24 h-[360px] w-[360px] rounded-full bg-gradient-to-br from-neutral-700/30 via-neutral-900/25 to-transparent blur-[140px]" />
        <div className="absolute -top-32 right-[-10%] h-[300px] w-[300px] rounded-full bg-gradient-to-bl from-neutral-800/30 via-neutral-950/25 to-transparent blur-[160px]" />
        <div className="absolute left-1/2 top-[15%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-neutral-500/15 blur-[170px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-[360px] w-[360px] rounded-full bg-neutral-800/20 blur-[200px]" />
      </div>

      <main className="relative z-10 py-14">
        <HeroHeader
          profile={profile}
          socials={socials}
          stats={stats}
          onShare={handleShare}
          onBack={handleBack}
        />

        <section className="mx-auto mt-14 w-full max-w-5xl px-4 pb-20">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">Creator lineup</h2>
              <p className="mt-1 text-sm text-white/55">
                {activeModuleCount > 0
                  ? "Tap through the modules to explore their latest drops, socials, and media."
                  : "Modules will unlock here once this creator publishes their first block."}
              </p>
            </div>

            {activeModuleCount > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/75 shadow-[0_10px_25px_rgba(15,23,42,0.45)]">
                <span className="inline-block h-2 w-2 rounded-full bg-white/60" />
                {activeModuleCount} {activeModuleCount === 1 ? "module live" : "modules live"}
              </span>
            ) : null}
          </div>

          <div className="mt-8">
            <ProfileModules modules={modules} loading={false} isOwner={isOwner} />
          </div>
        </section>
      </main>
    </div>
  );
}
