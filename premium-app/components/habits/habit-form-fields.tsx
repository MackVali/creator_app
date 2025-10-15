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
  locationContext?: string | null;
  daylightPreference?: string | null;
  windowEdgePreference?: string | null;
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
  onLocationContextChange?: (value: string | null) => void;
  onDaylightPreferenceChange?: (value: string) => void;
  onWindowEdgePreferenceChange?: (value: string) => void;
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

export function HabitFormFields({
  name,
  description,
  habitType,
  recurrence,
  recurrenceDays,
  duration,
  energy,
  skillId,
  locationContext = null,
  daylightPreference = "ALL_DAY",
  windowEdgePreference = "FRONT",
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
  onWindowEdgePreferenceChange,
  typeOptions = HABIT_TYPE_OPTIONS,
  recurrenceOptions = HABIT_RECURRENCE_OPTIONS,
  footerSlot,
  showDescriptionField = true,
}: HabitFormFieldsProps) {
  const normalizedRecurrence = recurrence.toLowerCase().trim();
  const showRecurrenceDayPicker = normalizedRecurrence === "every x days";

  const [skillSearchQuery, setSkillSearchQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(() => {
    const hasLocation = Boolean(locationContext && locationContext.trim());
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

  const handleToggleRecurrenceDay = (day: number) => {
    const hasDay = recurrenceDays.includes(day);
    const next = hasDay
      ? recurrenceDays.filter((value) => value !== day)
      : [...recurrenceDays, day].sort((a, b) => a - b);
    onRecurrenceDaysChange(next);
  };

  const locationValue = (locationContext ?? "").toUpperCase().trim() || "ANY";
  const daylightValue = (daylightPreference ?? "ALL_DAY").toUpperCase().trim();
  const windowEdgeValue = (windowEdgePreference ?? "FRONT")
    .toUpperCase()
    .trim();

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
      onLocationContextChange?.(result.option.value);
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
                  onLocationContextChange?.(value === "ANY" ? null : value)
                }
                disabled={locationOptionsLoading}
              >
                <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                  <SelectValue placeholder="Where does this habit happen?" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b101b] text-sm text-white">
                  {locationOptions.map((option) => (
                    <SelectItem key={option.id} value={option.value}>
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

      {footerSlot}
    </div>
  );
}
