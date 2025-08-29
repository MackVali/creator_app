"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { getProfileByUserId, updateProfile, getProfileByUsername } from "@/lib/db";
import { Profile, ProfileFormData } from "@/lib/types";
import { uploadAvatar, uploadBanner, deleteAvatar, deleteBanner } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dropzone } from "@/components/ui/dropzone";
import { Progress } from "@/components/ui/Progress";
import ReactCrop, { Crop, PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { ArrowLeft, Save, User, Calendar, MapPin, FileText } from "lucide-react";
import Link from "next/link";

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
  const [avatarProgress, setAvatarProgress] = useState(0);
  const [bannerProgress, setBannerProgress] = useState(0);

  const [isCropOpen, setIsCropOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string>("");
  const [cropType, setCropType] = useState<"avatar" | "banner" | null>(null);
  const [crop, setCrop] = useState<Crop>({ unit: "%", width: 100, aspect: 1 });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const originalFileRef = useRef<File | null>(null);

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

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

  useEffect(() => {
    if (!formData.username) {
      setUsernameAvailable(null);
      return;
    }

    const handler = setTimeout(async () => {
      setCheckingUsername(true);
      const existing = await getProfileByUsername(formData.username);
      if (!existing || existing.user_id === session?.user?.id) {
        setUsernameAvailable(true);
      } else {
        setUsernameAvailable(false);
      }
      setCheckingUsername(false);
    }, 500);

    return () => clearTimeout(handler);
  }, [formData.username, session?.user?.id]);

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const startCrop = (file: File, type: "avatar" | "banner") => {
    const reader = new FileReader();
    reader.onload = (event) => {
      setCropImageSrc(event.target?.result as string);
      setCropType(type);
      setIsCropOpen(true);
      originalFileRef.current = file;
      setCrop({ unit: "%", width: 100, aspect: type === "avatar" ? 1 : 16 / 9 });
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarSelect = (file: File) => {
    startCrop(file, "avatar");
  };

  const handleBannerSelect = (file: File) => {
    startCrop(file, "banner");
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    imgRef.current = e.currentTarget;
  };

  const handleCropConfirm = async () => {
    if (!imgRef.current || !completedCrop || !originalFileRef.current) return;

    const canvas = document.createElement("canvas");
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      imgRef.current,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), originalFileRef.current!.type)
    );
    if (!blob) return;
    const croppedFile = new File([blob], originalFileRef.current!.name, {
      type: originalFileRef.current!.type,
    });
    const previewUrl = URL.createObjectURL(blob);

    if (cropType === "avatar") {
      setAvatarFile(croppedFile);
      setAvatarPreview(previewUrl);
    } else {
      setBannerFile(croppedFile);
      setBannerPreview(previewUrl);
    }

    setIsCropOpen(false);
    setCropImageSrc("");
    setCompletedCrop(null);
  };

  const handleRemoveAvatar = async () => {
    if (!session?.user?.id) return;
    if (profile?.avatar_url) {
      await deleteAvatar(profile.avatar_url);
      await updateProfile(session.user.id, formData, null, undefined);
      setProfile({ ...profile, avatar_url: null });
    }
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const handleRemoveBanner = async () => {
    if (!session?.user?.id) return;
    if (profile?.banner_url) {
      await deleteBanner(profile.banner_url);
      await updateProfile(session.user.id, formData, undefined, null);
      setProfile({ ...profile, banner_url: null });
    }
    setBannerFile(null);
    setBannerPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session?.user?.id) {
      setError("Not authenticated");
      return;
    }

    if (usernameAvailable === false) {
      setError("Username is already taken");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      let avatarUrl: string | undefined;
      let bannerUrl: string | undefined;

      if (avatarFile) {
        setAvatarProgress(0);
        const uploadRes = await uploadAvatar(avatarFile, session.user.id, setAvatarProgress);
        if (!uploadRes.success || !uploadRes.url) {
          setError(uploadRes.error || "Failed to upload profile picture");
          setSaving(false);
          setAvatarProgress(0);
          return;
        }
        avatarUrl = uploadRes.url;
        setAvatarProgress(100);
      }

      if (bannerFile) {
        setBannerProgress(0);
        const uploadRes = await uploadBanner(bannerFile, session.user.id, setBannerProgress);
        if (!uploadRes.success || !uploadRes.url) {
          setError(uploadRes.error || "Failed to upload cover photo");
          setSaving(false);
          setBannerProgress(0);
          return;
        }
        bannerUrl = uploadRes.url;
        setBannerProgress(100);
      }

      const result = await updateProfile(
        session.user.id,
        formData,
        avatarUrl,
        bannerUrl
      );
      
      if (result.success && result.profile) {
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
      setAvatarProgress(0);
      setBannerProgress(0);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link href="/profile">
              <Button variant="ghost" size="sm" className="p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Edit Profile</h1>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card className="shadow-xl border-0">
          <CardHeader>
            <CardTitle className="text-center text-2xl">Update Your Profile</CardTitle>
            <p className="text-center text-gray-600">
              Customize your profile to make it uniquely yours
            </p>
          </CardHeader>
          
          <CardContent>
            {success && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 text-center">
                  Profile updated successfully! Redirecting...
                </p>
              </div>
            )}

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 text-center">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Cover Photo */}
              <div className="space-y-2">
                <Label>Cover Photo</Label>
                <Dropzone
                  onDrop={handleBannerSelect}
                  accept="image/*"
                  className="w-full h-40 bg-gray-100 rounded-lg overflow-hidden"
                >
                  {bannerPreview ? (
                    <img
                      src={bannerPreview}
                      alt="Cover preview"
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <p className="text-gray-500 text-sm">Drag & drop or click</p>
                  )}
                </Dropzone>
                {bannerPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveBanner}
                  >
                    Remove
                  </Button>
                )}
              </div>

              {/* Profile Picture */}
              <div className="space-y-2">
                <Label>Profile Picture</Label>
                <div className="flex items-center space-x-4">
                  <Dropzone
                    onDrop={handleAvatarSelect}
                    accept="image/*"
                    className="h-24 w-24 rounded-full overflow-hidden flex-shrink-0"
                  >
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
                  </Dropzone>
                  {avatarPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveAvatar}
                    >
                      Remove
                    </Button>
                  )}
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
                <p className="text-sm text-gray-500">
                  This will be your unique identifier: @{formData.username || "username"}
                </p>
                {checkingUsername && (
                  <p className="text-sm text-gray-500">Checking availability...</p>
                )}
                {usernameAvailable && formData.username && (
                  <p className="text-sm text-green-600">Username available</p>
                )}
                {usernameAvailable === false && (
                  <p className="text-sm text-red-600">Username already taken</p>
                )}
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
                                  <p className="text-sm text-gray-500">
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

              {/* Submit Button */}
              <div className="pt-6 space-y-4">
                {avatarProgress > 0 && avatarProgress < 100 && (
                  <div>
                    <p className="text-sm text-gray-700 mb-1">Uploading avatar: {avatarProgress}%</p>
                    <Progress value={avatarProgress} />
                  </div>
                )}
                {bannerProgress > 0 && bannerProgress < 100 && (
                  <div>
                    <p className="text-sm text-gray-700 mb-1">Uploading cover: {bannerProgress}%</p>
                    <Progress value={bannerProgress} />
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={saving || usernameAvailable === false}
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
      {isCropOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg max-w-lg w-full">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cropImageSrc} onLoad={onImageLoad} alt="Crop" />
            </ReactCrop>
            <div className="flex justify-end space-x-2 mt-4">
              <Button variant="ghost" type="button" onClick={() => setIsCropOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleCropConfirm}>
                Crop
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
