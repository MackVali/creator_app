"use client";

import { useState, useEffect, FormEvent } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  PageHeader,
  ContentCard,
  GridContainer,
  GridSkeleton,
  SkillsEmptyState,
  useToastHelpers,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Plus } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Skill {
  id: string;
  name: string;
  icon: string | null;
}

interface Monument {
  id: string;
  title: string;
}

export default function SkillsPage() {
  const supabase = getSupabaseBrowser();
  const { success, error } = useToastHelpers();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [monumentId, setMonumentId] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchSkills() {
    if (!supabase) return;
    setLoading(true);
    await supabase.auth.getSession();
    const { data, error: err } = await supabase
      .from("skills")
      .select("id,name,icon")
      .order("created_at", { ascending: false });
    if (err) console.error(err);
    setSkills(data ?? []);
    setLoading(false);
  }

  async function fetchMonuments() {
    if (!supabase) return;
    await supabase.auth.getSession();
    const { data, error: err } = await supabase
      .from("monuments")
      .select("id,title")
      .order("created_at", { ascending: false });
    if (err) console.error(err);
    setMonuments(data ?? []);
  }

  useEffect(() => {
    fetchSkills();
    fetchMonuments();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const { error: insertError } = await supabase.from("skills").insert({
      name,
      icon,
      monument_id: monumentId || null,
      user_id: user.id,
    });
    setSaving(false);
    if (insertError) {
      console.error(insertError);
      error("Failed to create skill", insertError.message);
      return;
    }
    success("Skill created");
    setOpen(false);
    setName("");
    setIcon("");
    setMonumentId("");
    fetchSkills();
  }

  return (
    <ProtectedRoute>
      <div className="p-4 sm:p-6 space-y-4">
        <PageHeader title="Skills">
          <Button size="sm" onClick={() => setOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Skill
          </Button>
        </PageHeader>

        {loading ? (
          <GridSkeleton />
        ) : skills.length === 0 ? (
          <SkillsEmptyState onAction={() => setOpen(true)} />
        ) : (
          <GridContainer cols={1} className="gap-4">
            {skills.map((skill) => (
              <ContentCard
                key={skill.id}
                className="flex items-center gap-4"
                padding="sm"
              >
                <div className="text-2xl">{skill.icon || "⭐"}</div>
                <div className="font-medium">{skill.name}</div>
              </ContentCard>
            ))}
          </GridContainer>
        )}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Create Skill</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-4 p-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Icon</label>
                <Input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Related Monument</label>
                <select
                  value={monumentId}
                  onChange={(e) => setMonumentId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background p-2"
                >
                  <option value="">None</option>
                  {monuments.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>
              <SheetFooter>
                <Button type="submit" disabled={saving} className="w-full">
                  {saving ? "Saving..." : "Save Skill"}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </div>
    </ProtectedRoute>
  );
}

