export type IlavCheckInType = "morning" | "midday" | "night";

export type IlavCheckInItem = {
  id: string;
  title: string;
  sourceType: string | null;
  sourceId: string | null;
  status: string | null;
  startAt: string | null;
  endAt: string | null;
  timeLabel: string | null;
};

export type IlavDueHabit = {
  id: string;
  name: string;
};

export type IlavCheckInPayload = {
  type: IlavCheckInType;
  creatorDay: string;
  timezone: string;
  generatedAt: string;
  prompt: string;
  scheduled: IlavCheckInItem[];
  completed: IlavCheckInItem[];
  missed: IlavCheckInItem[];
  upcoming: IlavCheckInItem[];
  dueHabits: IlavDueHabit[];
  counts: {
    scheduled: number;
    completed: number;
    missed: number;
    upcoming: number;
    dueHabits: number;
  };
};

export function isIlavCheckInType(value: unknown): value is IlavCheckInType {
  return value === "morning" || value === "midday" || value === "night";
}

export function checkInPrompt(type: IlavCheckInType) {
  if (type === "morning") {
    return "Everything look good, or is there anything about today we should account for?";
  }
  if (type === "midday") {
    return "How we looking so far? Anything happen that I should know about?";
  }
  return "Alright, what actually happened today? Anything here wrong before we close today out?";
}

function compactTitles(items: IlavCheckInItem[], max = 8) {
  const titles = items.slice(0, max).map((item) => item.title);
  if (items.length > max) titles.push(`+${items.length - max} more`);
  return titles;
}

export function buildIlavCheckInThreadContent(payload: IlavCheckInPayload) {
  const lines: string[] = [
    `ILAV ${payload.type} check-in for ${payload.creatorDay}.`,
  ];

  if (payload.type === "morning") {
    lines.push(
      `Scheduled today (${payload.scheduled.length}): ${compactTitles(payload.scheduled).join(", ") || "none"}.`,
    );
  } else {
    lines.push(
      `Completed (${payload.completed.length}): ${compactTitles(payload.completed).join(", ") || "none"}.`,
      `Missed (${payload.missed.length}): ${compactTitles(payload.missed).join(", ") || "none"}.`,
    );
    if (payload.type === "midday") {
      lines.push(
        `Upcoming (${payload.upcoming.length}): ${compactTitles(payload.upcoming).join(", ") || "none"}.`,
      );
    }
  }

  if (payload.dueHabits.length) {
    lines.push(
      `Unscheduled habits still due: ${payload.dueHabits.map((habit) => habit.name).join(", ")}.`,
    );
  }

  lines.push(payload.prompt);
  return lines.join("\n");
}
