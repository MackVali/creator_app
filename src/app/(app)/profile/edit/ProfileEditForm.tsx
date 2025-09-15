"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToastHelpers } from "@/components/ui/toast";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import {
  profileSchema,
  type ProfileFormData,
  updateMyProfile,
} from "@/lib/db/profiles-client";

interface Profile {
  user_id: string;
  username: string;
  name?: string | null;
  dob?: string | null;
  city?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileEditFormProps {
  profile: Profile;
  userId: string;
}

export default function ProfileEditForm({
  profile,
  userId,
}: ProfileEditFormProps) {
  const [formData, setFormData] = useState<ProfileFormData>({
    name: profile.name || "",
    username: profile.username || "",
    dob: profile.dob || "",
    city: profile.city || "",
    bio: profile.bio || "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    profile.avatar_url || null
  );

  const router = useRouter();
  const toast = useToastHelpers();

  // Initialize form data when profile changes
  useEffect(() => {
    setFormData({
      name: profile.name || "",
      username: profile.username || "",
      dob: profile.dob || "",
      city: profile.city || "",
      bio: profile.bio || "",
    });
    setAvatarPreview(profile.avatar_url || null);
  }, [profile]);

  // Debounced username availability check
  useEffect(() => {
    if (!formData.username || formData.username === profile.username) {
      setUsernameAvailable(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setUsernameChecking(true);
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("username", formData.username.toLowerCase())
          .neq("user_id", userId)
          .single();

        if (error && error.code === "PGRST116") {
          // No rows found, username is available
          setUsernameAvailable(true);
        } else if (data) {
          setUsernameAvailable(false);
        } else {
          setUsernameAvailable(true);
        }
      } catch (error) {
        setUsernameAvailable(false);
      } finally {
        setUsernameChecking(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.username, profile.username, userId]);

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear field-specific errors
    if (errors[field]) {
      setErrors((prev: Record<string, string>) => ({ ...prev, [field]: "" }));
    }
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    try {
      profileSchema.parse(formData);
    } catch (error: unknown) {
      if (error && typeof error === "object" && "errors" in error) {
        const zodError = error as {
          errors: Array<{ path: string[]; message: string }>;
        };
        zodError.errors.forEach((err) => {
          if (err.path[0] && typeof err.path[0] === "string") {
            newErrors[err.path[0]] = err.message;
          }
        });
      }
    }

    if (usernameAvailable === false) {
      newErrors.username = "Username is already taken";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const uploadAvatar = async (
    file: File
  ): Promise<{ success: boolean; url?: string; error?: string }> => {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from("avatars")
        .upload(fileName, file);

      if (error) {
        return { success: false, error: error.message };
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);

      return { success: true, url: publicUrl };
    } catch (error) {
      return { success: false, error: "Failed to upload avatar" };
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      let avatarUrl = profile.avatar_url;

      // Upload avatar if changed
      if (avatarFile) {
        const uploadResult = await uploadAvatar(avatarFile);
        if (!uploadResult.success) {
          toast.error("Error", uploadResult.error || "Failed to upload avatar");
          setSaving(false);
          return;
        }
        avatarUrl = uploadResult.url;
      }

      // Update profile using server action
      const result = await updateMyProfile(formData);

      if (result.success) {
        toast.success("Success", "Profile updated successfully!");
        router.push("/profile");
      } else {
        toast.error("Error", result.error || "Failed to update profile");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Error", "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push("/profile");
  };

  const getInitials = (name: string | null, username: string) => {
    if (name) {
      return name
        .split(" ")
        .map((word) => word.charAt(0))
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return username.slice(0, 2).toUpperCase();
  };

  const initials = getInitials(profile.name || null, profile.username);

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Edit Profile</h1>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center space-x-6">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  {avatarPreview ? (
                    <AvatarImage src={avatarPreview} alt="Avatar preview" />
                  ) : null}
                  <AvatarFallback className="text-2xl font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <label className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer hover:bg-primary/90 transition-colors">
                  <Camera className="h-4 w-4" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">Profile Picture</p>
                <p className="text-xs text-gray-500">
                  Upload a new image (JPG, PNG, GIF up to 5MB)
                </p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter your full name"
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) =>
                    handleInputChange("username", e.target.value)
                  }
                  placeholder="Choose a unique username"
                  className={
                    usernameAvailable === false ? "border-red-500" : ""
                  }
                />
                {usernameChecking && (
                  <p className="text-sm text-gray-500">
                    Checking availability...
                  </p>
                )}
                {usernameAvailable === false && (
                  <p className="text-sm text-red-500">
                    Username is already taken
                  </p>
                )}
                {usernameAvailable === true && (
                  <p className="text-sm text-green-500">
                    Username is available
                  </p>
                )}
                {errors.username && (
                  <p className="text-sm text-red-500">{errors.username}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={formData.dob || ""}
                  onChange={(e) => handleInputChange("dob", e.target.value)}
                  className={errors.dob ? "border-red-500" : ""}
                />
                {errors.dob && (
                  <p className="text-sm text-red-500">{errors.dob}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city || ""}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  placeholder="Enter your city"
                  className={errors.city ? "border-red-500" : ""}
                />
                {errors.city && (
                  <p className="text-sm text-red-500">{errors.city}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={formData.bio || ""}
                onChange={(e) => handleInputChange("bio", e.target.value)}
                placeholder="Tell us about yourself"
                rows={4}
                className={errors.bio ? "border-red-500" : ""}
              />
              {errors.bio && (
                <p className="text-sm text-red-500">{errors.bio}</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
