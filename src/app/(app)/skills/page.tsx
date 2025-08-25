"use client";

import { useState, useEffect } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface Skill {
  skill_id: string; // Changed from 'id' to 'skill_id' to match database view
  name: string;
  icon: string;
  level: number;
  progress: number;
  cat_id: string;
}

interface Category {
  cat_id: string; // Changed from 'id' to 'cat_id' to match database view
  cat_name: string; // Changed from 'name' to 'cat_name' to match database view
  skill_count: number;
  skills: Skill[];
}

function SkillsPageContent() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillIcon, setNewSkillIcon] = useState("💡");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [loading, setLoading] = useState(true);

  const supabase = getSupabaseBrowser();
  const router = useRouter();

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from("skills_by_cats_v")
        .select("*");

      if (error) throw error;
      setCategories(data || []);
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

  const createCategory = async () => {
    if (!newCategoryName.trim() || !supabase) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase
        .from("cats")
        .insert({ name: newCategoryName.trim(), user_id: user.id });

      if (error) throw error;

      setNewCategoryName("");
      setIsCreatingCategory(false);
      fetchSkills();
    } catch (error) {
      console.error("Error creating category:", error);
    }
  };

  const createSkill = async () => {
    if (!newSkillName.trim() || !selectedCategory || !supabase) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase.from("skills").insert({
        name: newSkillName.trim(),
        icon: newSkillIcon,
        cat_id: selectedCategory,
        user_id: user.id,
        level: 1,
      });

      if (error) throw error;

      setNewSkillName("");
      setNewSkillIcon("💡");
      setSelectedCategory("");
      setIsCreateModalOpen(false);
      fetchSkills();
    } catch (error) {
      console.error("Error creating skill:", error);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-white">
        <div className="text-center">Loading skills...</div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#E0E0E0] mb-2">Skills</h1>
          <p className="text-[#A0A0A0]">
            Manage and organize your skills by categories
          </p>
        </div>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-[#BBB] text-[#1E1E1E] hover:bg-[#A0A0A0]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Skill
        </Button>
      </div>

      {/* Categories and Skills */}
      <div className="space-y-6">
        {categories.length > 0 ? (
          categories.map((cat) => (
            <div
              key={cat.cat_id}
              className="bg-[#2C2C2C] rounded-lg border border-[#333] overflow-hidden"
            >
              {/* Category Header */}
              <div
                className="p-4 cursor-pointer hover:bg-[#353535] transition-colors"
                onClick={() => toggleCategory(cat.cat_id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-xl font-medium text-[#E0E0E0]">
                      {cat.cat_name}
                    </div>
                    <div className="text-sm text-[#A0A0A0] bg-[#404040] px-3 py-1 rounded-full">
                      {cat.skill_count} skills
                    </div>
                  </div>
                  <div className="text-[#A0A0A0]">
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
                <div className="border-t border-[#333] bg-[#252525]">
                  <div className="p-4 space-y-3">
                    {cat.skills && cat.skills.length > 0 ? (
                      cat.skills.map((skill) => (
                        <div
                          key={skill.skill_id}
                          className="flex items-center gap-4 p-4 bg-[#1E1E1E] rounded-md border border-[#333] hover:bg-[#252525] transition-colors"
                        >
                          {/* Skill Icon */}
                          <div className="text-2xl flex-shrink-0">
                            {skill.icon}
                          </div>

                          {/* Skill Name */}
                          <div className="flex-1 min-w-0">
                            <div className="text-lg font-medium text-[#E0E0E0]">
                              {skill.name}
                            </div>
                          </div>

                          {/* Level Badge */}
                          <div className="text-sm text-[#A0A0A0] bg-[#404040] px-3 py-1 rounded-full flex-shrink-0">
                            Level {skill.level}
                          </div>

                          {/* Progress Bar */}
                          <div className="w-32 flex-shrink-0">
                            <div className="w-full h-3 bg-[#333] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#BBB] rounded-full transition-all duration-300"
                                style={{ width: `${skill.progress}%` }}
                              />
                            </div>
                          </div>

                          {/* Progress Percentage */}
                          <div className="text-sm text-[#A0A0A0] w-16 text-right flex-shrink-0">
                            {skill.progress}%
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-[#808080]">
                        No skills in this category yet
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-16 text-[#808080]">
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-xl font-medium text-[#E0E0E0] mb-2">
              No skills yet
            </h3>
            <p className="text-[#A0A0A0] mb-6">
              Create your first skill to get started on your journey
            </p>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-[#BBB] text-[#1E1E1E] hover:bg-[#A0A0A0]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Skill
            </Button>
          </div>
        )}
      </div>

      {/* Create Skill Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#2C2C2C] rounded-lg p-6 w-full max-w-md mx-4 border border-[#333]">
            <h3 className="text-xl font-bold text-[#E0E0E0] mb-4">
              Create New Skill
            </h3>

            <div className="space-y-4">
              {/* Skill Name */}
              <div>
                <label className="block text-sm font-medium text-[#E0E0E0] mb-2">
                  Skill Name
                </label>
                <input
                  type="text"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  className="w-full p-3 bg-[#1E1E1E] border border-[#333] rounded-md text-[#E0E0E0] focus:outline-none focus:border-[#BBB]"
                  placeholder="e.g., Guitar, Programming, Cooking"
                />
              </div>

              {/* Skill Icon */}
              <div>
                <label className="block text-sm font-medium text-[#E0E0E0] mb-2">
                  Icon
                </label>
                <input
                  type="text"
                  value={newSkillIcon}
                  onChange={(e) => setNewSkillIcon(e.target.value)}
                  className="w-full p-3 bg-[#1E1E1E] border border-[#333] rounded-md text-[#E0E0E0] focus:outline-none focus:border-[#BBB] text-center text-2xl"
                  placeholder="🎸"
                />
              </div>

              {/* Category Selection */}
              <div>
                <label className="block text-sm font-medium text-[#E0E0E0] mb-2">
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full p-3 bg-[#1E1E1E] border border-[#333] rounded-md text-[#E0E0E0] focus:outline-none focus:border-[#BBB]"
                >
                  <option value="">Select a category</option>
                  {categories.map((cat) => (
                    <option key={cat.cat_id} value={cat.cat_id}>
                      {cat.cat_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Create New Category Option */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingCategory(!isCreatingCategory)}
                  className="text-sm text-[#BBB] hover:text-[#E0E0E0] underline"
                >
                  {isCreatingCategory ? "Cancel" : "Create new category"}
                </button>

                {isCreatingCategory && (
                  <div className="mt-3">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="w-full p-3 bg-[#1E1E1E] border border-[#333] rounded-md text-[#E0E0E0] focus:outline-none focus:border-[#BBB]"
                      placeholder="New category name"
                    />
                    <Button
                      onClick={createCategory}
                      className="mt-2 w-full bg-[#404040] text-[#E0E0E0] hover:bg-[#505050]"
                      disabled={!newCategoryName.trim()}
                    >
                      Create Category
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => setIsCreateModalOpen(false)}
                className="flex-1 bg-[#404040] text-[#E0E0E0] hover:bg-[#505050]"
              >
                Cancel
              </Button>
              <Button
                onClick={createSkill}
                className="flex-1 bg-[#BBB] text-[#1E1E1E] hover:bg-[#A0A0A0]"
                disabled={!newSkillName.trim() || !selectedCategory}
              >
                Create Skill
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SkillsPage() {
  return (
    <ProtectedRoute>
      <SkillsPageContent />
    </ProtectedRoute>
  );
}
