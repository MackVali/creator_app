import type { TourStep } from "@/components/tour/TourProvider";

export const scheduleTourSteps: TourStep[] = [
  {
    id: "schedule-fab",
    selector: 'button[data-tour="fab"]',
    title: "The FAB works here too",
    body: "Use the FAB to add tasks, habits, and actions while planning your day.",
  },
  {
    id: "schedule-jump-to-date",
    selector: '[data-tour="jump-to-date"]',
    title: "Jump to a day",
    body: "Use this to jump dates and set up Day Types.",
    requiresClick: true,
    allowNext: false,
    canSkip: false,
  },
  {
    id: "schedule-create-day-type",
    selector: '[data-tour="create-day-type"]',
    title: "Create your first Day Type",
    body: "Day Types are templates for how your day is structured. Create one to start scheduling.",
    requiresClick: true,
    allowNext: false,
    onBeforeNext: () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("tour:day-types:pending", "1");
      }
    },
    canSkip: false,
  },
];
