"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocationContexts } from "@/lib/hooks/useLocationContexts";
import type { CatRow } from "@/lib/types/cat";
import type { HabitWindowSelectOption } from "@/lib/hooks/useHabitWindows";
import {
  DEFAULT_EVERY_X_DAYS_INTERVAL,
  ensureEveryXDaysInterval,
  resolveEveryXDaysInterval,
} from "@/lib/recurrence";

export type HabitTypeOption = {
  label: string;
  value: string;
  description?: string;
};

export type HabitRecurrenceOption = {
  label: string;
  value: string;
};

export type HabitEnergySelectOption = {
  value: string;
  label: string;
  description?: string | null;
  disabled?: boolean;
};

export type HabitSkillSelectOption = {
  value: string;
  label: string;
  icon?: string | null;
  disabled?: boolean;
};

export type HabitGoalSelectOption = {
  value: string;
  label: string;
  description?: string | null;
  disabled?: boolean;
};

export const HABIT_TYPE_OPTIONS: HabitTypeOption[] = [
  {
    label: "Habit",
    value: "HABIT",
    description: "Momentum-building routines.",
  },
  {
    label: "Relaxer",
    value: "RELAXER",
    description: "Grounding rituals to restore energy.",
  },
  {
    label: "Practice",
    value: "PRACTICE",
    description: "Skill reps that keep you sharp.",
  },
  {
    label: "Temp",
    value: "TEMP",
    description: "Temporary pushes tied to a goal.",
  },
  {
    label: "Chore",
    value: "CHORE",
    description: "Maintenance that keeps life running.",
  },
  {
    label: "Sync",
    value: "ASYNC",
    description: "Self-paced rituals you can do anytime.",
  },
  {
    label: "Memo",
    value: "MEMO",
    description: "Capture reflections or notes tied to a skill.",
  },
];

export const HABIT_RECURRENCE_OPTIONS: HabitRecurrenceOption[] = [
  { label: "NO SET CADENCE", value: "none" },
  { label: "DAILY", value: "daily" },
  { label: "WEEKLY", value: "weekly" },
  { label: "BI-WEEKLY", value: "bi-weekly" },
  { label: "MONTHLY", value: "monthly" },
  { label: "6 MONTHS", value: "every 6 months" },
  { label: "YEARLY", value: "yearly" },
  { label: "EVERY X DAYS", value: "every x days" },
];

export const HABIT_ENERGY_OPTIONS: HabitEnergySelectOption[] = [
  { value: "NO", label: "No Energy", description: "Fits when energy is scarce." },
  { value: "LOW", label: "Low", description: "Great for gentle routines." },
  { value: "MEDIUM", label: "Medium", description: "Requires a bit of focus." },
  { value: "HIGH", label: "High", description: "Needs momentum and intention." },
  { value: "ULTRA", label: "Ultra", description: "Best when you're in full flow." },
  { value: "EXTREME", label: "Extreme", description: "Reserve for peak energy." },
];

interface HabitFormFieldsProps {
  name: string;
  description: string;
  habitType: string;
  recurrence: string;
  recurrenceDays: number[];
  duration: string;
  energy: string;
  skillId: string;
  locationContextId?: string | null;
  daylightPreference?: string | null;
  windowEdgePreference?: string | null;
  energyOptions: HabitEnergySelectOption[];
  skillsLoading: boolean;
  skillOptions: HabitSkillSelectOption[];
  skillCategories?: CatRow[];
  skillError?: string | null;
  goalId?: string;
  goalOptions?: HabitGoalSelectOption[];
  goalError?: string | null;
  onGoalChange?: (value: string) => void;
  completionTarget?: string;
  onCompletionTargetChange?: (value: string) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onHabitTypeChange: (value: string) => void;
  onRecurrenceChange: (value: string) => void;
  onRecurrenceDaysChange: (days: number[]) => void;
  onEnergyChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onSkillChange: (value: string) => void;
  onLocationContextIdChange?: (id: string | null) => void;
  onDaylightPreferenceChange?: (value: string) => void;
  onWindowEdgePreferenceChange?: (value: string) => void;
  windowId?: string;
  windowOptions?: HabitWindowSelectOption[];
  windowsLoading?: boolean;
  windowError?: string | null;
  onWindowChange?: (value: string) => void;
  typeOptions?: HabitTypeOption[];
  recurrenceOptions?: HabitRecurrenceOption[];
  footerSlot?: ReactNode;
  showDescriptionField?: boolean;
}

