"use client";

import { useState, useEffect } from "react";
import { getSkillsByCat } from "../../../lib/data/skills";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { SkillRow } from "../../../lib/types/skill";

export default function SkillsCheckPage() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setError("Supabase client not initialized");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("User not authenticated");
        return;
      }

      const skillsData = await getSkillsByCat(user.id);
      setSkills(skillsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading skills...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Skills Data Check</h1>
      <p className="text-gray-600 mb-4">
        This page shows the raw skills data from the database to verify it
        matches Supabase.
      </p>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Icon
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cat ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Level
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created At
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {skills.map((skill) => (
              <tr key={skill.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                  {skill.id.slice(0, 8)}...
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {skill.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <span className="text-2xl">{skill.icon}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                  {skill.cat_id ? skill.cat_id.slice(0, 8) + "..." : "null"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {skill.level ?? "null"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {skill.created_at
                    ? new Date(skill.created_at).toLocaleDateString()
                    : "null"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-highlight/20 rounded-lg">
        <h3 className="text-lg font-medium text-surface mb-2">Summary</h3>
        <p className="text-accent">
          Total skills: <strong>{skills.length}</strong>
        </p>
        <p className="text-accent">
          Skills with icons:{" "}
          <strong>{skills.filter((s) => s.icon).length}</strong>
        </p>
        <p className="text-accent">
          Skills with names:{" "}
          <strong>{skills.filter((s) => s.name).length}</strong>
        </p>
        <p className="text-accent">
          Skills with categories:{" "}
          <strong>{skills.filter((s) => s.cat_id).length}</strong>
        </p>
      </div>
    </div>
  );
}
