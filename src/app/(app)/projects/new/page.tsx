"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";
import { getSupabaseBrowser } from "@/lib/supabase";

interface SkillOption {
  id: string;
  name: string;
}

export default function NewProjectPage() {
  const [name, setName] = useState("");
  const [skillId, setSkillId] = useState("");
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const router = useRouter();

  useEffect(() => {
    const loadSkills = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      await supabase.auth.getSession();
      const { data, error } = await supabase
        .from("skills")
        .select("id,name")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching skills:", error);
        return;
      }
      setSkills(data ?? []);
    };
    loadSkills();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase || !name) return;
    const { data, error } = await supabase
      .from("projects")
      .insert({ name })
      .select("id")
      .single();
    if (error) {
      console.error("Error creating project:", error);
      return;
    }
    if (skillId) {
      await supabase.from("project_skills").insert({
        project_id: data.id,
        skill_id: skillId,
      });
    }
    router.push("/projects");
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <PageHeader
            title="Create New Project"
            description="Start a new project to achieve your goals"
          />
          <form
            onSubmit={submit}
            className="max-w-md mx-auto mt-8 space-y-4"
          >
            <div>
              <label className="block text-sm mb-1">Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Skill</label>
              <select
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-gray-700"
              >
                <option value="">None</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-3 py-2 rounded bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-2 rounded bg-blue-600"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      </div>
    </ProtectedRoute>
  );
}

