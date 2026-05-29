import type { TourStep } from "@/components/tour/TourProvider";
import { DAY_TYPES_TOUR_PENDING_KEY } from "@/lib/tours/creatorTourState";

export const scheduleTourSteps: TourStep[] = [
  {
    id: "schedule-fab",
    selector: 'button[data-tour="fab"]',
    title: "The FAB works here too",
    body: "Use the FAB to add tasks, habits, and actions while planning your day.",
    requiresClick: true,
    allowNext: false,
    advanceOnEvent: { type: "custom", eventName: "tour:fab-opened" },
    onBeforeNext: () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tour:fab-request-close"));
      }
    },
  },
  {
    id: "schedule-jump-to-date",
    selector: '[data-tour="jump-to-date"]',
    title: "Jump to a day",
    body: "Use this to jump dates and set up scheduling windows.",
    requiresClick: true,
    allowNext: false,
  },
  {
    id: "schedule-create-day-type",
    selector: '[data-tour="create-day-type"]',
    title: "Create your first Time Block",
    body: "Time Blocks tell CREATOR when it is allowed to schedule work. Create one to start scheduling.",
    requiresClick: true,
    allowNext: false,
    onBeforeNext: () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DAY_TYPES_TOUR_PENDING_KEY, "1");
      }
    },
  },
];
