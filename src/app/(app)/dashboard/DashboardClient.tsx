"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { GoalCardGrid } from "@/components/ui/GoalCardGrid";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import CategorySection from "@/components/skills/CategorySection";
import { SkillCardSkeleton } from "@/components/skills/SkillCardSkeleton";
import type { GoalItem } from "@/types/dashboard";
import { getCatsForUser } from "@/lib/data/cats";
import {
  getSkillsForUser,
  groupSkillsByCat,
  type SkillRow,
} from "@/lib/data/skills";
import { createClient } from "@/lib/supabase/browser";

interface Category {
  id: string;
  name: string;
  skills: SkillRow[];
}

export default function DashboardClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const [cats, skills, goalsRes] = await Promise.all([
        getCatsForUser(user.id),
        getSkillsForUser(user.id),
        sb
          .from("goals")
          .select("id,name,priority,energy,monument_id,created_at")
          .eq("user_id", user.id)
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      const byCat = groupSkillsByCat(skills);
      const catsWithSkills: Category[] = cats.map((cat) => ({
        id: cat.id,
        name: cat.name,
        skills: byCat[cat.id] || [],
      }));

      if (byCat["null"]) {
        catsWithSkills.push({
          id: "uncategorized",
          name: "Uncategorized",
          skills: byCat["null"],
        });
      }

      if (process.env.NODE_ENV !== "production") {
        console.debug("Dashboard counts:", {
          cats: catsWithSkills.length,
          skills: skills.length,
        });
      }

      setCategories(catsWithSkills);
      setGoals((goalsRes.data ?? []) as GoalItem[]);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="pb-20">
      <LevelBanner level={80} current={3200} total={4000} />

      <MonumentContainer />

      <Section title={<Link href="/skills">Skills</Link>} className="mt-1 px-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkillCardSkeleton key={i} />
            ))}
          </div>
        ) : categories.length > 0 ? (
          <div className="space-y-4">
            {categories.map((cat) => (
              <CategorySection
                key={cat.id}
                title={cat.name}
                skills={cat.skills}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No skills found. Create your first skill to get started!
          </div>
        )}
      </Section>

      <Section
        title={<Link href="/goals">Current Goals</Link>}
        className="safe-bottom mt-2 px-4"
      >
        <GoalCardGrid
          goals={goals}
          loading={loading}
          showLinks={false} // Set to true if /goals/[id] route exists
        />
      </Section>
    </main>
  );
}
