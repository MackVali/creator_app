import type {
  HabitSkillSelectOption,
  HabitWindowSelectOption,
} from "@/components/habits/habit-form-fields";

export type HabitWindowOptionInput = {
  id: string;
  label: string;
  start_local?: string | null;
  end_local?: string | null;
  energy?: string | null;
};

export type HabitRoutineOptionInput = {
  id: string;
  name: string | null;
  description?: string | null;
};

export type HabitSkillOptionInput = {
  id: string;
  name: string | null;
  icon?: string | null;
};

export type HabitRoutineSelectOption = {
  value: string;
  label: string;
  description?: string | null;
  disabled?: boolean;
};

function formatTimeLabel(value: string | null | undefined) {
  if (!value) return null;

  const [hour, minute] = value.split(":");
  if (typeof hour === "undefined" || typeof minute === "undefined") {
    return null;
  }

  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);

  if (Number.isNaN(parsedHour) || Number.isNaN(parsedMinute)) {
    return null;
  }

  const date = new Date();
  date.setHours(parsedHour, parsedMinute, 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function parseStartMinutes(value: string | null | undefined) {
  if (!value) return null;

  const [hour, minute] = value.split(":");
  if (typeof hour === "undefined" || typeof minute === "undefined") {
    return null;
  }

  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);

  if (Number.isNaN(parsedHour) || Number.isNaN(parsedMinute)) {
    return null;
  }

  return parsedHour * 60 + parsedMinute;
}

function formatWindowMeta(window: HabitWindowOptionInput) {
  const start = formatTimeLabel(window.start_local ?? null);
  const end = formatTimeLabel(window.end_local ?? null);
  const energy = window.energy
    ? window.energy.replace(/[_-]+/g, " ").toLowerCase()
    : null;
  const parts: string[] = [];

  if (start && end) {
    parts.push(`${start} – ${end}`);
  }

  if (energy) {
    parts.push(`${energy} energy`);
  }

  return parts.join(" • ");
}

export function buildHabitWindowSelectOptions({
  windows,
  isLoading,
}: {
  windows: HabitWindowOptionInput[];
  isLoading: boolean;
}): HabitWindowSelectOption[] {
  if (isLoading) {
    return [
      {
        value: "none",
        label: "Loading windows…",
        disabled: true,
      },
    ];
  }

  if (windows.length === 0) {
    return [
      {
        value: "none",
        label: "No window preference",
      },
    ];
  }

  const sortedWindows = [...windows].sort((a, b) => {
    const aMinutes = parseStartMinutes(a.start_local ?? null);
    const bMinutes = parseStartMinutes(b.start_local ?? null);

    if (aMinutes === null && bMinutes === null) {
      return (a.label ?? "").localeCompare(b.label ?? "", undefined, {
        sensitivity: "base",
      });
    }

    if (aMinutes === null) return 1;
    if (bMinutes === null) return -1;

    const minuteComparison = aMinutes - bMinutes;
    if (minuteComparison !== 0) {
      return minuteComparison;
    }

    return (a.label ?? "").localeCompare(b.label ?? "", undefined, {
      sensitivity: "base",
    });
  });

  return [
    {
      value: "none",
      label: "No window preference",
    },
    ...sortedWindows.map((window) => {
      const description = formatWindowMeta(window);
      return {
        value: window.id,
        label: window.label,
        description: description ? description : null,
      } satisfies HabitWindowSelectOption;
    }),
  ];
}

export function buildHabitRoutineSelectOptions({
  routines,
  isLoading,
}: {
  routines: HabitRoutineOptionInput[];
  isLoading: boolean;
}): HabitRoutineSelectOption[] {
  if (isLoading) {
    return [
      {
        value: "none",
        label: "Loading routines…",
        disabled: true,
      },
    ];
  }

  const sortedRoutines = [...routines].sort((a, b) => {
    const aName = a.name?.trim() ?? "";
    const bName = b.name?.trim() ?? "";
    return aName.localeCompare(bName, undefined, { sensitivity: "base" });
  });

  return [
    {
      value: "none",
      label: "No routine",
    },
    ...sortedRoutines.map((routine) => ({
      value: routine.id,
      label: routine.name?.trim() ? routine.name : "Untitled routine",
      description: routine.description ?? null,
    })),
    {
      value: "__create__",
      label: "Create a new routine",
    },
  ];
}

export function buildHabitSkillSelectOptions({
  skills,
  isLoading,
}: {
  skills: HabitSkillOptionInput[];
  isLoading: boolean;
}): HabitSkillSelectOption[] {
  if (isLoading) {
    return [
      {
        value: "none",
        label: "Loading skills…",
        disabled: true,
      },
    ];
  }

  if (skills.length === 0) {
    return [
      {
        value: "none",
        label: "No skill focus",
      },
    ];
  }

  const sortedSkills = [...skills].sort((a, b) => {
    const aName = a.name?.trim() ?? "";
    const bName = b.name?.trim() ?? "";
    return aName.localeCompare(bName, undefined, { sensitivity: "base" });
  });

  return [
    {
      value: "none",
      label: "No skill focus",
    },
    ...sortedSkills.map((skill) => ({
      value: skill.id,
      label: skill.name?.trim() ? skill.name : "Untitled skill",
      icon: skill.icon ?? null,
    })),
  ];
}
