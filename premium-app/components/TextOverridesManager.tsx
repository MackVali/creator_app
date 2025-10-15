"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

const EMPTY_FORM = {
  id: null as string | null,
  original_text: "",
  override_text: "",
};

type TextOverrideRow = Database["public"]["Tables"]["text_overrides"]["Row"];

type FormState = typeof EMPTY_FORM;

type StatusMessage = {
  type: "success" | "error";
  text: string;
};

export default function TextOverridesManager() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [overrides, setOverrides] = useState<TextOverrideRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (!supabase) {
      setLoading(false);
      setStatus({ type: "error", text: "Supabase is not configured for this environment." });
      return;
    }

    const loadOverrides = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("text_overrides")
        .select("id, original_text, override_text, updated_at")
        .order("original_text", { ascending: true });

      if (!isMounted) return;

      if (error) {
        console.error("Failed to load text overrides", error);
        setStatus({ type: "error", text: error.message || "Unable to load overrides." });
      } else {
        setOverrides(data ?? []);
        setStatus(null);
      }

      setLoading(false);
    };

    loadOverrides();

    const channel = supabase
      .channel("text_overrides_admin_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "text_overrides" },
        () => {
          loadOverrides().catch((err) => {
            console.error("Failed to refresh overrides", err);
          });
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;

    const original = form.original_text.trim();
    const override = form.override_text.trim();

    if (!original || !override) {
      setStatus({ type: "error", text: "Both the original and replacement text are required." });
      return;
    }

    setSaving(true);
    setStatus(null);

    const payload = {
      id: form.id ?? undefined,
      original_text: original,
      override_text: override,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("text_overrides")
      .upsert(payload, { onConflict: "original_text" });

    if (error) {
      console.error("Failed to save text override", error);
      setStatus({ type: "error", text: error.message || "Unable to save the override." });
    } else {
      setStatus({ type: "success", text: form.id ? "Override updated." : "Override created." });
      setForm(EMPTY_FORM);
    }

    setSaving(false);
  };

  const startEditing = (entry: TextOverrideRow) => {
    setForm({
      id: entry.id,
      original_text: entry.original_text,
      override_text: entry.override_text,
    });
    setStatus(null);
  };

  const handleDelete = async (entry: TextOverrideRow) => {
    if (!supabase) return;

    if (!confirm(`Delete override for "${entry.original_text}"?`)) {
      return;
    }

    const { error } = await supabase
      .from("text_overrides")
      .delete()
      .eq("id", entry.id);

    if (error) {
      console.error("Failed to delete override", error);
      setStatus({ type: "error", text: error.message || "Unable to delete the override." });
    } else {
      setStatus({ type: "success", text: "Override removed." });
      if (form.id === entry.id) {
        setForm(EMPTY_FORM);
      }
    }
  };

  const filteredOverrides = overrides.filter((overrideEntry) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      overrideEntry.original_text.toLowerCase().includes(term) ||
      overrideEntry.override_text.toLowerCase().includes(term)
    );
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-12 text-[var(--text)]">
      <header className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-[var(--muted)]">Administration</p>
        <h1 className="text-3xl font-semibold">Content overrides</h1>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Provide the exact text as it currently appears in the product and the replacement you would
          like everyone to see. Changes go live immediately across the entire application.
        </p>
      </header>

      {!supabase && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          Supabase credentials are not configured. Connect Supabase to enable text overrides.
        </div>
      )}

      {status && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            status.type === "success"
              ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : "border border-red-500/40 bg-red-500/10 text-red-100"
          }`}
        >
          {status.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4 px-6 py-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {form.id ? "Edit override" : "Add new override"}
          </h2>
          {form.id ? (
            <button
              type="button"
              onClick={() => setForm(EMPTY_FORM)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm transition hover:border-white/20 hover:bg-white/10"
            >
              <Plus className="h-4 w-4 rotate-45" aria-hidden="true" />
              Cancel edit
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-[var(--muted)]">Original text</span>
            <textarea
              required
              value={form.original_text}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, original_text: event.target.value }))
              }
              className="min-h-[140px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] shadow-inner shadow-black/20 focus:border-[var(--accent)] focus:outline-none"
              placeholder="Text as it currently appears"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-[var(--muted)]">Replacement text</span>
            <textarea
              required
              value={form.override_text}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, override_text: event.target.value }))
              }
              className="min-h-[140px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] shadow-inner shadow-black/20 focus:border-[var(--accent)] focus:outline-none"
              placeholder="What should appear instead"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-[var(--muted)]">
            Overrides are case-sensitive. Match the existing copy exactly to guarantee a replacement.
          </p>
          <button
            type="submit"
            disabled={saving || !supabase}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-white/20"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Saving
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden="true" />
                {form.id ? "Update override" : "Create override"}
              </>
            )}
          </button>
        </div>
      </form>

      <section className="card space-y-4 px-6 py-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Existing overrides</h2>
            <p className="text-xs text-[var(--muted)]">
              {overrides.length === 0
                ? "No overrides created yet."
                : `${overrides.length} override${overrides.length === 1 ? "" : "s"} active.`}
            </p>
          </div>
          <input
            type="search"
            placeholder="Search overrides"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text)] shadow-inner shadow-black/20 focus:border-[var(--accent)] focus:outline-none md:w-64"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading overrides…
          </div>
        ) : filteredOverrides.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-[var(--muted)]">
            No overrides match your search.
          </div>
        ) : (
          <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
            {filteredOverrides.map((entry) => (
              <article key={entry.id} className="grid gap-4 bg-white/5 px-4 py-4 md:grid-cols-[1.2fr_1.2fr_auto]">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Original</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text)]">{entry.original_text}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Override</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text)]">{entry.override_text}</p>
                </div>
                <div className="flex items-center justify-end gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => startEditing(entry)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 transition hover:border-white/20 hover:bg-white/10"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry)}
                    className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-red-100 transition hover:border-red-500/60 hover:bg-red-500/20"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
