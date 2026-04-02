"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfileContext } from "@/components/ProfileProvider";
import { getProfileByUserId, updateProfile } from "@/lib/db";
import {
  PLATFORM_CONFIG,
  getLinkedAccounts,
  SupportedPlatform,
  upsertLinkedAccount,
} from "@/lib/db/linked-accounts";
import { getSocialLinks } from "@/lib/db/profile-management";
import { updateMyOnboarding } from "@/lib/db/profiles-client";
import { Profile, ProfileFormData, SocialLink, LinkedAccount } from "@/lib/types";
import { uploadAvatar } from "@/lib/storage";
import { buildSocialUrl, normalizeUsername, resolveSocialLink } from "@/lib/profile/socialLinks";
import { getSocialIconDefinition } from "@/components/profile/SocialIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, User, Calendar, MapPin, FileText, Camera } from "lucide-react";
import Link from "next/link";
import SocialPillsRow from "@/components/profile/SocialPillsRow";

const LINKED_ACCOUNT_ORDER: SupportedPlatform[] = [
  "instagram",
  "tiktok",
  "youtube",
  "spotify",
  "snapchat",
  "facebook",
  "twitter",
];

const HERO_HEIGHT_CLASSES =
  "min-h-[308px] sm:min-h-[380px] lg:min-h-[440px] xl:min-h-[500px]";

