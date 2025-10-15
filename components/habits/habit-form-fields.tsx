"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";

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
import { cn } from "@/lib/utils";

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

export type HabitLocationOption = {
  value: string;
  label: string;
  description?: string;
};

export type HabitDaylightOption = {
  value: string;
  label: string;
  description?: string;
};

export const HABIT_TYPE_OPTIONS: HabitTypeOption[] = [
  {
    label: "Habit",
    value: "HABIT",
    description: "Momentum-building routines.",
  },
  {
    label: "Chore",
    value: "CHORE",
    description: "Maintenance that keeps life running.",
  },
  {
    label: "Async",
    value: "ASYNC",
    description: "Self-paced rituals you can do anytime.",
  },
  {
    label: "Memo",
    value: "MEMO",
    description: "Capture reflections that mark your growth.",
  },
];

export const HABIT_LOCATION_OPTIONS: HabitLocationOption[] = [
  {
    value: "ANY",
    label: "Anywhere",
    description: "Show in every window regardless of location.",
  },
  { value: "HOME", label: "Home" },
  { value: "WORK", label: "Work" },
  { value: "OUTSIDE", label: "Outside" },
];

export const HABIT_DAYLIGHT_OPTIONS: HabitDaylightOption[] = [
  {
    value: "ALL_DAY",
    label: "All day",
    description: "Schedule at any hour with no daylight limits.",
  },
  {
    value: "DAY",
    label: "Day",
    description: "Keep this habit while the sun’s still up.",
  },
  {
    value: "NIGHT",
    label: "Night",
    description: "Reserve for evenings, twilight, and after dark.",
  },
];

export const HABIT_RECURRENCE_OPTIONS: HabitRecurrenceOption[] = [
  { label: "No set cadence", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Bi-weekly", value: "bi-weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Bi-monthly", value: "bi-monthly" },
  { label: "Yearly", value: "yearly" },
  { label: "Every X Days", value: "every x days" },
];

export const HABIT_ENERGY_OPTIONS: HabitEnergySelectOption[] = [
  { value: "NO", label: "No Energy", description: "Fits when energy is scarce." },
  { value: "LOW", label: "Low", description: "Great for gentle routines." },
  { value: "MEDIUM", label: "Medium", description: "Requires a bit of focus." },
  { value: "HIGH", label: "High", description: "Needs momentum and intention." },
  { value: "ULTRA", label: "Ultra", description: "Best when you're in full flow." },
  { value: "EXTREME", label: "Extreme", description: "Reserve for peak energy." },
];

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun", fullLabel: "Sunday" },
  { value: 1, label: "Mon", fullLabel: "Monday" },
  { value: 2, label: "Tue", fullLabel: "Tuesday" },
  { value: 3, label: "Wed", fullLabel: "Wednesday" },
  { value: 4, label: "Thu", fullLabel: "Thursday" },
  { value: 5, label: "Fri", fullLabel: "Friday" },
  { value: 6, label: "Sat", fullLabel: "Saturday" },
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
  locationContext: string;
  daylightPreference: string;
  energyOptions: HabitEnergySelectOption[];
  skillsLoading: boolean;
  skillOptions: HabitSkillSelectOption[];
  skillError?: string | null;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onHabitTypeChange: (value: string) => void;
  onRecurrenceChange: (value: string) => void;
  onRecurrenceDaysChange: (days: number[]) => void;
  onEnergyChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onSkillChange: (value: string) => void;
  onLocationContextChange: (value: string) => void;
  onDaylightPreferenceChange: (value: string) => void;
  typeOptions?: HabitTypeOption[];
  recurrenceOptions?: HabitRecurrenceOption[];
  locationOptions?: HabitLocationOption[];
  daylightOptions?: HabitDaylightOption[];
  footerSlot?: ReactNode;
  showDescriptionField?: boolean;
}

