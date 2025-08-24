"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";

export default function AddMonumentPage() {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🏆");
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skillOptions = ["Writing", "Public Speaking", "Time Management"];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase not configured");
      return;
    }
    setLoading(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    const { error: insertError } = await supabase
      .from("monuments")
      .insert({ title, emoji, user_id: user.id });
    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }
    router.push("/monuments");
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-lg font-semibold">Add Monument</h1>
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
          <label className="mb-1 block text-sm font-medium">Related Skills</label>
          <select
            multiple
            value={skills}
            onChange={(e) =>
              setSkills(Array.from(e.target.selectedOptions, (o) => o.value))
            }
            className="w-full rounded-md bg-white p-2 text-black"
          >
            {skillOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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
          {loading ? "Creating..." : "Create Monument"}
        </button>
      </form>
    </main>
  );
}
