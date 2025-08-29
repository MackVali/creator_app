"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { getProfileByUserId, updateProfile } from "@/lib/db";
import { Profile, ProfileFormData } from "@/lib/types";
import { uploadAvatar, uploadBanner } from "@/lib/storage";
import {
  getSocialLinks,
  createSocialLink,
  updateSocialLink,
  deleteSocialLink,
} from "@/lib/db/profile-management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Save, User, Calendar, MapPin, FileText } from "lucide-react";
import Link from "next/link";

const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  spotify: "Spotify",
  apple: "Apple Music",
  snapchat: "Snapchat",
};

const socialPlatforms = Object.keys(platformLabels);

function createInitialSocialState() {
  return socialPlatforms.reduce((acc, platform) => {
    acc[platform] = { id: undefined as string | undefined, url: "" };
    return acc;
  }, {} as Record<string, { id?: string; url: string }>);
}

export default function ProfileEditPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState<ProfileFormData>({
    name: "",
    username: "",
    dob: "",
    city: "",
    bio: "",
  });

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [socialLinks, setSocialLinks] = useState<Record<string, { id?: string; url: string }>>(createInitialSocialState());

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user?.id) {
        router.push("/auth");
        return;
      }

      try {
        setLoading(true);
        const userProfile = await getProfileByUserId(session.user.id);
        
        if (userProfile) {
          setProfile(userProfile);
          setFormData({
            name: userProfile.name || "",
            username: userProfile.username || "",
            dob: userProfile.dob || "",
            city: userProfile.city || "",
            bio: userProfile.bio || "",
          });
          setAvatarPreview(userProfile.avatar_url || null);
          setBannerPreview(userProfile.banner_url || null);

          const links = await getSocialLinks(session.user.id);
          const linksMap = createInitialSocialState();
          links.forEach((link) => {
            const key = link.platform.toLowerCase();
            if (linksMap[key] !== undefined) {
              linksMap[key] = { id: link.id, url: link.url };
            }
          });
          setSocialLinks(linksMap);
        }
      } catch (err) {
        console.error("Error loading profile:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [session, router]);

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
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

  const handleSocialLinkChange = (platform: string, value: string) => {
    setSocialLinks((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], url: value },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!session?.user?.id) {
      setError("Not authenticated");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      let avatarUrl: string | undefined;
      let bannerUrl: string | undefined;

      if (avatarFile) {
        const uploadRes = await uploadAvatar(avatarFile, session.user.id);
        if (!uploadRes.success || !uploadRes.url) {
          setError(uploadRes.error || "Failed to upload profile picture");
          setSaving(false);
          return;
        }
        avatarUrl = uploadRes.url;
      }

      if (bannerFile) {
        const uploadRes = await uploadBanner(bannerFile, session.user.id);
        if (!uploadRes.success || !uploadRes.url) {
          setError(uploadRes.error || "Failed to upload cover photo");
          setSaving(false);
          return;
        }
        bannerUrl = uploadRes.url;
      }

      const result = await updateProfile(
        session.user.id,
        formData,
        avatarUrl,
        bannerUrl
      );

      if (result.success && result.profile) {
        try {
          await Promise.all(
            socialPlatforms.map(async (platform) => {
              const link = socialLinks[platform];
              if (link.url) {
                if (link.id) {
                  await updateSocialLink(link.id, session.user.id, { url: link.url });
                } else {
                  await createSocialLink(session.user.id, { platform, url: link.url });
                }
              } else if (link.id) {
                await deleteSocialLink(link.id, session.user.id);
              }
            })
          );
        } catch (linkErr) {
          console.error("Error updating social links:", linkErr);
        }

        setSuccess(true);
        setProfile(result.profile);
        setAvatarPreview(result.profile.avatar_url || null);
        setBannerPreview(result.profile.banner_url || null);

        // Redirect to profile page after a short delay
        setTimeout(() => {
          router.push("/profile");
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
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-200">Loading profile...</p>
          </div>
        </div>
      );
    }

    if (error && !profile) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }

  return (
    <div className="min-h-screen bg-slate-900 text-gray-100">
      {/* Header */}
      <div className="bg-slate-800/80 backdrop-blur-md border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link href="/profile">
              <Button variant="ghost" size="sm" className="p-2 text-gray-100">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-100">Edit Profile</h1>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card className="shadow-xl bg-slate-800 border border-slate-700 text-gray-100">
          <CardHeader>
            <CardTitle className="text-center text-2xl text-white">Update Your Profile</CardTitle>
            <p className="text-center text-gray-400">
              Customize your profile to make it uniquely yours
            </p>
          </CardHeader>

          <CardContent>
            {success && (
              <div className="mb-6 p-4 bg-green-900/50 border border-green-700 rounded-lg">
                <p className="text-green-400 text-center">
                  Profile updated successfully! Redirecting...
                </p>
              </div>
            )}

            {error && (
              <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg">
                <p className="text-red-400 text-center">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Cover Photo */}
              <div className="space-y-2">
                <Label htmlFor="banner">Cover Photo</Label>
                <div className="w-full h-40 bg-slate-700 rounded-lg overflow-hidden">
                  {bannerPreview && (
                    <img
                      src={bannerPreview}
                      alt="Cover preview"
                      className="object-cover w-full h-full"
                    />
                  )}
                </div>
                <Input
                  id="banner"
                  type="file"
                  accept="image/*"
                  onChange={handleBannerChange}
                />
              </div>

              {/* Profile Picture */}
              <div className="space-y-2">
                <Label htmlFor="avatar">Profile Picture</Label>
                <div className="flex items-center space-x-4">
                  <Avatar className="h-24 w-24">
                    {avatarPreview && (
                      <AvatarImage src={avatarPreview} alt="Avatar preview" />
                    )}
                    <AvatarFallback>
                      {formData.name
                        ? formData.name.charAt(0)
                        : formData.username.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <Input
                    id="avatar"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                  />
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-blue-600" />
                  <span>Full Name</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter your full name"
                  className="h-12 text-lg"
                />
              </div>

              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username" className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-purple-600" />
                  <span>Username</span>
                </Label>
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleInputChange("username", e.target.value)}
                  placeholder="Choose a unique username"
                  className="h-12 text-lg"
                />
                <p className="text-sm text-gray-400">
                  This will be your unique identifier: @{formData.username || "username"}
                </p>
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <Label htmlFor="bio" className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span>Bio</span>
                </Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleInputChange("bio", e.target.value)}
                  placeholder="Tell us about yourself..."
                  className="min-h-[100px] text-lg resize-none"
                />
                  <p className="text-sm text-gray-400">
                    Keep it concise and engaging. Example: &ldquo;Dad • Creator • Entrepreneur • Philanthropist&rdquo;
                  </p>
              </div>

              {/* Date of Birth */}
              <div className="space-y-2">
                <Label htmlFor="dob" className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-orange-600" />
                  <span>Date of Birth</span>
                </Label>
                <Input
                  id="dob"
                  type="date"
                  value={formData.dob}
                  onChange={(e) => handleInputChange("dob", e.target.value)}
                  className="h-12 text-lg"
                />
              </div>

              {/* City */}
              <div className="space-y-2">
                <Label htmlFor="city" className="flex items-center space-x-2">
                  <MapPin className="h-4 w-4 text-red-600" />
                  <span>City</span>
                </Label>
                <Input
                  id="city"
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  placeholder="Where are you located?"
                  className="h-12 text-lg"
                />
              </div>

              {/* Social Links */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white mt-4">Social Links</h2>
                {socialPlatforms.map((platform) => (
                  <div className="space-y-2" key={platform}>
                    <Label htmlFor={`social-${platform}`}>
                      {platformLabels[platform]}
                    </Label>
                    <Input
                      id={`social-${platform}`}
                      type="url"
                      value={socialLinks[platform].url}
                      onChange={(e) => handleSocialLinkChange(platform, e.target.value)}
                      placeholder={`Enter your ${platformLabels[platform]} URL`}
                      className="h-12 text-lg"
                    />
                  </div>
                ))}
              </div>

              {/* Submit Button */}
              <div className="pt-6">
                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full h-14 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  {saving ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
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
