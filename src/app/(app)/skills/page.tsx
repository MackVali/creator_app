"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategorySection } from "@/components/skills/CategorySection";
import { CreateSkillSheet } from "@/components/skills/CreateSkillSheet";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { getCatsForUser, CatRow } from "@/lib/data/cats";
import {
  getSkillsForUser,
  groupSkillsByCat,
  SkillRow,
} from "@/lib/data/skills";

export default function SkillsPage() {
  const [cats, setCats] = useState<CatRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const sb = getSupabaseBrowser();
        const {
          data: { user },
        } = await sb.auth.getUser();
        if (!user) throw new Error("No user");
        const [catsData, skillsData] = await Promise.all([
          getCatsForUser(user.id),
          getSkillsForUser(user.id),
        ]);
        setCats(catsData);
        setSkills(skillsData);
      } catch (e) {
        console.error(e);
        setError("Failed to load skills");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const byCat = useMemo(() => groupSkillsByCat(skills), [skills]);

  const handleCreated = (row: SkillRow) => {
    setSkills((prev) => [...prev, row]);
  };

  return (
    <div className="px-4 pb-24 pb-[env(safe-area-inset-bottom)] space-y-4">
      <header className="pt-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Skills</h1>
          <p className="text-sm text-white/60">Track your progress</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
          Create Skill
        </Button>
      </header>

      {error && (
        <div className="p-2 text-sm bg-red-500/20 text-red-300 rounded-md">
          {error}
          <button
            className="underline ml-2"
            onClick={() => location.reload()}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="bg-slate-900/60 ring-1 ring-white/10 rounded-2xl p-4 space-y-2"
            >
              <div className="h-4 w-32 bg-white/10 rounded" />
              {[0, 1, 2].map((j) => (
                <div key={j} className="h-12 bg-white/5 rounded-2xl" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          {cats.map((cat) => (
            <CategorySection key={cat.id} cat={cat} skills={byCat[cat.id] ?? []} />
          ))}
          {byCat["null"] && (
            <CategorySection
              cat={{ id: "null", name: "Uncategorized" }}
              skills={byCat["null"]!}
            />
          )}
          {cats.length === 0 && !byCat["null"] && (
            <p className="text-center text-sm text-white/60">
              Create your first skill
            </p>
          )}
        </>
      )}

      <CreateSkillSheet
        open={open}
        onClose={() => setOpen(false)}
        cats={cats}
        onCreated={(row) => {
          handleCreated(row);
          setOpen(false);
        }}
      />
    </div>
  );
}
