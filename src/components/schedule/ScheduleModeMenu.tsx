"use client"

import { useMemo } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { SchedulerModeType } from "@/lib/scheduler/modes"
import type { SkillRow } from "@/lib/types/skill"

export type MonumentOption = {
  id: string
  title: string
  emoji: string | null
}

const MODE_OPTIONS: Array<{
  type: SchedulerModeType
  label: string
  description: string
}> = [
  {
    type: "regular",
    label: "Regular",
    description: "Run the scheduler with the standard settings you know today.",
  },
  {
    type: "rush",
    label: "Rush",
    description: "Trim durations by 20% to fit more work into every open window.",
  },
  {
    type: "monumental",
    label: "Monumental",
    description: "Prioritise a single monument by only planning its related work today.",
  },
  {
    type: "skilled",
    label: "Skilled",
    description: "Choose the skills to sharpen today and schedule only their work.",
  },
  {
    type: "rest",
    label: "Rest",
    description: "Soften every window to Low or No energy for a deliberate recovery day.",
  },
]

function getModeMeta(type: SchedulerModeType) {
  return MODE_OPTIONS.find(option => option.type === type) ?? MODE_OPTIONS[0]
}

type ScheduleModeMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  modeType: SchedulerModeType
  onModeTypeChange: (type: SchedulerModeType) => void
  monuments: MonumentOption[]
  selectedMonumentId: string | null
  onSelectMonument: (monumentId: string | null) => void
  skills: SkillRow[]
  selectedSkillIds: string[]
  onToggleSkill: (skillId: string) => void
  onClearSkillSelection: () => void
}

export function ScheduleModeMenu({
  open,
  onOpenChange,
  modeType,
  onModeTypeChange,
  monuments,
  selectedMonumentId,
  onSelectMonument,
  skills,
  selectedSkillIds,
  onToggleSkill,
  onClearSkillSelection,
}: ScheduleModeMenuProps) {
  const activeMeta = useMemo(() => getModeMeta(modeType), [modeType])
  const sortedSkills = useMemo(
    () => [...skills].sort((a, b) => a.name.localeCompare(b.name)),
    [skills]
  )
  const monumentLookup = useMemo(() => {
    const map = new Map<string, MonumentOption>()
    for (const monument of monuments) {
      map.set(monument.id, monument)
    }
    return map
  }, [monuments])

  const selectedMonument =
    selectedMonumentId && monumentLookup.has(selectedMonumentId)
      ? monumentLookup.get(selectedMonumentId) ?? null
      : null

  const monumentUnavailable = monuments.length === 0
  const skilledUnavailable = skills.length === 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-[var(--surface-elevated)] text-white sm:max-h-[70vh]">
        <SheetHeader>
          <SheetTitle>Schedule modes</SheetTitle>
          <SheetDescription className="text-white/70">
            Choose how the scheduler should shape your next run.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto px-1 pb-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs uppercase tracking-wide text-white/40">
              Active mode
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {activeMeta.label}
            </div>
            <p className="mt-1 text-sm text-white/70">{activeMeta.description}</p>
            {modeType === "monumental" ? (
              <div className="mt-3 text-sm text-white/80">
                {selectedMonument ? (
                  <>
                    Focused on {selectedMonument.emoji ?? "🏛️"} {selectedMonument.title}
                  </>
                ) : (
                  "Select a monument to enable this focus."
                )}
              </div>
            ) : null}
            {modeType === "skilled" ? (
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/80">
                {selectedSkillIds.length > 0 ? (
                  selectedSkillIds.map(skillId => {
                    const skill = skills.find(row => row.id === skillId)
                    if (!skill) return null
                    return (
                      <Badge
                        key={skill.id}
                        variant="outline"
                        className="border-white/30 bg-white/[0.08] text-white"
                      >
                        {skill.icon ? <span className="mr-1">{skill.icon}</span> : null}
                        {skill.name}
                      </Badge>
                    )
                  })
                ) : (
                  <span>No skills selected yet.</span>
                )}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3">
            {MODE_OPTIONS.map(option => {
              const isSelected = option.type === modeType
              const disabled =
                (option.type === "monumental" && monumentUnavailable) ||
                (option.type === "skilled" && skilledUnavailable)
              return (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => onModeTypeChange(option.type)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  className={cn(
                    "rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]",
                    "hover:border-white/20 hover:bg-white/[0.05]",
                    isSelected &&
                      "border-[var(--accent-red)]/70 bg-[var(--accent-red)]/10 shadow-[0_0_0_1px_rgba(239,68,68,0.25)]",
                    disabled && "cursor-not-allowed opacity-40"
                  )}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold text-white">
                        {option.label}
                      </div>
                      <p className="mt-1 text-sm text-white/70">
                        {option.description}
                      </p>
                    </div>
                    {isSelected ? (
                      <Badge className="shrink-0 border border-white/10 bg-white/20 text-xs uppercase tracking-wide text-white">
                        Selected
                      </Badge>
                    ) : null}
                  </div>
                  {option.type === "monumental" && monumentUnavailable ? (
                    <p className="mt-3 text-sm text-white/50">
                      Add a monument first to unlock this focus mode.
                    </p>
                  ) : null}
                  {option.type === "skilled" && skilledUnavailable ? (
                    <p className="mt-3 text-sm text-white/50">
                      Add a skill to your profile to use this mode.
                    </p>
                  ) : null}
                </button>
              )
            })}
          </div>

          {modeType === "monumental" ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-white">Choose a monument</div>
              {monuments.length > 0 ? (
                <Select
                  value={selectedMonumentId ?? ""}
                  onValueChange={value => onSelectMonument(value || null)}
                  placeholder="Select monument"
                  className="w-full"
                  triggerClassName="h-12 rounded-xl border-white/10 bg-white/[0.04]"
                >
                  <SelectContent>
                    <SelectItem value="" label="Select monument">
                      <span className="text-sm text-white/70">Select monument</span>
                    </SelectItem>
                    {monuments.map(monument => (
                      <SelectItem key={monument.id} value={monument.id}>
                        <span className="mr-2 text-lg">{monument.emoji ?? "🏛️"}</span>
                        <span>{monument.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-white/60">
                  You don&apos;t have any monuments yet. Create one to enable Monumental mode.
                </p>
              )}
            </div>
          ) : null}

          {modeType === "skilled" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">Select skills</div>
                {selectedSkillIds.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClearSkillSelection}
                    className="h-8 px-2 text-xs text-white/70 hover:text-white"
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
              {sortedSkills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {sortedSkills.map(skill => {
                    const isSelected = selectedSkillIds.includes(skill.id)
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => onToggleSkill(skill.id)}
                        aria-pressed={isSelected}
                        className={cn(
                          "flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white transition",
                          "hover:border-[var(--accent-red)]/70 hover:bg-[var(--accent-red)]/10",
                          isSelected &&
                            "border-[var(--accent-red)]/70 bg-[var(--accent-red)]/20",
                        )}
                      >
                        {skill.icon ? <span>{skill.icon}</span> : null}
                        <span>{skill.name}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-white/60">
                  Build your skill library to target a specific set today.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
