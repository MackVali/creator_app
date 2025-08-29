"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { GoalsContainer } from "@/components/ui/GoalsContainer";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import CategorySection from "@/components/skills/CategorySection";
import { SkillCardSkeleton } from "@/components/skills/SkillCardSkeleton";

interface Skill {
  skill_id: string;
  cat_id: string;
  name: string;
  icon: string;
  level: number;
  progress: number;
}

interface Category {
  cat_id: string;
  cat_name: string;
  skill_count: number;
  skills: Skill[];
}

export default function DashboardClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch("/api/dashboard");
      const data = await response.json();
      
      // Debug logging
      console.log("🔍 Dashboard API response:", data);
      console.log("🔍 Categories data:", data.skillsAndGoals?.cats);
      console.log("🔍 Goals data:", data.skillsAndGoals?.goals);

      setCategories(data.skillsAndGoals?.cats || []);
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
                key={cat.cat_id}
                title={cat.cat_name}
                skillCount={cat.skill_count}
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
        <GoalsContainer />
      </Section>
    </main>
  );
}
