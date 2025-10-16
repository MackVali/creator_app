"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getCatsForUser } from "../../../lib/data/cats";
import { getSkillsForUser, getSkillsByCat } from "../../../lib/data/skills";

interface DebugData {
  userId: string | null;
  catsCount: number;
  skillsCount: number;
  catsWithSkills: Array<{
    catId: string;
    catName: string;
    skillsCount: number;
  }>;
  uncategorizedSkillsCount: number;
  firstThreeCats: Array<{
    id: string;
    name: string;
    user_id: string;
    created_at?: string | null;
    color_hex?: string | null;
    sort_order?: number | null;
  }>;
  firstThreeSkills: Array<{
    id: string;
    name: string;
    icon: string | null;
    cat_id: string | null;
    level: number | null;
    user_id: string;
    created_at?: string | null;
    updated_at?: string | null;
  }>;
}

export default function CatsSkillsDebugPage() {
  const [debugData, setDebugData] = useState<DebugData>({
    userId: null,
    catsCount: 0,
    skillsCount: 0,
    catsWithSkills: [],
    uncategorizedSkillsCount: 0,
    firstThreeCats: [],
    firstThreeSkills: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDebugData();
  }, []);

  const fetchDebugData = async () => {
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Fetch all cats and skills
      const [cats, skills] = await Promise.all([
        getCatsForUser(user.id),
        getSkillsForUser(user.id),
      ]);

      // Count uncategorized skills
      const uncategorizedSkills = skills.filter(skill => !skill.cat_id);

      // Get skills count for each cat
      const catsWithSkills = await Promise.all(
        cats.map(async (cat) => {
          const catSkills = await getSkillsByCat(user.id, cat.id);
          return {
            catId: cat.id,
            catName: cat.name,
            skillsCount: catSkills.length,
          };
        })
      );

      // Dev-only console logging
      if (process.env.NODE_ENV !== "production") {
        console.log("🔍 Debug: First 3 cats", cats.slice(0, 3));
        console.log("🔍 Debug: First 3 skills", skills.slice(0, 3));
        console.log("🔍 Debug: Uncategorized skills count", uncategorizedSkills.length);
      }

      setDebugData({
        userId: user.id,
        catsCount: cats.length,
        skillsCount: skills.length,
        catsWithSkills,
        uncategorizedSkillsCount: uncategorizedSkills.length,
        firstThreeCats: cats.slice(0, 3),
        firstThreeSkills: skills.slice(0, 3),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-white">
        <div className="text-center">Loading debug data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-white">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">CATs & Skills Debug</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Summary Stats */}
        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Summary</h2>
          <div className="space-y-2">
            <div>User ID: <code className="text-sm bg-slate-700 px-2 py-1 rounded">{debugData.userId}</code></div>
            <div>Total CATs: <span className="text-2xl font-bold text-blue-400">{debugData.catsCount}</span></div>
            <div>Total Skills: <span className="text-2xl font-bold text-green-400">{debugData.skillsCount}</span></div>
            <div>Uncategorized Skills: <span className="text-2xl font-bold text-yellow-400">{debugData.uncategorizedSkillsCount}</span></div>
          </div>
        </div>

        {/* CATs with Skills */}
        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">CATs with Skills</h2>
          <div className="space-y-2">
            {debugData.catsWithSkills.map((cat) => (
              <div key={cat.catId} className="flex justify-between items-center">
                <span className="truncate">{cat.catName}</span>
                <span className="text-sm bg-slate-700 px-2 py-1 rounded">{cat.skillsCount} skills</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Raw Data */}
      <div className="mt-6 space-y-6">
        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">First 3 CATs (Raw)</h2>
          <pre className="text-sm bg-slate-900 p-4 rounded overflow-auto">
            {JSON.stringify(debugData.firstThreeCats, null, 2)}
          </pre>
        </div>

        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">First 3 Skills (Raw)</h2>
          <pre className="text-sm bg-slate-900 p-4 rounded overflow-auto">
            {JSON.stringify(debugData.firstThreeSkills, null, 2)}
          </pre>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="mt-6 text-center">
        <button
          onClick={fetchDebugData}
          className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-medium"
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
}
