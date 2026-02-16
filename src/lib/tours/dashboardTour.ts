import type { TourStep } from "@/components/tour/TourProvider";

export const dashboardTourSteps: TourStep[] = [
  {
    id: "fab-main",
    selector: 'button[data-tour="fab"]',
    title: "Create anything",
    body: "Tap the floating action button to open the creator and explore all the options.",
    requiresClick: true,
    allowNext: false,
    waitForSelector: true,
  },
  {
    id: "nav-skills",
    selector: '[data-tour="nav-skills"]',
    title: "Skills & Categories",
    body: "Skills map your life areas and categories keep related focus grouped together.",
    requiresClick: false,
    allowNext: true,
  },
  {
    id: "new-monument",
    selector: '[data-tour="new-monument"]',
    title: "Monuments",
    body: "Monuments capture your long-term pursuits built up from goals and habits.",
    requiresClick: false,
    allowNext: true,
  },
  {
    id: "nav-schedule",
    selector: '[data-tour="nav-schedule"]',
    title: "Your schedule",
    body: "Tap Schedule to continue and keep your execution rhythm going.",
    requiresClick: true,
    allowNext: false,
    onBeforeNext: () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("tour:schedule:pending", "1");
      }
    },
  },
];
