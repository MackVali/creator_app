"use server";

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { revalidateTag, unstable_cache } from "next/cache";

import {
  ContentCard,
  Profile,
  ProfileAvailabilityWindow,
  ProfileBusinessInfo,
  ProfileCTAButton,
  ProfileOffer,
  ProfileTestimonial,
  ProfileTheme,
  ProfileThemeSettings,
  PublicProfileReadModel,
  SocialLink,
} from "../types";
import type { Database } from "../../types/supabase";

type PublicSupabaseClient = SupabaseClient<Database, "public", Database["public"]>;

let cachedClient: PublicSupabaseClient | null = null;

function getSupabasePublicClient(): PublicSupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase environment variables are required to resolve public profile read models.",
    );
  }

  cachedClient = createClient(url, key, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "creator-app-public-profile",
      },
    },
  });

  return cachedClient;
}

async function resolveThemeSettings(
  client: PublicSupabaseClient,
  profileId: string | number,
): Promise<ProfileThemeSettings | null> {
  const { data, error } = await client
    .from("profile_theme_settings")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load profile theme settings", { profileId, error });
    return null;
  }

  if (!data) {
    return null;
  }

  const themeSettings = { ...data } as ProfileThemeSettings;

  if (themeSettings.theme_id) {
    const { data: themeData, error: themeError } = await client
      .from("profile_themes")
      .select("*")
      .eq("id", themeSettings.theme_id)
      .maybeSingle();

    if (themeError) {
      console.error("Failed to resolve profile theme reference", {
        profileId,
        themeId: themeSettings.theme_id,
        error: themeError,
      });
    }

    if (themeData) {
      themeSettings.theme = themeData as ProfileTheme;
    }
  }

  return themeSettings;
}

async function resolveCtas(
  client: PublicSupabaseClient,
  profileId: string | number,
): Promise<ProfileCTAButton[]> {
  const { data, error } = await client
    .from("profile_cta_buttons")
    .select("*")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(12);

  if (error) {
    console.error("Failed to load profile CTA buttons", { profileId, error });
    return [];
  }

  return (data ?? []) as ProfileCTAButton[];
}

async function resolveOffers(
  client: PublicSupabaseClient,
  profileId: string | number,
): Promise<ProfileOffer[]> {
  const { data, error } = await client
    .from("profile_offers")
    .select("*")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(60);

  if (error) {
    console.error("Failed to load profile offers", { profileId, error });
    return [];
  }

  return (data ?? []) as ProfileOffer[];
}

async function resolveTestimonials(
  client: PublicSupabaseClient,
  profileId: string | number,
): Promise<ProfileTestimonial[]> {
  const { data, error } = await client
    .from("profile_testimonials")
    .select("*")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(24);

  if (error) {
    console.error("Failed to load profile testimonials", { profileId, error });
    return [];
  }

  return (data ?? []) as ProfileTestimonial[];
}

async function resolveBusinessInfo(
  client: PublicSupabaseClient,
  profileId: string | number,
): Promise<ProfileBusinessInfo | null> {
  const { data, error } = await client
    .from("profile_business_info")
    .select("*")
    .eq("profile_id", profileId)
    .eq("is_public", true)
    .maybeSingle();

  if (error) {
    console.error("Failed to load profile business info", { profileId, error });
    return null;
  }

  return (data ?? null) as ProfileBusinessInfo | null;
}

async function resolveAvailability(
  client: PublicSupabaseClient,
  profileId: string | number,
): Promise<ProfileAvailabilityWindow[]> {
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("profile_availability_windows")
    .select("*")
    .eq("profile_id", profileId)
    .eq("is_public", true)
    .eq("status", "available")
    .gte("end_time", nowIso)
    .order("start_time", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Failed to load profile availability", { profileId, error });
    return [];
  }

  return (data ?? []) as ProfileAvailabilityWindow[];
}

async function resolveContentCards(
  client: PublicSupabaseClient,
  userId: string,
): Promise<ContentCard[]> {
  const { data, error } = await client
    .from("content_cards")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(120);

  if (error) {
    console.error("Failed to load profile content cards", { userId, error });
    return [];
  }

  return (data ?? []) as ContentCard[];
}

async function resolveSocialLinks(
  client: PublicSupabaseClient,
  userId: string,
): Promise<SocialLink[]> {
  const { data, error } = await client
    .from("social_links")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(120);

  if (error) {
    console.error("Failed to load profile social links", { userId, error });
    return [];
  }

  return (data ?? []) as SocialLink[];
}

async function fetchPublicProfile(handle: string): Promise<PublicProfileReadModel | null> {
  const client = getSupabasePublicClient();

  const { data, error } = await client
    .from("profiles")
    .select("*")
    .ilike("username", handle)
    .maybeSingle();

  if (error) {
    console.error("Failed to load profile by handle", { handle, error });
    return null;
  }

  if (!data) {
    return null;
  }

  const profile = data as Profile;
  const profileId = profile.id ?? profile.user_id;

  const [
    theme,
    ctas,
    offers,
    testimonials,
    businessInfo,
    availability,
    contentCards,
    socialLinks,
  ] = await Promise.all([
    resolveThemeSettings(client, profileId),
    resolveCtas(client, profileId),
    resolveOffers(client, profileId),
    resolveTestimonials(client, profileId),
    resolveBusinessInfo(client, profileId),
    resolveAvailability(client, profileId),
    resolveContentCards(client, profile.user_id),
    resolveSocialLinks(client, profile.user_id),
  ]);

  const hydratedProfile: Profile = {
    ...profile,
    theme_settings: theme,
    cta_buttons: ctas,
    offers,
    testimonials,
    business_info: businessInfo,
    availability,
  };

  return {
    profile: hydratedProfile,
    theme,
    ctas,
    offers,
    testimonials,
    businessInfo,
    availability,
    contentCards,
    socialLinks,
    generated_at: new Date().toISOString(),
  };
}

export const getPublicProfileReadModel = unstable_cache(fetchPublicProfile, [
  "public-profile-read-model",
], {
  revalidate: 120,
  tags: ["public-profile-read-model"],
});

export async function revalidatePublicProfileCache() {
  revalidateTag("public-profile-read-model");
}
