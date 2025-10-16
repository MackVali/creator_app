"use client";

import { useMemo, type ReactNode } from "react";
import {
  Check,
  GraduationCap,
  Moon,
  Sparkles,
  TimerReset,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SkillRow } from "@/lib/types/skill";
import type { Monument } from "@/lib/queries/monuments";
import type { SchedulerModeType } from "@/lib/scheduler/modes";

const MODE_OPTIONS: Array<{
  type: SchedulerModeType;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    type: "REGULAR",
    label: "Regular",
    description: "Schedule with your current priorities.",
    icon: <Sparkles className="h-4 w-4" />, 
  },
  {
    type: "RUSH",
    label: "Rush",
    description: "Trim durations to move faster.",
    icon: <TimerReset className="h-4 w-4" />,
  },
  {
    type: "MONUMENTAL",
    label: "Monumental",
    description: "Focus work tied to a specific monument.",
    icon: <Trophy className="h-4 w-4" />,
  },
  {
    type: "SKILLED",
    label: "Skilled",
    description: "Limit work to selected skills.",
    icon: <GraduationCap className="h-4 w-4" />,
  },
  {
    type: "REST",
    label: "Rest",
    description: "Keep today light with low-energy windows.",
    icon: <Moon className="h-4 w-4" />,
  },
];

interface SchedulerModeSheetProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  modeType: SchedulerModeType;
  onModeTypeChange: (type: SchedulerModeType) => void;
  monumentId: string | null;
  onMonumentChange: (id: string | null) => void;
  skillIds: string[];
  onSkillToggle: (id: string) => void;
  onClearSkills: () => void;
  monuments: Monument[];
  skills: SkillRow[];
}

export function SchedulerModeSheet({
  open,
  onOpenChange,
  modeType,
  onModeTypeChange,
  monumentId,
  onMonumentChange,
  skillIds,
  onSkillToggle,
  onClearSkills,
  monuments,
  skills,
}: SchedulerModeSheetProps) {
  const selectedSkills = useMemo(() => new Set(skillIds), [skillIds]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-[var(--surface-elevated)] sm:max-w-lg">
        <SheetHeader className="gap-1">
          <SheetTitle className="text-lg font-semibold text-zinc-100">
            Scheduler modes
          </SheetTitle>
          <SheetDescription className="text-sm text-zinc-400">
            Choose how the scheduler should approach your plan for today.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-8">
          <div className="grid gap-2">
            {MODE_OPTIONS.map(option => (
              <button
                key={option.type}
                type="button"
                onClick={() => onModeTypeChange(option.type)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/10",
                  modeType === option.type &&
                    "border-[var(--accent-red)] bg-[var(--accent-red)]/15 text-zinc-50"
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[var(--accent-red)]">
                  {option.icon}
                </span>
                <span className="flex flex-col">
                  <span className="font-semibold">{option.label}</span>
                  <span className="text-xs text-zinc-400">{option.description}</span>
                </span>
              </button>
            ))}
          </div>

          {modeType === "MONUMENTAL" && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-zinc-200">Focus monument</p>
                <p className="text-xs text-zinc-400">
                  Only projects connected to this monument will be scheduled today.
                </p>
              </div>
              {monuments.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 bg-white/5 p-3 text-sm text-zinc-400">
                  Create a monument to enable this mode.
                </p>
              ) : (
                <Select
                  value={monumentId ?? ""}
                  onValueChange={value => onMonumentChange(value || null)}
                  placeholder="Choose a monument"
                  triggerClassName="h-12 rounded-xl border-white/10 bg-white/5 text-sm text-zinc-100"
                >
                  <SelectContent>
                    {monuments.map(monument => (
                      <SelectItem key={monument.id} value={monument.id} label={monument.title}>
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{monument.emoji ?? "🗿"}</span>
                          <span className="text-sm text-zinc-100">{monument.title}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {modeType === "SKILLED" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">Focus skills</p>
                  <p className="text-xs text-zinc-400">
                    Pick one or more skills to limit today's scheduling.
                  </p>
                </div>
                {skillIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={onClearSkills}
                    className="text-xs font-semibold text-[var(--accent-red)] hover:text-[var(--accent-red)]/80"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {skills.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 bg-white/5 p-3 text-sm text-zinc-400">
                  Link skills to your work to enable this mode.
                </p>
              ) : (
                <ScrollArea className="max-h-56 rounded-xl border border-white/10 bg-white/5 p-2">
                  <div className="grid gap-2">
                    {skills.map(skill => {
                      const selected = selectedSkills.has(skill.id);
                      const icon = skill.icon?.trim() ?? "🎯";
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => onSkillToggle(skill.id)}
                          className={cn(
                            "flex items-center justify-between rounded-lg border border-transparent bg-transparent px-3 py-2 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/10",
                            selected && "border-[var(--accent-red)] bg-[var(--accent-red)]/15 text-zinc-50"
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-lg">
                              {icon}
                            </span>
                            <span>{skill.name}</span>
                          </span>
                          {selected ? <Check className="h-4 w-4 text-[var(--accent-red)]" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