function getHeroInitials(name?: string | null, username?: string | null) {
  if (name && name.trim()) {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  if (username) {
    return username.slice(0, 2).toUpperCase();
  }
  return "??";
}

export default function ProfileEditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { refreshProfile } = useProfileContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<ProfileFormData>({
    name: "",
    username: "",
    dob: "",
    city: "",
    bio: "",
    is_private: false,
  });

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarSourceUrl, setPendingAvatarSourceUrl] = useState<string | null>(null);
  const [editorZoom, setEditorZoom] = useState(1);
  const [editorOffset, setEditorOffset] = useState({ x: 0, y: 0 });
  const [editorImageSize, setEditorImageSize] = useState({ width: 0, height: 0 });
  const [editorFrameSize, setEditorFrameSize] = useState({ width: 0, height: 0 });
  const [editorFrameAspectRatio, setEditorFrameAspectRatio] = useState(3 / 2);
  const avatarEditorFrameRef = useRef<HTMLDivElement | null>(null);
  const heroPhotoSurfaceRef = useRef<HTMLDivElement | null>(null);
  const gestureStateRef = useRef<{
    startDistance: number;
    startMidpoint: { x: number; y: number };
    startZoom: number;
    startOffset: { x: number; y: number };
  } | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [inlineSelectedPlatform, setInlineSelectedPlatform] = useState<SupportedPlatform | null>(
    null,
  );
  const [inlineHandle, setInlineHandle] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineSaving, setInlineSaving] = useState(false);
  const inlinePlatformDefinition = inlineSelectedPlatform
    ? getSocialIconDefinition(inlineSelectedPlatform)
    : null;
  const InlinePlatformIcon = inlinePlatformDefinition?.icon;

  const onboarding = searchParams.get("onboarding") === "1";
  const redirectPath = searchParams.get("redirect");

  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) {
        router.push("/auth");
        return;
      }

      try {
        setLoading(true);
        const userProfile = await getProfileByUserId(user.id);
        
      if (userProfile) {
        setProfile(userProfile);
        setFormData({
          name: userProfile.name || "",
          username: userProfile.username || "",
          dob: userProfile.dob || "",
          city: userProfile.city || "",
          bio: userProfile.bio || "",
          is_private: userProfile.is_private ?? false,
        });
        setAvatarPreview(userProfile.avatar_url || null);
      }
      } catch (err) {
        console.error("Error loading profile:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [user, router]);

  useEffect(() => {
    let isActive = true;

    if (!profile?.user_id) {
      setSocialLinks([]);
      return;
    }

    (async () => {
      try {
        const links = await getSocialLinks(profile.user_id);
        if (isActive) {
          const normalizedLinks = links.map((link) => {
            const usernameSource = link.username ?? link.url;
            const normalizedUsername = normalizeUsername(link.platform, usernameSource);
            const canonicalUrl = normalizedUsername
              ? buildSocialUrl(link.platform, normalizedUsername)
              : link.url;
            return {
              ...link,
              username: normalizedUsername || link.username,
              url: canonicalUrl ?? link.url,
            };
          });
          setSocialLinks(normalizedLinks);
        }
      } catch (err) {
        console.error("Error loading social links:", err);
        if (isActive) {
          setSocialLinks([]);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [profile?.user_id]);

  const refreshLinkedAccounts = useCallback(async () => {
    if (!profile?.user_id) {
      setLinkedAccounts([]);
      return;
    }

    try {
      const accounts = await getLinkedAccounts(profile.user_id);
      setLinkedAccounts(accounts);
    } catch (err) {
      console.error("Error loading linked accounts:", err);
      setLinkedAccounts([]);
    }
  }, [profile?.user_id]);

  useEffect(() => {
    refreshLinkedAccounts();
  }, [refreshLinkedAccounts]);

  const socialsData = useMemo(() => {
    const data: Record<string, string | undefined> = {};
    socialLinks.forEach((link) => {
      const resolved = resolveSocialLink(link);
      if (resolved.url) {
        data[link.platform.toLowerCase()] = resolved.url;
      }
    });
    return data;
  }, [socialLinks]);

  const linkedHandlePrefills = useMemo(() => {
    const prefills: Record<string, string> = {};
    linkedAccounts.forEach((account) => {
      const platformKey = account.platform?.toLowerCase?.();
      if (!platformKey) return;
      const handle = normalizeUsername(platformKey, account.url);
      if (handle) {
        prefills[platformKey] = handle;
      }
    });
    return prefills;
  }, [linkedAccounts]);

  const activeLinkedAccounts = useMemo(() => {
    const visible = linkedAccounts.filter((account) => account.url?.trim());
    const sortIndex = (platform?: string) => {
      const normalized = (platform ?? "").toLowerCase();
      const index = LINKED_ACCOUNT_ORDER.indexOf(normalized as SupportedPlatform);
      return index === -1 ? LINKED_ACCOUNT_ORDER.length : index;
    };

    return [...visible].sort((a, b) => {
      const indexA = sortIndex(a.platform);
      const indexB = sortIndex(b.platform);
      return indexA - indexB;
    });
  }, [linkedAccounts]);

  const hasLinkedAccounts = activeLinkedAccounts.length > 0;

  const handlePlatformSelection = useCallback(
    (platform?: SupportedPlatform) => {
      if (!platform) {
        setInlineSelectedPlatform(null);
        return;
      }
      setInlineSelectedPlatform(platform);
      setInlineHandle(linkedHandlePrefills[platform] ?? "");
      setInlineError(null);
    },
    [linkedHandlePrefills],
  );

  const handleInlineSave = useCallback(async () => {
    if (!user?.id || !inlineSelectedPlatform) {
      return;
    }

    const trimmed = inlineHandle.trim();
    if (!trimmed) {
      setInlineError("Enter a username or link");
      return;
    }

    setInlineSaving(true);
    setInlineError(null);
    const { success, error: saveError } = await upsertLinkedAccount(
      user.id,
      inlineSelectedPlatform,
      trimmed,
    );
    setInlineSaving(false);

    if (success) {
      setInlineSelectedPlatform(null);
      setInlineHandle("");
      await refreshLinkedAccounts();
    } else {
      setInlineError(saveError || "Failed to link account");
    }
  }, [inlineHandle, inlineSelectedPlatform, refreshLinkedAccounts, user?.id]);

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePrivacyChange = (checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      is_private: checked
    }));
  };

  const validateRequired = () => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }

    if (!formData.username.trim()) {
      errors.username = "Username is required";
    }

    if (!formData.dob.trim()) {
      errors.dob = "Date of birth is required";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const MIN_EDITOR_ZOOM = 0.7;
  const MAX_EDITOR_ZOOM = 4;

  const getTouchDistance = (a: React.Touch, b: React.Touch) => {
    const dx = b.clientX - a.clientX;
    const dy = b.clientY - a.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchMidpoint = (a: React.Touch, b: React.Touch) => ({
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  });

  const clampEditorOffset = useCallback(
    (nextOffset: { x: number; y: number }, zoomLevel: number) => {
      if (
        !editorImageSize.width ||
        !editorImageSize.height ||
        !editorFrameSize.width ||
        !editorFrameSize.height
      ) {
        return nextOffset;
      }

      const baseCoverScale = Math.max(
        editorFrameSize.width / editorImageSize.width,
        editorFrameSize.height / editorImageSize.height,
      );
      const renderedWidth = editorImageSize.width * baseCoverScale * zoomLevel;
      const renderedHeight = editorImageSize.height * baseCoverScale * zoomLevel;
      const maxOffsetX = Math.max(0, (renderedWidth - editorFrameSize.width) / 2);
      const maxOffsetY = Math.max(0, (renderedHeight - editorFrameSize.height) / 2);

      return {
        x: Math.min(maxOffsetX, Math.max(-maxOffsetX, nextOffset.x)),
        y: Math.min(maxOffsetY, Math.max(-maxOffsetY, nextOffset.y)),
      };
    },
    [editorFrameSize.height, editorFrameSize.width, editorImageSize.height, editorImageSize.width],
  );

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const heroRect = heroPhotoSurfaceRef.current?.getBoundingClientRect();
      if (heroRect?.width && heroRect?.height) {
        setEditorFrameAspectRatio(heroRect.width / heroRect.height);
      }
      if (pendingAvatarSourceUrl) {
        URL.revokeObjectURL(pendingAvatarSourceUrl);
      }
      const sourceUrl = URL.createObjectURL(file);
      setPendingAvatarFile(file);
      setPendingAvatarSourceUrl(sourceUrl);
      setEditorZoom(1);
      setEditorOffset({ x: 0, y: 0 });
      setEditorImageSize({ width: 0, height: 0 });
      setIsAvatarEditorOpen(true);
    }
    e.target.value = "";
  };

  const handleEditorTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    const [touchA, touchB] = [event.touches[0], event.touches[1]];
    gestureStateRef.current = {
      startDistance: getTouchDistance(touchA, touchB),
      startMidpoint: getTouchMidpoint(touchA, touchB),
      startZoom: editorZoom,
      startOffset: { ...editorOffset },
    };
  };

  const handleEditorTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !gestureStateRef.current) return;
    event.preventDefault();
    const [touchA, touchB] = [event.touches[0], event.touches[1]];
    const nextDistance = getTouchDistance(touchA, touchB);
    const nextMidpoint = getTouchMidpoint(touchA, touchB);
    const zoomRatio = nextDistance / gestureStateRef.current.startDistance;
    const nextZoom = Math.min(
      MAX_EDITOR_ZOOM,
      Math.max(MIN_EDITOR_ZOOM, gestureStateRef.current.startZoom * zoomRatio),
    );
    const deltaX = nextMidpoint.x - gestureStateRef.current.startMidpoint.x;
    const deltaY = nextMidpoint.y - gestureStateRef.current.startMidpoint.y;
    const nextOffset = clampEditorOffset(
      {
        x: gestureStateRef.current.startOffset.x + deltaX,
        y: gestureStateRef.current.startOffset.y + deltaY,
      },
      nextZoom,
    );

    setEditorZoom(nextZoom);
    setEditorOffset(nextOffset);
  };

  const handleEditorTouchEnd = () => {
    if (gestureStateRef.current && gestureStateRef.current.startDistance) {
      gestureStateRef.current = null;
    }
  };

  const handleAvatarEditorCancel = () => {
    setIsAvatarEditorOpen(false);
    if (pendingAvatarSourceUrl) {
      URL.revokeObjectURL(pendingAvatarSourceUrl);
    }
    setPendingAvatarFile(null);
    setPendingAvatarSourceUrl(null);
    setEditorZoom(1);
    setEditorOffset({ x: 0, y: 0 });
    setEditorImageSize({ width: 0, height: 0 });
    setEditorFrameSize({ width: 0, height: 0 });
    gestureStateRef.current = null;
  };

  const handleAvatarEditorSave = async () => {
    if (!pendingAvatarFile || !pendingAvatarSourceUrl || !avatarEditorFrameRef.current || !editorImageSize.width) {
      return;
    }

    const frameRect = avatarEditorFrameRef.current.getBoundingClientRect();
    const frameWidth = frameRect.width;
    const frameHeight = frameRect.height;
    if (!frameWidth || !frameHeight) return;

    const outputWidth = 1200;
    const outputHeight = Math.round((frameHeight / frameWidth) * outputWidth);
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image = new Image();
    image.src = pendingAvatarSourceUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load selected image"));
    });

    const clampedOffset = clampEditorOffset(editorOffset, editorZoom);
    const baseCoverScale = Math.max(frameWidth / editorImageSize.width, frameHeight / editorImageSize.height);
    const renderedScale = baseCoverScale * editorZoom;
    const renderedWidth = editorImageSize.width * renderedScale;
    const renderedHeight = editorImageSize.height * renderedScale;
    const drawX = (frameWidth - renderedWidth) / 2 + clampedOffset.x;
    const drawY = (frameHeight - renderedHeight) / 2 + clampedOffset.y;
    const renderToCanvasScale = outputWidth / frameWidth;

    ctx.drawImage(
      image,
      drawX * renderToCanvasScale,
      drawY * renderToCanvasScale,
      renderedWidth * renderToCanvasScale,
      renderedHeight * renderToCanvasScale,
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.92);
    });
    if (!blob) return;

    const croppedAvatarFile = new File([blob], `avatar-${Date.now()}.jpg`, { type: "image/jpeg" });
    const croppedAvatarDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setAvatarFile(croppedAvatarFile);
    setAvatarPreview(croppedAvatarDataUrl);
    handleAvatarEditorCancel();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);

    if (!user?.id) {
      setError("Not authenticated");
      return;
    }

    if (!validateRequired()) {
      setError("Please fill out required fields.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      let avatarUrl: string | undefined;

      if (avatarFile) {
        const uploadRes = await uploadAvatar(avatarFile, user.id);
        if (!uploadRes.success || !uploadRes.url) {
          setError(uploadRes.error || "Failed to upload profile picture");
          setSaving(false);
          return;
        }
        avatarUrl = uploadRes.url;
      }

      const result = await updateProfile(
        user.id,
        formData,
        avatarUrl
      );
      
      if (result.success && result.profile) {
        setSuccess(true);
        setProfile(result.profile);
        setAvatarPreview(result.profile.avatar_url || null);

        if (onboarding) {
          try {
            const onboardingRes = await updateMyOnboarding({
              onboarding_version: 1,
              onboarding_step: null,
              onboarding_completed_at: new Date().toISOString(),
            });

            if (!onboardingRes.success) {
              console.error(
                "Failed to persist onboarding completion:",
                onboardingRes.error
              );
              setError(
                onboardingRes.error ??
                  "Failed to persist onboarding completion"
              );
            }
          } catch (e) {
            console.error("Failed to persist onboarding completion:", e);
          }
        }

        try {
          await refreshProfile();
        } catch (err) {
          console.error("Failed to refresh profile context:", err);
        }

        const redirectTarget =
          redirectPath && redirectPath.startsWith("/")
            ? redirectPath
            : "/profile";

        setTimeout(() => {
          router.replace(redirectTarget);
        }, 1500);
      } else {
        setError(result.error || "Failed to update profile");
      }
    } catch (err) {
      console.error("Error updating profile:", err);
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!isAvatarEditorOpen || !avatarEditorFrameRef.current) {
      return;
    }

    const updateFrameSize = () => {
      if (!avatarEditorFrameRef.current) return;
      const rect = avatarEditorFrameRef.current.getBoundingClientRect();
      setEditorFrameSize({ width: rect.width, height: rect.height });
    };

    updateFrameSize();
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(avatarEditorFrameRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isAvatarEditorOpen]);

  useEffect(() => {
    return () => {
      if (pendingAvatarSourceUrl) {
        URL.revokeObjectURL(pendingAvatarSourceUrl);
      }
    };
  }, [pendingAvatarSourceUrl]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0F12] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-200 mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-[#0F0F12] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-300 mb-4">{error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 border border-zinc-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const heroAvatarUrl = avatarPreview ?? profile.avatar_url ?? null;
  const heroName = profile.name?.trim() || profile.username || "Your profile";
  const heroHandle = profile.username ? `@${profile.username}` : null;
  const heroBio =
    profile.bio?.trim() ||
    profile.tagline?.trim() ||
    "Add a short story so visitors understand what to expect from your profile.";
  const heroInitials = getHeroInitials(profile.name, profile.username);
  const editorBaseCoverScale =
    editorImageSize.width && editorImageSize.height && editorFrameSize.width && editorFrameSize.height
      ? Math.max(
          editorFrameSize.width / editorImageSize.width,
          editorFrameSize.height / editorImageSize.height,
        )
      : 1;
  const editorRenderedWidth = editorImageSize.width * editorBaseCoverScale;
  const editorRenderedHeight = editorImageSize.height * editorBaseCoverScale;

  return (
    <div className="min-h-screen bg-[#0F0F12] text-zinc-100">
      <section className="w-full border-b border-white/5 bg-gradient-to-b from-slate-950 via-slate-950/80 to-black">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-8 pt-5 text-center">
          <div className="relative w-full overflow-visible rounded-[32px] border border-white/10 bg-black/40 shadow-[0_25px_60px_rgba(2,6,23,0.55)]">
            <div ref={heroPhotoSurfaceRef} className={`relative ${HERO_HEIGHT_CLASSES}`}>
              <div className="absolute inset-0">
                {heroAvatarUrl ? (
                  <img
                    src={heroAvatarUrl}
                    alt={`${heroName}'s profile photo`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-black text-5xl font-semibold text-white">
                    <span aria-hidden="true">{heroInitials}</span>
                    <span className="sr-only">{`${heroName}'s initials`}</span>
                  </div>
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/60 to-black/95" />
              <header className="pointer-events-auto absolute inset-x-4 top-3 flex items-center text-white/80 sm:top-4">
                <div className="flex items-center gap-2.5">
                  <Link href="/profile">
                    <Button variant="ghost" size="sm" className="p-2">
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                  </Link>
                  <span className="text-xs font-semibold uppercase tracking-[0.32em] text-white/60 sm:text-sm">
                    Edit profile
                  </span>
                </div>
              </header>
              <input
                id="avatar"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="sr-only"
              />
              <div className="absolute inset-x-5 bottom-4 z-10 flex flex-col items-center gap-2 text-center text-white sm:inset-x-6 sm:bottom-6 sm:gap-2.5">
                <p className="text-3xl font-semibold text-white sm:text-4xl lg:text-5xl">{heroName}</p>
                {heroHandle ? (
                  <span className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-black/40 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.3em] text-white/80 sm:px-4 sm:text-xs sm:tracking-[0.35em]">
                    {heroHandle}
                  </span>
                ) : null}
                {heroBio ? (
                  <p className="max-w-2xl text-xs leading-relaxed text-white/80 sm:text-sm">
                    {heroBio}
                  </p>
                ) : null}
                <label
                  htmlFor="avatar"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.32em] text-white transition hover:border-white/50 sm:px-5 sm:py-2 sm:text-xs sm:tracking-[0.35em]"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Edit profile photo
                </label>
                <div className="mt-2 w-full max-w-2xl pointer-events-auto sm:mt-3 sm:max-w-3xl">
                  <SocialPillsRow
                    socials={socialsData}
                    editMode
                    onPlatformSelect={handlePlatformSelection}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        {hasLinkedAccounts ? (
          <div className="mx-auto w-full max-w-5xl px-4 pb-10">
            <div className="border-b border-white/10 pb-4">
              <div className="space-y-1 max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/60">
                  Linked accounts
                </p>
                <p className="text-sm text-zinc-400">
                  Your audience sees these profiles on your page.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {activeLinkedAccounts.map((account) => {
                const platformKey = (account.platform ?? "").toLowerCase();
                const definition = getSocialIconDefinition(platformKey);
                const Icon = definition.icon;
                let subtext = account.username ? `@${account.username}` : undefined;
                if (!subtext && account.url) {
                  try {
                    subtext = new URL(account.url).hostname;
                  } catch {
                    subtext = account.url;
                  }
                }

                if (!account.url) {
                  return null;
                }

                return (
                  <a
                    key={`${platformKey}-${account.url}`}
                    href={account.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/30"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-white">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white">
                        {definition.label}
                      </span>
                      {subtext ? (
                        <span className="text-xs uppercase tracking-[0.35em] text-white/50">
                          {subtext}
                        </span>
                      ) : null}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
      <Dialog.Root
        open={isAvatarEditorOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleAvatarEditorCancel();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[230] w-[min(95vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-white/10 bg-[#05070c] p-4 text-white shadow-[0_30px_80px_rgba(0,0,0,0.65)] focus:outline-none sm:p-5">
            <div className="space-y-4">
              <div className="space-y-1">
                <Dialog.Title className="text-lg font-semibold">Adjust profile photo</Dialog.Title>
                <Dialog.Description className="text-sm text-zinc-400">
                  Zoom and move your image so it looks perfect in your profile hero.
                </Dialog.Description>
              </div>
              <div
                ref={avatarEditorFrameRef}
                className="relative w-full touch-none overflow-hidden rounded-[24px] border border-white/10 bg-black/70"
                style={{ aspectRatio: editorFrameAspectRatio.toString() }}
                onTouchStart={handleEditorTouchStart}
                onTouchMove={handleEditorTouchMove}
                onTouchEnd={handleEditorTouchEnd}
                onTouchCancel={handleEditorTouchEnd}
              >
                {pendingAvatarSourceUrl ? (
                  <img
                    src={pendingAvatarSourceUrl}
                    alt="Selected profile"
                    onLoad={(event) =>
                      setEditorImageSize({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      })
                    }
                    className="absolute left-1/2 top-1/2 max-w-none"
                    style={{
                      width: `${Math.max(editorRenderedWidth, 1)}px`,
                      height: `${Math.max(editorRenderedHeight, 1)}px`,
                      transform: `translate(calc(-50% + ${editorOffset.x}px), calc(-50% + ${editorOffset.y}px)) scale(${editorZoom})`,
                      transformOrigin: "center center",
                    }}
                  />
                ) : null}
                <div className="pointer-events-none absolute inset-0 border border-white/20" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/60 to-black/95" />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={handleAvatarEditorCancel}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleAvatarEditorSave}>
                  Save photo
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
        {onboarding && (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">
            <p className="font-medium">Complete your profile to continue.</p>
            <p className="mt-1 text-zinc-400">
              Add your name, username, and details so we can personalize your experience.
            </p>
            {redirectPath && redirectPath.startsWith("/") && (
              <p className="mt-2 text-xs text-zinc-500">
                You&apos;ll be redirected back to {redirectPath} once you&apos;re finished.
              </p>
            )}
          </div>
        )}
        <Card className="shadow-xl border border-white/5 bg-[#15161A]">
          <CardHeader>
            <CardTitle className="text-center text-2xl">Update Your Profile</CardTitle>
            <p className="text-center text-zinc-400 text-sm">
              Customize your profile to make it uniquely yours
            </p>
          </CardHeader>

          <CardContent>
            {success && (
              <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-lg">
                <p className="text-zinc-200 text-center">
                  Profile updated successfully! Redirecting...
                </p>
              </div>
            )}

            {error && (
              <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-lg">
                <p className="text-zinc-300 text-center">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-zinc-400" />
                  <span>
                    Full Name
                    {hasAttemptedSubmit ? (
                      <span className="text-red-400 ml-1">*</span>
                    ) : null}
                  </span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter your full name"
                  className={`h-12 text-lg bg-black text-white placeholder:text-zinc-500 ${
                    hasAttemptedSubmit && fieldErrors.name
                      ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/60"
                      : "border-zinc-700 focus-visible:border-zinc-200 focus-visible:ring-white/20"
                  }`}
                />
                {hasAttemptedSubmit && fieldErrors.name ? (
                  <p className="text-sm text-red-400">{fieldErrors.name}</p>
                ) : null}
              </div>

              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username" className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-zinc-400" />
                  <span>
                    Username
                    {hasAttemptedSubmit ? (
                      <span className="text-red-400 ml-1">*</span>
                    ) : null}
                  </span>
                </Label>
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleInputChange("username", e.target.value)}
                  placeholder="Choose a unique username"
                  className={`h-12 text-lg bg-black text-white placeholder:text-zinc-500 ${
                    hasAttemptedSubmit && fieldErrors.username
                      ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/60"
                      : "border-zinc-700 focus-visible:border-zinc-200 focus-visible:ring-white/20"
                  }`}
                />
                <p className="text-sm text-zinc-400">
                  This will be your unique identifier: @{formData.username || "username"}
                </p>
                {hasAttemptedSubmit && fieldErrors.username ? (
                  <p className="text-sm text-red-400">{fieldErrors.username}</p>
                ) : null}
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <Label htmlFor="bio" className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-zinc-400" />
                  <span>Bio</span>
                </Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleInputChange("bio", e.target.value)}
                  placeholder="Tell us about yourself..."
                  className="min-h-[100px] text-lg resize-none bg-black text-white border-zinc-700 placeholder:text-zinc-500 focus-visible:ring-white/20 focus-visible:ring-offset-0"
                />
              </div>

              {/* Date of Birth */}
              <div className="space-y-2">
                <Label htmlFor="dob" className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  <span>
                    Date of Birth
                    {hasAttemptedSubmit ? (
                      <span className="text-red-400 ml-1">*</span>
                    ) : null}
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="dob"
                    type="date"
                    value={formData.dob}
                    onChange={(e) => handleInputChange("dob", e.target.value)}
                    className={`h-12 w-full rounded-lg border bg-gradient-to-r from-zinc-950 to-zinc-900 text-lg text-white placeholder:text-zinc-500 transition-colors duration-200 appearance-none ${
                      hasAttemptedSubmit && fieldErrors.dob
                        ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/60"
                        : "border-zinc-700 focus-visible:border-zinc-200 focus-visible:ring-white/20"
                    } pr-12 pl-4`}
                  />
                  <Calendar className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/70" />
                </div>
                {hasAttemptedSubmit && fieldErrors.dob ? (
                  <p className="text-sm text-red-400">{fieldErrors.dob}</p>
                ) : null}
              </div>

              {/* City */}
              <div className="space-y-2">
                <Label htmlFor="city" className="flex items-center space-x-2">
                  <MapPin className="h-4 w-4 text-zinc-400" />
                  <span>City</span>
                </Label>
                <Input
                  id="city"
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  placeholder="Where are you located?"
                  className="h-12 text-lg bg-black text-white border-zinc-700 placeholder:text-zinc-500 focus-visible:border-zinc-200 focus-visible:ring-white/20"
                />
              </div>

              {/* Privacy Toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-200">
                    Profile visibility
                  </span>
                  <span
                    className="text-xs uppercase tracking-[0.3em] text-zinc-500"
                    aria-live="polite"
                  >
                    {formData.is_private ? "Private" : "Public"}
                  </span>
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={formData.is_private ?? false}
                    onChange={(e) => handlePrivacyChange(e.target.checked)}
                  />
                  <span className="relative inline-flex h-6 w-12 flex-none items-center rounded-full bg-zinc-700 transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-white/70 peer-checked:bg-emerald-500">
                    <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 peer-checked:translate-x-5" />
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <div className="pt-6">
                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full h-14 bg-white text-black text-lg font-semibold rounded-xl shadow-lg hover:bg-zinc-200 transition-all duration-200"
                >
                  {saving ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                      <span>Saving...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Save className="h-5 w-5" />
                      <span>Save Changes</span>
                    </div>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>

      {inlineSelectedPlatform ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              setInlineSelectedPlatform(null);
              setInlineError(null);
              setInlineHandle("");
            }}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-lg rounded-[30px] border border-white/10 bg-[#08090E]/90 p-6 shadow-[0_25px_70px_rgba(2,6,23,0.65)] backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {InlinePlatformIcon ? (
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] text-white`}
                    aria-hidden="true"
                  >
                    <InlinePlatformIcon className="h-6 w-6" />
                  </span>
                ) : null}
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.4em] text-white/60">
                    Add a platform
                  </p>
                  <p className="text-xl font-semibold text-white">
                    {inlinePlatformDefinition?.label ?? "Add account"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInlineSelectedPlatform(null);
                  setInlineError(null);
                  setInlineHandle("");
                }}
                className="text-xs uppercase tracking-[0.35em] text-white/60 transition hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="mt-5 space-y-3">
              <Input
                value={inlineHandle}
                onChange={(e) => setInlineHandle(e.target.value)}
                placeholder="Username or URL"
                className="h-12 rounded-xl border border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40 focus-visible:border-white/40 focus-visible:bg-white/10"
                aria-label={`Add ${inlinePlatformDefinition?.label ?? "platform"} handle`}
              />
              {inlineError ? (
                <p className="text-xs text-red-400">{inlineError}</p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setInlineSelectedPlatform(null);
                    setInlineError(null);
                    setInlineHandle("");
                  }}
                  disabled={inlineSaving}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleInlineSave} disabled={inlineSaving}>
                  {inlineSaving ? "Saving..." : "Save link"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
