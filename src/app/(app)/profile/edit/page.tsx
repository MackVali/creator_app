"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfileContext } from "@/components/ProfileProvider";
import { getProfileByUserId, updateProfile } from "@/lib/db";
import { getLinkedAccounts } from "@/lib/db/linked-accounts";
import { getSocialLinks } from "@/lib/db/profile-management";
import { updateMyOnboarding } from "@/lib/db/profiles-client";
import { Profile, ProfileFormData, SocialLink, LinkedAccount } from "@/lib/types";
import { uploadAvatar, uploadBanner } from "@/lib/storage";
import { buildSocialUrl, normalizeUsername, resolveSocialLink } from "@/lib/profile/socialLinks";
import { SocialIcon, getSocialIconDefinition } from "@/components/profile/SocialIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Save, User, Calendar, MapPin, FileText, Camera } from "lucide-react";
import Link from "next/link";
import SocialPillsRow from "@/components/profile/SocialPillsRow";

const SOCIAL_EDIT_CONFIG: Array<{
  platform: string;
  placeholder: string;
  helper?: string;
}> = [
  { platform: "instagram", placeholder: "Instagram handle", helper: "Handle only, no @ or extra prefixes" },
  { platform: "tiktok", placeholder: "TikTok handle", helper: "Handle only, no @ or extra prefixes" },
  { platform: "x", placeholder: "X handle", helper: "Handle only, no @ or extra prefixes" },
  { platform: "twitter", placeholder: "Twitter handle", helper: "Handle only, no @ or extra prefixes" },
  { platform: "youtube", placeholder: "YouTube handle", helper: "Handle only, no @ or extra prefixes" },
  { platform: "facebook", placeholder: "Facebook handle", helper: "Handle only, no @ or extra prefixes" },
  { platform: "spotify", placeholder: "Spotify handle", helper: "Handle only, no @ or extra prefixes" },
  { platform: "snapchat", placeholder: "Snapchat handle", helper: "Handle only, no @ or extra prefixes" },
  { platform: "linkedin", placeholder: "LinkedIn handle", helper: "Handle only, no @ or extra prefixes" },
  { platform: "pinterest", placeholder: "Pinterest handle", helper: "Handle only, no @ or extra prefixes" },
];

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
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);

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
        setBannerPreview(userProfile.banner_url || null);
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

  useEffect(() => {
    let isActive = true;

    if (!profile?.user_id) {
      setLinkedAccounts([]);
      return;
    }

    (async () => {
      try {
        const accounts = await getLinkedAccounts(profile.user_id);
        if (isActive) {
          setLinkedAccounts(accounts);
        }
      } catch (err) {
        console.error("Error loading linked accounts:", err);
        if (isActive) {
          setLinkedAccounts([]);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [profile?.user_id]);

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

  const handleManageSocials = useCallback(() => {
    router.push("/profile/linked-accounts");
  }, [router]);

  const handleSocialChange = useCallback(
    (platform: string, rawValue: string) => {
      setSocialLinks((current) => {
        const normalized = normalizeUsername(platform, rawValue);
        const canonicalUrl = normalized ? buildSocialUrl(platform, normalized) : "";
        const platformKey = platform.toLowerCase();
        const existingIndex = current.findIndex(
          (link) => link.platform?.toLowerCase?.() === platformKey,
        );

        if (existingIndex !== -1) {
          const updated = [...current];
          updated[existingIndex] = {
            ...updated[existingIndex],
            username: normalized || null,
            url: canonicalUrl,
            updated_at: new Date().toISOString(),
          };
          return updated;
        }

        if (!normalized) {
          return current;
        }

        const newEntry: SocialLink = {
          id: `draft-${platformKey}`,
          user_id: profile?.user_id ?? "",
          platform,
          url: canonicalUrl,
          username: normalized,
          icon: null,
          color: null,
          position: current.length,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        return [...current, newEntry];
      });
    },
    [profile?.user_id],
  );

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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatarPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBannerFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setBannerPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
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
      let bannerUrl: string | undefined;

      if (avatarFile) {
        const uploadRes = await uploadAvatar(avatarFile, user.id);
        if (!uploadRes.success || !uploadRes.url) {
          setError(uploadRes.error || "Failed to upload profile picture");
          setSaving(false);
          return;
        }
        avatarUrl = uploadRes.url;
      }

      if (bannerFile) {
        const uploadRes = await uploadBanner(bannerFile, user.id);
        if (!uploadRes.success || !uploadRes.url) {
          setError(uploadRes.error || "Failed to upload cover photo");
          setSaving(false);
          return;
        }
        bannerUrl = uploadRes.url;
      }

      const result = await updateProfile(
        user.id,
        formData,
        avatarUrl,
        bannerUrl
      );
      
      if (result.success && result.profile) {
        setSuccess(true);
        setProfile(result.profile);
        setAvatarPreview(result.profile.avatar_url || null);
        setBannerPreview(result.profile.banner_url || null);

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

  const heroBannerUrl =
    bannerPreview ??
    profile.banner_url ??
    profile.cover_image ??
    profile.hero_media_url ??
    null;
  const heroAvatarUrl = avatarPreview ?? profile.avatar_url ?? null;
  const heroName = profile.name?.trim() || profile.username || "Your profile";
  const heroHandle = profile.username ? `@${profile.username}` : null;
  const heroBio =
    profile.bio?.trim() ||
    profile.tagline?.trim() ||
    "Add a short story so visitors understand what to expect from your profile.";

  return (
    <div className="min-h-screen bg-[#0F0F12] text-zinc-100">
      <section className="relative min-h-[520px] w-full overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 pointer-events-none">
          {heroBannerUrl ? (
            <div className="h-full w-full">
              <img
                src={heroBannerUrl}
                alt=""
                className="h-full w-full object-cover"
                aria-hidden="true"
              />
            </div>
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-900 via-slate-950 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/95" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_65%)]" />
        </div>

        <div className="relative z-10 flex flex-col">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <Link href="/profile">
                <Button variant="ghost" size="sm" className="p-2">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <span className="text-sm font-semibold uppercase tracking-[0.35em] text-white/60">
                Edit profile
              </span>
            </div>
            <Link href="/profile/linked-accounts">
              <Button variant="outline" size="sm" className="text-white">
                Linked Accounts
              </Button>
            </Link>
          </div>

          <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-4 pb-8 pt-6 text-center">
            <div className="relative">
              <input
                id="avatar"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="sr-only"
              />
              <label
                htmlFor="avatar"
                className="group relative inline-flex items-center justify-center rounded-full"
              >
                <Avatar className="h-32 w-32 rounded-full border border-white/20 bg-black/60 shadow-[0_25px_80px_rgba(0,0,0,0.85)] ring-2 ring-white/10 transition duration-200 group-hover:ring-white/60">
                  {heroAvatarUrl ? (
                    <AvatarImage src={heroAvatarUrl} alt={`${heroName}'s avatar`} />
                  ) : (
                    <AvatarFallback className="text-3xl text-white/60">
                      <User className="h-12 w-12 text-white/70" />
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-1 rounded-full bg-black/40 text-[0.6rem] font-semibold tracking-[0.3em] uppercase text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <Camera className="h-3.5 w-3.5" />
                  Edit
                </span>
              </label>
            </div>

            <div>
              <p className="text-4xl font-semibold text-white sm:text-5xl">{heroName}</p>
              {heroHandle ? (
                <p className="mt-2 text-xs uppercase tracking-[0.35em] text-white/70">
                  {heroHandle}
                </p>
              ) : null}
            </div>

            <p className="max-w-3xl text-sm leading-relaxed text-white/70">{heroBio}</p>

            <input
              id="banner"
              type="file"
              accept="image/*"
              onChange={handleBannerChange}
              className="sr-only"
            />
            <label
              htmlFor="banner"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:border-white/50"
            >
              <Camera className="h-3.5 w-3.5 text-white/80" />
              Change hero media
            </label>
          </div>

          <div className="mx-auto w-full max-w-5xl px-4 pb-10">
            <SocialPillsRow
              socials={socialsData}
              editMode
              onAddLink={handleManageSocials}
            />
          </div>
        </div>
      </section>

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

              {/* Social handles */}
              <div className="space-y-3 border-t border-white/5 pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Social handles</span>
                  <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                    Handles only
                  </span>
                </div>
                <p className="text-sm text-zinc-400">
                  Enter the username you use on each platform; we take care of the rest automatically.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {SOCIAL_EDIT_CONFIG.map(({ platform, placeholder, helper }) => {
                    const platformKey = platform.toLowerCase();
                    const currentLink = socialLinks.find(
                      (entry) => entry.platform?.toLowerCase?.() === platformKey,
                    );
                    const label = getSocialIconDefinition(platform).label;
                    const currentHandle = currentLink?.username ?? "";
                    const prefillHandle = linkedHandlePrefills[platformKey];
                    const showPrefillButton =
                      !!prefillHandle && prefillHandle !== currentHandle;

                    return (
                      <label key={platform} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-white">
                          <SocialIcon platform={platform} className="h-10 w-10" iconClassName="h-4 w-4" />
                          {label}
                        </div>
                        <Input
                          value={currentLink?.username ?? ""}
                          placeholder={placeholder}
                          onChange={(e) => handleSocialChange(platform, e.target.value)}
                          className="h-11 text-sm text-white border-zinc-700 placeholder:text-zinc-500 focus-visible:border-white/40 focus-visible:ring-white/20"
                        />
                        {helper ? (
                          <p className="text-xs text-zinc-500">{helper}</p>
                        ) : null}
                        {prefillHandle ? (
                          <div className="flex items-center justify-between text-xs text-zinc-500">
                            <span>Connected: @{prefillHandle}</span>
                            {showPrefillButton ? (
                              <button
                                type="button"
                                onClick={() => handleSocialChange(platform, prefillHandle)}
                                className="text-xs font-semibold text-emerald-300 hover:text-emerald-100"
                              >
                                Use connected account
                              </button>
                            ) : (
                              <span className="text-emerald-300">Applied</span>
                            )}
                          </div>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
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
    </div>
  );
}
