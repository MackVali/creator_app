import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export type LocationMetadataMode = "id" | "legacy";

function extractErrorText(maybeError?: unknown) {
  if (!maybeError || typeof maybeError !== "object") {
    return "";
  }

  const parts: string[] = [];

  if ("message" in maybeError && typeof maybeError.message === "string") {
    parts.push(maybeError.message.toLowerCase());
  }

  if ("details" in maybeError && typeof maybeError.details === "string") {
    parts.push(maybeError.details.toLowerCase());
  }

  return parts.join(" ");
}

export function isLocationMetadataError(maybeError?: unknown) {
  const haystack = extractErrorText(maybeError);
  if (!haystack) {
    return false;
  }

  return (
    haystack.includes("location_context_id") ||
    haystack.includes("location_contexts") ||
    haystack.includes("location_context")
  );
}

export function normalizeLocationValue(value: string | null | undefined) {
  const normalized = value ? value.trim().toUpperCase() : "";
  if (!normalized || normalized === "ANY") {
    return null;
  }
  return normalized;
}

function formatLocationLabel(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .trim();
}

type Client = SupabaseClient<Database> | null | undefined;

export async function resolveLocationContextId(
  supabase: Client,
  userId: string,
  value: string | null | undefined,
) {
  if (!supabase) {
    return null;
  }

  const normalized = normalizeLocationValue(value);
  if (!normalized) {
    return null;
  }

  const {
    data: existing,
    error: fetchError,
  } = await supabase
    .from("location_contexts")
    .select("id")
    .eq("user_id", userId)
    .eq("value", normalized)
    .maybeSingle();

  if (fetchError && fetchError.code !== "PGRST116") {
    throw fetchError;
  }

  if (existing?.id) {
    return existing.id;
  }

  const label = formatLocationLabel(normalized) || normalized;

  const {
    data: inserted,
    error: insertError,
  } = await supabase
    .from("location_contexts")
    .insert({
      user_id: userId,
      value: normalized,
      label,
    })
    .select("id")
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      const {
        data: conflicted,
        error: conflictFetchError,
      } = await supabase
        .from("location_contexts")
        .select("id")
        .eq("user_id", userId)
        .eq("value", normalized)
        .maybeSingle();

      if (conflictFetchError && conflictFetchError.code !== "PGRST116") {
        throw conflictFetchError;
      }

      return conflicted?.id ?? null;
    }

    throw insertError;
  }

  return inserted?.id ?? null;
}
