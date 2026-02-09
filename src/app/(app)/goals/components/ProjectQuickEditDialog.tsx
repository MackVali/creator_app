"use client";

import type React from "react";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { getSupabaseBrowser } from "@/lib/supabase";
import { recordProjectCompletion } from "@/lib/projects/projectCompletion";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { getCatsForUser } from "@/lib/data/cats";
import type { Project } from "../types";
import type { CatRow } from "@/lib/types/cat";
import type { ProjectCardMorphOrigin } from "./ProjectRow";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";

type ProjectQuickEditDialogProps = {
  project: Project | null;
  goalId?: string;
  origin?: ProjectCardMorphOrigin | null;
  onClose: () => void;
  onUpdated?: (projectId: string, updates: Partial<Project>) => void;
  onDeleted?: (projectId: string) => void;
};

const ENERGY_OPTIONS: { value: Project["energy"]; label: string }[] = [
  { value: "No", label: "No" },
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Ultra", label: "Ultra" },
  { value: "Extreme", label: "Extreme" },
];

const FLAME_LEVELS: FlameLevel[] = [
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "ULTRA",
  "EXTREME",
];

type EnergySelectOption = {
  id: string;
  code: string;
  label: string;
  level: FlameLevel;
};

const flameLevelFromCode = (value?: string | null): FlameLevel => {
  if (!value) {
    return "NO";
  }
  const normalized = value.toUpperCase();
  const candidate = normalized as FlameLevel;
  return FLAME_LEVELS.includes(candidate) ? candidate : "NO";
};

