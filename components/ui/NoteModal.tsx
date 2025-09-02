"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Label } from "./label";
import { Button } from "./button";
import { Select, SelectContent, SelectItem } from "./select";
import { useToastHelpers } from "./toast";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { getNotes, saveNotes } from "@/lib/notesStorage";

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NoteModal({ isOpen, onClose }: NoteModalProps) {
  const [mounted, setMounted] = useState(false);
  const toast = useToastHelpers();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [formData, setFormData] = useState({
    skillId: "",
    title: "",
    content: "",
  });

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const loadSkills = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const skillsData = await getSkillsForUser(user.id);
      setSkills(skillsData);
    };
    if (isOpen && mounted) {
      loadSkills();
    }
  }, [isOpen, mounted]);

  if (!isOpen || !mounted) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.skillId) {
      alert("Please select a skill");
      return;
    }
    const notes = getNotes(formData.skillId);
    notes.push({
      id: Date.now().toString(),
      skillId: formData.skillId,
      title: formData.title,
      content: formData.content,
    });
    saveNotes(formData.skillId, notes);
    toast.success("Note saved");
    setFormData({ skillId: "", title: "", content: "" });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[400px] max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Add Note</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <Label className="text-white text-sm font-medium">Skill</Label>
            <Select
              value={formData.skillId}
              onValueChange={(value) =>
                setFormData({ ...formData, skillId: value })
              }
            >
              <SelectContent>
                {skills.map((skill) => (
                  <SelectItem key={skill.id} value={skill.id}>
                    {skill.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white text-sm font-medium">Title</Label>
            <Input
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Note title"
              className="bg-gray-800 border-gray-600 text-white h-10 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white text-sm font-medium">Content</Label>
            <Textarea
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              placeholder="Write your note..."
              className="bg-gray-800 border-gray-600 text-white text-base"
              rows={4}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!formData.skillId}
          >
            Save Note
          </Button>
        </form>
      </div>
    </div>,
    document.body
  );
}
