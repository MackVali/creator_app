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
  typeOptions?: HabitTypeOption[];
  recurrenceOptions?: HabitRecurrenceOption[];
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
  typeOptions = HABIT_TYPE_OPTIONS,
  recurrenceOptions = HABIT_RECURRENCE_OPTIONS,
  footerSlot,
  showDescriptionField = true,
}: HabitFormFieldsProps) {
  const normalizedRecurrence = recurrence.toLowerCase().trim();
  const showRecurrenceDayPicker = normalizedRecurrence === "every x days";

  const [skillSearchQuery, setSkillSearchQuery] = useState("");

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

      {footerSlot}
    </div>
  );
}
