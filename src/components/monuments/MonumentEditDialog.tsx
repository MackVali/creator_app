"use client";

import { FormEvent, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, X } from "lucide-react";

import { AREAS } from "@/config/areas";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getMonumentIconOrDefault,
  normalizeMonumentIconInput,
} from "@/lib/monuments/icon";
import { getSupabaseBrowser } from "@/lib/supabase";

type SupabaseBrowserClient = NonNullable<
  ReturnType<typeof getSupabaseBrowser>
>;

export type MonumentEditDraft = {
  title: string;
  emoji: string;
  areaId: string | null;
};

export async function loadMonumentEditDraft(
  supabase: SupabaseBrowserClient,
  monumentId: string,
): Promise<MonumentEditDraft> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("monuments")
    .select("title, emoji, area_id")
    .eq("id", monumentId)
    .eq("user_id", user.id)
    .single();

  if (error) throw error;

  return {
    title: data?.title ?? "",
    emoji: data?.emoji ?? "🏛️",
    areaId: data?.area_id ?? null,
  };
}

export async function saveMonumentEditDraft({
  supabase,
  monumentId,
  title,
  emoji,
  areaId,
}: MonumentEditDraft & {
  supabase: SupabaseBrowserClient;
  monumentId: string;
}) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("monuments")
    .update({
      title,
      emoji,
      area_id: areaId,
    })
    .eq("id", monumentId)
    .eq("user_id", user.id);

  if (error) throw error;
}

type MonumentEditDialogProps = {
  open: boolean;
  monumentId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

export function MonumentEditDialog({
  open,
  monumentId,
  onOpenChange,
  onSaved,
}: MonumentEditDialogProps) {
  if (!monumentId) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[210] bg-black/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[220] w-[min(90vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#05070c] p-5 shadow-[0_30px_60px_rgba(0,0,0,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
                Monument
              </p>
              <h2 className="text-xl font-semibold text-white">
                Edit monument
              </h2>
              <p className="text-xs text-white/70">
                Update this monument&apos;s identity and Area.
              </p>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-full border border-white/15 bg-white/5 p-2 text-white/70 transition hover:text-white"
                aria-label="Close edit monument modal"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <ProtectedRoute>
              <MonumentEditForm
                monumentId={monumentId}
                onSaved={() => {
                  onSaved?.();
                  onOpenChange(false);
                }}
              />
            </ProtectedRoute>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type MonumentEditFormProps = {
  monumentId: string;
  onSaved?: () => void;
};

export function MonumentEditForm({
  monumentId,
  onSaved,
}: MonumentEditFormProps) {
  const supabase = getSupabaseBrowser();

  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🏛️");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setError("Supabase not configured");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const draft = await loadMonumentEditDraft(supabase, monumentId);

        if (cancelled) return;

        setTitle(draft.title);
        setEmoji(draft.emoji);
        setAreaId(draft.areaId);
      } catch (err) {
        console.error("Failed to load monument", err);
        if (!cancelled) {
          setError("Unable to load monument details right now.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [monumentId, supabase]);

  const selectedArea =
    AREAS.find((area) => area.id === areaId) ?? null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase not configured");
      return;
    }

    const nextTitle = title.trim();
    const nextEmoji = getMonumentIconOrDefault(emoji);

    if (!nextTitle) {
      setError("Name your monument before saving.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await saveMonumentEditDraft({
        supabase,
        monumentId,
        title: nextTitle,
        emoji: nextEmoji,
        areaId,
      });

      onSaved?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save monument",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-white/70">Loading monument…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="monument-name">Name</Label>
        <Input
          id="monument-name"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="monument-icon">Icon</Label>
        <Input
          id="monument-icon"
          value={emoji}
          onChange={(event) =>
            setEmoji(normalizeMonumentIconInput(event.target.value))
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Area</Label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-10 w-full items-center justify-between rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm text-white"
            >
              <span className="flex items-center gap-2">
                {selectedArea ? (
                  <>
                    <span>{selectedArea.emoji}</span>
                    <span>{selectedArea.label}</span>
                  </>
                ) : (
                  <span className="text-white/60">Select Area</span>
                )}
              </span>

              <ChevronDown className="h-4 w-4 text-white/60" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            className="z-[230] min-w-[240px] border-black/80 bg-black text-white"
          >
            {AREAS.map((area) => (
              <DropdownMenuItem
                key={area.id}
                onSelect={() => setAreaId(area.id)}
                className="gap-3"
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  {areaId === area.id ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                </span>
                <span>{area.emoji}</span>
                <span>{area.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error ? (
        <p className="text-xs font-medium text-red-200">{error}</p>
      ) : null}

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save monument"}
      </Button>
    </form>
  );
}
