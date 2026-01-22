"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  const [skillSearch, setSkillSearch] = useState("");
  const [isSkillDropdownOpen, setIsSkillDropdownOpen] = useState(false);
  const skillDropdownRef = useRef<HTMLDivElement | null>(null);
  const filteredSkills = useMemo(() => {
    if (!skillSearch.trim()) return skills;
    const term = skillSearch.trim().toLowerCase();
    return skills.filter(skill =>
      skill.name.toLowerCase().includes(term) ||
      (skill.icon ?? "").toLowerCase().includes(term)
    );
  }, [skills, skillSearch]);
  useEffect(() => {
    if (!isSkillDropdownOpen) return;
    const handler = (event: MouseEvent) => {
      if (
        skillDropdownRef.current &&
        event.target instanceof Node &&
        !skillDropdownRef.current.contains(event.target)
      ) {
        setIsSkillDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isSkillDropdownOpen]);
  const selectedSkillSummary = (() => {
    if (skillIds.length === 0) return "Select skills";
    if (skillIds.length === 1) {
      const skill = skills.find(s => s.id === skillIds[0]);
      return skill?.name ?? "1 skill";
    }
    return `${skillIds.length} skills selected`;
  })();
  const selectedOption = MODE_OPTIONS.find(option => option.type === modeType);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="border-0 bg-gradient-to-b from-[#12131B] to-[#0B0B11] p-0 text-zinc-100 shadow-[0_25px_120px_rgba(2,2,16,0.65)] sm:max-w-xl lg:max-w-3xl"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-white/5 px-6 py-5 text-left">
            <SheetTitle className="text-xl font-semibold tracking-tight text-white">
              Scheduler modes
            </SheetTitle>
            <SheetDescription className="text-sm text-zinc-400">
              Fine-tune how the planner prioritizes your work. Monument and skill filters update instantly.
            </SheetDescription>
          </SheetHeader>

          <div className="grid flex-1 min-h-0 gap-6 lg:grid-cols-[minmax(0,260px)_1fr]">
            <ScrollArea className="h-full min-h-0 border-r border-white/5 px-5 py-5">
              <div className="space-y-2">
                {MODE_OPTIONS.map(option => {
                  const isActive = option.type === modeType;
                  return (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => onModeTypeChange(option.type)}
                      className={cn(
                        "group relative flex w-full items-start gap-2 rounded-xl border border-transparent bg-white/5 px-3 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-red)]/50",
                        isActive
                          ? "border-[var(--accent-red)] bg-[var(--accent-red)]/12 text-white shadow-[0_12px_28px_rgba(12,12,40,0.28)]"
                          : "hover:border-white/15 hover:bg-white/10 text-zinc-300"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[var(--accent-red)] transition",
                          isActive && "bg-[var(--accent-red)]/20"
                        )}
                      >
                        {option.icon}
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold">{option.label}</span>
                        <span className="text-[10px] text-zinc-500">{option.description}</span>
                      </span>
                      {isActive ? (
                        <Badge className="absolute right-3 top-2.5 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-white">
                          Active
                        </Badge>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            <ScrollArea className="h-full min-h-0 px-6 py-6">
              <div className="space-y-6">
                {selectedOption ? (
                  <div className="rounded-2xl border border-white/5 bg-white/5 p-5 shadow-[0_25px_45px_rgba(5,6,10,0.45)]">
                    <p className="text-xs uppercase tracking-[0.35em] text-[var(--accent-red)]/80">
                      Current mode
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[var(--accent-red)]">
                        {selectedOption.icon}
                      </span>
                      <div>
                        <p className="text-lg font-semibold text-white">{selectedOption.label}</p>
                        <p className="text-xs text-zinc-400">{selectedOption.description}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {modeType === "MONUMENTAL" && (
                  <div className="space-y-3 rounded-2xl border border-white/5 bg-white/5 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">Focus monument</p>
                      </div>
                      <Badge variant="outline" className="border-white/15 text-[10px] uppercase tracking-wide text-zinc-300">
                        Priority filter
                      </Badge>
                    </div>
                    {monuments.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/20 bg-transparent p-3 text-sm text-zinc-400">
                        Create a monument to enable this mode.
                      </p>
                    ) : (
                      <Select
                        value={monumentId ?? ""}
                        onValueChange={value => onMonumentChange(value || null)}
                        placement="above"
                        maxHeight={320}
                        contentWrapperClassName="max-h-[min(320px,70vh)] overflow-y-auto"
                        placeholder="Choose a monument"
                        triggerClassName="mt-3 h-12 rounded-xl border border-white/15 bg-black/20 text-sm text-zinc-100"
                      >
                        <SelectContent className="max-h-[min(320px,70vh)]">
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
                  <div className="space-y-4 rounded-2xl border border-white/5 bg-white/5 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">Focus skills</p>
                        <p className="text-xs text-zinc-400">
                          Pick one or more skills to limit the project queue.
                        </p>
                      </div>
                      {skillIds.length > 0 ? (
                        <button
                          type="button"
                          onClick={onClearSkills}
                          className="text-xs font-semibold text-[var(--accent-red)] transition hover:text-[var(--accent-red)]/80"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    {skills.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/20 bg-transparent p-3 text-sm text-zinc-400">
                        Link skills to your work to enable this mode.
                      </p>
                    ) : (
                      <div className="space-y-3" ref={skillDropdownRef}>
                        <button
                          type="button"
                          onClick={() => setIsSkillDropdownOpen(value => !value)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-zinc-100 transition",
                            "focus:outline-none focus:ring-2 focus:ring-[var(--accent-red)]/50"
                          )}
                        >
                          <span className="truncate">{selectedSkillSummary}</span>
                          <ChevronDown className={cn("h-4 w-4 transition", isSkillDropdownOpen && "rotate-180")} />
                        </button>
                        {isSkillDropdownOpen && (
                          <div className="relative z-10">
                            <div className="absolute left-0 right-0 top-2 flex max-h-[24rem] flex-col rounded-2xl border border-white/10 bg-[#07080F] p-4 shadow-[0_25px_55px_rgba(3,3,9,0.85)]">
                              <Input
                                value={skillSearch}
                                onChange={event => setSkillSearch(event.target.value)}
                                placeholder="Search skills..."
                                className="h-11 rounded-xl border border-white/10 bg-black/30 text-sm text-zinc-100 placeholder:text-zinc-500"
                              />
                              <div className="mt-3 flex-1 overflow-hidden">
                                <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
                                  <div className="grid gap-2">
                                    {filteredSkills.length === 0 ? (
                                      <p className="px-3 py-2 text-sm text-zinc-500">No skills found.</p>
                                    ) : (
                                      filteredSkills.map(skill => {
                                        const selected = selectedSkills.has(skill.id);
                                        const icon = skill.icon?.trim() ?? "🎯";
                                        return (
                                          <button
                                            key={skill.id}
                                            type="button"
                                            onClick={() => onSkillToggle(skill.id)}
                                            className={cn(
                                              "flex items-center justify-between rounded-lg border border-transparent px-3 py-2 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/5",
                                              selected && "border-[var(--accent-red)] bg-[var(--accent-red)]/10 text-white"
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
                                      })
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/5 to-transparent p-5 text-sm text-zinc-400">
                  Modes update instantly—you can close this panel and run the scheduler without saving. Priority filters stay active until you switch back to Regular mode.
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
