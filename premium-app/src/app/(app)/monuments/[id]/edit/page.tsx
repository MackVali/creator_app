"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";

export default function EditMonumentPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const supabase = getSupabaseBrowser();

  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🏛️");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase || !id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("monuments")
        .select("title,emoji")
        .eq("id", id)
        .single();
      if (!cancelled) {
        if (error) {
          setError("Failed to load monument");
        } else if (data) {
          setTitle(data.title);
          setEmoji(data.emoji || "");
        }
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase
      .from("monuments")
      .update({ title, emoji })
      .eq("id", id);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push(`/monuments/${id}`);
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-lg font-semibold">Edit Monument</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md bg-white p-2 text-black"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Icon</label>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="w-full rounded-md bg-white p-2 text-center text-xl"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-[var(--accent)] py-2 font-semibold text-black disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Monument"}
        </button>
      </form>
    </main>
  );
}

