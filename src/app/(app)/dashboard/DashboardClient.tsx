"use client";

import React, { useState, useEffect } from "react";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { GoalsCard } from "@/components/ui/GoalsCard";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Skill {
  skill_id: string;
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
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    try {
      const response = await fetch("/api/dashboard");
      const data = await response.json();
      setCategories(data.skillsAndGoals.cats || []);
    } catch (error) {
      console.error("Error fetching skills:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (catId: string) => {
    const newExpanded = new Set(expandedCats);
    if (newExpanded.has(catId)) {
      newExpanded.delete(catId);
    } else {
      newExpanded.add(catId);
    }
    setExpandedCats(newExpanded);
  };

  return (
    <main className="pb-20">
      <LevelBanner level={80} current={3200} total={4000} />

      <MonumentContainer />

      <Section title="Skills" className="mt-1 px-4">
        {loading ? (
          <div className="text-center py-8 text-gray-500">
            Loading skills...
          </div>
        ) : categories.length > 0 ? (
          <div className="space-y-4">
            {categories.map((cat) => (
              <div
                key={cat.cat_id}
                className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
              >
                {/* Category Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-700 transition-colors"
                  onClick={() => toggleCategory(cat.cat_id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-medium text-white">
                        {cat.cat_name}
                      </div>
                      <div className="text-sm text-gray-400 bg-gray-600 px-2 py-1 rounded-full">
                        {cat.skill_count} skills
                      </div>
                    </div>
                    <div className="text-gray-400">
                      {expandedCats.has(cat.cat_id) ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Skills List */}
                {expandedCats.has(cat.cat_id) && (
                  <div className="border-t border-gray-700 bg-gray-900">
                    <div className="p-4 space-y-3">
                      {cat.skills && cat.skills.length > 0 ? (
                        cat.skills.map((skill) => (
                          <div
                            key={skill.skill_id}
                            className="flex items-center gap-3 p-3 bg-gray-800 rounded-md border border-gray-700 hover:bg-gray-750 transition-colors"
                          >
                            {/* Skill Icon */}
                            <div className="text-xl flex-shrink-0">
                              {skill.icon || "💡"}
                            </div>

                            {/* Skill Name */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white truncate">
                                {skill.name}
                              </div>
                            </div>

                            {/* Level Badge */}
                            <div className="text-xs text-gray-400 bg-gray-600 px-2 py-1 rounded-full flex-shrink-0">
                              Lv {skill.level}
                            </div>

                            {/* Progress Bar */}
                            <div className="w-20 flex-shrink-0">
                              <div className="w-full h-2 bg-gray-600 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                                  style={{ width: `${skill.progress}%` }}
                                />
                              </div>
                            </div>

                            {/* Progress Percentage */}
                            <div className="text-xs text-gray-400 w-12 text-right flex-shrink-0">
                              {skill.progress}%
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          No skills in this category
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No skills found. Create your first skill to get started!
          </div>
        )}
      </Section>

      <Section title="Current Goals" className="safe-bottom mt-2">
        <GoalsCard
          items={[
            "Complete book manuscript",
            "Improve presentation skills",
            "Plan charity event",
          ]}
        />
      </Section>
    </main>
  );
}
