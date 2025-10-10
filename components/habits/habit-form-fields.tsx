"use client";

import { ReactNode } from "react";

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

export type HabitWindowSelectOption = {
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
  recurrenceDays: number[];
  duration: string;
  windowId: string;
  windowsLoading: boolean;
  windowOptions: HabitWindowSelectOption[];
  windowError?: string | null;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onHabitTypeChange: (value: string) => void;
  onRecurrenceChange: (value: string) => void;
  onRecurrenceDaysChange: (value: number[]) => void;
  onWindowChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  typeOptions?: HabitTypeOption[];
  recurrenceOptions?: HabitRecurrenceOption[];
  footerSlot?: ReactNode;
  showDescriptionField?: boolean;
  recurrenceDaysError?: string | null;
}

const WEEKDAY_OPTIONS: { label: string; value: number; title: string }[] = [
  { label: "S", value: 0, title: "Sunday" },
  { label: "M", value: 1, title: "Monday" },
  { label: "T", value: 2, title: "Tuesday" },
  { label: "W", value: 3, title: "Wednesday" },
  { label: "T", value: 4, title: "Thursday" },
  { label: "F", value: 5, title: "Friday" },
  { label: "S", value: 6, title: "Saturday" },
];

export function HabitFormFields({
  name,
  description,
  habitType,
  recurrence,
  recurrenceDays,
  duration,
  windowId,
  windowsLoading,
  windowOptions,
  windowError,
  onNameChange,
  onDescriptionChange,
  onHabitTypeChange,
  onRecurrenceChange,
  onRecurrenceDaysChange,
  onWindowChange,
  onDurationChange,
  typeOptions = HABIT_TYPE_OPTIONS,
  recurrenceOptions = HABIT_RECURRENCE_OPTIONS,
  footerSlot,
  showDescriptionField = true,
  recurrenceDaysError = null,
}: HabitFormFieldsProps) {
  const toggleRecurrenceDay = (day: number) => {
    if (recurrenceDays.includes(day)) {
      onRecurrenceDaysChange(
        recurrenceDays.filter((existingDay) => existingDay !== day)
      );
      return;
    }

    const next = [...recurrenceDays, day].sort((a, b) => a - b);
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
          <p className="text-xs text-white/50">
            Optional, but a clear intention makes it easier to stay consistent.
          </p>
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
          <p className="text-xs text-white/50">
            Use chores for recurring upkeep tasks, async for flexible collaborations, and habits to track personal rituals.
          </p>
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
          <p className="text-xs text-white/50">
            Pick the cadence that fits best. You can adjust this later.
          </p>
        </div>

        {recurrence === "weekly" ? (
          <div className="space-y-3 sm:col-span-2">
            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Days of the week
            </Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((option) => {
                const selected = recurrenceDays.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleRecurrenceDay(option.value)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium transition",
                      "border-white/10 bg-white/[0.04] text-white/70 hover:border-blue-400/60 hover:text-white",
                      selected &&
                        "border-blue-400/70 bg-blue-500/20 text-white shadow-[0_18px_38px_rgba(59,130,246,0.35)]"
                    )}
                    aria-pressed={selected}
                    title={option.title}
                  >
                    <span aria-hidden>{option.label}</span>
                    <span className="sr-only">{option.title}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-white/50">
              Choose the specific days this habit should repeat each week.
            </p>
            {recurrenceDaysError ? (
              <p className="text-xs text-red-300">{recurrenceDaysError}</p>
            ) : null}
          </div>
        ) : null}

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
          <p className="text-xs text-white/50">
            Anchoring to a window helps scheduling align with your energy.
          </p>
          {windowError ? (
            <p className="text-xs text-red-300">{windowError}</p>
          ) : null}
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
          <p className="text-xs text-white/50">
            Estimate how long this habit usually takes so we can track your time investment.
          </p>
        </div>
      </div>

      {footerSlot}
    </div>
  );
}
