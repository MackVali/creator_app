"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { SkillRow } from "@/lib/types/skill";

export default function AddMonumentPage() {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🏆");
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableSkills, setAvailableSkills] = useState<SkillRow[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setSkillsLoading(false);
      setAvailableSkills([]);
      return;
    }

    let cancelled = false;
    async function loadSkills() {
      setSkillsLoading(true);
      setSkillsError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          if (!cancelled) {
            setAvailableSkills([]);
            setSkills([]);
          }
          return;
        }

        const { data, error: fetchError } = await supabase
          .from("skills")
          .select("id, name, icon")
          .eq("user_id", user.id)
          .order("name", { ascending: true });

        if (fetchError) throw fetchError;

        if (!cancelled) {
          const safeSkills = (data ?? []) as SkillRow[];
          setAvailableSkills(safeSkills);
          setSkills((prev) =>
            prev.filter((skillId) => safeSkills.some((skill) => skill.id === skillId)),
          );
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load skills", err);
          setAvailableSkills([]);
          setSkillsError("Unable to load your skills right now.");
        }
      } finally {
        if (!cancelled) {
          setSkillsLoading(false);
        }
      }
    }

    loadSkills();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const toggleSkill = (value: string) => {
    setSkills((prev) =>
      prev.includes(value) ? prev.filter((skill) => skill !== value) : [...prev, value],
    );
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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

    const { data: createdMonument, error: insertError } = await supabase
      .from("monuments")
      .insert({ title, emoji, user_id: user.id })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    if (createdMonument && skills.length > 0) {
      const relationPayload = skills.map((skillId) => ({
        monument_id: createdMonument.id,
        skill_id: skillId,
        user_id: user.id,
      }));
      const { error: relationError } = await supabase
        .from("monument_skills")
        .upsert(relationPayload, { onConflict: "monument_id,skill_id" });

      if (relationError) {
        console.error("Failed to link skills to monument", relationError);
        setError("Monument saved, but we couldn't link all skills.");
        setLoading(false);
        return;
      }
    }

    router.push("/monuments");
    router.refresh();
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#05070c] pb-16 text-white">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageHeader
            title={
              <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                Create a monument
              </span>
            }
            description="Take a milestone from idea to reality and keep it connected to your story."
          >
            <Button asChild variant="outline" size="sm" className="text-white">
              <Link href="/monuments">Back to monuments</Link>
            </Button>
          </PageHeader>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_45px_-25px_rgba(15,23,42,0.85)] sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-3">
                <Label htmlFor="monument-title" className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                  Title
                </Label>
                <Input
                  id="monument-title"
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Name your monument"
                  className="h-12 rounded-xl border-white/10 bg-white/[0.05] text-white placeholder:text-white/40"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                  Related skills
                </Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-full border px-4 py-2 text-sm font-medium transition",
                        "border-white/20 bg-white/[0.04] text-white/80 hover:border-white/40 hover:text-white",
                      )}
                    >
                      <span>
                        {skills.length > 0
                          ? `${skills.length} skill${skills.length > 1 ? "s" : ""} selected`
                          : "Select related skills"}
                      </span>
                      <ChevronDown className="size-4 text-white/70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="min-w-[260px] border-white/10 bg-[#0b101b] text-white"
                  >
                    {skillsLoading ? (
                      <DropdownMenuItem disabled className="text-white/60">
                        Loading skills…
                      </DropdownMenuItem>
                    ) : skillsError ? (
                      <DropdownMenuItem disabled className="text-rose-200">
                        {skillsError}
                      </DropdownMenuItem>
                    ) : availableSkills.length === 0 ? (
                      <DropdownMenuItem disabled className="text-white/60">
                        No skills found yet.
                      </DropdownMenuItem>
                    ) : (
                      availableSkills.map((skill) => (
                        <DropdownMenuCheckboxItem
                          key={skill.id}
                          checked={skills.includes(skill.id)}
                          onCheckedChange={() => toggleSkill(skill.id)}
                          className="gap-3 text-sm text-white"
                        >
                          <span className="text-base">{skill.icon ?? "•"}</span>
                          <span>{skill.name}</span>
                        </DropdownMenuCheckboxItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skillId) => {
                      const skill = availableSkills.find((item) => item.id === skillId);
                      if (!skill) return null;
                      return (
                        <span
                          key={skillId}
                          className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs text-white/80"
                        >
                          {skill.name}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-white/50">
                    These help group your effort with the skills you want to reinforce.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Label htmlFor="monument-emoji" className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                  Icon
                </Label>
                <Input
                  id="monument-emoji"
                  value={emoji}
                  onChange={(event) => setEmoji(event.target.value)}
                  maxLength={2}
                  className="h-14 rounded-2xl border-white/10 bg-white/[0.05] text-center text-3xl"
                />
              </div>

              {error ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed"
                >
                  {loading ? "Creating..." : "Create monument"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