const DAYLIGHT_OPTIONS = [
  { value: "ALL_DAY", label: "All day" },
  { value: "DAY", label: "Daytime" },
  { value: "NIGHT", label: "Night" },
];

const WINDOW_EDGE_OPTIONS = [
  { value: "FRONT", label: "Front" },
  { value: "BACK", label: "Back" },
];

const UNCATEGORIZED_GROUP_ID = "__uncategorized__";
const UNCATEGORIZED_GROUP_LABEL = "Uncategorized";

const ANY_OPTION_ID = "__any__";

export function HabitFormFields({
  name,
  description,
  habitType,
  recurrence,
  recurrenceDays,
  duration,
  energy,
  skillId,
  locationContextId = null,
  daylightPreference = "ALL_DAY",
  windowEdgePreference = "FRONT",
  windowId = "none",
  windowOptions = [],
  windowsLoading = false,
  windowError,
  energyOptions,
  skillsLoading,
  skillOptions,
  skillCategories = [],
  skillError,
  goalId = "none",
  goalOptions,
  goalError,
  onGoalChange,
  completionTarget = "",
  onCompletionTargetChange,
  onNameChange,
  onDescriptionChange,
  onHabitTypeChange,
  onRecurrenceChange,
  onRecurrenceDaysChange,
  onEnergyChange,
  onDurationChange,
  onSkillChange,
  onLocationContextIdChange,
  onDaylightPreferenceChange,
  onWindowEdgePreferenceChange,
  onWindowChange,
  typeOptions = HABIT_TYPE_OPTIONS,
  recurrenceOptions = HABIT_RECURRENCE_OPTIONS,
  footerSlot,
  showDescriptionField = true,
}: HabitFormFieldsProps) {
  const normalizedRecurrence = recurrence.toLowerCase().trim();
  const showRecurrenceIntervalInput = normalizedRecurrence === "every x days";
  const normalizedHabitType = habitType.toUpperCase();
  const isTempHabit = normalizedHabitType === "TEMP";
  const everyXDaysInterval =
    resolveEveryXDaysInterval(recurrence, recurrenceDays) ??
    DEFAULT_EVERY_X_DAYS_INTERVAL;

  useEffect(() => {
    if (showRecurrenceIntervalInput && recurrenceDays.length === 0) {
      onRecurrenceDaysChange([DEFAULT_EVERY_X_DAYS_INTERVAL]);
    }
  }, [
    onRecurrenceDaysChange,
    recurrenceDays.length,
    showRecurrenceIntervalInput,
  ]);

  const goalSelectOptions = (goalOptions && goalOptions.length > 0
    ? goalOptions
    : [{ value: "none", label: "No goals available", disabled: true }]) as HabitGoalSelectOption[];
  const goalSelectDisabled = goalSelectOptions.every((option) => option.disabled);
  const resolvedGoalValue = goalSelectOptions.some((option) => option.value === goalId)
    ? goalId
    : goalSelectOptions[0]?.value ?? "none";

  const [skillSearchQuery, setSkillSearchQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(() => {
    const hasLocation = Boolean(locationContextId);
    const daylightUpper = (daylightPreference ?? "ALL_DAY").toUpperCase();
    const hasDaylight = daylightUpper === "DAY" || daylightUpper === "NIGHT";
    const edgeUpper = (windowEdgePreference ?? "FRONT").toUpperCase();
    const usesBackEdge = edgeUpper === "BACK";
    return hasLocation || hasDaylight || usesBackEdge;
  });
  const [customLocationName, setCustomLocationName] = useState("");
  const [customLocationError, setCustomLocationError] = useState<string | null>(
    null,
  );
  const [savingCustomLocation, setSavingCustomLocation] = useState(false);

  const {
    options: locationOptions,
    loading: locationOptionsLoading,
    error: locationOptionsError,
    createContext: createLocationContext,
  } = useLocationContexts();

  useEffect(() => {
    setSkillSearchQuery("");
  }, [skillId, skillsLoading, skillOptions]);

  const filteredSkillOptions = useMemo(() => {
    const query = skillSearchQuery.trim().toLowerCase();
    if (!query) {
      return skillOptions;
    }

    return skillOptions.filter((option) => {
      const labelMatch = option.label.toLowerCase().includes(query);
      const valueMatch = option.value.toLowerCase().includes(query);

      return labelMatch || valueMatch;
    });
  }, [skillOptions, skillSearchQuery]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    skillCategories.forEach((category) => {
      const label = category.name?.trim() || "";
      map.set(category.id, label);
    });
    return map;
  }, [skillCategories]);

  type SkillGroup = {
    id: string;
    label: string;
    options: HabitSkillSelectOption[];
  };

  const skillOptionsForGrouping = filteredSkillOptions.filter(
    (option) => option.value !== "none",
  );

  const groupedSkillOptions = useMemo(() => {
    if (skillOptionsForGrouping.length === 0) {
      return [];
    }

    const groups = new Map<string, SkillGroup>();
    skillOptionsForGrouping.forEach((option) => {
      const groupId = option.catId ?? UNCATEGORIZED_GROUP_ID;
      const label =
        groupId === UNCATEGORIZED_GROUP_ID
          ? UNCATEGORIZED_GROUP_LABEL
          : categoryLookup.get(groupId) || UNCATEGORIZED_GROUP_LABEL;
      const existing = groups.get(groupId);
      if (existing) {
        existing.options.push(option);
      } else {
        groups.set(groupId, { id: groupId, label, options: [option] });
      }
    });

    const ordered: SkillGroup[] = [];
    skillCategories.forEach((category) => {
      const group = groups.get(category.id);
      if (group) {
        ordered.push({
          ...group,
          label: category.name?.trim() || group.label,
        });
        groups.delete(category.id);
      }
    });

    const uncategorizedGroup = groups.get(UNCATEGORIZED_GROUP_ID);
    if (uncategorizedGroup) {
      ordered.push({
        ...uncategorizedGroup,
        label: UNCATEGORIZED_GROUP_LABEL,
      });
      groups.delete(UNCATEGORIZED_GROUP_ID);
    }

    for (const group of groups.values()) {
      ordered.push(group);
    }

    return ordered;
  }, [skillOptionsForGrouping, skillCategories, categoryLookup]);

  const specialSkillOptions = filteredSkillOptions.filter(
    (option) => option.value === "none",
  );

  const locationOptionsById = useMemo(() => {
    return new Map(locationOptions.map((option) => [option.id, option]));
  }, [locationOptions]);
  const selectedOption = locationContextId
    ? locationOptionsById.get(locationContextId) ?? null
    : null;
  const locationValue = selectedOption?.id ?? ANY_OPTION_ID;
  const daylightValue = (daylightPreference ?? "ALL_DAY").toUpperCase().trim();
  const windowEdgeValue = (windowEdgePreference ?? "FRONT")
    .toUpperCase()
    .trim();
  const normalizedWindowId =
    typeof windowId === "string" && windowId.trim().length > 0
      ? windowId
      : "none";
  const hasWindowSelection =
    normalizedWindowId !== "none" &&
    windowOptions.some((option) => option.id === normalizedWindowId);
  const resolvedWindowOptions = hasWindowSelection
    ? windowOptions
    : normalizedWindowId !== "none"
      ? [
          ...windowOptions,
          {
            id: normalizedWindowId,
            label: "Selected window (unavailable)",
          },
        ]
      : windowOptions;

  const handleAddCustomLocation = async () => {
    const name = customLocationName;
    if (!name.trim()) {
      setCustomLocationError("Enter a location name first.");
      return;
    }

    setSavingCustomLocation(true);
    setCustomLocationError(null);

    try {
      const result = await createLocationContext(name);
      if (!result.success) {
        setCustomLocationError(result.error);
        return;
      }

      setCustomLocationName("");
      onLocationContextIdChange?.(result.option.id);
      setAdvancedOpen(true);
    } finally {
      setSavingCustomLocation(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label
          htmlFor="habit-name"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
        >
          Habit name
        </Label>
        <Input
          id="habit-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="e.g. Morning meditation"
          required
          className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
        />
      </div>

      {showDescriptionField ? (
        <div className="space-y-3">
          <Label
            htmlFor="habit-description"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
          >
            Description
          </Label>
          <Textarea
            id="habit-description"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Add any notes that will keep you accountable."
            className="min-h-[120px] rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
          />
        </div>
      ) : null}

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:gap-6 max-[360px]:grid-cols-1">
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Type
            </Label>
            <Select value={habitType} onValueChange={onHabitTypeChange}>
              <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent className="bg-[#0b101b] text-sm text-white">
                {typeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Recurrence
            </Label>
            <Select value={recurrence} onValueChange={onRecurrenceChange}>
              <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                <SelectValue placeholder="How often will you do this?" />
              </SelectTrigger>
              <SelectContent className="bg-[#0b101b] text-sm text-white">
                {recurrenceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          {showRecurrenceIntervalInput ? (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                Interval (days)
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={everyXDaysInterval}
                  onChange={(event) => {
                    const normalizedValue =
                      ensureEveryXDaysInterval(event.target.value) ??
                      DEFAULT_EVERY_X_DAYS_INTERVAL;
                    onRecurrenceDaysChange([normalizedValue]);
                  }}
                  className="h-11 w-32 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white focus:border-blue-400/60 focus-visible:ring-0"
                />
                <span className="text-xs uppercase tracking-[0.3em] text-white/60">
                  days between completions
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

        {isTempHabit ? (
          <div className="space-y-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                Goal
              </Label>
              <Select
                value={resolvedGoalValue}
                onValueChange={(value) => onGoalChange?.(value)}
                disabled={goalSelectDisabled}
              >
                <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                  <SelectValue placeholder="Choose a goal" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b101b] text-sm text-white">
                  {goalSelectOptions.map((option) => (
                    <SelectItem
                      key={`${option.value}-${option.label}`}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        {option.description ? (
                          <span className="text-xs text-white/60">{option.description}</span>
                        ) : null}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {goalError ? (
                <p className="text-xs text-red-300">{goalError}</p>
              ) : null}
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                Completions
              </Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={completionTarget}
                onChange={(event) => onCompletionTargetChange?.(event.target.value)}
                placeholder="How many completions finish this habit?"
                className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
              />
              <p className="text-xs text-white/60">
                Once you log this many completions, the temporary habit will wrap up.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 sm:gap-6 max-[360px]:grid-cols-1">
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Skill focus
            </Label>
            <Select
              value={skillId}
              onValueChange={onSkillChange}
              disabled={skillsLoading && skillOptions.length <= 1}
            >
              <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                <SelectValue placeholder="Choose the skill this habit grows" />
              </SelectTrigger>
            <SelectContent className="bg-[#0b101b] text-sm text-white">
              <div className="p-2">
                <Input
                  value={skillSearchQuery}
                  onChange={(event) => setSkillSearchQuery(event.target.value)}
                  placeholder="Search skills..."
                  className="h-9 rounded-lg border border-white/10 bg-white/5 text-xs placeholder:text-white/40 focus:border-blue-400/60 focus-visible:ring-0"
                />
              </div>
              {specialSkillOptions.map((option) => (
                <SelectItem
                  key={`${option.value}-${option.label}`}
                  value={option.value}
                  disabled={option.disabled}
                >
                  <div className="flex items-center gap-2">
                    {option.icon ? <span>{option.icon}</span> : null}
                    <span>{option.label}</span>
                  </div>
                </SelectItem>
              ))}
              {filteredSkillOptions.length === 0 ? (
                <div className="px-3 pb-3 text-xs text-white/60">
                  No skills found.
                </div>
              ) : (
                groupedSkillOptions.map((group, index) => (
                  <div
                    key={group.id}
                    className={cn(
                      "space-y-2 px-3 pb-3 pt-2 text-sm text-white",
                      index === 0 ? "pt-0" : ""
                    )}
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">
                      {group.label}
                    </p>
                    <div className="grid gap-1">
                      {group.options.map((option) => (
                        <SelectItem
                          key={`${option.value}-${option.label}`}
                          value={option.value}
                          disabled={option.disabled}
                          className="px-0 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            {option.icon ? <span>{option.icon}</span> : null}
                            <span>{option.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </SelectContent>
            </Select>
            {skillError ? (
              <p className="text-xs text-red-300">{skillError}</p>
            ) : null}
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Energy
            </Label>
            <Select value={energy} onValueChange={onEnergyChange}>
              <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                <SelectValue placeholder="Choose the energy this habit needs" />
              </SelectTrigger>
              <SelectContent className="bg-[#0b101b] text-sm text-white">
                {energyOptions.map((option) => (
                  <SelectItem
                    key={`${option.value}-${option.label}`}
                    value={option.value}
                    disabled={option.disabled}
                  >
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      {option.description ? (
                        <span className="text-xs text-white/60">{option.description}</span>
                      ) : null}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div
          className={
            footerSlot
              ? "grid grid-cols-2 gap-4 sm:gap-6 max-[360px]:grid-cols-1"
              : "space-y-3"
          }
        >
          <div className="space-y-3">
            <Label
              htmlFor="habit-duration"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
            >
              Duration
            </Label>
            <Input
              id="habit-duration"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={duration}
              onChange={(event) => onDurationChange(event.target.value)}
              placeholder="x minutes"
              required
              className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
            />
          </div>
          {footerSlot ? <div className="space-y-3">{footerSlot}</div> : null}
        </div>
      </div>

      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          className="h-10 rounded-xl border-white/15 bg-white/[0.03] text-xs font-semibold uppercase tracking-[0.2em] text-white/80 hover:border-white/30 hover:bg-white/[0.07]"
        >
          {advancedOpen ? "Hide advanced options" : "Show advanced options"}
        </Button>

        {advancedOpen ? (
          <div className="space-y-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                Location context
              </Label>
              <Select
                value={locationValue}
                onValueChange={(value) =>
                  {
                    if (value === ANY_OPTION_ID) {
                      onLocationContextIdChange?.(null);
                      return;
                    }

                    const option = locationOptionsById.get(value);
                    if (!option) {
                      onLocationContextIdChange?.(null);
                      return;
                    }

                    onLocationContextIdChange?.(option.id);
                  }
                }
                disabled={locationOptionsLoading}
              >
                <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                  <SelectValue placeholder="Where does this habit happen?" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b101b] text-sm text-white">
                  <SelectItem value={ANY_OPTION_ID}>
                    <span className="text-zinc-400">Anywhere</span>
                  </SelectItem>
                  {locationOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-white/60">
                Choose a location to keep this habit aligned with compatible schedule windows.
              </p>
              {locationOptionsError ? (
                <p className="text-xs text-amber-300/90">
                  {locationOptionsError}
                </p>
              ) : null}
              <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/60">
                  Add a new location
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={customLocationName}
                    onChange={(event) => {
                      setCustomLocationName(event.target.value)
                      setCustomLocationError(null)
                    }}
                    placeholder="e.g. Gym or Studio"
                    className="h-10 rounded-lg border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/40 focus:border-blue-400/60 focus-visible:ring-0"
                  />
                  <Button
                    type="button"
                    onClick={handleAddCustomLocation}
                    disabled={savingCustomLocation}
                    className="h-10 shrink-0 rounded-lg bg-blue-500/80 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-blue-500"
                  >
                    {savingCustomLocation ? "Saving..." : "Save"}
                  </Button>
                </div>
                {customLocationError ? (
                  <p className="text-xs text-red-300">{customLocationError}</p>
                ) : null}
                <p className="text-[0.65rem] text-white/50">
                  Custom locations sync across your habits and windows.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                Preferred window
              </Label>
              <Select
                value={normalizedWindowId}
                onValueChange={(value) => onWindowChange?.(value)}
                disabled={windowsLoading}
              >
                <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                  <SelectValue placeholder="Lock this habit to a window" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b101b] text-sm text-white">
                  <SelectItem value="none">No preferred window</SelectItem>
                  {resolvedWindowOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-white/60">
                Keep this habit anchored to a specific window. We’ll skip other
                windows when placing it.
              </p>
              {windowError ? (
                <p className="text-xs text-amber-300/90">{windowError}</p>
              ) : null}
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                Daylight preference
              </Label>
              <Select
                value={daylightValue || "ALL_DAY"}
                onValueChange={(value) =>
                  onDaylightPreferenceChange?.(value)
                }
              >
                <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                  <SelectValue placeholder="When should this habit run?" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b101b] text-sm text-white">
                  {DAYLIGHT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-white/60">
                Restrict this habit to daylight or night windows. We’ll respect your local sunrise and sunset when scheduling.
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                Front/Back
              </Label>
              <Select
                value={windowEdgeValue || "FRONT"}
                onValueChange={(value) => onWindowEdgePreferenceChange?.(value)}
              >
                <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                  <SelectValue placeholder="Where should this habit anchor?" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b101b] text-sm text-white">
                  {WINDOW_EDGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-white/60">
                Choose whether this habit should schedule from the beginning of a window or stack from the end instead.
              </p>
            </div>
          </div>
        ) : null}
      </div>

    </div>
  );
}
