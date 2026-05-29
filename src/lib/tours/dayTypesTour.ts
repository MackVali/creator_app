import type { TourStep } from "@/components/tour/TourProvider";

const TIME_BLOCK_SAVED_EVENT = "tour:time-block-saved";
const TIME_BLOCK_CREATE_OPENED_EVENT = "tour:time-block-create-opened";

const getInputValue = (selector: string) => {
  if (typeof document === "undefined") return "";
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) return "";
  return element.value.trim();
};

const hasTimeValue = (selector: string) => {
  if (typeof document === "undefined") return false;
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) return false;
  return element.value.trim().length > 0 && element.validity.valid;
};

const hasSelectedDay = () => {
  if (typeof document === "undefined") return false;
  const wrapper = document.querySelector('[data-tour="selected-time-block-days"]');
  if (wrapper?.getAttribute("data-tour-valid-days") === "true") {
    return true;
  }
  return Boolean(
    wrapper?.querySelector('button[aria-pressed="true"]')
  );
};

export const dayTypesTourSteps: TourStep[] = [
  {
    id: "day-types-create-time-block",
    selector: '[data-tour="day-type-add-block"]',
    title: "Create a Time Block",
    body: "Time Blocks are the parts of your day CREATOR is allowed to schedule inside. Empty time stays unavailable.",
    requiresClick: true,
    allowNext: false,
    advanceOnEvent: { type: "custom", eventName: TIME_BLOCK_CREATE_OPENED_EVENT },
  },
  {
    id: "day-types-set-up-time-block",
    selector: '[data-tour="time-block-create-panel"]',
    title: "Set up the block",
    body: "This form creates one available window CREATOR can use for scheduling.",
    allowNext: true,
    blockOutsideClicks: true,
    showSkip: true,
    waitForSelector: true,
  },
  {
    id: "day-types-name-time-block",
    selector: '[data-tour="selected-time-block-name"]',
    title: "Name the block",
    body: "Add a clear name before continuing.",
    allowNext: true,
    blockOutsideClicks: true,
    showSkip: true,
    canAdvance: () =>
      getInputValue('[data-tour="selected-time-block-name"]').length > 0,
    disabledReason: "Name the Time Block first.",
  },
  {
    id: "day-types-set-time",
    selector: '[data-tour="selected-time-block-time-range"]',
    title: "Set the time",
    body: "Choose when this block starts and ends before continuing.",
    allowNext: true,
    blockOutsideClicks: true,
    showSkip: true,
    canAdvance: () =>
      hasTimeValue('[data-tour="selected-time-block-start"]') &&
      hasTimeValue('[data-tour="selected-time-block-end"]'),
    disabledReason: "Add both start and end times first.",
  },
  {
    id: "day-types-choose-days",
    selector: '[data-tour="selected-time-block-days"]',
    title: "Choose the days",
    body: "Pick at least one weekday for this Time Block.",
    allowNext: true,
    blockOutsideClicks: true,
    showSkip: true,
    canAdvance: hasSelectedDay,
    disabledReason: "Choose at least one day first.",
    waitForSelector: true,
  },
  {
    id: "day-types-save-time-block",
    selector: '[data-tour="selected-time-block-save"]',
    title: "Save the block",
    body: "Save this Time Block so CREATOR has real space to schedule into.",
    requiresClick: true,
    allowNext: false,
    blockOutsideClicks: true,
    showSkip: true,
    advanceOnEvent: { type: "custom", eventName: TIME_BLOCK_SAVED_EVENT },
    waitForSelector: true,
  },
];
