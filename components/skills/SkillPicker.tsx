"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SkillOption = {
  id: string;
  name: string;
  icon?: string | null;
};

interface SkillMultiPickerProps {
  skills: SkillOption[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  buttonClassName?: string;
  contentClassName?: string;
}

export function SkillMultiPicker({
  skills,
  selectedIds,
  onChange,
  placeholder = "Select skills",
  emptyLabel = "No skills available",
  loading = false,
  disabled = false,
  buttonClassName,
  contentClassName,
}: SkillMultiPickerProps) {
  const sortedSkills = useMemo(
    () =>
      [...skills].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [skills]
  );

  const selectedNames = useMemo(() => {
    const names = new Map(sortedSkills.map((skill) => [skill.id, skill.name]));
    return selectedIds
      .map((id) => names.get(id))
      .filter((name): name is string => Boolean(name));
  }, [selectedIds, sortedSkills]);

  const summary = loading
    ? "Loading skills…"
    : selectedNames.length === 0
    ? placeholder
    : selectedNames.length <= 2
    ? selectedNames.join(", ")
    : `${selectedNames.length} skills selected`;

  const handleToggle = (skillId: string) => {
    if (loading || disabled) {
      return;
    }
    const exists = selectedIds.includes(skillId);
    const next = exists
      ? selectedIds.filter((id) => id !== skillId)
      : [...selectedIds, skillId];
    onChange(Array.from(new Set(next)));
  };

  const hasSkills = sortedSkills.length > 0;
  const triggerDisabled = disabled || loading || !hasSkills;

  const buttonLabel = hasSkills ? summary : emptyLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={triggerDisabled}
          aria-label={buttonLabel}
          title={buttonLabel}
          className={cn(
            "h-10 w-full justify-between rounded-lg border border-white/10 bg-white/[0.05] text-left text-sm text-white",
            triggerDisabled && "cursor-not-allowed opacity-60",
            buttonClassName
          )}
        >
          <span className="truncate">{buttonLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={cn(
          "max-h-64 w-56 overflow-y-auto bg-[#0b101b] text-sm text-white",
          contentClassName
        )}
      >
        {hasSkills ? (
          sortedSkills.map((skill) => {
            const isSelected = selectedIds.includes(skill.id);
            return (
              <DropdownMenuCheckboxItem
                key={skill.id}
                checked={isSelected}
                onCheckedChange={() => handleToggle(skill.id)}
                className="capitalize"
              >
                {skill.name}
              </DropdownMenuCheckboxItem>
            );
          })
        ) : (
          <div className="px-3 py-2 text-xs text-white/60">{emptyLabel}</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SkillSinglePickerProps {
  skills: SkillOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
  noneLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
}

export function SkillSinglePicker({
  skills,
  value,
  onChange,
  placeholder = "Select a skill",
  noneLabel = "No skill focus",
  loading = false,
  disabled = false,
  triggerClassName,
  contentClassName,
}: SkillSinglePickerProps) {
  const sortedSkills = useMemo(
    () =>
      [...skills].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [skills]
  );

  const normalizedValue = value ?? "none";
  const isDisabled = disabled || loading;
  const selectedName = value
    ? sortedSkills.find((skill) => skill.id === value)?.name
    : null;
  const triggerLabel = loading
    ? "Loading skills…"
    : selectedName ?? placeholder;

  return (
    <Select
      value={normalizedValue}
      onValueChange={(next) => onChange(next === "none" ? null : next)}
      disabled={isDisabled}
    >
      <SelectTrigger
        aria-label={triggerLabel}
        title={triggerLabel}
        className={cn(
          "h-10 rounded-lg border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0",
          isDisabled && "cursor-not-allowed opacity-60",
          triggerClassName
        )}
      >
        <SelectValue placeholder={loading ? "Loading skills…" : placeholder} />
      </SelectTrigger>
      <SelectContent
        className={cn("bg-[#0b101b] text-sm text-white", contentClassName)}
      >
        <SelectItem value="none">{noneLabel}</SelectItem>
        {sortedSkills.map((skill) => (
          <SelectItem key={skill.id} value={skill.id}>
            {skill.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
