import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isLocationMetadataError } from "@/lib/location-metadata";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

type LocationContextRow = Database["public"]["Tables"]["location_contexts"]["Row"];

export type CreateLocationResult =
  | { success: true; option: LocationContextOption }
  | { success: false; error: string };

export type LocationContextOption = {
  id: string;
  value: string;
  label: string;
};

const ANY_OPTION: LocationContextOption = {
  id: "__any__",
  value: "ANY",
  label: "Anywhere",
};

const DEFAULT_CONTEXTS: Array<Pick<LocationContextOption, "value" | "label">> = [
  { value: "HOME", label: "Home" },
  { value: "WORK", label: "Work" },
  { value: "OUTSIDE", label: "Outside" },
];

function normalizeValue(input: string | null | undefined) {
  return input ? input.replace(/\s+/g, " ").trim().toUpperCase() : "";
}

function formatLabel(input: string | null | undefined) {
  const normalized = input ? input.replace(/\s+/g, " ").trim().toLowerCase() : "";
  if (!normalized) return "";
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapRowToOption(row: LocationContextRow): LocationContextOption | null {
  const value = normalizeValue(row.value);
  if (!value) return null;
  return {
    id: row.id ?? value,
    value,
    label: row.label?.trim() || formatLabel(row.value) || value,
  };
}

function mapValueToOption(value: string | null | undefined): LocationContextOption | null {
  const normalized = normalizeValue(value);
  if (!normalized || normalized === ANY_OPTION.value) {
    return null;
  }
  return {
    id: normalized,
    value: normalized,
    label: formatLabel(normalized) || normalized,
  };
}

function mergeOptions(
  ...groups: LocationContextOption[][]
): LocationContextOption[] {
  const seen = new Set<string>();
  const merged: LocationContextOption[] = [];

  for (const group of groups) {
    for (const option of group) {
      if (!seen.has(option.value)) {
        seen.add(option.value);
        merged.push(option);
      }
    }
  }

  return merged;
}

async function loadLegacyLocationOptions(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<LocationContextOption[]> {
  const values = new Set<string>();

  const addValue = (input: string | null | undefined) => {
    const option = mapValueToOption(input);
    if (option) {
      values.add(option.value);
    }
  };

  const { data: windowRows } = await supabase
    .from("windows")
    .select("location_context")
    .eq("user_id", userId);

  if (Array.isArray(windowRows)) {
    for (const row of windowRows as Array<{ location_context: string | null }>) {
      addValue(row.location_context);
    }
  }

  const { data: habitRows } = await supabase
    .from("habits")
    .select("location_context")
    .eq("user_id", userId);

  if (Array.isArray(habitRows)) {
    for (const row of habitRows as Array<{ location_context: string | null }>) {
      addValue(row.location_context);
    }
  }

  return Array.from(values)
    .map((value) => mapValueToOption(value))
    .filter((option): option is LocationContextOption => Boolean(option))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function defaultOptions(): LocationContextOption[] {
  return DEFAULT_CONTEXTS.map((ctx) => ({
    id: ctx.value,
    value: ctx.value,
    label: ctx.label,
  }));
}

export function useLocationContexts() {
  const supabase = getSupabaseBrowser();
  const [contexts, setContexts] = useState<LocationContextOption[]>(defaultOptions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [metadataUnavailable, setMetadataUnavailable] = useState(false);
  const metadataUnavailableRef = useRef(metadataUnavailable);

  const load = useCallback(async () => {
    if (!supabase) {
      setContexts(defaultOptions());
      setUserId(null);
      setLoading(false);
      setError(null);
      setMetadataUnavailable(false);
      return;
    }

    setLoading(true);
    setError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("Failed to resolve user before loading locations", userError);
      setError("We couldn’t load your saved locations. Using defaults for now.");
      setContexts(defaultOptions());
      setUserId(null);
      setMetadataUnavailable(false);
      setLoading(false);
      return;
    }

    if (!user) {
      setUserId(null);
      setContexts(defaultOptions());
      setMetadataUnavailable(false);
      setLoading(false);
      return;
    }

    setUserId(user.id);

    try {
      const { data, error: fetchError } = await supabase
        .from("location_contexts")
        .select("id, value, label")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (fetchError) {
        throw fetchError;
      }

      let rows = data ?? [];

      if (rows.length === 0) {
        const defaults = DEFAULT_CONTEXTS.map((ctx) => ({
          user_id: user.id,
          value: ctx.value,
          label: ctx.label,
        }));

        const { error: seedError } = await supabase
          .from("location_contexts")
          .upsert(defaults, { onConflict: "user_id,value" });

        if (seedError) {
          throw seedError;
        }

        const { data: seeded, error: seededFetchError } = await supabase
          .from("location_contexts")
          .select("id, value, label")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (seededFetchError) {
          throw seededFetchError;
        }

        rows = seeded ?? [];
      }

      const mapped = rows
        .map(mapRowToOption)
        .filter((option): option is LocationContextOption => Boolean(option))
        .filter((option) => option.value !== ANY_OPTION.value);

      setContexts(mapped);
      setMetadataUnavailable(false);
    } catch (err) {
      if (isLocationMetadataError(err)) {
        console.warn("Location metadata not available; using legacy contexts.");
        setMetadataUnavailable(true);
        try {
          const legacy = await loadLegacyLocationOptions(supabase, user.id);
          const merged = mergeOptions(defaultOptions(), legacy);
          setContexts(merged);
        } catch (legacyError) {
          console.error("Failed to load legacy location contexts", legacyError);
          setContexts(defaultOptions());
        }
        setError(null);
      } else {
        console.error("Failed to load location contexts", err);
        setError("We couldn’t load your saved locations. Using defaults for now.");
        setContexts(defaultOptions());
        setMetadataUnavailable(false);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    metadataUnavailableRef.current = metadataUnavailable;
  }, [metadataUnavailable]);

  const createContext = useCallback(
    async (input: string): Promise<CreateLocationResult> => {
      const name = input.replace(/\s+/g, " ").trim();
      if (!name) {
        return { success: false, error: "Enter a location name first." };
      }

      const value = normalizeValue(name);
      if (value === ANY_OPTION.value) {
        return {
          success: false,
          error: "The \"Anywhere\" option is always available.",
        };
      }

      if (contexts.some((ctx) => ctx.value === value)) {
        return {
          success: false,
          error: "You already saved that location.",
        };
      }

      if (!supabase) {
        return {
          success: false,
          error: "Connect to Supabase to save custom locations.",
        };
      }

      if (metadataUnavailableRef.current) {
        const option = {
          id: value,
          value,
          label: formatLabel(name) || value,
        } satisfies LocationContextOption;
        setContexts((prev) => mergeOptions(prev, [option]));
        return { success: true, option };
      }

      let ownerId = userId;
      if (!ownerId) {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) {
          console.error("Failed to resolve user before creating location", userError);
          return {
            success: false,
            error: "We couldn’t verify your account just yet.",
          };
        }
        if (!user) {
          return {
            success: false,
            error: "Sign in to create custom locations.",
          };
        }
        ownerId = user.id;
        setUserId(ownerId);
      }

      const label = formatLabel(name) || value;

      const { data, error } = await supabase
        .from("location_contexts")
        .insert({
          user_id: ownerId,
          value,
          label,
        })
        .select("id, value, label")
        .single();

      if (error) {
        if ((error as { code?: string }).code === "23505") {
          return {
            success: false,
            error: "That location already exists.",
          };
        }
        console.error("Failed to create location context", error);
        return {
          success: false,
          error: "We couldn’t save that location. Please try again.",
        };
      }

      await load();

      return {
        success: true,
        option: {
          id: data?.id ?? value,
          value,
          label: data?.label?.trim() || label,
        },
      };
    },
    [contexts, load, supabase, userId],
  );

  const options = useMemo(() => [ANY_OPTION, ...contexts], [contexts]);

  return {
    options,
    loading,
    error,
    createContext,
    refresh: load,
  };
}
