"use client";

import { ReactNode, useId } from "react";

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

const WEEKDAY_OPTIONS = [
  { value: "monday", label: "Mon", longLabel: "Monday" },
  { value: "tuesday", label: "Tue", longLabel: "Tuesday" },
  { value: "wednesday", label: "Wed", longLabel: "Wednesday" },
  { value: "thursday", label: "Thu", longLabel: "Thursday" },
  { value: "friday", label: "Fri", longLabel: "Friday" },
  { value: "saturday", label: "Sat", longLabel: "Saturday" },
  { value: "sunday", label: "Sun", longLabel: "Sunday" },
];

export type HabitTypeOption = {
  label: string;
  value: string;
  description?: string;
};

export type HabitRecurrenceOption = {
  label: string;
  value: string;
};

export type HabitWindowPositionOption = "FIRST" | "LAST";

export type HabitWindowSelectOption = {
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

interface HabitFormFieldsProps {
  name: string;
  description: string;
  habitType: string;
  recurrence: string;
  recurrenceDays: string[];
  duration: string;
  windowId: string;
  windowPosition: HabitWindowPositionOption;
  skillId: string;
  windowsLoading: boolean;
  windowOptions: HabitWindowSelectOption[];
  windowError?: string | null;
  skillsLoading: boolean;
  skillOptions: HabitSkillSelectOption[];
  skillError?: string | null;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onHabitTypeChange: (value: string) => void;
  onRecurrenceChange: (value: string) => void;
  onRecurrenceDaysChange: (value: string[]) => void;
  onWindowChange: (value: string) => void;
  onWindowPositionChange: (value: HabitWindowPositionOption) => void;
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
  windowId,
  windowPosition,
  skillId,
  windowsLoading,
  windowOptions,
  windowError,
  skillsLoading,
  skillOptions,
  skillError,
  onNameChange,
  onDescriptionChange,
  onHabitTypeChange,
  onRecurrenceChange,
  onRecurrenceDaysChange,
  onWindowChange,
  onWindowPositionChange,
  onDurationChange,
  onSkillChange,
  typeOptions = HABIT_TYPE_OPTIONS,
  recurrenceOptions = HABIT_RECURRENCE_OPTIONS,
  footerSlot,
  showDescriptionField = true,
}: HabitFormFieldsProps) {
  const isCustomDayRecurrence = recurrence === "every x days";
  const windowPositionDescriptionId = useId();
  const isLastWindowPosition = windowPosition === "LAST";
  const canChooseWindowPosition = windowId !== "none";
  const normalizedRecurrenceDays = Array.isArray(recurrenceDays)
    ? recurrenceDays
    : [];
  const windowPositionDescription = canChooseWindowPosition
    ? "Choose whether this habit should kick off its window or close it out."
    : "Select a preferred window to control where this habit lands within it.";

  const toggleDay = (dayValue: string) => {
    const current = new Set(normalizedRecurrenceDays);
    if (current.has(dayValue)) {
      current.delete(dayValue);
    } else {
      current.add(dayValue);
    }

    const ordered = WEEKDAY_OPTIONS.reduce<string[]>((acc, option) => {
      if (current.has(option.value)) {
        acc.push(option.value);
      }
      return acc;
    }, []);

    onRecurrenceDaysChange(ordered);
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
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.value === "none" && windowsLoading}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isCustomDayRecurrence ? (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                Repeat on
              </span>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((day) => {
                  const isSelected = normalizedRecurrenceDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      aria-pressed={isSelected}
                      aria-label={day.longLabel}
                      className={cn(
                        "flex h-9 min-w-[2.5rem] items-center justify-center rounded-full border px-3 text-xs font-medium transition",
                        isSelected
                          ? "border-white bg-white text-black"
                          : "border-white/20 text-white/70 hover:border-white/40 hover:text-white"
                      )}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
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
              {skillOptions.map((option) => (
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
            </SelectContent>
          </Select>
          {skillError ? (
            <p className="text-xs text-red-300">{skillError}</p>
          ) : null}
        </div>

        <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            Preferred window
          </Label>
          <Select
            value={windowId}
            onValueChange={onWindowChange}
            disabled={windowsLoading}
          >
            <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
              <SelectValue placeholder="Choose when this fits best" />
            </SelectTrigger>
            <SelectContent className="bg-[#0b101b] text-sm text-white">
              {windowOptions.map((option) => (
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
          {windowError ? (
            <p className="text-xs text-red-300">{windowError}</p>
          ) : null}

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Window position
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-white/60">First</span>
              <button
                type="button"
                role="switch"
                aria-checked={isLastWindowPosition}
                aria-label="Toggle window position"
                aria-describedby={windowPositionDescriptionId}
                onClick={() =>
                  onWindowPositionChange(
                    isLastWindowPosition ? "FIRST" : "LAST"
                  )
                }
                disabled={!canChooseWindowPosition}
                className={cn(
                  "relative flex h-8 w-16 items-center rounded-full border px-1 transition",
                  canChooseWindowPosition
                    ? isLastWindowPosition
                      ? "border-white bg-white text-black"
                      : "border-white/40 bg-white/10 text-white hover:border-white/70"
                    : "cursor-not-allowed border-white/10 bg-white/5 text-white/50 opacity-60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-6 w-6 rounded-full transition-transform",
                    isLastWindowPosition
                      ? "translate-x-6 bg-black"
                      : "translate-x-0 bg-white",
                  )}
                />
              </button>
              <span className="text-xs font-medium text-white/60">Last</span>
            </div>
            <p
              id={windowPositionDescriptionId}
              className="text-xs text-white/60"
            >
              {windowPositionDescription}
            </p>
          </div>
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
