"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CatRow } from "@/lib/data/cats";
import { SkillRow } from "@/lib/data/skills";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

interface Props {
  open: boolean;
  onClose: () => void;
  cats: CatRow[];
  onCreated: (row: SkillRow) => void;
}

export function CreateSkillSheet({ open, onClose, cats, onCreated }: Props) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [catId, setCatId] = useState<string>("");
  const [level, setLevel] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const sb = getSupabaseBrowser();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) throw new Error("No user");
      const id = crypto.randomUUID();
      const row: SkillRow = {
        id,
        user_id: user.id,
        name,
        icon: icon || null,
        cat_id: catId || null,
        monument_id: null,
        level,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onCreated(row);
      const { error: insertError } = await sb.from("skills").insert(row);
      if (insertError) throw insertError;
      onClose();
      setName("");
      setIcon("");
      setCatId("");
      setLevel(1);
    } catch (err) {
      setError("Failed to save");
      console.error(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div className="w-full max-w-md rounded-t-2xl bg-slate-900/60 ring-1 ring-white/10 p-4 space-y-4 pb-[env(safe-area-inset-bottom)]">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-md bg-white/5 p-2"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Icon</label>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="w-full rounded-md bg-white/5 p-2 text-center"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Category</label>
            <select
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
              className="w-full rounded-md bg-white/5 p-2"
            >
              <option value="">Uncategorized</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Level</label>
            <input
              type="number"
              min={1}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="w-full rounded-md bg-white/5 p-2"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name}>
              {pending ? "Saving" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateSkillSheet;
