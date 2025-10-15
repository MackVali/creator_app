export type ScheduleItem = {
  id: string
  title: string
  start: string // ISO
  end: string   // ISO
  kind: "goal" | "project" | "task" | "habit"
  icon: "lotus" | "feather" | "fork" | "chat" | "diamond" | "dumbbell" | "book" | "film" | "work"
  muted?: boolean
}

// Helper to create today's date at specific hour
const todayAt = (hour: number) => {
  const date = new Date()
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

export const mockScheduleItems: ScheduleItem[] = [
  {
    id: "1",
    title: "Meditate",
    start: todayAt(7),
    end: todayAt(8),
    kind: "habit",
    icon: "lotus"
  },
  {
    id: "2",
    title: "Work",
    start: todayAt(8),
    end: todayAt(11),
    kind: "project",
    icon: "work",
    muted: true
  },
  {
    id: "3",
    title: "Write Article",
    start: todayAt(12),
    end: todayAt(13),
    kind: "task",
    icon: "feather"
  },
  {
    id: "4",
    title: "Lunch",
    start: todayAt(12),
    end: todayAt(13),
    kind: "habit",
    icon: "fork"
  },
  {
    id: "5",
    title: "Meeting",
    start: todayAt(13),
    end: todayAt(14),
    kind: "task",
    icon: "chat"
  },
  {
    id: "6",
    title: "Design Logo",
    start: todayAt(16),
    end: todayAt(17),
    kind: "task",
    icon: "diamond"
  },
  {
    id: "7",
    title: "Work",
    start: todayAt(17),
    end: todayAt(19),
    kind: "project",
    icon: "work",
    muted: true
  },
  {
    id: "8",
    title: "Gym",
    start: todayAt(19),
    end: todayAt(20),
    kind: "habit",
    icon: "dumbbell"
  },
  {
    id: "9",
    title: "Read",
    start: todayAt(20),
    end: todayAt(21),
    kind: "habit",
    icon: "book"
  },
  {
    id: "10",
    title: "Watch Movie",
    start: todayAt(21),
    end: todayAt(22),
    kind: "habit",
    icon: "film"
  }
]
