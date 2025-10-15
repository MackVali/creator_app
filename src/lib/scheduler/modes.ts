export type SchedulerMode =
  | "regular"
  | "rush"
  | "monumental"
  | "skilled"
  | "rest";

export const SCHEDULER_MODE_OPTIONS: Array<{
  value: SchedulerMode;
  label: string;
  description: string;
}> = [
  {
    value: "regular",
    label: "Regular",
    description: "Use the standard scheduling rules.",
  },
  {
    value: "rush",
    label: "Rush",
    description: "Reduce durations by 20% to fit more into the day.",
  },
  {
    value: "monumental",
    label: "Monumental",
    description: "Focus today on a single monument's projects.",
  },
  {
    value: "skilled",
    label: "Skilled",
    description: "Work only on projects linked to selected skills today.",
  },
  {
    value: "rest",
    label: "Rest",
    description: "Limit scheduling to low-energy windows.",
  },
];

export function normalizeSchedulerMode(value: unknown): SchedulerMode {
  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim() as SchedulerMode;
    if (
      normalized === "regular" ||
      normalized === "rush" ||
      normalized === "monumental" ||
      normalized === "skilled" ||
      normalized === "rest"
    ) {
      return normalized;
    }
  }
  return "regular";
}

export function modeDurationMultiplier(mode: SchedulerMode): number {
  if (mode === "rush") {
    return 0.8;
  }
  return 1;
}

export function modeRequiresMonument(mode: SchedulerMode): boolean {
  return mode === "monumental";
}

export function modeRequiresSkills(mode: SchedulerMode): boolean {
  return mode === "skilled";
}

export function modeRestrictsProjectsToToday(mode: SchedulerMode): boolean {
  return mode === "monumental" || mode === "skilled";
}

export function restModeEnergy(energy: string | null | undefined): string {
  if (typeof energy === "string" && energy.trim().toUpperCase() === "NO") {
    return "NO";
  }
  return "LOW";
}
