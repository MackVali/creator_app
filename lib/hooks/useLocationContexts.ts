import { useCallback, useEffect, useMemo, useState } from "react";

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

  const load = useCallback(async () => {
    if (!supabase) {
      setContexts(defaultOptions());
      setUserId(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        setUserId(null);
        setContexts(defaultOptions());
        setLoading(false);
        return;
      }

      setUserId(user.id);

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

      const uniqueByValue = new Map<string, LocationContextOption>();
      mapped.forEach((option) => {
        if (!uniqueByValue.has(option.value)) {
          uniqueByValue.set(option.value, option);
        }
      });

      setContexts(Array.from(uniqueByValue.values()));
    } catch (err) {
      if (isLocationMetadataError(err)) {
        console.warn("Location metadata not available; using default contexts.");
        setError(null);
      } else {
        console.error("Failed to load location contexts", err);
        setError("We couldn’t load your saved locations. Using defaults for now.");
      }
      setContexts(defaultOptions());
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

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
