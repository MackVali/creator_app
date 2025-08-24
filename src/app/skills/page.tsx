"use client";

import { useState, useEffect } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Plus, Star, TrendingUp, Award } from "lucide-react";

interface Skill {
  id: string;
  name: string;
  description?: string;
  currentLevel?: number;
  targetLevel?: number;
  category?: string;
  lastPracticed?: string;
  totalPracticeHours?: number;
  icon?: string;
  progress?: number;
}

export default function SkillsPage() {
  const { session } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (session?.user) {
      fetchSkills();
    }
  }, [session]);

  const fetchSkills = async () => {
    try {
      setLoading(true);
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setError("Supabase client not initialized");
        return;
      }

      const { data, error } = await supabase
        .from('skills')
        .select('id, name, "Title", description, progress, icon, created_at')
        .eq('user_id', session?.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching skills:', error);
        setError('Failed to fetch skills');
        return;
      }

      // Transform the data to use consistent field names
      const transformedSkills = (data || []).map(skill => ({
        id: skill.id,
        name: skill.name || skill.Title || 'Unnamed Skill',
        description: skill.description,
        progress: skill.progress || 0,
        icon: skill.icon,
        created_at: skill.created_at,
      }));

      setSkills(transformedSkills);
    } catch (err) {
      console.error('Error fetching skills:', err);
      setError('Failed to fetch skills');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSkill = () => {
    setShowCreateModal(true);
  };

  const handleSkillCreated = () => {
    setShowCreateModal(false);
    fetchSkills(); // Refresh the skills list
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-[#0F0F0F] text-white">
          <div className="p-6">
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Skills</h1>
              <p className="text-muted-foreground mt-2">Loading your skills...</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-[#2C2C2C] rounded-lg p-6 border border-white/10 animate-pulse">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 bg-white/10 rounded"></div>
                    <div className="h-4 bg-white/10 rounded w-24"></div>
                  </div>
                  <div className="h-2 bg-white/10 rounded w-full"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0F0F0F] text-white">
        <div className="p-6">
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Skills</h1>
                <p className="text-muted-foreground mt-2">
                  Track your skills and set targets to continuously improve and grow.
                </p>
              </div>
              <Button onClick={handleCreateSkill} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Create Skill
              </Button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {skills.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-zinc-400 mb-4">No skills yet</div>
              <div className="text-sm text-zinc-500 mb-6">
                Track your skills and set targets to continuously improve and grow.
              </div>
              <Button onClick={handleCreateSkill} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Skill
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="bg-[#2C2C2C] rounded-lg p-6 border border-white/10 hover:border-white/20 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="text-2xl">
                      {skill.icon || getSkillIcon(skill.name)}
                    </div>
                    <span className="font-medium text-zinc-200">
                      {skill.name}
                    </span>
                  </div>
                  {skill.description && (
                    <p className="text-sm text-zinc-400 mb-4">{skill.description}</p>
                  )}
                  {skill.progress !== undefined && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Progress</span>
                        <span className="text-zinc-300">{skill.progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${skill.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {showCreateModal && (
          <CreateSkillModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onSkillCreated={handleSkillCreated}
            userId={session?.user.id}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}

// Helper function to get appropriate icons for skills
function getSkillIcon(skillName: string): string {
  const skillIcons: Record<string, string> = {
    'Writing': '✏️',
    'Time Management': '⏰',
    'Public Speaking': '📢',
    'Problem Solving': '🧩',
    'Music': '🎵',
    'Guitar': '🎸',
    'Programming': '💻',
    'Design': '🎨',
    'Leadership': '👑',
    'Communication': '💬',
    'Critical Thinking': '🧠',
    'Creativity': '✨',
    'Teamwork': '🤝',
    'Adaptability': '🔄',
    'Learning': '📚',
  };

  return skillIcons[skillName] || '💡';
}

// Create Skill Modal Component
interface CreateSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSkillCreated: () => void;
  userId?: string;
}

function CreateSkillModal({ isOpen, onClose, onSkillCreated, userId }: CreateSkillModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    icon: '',
    description: '',
    relatedMonumentId: '',
  });
  const [monuments, setMonuments] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchMonuments();
    }
  }, [isOpen, userId]);

  const fetchMonuments = async () => {
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;

      const { data, error } = await supabase
        .from('monuments')
        .select('id, "Title"')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setMonuments(data.map(monument => ({
          id: monument.id,
          title: monument.Title || 'Unnamed Monument'
        })));
      }
    } catch (err) {
      console.error('Error fetching monuments:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setError('Supabase client not initialized');
        return;
      }

      const { error } = await supabase
        .from('skills')
        .insert({
          user_id: userId,
          name: formData.name,
          "Title": formData.name, // Keep Title column for backward compatibility
          icon: formData.icon || getSkillIcon(formData.name),
          description: formData.description || null,
          progress: 0,
        });

      if (error) {
        console.error('Error creating skill:', error);
        setError('Failed to create skill');
        return;
      }

      // Reset form and close modal
      setFormData({ name: '', icon: '', description: '', relatedMonumentId: '' });
      onSkillCreated();
    } catch (err) {
      console.error('Error creating skill:', err);
      setError('Failed to create skill');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#17181C] rounded-2xl w-full max-w-md p-6 border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-zinc-200">Create New Skill</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close"
          >
            <span className="text-zinc-400 text-xl">×</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Skill Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-[#2C2C2C] border border-white/10 text-white placeholder-zinc-400 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              placeholder="e.g., Programming, Design, Leadership"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Icon (Optional)
            </label>
            <input
              type="text"
              value={formData.icon}
              onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
              className="w-full bg-[#2C2C2C] border border-white/10 text-white placeholder-zinc-400 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              placeholder="e.g., 💻 🎨 👑"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Leave empty to use an auto-generated icon
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-[#2C2C2C] border border-white/10 text-white placeholder-zinc-400 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              placeholder="Describe what this skill means to you..."
              rows={3}
            />
          </div>

          {monuments.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Related Monument (Optional)
              </label>
              <select
                value={formData.relatedMonumentId}
                onChange={(e) => setFormData(prev => ({ ...prev, relatedMonumentId: e.target.value }))}
                className="w-full bg-[#2C2C2C] border border-white/10 text-white rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              >
                <option value="">Select a monument...</option>
                {monuments.map((monument) => (
                  <option key={monument.id} value={monument.id}>
                    {monument.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-transparent border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Skill'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
