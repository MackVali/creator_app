"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Textarea } from "./textarea";
import { Select, SelectContent, SelectItem } from "./select";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalsForUser, type Goal } from "@/lib/queries/goals";
import {
  getProjectsForGoal,
  getProjectsForUser,
  type Project,
} from "@/lib/queries/projects";

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventType: "GOAL" | "PROJECT" | "TASK" | "HABIT";
}

export function EventModal({ isOpen, onClose, eventType }: EventModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const loadFormData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Always load goals (needed for both projects and tasks)
      const goalsData = await getGoalsForUser(user.id);
      setGoals(goalsData);

      // Load projects if this is a task form
      if (eventType === "TASK") {
        const projectsData = await getProjectsForUser(user.id);
        setProjects(projectsData);
      }
    } catch (error) {
      console.error("Error loading form data:", error);
    } finally {
      setLoading(false);
    }
  }, [eventType]);

  // Load goals and projects when modal opens
  useEffect(() => {
    if (isOpen && mounted) {
      loadFormData();
    }
  }, [isOpen, mounted, loadFormData]);

  // Filter projects when goal is selected for tasks
  const handleGoalChange = useCallback(
    async (goalId: string) => {
      setFormData((prev) => ({ ...prev, goal_id: goalId, project_id: "" }));

      if (eventType === "TASK" && goalId) {
        try {
          const projectsData = await getProjectsForGoal(goalId);
          setProjects(projectsData);
        } catch (error) {
          console.error("Error loading projects for goal:", error);
        }
      }
    },
    [eventType]
  );

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    priority: "NO",
    energy: "NO",
    goal_id: "",
    project_id: "",
    stage:
      eventType === "PROJECT"
        ? "RESEARCH"
        : eventType === "TASK"
        ? "PREPARE"
        : "",
    type: eventType === "HABIT" ? "HABIT" : "",
    recurrence: eventType === "HABIT" ? "daily" : "",
  });

  // State for dropdown data
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !mounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Please enter a name for your " + eventType.toLowerCase());
      return;
    }

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        console.error("Supabase client not available");
        return;
      }

      // Get current user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("User not authenticated:", userError);
        return;
      }

      const insertData: {
        user_id: string;
        name: string;
        priority: string;
        energy: string;
        description?: string;
        why?: string;
        goal_id?: string;
        project_id?: string;
        stage?: string;
        type?: string;
        recurrence?: string;
      } = {
        user_id: user.id,
        name: formData.name.trim(),
        priority: formData.priority,
        energy: formData.energy,
      };

      // Add description if provided
      if (formData.description.trim()) {
        if (eventType === "GOAL") {
          insertData.why = formData.description.trim();
        } else {
          insertData.description = formData.description.trim();
        }
      }

      // Add event-specific fields
      if (eventType === "PROJECT") {
        if (!formData.goal_id) {
          alert("Please select a goal for your project");
          return;
        }
        insertData.goal_id = formData.goal_id;
        insertData.stage = formData.stage;
      } else if (eventType === "TASK") {
        if (!formData.project_id) {
          alert("Please select a project for your task");
          return;
        }
        insertData.project_id = formData.project_id;
        insertData.stage = formData.stage;
      } else if (eventType === "HABIT") {
        insertData.type = formData.type;
        insertData.recurrence = formData.recurrence;
      }

      console.log("Inserting data:", insertData);

      const { data, error } = await supabase
        .from(eventType.toLowerCase() + "s") // goals, projects, tasks, habits
        .insert(insertData)
        .select();

      if (error) {
        console.error("Error creating " + eventType.toLowerCase() + ":", error);
        alert(
          "Failed to create " + eventType.toLowerCase() + ". Please try again."
        );
        return;
      }

      console.log(
        "Successfully created " + eventType.toLowerCase() + ":",
        data
      );
      onClose();

      // Refresh the page to show the new goal (temporary solution)
      window.location.reload();
    } catch (error) {
      console.error("Error creating " + eventType.toLowerCase() + ":", error);
      alert(
        "Failed to create " + eventType.toLowerCase() + ". Please try again."
      );
    }
  };

  const getModalTitle = () => {
    switch (eventType) {
      case "GOAL":
        return "Create New Goal";
      case "PROJECT":
        return "Create New Project";
      case "TASK":
        return "Create New Task";
      case "HABIT":
        return "Create New Habit";
      default:
        return "Create New Item";
    }
  };

  const getPriorityOptions = () => [
    { value: "NO", label: "No Priority" },
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "CRITICAL", label: "Critical" },
    { value: "ULTRA-CRITICAL", label: "Ultra-Critical" },
  ];

  const getEnergyOptions = () => [
    { value: "NO", label: "No Energy" },
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "ULTRA", label: "Ultra" },
    { value: "EXTREME", label: "Extreme" },
  ];

  const getProjectStageOptions = () => [
    { value: "RESEARCH", label: "Research" },
    { value: "TEST", label: "Test" },
    { value: "BUILD", label: "Build" },
    { value: "REFINE", label: "Refine" },
    { value: "RELEASE", label: "Release" },
  ];

  const getTaskStageOptions = () => [
    { value: "PREPARE", label: "Prepare" },
    { value: "PRODUCE", label: "Produce" },
    { value: "PERFECT", label: "Perfect" },
  ];

  const getHabitTypeOptions = () => [
    { value: "HABIT", label: "Habit" },
    { value: "CHORE", label: "Chore" },
  ];

  const getRecurrenceOptions = () => [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "bi-weekly", label: "Bi-weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "bi-monthly", label: "Bi-monthly" },
    { value: "yearly", label: "Yearly" },
  ];

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[500px] max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">
            {getModalTitle()}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-white text-sm font-medium">
              Name
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder={`Enter ${eventType.toLowerCase()} name`}
              className="bg-gray-800 border-gray-600 text-white h-10 text-sm"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label
              htmlFor="description"
              className="text-white text-sm font-medium"
            >
              Description (Optional)
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder={`Describe your ${eventType.toLowerCase()}`}
              className="bg-gray-800 border-gray-600 text-white text-base"
              rows={3}
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label
              htmlFor="priority"
              className="text-white text-sm font-medium"
            >
              Priority
            </Label>
            <Select
              value={formData.priority}
              onValueChange={(value) =>
                setFormData({ ...formData, priority: value })
              }
            >
              <SelectContent>
                {getPriorityOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Energy */}
          <div className="space-y-2">
            <Label htmlFor="energy" className="text-white text-sm font-medium">
              Energy Level
            </Label>
            <Select
              value={formData.energy}
              onValueChange={(value) =>
                setFormData({ ...formData, energy: value })
              }
            >
              <SelectContent>
                {getEnergyOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Goal Selection for Projects */}
          {eventType === "PROJECT" && (
            <div className="space-y-2">
              <Label htmlFor="goal" className="text-white text-sm font-medium">
                Goal <span className="text-red-400">*</span>
              </Label>
              <Select
                value={formData.goal_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, goal_id: value })
                }
              >
                <SelectContent>
                  {goals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {goals.length === 0 && (
                <p className="text-sm text-gray-400">
                  No goals yet. Create a goal first to add projects.
                </p>
              )}
            </div>
          )}

          {/* Goal and Project Selection for Tasks */}
          {eventType === "TASK" && (
            <>
              <div className="space-y-2">
                <Label
                  htmlFor="goal"
                  className="text-white text-sm font-medium"
                >
                  Goal (for filtering)
                </Label>
                <Select
                  value={formData.goal_id}
                  onValueChange={handleGoalChange}
                >
                  <SelectContent>
                    <SelectItem value="">All Goals</SelectItem>
                    {goals.map((goal) => (
                      <SelectItem key={goal.id} value={goal.id}>
                        {goal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="project"
                  className="text-white text-sm font-medium"
                >
                  Project <span className="text-red-400">*</span>
                </Label>
                <Select
                  value={formData.project_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, project_id: value })
                  }
                >
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {projects.length === 0 && (
                  <p className="text-sm text-gray-400">
                    {formData.goal_id
                      ? "No projects under this goal yet."
                      : "Select a goal to see available projects."}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Project Stage */}
          {eventType === "PROJECT" && (
            <div className="space-y-4">
              <Label htmlFor="stage" className="text-white text-lg font-medium">
                Stage
              </Label>
              <Select
                value={formData.stage}
                onValueChange={(value) =>
                  setFormData({ ...formData, stage: value })
                }
              >
                <SelectContent>
                  {getProjectStageOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Task Stage */}
          {eventType === "TASK" && (
            <div className="space-y-4">
              <Label htmlFor="stage" className="text-white text-lg font-medium">
                Stage
              </Label>
              <Select
                value={formData.stage}
                onValueChange={(value) =>
                  setFormData({ ...formData, stage: value })
                }
              >
                <SelectContent>
                  {getTaskStageOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Habit Type */}
          {eventType === "HABIT" && (
            <div className="space-y-4">
              <Label htmlFor="type" className="text-white text-lg font-medium">
                Type
              </Label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectContent>
                  {getHabitTypeOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Habit Recurrence */}
          {eventType === "HABIT" && (
            <div className="space-y-4">
              <Label
                htmlFor="recurrence"
                className="text-white text-lg font-medium"
              >
                Recurrence
              </Label>
              <Select
                value={formData.recurrence}
                onValueChange={(value) =>
                  setFormData({ ...formData, recurrence: value })
                }
              >
                <SelectContent>
                  {getRecurrenceOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4 pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-gray-800 border-gray-600 text-white hover:bg-gray-700 h-10 text-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                !formData.name.trim() ||
                (eventType === "PROJECT" && !formData.goal_id) ||
                (eventType === "TASK" && !formData.project_id)
              }
              className="flex-1 bg-blue-600 hover:bg-blue-700 h-10 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating..." : `Create ${eventType}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
