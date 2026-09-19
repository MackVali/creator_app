import { getSupabaseBrowser } from "@/lib/supabase";

const SITE_MEDIA_BUCKET = "site-media";
const MAX_SITE_IMAGE_BYTES = 10 * 1024 * 1024;

const extensionByMimeType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export type SiteImageUploadResult = {
  path: string;
  url: string;
};

export async function uploadSiteImage(
  file: File,
): Promise<SiteImageUploadResult> {
  const extension = extensionByMimeType[file.type];

  if (!extension) {
    throw new Error("Use a JPG, PNG, WebP, GIF, or AVIF image.");
  }

  if (file.size > MAX_SITE_IMAGE_BYTES) {
    throw new Error("Site images must be 10 MB or smaller.");
  }

  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client is unavailable.");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in to upload site media.");
  }

  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(SITE_MEDIA_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage
    .from(SITE_MEDIA_BUCKET)
    .getPublicUrl(path);

  return {
    path,
    url: data.publicUrl,
  };
}