const PRIORITY_OPTIONS = [
  { value: "NO", label: "None" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
  { value: "ULTRA-CRITICAL", label: "Ultra" },
];

const STAGE_OPTIONS = [
  { value: "RESEARCH", label: "Research" },
  { value: "TEST", label: "Test" },
  { value: "BUILD", label: "Build" },
  { value: "REFINE", label: "Refine" },
  { value: "RELEASE", label: "Release" },
];

const DEFAULT_STAGE = "BUILD";

const UNCATEGORIZED_GROUP_ID = "__uncategorized__";
const UNCATEGORIZED_GROUP_LABEL = "Uncategorized";

const toDateInputValue = (iso?: string | null) => {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const fromDateInputValue = (value: string): string | null => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const projectStageToStatus = (stage: string): Project["status"] => {
  switch (stage) {
    case "RESEARCH":
      return "Todo";
    case "RELEASE":
      return "Done";
    default:
      return "In-Progress";
  }
};

const energyToDbValue = (energy: Project["energy"]): string => {
  switch (energy) {
    case "Extreme":
      return "EXTREME";
    case "Ultra":
      return "ULTRA";
    case "High":
      return "HIGH";
    case "Medium":
      return "MEDIUM";
    case "Low":
      return "LOW";
    default:
      return "NO";
  }
};

const formatEnergyLabel = (code: string): Project["energy"] => {
  switch (code) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    case "ULTRA":
      return "Ultra";
    case "EXTREME":
      return "Extreme";
    default:
      return "No";
  }
};

export function ProjectQuickEditDialog({
  project,
  goalId,
  origin,
  onClose,
  onUpdated,
  onDeleted,
}: ProjectQuickEditDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [stage, setStage] = useState(DEFAULT_STAGE);
  const [energy, setEnergy] = useState<Project["energy"]>("No");
  const [priority, setPriority] = useState("NO");
  const [durationInput, setDurationInput] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [initialSkillId, setInitialSkillId] = useState<string | null>(null);
  const [dueDateInput, setDueDateInput] = useState("");
  const [skillOptions, setSkillOptions] = useState<Skill[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [morphReady, setMorphReady] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setStage(project.stage ?? DEFAULT_STAGE);
    setEnergy(project.energy ?? "No");
    setPriority(project.priorityCode ?? "NO");
    setDurationInput(
      project.durationMinutes && Number.isFinite(project.durationMinutes)
        ? String(project.durationMinutes)
        : ""
    );
    setDueDateInput(toDateInputValue(project.dueDate));
    const primarySkill = project.skillIds?.[0] ?? null;
    setSelectedSkillId(primarySkill);
    setInitialSkillId(primarySkill);
    setSkillSearch("");
  }, [project]);

  useEffect(() => {
    if (!project) return;
    const { body } = document;
    const original = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = original;
    };
  }, [project]);

  const supabase = getSupabaseBrowser();
  const isBusy = saving || deleting;

  const filteredSkills = useMemo(() => {
    if (!skillSearch.trim()) return skillOptions;
    const query = skillSearch.trim().toLowerCase();
    return skillOptions.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        (skill.icon ?? "").toLowerCase().includes(query)
    );
  }, [skillOptions, skillSearch]);

  type SkillGroup = {
    id: string;
    label: string;
    skills: Skill[];
  };

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    skillCategories.forEach((category) => {
      map.set(category.id, category.name?.trim() ?? "");
    });
    return map;
  }, [skillCategories]);

  const groupedSkills = useMemo(() => {
    if (filteredSkills.length === 0) {
      return [];
    }

    const groups = new Map<string, SkillGroup>();
    filteredSkills.forEach((skill) => {
      const groupId = skill.cat_id ?? UNCATEGORIZED_GROUP_ID;
      const label =
        groupId === UNCATEGORIZED_GROUP_ID
          ? UNCATEGORIZED_GROUP_LABEL
          : categoryLookup.get(groupId) || UNCATEGORIZED_GROUP_LABEL;
      const existing = groups.get(groupId);
      if (existing) {
        existing.skills.push(skill);
      } else {
        groups.set(groupId, { id: groupId, label, skills: [skill] });
      }
    });

    const ordered: SkillGroup[] = [];

    skillCategories.forEach((category) => {
      const group = groups.get(category.id);
      if (group) {
        group.label = category.name?.trim() || group.label;
        ordered.push(group);
        groups.delete(category.id);
      }
    });

    const uncategorizedGroup = groups.get(UNCATEGORIZED_GROUP_ID);
    if (uncategorizedGroup) {
      ordered.push(uncategorizedGroup);
      groups.delete(UNCATEGORIZED_GROUP_ID);
    }

    for (const group of groups.values()) {
      ordered.push(group);
    }

    return ordered;
  }, [filteredSkills, skillCategories, categoryLookup]);

  const prioritySelectOptions = useMemo(
    () =>
      PRIORITY_OPTIONS.map((option) => ({
        id: option.value,
        code: option.value,
        label: option.label,
      })),
    []
  );

  const energySelectOptions = useMemo<EnergySelectOption[]>(
    () =>
      ENERGY_OPTIONS.map((option) => {
        const code = energyToDbValue(option.value);
        return {
          id: option.value,
          code,
          label: option.label,
          level: flameLevelFromCode(code),
        };
      }),
    []
  );

  useEffect(() => {
    let active = true;
    const loadSkills = async () => {
      try {
        const client = getSupabaseBrowser();
        if (!client) return;
        const {
          data: { user },
        } = await client.auth.getUser();
        if (!user) return;
        const [skillsData, categoriesData] = await Promise.all([
          getSkillsForUser(user.id),
          getCatsForUser(user.id, client),
        ]);
        if (!active) return;
        setSkillOptions(skillsData);
        setSkillCategories(categoriesData);
      } catch (err) {
        console.error("Failed to load skill options", err);
        if (active) {
          setSkillOptions([]);
          setSkillCategories([]);
        }
      }
    };
    if (project) {
      loadSkills();
    }
    return () => {
      active = false;
    };
  }, [project]);

  useLayoutEffect(() => {
    if (project && origin) {
      setMorphReady(false);
      const frame = requestAnimationFrame(() => {
        setMorphReady(true);
      });
      return () => cancelAnimationFrame(frame);
    }
    setMorphReady(true);
  }, [project, origin]);

  const displayStage = useMemo(() => stage ?? DEFAULT_STAGE, [stage]);

  if (!project || typeof document === "undefined" || !mounted) {
    return null;
  }

  const morphing = Boolean(project && origin);
  const finalWidth = "min(420px, calc(100vw - 32px))";
  const finalHeight = "min(520px, calc(100vh - 64px))";
  const finalStyle = {
    left: "50%",
    top: "50%",
    width: finalWidth,
    height: finalHeight,
    transform: "translate(-50%, -50%)",
    borderRadius: "24px",
  };
  const initialStyle =
    origin && project
      ? {
          left: `${origin.x}px`,
          top: `${origin.y}px`,
          width: `${origin.width}px`,
          height: `${origin.height}px`,
          transform: "translate(0px, 0px)",
          borderRadius: origin.borderRadius ?? "16px",
        }
      : finalStyle;
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 120,
    ...(morphing ? (morphReady ? finalStyle : initialStyle) : finalStyle),
    transition:
      morphing && origin
        ? "left 360ms cubic-bezier(0.4, 0, 0.2, 1), top 360ms cubic-bezier(0.4, 0, 0.2, 1), width 360ms cubic-bezier(0.4, 0, 0.2, 1), height 360ms cubic-bezier(0.4, 0, 0.2, 1), transform 360ms cubic-bezier(0.4, 0, 0.2, 1), border-radius 360ms cubic-bezier(0.4, 0, 0.2, 1)"
        : undefined,
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) return;
    if (!supabase) {
      setError("Supabase client not available.");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Project name cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    const nextStage = displayStage || DEFAULT_STAGE;
    let parsedDuration: number | null = null;
    if (durationInput.trim().length > 0) {
      const numeric = Number(durationInput);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        setError("Duration must be a positive number.");
        return;
      }
      parsedDuration = Math.max(1, Math.round(numeric));
    }
    const energyCode = energyToDbValue(energy);
    const priorityCode = priority;
    const dueDateValue = fromDateInputValue(dueDateInput);
    const isNewProject = Boolean(project.isNew);
    let projectId = project.id;
    if (isNewProject) {
      if (!goalId) {
        setError("Unable to create this project yet. Try again.");
        setSaving(false);
        return;
      }
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        setError("Unable to resolve user for this project.");
        setSaving(false);
        return;
      }
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: trimmed,
          goal_id: goalId,
          user_id: user.id,
          stage: nextStage,
          energy: energyCode,
          priority: priorityCode,
          duration_min: parsedDuration,
          due_date: dueDateValue,
        })
        .select("id")
        .single();
      if (error || !data) {
        setError("Failed to create this project. Try again in a moment.");
        setSaving(false);
        return;
      }
      projectId = data.id;
    } else {
      const { error: updateError } = await supabase
        .from("projects")
        .update({
          name: trimmed,
          stage: nextStage,
          energy: energyCode,
          priority: priorityCode,
          duration_min: parsedDuration,
          due_date: dueDateValue,
        })
        .eq("id", project.id);
      if (updateError) {
        setError("Failed to update this project. Try again in a moment.");
        setSaving(false);
        return;
      }
    }
    let nextEmoji = project.emoji ?? null;
    if (selectedSkillId !== initialSkillId) {
      try {
        await supabase
          .from("project_skills")
          .delete()
          .eq("project_id", projectId);
        if (selectedSkillId) {
          await supabase
            .from("project_skills")
            .insert({ project_id: projectId, skill_id: selectedSkillId });
          const selectedSkill = skillOptions.find(
            (skill) => skill.id === selectedSkillId
          );
          if (selectedSkill?.icon) {
            nextEmoji = selectedSkill.icon;
          }
        }
      } catch (skillErr) {
        console.error("Failed to update project skill relation", skillErr);
      }
    }
    onUpdated?.(projectId, {
      name: trimmed,
      stage: nextStage,
      status: projectStageToStatus(nextStage),
      energy,
      energyCode,
      priorityCode,
      durationMinutes: parsedDuration,
      skillIds: selectedSkillId ? [selectedSkillId] : [],
      emoji: nextEmoji,
      dueDate: dueDateValue ?? undefined,
    });
    if (projectId) {
      const wasRelease = !isNewProject && project.stage === "RELEASE";
      const isRelease = nextStage === "RELEASE";
      if (!wasRelease && isRelease) {
        void recordProjectCompletion(
          {
            projectId,
            projectSkillIds: isNewProject ? [] : project.skillIds,
            taskSkillIds: (project.tasks ?? []).map((task) => task.skillId),
          },
          "complete"
        );
      } else if (wasRelease && !isRelease) {
        void recordProjectCompletion(
          {
            projectId,
            projectSkillIds: project.skillIds,
            taskSkillIds: (project.tasks ?? []).map((task) => task.skillId),
          },
          "undo"
        );
      }
    }
    setSaving(false);
    onClose();
  };

  const handleDelete = () => {
    if (deleting || !project) return;
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    console.log("[CONFIRM DELETE] handler fired", {
      deleting,
      hasProject: !!project,
      hasSupabase: !!supabase,
    });
    if (deleting || !project) return;
    if (!supabase) {
      setError("Supabase client not available.");
      return;
    }
    setError(null);
    setDeleting(true);
    let succeeded = false;
    try {
      console.log("[CONFIRM DELETE] starting delete");
      console.log("[CONFIRM DELETE] deleting project_skills");
      const { error: skillError } = await supabase
        .from("project_skills")
        .delete()
        .eq("project_id", project.id);
      if (skillError) {
        throw skillError;
      }
      console.log("[CONFIRM DELETE] deleting tasks");
      const { error: taskError } = await supabase
        .from("tasks")
        .delete()
        .eq("project_id", project.id);
      if (taskError) {
        throw taskError;
      }
      console.log("[CONFIRM DELETE] deleting project");
      const { error: deleteError } = await supabase
        .from("projects")
        .delete()
        .eq("id", project.id);
      if (deleteError) {
        throw deleteError;
      }
      console.log("[CONFIRM DELETE] success");
      onDeleted?.(project.id);
      succeeded = true;
      setDeleting(false);
      onClose();
    } catch (err) {
      console.log("[CONFIRM DELETE] error", err);
      console.error("Failed to delete project", err);
      setError("Failed to delete this project. Try again in a moment.");
    } finally {
      if (!succeeded) {
        setDeleting(false);
      }
    }
  };

  return createPortal(
    <AnimatePresence>
      {project ? (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 z-[110] bg-black/70"
            onClick={onClose}
            aria-label="Close project editor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
          />
          <motion.div className="fixed inset-0 z-[120] pointer-events-none">
            <motion.div
              ref={contentRef}
              className="pointer-events-auto flex h-full w-full flex-col rounded-2xl border border-white/10 bg-black text-white shadow-[0_35px_45px_-30px_rgba(0,0,0,0.85)]"
              style={panelStyle}
              initial={origin ? { ...initialStyle } : undefined}
              animate={origin ? { ...finalStyle } : undefined}
              exit={origin ? { ...initialStyle } : undefined}
              transition={{ duration: 0.36, ease: [0.33, 1, 0.68, 1] }}
            >
              <form
                onSubmit={handleSubmit}
                className="flex h-full flex-col gap-4 overflow-hidden"
              >
                <div
                  className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
                  onTouchStart={() =>
                    console.log("[SCROLL CONTAINER] touchstart")
                  }
                  onTouchMove={() =>
                    console.log("[SCROLL CONTAINER] touchmove")
                  }
                  onTouchEnd={() => console.log("[SCROLL CONTAINER] touchend")}
                >
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      Project
                    </p>
                    <h3 className="text-lg font-semibold text-white">
                      {project.name}
                    </h3>
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="project-name"
                      className="text-xs uppercase tracking-[0.24em] text-white/70"
                    >
                      Name
                    </Label>
                    <Input
                      id="project-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="h-11 rounded-xl border-white/10 bg-white/[0.04] text-sm"
                      placeholder="Update project name"
                      disabled={isBusy}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.24em] text-white/70">
                        Stage
                      </Label>
                      <Select
                        value={displayStage}
                        onValueChange={setStage}
                        triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.04] text-left text-sm"
                      >
                        <SelectContent className="bg-black text-sm text-white">
                          {STAGE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.24em] text-white/70">
                        Energy
                      </Label>
                      <Select
                        value={energy}
                        onValueChange={(value) =>
                          setEnergy(value as Project["energy"])
                        }
                        triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.04] text-left text-sm"
                      >
                        <SelectContent className="bg-black text-sm text-white">
                          {energySelectOptions.map((option) => (
                            <SelectItem
                              key={option.id}
                              value={option.label}
                              className="text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <FlameEmber level={option.level} size="xs" />
                                <span className="text-xs">{option.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.24em] text-white/70">
                        Priority
                      </Label>
                      <Select
                        value={priority}
                        onValueChange={setPriority}
                        triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.04] text-left text-sm"
                      >
                        <SelectContent className="bg-black text-sm text-white">
                          {prioritySelectOptions.map((option) => (
                            <SelectItem key={option.id} value={option.code}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.24em] text-white/70">
                        Duration (min)
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={durationInput}
                        onChange={(event) =>
                          setDurationInput(event.target.value)
                        }
                        className="h-11 rounded-xl border-white/10 bg-white/[0.04] text-sm"
                        placeholder="e.g. 60"
                        disabled={isBusy}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.24em] text-white/70">
                      Due date
                    </Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        type="date"
                        value={dueDateInput}
                        onChange={(event) =>
                          setDueDateInput(event.target.value)
                        }
                        className="h-11 rounded-xl border-white/10 bg-white/[0.04] text-sm text-white sm:flex-1"
                        disabled={isBusy}
                      />
                      {dueDateInput ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 rounded-xl border border-white/10 bg-white/[0.02] px-4 text-xs text-white/70 hover:text-white"
                          onClick={() => setDueDateInput("")}
                          disabled={isBusy}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-white/50">
                      Projects with due dates climb the schedule as the deadline
                      approaches.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.24em] text-white/70">
                      Skill relation
                    </Label>
                    <Select
                      value={selectedSkillId ?? "none"}
                      onValueChange={(value) =>
                        setSelectedSkillId(value === "none" ? null : value)
                      }
                      triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.04] text-left text-sm"
                    >
                      <SelectContent className="bg-black text-sm text-white">
                        <div className="p-2">
                          <Input
                            value={skillSearch}
                            onChange={(event) =>
                              setSkillSearch(event.target.value)
                            }
                            placeholder="Search skills…"
                            className="h-9 rounded-lg border-white/10 bg-white/10 text-xs"
                            onKeyDown={(event) => event.stopPropagation()}
                          />
                        </div>
                        <SelectItem value="none">No linked skill</SelectItem>
                        {filteredSkills.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-white/60">
                            No skills match your search.
                          </div>
                        ) : (
                          groupedSkills.map((group) => (
                            <Fragment key={group.id}>
                              <div className="px-3 pt-2">
                                <p className="text-[11px] uppercase tracking-[0.3em] text-white/60">
                                  {group.label}
                                </p>
                              </div>
                              {group.skills.map((skill) => (
                                <SelectItem
                                  key={skill.id}
                                  value={skill.id}
                                  className="px-3 text-sm"
                                >
                                  {skill.icon ? `${skill.icon} ` : ""}
                                  {skill.name}
                                </SelectItem>
                              ))}
                            </Fragment>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.24em] text-white/70">
                      Status
                    </Label>
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/70">
                      {projectStageToStatus(displayStage)}
                    </div>
                  </div>
                  {error && <p className="text-sm text-rose-400">{error}</p>}
                </div>
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
                    <div className="flex-1 space-y-2">
                      <h4 className="text-sm font-semibold text-white">
                        Delete Project
                      </h4>
                      <p className="text-sm text-white/70">
                        This cannot be undone.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deleting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="flex-1"
                      onClick={handleConfirmDelete}
                      disabled={deleting}
                    >
                      {deleting ? "Deleting..." : "Delete Project"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-sm text-rose-400 hover:text-rose-200"
                      onClick={handleDelete}
                      disabled={isBusy}
                    >
                      Delete project
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-sm text-white/70 hover:text-white"
                      onClick={onClose}
                      disabled={isBusy}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-full px-5 text-sm"
                      disabled={isBusy}
                    >
                      {saving ? "Saving..." : "Save changes"}
                    </Button>
                  </div>
                )}
              </form>
            </motion.div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