export function HabitFormFields({
  name,
  description,
  habitType,
  recurrence,
  recurrenceDays,
  duration,
  energy,
  skillId,
  locationContext,
  daylightPreference,
  energyOptions,
  skillsLoading,
  skillOptions,
  skillError,
  onNameChange,
  onDescriptionChange,
  onHabitTypeChange,
  onRecurrenceChange,
  onRecurrenceDaysChange,
  onEnergyChange,
  onDurationChange,
  onSkillChange,
  onLocationContextChange,
  onDaylightPreferenceChange,
  typeOptions = HABIT_TYPE_OPTIONS,
  recurrenceOptions = HABIT_RECURRENCE_OPTIONS,
  locationOptions = HABIT_LOCATION_OPTIONS,
  daylightOptions = HABIT_DAYLIGHT_OPTIONS,
  footerSlot,
  showDescriptionField = true,
}: HabitFormFieldsProps) {
  const normalizedRecurrence = recurrence.toLowerCase().trim();
  const showRecurrenceDayPicker = normalizedRecurrence === "every x days";

  const [skillSearchQuery, setSkillSearchQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(() => {
    const normalizedLocation = locationContext.toUpperCase();
    const normalizedDaylight = daylightPreference.toUpperCase();
    return normalizedLocation !== "ANY" || normalizedDaylight !== "ALL_DAY";
  });

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

  const handleToggleRecurrenceDay = (day: number) => {
    const hasDay = recurrenceDays.includes(day);
    const next = hasDay
      ? recurrenceDays.filter((value) => value !== day)
      : [...recurrenceDays, day].sort((a, b) => a - b);
    onRecurrenceDaysChange(next);
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

      <div className="grid gap-6 sm:grid-cols-2">
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
          {showRecurrenceDayPicker ? (
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = recurrenceDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => handleToggleRecurrenceDay(day.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition",
                      isSelected
                        ? "border-blue-400/60 bg-blue-500/20 text-white"
                        : "border-white/10 bg-white/[0.05] text-white/70 hover:border-white/20 hover:text-white",
                    )}
                    aria-pressed={isSelected}
                    aria-label={day.fullLabel}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

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
              {filteredSkillOptions.length > 0 ? (
                filteredSkillOptions.map((option) => (
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
                ))
              ) : (
                <div className="px-3 pb-3 text-xs text-white/60">
                  No skills found.
                </div>
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

      <div className="space-y-3">
        <Label
          htmlFor="habit-duration"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
        >
          Duration (minutes)
        </Label>
        <Input
          id="habit-duration"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={duration}
          onChange={(event) => onDurationChange(event.target.value)}
          placeholder="e.g. 25"
          required
          className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/50 focus:border-blue-400/60 focus-visible:ring-0"
        />
      </div>
    </div>

    <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
      <button
        type="button"
        onClick={() => setAdvancedOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.08]"
        aria-expanded={advancedOpen}
      >
        <span>Advanced context</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform text-white/70",
            advancedOpen ? "rotate-180" : "rotate-0"
          )}
        />
      </button>

      {advancedOpen ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Location context
            </Label>
            <Select value={locationContext} onValueChange={onLocationContextChange}>
              <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                <SelectValue placeholder="Where does this habit belong?" />
              </SelectTrigger>
              <SelectContent className="bg-[#0b101b] text-sm text-white">
                {locationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col gap-0.5">
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

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Daylight preference
            </Label>
            <Select value={daylightPreference} onValueChange={onDaylightPreferenceChange}>
              <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                <SelectValue placeholder="When should this show up?" />
              </SelectTrigger>
              <SelectContent className="bg-[#0b101b] text-sm text-white">
                {daylightOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col gap-0.5">
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

          <div className="sm:col-span-2">
            <p className="flex items-center gap-2 text-xs text-white/60">
              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              These settings make habits location and daylight aware, so they only
              appear in windows that match the moment you’re in.
            </p>
          </div>
        </div>
      ) : null}
    </div>

    {footerSlot}
  </div>
);
}
