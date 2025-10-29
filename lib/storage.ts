import { getSupabaseBrowser } from "./supabase";

export interface AvatarUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface MediaUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export async function uploadAvatar(
  file: File,
  userId: string
): Promise<AvatarUploadResult> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      return { success: false, error: "File must be an image" };
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: "File size must be less than 5MB" };
    }

    // Generate unique filename
    const fileExt = file.name.split(".").pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;

    // Upload to avatars bucket
    const { error } = await supabase.storage
      .from("avatars")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Error uploading avatar:", error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(fileName);

    return { success: true, url: urlData.publicUrl };
  } catch (error) {
    console.error("Error in uploadAvatar:", error);
    return { success: false, error: "Failed to upload avatar" };
  }
}

export async function uploadBanner(
  file: File,
  userId: string
): Promise<AvatarUploadResult> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    if (!file.type.startsWith("image/")) {
      return { success: false, error: "File must be an image" };
    }

    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: "File size must be less than 5MB" };
    }

    const fileExt = file.name.split(".").pop();
    const fileName = `${userId}-banner-${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from("banners")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Error uploading banner:", error);
      return { success: false, error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from("banners")
      .getPublicUrl(fileName);

    return { success: true, url: urlData.publicUrl };
  } catch (error) {
    console.error("Error in uploadBanner:", error);
    return { success: false, error: "Failed to upload banner" };
  }
}

export async function uploadSourceMedia(
  file: File,
  userId?: string
): Promise<MediaUploadResult> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    if (!file.type.startsWith("image/")) {
      return { success: false, error: "File must be an image" };
    }

    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: "File size must be less than 10MB" };
    }

    const fileExt = file.name.split(".").pop() || "jpg";
    const randomId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    const prefix = userId ? `${userId}-` : "";
    const fileName = `${prefix}post-${Date.now()}-${randomId}.${fileExt}`;

    const { error } = await supabase.storage
      .from("source-posts")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Error uploading post media:", error);
      return { success: false, error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from("source-posts")
      .getPublicUrl(fileName);

    return { success: true, url: urlData.publicUrl };
  } catch (error) {
    console.error("Error in uploadSourceMedia:", error);
    return { success: false, error: "Failed to upload media" };
  }
}

export async function deleteAvatar(avatarUrl: string): Promise<boolean> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return false;

  try {
    // Extract filename from URL
    const urlParts = avatarUrl.split("/");
    const fileName = urlParts[urlParts.length - 1];

    const { error } = await supabase.storage.from("avatars").remove([fileName]);

    if (error) {
      console.error("Error deleting avatar:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in deleteAvatar:", error);
    return false;
  }
}
