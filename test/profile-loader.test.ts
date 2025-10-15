import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicProfileReadModel } from "@/lib/types";

vi.mock("@/lib/profile/public-profile", () => ({
  getPublicProfileReadModel: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

const profileModule = await import("@/lib/profile/public-profile");
const supabaseServerModule = await import("@/lib/supabase-server");

const getPublicProfileReadModel = vi.mocked(
  profileModule.getPublicProfileReadModel
);
const createSupabaseServerClient = vi.mocked(
  supabaseServerModule.createSupabaseServerClient
);

const { loadPublicProfile } = await import(
  "@/app/(app)/profile/[handle]/loader"
);

function buildReadModel(): PublicProfileReadModel {
  const now = new Date().toISOString();

  return {
    profile: {
      id: 1,
      user_id: "user-123",
      username: "creator",
      name: "Creator",
      tagline: null,
      dob: null,
      city: null,
      location_display: null,
      bio: null,
      pronouns: null,
      avatar_url: null,
      banner_url: null,
      hero_background_type: null,
      hero_gradient_preset: null,
      hero_media_url: null,
      hero_media_type: null,
      hero_media_size_bytes: null,
      hero_media_duration_seconds: null,
      hero_parallax_intensity: null,
      hero_motion_enabled: null,
      hero_background_overlay: null,
      hero_video_autoplay: null,
      hero_video_loop: null,
      hero_primary_cta_label: null,
      hero_primary_cta_url: null,
      hero_secondary_cta_label: null,
      hero_secondary_cta_url: null,
      verified: false,
      avatar_frame_style: null,
      partner_badges: null,
      quick_action_badges: null,
      modules: null,
      theme_color: null,
      font_family: null,
      accent_color: null,
      business_name: null,
      business_industry: null,
      scheduling_provider: null,
      scheduling_link: null,
      contact_email_public: null,
      contact_phone_public: null,
      availability_last_synced_at: null,
      active_theme_settings_id: null,
      prefers_dark_mode: false,
      notifications_enabled: false,
      created_at: now,
      updated_at: now,
      theme_settings: null,
      cta_buttons: [],
      offers: [],
      testimonials: [],
      business_info: null,
      availability: [],
    },
    theme: null,
    ctas: [],
    offers: [],
    testimonials: [],
    businessInfo: null,
    availability: [],
    generated_at: now,
  };
}

describe("loadPublicProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the read model and owner state when session matches", async () => {
    const readModel = buildReadModel();
    getPublicProfileReadModel.mockResolvedValue(readModel);
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } } }),
      },
    } as never);

    const result = await loadPublicProfile("creator");

    expect(result.status).toBe("ok");
    expect(result.readModel).toEqual(readModel);
    expect(result.viewerUserId).toBe("user-123");
    expect(result.isOwner).toBe(true);
  });

  it("normalizes handles before resolving the read model", async () => {
    const readModel = buildReadModel();
    getPublicProfileReadModel.mockResolvedValue(readModel);
    createSupabaseServerClient.mockResolvedValue(null);

    const inputHandle = " @Creator ";
    const normalizedHandle = inputHandle
      .trim()
      .replace(/^@+/, "")
      .replace(/\s+/g, "");

    const result = await loadPublicProfile(inputHandle);

    expect(result.status).toBe("ok");
    expect(getPublicProfileReadModel).toHaveBeenCalledWith(normalizedHandle);
  });

  it("returns config_missing when Supabase env vars are absent", async () => {
    getPublicProfileReadModel.mockRejectedValue(
      new Error(
        "Supabase environment variables are required to resolve public profile read models.",
      ),
    );
    createSupabaseServerClient.mockResolvedValue(null);

    const result = await loadPublicProfile("creator");

    expect(result.status).toBe("config_missing");
    expect(result.readModel).toBeNull();
    expect(result.isOwner).toBe(false);
  });

  it("returns not_found when no read model is available", async () => {
    getPublicProfileReadModel.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as never);

    const result = await loadPublicProfile("missing");

    expect(result.status).toBe("not_found");
    expect(result.readModel).toBeNull();
    expect(result.viewerUserId).toBeNull();
  });

  it("surfaces loader errors when session lookup fails", async () => {
    const readModel = buildReadModel();
    getPublicProfileReadModel.mockResolvedValue(readModel);
    createSupabaseServerClient.mockRejectedValue(new Error("RLS violation"));

    const result = await loadPublicProfile("creator");

    expect(result.status).toBe("error");
    expect(result.readModel).toEqual(readModel);
    expect(result.viewerUserId).toBeNull();
    expect(result.isOwner).toBe(false);
  });
});
