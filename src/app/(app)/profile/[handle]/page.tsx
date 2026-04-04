"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  Profile,
  SocialLink,
  ContentCard,
  ProfileModule,
  ProfileModuleLinkCards,
  LinkedAccount,
} from "@/lib/types";
import { getProfileByHandle, getProfileLinks } from "@/lib/db";
import { getLinkedAccounts } from "@/lib/db/linked-accounts";
import { getSocialLinks } from "@/lib/db/profile-management";
import { getSupabaseBrowser } from "@/lib/supabase";
import { uploadAvatar } from "@/lib/storage";
import { resolveSocialLink } from "@/lib/profile/socialLinks";
import type { RelationshipViewCounts } from "@/components/friends/RelationshipViewBar";
import HeroHeader from "@/components/profile/HeroHeader";
import ProfileModules from "@/components/profile/modules/ProfileModules";
import { ContentCardsSection } from "@/components/profile/ContentCardsSection";
import { buildProfileModules } from "@/components/profile/modules/buildProfileModules";
import { SourceListing } from "@/types/source";
import { ProfileSkeleton } from "@/components/profile/ProfileSkeleton";
import ProductCarousel from "@/components/profile/ProductCarousel";

type RelationshipStatus =
  | "self"
  | "friends"
  | "incoming_request"
  | "outgoing_request"
  | "following"
  | "followed_by"
  | "none";

