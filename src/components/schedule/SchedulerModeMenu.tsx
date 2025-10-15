"use client";

import { useMemo } from "react";
import { Wand2, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  SCHEDULER_MODE_OPTIONS,
  modeRequiresMonument,
  modeRequiresSkills,
  type SchedulerMode,
} from "@/lib/scheduler/modes";
import type { Monument } from "@/lib/queries/monuments";
import type { SkillRow } from "@/lib/types/skill";

export interface SchedulerModeMenuProps {
  triggerClassName?: string;
  mode: SchedulerMode;
  onModeChange: (mode: SchedulerMode) => void;
  monuments: Monument[];
  selectedMonumentId: string;
  onMonumentChange: (monumentId: string) => void;
  isLoadingMonuments?: boolean;
  skills: SkillRow[];
  selectedSkillIds: string[];
  onSkillToggle: (skillId: string, checked: boolean) => void;
  onClearSkills?: () => void;
  isLoadingSkills?: boolean;
}

export function SchedulerModeMenu({
  triggerClassName = "",
  mode,
  onModeChange,
  monuments,
  selectedMonumentId,
  onMonumentChange,
  isLoadingMonuments = false,
  skills,
  selectedSkillIds,
  onSkillToggle,
  onClearSkills,
  isLoadingSkills = false,
}: SchedulerModeMenuProps) {
  const activeMode = useMemo(
    () => SCHEDULER_MODE_OPTIONS.find(option => option.value === mode),
    [mode],
  );
  const requiresMonument = modeRequiresMonument(mode);
  const requiresSkills = modeRequiresSkills(mode);
  const hasMonumentSelection =
    !requiresMonument || selectedMonumentId.trim().length > 0;
  const hasSkillSelection =
    !requiresSkills || selectedSkillIds.length > 0;
  const isLoadingRequirements = isLoadingMonuments || isLoadingSkills;
  const monument = useMemo(
    () => monuments.find(item => item.id === selectedMonumentId) ?? null,
    [monuments, selectedMonumentId],
  );
  const summaryParts = useMemo(() => {
    const parts: string[] = [];
    if (monument) {
      const emoji = monument.emoji ?? "🏛️";
      parts.push(`${emoji} ${monument.title}`);
    }
    if (selectedSkillIds.length > 0) {
      const label = selectedSkillIds.length === 1 ? "skill" : "skills";
      parts.push(`${selectedSkillIds.length} ${label}`);
    }
    return parts;
  }, [monument, selectedSkillIds.length]);

  const requirementMessage = !hasMonumentSelection
    ? isLoadingMonuments
      ? "Loading monuments…"
      : monuments.length === 0
        ? "Add a monument to use Monumental mode."
        : "Select a monument to enable Monumental mode."
    : !hasSkillSelection
      ? isLoadingSkills
        ? "Loading skills…"
        : skills.length === 0
          ? "Create a skill to use Skilled mode."
          : "Choose at least one skill to enable Skilled mode."
      : null;

  const triggerClasses = cn(
    triggerClassName,
    requirementMessage && !isLoadingRequirements
      ? "ring-2 ring-amber-400/70 ring-offset-2 ring-offset-[var(--surface-elevated)]"
      : null,
  );

  const triggerLabel = activeMode
    ? `Scheduler mode: ${activeMode.label}`
    : "Scheduler mode";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          className={triggerClasses}
        >
          <Wand2 className="h-5 w-5 text-[var(--accent-red)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 border border-white/10 bg-[var(--surface-elevated)]/95 text-[var(--text-primary)] shadow-xl"
      >
        <div className="px-3 py-2">
          <p className="text-[0.65rem] uppercase tracking-wide text-[var(--accent-red)]/80">
            Scheduler mode
          </p>
          <p className="text-sm font-semibold text-white">
            {activeMode?.label ?? "Regular"}
          </p>
          <p className="text-xs text-white/60">
            {activeMode?.description ?? "Choose how the scheduler should prioritize work."}
          </p>
          {summaryParts.length > 0 && (
            <p className="mt-2 text-xs text-white/50">{summaryParts.join(" • ")}</p>
          )}
        </div>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={value => onModeChange(value as SchedulerMode)}
        >
          {SCHEDULER_MODE_OPTIONS.map(option => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="px-3 py-2 text-sm text-white/90 data-[state=checked]:bg-white/10 data-[state=checked]:text-white"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-white/60">{option.description}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {requiresMonument && (
          <>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuLabel className="text-[0.65rem] uppercase tracking-wide text-white/60">
              Focus monument
            </DropdownMenuLabel>
            {isLoadingMonuments ? (
              <div className="px-3 py-2 text-xs text-white/60">
                Loading monuments…
              </div>
            ) : monuments.length === 0 ? (
              <div className="px-3 py-2 text-xs text-white/60">
                Add a monument to use Monumental mode.
              </div>
            ) : (
              <div className="space-y-1 px-1 py-1">
                <DropdownMenuItem
                  onSelect={event => {
                    event.preventDefault();
                    onMonumentChange("");
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white/70",
                    selectedMonumentId === "" ? "bg-white/10 text-white" : null,
                  )}
                >
                  <span className="text-lg" aria-hidden>
                    ◻️
                  </span>
                  <span className="flex-1">Clear selection</span>
                  {selectedMonumentId === "" && (
                    <Check className="h-4 w-4 text-[var(--accent-red)]" />
                  )}
                </DropdownMenuItem>
                {monuments.map(item => (
                  <DropdownMenuItem
                    key={item.id}
                    onSelect={event => {
                      event.preventDefault();
                      onMonumentChange(item.id);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white/90",
                      selectedMonumentId === item.id ? "bg-white/10 text-white" : null,
                    )}
                  >
                    <span className="text-lg" aria-hidden>
                      {item.emoji ?? "🏛️"}
                    </span>
                    <span className="flex-1 truncate">{item.title}</span>
                    {selectedMonumentId === item.id && (
                      <Check className="h-4 w-4 text-[var(--accent-red)]" />
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            )}
          </>
        )}
        {requiresSkills && (
          <>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuLabel className="text-[0.65rem] uppercase tracking-wide text-white/60">
              Focus skills
            </DropdownMenuLabel>
            {isLoadingSkills ? (
              <div className="px-3 py-2 text-xs text-white/60">Loading skills…</div>
            ) : skills.length === 0 ? (
              <div className="px-3 py-2 text-xs text-white/60">
                Create a skill to use Skilled mode.
              </div>
            ) : (
              <div className="space-y-1 px-1 py-1">
                {skills.map(skill => {
                  const checked = selectedSkillIds.includes(skill.id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={skill.id}
                      checked={checked}
                      onCheckedChange={next => onSkillToggle(skill.id, next === true)}
                      className="gap-3 rounded-md px-2 py-1.5 text-sm text-white/90"
                    >
                      <span className="text-lg" aria-hidden>
                        {skill.icon ?? "🎯"}
                      </span>
                      <span className="flex-1 truncate">{skill.name}</span>
                    </DropdownMenuCheckboxItem>
                  );
                })}
                {selectedSkillIds.length > 0 && onClearSkills && (
                  <DropdownMenuItem
                    onSelect={event => {
                      event.preventDefault();
                      onClearSkills();
                    }}
                    className="gap-2 rounded-md px-2 py-1.5 text-xs text-white/70"
                  >
                    Clear selected skills
                  </DropdownMenuItem>
                )}
              </div>
            )}
          </>
        )}
        {requirementMessage && !isLoadingRequirements && (
          <>
            <DropdownMenuSeparator className="bg-white/10" />
            <div className="px-3 py-2 text-xs text-amber-200/85">
              {requirementMessage}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
