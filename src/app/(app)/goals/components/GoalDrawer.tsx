"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Goal } from "../types";

interface GoalDrawerProps {
  open: boolean;
  onClose(): void;
  /** Callback when creating a new goal */
  onAdd(goal: Goal): void;
  /** Existing goal to edit */
  initialGoal?: Goal | null;
  /** Callback when updating an existing goal */
  onUpdate?(goal: Goal): void;
  monuments?: { id: string; title: string }[];
}

const PRIORITY_OPTIONS: {
  value: Goal["priority"];
  label: string;
  description: string;
}[] = [
  {
    value: "Low",
    label: "Low",
    description: "A gentle intention you can ease into.",
  },
  {
    value: "Medium",
    label: "Medium",
    description: "Important, but with space to breathe.",
  },
  {
    value: "High",
    label: "High",
    description: "Make room and rally your focus here.",
  },
];

const ENERGY_OPTIONS: {
  value: Goal["energy"];
  label: string;
  accent: string;
}[] = [
  { value: "No", label: "No", accent: "bg-white/10" },
  { value: "Low", label: "Low", accent: "from-emerald-400/30 to-teal-500/20" },
  {
    value: "Medium",
    label: "Medium",
    accent: "from-sky-400/30 to-indigo-500/20",
  },
  { value: "High", label: "High", accent: "from-indigo-500/30 to-violet-500/20" },
  { value: "Ultra", label: "Ultra", accent: "from-fuchsia-500/30 to-rose-500/20" },
  {
    value: "Extreme",
    label: "Extreme",
    accent: "from-orange-500/30 to-amber-500/20",
  },
];

export function GoalDrawer({
  open,
  onClose,
  onAdd,
  initialGoal,
  onUpdate,
  monuments = [],
}: GoalDrawerProps) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [priority, setPriority] = useState<Goal["priority"]>("Low");
  const [energy, setEnergy] = useState<Goal["energy"]>("No");
  const [active, setActive] = useState(true);
  const [why, setWhy] = useState("");
  const [monumentId, setMonumentId] = useState<string>("");

  const editing = Boolean(initialGoal);

  useEffect(() => {
    if (initialGoal) {
      setTitle(initialGoal.title);
      setEmoji(initialGoal.emoji || "");
      setPriority(initialGoal.priority);
      setEnergy(initialGoal.energy);
      setActive(initialGoal.active ?? true);
      setWhy(initialGoal.why || "");
      setMonumentId(initialGoal.monumentId || "");
    } else {
      setTitle("");
      setEmoji("");
      setPriority("Low");
      setEnergy("No");
      setActive(true);
      setWhy("");
      setMonumentId("");
    }
  }, [initialGoal, open]);

  const monumentOptions = useMemo(() => {
    if (!monuments.length) return [] as { id: string; title: string }[];
    return [...monuments].sort((a, b) => a.title.localeCompare(b.title));
  }, [monuments]);

  const canSubmit = title.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const preservedStatus = initialGoal?.status ?? "Active";
    const computedStatus = active
      ? preservedStatus === "Inactive"
        ? "Active"
        : preservedStatus
      : "Inactive";
    const computedActive = computedStatus !== "Inactive";
    const nextGoal: Goal = {
      id: initialGoal?.id || Date.now().toString(),
      title: title.trim(),
      emoji: emoji.trim() || undefined,
      dueDate: initialGoal?.dueDate,
      priority,
      energy,
      progress: initialGoal?.progress ?? 0,
      status: computedStatus,
      active: computedActive,
      updatedAt: new Date().toISOString(),
      projects: initialGoal?.projects ?? [],
      monumentId: monumentId || null,
      skills: initialGoal?.skills,
      weight: initialGoal?.weight,
      why: why.trim() ? why.trim() : undefined,
    };

    if (editing && onUpdate) {
      onUpdate(nextGoal);
    } else {
      onAdd(nextGoal);
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="border-l border-white/10 bg-[#060911]/95 text-white shadow-[0_40px_120px_-60px_rgba(99,102,241,0.65)] sm:max-w-xl"
      >
        <SheetHeader className="px-6 pt-8">
          <SheetTitle className="text-left text-2xl font-semibold tracking-tight text-white">
            {editing ? "Edit goal" : "Create a goal"}
          </SheetTitle>
          <SheetDescription className="text-left text-sm text-white/60">
            Shape the focus, energy, and storyline for this goal. Everything you
            update is saved instantly once you hit save.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="flex h-full flex-col">
          <div className="flex-1 space-y-8 overflow-y-auto px-6 pb-8 pt-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="grid grid-cols-[90px,1fr] gap-4">
                <div className="space-y-2">
                  <Label htmlFor="goal-emoji" className="text-white/70">
                    Emoji
                  </Label>
                  <Input
                    id="goal-emoji"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    maxLength={2}
                    placeholder="✨"
                    className="h-12 rounded-xl border-white/10 bg-white/[0.04] text-center text-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal-title" className="text-white/70">
                    Title<span className="text-rose-300"> *</span>
                  </Label>
                  <Input
                    id="goal-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="Name the ambition..."
                    className="h-12 rounded-xl border-white/10 bg-white/[0.04] text-base"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white/70">Monument link</Label>
                <Select
                  value={monumentId}
                  onValueChange={(value) => setMonumentId(value)}
                  placeholder="Not linked"
                  className="w-full"
                  triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.04]"
                >
                  <SelectContent>
                    <SelectItem value="" label="Not linked">
                      <span className="text-sm text-white/70">Not linked</span>
                    </SelectItem>
                    {monumentOptions.map((monument) => (
                      <SelectItem key={monument.id} value={monument.id}>
                        {monument.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-white/70">Priority</Label>
                <div className="grid gap-3 md:grid-cols-3">
                  {PRIORITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPriority(option.value)}
                      className={cn(
                        "rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition",
                        "hover:border-indigo-400/60 hover:bg-indigo-500/10",
                        priority === option.value &&
                          "border-indigo-400/60 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]"
                      )}
                    >
                      <div className="text-sm font-semibold text-white">
                        {option.label}
                      </div>
                      <p className="mt-1 text-xs text-white/60">
                        {option.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-white/70">Energy required</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ENERGY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEnergy(option.value)}
                      className={cn(
                        "rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm transition",
                        "hover:border-sky-400/50 hover:bg-sky-500/10",
                        energy === option.value &&
                          "border-sky-400/70 bg-gradient-to-r text-white",
                        energy === option.value && option.accent
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-white">Goal visibility</p>
                  <p className="text-xs text-white/60">
                    Inactive goals tuck themselves away from your main lists.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={active ? "default" : "outline"}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide",
                    active ? "bg-emerald-500 text-black" : "text-white/80"
                  )}
                  onClick={() => setActive((prev) => !prev)}
                >
                  {active ? "Active" : "Inactive"}
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-why" className="text-white/70">
                  Why?
                </Label>
                <Textarea
                  id="goal-why"
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  placeholder="Capture the purpose or narrative behind this goal."
                  className="min-h-[120px] rounded-xl border-white/10 bg-white/[0.04] text-sm"
                />
              </div>
            </div>
          </div>
          <SheetFooter className="border-t border-white/10 bg-[#05070c]/60">
            <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="justify-start text-white/70 hover:text-white"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit} className="w-full sm:w-auto">
                {editing ? "Save changes" : "Create goal"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
