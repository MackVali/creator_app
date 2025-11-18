"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getSkillsForUser } from "@/lib/queries/skills";
import type { Project } from "../types";
import type { ProjectCardMorphOrigin } from "./ProjectRow";

type ProjectQuickEditDialogProps = {
  project: Project | null;
  origin?: ProjectCardMorphOrigin | null;
  onClose: () => void;
  onUpdated?: (projectId: string, updates: Partial<Project>) => void;
};

const ENERGY_OPTIONS: { value: Project["energy"]; label: string }[] = [
  { value: "No", label: "No" },
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Ultra", label: "Ultra" },
  { value: "Extreme", label: "Extreme" },
];

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
  origin,
  onClose,
  onUpdated,
}: ProjectQuickEditDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [stage, setStage] = useState(DEFAULT_STAGE);
  const [energy, setEnergy] = useState<Project["energy"]>("No");
  const [priority, setPriority] = useState("NO");
  const [durationInput, setDurationInput] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [initialSkillId, setInitialSkillId] = useState<string | null>(null);
  const [skillOptions, setSkillOptions] = useState<{ id: string; name: string; icon?: string | null }[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [priorityOptions, setPriorityOptions] = useState<{ id: string | number; name: string }[]>([]);
  const [energyOptions, setEnergyOptions] = useState<{ id: string | number; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [morphReady, setMorphReady] = useState(false);
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

  useEffect(() => {
    let active = true;
    const loadLookups = async () => {
      const client = getSupabaseBrowser();
      if (!client) return;
      try {
        const [priorityRes, energyRes] = await Promise.all([
          client.from("priority").select("id,name"),
          client.from("energy").select("id,name"),
        ]);
        if (!active) return;
        setPriorityOptions(
          (priorityRes.data ?? []).map((row) => ({
            id: row.id,
            name: row.name ?? "",
          }))
        );
        setEnergyOptions(
          (energyRes.data ?? []).map((row) => ({
            id: row.id,
            name: row.name ?? "",
          }))
        );
      } catch (err) {
        console.error("Failed to load priority/energy lookups", err);
      }
    };
    loadLookups();
    return () => {
      active = false;
    };
  }, []);

  const filteredSkills = useMemo(() => {
    if (!skillSearch.trim()) return skillOptions;
    const query = skillSearch.trim().toLowerCase();
    return skillOptions.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        (skill.icon ?? "").toLowerCase().includes(query)
    );
  }, [skillOptions, skillSearch]);

  const prioritySelectOptions = useMemo(() => {
    if (priorityOptions.length > 0) {
      return priorityOptions.map((option) => {
        const code =
          typeof option.name === "string" ? option.name.toUpperCase() : "NO";
        return {
          id: String(option.id),
          code,
          label:
            PRIORITY_OPTIONS.find((opt) => opt.value === code)?.label ??
            code.charAt(0) + code.slice(1).toLowerCase(),
        };
      });
    }
    return PRIORITY_OPTIONS.map((option) => ({
      id: option.value,
      code: option.value,
      label: option.label,
    }));
  }, [priorityOptions]);

  const energySelectOptions = useMemo(() => {
    if (energyOptions.length > 0) {
      return energyOptions.map((option) => {
        const code =
          typeof option.name === "string" ? option.name.toUpperCase() : "NO";
        return {
          id: String(option.id),
          code,
          label: formatEnergyLabel(code),
        };
      });
    }
    return ENERGY_OPTIONS.map((option) => ({
      id: option.value,
      code: option.value,
      label: option.label,
    }));
  }, [energyOptions]);

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
        const skillList = await getSkillsForUser(user.id);
        if (!active) return;
        setSkillOptions(skillList);
      } catch (err) {
        console.error("Failed to load skill options", err);
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
    const energyLookup = energySelectOptions.find(
      (option) => option.code === energyCode
    );
    const priorityLookup = prioritySelectOptions.find(
      (option) => option.code === priority
    );
    const nextEnergyId = energyLookup?.id ?? project.energyId ?? null;
    const nextPriorityId = priorityLookup?.id ?? project.priorityId ?? null;
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        name: trimmed,
        stage: nextStage,
        energy: nextEnergyId,
        priority: nextPriorityId,
        duration_min: parsedDuration,
      })
      .eq("id", project.id);
    if (updateError) {
      setError("Failed to update this project. Try again in a moment.");
      setSaving(false);
      return;
    }
    let nextEmoji = project.emoji ?? null;
    if (selectedSkillId !== initialSkillId) {
      try {
        await supabase.from("project_skills").delete().eq("project_id", project.id);
        if (selectedSkillId) {
          await supabase
            .from("project_skills")
            .insert({ project_id: project.id, skill_id: selectedSkillId });
          const selectedSkill = skillOptions.find((skill) => skill.id === selectedSkillId);
          if (selectedSkill?.icon) {
            nextEmoji = selectedSkill.icon;
          }
        }
      } catch (skillErr) {
        console.error("Failed to update project skill relation", skillErr);
      }
    }
    onUpdated?.(project.id, {
      name: trimmed,
      stage: nextStage,
      status: projectStageToStatus(nextStage),
      energy,
      energyCode,
      energyId: nextEnergyId,
      priorityId: nextPriorityId,
      priorityCode: priority,
      durationMinutes: parsedDuration,
      skillIds: selectedSkillId ? [selectedSkillId] : [],
      emoji: nextEmoji,
    });
    setSaving(false);
    onClose();
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
              className="pointer-events-auto flex h-full w-full flex-col rounded-2xl border border-white/10 bg-[#0b111c] text-white shadow-[0_35px_45px_-30px_rgba(0,0,0,0.85)]"
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
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">Project</p>
                    <h3 className="text-lg font-semibold text-white">{project.name}</h3>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="project-name" className="text-xs uppercase tracking-[0.24em] text-white/70">
                      Name
                    </Label>
                    <Input
                      id="project-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="h-11 rounded-xl border-white/10 bg-white/[0.04] text-sm"
                      placeholder="Update project name"
                      disabled={saving}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.24em] text-white/70">Stage</Label>
                    <Select
                      value={displayStage}
                      onValueChange={setStage}
                      triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.04] text-left text-sm"
                    >
                      <SelectContent className="bg-[#0f172a] text-sm text-white">
                        {STAGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.24em] text-white/70">Energy</Label>
                    <Select
                      value={energy}
                      onValueChange={(value) => setEnergy(value as Project["energy"])}
                      triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.04] text-left text-sm"
                    >
                      <SelectContent className="bg-[#0f172a] text-sm text-white">
                        {energySelectOptions.map((option) => (
                          <SelectItem key={option.id} value={option.label}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.24em] text-white/70">
                      Priority
                    </Label>
                    <Select
                      value={priority}
                      onValueChange={setPriority}
                      triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.04] text-left text-sm"
                    >
                      <SelectContent className="bg-[#0f172a] text-sm text-white">
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
                      onChange={(event) => setDurationInput(event.target.value)}
                      className="h-11 rounded-xl border-white/10 bg-white/[0.04] text-sm"
                      placeholder="e.g. 60"
                      disabled={saving}
                    />
                  </div>
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
                    <SelectContent className="bg-[#0f172a] text-sm text-white">
                      <div className="p-2">
                        <Input
                          value={skillSearch}
                          onChange={(event) => setSkillSearch(event.target.value)}
                          placeholder="Search skills…"
                          className="h-9 rounded-lg border-white/10 bg-white/10 text-xs"
                        />
                      </div>
                      <SelectItem value="none">No linked skill</SelectItem>
                      {filteredSkills.map((skill) => (
                        <SelectItem key={skill.id} value={skill.id}>
                          {skill.icon ? `${skill.icon} ` : ""}
                          {skill.name}
                        </SelectItem>
                      ))}
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
                <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
                  <Button
                    type="button"
                     variant="ghost"
                    className="text-sm text-white/70 hover:text-white"
                    onClick={onClose}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="rounded-full px-5 text-sm" disabled={saving}>
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
