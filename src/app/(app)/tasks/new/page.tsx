"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Option {
  id: string;
  name: string;
}

export default function NewTaskPage() {
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [skillId, setSkillId] = useState("");
  const [projects, setProjects] = useState<Option[]>([]);
  const [skills, setSkills] = useState<Option[]>([]);
  const router = useRouter();

  useEffect(() => {
    const loadRefs = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      await supabase.auth.getSession();
      const [projRes, skillRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id,name")
          .order("created_at", { ascending: false }),
        supabase
          .from("skills")
          .select("id,name")
          .order("created_at", { ascending: false }),
      ]);
      if (projRes.error) {
        console.error("Error fetching projects:", projRes.error);
      } else {
        setProjects(projRes.data ?? []);
      }
      if (skillRes.error) {
        console.error("Error fetching skills:", skillRes.error);
      } else {
        setSkills(skillRes.data ?? []);
      }
    };
    loadRefs();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase || !name || !projectId) return;
    const { error } = await supabase.from("tasks").insert({
      name,
      project_id: projectId,
      skill_id: skillId || null,
    });
    if (error) {
      console.error("Error creating task:", error);
      return;
    }
    router.push("/tasks");
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <PageHeader
            title="Create New Task"
            description="Add a new task to your project"
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
              <label className="block text-sm mb-1">Project *</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
                className="w-full px-3 py-2 rounded bg-gray-700"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
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

