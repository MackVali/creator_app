"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfileContext } from "@/components/ProfileProvider";
import { getProfileByUserId, updateProfile } from "@/lib/db";
import { updateMyOnboarding } from "@/lib/db/profiles-client";
import { Profile, ProfileFormData } from "@/lib/types";
import { uploadAvatar, uploadBanner } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Save, User, Calendar, MapPin, FileText } from "lucide-react";
import Link from "next/link";

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

  return (
    <div className="min-h-screen bg-[#0F0F12] text-zinc-100">
      {/* Header */}
      <div className="bg-[#15161A] border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/profile">
                <Button variant="ghost" size="sm" className="p-2">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-zinc-100">Edit Profile</h1>
            </div>
            <Link href="/profile/linked-accounts">
              <Button variant="outline" size="sm">Linked Accounts</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {onboarding && (
          <div className="mb-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">
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
              {/* Cover & Profile Photo */}
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Cover + Profile
                </p>
                <div className="relative">
                  <label
                    htmlFor="banner"
                    className="group block rounded-2xl border border-white/10 bg-white/5 shadow-inner overflow-hidden"
                  >
                    <input
                      id="banner"
                      type="file"
                      accept="image/*"
                      onChange={handleBannerChange}
                      className="sr-only"
                    />
                    <div className="relative h-48 w-full bg-gradient-to-br from-white/10 to-white/0">
                      {bannerPreview ? (
                        <img
                          src={bannerPreview}
                          alt="Cover preview"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                      <div className="absolute inset-x-0 bottom-2 flex items-center justify-center text-xs font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        Change cover photo
                      </div>
                      <div className="absolute inset-x-0 bottom-3 text-center text-xs font-semibold uppercase tracking-[0.35em] text-white/80">
                        Add a cover photo
                      </div>
                    </div>
                  </label>

                  <label
                    htmlFor="avatar"
                    className="group absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[#0F0F12] bg-transparent shadow-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
                  >
                    <input
                      id="avatar"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="sr-only"
                    />
                    <Avatar className="h-28 w-28 rounded-full border border-white/10 bg-zinc-900/60 ring-4 ring-[#0F0F12] shadow-xl transition duration-200 group-hover:ring-white/60">
                      {avatarPreview ? (
                        <AvatarImage src={avatarPreview} alt="Avatar preview" />
                      ) : (
                        <AvatarFallback className="text-3xl text-zinc-500">
                          <User className="h-12 w-12 text-zinc-500" />
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-white opacity-0 transition-opacity duration-200 group-hover:opacity-70">
                      Upload
                    </div>
                  </label>
                </div>
              </div>

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
      </div>
    </div>
  );
}