export default function ProfileByHandlePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [contentCards, setContentCards] = useState<ContentCard[]>([]);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [sourceProducts, setSourceProducts] = useState<SourceListing[]>([]);
  const [sourceProductsLoading, setSourceProductsLoading] = useState(false);
  const [sourceProductsError, setSourceProductsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus | null>(null);
  const [relationshipLoading, setRelationshipLoading] = useState(false);
  const [requestingFriend, setRequestingFriend] = useState(false);
  const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);
  const [respondingRequest, setRespondingRequest] = useState(false);
  const [relationshipCounts, setRelationshipCounts] = useState<RelationshipViewCounts | null>(null);

  const rawHandleParam = params.handle;
  const normalizedHandle = useMemo(() => {
    const candidate = Array.isArray(rawHandleParam)
      ? rawHandleParam[0]
      : rawHandleParam;

    if (!candidate) {
      return "";
    }

    let decodedHandle = candidate;
    try {
      decodedHandle = decodeURIComponent(candidate);
    } catch {
      // If decoding fails, keep the raw param.
    }

    return decodedHandle.trim();
  }, [rawHandleParam]);

  useEffect(() => {
    if (!profile?.username || !normalizedHandle || user?.id === profile.user_id) {
      setRelationshipStatus(null);
      setRelationshipLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    (async () => {
      setRelationshipLoading(true);
      try {
        const response = await fetch(
          `/api/friends/relationship/${encodeURIComponent(profile.username)}`,
          { signal: controller.signal }
        );

        if (!isActive) return;

        if (!response.ok) {
          console.error(`Failed to load relationship (${response.status})`);
          setRelationshipStatus("none");
          return;
        }

        const payload = (await response.json()) as { relationship?: RelationshipStatus };
        const relationship = payload?.relationship;

        if (!relationship) {
          setRelationshipStatus("none");
        } else {
          setRelationshipStatus(relationship);
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          return;
        }
        console.error("Error fetching relationship status", err);
        setRelationshipStatus("none");
      } finally {
        if (isActive) {
          setRelationshipLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [normalizedHandle, profile?.username, profile?.user_id, user?.id]);

  useEffect(() => {
    if (relationshipStatus !== "incoming_request" || !profile?.username) {
      setIncomingRequestId(null);
      return;
    }

    let isCurrent = true;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch("/api/friends/requests", {
          signal: controller.signal,
        });

        if (!isCurrent) return;

        if (!response.ok) {
          console.error("Failed to load incoming requests", response.status);
          return;
        }

        const payload = (await response.json().catch(() => null)) as
          | { requests?: { id: string; username?: string }[] }
          | null;
        const requests = payload?.requests ?? [];

        const match = requests.find(
          (req) =>
            typeof req.username === "string" &&
            req.username.toLowerCase() === profile.username.toLowerCase()
        );

        if (match) {
          setIncomingRequestId(match.id);
        } else {
          setIncomingRequestId(null);
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          return;
        }
        console.error("Error loading incoming requests", err);
      }
    })();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [relationshipStatus, profile?.username]);

  useEffect(() => {
    if (!profile?.username) {
      setRelationshipCounts(null);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(
          `/api/profile/${encodeURIComponent(profile.username)}/friend-stats`,
          { signal: controller.signal },
        );

        if (!isActive) {
          return;
        }

        if (!response.ok) {
          setRelationshipCounts(null);
          return;
        }

        const payload = (await response.json()) as {
          friends?: number;
          following?: number;
          followers?: number;
        };

        if (!isActive) {
          return;
        }

        setRelationshipCounts({
          friends: typeof payload.friends === "number" ? payload.friends : 0,
          following: typeof payload.following === "number" ? payload.following : 0,
          followers: typeof payload.followers === "number" ? payload.followers : 0,
        });
      } catch (err) {
        if (!isActive) {
          return;
        }

        if ((err as { name?: string }).name === "AbortError") {
          return;
        }

        console.error("Failed to load friend stats", err);
        setRelationshipCounts(null);
      }
    })();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [profile?.username]);

  useEffect(() => {
    async function loadProfileData() {
      if (!normalizedHandle) {
        router.push("/dashboard");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Load profile by handle
        const userProfile = await getProfileByHandle(normalizedHandle);
        if (!userProfile) {
          setError("Profile not found");
          return;
        }

        setProfile(userProfile);

        // Load social links and content cards
        const [links, cards, linked] = await Promise.all([
          getSocialLinks(userProfile.user_id),
          getProfileLinks(userProfile.user_id),
          getLinkedAccounts(userProfile.user_id),
        ]);

        setSocialLinks(links);
        setContentCards(cards);
        setLinkedAccounts(linked);
      } catch (err) {
        console.error("Error loading profile:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    loadProfileData();
  }, [normalizedHandle, router]);

  useEffect(() => {
    if (!profile?.username) {
      setSourceProducts([]);
      setSourceProductsError(null);
      setSourceProductsLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    setSourceProductsLoading(true);
    setSourceProductsError(null);

    const fetchProducts = async () => {
      try {
        const response = await fetch(
          `/api/profile/${encodeURIComponent(profile.username)}/source-products`,
          { signal: controller.signal },
        );

        if (!isActive) return;

        if (!response.ok) {
          throw new Error(`Failed to load products (${response.status})`);
        }

        const payload = (await response.json().catch(() => null)) as
          | { listings?: SourceListing[] }
          | null;
        const listings = Array.isArray(payload?.listings) ? payload.listings : [];

        if (isActive) {
          setSourceProducts(listings);
        }
      } catch (error) {
        if (!isActive) return;
        if ((error as { name?: string }).name === "AbortError") {
          return;
        }

        console.error("Failed to load profile products:", error);
        setSourceProducts([]);
        setSourceProductsError(
          error instanceof Error ? error.message : "Unable to load product listings.",
        );
      } finally {
        if (isActive) {
          setSourceProductsLoading(false);
        }
      }
    };

    void fetchProducts();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [profile?.username]);

  // Handle share functionality
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile?.name || profile?.username}'s Bio Link`,
          url: window.location.href,
        });
      } catch (error) {
        console.log("Share cancelled", error);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        // You could add a toast notification here
        console.log("URL copied to clipboard");
      } catch (error) {
        console.error("Failed to copy URL", error);
      }
    }
  };

  // Handle back navigation
  const handleBack = () => {
    if (user?.id === profile?.user_id) {
      // If viewing own profile, go to dashboard
      router.push("/dashboard");
    } else {
      // If viewing someone else's profile, go back
      router.back();
    }
  };

  const handleAvatarChange = useCallback(
    async (file: File) => {
      if (!user?.id) {
        return;
      }

      setIsAvatarUploading(true);
      try {
        const uploadResult = await uploadAvatar(file, user.id);
        if (!uploadResult.success || !uploadResult.url) {
          console.error("Avatar upload failed", uploadResult.error);
          return;
        }

        const supabase = getSupabaseBrowser();
        if (supabase) {
          const { error: updateError } = await supabase
            .from("profiles")
            .update({
              avatar_url: uploadResult.url,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id);

          if (updateError) {
            console.error("Failed to persist updated avatar", updateError);
            return;
          }
        } else {
          console.error("Supabase client unavailable to persist avatar");
        }

        setProfile((prev) =>
          prev ? { ...prev, avatar_url: uploadResult.url } : prev,
        );
      } catch (err) {
        console.error("Failed to update avatar", err);
      } finally {
        setIsAvatarUploading(false);
      }
    },
    [user?.id],
  );

  const handleFollow = async () => {
    if (!profile?.username || requestingFriend) {
      return;
    }

    setRequestingFriend(true);
    try {
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: profile.username }),
      });

      if (!response.ok) {
        const payload = await response.text().catch(() => null);
        console.error("Failed to add follow connection", response.status, payload);
        return;
      }

      setRelationshipLoading(true);
      try {
        const refreshResponse = await fetch(
          `/api/friends/relationship/${encodeURIComponent(profile.username)}`
        );

        if (!refreshResponse.ok) {
          console.error(
            "Failed to refresh relationship status",
            refreshResponse.status
          );
          setRelationshipStatus("none");
          return;
        }

        const payload = (await refreshResponse.json()) as {
          relationship?: RelationshipStatus;
        };
        const relationship = payload?.relationship;

        if (!relationship) {
          setRelationshipStatus("none");
        } else {
          setRelationshipStatus(relationship);
        }
      } catch (refreshError) {
        console.error("Failed to refresh relationship status", refreshError);
        setRelationshipStatus("none");
      } finally {
        setRelationshipLoading(false);
      }
    } catch (err) {
      console.error("Failed to add follow connection", err);
    } finally {
      setRequestingFriend(false);
    }
  };

  const handleRespondToRequest = async (status: "accepted" | "declined") => {
    if (!incomingRequestId || respondingRequest) {
      return;
    }

    setRespondingRequest(true);
    try {
      const response = await fetch("/api/friends/requests/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: incomingRequestId, status }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("Failed to respond to friend request", payload);
        return;
      }

      setRelationshipStatus(status === "accepted" ? "friends" : "none");
      setIncomingRequestId(null);
    } catch (err) {
      console.error("Failed to respond to friend request", err);
    } finally {
      setRespondingRequest(false);
    }
  };

  const modules = useMemo<ProfileModule[]>(() => {
    if (!profile) return [];
    return buildProfileModules({ profile, contentCards, socialLinks });
  }, [profile, contentCards, socialLinks]);

  const linkCardsModule = useMemo(
    () =>
      modules.find(
        (module): module is ProfileModuleLinkCards => module.type === "link_cards",
      ),
    [modules],
  );

  const otherModules = useMemo(
    () => modules.filter((module) => module.type !== "link_cards"),
    [modules],
  );

  const socialsData = useMemo(() => {
    const data: Record<string, string | undefined> = {};

    linkedAccounts.forEach((account) => {
      const key = account.platform?.toLowerCase();
      if (!key || !account.url) return;
      data[key] = account.url;
    });

    socialLinks.forEach((link) => {
      if (!link.is_active) return;
      const key = link.platform?.toLowerCase();
      if (!key || data[key]) return;
      const resolved = resolveSocialLink(link);
      if (!resolved.url) return;
      data[key] = resolved.url;
    });

    return data;
  }, [linkedAccounts, socialLinks]);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (error || !profile) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-[-20%] h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-neutral-500/15 blur-[160px]" />
          <div className="absolute bottom-[-25%] right-[-15%] h-[260px] w-[260px] rounded-full bg-neutral-800/15 blur-[200px]" />
        </div>

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-center shadow-[0_25px_45px_rgba(15,23,42,0.45)] backdrop-blur">
          <h1 className="text-2xl font-semibold text-white">{error || "Profile not found"}</h1>
          <p className="mt-3 text-sm text-white/60">
            Something went wrong while loading this profile. Try again or head back to your dashboard.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-6 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/80 transition-colors hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isOwner = user?.id === profile.user_id;
  const actionSlot = (() => {
    if (isOwner) return undefined;
    if (!profile?.username || !relationshipStatus) return undefined;

    const baseClasses =
      "inline-flex items-center justify-center rounded-full border border-white/30 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

    switch (relationshipStatus) {
      case "none":
        return (
          <button
            type="button"
            className={baseClasses + " hover:border-white/60 hover:bg-white/10"}
            onClick={handleFollow}
            disabled={relationshipLoading || requestingFriend}
          >
            {requestingFriend ? "Sending..." : "Follow"}
          </button>
        );
      case "outgoing_request":
        return (
          <button
            type="button"
            className={baseClasses}
            disabled
          >
            Follow Request Sent
          </button>
        );
      case "friends":
        return (
          <button
            type="button"
            className={baseClasses}
            disabled
          >
            Friends
          </button>
        );
      case "incoming_request":
        return (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              className={baseClasses + " hover:border-white/60 hover:bg-white/10"}
              onClick={() => handleRespondToRequest("accepted")}
              disabled={respondingRequest || !incomingRequestId}
            >
              {respondingRequest ? "Processing..." : "Accept"}
            </button>
            <button
              type="button"
              className={
                baseClasses +
                " border-transparent bg-white/10 text-white/70 hover:border-white/60 hover:bg-white/20"
              }
              onClick={() => handleRespondToRequest("declined")}
              disabled={respondingRequest || !incomingRequestId}
            >
              Decline
            </button>
          </div>
        );
      case "following":
        return (
          <button
            type="button"
            className={baseClasses}
            disabled
          >
            Following
          </button>
        );
      case "followed_by":
        return (
          <button
            type="button"
            className={baseClasses + " hover:border-white/60 hover:bg-white/10"}
            onClick={handleFollow}
            disabled={relationshipLoading || requestingFriend}
          >
            {requestingFriend ? "Sending..." : "Follow Back"}
          </button>
        );
      case "self":
      default:
        return undefined;
    }
  })();

  return (
    <div className="relative min-h-screen pb-[env(safe-area-inset-bottom)] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-24 h-[360px] w-[360px] rounded-full bg-gradient-to-br from-neutral-700/30 via-neutral-900/25 to-transparent blur-[140px]" />
        <div className="absolute -top-32 right-[-10%] h-[300px] w-[300px] rounded-full bg-gradient-to-bl from-neutral-800/30 via-neutral-950/25 to-transparent blur-[160px]" />
        <div className="absolute left-1/2 top-[15%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-neutral-500/15 blur-[170px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-[360px] w-[360px] rounded-full bg-neutral-800/20 blur-[200px]" />
      </div>

      <main className="relative z-10 pb-14 pt-0">
        <HeroHeader
          profile={profile}
          socials={socialsData}
          onShare={handleShare}
          onBack={handleBack}
          isOwner={isOwner}
          onAvatarChange={handleAvatarChange}
          isAvatarUploading={isAvatarUploading}
          relationshipCounts={relationshipCounts ?? undefined}
          actionSlot={actionSlot}
        />

        <div className="mx-auto mt-6 w-full max-w-5xl px-4 pb-20 space-y-12 bg-black">
          {linkCardsModule ? (
            <ContentCardsSection module={linkCardsModule} />
          ) : null}

          <ProductCarousel
            products={sourceProducts}
            loading={sourceProductsLoading}
            error={sourceProductsError}
          />

          {otherModules.length > 0 ? (
            <div className="space-y-10">
              <ProfileModules modules={otherModules} loading={false} isOwner={isOwner} />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
