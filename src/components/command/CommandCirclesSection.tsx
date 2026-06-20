"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import { createPortal } from "react-dom";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  Grid2x2,
  Grid3x3,
  Handshake,
  LockKeyhole,
  MapPin,
  MoreVertical,
  ShieldCheck,
  Target,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { CLOSE_ACTIVE_COMMAND_CIRCLE_DETAIL_EVENT } from "@/components/command/events";
import FlameEmber from "@/components/FlameEmber";
import { MemoCompletionDialog } from "@/components/schedule/MemoCompletionDialog";
import { MonumentGoalsList } from "@/components/monuments/MonumentGoalsList";
import { LazyFab } from "@/components/ui/LazyFab";
import type { FabEditTarget } from "@/components/ui/Fab";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToastHelpers } from "@/components/ui/toast";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";
import { MAX_SCHEDULE_LOOKAHEAD_DAYS } from "@/lib/scheduler/limits";
import {
  addDaysInTimeZone,
  formatDateKeyInTimeZone,
  normalizeTimeZone,
  startOfDayInTimeZone,
} from "@/lib/scheduler/timezone";
import { getSupabaseBrowser } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/supabase";

type CircleType = "HOUSEHOLD" | "TEAM" | "CLIENTS" | "STUDIO" | "CUSTOM";

type CircleMemberPreview = {
  userId: string;
  role: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  initials: string;
};

type CommandCircle = {
  id: string;
  owner_user_id: string;
  name: string;
  icon_emoji?: string | null;
  circle_type: CircleType;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  viewerRole?: string | null;
  activeMemberCount?: number;
  memberPreview?: CircleMemberPreview[];
};

type CircleUpdate = Partial<CommandCircle> & { id: string };

type CircleMember = {
  id: string;
  circle_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_by_user_id: string | null;
  skill_constraint_ids: string[];
  location_context_ids: string[];
  created_at: string;
  updated_at: string;
  profile: {
    user_id: string;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
  } | null;
};

type CircleHabit = {
  id: string;
  circle_id: string | null;
  name: string | null;
  habit_type: string | null;
  memo_capture_config: Database["public"]["Tables"]["habits"]["Row"]["memo_capture_config"];
  recurrence: string | null;
  recurrence_days: number[] | null;
  recurrence_mode: string | null;
  anchor_type: string | null;
  anchor_value: string | number | null;
  anchor_start_date: string | null;
  next_due_override: string | null;
  last_completed_at: string | null;
  current_streak_days: number | null;
  skill_id: string | null;
  routine_id: string | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
};

type CircleMemberDisplay = {
  id: string;
  userId: string;
  role: string;
  status: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  initials: string;
  isPreview: boolean;
  skillConstraintIds: string[];
  locationContextIds: string[];
};

type CommandCirclesSectionProps = {
  className?: string;
};

export type CommandCirclesSectionHandle = {
  refresh: () => Promise<void>;
  isDetailOpen: () => boolean;
};

type CircleDetailView = "goals" | "roadmap";
type CircleMemberRole = "MEMBER" | "OPERATOR" | "MANAGER" | "VIEWER";
type MemberConstraintField = "skill_constraint_ids" | "location_context_ids";
type OfferMode = "FIXED" | "FLEXIBLE";
type CircleHabitCardDensity = "large" | "small";
type MeasuredCircleRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};
type CircleAppViewportRect = {
  top: number;
  bottom: number;
  height: number;
};
type CircleDetailTransition = {
  circleId: string;
  phase: "opening" | "open" | "closing";
  sourceRect: MeasuredCircleRect;
  targetRect: MeasuredCircleRect;
  appViewportRect: CircleAppViewportRect;
  sourceBorderRadius: number;
  targetBorderRadius: number;
  closeRect: MeasuredCircleRect | null;
};

const CIRCLE_HABIT_GRID_CLASS =
  "-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const CIRCLE_HABIT_SMALL_GRID_CLASS =
  "-mx-2 grid grid-cols-4 gap-1.5 px-2 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7";
const CIRCLE_CARD_BORDER_RADIUS = 16;
const CIRCLE_DETAIL_BORDER_RADIUS = 24;
const CIRCLE_DETAIL_SAFE_TOP_GAP = 8;
const CIRCLE_HABIT_DOUBLE_TAP_MS = 350;
const CIRCLE_HABIT_LONG_PRESS_MS = 300;
const CIRCLE_HABIT_LONG_PRESS_SUPPRESS_MS = 1_000;
const CIRCLE_HABIT_OVERDUE_VISUAL_THRESHOLD_MS = 24 * 60 * 60 * 1000 * 7;
const CIRCLE_HABIT_MAX_LOOKAHEAD_DAYS = MAX_SCHEDULE_LOOKAHEAD_DAYS;
const CIRCLE_HABIT_NO_DUE_MATCH_RANK = CIRCLE_HABIT_MAX_LOOKAHEAD_DAYS + 1;
const CIRCLE_HABIT_COMPLETED_CARD_CLASS =
  "border-emerald-800/80 !bg-[#070b0d] !bg-[radial-gradient(circle_at_16%_0%,rgba(45,212,191,0.12),transparent_34%),radial-gradient(circle_at_88%_18%,rgba(16,185,129,0.10),transparent_36%),linear-gradient(135deg,rgba(6,78,59,0.22),rgba(3,12,14,0)_42%),linear-gradient(180deg,#11161a_0%,#090d10_55%,#050708_100%)] bg-clip-padding outline outline-1 -outline-offset-4 outline-emerald-400/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(45,212,191,0.22),inset_0_-10px_18px_rgba(0,0,0,0.34),0_0_0_1px_rgba(2,44,34,0.72),0_0_18px_-11px_rgba(16,185,129,0.58),0_10px_24px_-20px_rgba(0,0,0,0.85)]";
const CIRCLE_HABIT_COMPLETED_SHIMMER_CLASS =
  "pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-[linear-gradient(45deg,rgba(2,44,34,0.42),rgba(5,150,105,0.50),rgba(52,211,153,0.58),rgba(16,185,129,0.48),rgba(2,44,34,0.42))] bg-[length:400%_400%] p-[3px] opacity-85 animate-[steel-shimmer_3s_ease-in-out_infinite] [-webkit-mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [-webkit-mask-composite:xor] [mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [mask-composite:exclude]";
const CIRCLE_HABIT_COMPLETED_FACET_CLASS =
  "pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-[linear-gradient(135deg,rgba(2,44,34,0.95),transparent_18%)_top_left/42%_42%_no-repeat,linear-gradient(225deg,rgba(6,95,70,0.86),transparent_18%)_top_right/42%_42%_no-repeat,linear-gradient(45deg,rgba(3,67,54,0.90),transparent_18%)_bottom_left/42%_42%_no-repeat,linear-gradient(315deg,rgba(20,184,166,0.28),transparent_18%)_bottom_right/42%_42%_no-repeat] p-[2px] shadow-[inset_0_0_0_1px_rgba(5,150,105,0.36),inset_0_0_0_2px_rgba(2,44,34,0.50)] [-webkit-mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [-webkit-mask-composite:xor] [mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [mask-composite:exclude]";
const memberRoleOptions: CircleMemberRole[] = [
  "MEMBER",
  "OPERATOR",
  "MANAGER",
  "VIEWER",
];

type OwnerSkillOption = {
  id: string;
  name: string;
  icon?: string | null;
};

type OwnerLocationContextOption = {
  id: string;
  label: string | null;
  value: string | null;
};

type ConstraintOption = {
  id: string;
  label: string;
  icon?: string | null;
};

type CommandOfferTerms = {
  mode?: OfferMode;
  dateStart?: string;
  dateEnd?: string | null;
  daysOfWeek?: OfferWeekdayValue[];
  requiredMinutes?: number;
  fixedStartLocal?: string | null;
  fixedEndLocal?: string | null;
};

type IncomingOffer = {
  id: string;
  offer_type: string;
  status: string;
  circle_id: string;
  title: string | null;
  note: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  terms: CommandOfferTerms | null;
  created_at: string;
  offered_by_user_id: string;
  circle_name?: string | null;
  offered_by_profile?: {
    user_id: string;
    username: string | null;
    name: string | null;
  } | null;
};

type PendingMemberOffer = {
  id: string;
  offer_type: string;
  status: string;
  title: string | null;
  note: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  terms: CommandOfferTerms | null;
  created_at: string;
  updated_at: string;
};

type CommandAccessRule = {
  id: string;
  mode: string;
  starts_on: string | null;
  ends_on: string | null;
  days_of_week: string[] | null;
  start_local: string | null;
  end_local: string | null;
  required_minutes_per_day: number | null;
  required_minutes_per_week: number | null;
  timezone: string | null;
};

type CommandAccessState = {
  rules: CommandAccessRule[];
  isLoading: boolean;
  error: string | null;
};

type PendingMemberOffersState = {
  offers: PendingMemberOffer[];
  isLoading: boolean;
  error: string | null;
};

const elevatedRoles = new Set(["OWNER", "MANAGER", "OPERATOR"]);
const offerWeekdays = [
  { label: "Mon", value: "MON", jsDay: 1 },
  { label: "Tue", value: "TUE", jsDay: 2 },
  { label: "Wed", value: "WED", jsDay: 3 },
  { label: "Thu", value: "THU", jsDay: 4 },
  { label: "Fri", value: "FRI", jsDay: 5 },
  { label: "Sat", value: "SAT", jsDay: 6 },
  { label: "Sun", value: "SUN", jsDay: 0 },
] as const;

const offerTypeOptions = [
  { label: "Command Block", value: "COMMAND_BLOCK", disabled: false },
  { label: "Day Type", value: "DAY_TYPE", disabled: true },
  { label: "Product", value: "PRODUCT", disabled: true },
  { label: "Course", value: "COURSE", disabled: true },
  { label: "Appointment", value: "APPOINTMENT", disabled: true },
  { label: "Job", value: "JOB", disabled: true },
  { label: "Session", value: "SESSION", disabled: true },
  { label: "Service", value: "SERVICE", disabled: true },
  { label: "Collaboration", value: "COLLABORATION", disabled: true },
  { label: "Template", value: "TEMPLATE", disabled: true },
] as const;

type OfferWeekdayValue = (typeof offerWeekdays)[number]["value"];

function formatMemberCount(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

function measureCircleRect(rect: DOMRect): MeasuredCircleRect {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getCircleDetailPageScrollContainer() {
  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

function resetCircleDetailPageScroll() {
  const scrollContainer = getCircleDetailPageScrollContainer();

  if (scrollContainer.scrollTop <= 1 && scrollContainer.scrollLeft <= 1) {
    return false;
  }

  scrollContainer.scrollTo({
    top: 0,
    left: 0,
    behavior: "auto",
  });

  return true;
}

function getSafeAreaInsetTop() {
  if (typeof document === "undefined") {
    return 0;
  }

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.paddingTop = "env(safe-area-inset-top, 0px)";
  document.body.appendChild(probe);

  const safeAreaInsetTop = Number.parseFloat(
    window.getComputedStyle(probe).paddingTop,
  );

  probe.remove();

  return Number.isFinite(safeAreaInsetTop) ? safeAreaInsetTop : 0;
}

function getCircleAppViewportRect(): CircleAppViewportRect {
  const viewportHeight = window.innerHeight || 0;
  const topNav = document.querySelector<HTMLElement>(".app-top-nav");
  const safeAreaInsetTop = getSafeAreaInsetTop();

  let viewportTop =
    safeAreaInsetTop > 0
      ? Math.min(viewportHeight, safeAreaInsetTop + CIRCLE_DETAIL_SAFE_TOP_GAP)
      : 0;
  const viewportBottom = viewportHeight;

  if (topNav) {
    const topNavRect = topNav.getBoundingClientRect();

    if (topNavRect.bottom > 0 && topNavRect.top < viewportHeight) {
      viewportTop = Math.max(
        viewportTop,
        Math.min(topNavRect.bottom, viewportHeight),
      );
    }
  }

  return {
    top: viewportTop,
    bottom: viewportBottom,
    height: Math.max(0, viewportBottom - viewportTop),
  };
}

function getCircleDetailPopupRect(
  appViewportRect = getCircleAppViewportRect(),
): MeasuredCircleRect {
  const viewportWidth = window.innerWidth || 0;

  const horizontalInset =
    viewportWidth >= 1280
      ? 64
      : viewportWidth >= 1024
        ? 48
        : viewportWidth >= 640
          ? 32
          : 12;

  const maxWidth =
    viewportWidth >= 1280
      ? 1160
      : viewportWidth >= 1024
        ? 960
        : viewportWidth >= 640
          ? 640
          : 420;

  const availableWidth = Math.max(260, viewportWidth - horizontalInset * 2);
  const width = Math.min(maxWidth, availableWidth);

  return {
    top: appViewportRect.top,
    left: Math.max(horizontalInset, (viewportWidth - width) / 2),
    width,
    height: appViewportRect.height,
  };
}

function getCircleDetailTransform(
  rect: MeasuredCircleRect,
  targetRect: MeasuredCircleRect,
) {
  return {
    x: rect.left - targetRect.left,
    y: rect.top - targetRect.top,
    scaleX: targetRect.width > 0 ? rect.width / targetRect.width : 1,
    scaleY: targetRect.height > 0 ? rect.height / targetRect.height : 1,
  };
}

function getElementBorderRadius(element: HTMLElement) {
  const radius = Number.parseFloat(getComputedStyle(element).borderRadius);

  return Number.isFinite(radius) ? radius : CIRCLE_CARD_BORDER_RADIUS;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function formatMemberStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateInputValue(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

function formatTimeInputValue(date: Date) {
  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function getInitialOfferWindow() {
  const start = new Date();
  start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  return {
    date: formatDateInputValue(start),
    startTime: formatTimeInputValue(start),
    endTime: formatTimeInputValue(end),
  };
}

function getWeekdayValue(date: Date): OfferWeekdayValue {
  return (
    offerWeekdays.find((weekday) => weekday.jsDay === date.getDay())?.value ??
    "MON"
  );
}

function formatCommandAccessDays(daysOfWeek: string[] | null) {
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
    return "Days not set";
  }

  const selectedDays = new Set(
    daysOfWeek.map((day) => day.trim().toUpperCase()).filter(Boolean),
  );

  if (selectedDays.size === offerWeekdays.length) {
    return "Every day";
  }

  const weekdaysOnly = offerWeekdays
    .filter((day) => day.value !== "SAT" && day.value !== "SUN")
    .every((day) => selectedDays.has(day.value));
  const weekendSelected = selectedDays.has("SAT") || selectedDays.has("SUN");

  if (selectedDays.size === 5 && weekdaysOnly && !weekendSelected) {
    return "Weekdays";
  }

  const labels = offerWeekdays
    .filter((weekday) => selectedDays.has(weekday.value))
    .map((weekday) => weekday.label);

  return labels.length > 0 ? labels.join(", ") : "Days not set";
}

function formatCommandAccessDate(value: string | null) {
  if (!value) return null;

  const date = parseDateInputValue(value);

  if (!date) return null;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatCommandAccessDateRange(
  startsOn: string | null,
  endsOn: string | null,
) {
  const startLabel = formatCommandAccessDate(startsOn);
  const endLabel = formatCommandAccessDate(endsOn);

  if (startLabel && endLabel) {
    return `${startLabel} - ${endLabel}`;
  }

  if (startLabel) {
    return `Starts ${startLabel} · No end date`;
  }

  if (endLabel) {
    return `Ends ${endLabel}`;
  }

  return "Date range not set";
}

function formatCommandAccessLocalTime(value: string | null) {
  if (!value) return null;

  const [hourPart, minutePart] = value.split(":");
  const hours = Number(hourPart);
  const minutes = Number(minutePart);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${padDatePart(minutes)} ${period}`;
}

function formatCommandAccessTimeRange(rule: CommandAccessRule) {
  const startLabel = formatCommandAccessLocalTime(rule.start_local);
  const endLabel = formatCommandAccessLocalTime(rule.end_local);

  if (startLabel && endLabel) {
    return `${startLabel} - ${endLabel}`;
  }

  if (rule.required_minutes_per_day) {
    return `${rule.required_minutes_per_day} min/day`;
  }

  if (rule.required_minutes_per_week) {
    return `${rule.required_minutes_per_week} min/week`;
  }

  return "Time not set";
}

function parseDateInputValue(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function getFirstSelectedDateInRange(
  dateStart: string,
  dateEnd: string | null,
  daysOfWeek: OfferWeekdayValue[],
) {
  const start = parseDateInputValue(dateStart);
  const end = dateEnd ? parseDateInputValue(dateEnd) : null;

  if (!start || (dateEnd && !end) || (end && end.getTime() < start.getTime())) {
    return null;
  }

  const selectedDays = new Set(daysOfWeek);
  const current = new Date(start);
  const searchEnd = new Date(start);
  searchEnd.setDate(searchEnd.getDate() + 6);

  if (end && end.getTime() < searchEnd.getTime()) {
    searchEnd.setTime(end.getTime());
  }

  while (current.getTime() <= searchEnd.getTime()) {
    if (selectedDays.has(getWeekdayValue(current))) {
      return formatDateInputValue(current);
    }

    current.setDate(current.getDate() + 1);
  }

  return null;
}

function getMinutesBetweenTimes(startTime: string, endTime: string) {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);

  if (
    !Number.isInteger(startHours) ||
    !Number.isInteger(startMinutes) ||
    !Number.isInteger(endHours) ||
    !Number.isInteger(endMinutes)
  ) {
    return null;
  }

  return endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
}

function buildLocalDateTime(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes
  ) {
    return null;
  }

  return date;
}

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function formatOfferDateValue(dateValue: string | null | undefined) {
  if (!dateValue) return null;

  const date = parseDateInputValue(dateValue);

  if (!date) return dateValue;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatOfferDateRange(terms: CommandOfferTerms | null) {
  const start = formatOfferDateValue(terms?.dateStart);
  const end = formatOfferDateValue(terms?.dateEnd);

  if (start && end && start !== end) {
    return `${start} - ${end}`;
  }

  return start ?? end ?? "Dates not set";
}

function formatOfferDays(terms: CommandOfferTerms | null) {
  const selectedDays = new Set(terms?.daysOfWeek ?? []);
  const labels = offerWeekdays
    .filter((weekday) => selectedDays.has(weekday.value))
    .map((weekday) => weekday.label);

  return labels.length > 0 ? labels.join(", ") : "No days selected";
}

function formatOfferDuration(minutes: number | null | undefined) {
  if (
    typeof minutes !== "number" ||
    !Number.isFinite(minutes) ||
    minutes <= 0
  ) {
    return "Hours not set";
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  if (minutes > 60) {
    const hours = Number((minutes / 60).toFixed(1));
    return `${hours} hours`;
  }

  return `${minutes} min`;
}

function formatOfferTimeRange(terms: CommandOfferTerms | null) {
  if (!terms?.fixedStartLocal || !terms.fixedEndLocal) {
    return "Time not set";
  }

  return `${terms.fixedStartLocal} - ${terms.fixedEndLocal}`;
}

function formatPendingOfferTimeRange(terms: CommandOfferTerms | null) {
  if (terms?.mode === "FLEXIBLE") {
    return formatOfferDuration(terms.requiredMinutes);
  }

  const startLabel = formatCommandAccessLocalTime(
    terms?.fixedStartLocal ?? null,
  );
  const endLabel = formatCommandAccessLocalTime(terms?.fixedEndLocal ?? null);

  if (startLabel && endLabel) {
    return `${startLabel} - ${endLabel}`;
  }

  return formatOfferTimeRange(terms);
}

function getOfferSenderName(offer: IncomingOffer) {
  return (
    offer.offered_by_profile?.name?.trim() ||
    offer.offered_by_profile?.username?.trim() ||
    null
  );
}

function normalizeCircleHabitType(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() || "HABIT";
  return normalized === "ASYNC" ? "SYNC" : normalized;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRecurrenceCode(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function isDailyCircleHabitRecurrence(habit: CircleHabit): boolean {
  const recurrence = getRecurrenceCode(habit.recurrence);
  return (
    recurrence === "" ||
    recurrence === "daily" ||
    recurrence === "none" ||
    recurrence === "everyday"
  );
}

function getCircleHabitOverdueFallbackStart(
  habit: CircleHabit,
  date: Date,
  timeZone: string,
): Date | null {
  if (!isDailyCircleHabitRecurrence(habit)) return null;

  const lastCompletedAt = parseOptionalDate(habit.last_completed_at);
  if (lastCompletedAt) {
    return addDaysInTimeZone(
      startOfDayInTimeZone(lastCompletedAt, timeZone),
      1,
      timeZone,
    );
  }

  const nextDueOverride = parseOptionalDate(habit.next_due_override);
  if (nextDueOverride && nextDueOverride.getTime() <= date.getTime()) {
    return startOfDayInTimeZone(nextDueOverride, timeZone);
  }

  const anchorStartDate = parseOptionalDate(habit.anchor_start_date);
  if (anchorStartDate) return startOfDayInTimeZone(anchorStartDate, timeZone);

  const createdAt = parseOptionalDate(habit.created_at);
  if (createdAt) return startOfDayInTimeZone(createdAt, timeZone);

  const updatedAt = parseOptionalDate(habit.updated_at);
  if (updatedAt) return startOfDayInTimeZone(updatedAt, timeZone);

  return null;
}

function buildCircleScheduleHabit(habit: CircleHabit): HabitScheduleItem {
  return {
    id: habit.id,
    name: habit.name?.trim() || "Untitled habit",
    memoCaptureConfig: habit.memo_capture_config ?? null,
    durationMinutes: null,
    createdAt: habit.created_at ?? null,
    updatedAt: habit.updated_at ?? null,
    lastCompletedAt: habit.last_completed_at,
    currentStreakDays: habit.current_streak_days ?? 0,
    longestStreakDays: 0,
    habitType: normalizeCircleHabitType(habit.habit_type),
    windowId: null,
    energy: null,
    recurrence: habit.recurrence,
    recurrenceDays: habit.recurrence_days,
    recurrenceMode: habit.recurrence_mode,
    anchorType: habit.anchor_type,
    anchorValue:
      typeof habit.anchor_value === "number"
        ? String(habit.anchor_value)
        : habit.anchor_value,
    anchorStartDate: habit.anchor_start_date,
    skillId: habit.skill_id,
    goalId: null,
    completionTarget: null,
    locationContextId: null,
    locationContextValue: null,
    locationContextName: null,
    daylightPreference: null,
    windowEdgePreference: null,
    nextDueOverride: habit.next_due_override,
    window: null,
  } satisfies HabitScheduleItem;
}

function getCircleHabitOverdueStart({
  habit,
  evaluation,
  date,
  timeZone,
}: {
  habit: CircleHabit;
  evaluation: ReturnType<typeof evaluateHabitDueOnDate>;
  date: Date;
  timeZone: string;
}): Date | null {
  if (!evaluation.isDue) return null;

  const dueStart = evaluation.dueStart ?? null;
  const dayStart = startOfDayInTimeZone(date, timeZone);
  const dueStartDay = dueStart
    ? startOfDayInTimeZone(dueStart, timeZone)
    : null;
  const shouldUseFallback =
    dueStartDay?.getTime() === dayStart.getTime() &&
    (evaluation.debugTag === "DUE_DAILY" ||
      evaluation.debugTag === "DUE_NO_ANCHOR");

  if (!shouldUseFallback) return dueStart;

  return getCircleHabitOverdueFallbackStart(habit, date, timeZone) ?? dueStart;
}

function computeCircleHabitDueStatus(
  habit: CircleHabit,
  timeZone: string,
): { label: string; rank: number } {
  const normalizedZone = normalizeTimeZone(timeZone);
  const scheduleHabit = buildCircleScheduleHabit(habit);
  const today = new Date();
  const nextDueOverride = parseOptionalDate(habit.next_due_override);

  const todayEvaluation = evaluateHabitDueOnDate({
    habit: scheduleHabit,
    date: today,
    timeZone: normalizedZone,
    nextDueOverride,
  });

  if (todayEvaluation.isDue) {
    const overdueStart = getCircleHabitOverdueStart({
      habit,
      evaluation: todayEvaluation,
      date: today,
      timeZone: normalizedZone,
    });
    const overdueStartMs = overdueStart?.getTime();
    const isOverdue =
      typeof overdueStartMs === "number" &&
      Number.isFinite(overdueStartMs) &&
      today.getTime() - overdueStartMs >=
        CIRCLE_HABIT_OVERDUE_VISUAL_THRESHOLD_MS;

    return { label: isOverdue ? "OVERDUE" : "DUE", rank: 0 };
  }

  for (
    let dayOffset = 1;
    dayOffset <= CIRCLE_HABIT_MAX_LOOKAHEAD_DAYS;
    dayOffset += 1
  ) {
    const futureDate = new Date(
      today.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
    const evaluation = evaluateHabitDueOnDate({
      habit: scheduleHabit,
      date: futureDate,
      timeZone: normalizedZone,
      nextDueOverride,
    });

    if (evaluation.isDue) {
      return {
        label: `${dayOffset} ${dayOffset === 1 ? "DAY" : "DAYS"}`,
        rank: dayOffset,
      };
    }
  }

  return { label: "No Due Match", rank: CIRCLE_HABIT_NO_DUE_MATCH_RANK };
}

function wasCircleHabitCompletedOnDate(
  habit: Pick<CircleHabit, "last_completed_at">,
  dateKey: string,
  timeZone: string,
): boolean {
  const lastCompletedAt = parseOptionalDate(habit.last_completed_at);
  if (!lastCompletedAt) return false;

  return formatDateKeyInTimeZone(lastCompletedAt, timeZone) === dateKey;
}

function getCircleHabitTypePriority(
  habitType: string | null | undefined,
): number {
  const normalized = normalizeCircleHabitType(habitType);
  if (normalized === "CHORE") return 0;
  if (normalized === "SYNC") return 2;
  if (
    normalized === "HABIT" ||
    normalized === "PRACTICE" ||
    normalized === "RELAXER" ||
    normalized === "MEMO"
  ) {
    return 1;
  }
  return 3;
}

function getCircleHabitCardTypeClass(habitType: string | null | undefined) {
  const normalized = normalizeCircleHabitType(habitType);

  if (normalized === "CHORE") {
    return "!bg-[radial-gradient(circle_at_10%_-25%,rgba(159,18,57,0.32),transparent_58%),linear-gradient(135deg,rgba(31,9,12,0.98)_0%,rgba(76,18,27,0.94)_48%,rgba(111,26,39,0.76)_100%)]";
  }

  if (normalized === "SYNC" || normalized === "MEMO") return "habit-card--sync-gray";

  if (normalized === "PRACTICE") {
    return "!bg-[radial-gradient(circle_at_6%_-14%,rgba(79,70,229,0.22),transparent_60%),linear-gradient(142deg,rgba(8,9,20,0.98)_0%,rgba(24,27,51,0.95)_46%,rgba(50,55,92,0.68)_100%)]";
  }

  if (normalized === "RELAXER") {
    return "!bg-[radial-gradient(circle_at_8%_-18%,rgba(6,95,70,0.34),transparent_60%),linear-gradient(138deg,rgba(3,24,18,0.98)_0%,rgba(5,68,51,0.94)_48%,rgba(6,95,70,0.74)_100%)]";
  }

  return "!bg-[radial-gradient(circle_at_0%_0%,rgba(82,82,91,0.2),transparent_58%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(20,20,23,0.96)_48%,rgba(50,50,57,0.72)_100%)]";
}

function getCircleHabitCardBorderClass(habitType: string | null | undefined) {
  const normalized = normalizeCircleHabitType(habitType);

  if (normalized === "CHORE") return "border-rose-200/45";
  if (normalized === "SYNC" || normalized === "MEMO") {
    return "border-zinc-300/35";
  }
  if (normalized === "PRACTICE") return "border-slate-500/50";
  if (normalized === "RELAXER") return "border-emerald-200/60";

  return "border-black/70";
}

function shortenUserId(userId: string) {
  if (userId.length <= 12) {
    return userId;
  }

  return `${userId.slice(0, 6)}...${userId.slice(-4)}`;
}

function getCircleInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return (words[0]?.slice(0, 2) || "CI").toUpperCase();
}

function getCircleIconDisplay(iconEmoji: string | null | undefined) {
  const trimmed = iconEmoji?.trim();

  return trimmed || null;
}

function getMemberInitials(displayName: string, fallback: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return (words[0]?.slice(0, 2) || fallback.slice(0, 2)).toUpperCase();
}

function normalizeFullMember(member: CircleMember): CircleMemberDisplay {
  const fallback = shortenUserId(member.user_id);
  const profileName = member.profile?.name?.trim();
  const username = member.profile?.username?.trim() || null;
  const displayName = profileName || username || fallback;

  return {
    id: member.id,
    userId: member.user_id,
    role: member.role,
    status: member.status,
    displayName,
    username,
    avatarUrl: member.profile?.avatar_url?.trim() || null,
    initials: getMemberInitials(displayName, fallback),
    isPreview: false,
    skillConstraintIds: normalizeStringArray(member.skill_constraint_ids),
    locationContextIds: normalizeStringArray(member.location_context_ids),
  };
}

function normalizePreviewMember(
  member: CircleMemberPreview,
): CircleMemberDisplay {
  return {
    id: member.userId,
    userId: member.userId,
    role: member.role,
    status: "ACTIVE",
    displayName: member.displayName,
    username: member.username,
    avatarUrl: member.avatarUrl,
    initials: member.initials,
    isPreview: true,
    skillConstraintIds: [],
    locationContextIds: [],
  };
}

function AvatarStack({
  members,
  fallbackName,
}: {
  members: CircleMemberPreview[];
  fallbackName: string;
}) {
  const visibleMembers = members.slice(0, 3);

  if (visibleMembers.length === 0) {
    return (
      <div className="flex -space-x-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-[10px] font-semibold text-white/65 shadow-lg shadow-black/30">
          {getCircleInitials(fallbackName)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex -space-x-2">
      {visibleMembers.map((member) => (
        <div
          key={member.userId}
          aria-label={member.displayName}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#121417] bg-zinc-800 bg-cover bg-center text-[10px] font-semibold text-white shadow-lg shadow-black/40 ring-1 ring-white/12"
          style={
            member.avatarUrl
              ? { backgroundImage: `url(${member.avatarUrl})` }
              : undefined
          }
          title={member.displayName}
        >
          {member.avatarUrl ? null : member.initials}
        </div>
      ))}
    </div>
  );
}

function MemberAvatar({
  member,
  className,
}: {
  member: CircleMemberDisplay;
  className?: string;
}) {
  return (
    <span
      aria-label={member.displayName}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-zinc-800 bg-cover bg-center text-xs font-semibold text-white shadow-lg shadow-black/35 ring-1 ring-white/10",
        className,
      )}
      style={
        member.avatarUrl
          ? { backgroundImage: `url(${member.avatarUrl})` }
          : undefined
      }
    >
      {member.avatarUrl ? null : member.initials}
    </span>
  );
}

const CircleCard = forwardRef<
  HTMLButtonElement,
  {
    circle: CommandCircle;
    isHidden: boolean;
    onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  }
>(function CircleCard({ circle, isHidden, onSelect }, ref) {
  const memberCount = circle.activeMemberCount ?? 0;
  const members = circle.memberPreview ?? [];
  const role = circle.viewerRole?.toUpperCase() ?? null;
  const circleIcon = getCircleIconDisplay(circle.icon_emoji);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative min-h-[156px] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.13),transparent_32%),linear-gradient(145deg,rgba(25,25,28,0.96),rgba(5,5,6,0.98))] p-4 text-left shadow-[0_24px_70px_rgba(0,0,0,0.42)] transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70",
        isHidden && "pointer-events-none opacity-0",
      )}
    >
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            className="truncate text-lg font-semibold text-white"
          >
            {circle.name}
          </h2>
        </div>
        {role && elevatedRoles.has(role) ? (
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-white/58">
            {role}
          </span>
        ) : null}
      </div>

      {circle.description?.trim() ? (
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/52">
          {circle.description}
        </p>
      ) : null}

      <div
        className={cn(
          "flex items-center justify-between gap-4",
          circle.description?.trim() ? "mt-6" : "mt-8",
        )}
      >
        <div className="flex items-center gap-3">
          <AvatarStack members={members} fallbackName={circle.name} />
          <span className="text-sm font-medium text-white/68">
            {formatMemberCount(memberCount)}
          </span>
        </div>
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/55 transition group-hover:border-white/20 group-hover:text-white",
            circleIcon && "px-1 text-center text-sm font-semibold leading-none",
          )}
          aria-label={circleIcon ? `Circle icon: ${circleIcon}` : undefined}
        >
          {circleIcon ? (
            <span className="max-w-full truncate">{circleIcon}</span>
          ) : (
            <Users className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </div>
    </button>
  );
});

function MemberDetailEmptyRow({
  Icon,
  text,
  secondaryText,
}: {
  Icon: LucideIcon;
  text: string;
  secondaryText?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-white/10 bg-black/20 p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/48 ring-1 ring-white/10">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="pt-1">
        <p className="text-xs leading-5 text-white/58">{text}</p>
        {secondaryText ? (
          <p className="mt-1 text-xs leading-5 text-white/42">
            {secondaryText}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MemberDetailAccordionSection({
  id,
  title,
  Icon,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  Icon: LucideIcon;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = `${id}-content`;

  return (
    <section className="border-t border-white/[0.07] first:border-t-0">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 py-3 text-left text-white/52 transition hover:text-white/78 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 text-white/42" aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-white/58">
            {title}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-white/38 transition-transform",
            isOpen ? "rotate-180" : "",
          )}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.26, ease: "easeInOut" },
              opacity: { duration: 0.18, ease: "easeInOut" },
            }}
            className="overflow-hidden"
          >
            <div className="pb-4 pt-0.5">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function getConstraintLabel(
  id: string,
  optionById: Map<string, ConstraintOption>,
) {
  return optionById.get(id)?.label ?? shortenUserId(id);
}

function ConstraintPillList({
  selectedIds,
  optionById,
  emptyLabel,
}: {
  selectedIds: string[];
  optionById: Map<string, ConstraintOption>;
  emptyLabel: string;
}) {
  if (selectedIds.length === 0) {
    return (
      <p className="mt-1 text-sm font-medium leading-5 text-white/52">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
      {selectedIds.map((id) => {
        const option = optionById.get(id);

        return (
          <span
            key={id}
            className="inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.055] px-2.5 py-1 text-[11px] font-semibold leading-none text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          >
            {option?.icon ? (
              <span
                className="shrink-0 text-xs leading-none"
                aria-hidden="true"
              >
                {option.icon}
              </span>
            ) : null}
            <span className="min-w-0 truncate">
              {getConstraintLabel(id, optionById)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function WorkProfileRowLabel({
  Icon,
  label,
}: {
  Icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
      <Icon className="h-3.5 w-3.5 text-white/32" aria-hidden="true" />
      <h6>{label}</h6>
    </div>
  );
}

function WorkProfileConstraintMultiSelect({
  Icon,
  label,
  options,
  selectedIds,
  emptyLabel,
  noOptionsLabel,
  canEdit,
  isSaving,
  onChange,
}: {
  Icon: LucideIcon;
  label: string;
  options: ConstraintOption[];
  selectedIds: string[];
  emptyLabel: string;
  noOptionsLabel: string;
  canEdit: boolean;
  isSaving: boolean;
  onChange: (nextIds: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const optionById = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const canOpen = canEdit && !isSaving && options.length > 0;
  const canReset = canEdit && !isSaving && selectedIds.length > 0;

  useEffect(() => {
    if (!canOpen) {
      setIsOpen(false);
    }
  }, [canOpen]);

  return (
    <div className="relative min-w-0">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <WorkProfileRowLabel Icon={Icon} label={label} />
          <ConstraintPillList
            selectedIds={selectedIds}
            optionById={optionById}
            emptyLabel={emptyLabel}
          />
          {isSaving ? (
            <p className="mt-1 text-xs font-medium text-white/38">Saving...</p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {canReset ? (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onChange([]);
                }}
                className="h-7 rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-semibold text-white/55 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              >
                Reset
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (canOpen) {
                  setIsOpen((current) => !current);
                }
              }}
              disabled={!canOpen}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition enabled:hover:border-white/20 enabled:hover:bg-white/[0.08] enabled:hover:text-white disabled:cursor-default disabled:opacity-40"
              aria-label={`Edit ${label}`}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
            >
              <ChevronDown
                className={cn("h-4 w-4 transition", isOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>
          </div>
        ) : null}
      </div>

      {options.length === 0 ? (
        <p className="mt-2 text-xs font-medium text-white/38">
          {noOptionsLabel}
        </p>
      ) : null}

      {isOpen && canOpen ? (
        <div
          className="absolute left-0 top-full z-30 mt-2 max-h-56 w-full min-w-56 overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/95 p-1 shadow-2xl shadow-black/50 ring-1 ring-white/5"
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => {
            const isSelected = selectedSet.has(option.id);

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  const nextIds = isSelected
                    ? selectedIds.filter((id) => id !== option.id)
                    : [...selectedIds, option.id];

                  onChange(nextIds);
                }}
                className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-white/75 transition hover:bg-white/[0.07]"
                role="option"
                aria-selected={isSelected}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    isSelected
                      ? "border-emerald-300/60 bg-emerald-300/20 text-emerald-100"
                      : "border-white/15 bg-white/[0.03] text-transparent",
                  )}
                  aria-hidden="true"
                >
                  <Check className="h-3 w-3" />
                </span>
                {option.icon ? (
                  <span className="shrink-0 text-sm" aria-hidden="true">
                    {option.icon}
                  </span>
                ) : null}
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function WorkProfileConstraintReadOnly({
  Icon,
  label,
  options,
  selectedIds,
  emptyLabel,
}: {
  Icon: LucideIcon;
  label: string;
  options: ConstraintOption[];
  selectedIds: string[];
  emptyLabel: string;
}) {
  const optionById = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  );

  return (
    <div className="min-w-0">
      <WorkProfileRowLabel Icon={Icon} label={label} />
      <ConstraintPillList
        selectedIds={selectedIds}
        optionById={optionById}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}

function CommandAccessAvailabilityRow({
  commandAccess,
  pendingOffers,
  cancellingOfferId,
  cancelOfferError,
  onCancelOffer,
}: {
  commandAccess: CommandAccessState;
  pendingOffers: PendingMemberOffersState;
  cancellingOfferId: string | null;
  cancelOfferError: string | null;
  onCancelOffer?: (offerId: string) => Promise<void>;
}) {
  const hasRules = commandAccess.rules.length > 0;
  const hasPendingOffers = pendingOffers.offers.length > 0;

  return (
    <div className="min-w-0">
      <WorkProfileRowLabel Icon={CalendarDays} label="Availability" />

      <div className="mt-2 grid gap-2">
        {commandAccess.isLoading ? (
          <p className="text-sm font-medium leading-5 text-white/58">
            Loading command access...
          </p>
        ) : commandAccess.error ? (
          <div>
            <p className="text-sm font-semibold text-amber-50/82">
              Unable to load command access.
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/65">
              {commandAccess.error}
            </p>
          </div>
        ) : (
          <>
            {hasRules
              ? commandAccess.rules.map((rule) => {
                  const isFixed = rule.mode.toUpperCase() === "FIXED";

                  return (
                    <article
                      key={rule.id}
                      className="w-full border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0"
                    >
                      {isFixed ? (
                        <div className="grid gap-1.5 sm:grid-cols-[minmax(0,0.8fr)_minmax(11rem,1fr)_auto] sm:items-center sm:gap-3">
                          <p className="min-w-0 text-sm font-medium leading-5 text-white/64">
                            {formatCommandAccessDays(rule.days_of_week)}
                          </p>
                          <p className="text-lg font-semibold leading-6 text-white sm:text-center">
                            {formatCommandAccessTimeRange(rule)}
                          </p>
                          <p className="text-[11px] font-medium leading-4 text-white/42 sm:text-right">
                            {formatCommandAccessDateRange(
                              rule.starts_on,
                              rule.ends_on,
                            )}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs leading-5 text-white/50">
                          Flexible command access display is coming later.
                        </p>
                      )}
                    </article>
                  );
                })
              : null}

            {hasPendingOffers
              ? pendingOffers.offers.map((offer) => (
                  <article
                    key={offer.id}
                    className="w-full border-t border-white/[0.06] pt-2 first:border-t-0 first:pt-0"
                  >
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(11rem,1fr)_auto] sm:items-center sm:gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">
                          Pending offer
                        </p>
                        <p className="mt-1 text-sm font-medium leading-5 text-white/58">
                          {formatOfferDays(offer.terms)}
                        </p>
                      </div>
                      <p className="text-base font-semibold leading-6 text-white/78 sm:text-center">
                        {formatPendingOfferTimeRange(offer.terms)}
                      </p>
                      <div className="flex flex-col gap-2 sm:items-end">
                        <p className="text-[11px] font-medium leading-4 text-white/38 sm:text-right">
                          {formatOfferDateRange(offer.terms)}
                        </p>
                        {onCancelOffer ? (
                          <button
                            type="button"
                            onClick={() => {
                              void onCancelOffer(offer.id);
                            }}
                            disabled={cancellingOfferId === offer.id}
                            className="h-7 min-w-[5.75rem] rounded-full border border-white/12 bg-transparent px-2.5 text-[11px] font-semibold text-white/45 transition hover:border-white/22 hover:bg-white/[0.05] hover:text-white/70 disabled:cursor-not-allowed disabled:border-white/8 disabled:text-white/28"
                          >
                            {cancellingOfferId === offer.id
                              ? "Cancelling..."
                              : "Cancel"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              : null}

            {!hasRules && !hasPendingOffers && !pendingOffers.isLoading ? (
              <>
                <p className="text-sm font-medium leading-5 text-white/68">
                  No accepted command access yet.
                </p>
                <p className="text-xs leading-5 text-white/48">
                  Make an offer to request schedule access from this member.
                </p>
              </>
            ) : null}

            {pendingOffers.isLoading ? (
              <p className="px-1 text-xs leading-5 text-white/38">
                Checking pending offers...
              </p>
            ) : null}

            {pendingOffers.error ? (
              <p className="px-1 text-xs leading-5 text-amber-100/55">
                Pending offers unavailable.
              </p>
            ) : null}

            {cancelOfferError ? (
              <p className="text-xs leading-5 text-amber-50/75">
                {cancelOfferError}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function MakeOfferModal({
  circle,
  member,
  onClose,
  onCreated,
}: {
  circle: CommandCircle;
  member: CircleMemberDisplay;
  onClose: () => void;
  onCreated: () => void;
}) {
  const initialWindow = getInitialOfferWindow();
  const [dateStart, setDateStart] = useState(initialWindow.date);
  const [dateEnd, setDateEnd] = useState("");
  const [hasEndDate, setHasEndDate] = useState(false);
  const [mode, setMode] = useState<OfferMode>("FIXED");
  const [daysOfWeek, setDaysOfWeek] = useState<OfferWeekdayValue[]>([
    getWeekdayValue(new Date()),
  ]);
  const [startTime, setStartTime] = useState(initialWindow.startTime);
  const [endTime, setEndTime] = useState(initialWindow.endTime);
  const [requiredHours, setRequiredHours] = useState("1");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedDateStart = parseDateInputValue(dateStart);
    const parsedDateEnd = hasEndDate ? parseDateInputValue(dateEnd) : null;

    if (!parsedDateStart) {
      setError("Choose a valid start date.");
      return;
    }

    if (hasEndDate && !parsedDateEnd) {
      setError("Choose a valid end date.");
      return;
    }

    if (
      hasEndDate &&
      parsedDateEnd &&
      parsedDateEnd.getTime() < parsedDateStart.getTime()
    ) {
      setError("End date must not be before start date.");
      return;
    }

    if (daysOfWeek.length === 0) {
      setError("Select at least one day.");
      return;
    }

    const firstSelectedDate = getFirstSelectedDateInRange(
      dateStart,
      hasEndDate ? dateEnd : null,
      daysOfWeek,
    );

    if (!firstSelectedDate) {
      setError(
        hasEndDate
          ? "Select a day that occurs during the offer length."
          : "Select at least one day.",
      );
      return;
    }

    let startsAt: Date | null = null;
    let endsAt: Date | null = null;
    let requiredMinutes = 0;

    if (mode === "FIXED") {
      startsAt = buildLocalDateTime(firstSelectedDate, startTime);
      endsAt = buildLocalDateTime(firstSelectedDate, endTime);
      const fixedRequiredMinutes = getMinutesBetweenTimes(startTime, endTime);

      if (!startsAt || !endsAt || fixedRequiredMinutes === null) {
        setError("Choose a valid fixed time window.");
        return;
      }

      requiredMinutes = fixedRequiredMinutes;

      if (endsAt.getTime() <= startsAt.getTime() || requiredMinutes <= 0) {
        setError("End time must be after start time.");
        return;
      }
    } else {
      const parsedRequiredHours = Number(requiredHours);

      if (!Number.isFinite(parsedRequiredHours) || parsedRequiredHours <= 0) {
        setError("Required hours per selected day must be greater than 0.");
        return;
      }

      requiredMinutes = Math.round(parsedRequiredHours * 60);

      if (requiredMinutes <= 0) {
        setError("Required hours per selected day must be greater than 0.");
        return;
      }
    }

    const terms = {
      mode,
      dateStart,
      dateEnd: hasEndDate ? dateEnd : null,
      daysOfWeek,
      requiredMinutes,
      fixedStartLocal: mode === "FIXED" ? startTime : null,
      fixedEndLocal: mode === "FIXED" ? endTime : null,
    };

    try {
      setIsSubmitting(true);
      setError(null);

      const body: {
        offer_type: "COMMAND_BLOCK";
        circleId: string;
        recipientMemberId: string;
        recipientUserId: string;
        timezone: string | null;
        title: string;
        note: string | null;
        terms: typeof terms;
        startsAt?: string;
        endsAt?: string;
      } = {
        offer_type: "COMMAND_BLOCK",
        circleId: circle.id,
        recipientMemberId: member.id,
        recipientUserId: member.userId,
        timezone: getBrowserTimezone(),
        title: `${circle.name} Offer`,
        note: note.trim() || null,
        terms,
      };

      if (mode === "FIXED" && startsAt && endsAt) {
        // TODO: Materialize recurring/multi-day command blocks during acceptance.
        body.startsAt = startsAt.toISOString();
        body.endsAt = endsAt.toISOString();
      }

      const response = await fetch("/api/offers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Unable to create offer.");
      }

      onCreated();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create offer.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-black/60 px-0 pb-0 pt-0 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <button
        type="button"
        aria-label="Close offer"
        onClick={onClose}
        disabled={isSubmitting}
        className="absolute inset-0 cursor-default bg-black/68 backdrop-blur-[3px]"
      />
      <motion.form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`make-offer-title-${member.id}`}
        className="relative z-10 flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#070709] text-white shadow-[0_34px_100px_rgba(0,0,0,0.78)] ring-1 ring-white/[0.06]"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 430, damping: 38, mass: 0.8 }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-[#0b0c10] p-4 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)] sm:p-5">
          <div className="min-w-0 flex-1">
            <h3
              id={`make-offer-title-${member.id}`}
              className="text-base font-semibold text-white"
            >
              Make Offer
            </h3>
            <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xs font-semibold text-white/50">
                  to
                </span>
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-black/35 px-2.5 py-2">
                  <MemberAvatar
                    member={member}
                    className="h-7 w-7 text-[10px]"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-4 text-white">
                      {member.displayName}
                    </div>
                    {member.username ? (
                      <div className="truncate text-[11px] leading-4 text-white/45">
                        @{member.username}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xs font-semibold text-white/50">
                  for
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={isSubmitting}>
                    <button
                      type="button"
                      aria-label="Offer type: Command Block"
                      className="inline-flex h-8 min-w-[142px] items-center justify-between gap-2 rounded-md border border-white/10 bg-zinc-900 px-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.18)] outline-none transition hover:border-white/18 hover:bg-zinc-800 focus-visible:border-white/26 focus-visible:bg-zinc-900 focus-visible:ring-1 focus-visible:ring-white/18 disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:border-white/18 data-[state=open]:bg-zinc-900"
                    >
                      <span>Command Block</span>
                      <ChevronDown
                        className="h-3.5 w-3.5 shrink-0 text-white/45"
                        aria-hidden="true"
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={5}
                    className="z-[70] max-h-64 min-w-[190px] overflow-y-auto rounded-md border border-white/10 bg-[#050507] p-1 text-white shadow-[0_18px_45px_rgba(0,0,0,0.5)]"
                  >
                    {offerTypeOptions.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        disabled={option.disabled}
                        className={cn(
                          "flex min-h-8 justify-between gap-3 rounded px-2 py-1.5 text-xs font-semibold text-white outline-none transition focus:bg-zinc-900 focus:text-white",
                          option.disabled
                            ? "text-white/35 data-[disabled]:opacity-100"
                            : "cursor-default data-[highlighted]:bg-zinc-900 data-[highlighted]:text-white",
                        )}
                      >
                        <span>{option.label}</span>
                        {option.disabled ? (
                          <span className="rounded border border-white/8 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/38">
                            Coming soon
                          </span>
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close offer"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black text-white/68 transition hover:border-white/25 hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-5 overflow-y-auto p-5">
          <div className="grid grid-cols-2 items-end gap-3">
            <label className="grid min-w-0 gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/52">
                Start date
              </span>
              <input
                type="date"
                value={dateStart}
                onChange={(event) => {
                  setDateStart(event.target.value);
                  setError(null);
                }}
                disabled={isSubmitting}
                className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <div className="min-w-0">
              {hasEndDate ? (
                <div className="grid gap-2">
                  <div className="flex min-h-4 items-center justify-between gap-2">
                    <span
                      id={`make-offer-end-date-label-${member.id}`}
                      className="text-xs font-semibold uppercase tracking-[0.18em] text-white/52"
                    >
                      END DATE
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={hasEndDate}
                      aria-label="Toggle end date"
                      onClick={() => {
                        const nextHasEndDate = !hasEndDate;

                        setHasEndDate(nextHasEndDate);

                        if (nextHasEndDate) {
                          setDateEnd(
                            (currentEndDate) => currentEndDate || dateStart,
                          );
                        }

                        setError(null);
                      }}
                      disabled={isSubmitting}
                      className={cn(
                        "relative h-4 w-7 shrink-0 rounded-md border transition disabled:cursor-not-allowed disabled:opacity-60",
                        hasEndDate
                          ? "border-white/35 bg-zinc-200"
                          : "border-white/12 bg-zinc-800",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-sm transition",
                          hasEndDate
                            ? "left-[13px] bg-black"
                            : "left-0.5 bg-zinc-500",
                        )}
                      />
                    </button>
                  </div>
                  <input
                    type="date"
                    aria-labelledby={`make-offer-end-date-label-${member.id}`}
                    value={dateEnd}
                    onChange={(event) => {
                      setDateEnd(event.target.value);
                      setError(null);
                    }}
                    disabled={isSubmitting}
                    className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              ) : (
                <div className="flex h-11 items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/35 px-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    END DATE
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hasEndDate}
                    aria-label="Toggle end date"
                    onClick={() => {
                      const nextHasEndDate = !hasEndDate;

                      setHasEndDate(nextHasEndDate);

                      if (nextHasEndDate) {
                        setDateEnd(
                          (currentEndDate) => currentEndDate || dateStart,
                        );
                      }

                      setError(null);
                    }}
                    disabled={isSubmitting}
                    className={cn(
                      "relative h-4 w-7 shrink-0 rounded-md border transition disabled:cursor-not-allowed disabled:opacity-60",
                      hasEndDate
                        ? "border-white/35 bg-zinc-200"
                        : "border-white/12 bg-zinc-800",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-sm transition",
                        hasEndDate
                          ? "left-[13px] bg-black"
                          : "left-0.5 bg-zinc-500",
                      )}
                    />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              FIXED / FLEXIBLE
            </span>
            <div className="inline-grid w-fit grid-cols-2 rounded-lg border border-white/10 bg-black/55 p-0.5">
              {(["FIXED", "FLEXIBLE"] as const).map((modeOption) => (
                <button
                  key={modeOption}
                  type="button"
                  onClick={() => {
                    setMode(modeOption);
                    setError(null);
                  }}
                  disabled={isSubmitting}
                  className={cn(
                    "h-7 rounded-md px-3 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                    mode === modeOption
                      ? "border border-white/14 bg-zinc-800 text-white shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
                      : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200",
                  )}
                  aria-pressed={mode === modeOption}
                >
                  {modeOption === "FIXED" ? "Fixed" : "Flexible"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/52">
              Days
            </span>
            <div className="grid grid-cols-7 gap-1.5">
              {offerWeekdays.map((weekday) => {
                const isSelected = daysOfWeek.includes(weekday.value);

                return (
                  <button
                    key={weekday.value}
                    type="button"
                    onClick={() => {
                      setDaysOfWeek((currentDays) =>
                        currentDays.includes(weekday.value)
                          ? currentDays.filter((day) => day !== weekday.value)
                          : [...currentDays, weekday.value],
                      );
                      setError(null);
                    }}
                    disabled={isSubmitting}
                    className={cn(
                      "h-9 min-w-0 rounded-md border px-0 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                      isSelected
                        ? "border-white/20 bg-zinc-800 text-white"
                        : "border-white/10 bg-zinc-950/70 text-white/58 hover:border-white/22 hover:bg-zinc-900 hover:text-white",
                    )}
                    aria-pressed={isSelected}
                    aria-label={weekday.label}
                  >
                    {weekday.label.charAt(0)}
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "FIXED" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/52">
                  Start time
                </span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => {
                    setStartTime(event.target.value);
                    setError(null);
                  }}
                  disabled={isSubmitting}
                  className="h-11 rounded-lg border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/52">
                  End time
                </span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => {
                    setEndTime(event.target.value);
                    setError(null);
                  }}
                  disabled={isSubmitting}
                  className="h-11 rounded-lg border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>
          ) : (
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/52">
                Required hours per selected day
              </span>
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={requiredHours}
                onChange={(event) => {
                  setRequiredHours(event.target.value);
                  setError(null);
                }}
                disabled={isSubmitting}
                className="h-11 rounded-lg border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="text-xs leading-5 text-white/45">
                The recipient will choose where these hours fit when accepting.
              </span>
            </label>
          )}

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/52">
              Optional note
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={`Add context for ${member.displayName}`}
              disabled={isSubmitting}
              rows={3}
              maxLength={500}
              className="resize-none rounded-lg border border-white/10 bg-black/45 px-3 py-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          {error ? (
            <p className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-white/10 bg-black/30 p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-10 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/72 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/14 bg-zinc-800 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition hover:border-white/24 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-zinc-900 disabled:text-white/45"
          >
            <Handshake className="h-4 w-4" aria-hidden="true" />
            {isSubmitting ? "Sending..." : "Send Offer"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function CircleMemberFloatingDetail({
  circle,
  member,
  canMakeOffer,
  canEditWorkProfile,
  skillOptions,
  locationContextOptions,
  roleActionId,
  constraintActionId,
  onRoleChange,
  onConstraintChange,
  onClose,
}: {
  circle: CommandCircle;
  member: CircleMemberDisplay;
  canMakeOffer: boolean;
  canEditWorkProfile: boolean;
  skillOptions: ConstraintOption[];
  locationContextOptions: ConstraintOption[];
  roleActionId: string | null;
  constraintActionId: string | null;
  onRoleChange: (member: CircleMemberDisplay, nextRole: CircleMemberRole) => void;
  onConstraintChange: (
    member: CircleMemberDisplay,
    field: MemberConstraintField,
    nextIds: string[],
  ) => void;
  onClose: () => void;
}) {
  const skillActionId = `${member.id}:skill_constraint_ids`;
  const locationActionId = `${member.id}:location_context_ids`;
  const isRoleSaving = roleActionId === member.id;
  const isConstraintSaving = constraintActionId !== null;
  const memberRole = member.role.trim().toUpperCase();
  const canEditRoleAccess =
    canEditWorkProfile && !member.isPreview && memberRole !== "OWNER";
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [isRoleAccessEditing, setIsRoleAccessEditing] = useState(false);
  const [offerSuccess, setOfferSuccess] = useState<string | null>(null);
  const [commandAccess, setCommandAccess] = useState<CommandAccessState>({
    rules: [],
    isLoading: true,
    error: null,
  });
  const [pendingOffers, setPendingOffers] = useState<PendingMemberOffersState>({
    offers: [],
    isLoading: true,
    error: null,
  });
  const [cancellingOfferId, setCancellingOfferId] = useState<string | null>(
    null,
  );
  const [cancelOfferError, setCancelOfferError] = useState<string | null>(null);

  const loadPendingOffers = useCallback(
    async (signal?: AbortSignal) => {
      if (member.isPreview) {
        setPendingOffers({
          offers: [],
          isLoading: false,
          error: null,
        });
        return;
      }

      try {
        setPendingOffers({
          offers: [],
          isLoading: true,
          error: null,
        });

        const response = await fetch(
          `/api/circles/${encodeURIComponent(
            circle.id,
          )}/members/${encodeURIComponent(member.id)}/offers`,
          {
            cache: "no-store",
            signal,
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Unable to load pending offers.");
        }

        const data = (await response.json()) as {
          offers?: PendingMemberOffer[];
        };

        setPendingOffers({
          offers: data.offers ?? [],
          isLoading: false,
          error: null,
        });
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setPendingOffers({
          offers: [],
          isLoading: false,
          error:
            loadError instanceof Error
              ? loadError.message
              : "Unable to load pending offers.",
        });
      }
    },
    [circle.id, member.id, member.isPreview],
  );

  useEffect(() => {
    setIsOfferOpen(false);
    setIsRoleAccessEditing(false);
    setOfferSuccess(null);
    setCancellingOfferId(null);
    setCancelOfferError(null);
  }, [circle.id, member.id]);

  const handleCancelPendingOffer = useCallback(
    async (offerId: string) => {
      if (member.isPreview || cancellingOfferId) {
        return;
      }

      try {
        setCancellingOfferId(offerId);
        setCancelOfferError(null);

        const response = await fetch(
          `/api/circles/${encodeURIComponent(
            circle.id,
          )}/members/${encodeURIComponent(
            member.id,
          )}/offers/${encodeURIComponent(offerId)}/cancel`,
          {
            method: "POST",
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Unable to cancel pending offer.");
        }

        setPendingOffers((current) => ({
          ...current,
          offers: current.offers.filter((offer) => offer.id !== offerId),
          error: null,
        }));
      } catch (cancelError) {
        setCancelOfferError(
          cancelError instanceof Error
            ? cancelError.message
            : "Unable to cancel pending offer.",
        );
      } finally {
        setCancellingOfferId(null);
      }
    },
    [cancellingOfferId, circle.id, member.id, member.isPreview],
  );

  useEffect(() => {
    if (!canEditRoleAccess) {
      setIsRoleAccessEditing(false);
    }
  }, [canEditRoleAccess]);

  useEffect(() => {
    const controller = new AbortController();

    if (member.isPreview) {
      setCommandAccess({
        rules: [],
        isLoading: true,
        error: null,
      });

      return () => {
        controller.abort();
      };
    }

    async function loadCommandAccess() {
      try {
        setCommandAccess({
          rules: [],
          isLoading: true,
          error: null,
        });

        const response = await fetch(
          `/api/circles/${encodeURIComponent(
            circle.id,
          )}/members/${encodeURIComponent(member.id)}/command-access`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Unable to load command access.");
        }

        const data = (await response.json()) as {
          commandAccess?: CommandAccessRule[];
        };

        setCommandAccess({
          rules: data.commandAccess ?? [],
          isLoading: false,
          error: null,
        });
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setCommandAccess({
          rules: [],
          isLoading: false,
          error:
            loadError instanceof Error
              ? loadError.message
              : "Unable to load command access.",
        });
      }
    }

    void loadCommandAccess();

    return () => {
      controller.abort();
    };
  }, [circle.id, member.id, member.isPreview]);

  useEffect(() => {
    const controller = new AbortController();

    void loadPendingOffers(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadPendingOffers]);

  return (
    <motion.article
      role="dialog"
      aria-modal="true"
      aria-labelledby={`circle-member-profile-${member.id}`}
      className="relative z-10 flex h-auto min-h-0 w-[calc(100%-1.5rem)] max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#08090c]/95 shadow-[0_38px_120px_rgba(0,0,0,0.76)] ring-1 ring-white/[0.06] backdrop-blur-xl"
      style={{
        maxHeight:
          "calc(100dvh - 1.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
      }}
      initial={{ opacity: 0, y: 22, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 430, damping: 38, mass: 0.8 }}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="flex shrink-0 flex-col gap-3 border-b border-white/10 bg-white/[0.025] p-4 pr-14 sm:flex-row sm:items-center sm:justify-between sm:p-5 sm:pr-16">
        <div className="flex min-w-0 items-center gap-3">
          <MemberAvatar member={member} className="h-12 w-12 text-sm" />
          <div className="min-w-0">
            <h4
              id={`circle-member-profile-${member.id}`}
              className="truncate text-base font-semibold text-white"
            >
              {member.displayName}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
              {member.username ? <span>@{member.username}</span> : null}
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-semibold text-white/58">
                {member.role.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
        {canMakeOffer && !member.isPreview ? (
          <button
            type="button"
            onClick={() => {
              setOfferSuccess(null);
              setIsOfferOpen(true);
            }}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 text-xs font-semibold text-white/72 transition hover:border-white/25 hover:bg-white/[0.10] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 sm:mr-10"
          >
            <Handshake className="h-3.5 w-3.5" aria-hidden="true" />
            Make Offer
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Close member profile"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/65 backdrop-blur transition hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid min-h-0 gap-3 overflow-y-auto overscroll-contain p-4 [-webkit-overflow-scrolling:touch] sm:p-5">
        {offerSuccess ? (
          <div className="rounded-2xl border border-emerald-200/15 bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-50/85">
            {offerSuccess}
          </div>
        ) : null}

        <MemberDetailAccordionSection
          id={`member-${member.id}-role-access`}
          title="Role & Access"
          Icon={ShieldCheck}
          defaultOpen
        >
          <div className="grid gap-2.5">
            <div className="min-w-0">
              <WorkProfileRowLabel Icon={ShieldCheck} label="Role" />
              {isRoleAccessEditing && canEditRoleAccess ? (
                <select
                  aria-label="Member role"
                  value={
                    memberRoleOptions.includes(memberRole as CircleMemberRole)
                      ? memberRole
                      : "MEMBER"
                  }
                  onChange={(event) =>
                    onRoleChange(
                      member,
                      event.target.value as CircleMemberRole,
                    )
                  }
                  disabled={isRoleSaving}
                  className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-55 sm:max-w-56"
                >
                  {memberRoleOptions.map((roleOption) => (
                    <option
                      key={roleOption}
                      value={roleOption}
                      className="bg-zinc-950 text-white"
                    >
                      {roleOption}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-sm font-medium leading-5 text-white/68">
                  <span className="font-semibold text-white/75">
                    {memberRole}
                  </span>
                </p>
              )}
              {isRoleSaving ? (
                <p className="mt-1 text-xs font-medium text-white/38">Saving...</p>
              ) : null}
            </div>

            {isRoleAccessEditing && canEditRoleAccess ? (
              <>
                <WorkProfileConstraintMultiSelect
                  Icon={Target}
                  label="Skill Constraints"
                  options={skillOptions}
                  selectedIds={member.skillConstraintIds}
                  emptyLabel="No skills granted"
                  noOptionsLabel="No owner skills yet"
                  canEdit={!isConstraintSaving}
                  isSaving={constraintActionId === skillActionId}
                  onChange={(nextIds) =>
                    onConstraintChange(member, "skill_constraint_ids", nextIds)
                  }
                />
                <WorkProfileConstraintMultiSelect
                  Icon={MapPin}
                  label="Location Contexts"
                  options={locationContextOptions}
                  selectedIds={member.locationContextIds}
                  emptyLabel="No locations granted"
                  noOptionsLabel="No locations yet"
                  canEdit={!isConstraintSaving}
                  isSaving={constraintActionId === locationActionId}
                  onChange={(nextIds) =>
                    onConstraintChange(member, "location_context_ids", nextIds)
                  }
                />
              </>
            ) : (
              <>
                <WorkProfileConstraintReadOnly
                  Icon={Target}
                  label="Skill Constraints"
                  options={skillOptions}
                  selectedIds={member.skillConstraintIds}
                  emptyLabel="No skills granted"
                />
                <WorkProfileConstraintReadOnly
                  Icon={MapPin}
                  label="Location Contexts"
                  options={locationContextOptions}
                  selectedIds={member.locationContextIds}
                  emptyLabel="No locations granted"
                />
              </>
            )}
            {canEditRoleAccess ? (
              <div className="mt-3 border-t border-white/10 pt-3">
                <button
                  type="button"
                  onClick={() =>
                    setIsRoleAccessEditing((current) => !current)
                  }
                  disabled={isRoleSaving || isConstraintSaving}
                  aria-pressed={isRoleAccessEditing}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-white/12 bg-white/[0.07] px-4 py-2.5 text-sm font-semibold text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-white/24 hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRoleAccessEditing ? "Done" : "Change role"}
                </button>
              </div>
            ) : null}
          </div>
        </MemberDetailAccordionSection>

        <MemberDetailAccordionSection
          id={`member-${member.id}-work-profile`}
          title="Work Profile"
          Icon={BriefcaseBusiness}
        >
          <p className="text-sm font-medium leading-5 text-white/58">
            No work profile details yet.
          </p>
        </MemberDetailAccordionSection>

        <MemberDetailAccordionSection
          id={`member-${member.id}-availability`}
          title="Availability"
          Icon={CalendarDays}
        >
          <div className="grid gap-2.5">
            <CommandAccessAvailabilityRow
              commandAccess={commandAccess}
              pendingOffers={pendingOffers}
              cancellingOfferId={cancellingOfferId}
              cancelOfferError={cancelOfferError}
              onCancelOffer={
                canMakeOffer ? handleCancelPendingOffer : undefined
              }
            />
          </div>
        </MemberDetailAccordionSection>

        <MemberDetailAccordionSection
          id={`member-${member.id}-assigned-work`}
          title="Assigned Circle Work"
          Icon={LockKeyhole}
        >
          <div>
            <MemberDetailEmptyRow
              Icon={BriefcaseBusiness}
              text="No assigned Circle work yet."
            />
          </div>
        </MemberDetailAccordionSection>

        <MemberDetailAccordionSection
          id={`member-${member.id}-performance`}
          title="Performance"
          Icon={BarChart3}
        >
          <div>
            <MemberDetailEmptyRow
              Icon={BarChart3}
              text="Completion stats will appear here once Circle work is scheduled."
            />
          </div>
        </MemberDetailAccordionSection>
      </div>
      <AnimatePresence>
        {isOfferOpen ? (
          <MakeOfferModal
            circle={circle}
            member={member}
            onClose={() => setIsOfferOpen(false)}
            onCreated={() => {
              setIsOfferOpen(false);
              setOfferSuccess("Offer sent.");
              void loadPendingOffers();
            }}
          />
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

function CircleMembersPanel({
  members,
  isLoading,
  error,
  selectedMemberId,
  onSelectMember,
}: {
  members: CircleMemberDisplay[];
  isLoading: boolean;
  error: string | null;
  selectedMemberId: string | null;
  onSelectMember: (memberId: string) => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] p-5 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:p-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.10),_transparent_58%)]" />
      <div className="relative">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/60">
              Members
            </p>
          </div>
          {isLoading ? (
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
              Loading
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-amber-300/15 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100/80">
            {error}
          </div>
        ) : null}

        {members.length === 0 && !isLoading ? (
          <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-5">
            <p className="text-sm font-semibold text-white">
              No active members.
            </p>
            <p className="mt-2 text-sm leading-6 text-white/48">
              Active Circle members will appear here.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3">
          {members.map((member) => {
            const isSelected =
              selectedMemberId === member.id ||
              selectedMemberId === member.userId;

            return (
              <article
                key={member.id}
                className={cn(
                  "rounded-2xl border bg-[#0A0C10]/88 p-3 shadow-[0_18px_44px_rgba(0,0,0,0.36)] transition",
                  isSelected
                    ? "border-white/28 ring-1 ring-white/18"
                    : "border-white/[0.08]",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectMember(member.userId)}
                  className="flex w-full items-center gap-3 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/65"
                  aria-haspopup="dialog"
                  aria-controls={
                    isSelected
                      ? `circle-member-profile-${member.id}`
                      : undefined
                  }
                >
                  <MemberAvatar member={member} className="h-11 w-11" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-white">
                        {member.displayName}
                      </h4>
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-white/58">
                        {member.role.toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/45">
                      {member.username ? <span>@{member.username}</span> : null}
                      <span>{formatMemberStatus(member.status)}</span>
                      <span>No Circle workload yet</span>
                    </div>
                  </div>
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function IncomingOffersSection({
  offers,
  isLoading,
  error,
  respondingOfferId,
  respondingResponse,
  responseErrorOfferId,
  responseError,
  onRespond,
}: {
  offers: IncomingOffer[];
  isLoading: boolean;
  error: string | null;
  respondingOfferId: string | null;
  respondingResponse: "ACCEPTED" | "DECLINED" | null;
  responseErrorOfferId: string | null;
  responseError: string | null;
  onRespond: (offer: IncomingOffer, response: "ACCEPTED" | "DECLINED") => void;
}) {
  if (!isLoading && !error && offers.length === 0) {
    return null;
  }

  return (
    <section className="mb-6 text-white">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Offers</h2>
        {isLoading ? (
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
            Loading
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="h-4 w-44 animate-pulse rounded-full bg-white/10" />
          <div className="mt-3 h-3 w-64 max-w-full animate-pulse rounded-full bg-white/10" />
        </div>
      ) : null}

      {!isLoading && error ? (
        <article className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </article>
      ) : null}

      {!isLoading && !error && offers.length > 0 ? (
        <div className="grid gap-3">
          {offers.map((offer) => {
            const senderName = getOfferSenderName(offer);
            const mode = offer.terms?.mode ?? null;
            const isFlexible = mode === "FLEXIBLE";
            const isFixed = mode === "FIXED";
            let modeLabel = "Mode not set";

            if (isFlexible) {
              modeLabel = "Flexible";
            } else if (isFixed) {
              modeLabel = "Fixed";
            }

            const isResponding = respondingOfferId === offer.id;

            return (
              <article
                key={offer.id}
                className="rounded-2xl border border-white/10 bg-[#0A0C10]/90 p-4 shadow-[0_18px_44px_rgba(0,0,0,0.34)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/62">
                        <Handshake className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <h3 className="text-sm font-semibold text-white">
                        {senderName
                          ? `${senderName} made you an offer`
                          : "Someone made you an offer"}
                      </h3>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-medium text-white/58">
                      {offer.circle_name ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                          {offer.circle_name}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                        {modeLabel}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                        {formatOfferDateRange(offer.terms)}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                        {formatOfferDays(offer.terms)}
                      </span>
                      {isFixed ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                          Time: {formatOfferTimeRange(offer.terms)}
                        </span>
                      ) : null}
                      {isFlexible ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                          Required:{" "}
                          {formatOfferDuration(offer.terms?.requiredMinutes)}
                        </span>
                      ) : null}
                    </div>

                    {offer.note?.trim() ? (
                      <p className="mt-3 text-sm leading-6 text-white/55">
                        {offer.note.trim()}
                      </p>
                    ) : null}

                    {isFlexible ? (
                      <p className="mt-3 text-xs font-medium text-amber-100/75">
                        Flexible acceptance is coming next.
                      </p>
                    ) : null}

                    {responseError && responseErrorOfferId === offer.id ? (
                      <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                        {responseError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-2 sm:pt-0.5">
                    <button
                      type="button"
                      onClick={() => onRespond(offer, "DECLINED")}
                      disabled={isResponding}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/68 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isResponding && respondingResponse === "DECLINED"
                        ? "Declining..."
                        : "Decline"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRespond(offer, "ACCEPTED")}
                      disabled={isResponding || isFlexible || !isFixed}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-white/18 bg-white px-3 text-xs font-semibold text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.08] disabled:text-white/38"
                    >
                      {isResponding && respondingResponse === "ACCEPTED"
                        ? "Accepting..."
                        : "Accept"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function CircleViewToggle({
  value,
  onChange,
}: {
  value: CircleDetailView;
  onChange: (value: CircleDetailView) => void;
}) {
  return (
    <div
      className="inline-flex w-full rounded-lg border border-white/10 bg-[#050506]/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur sm:w-auto"
      aria-label="Circle view"
    >
      {(
        [
          { value: "goals", label: "GOAL GRID" },
          { value: "roadmap", label: "ROADMAP" },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-8 flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] transition sm:flex-none",
            value === option.value
              ? "bg-zinc-800/90 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_18px_rgba(0,0,0,0.25)]"
              : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200",
          )}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function getCircleHabitFabOriginRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);

  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    borderRadius: styles.borderRadius,
    backgroundColor: styles.backgroundColor,
    backgroundImage: styles.backgroundImage,
    boxShadow: styles.boxShadow,
  };
}

function CircleHabitsPanel({
  habits,
  currentUserId,
  isLoading,
  error,
  ownerSkills,
  onEditHabit,
}: {
  habits: CircleHabit[];
  currentUserId: string | null;
  isLoading: boolean;
  error: string | null;
  ownerSkills: OwnerSkillOption[];
  onEditHabit: (habit: CircleHabit, element?: HTMLElement | null) => void;
}) {
  const supabase = getSupabaseBrowser();
  const toast = useToastHelpers();
  const [circleHabitCardDensity, setCircleHabitCardDensity] =
    useState<CircleHabitCardDensity>("large");
  const [completedCircleHabitIds, setCompletedCircleHabitIds] = useState<
    Set<string>
  >(() => new Set());
  const [pendingCircleHabitIds, setPendingCircleHabitIds] = useState<
    Set<string>
  >(() => new Set());
  const [circleHabitStateOverrides, setCircleHabitStateOverrides] = useState(
    () =>
      new Map<
        string,
        {
          lastCompletedAt: string | null;
          nextDueOverride: string | null;
        }
      >(),
  );
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [pressedCircleHabitId, setPressedCircleHabitId] = useState<
    string | null
  >(null);
  const [memoCompletionState, setMemoCompletionState] =
    useState<CircleHabit | null>(null);
  const timeZone = useMemo(() => {
    try {
      return normalizeTimeZone(
        Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      );
    } catch (timezoneError) {
      console.error("Failed to determine user timezone", timezoneError);
      return "UTC";
    }
  }, []);
  const [currentDateKey, setCurrentDateKey] = useState(() =>
    formatDateKeyInTimeZone(new Date(), timeZone),
  );
  const lastCircleHabitTapRef = useRef<{
    habitId: string;
    timestamp: number;
  } | null>(null);
  const circleHabitLongPressTimerRef = useRef<number | null>(null);
  const circleHabitSuppressCompletionUntilRef = useRef(0);
  const previousCircleHabitStateRef = useRef(
    new Map<
      string,
      {
        lastCompletedAt: string | null;
        nextDueOverride: string | null;
      }
    >(),
  );
  const pendingCircleHabitActionsRef = useRef(
    new Map<string, { action: "complete" | "undo"; dateKey: string }>(),
  );
  const bypassMemoCaptureRef = useRef(false);
  const completionStateDateKeyRef = useRef<string | null>(null);
  const isSmallCircleHabitDensity = circleHabitCardDensity === "small";
  const circleHabitGridClass = isSmallCircleHabitDensity
    ? CIRCLE_HABIT_SMALL_GRID_CLASS
    : CIRCLE_HABIT_GRID_CLASS;
  const statusLabel = isLoading ? "Loading" : error ? "Error" : "Circle";
  const circleHabitIdsKey = useMemo(
    () => habits.map((habit) => habit.id).join(","),
    [habits],
  );
  const skillIconById = useMemo(
    () => new Map(ownerSkills.map((skill) => [skill.id, skill.icon ?? null])),
    [ownerSkills],
  );
  const isCircleHabitCompletedForCurrentDay = useCallback(
    (habit: Pick<CircleHabit, "id" | "last_completed_at">) =>
      completedCircleHabitIds.has(habit.id) ||
      wasCircleHabitCompletedOnDate(habit, currentDateKey, timeZone),
    [completedCircleHabitIds, currentDateKey, timeZone],
  );
  const decoratedHabits = useMemo(
    () =>
      habits
        .map((habit) => {
          const override = circleHabitStateOverrides.get(habit.id);
          const effectiveHabit = override
            ? {
                ...habit,
                last_completed_at: override.lastCompletedAt,
                next_due_override: override.nextDueOverride,
              }
            : habit;
          const dueStatus = computeCircleHabitDueStatus(
            effectiveHabit,
            timeZone,
          );
          return {
            ...effectiveHabit,
            name: habit.name?.trim() || "Untitled habit",
            normalizedHabitType: normalizeCircleHabitType(habit.habit_type),
            dueLabel: dueStatus.label,
            dueRank: dueStatus.rank,
          };
        })
        .sort((first, second) => {
          if (first.dueRank !== second.dueRank) {
            return first.dueRank - second.dueRank;
          }

          const typeRank =
            getCircleHabitTypePriority(first.habit_type) -
            getCircleHabitTypePriority(second.habit_type);
          if (typeRank !== 0) {
            return typeRank;
          }

          return first.name.localeCompare(second.name, undefined, {
            sensitivity: "base",
          });
        }),
    [circleHabitStateOverrides, habits, timeZone],
  );

  useEffect(() => {
    setCircleHabitStateOverrides((current) => {
      if (current.size === 0) return current;

      const validHabitIds = new Set(habits.map((habit) => habit.id));
      const next = new Map(
        Array.from(current.entries()).filter(([habitId]) =>
          validHabitIds.has(habitId),
        ),
      );
      return next.size === current.size ? current : next;
    });
  }, [habits]);

  useEffect(() => {
    const syncCurrentDateKey = () => {
      const nextDateKey = formatDateKeyInTimeZone(new Date(), timeZone);
      setCurrentDateKey((previousDateKey) =>
        previousDateKey === nextDateKey ? previousDateKey : nextDateKey,
      );
    };

    syncCurrentDateKey();
    const intervalId = window.setInterval(syncCurrentDateKey, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [timeZone]);

  useEffect(() => {
    let cancelled = false;
    const habitIds = circleHabitIdsKey
      .split(",")
      .map((habitId) => habitId.trim())
      .filter(Boolean);

    if (!supabase || !currentUserId || habitIds.length === 0) {
      setCompletedCircleHabitIds(new Set());
      completionStateDateKeyRef.current = currentDateKey;
      setCompletionError(null);
      return;
    }

    if (completionStateDateKeyRef.current !== currentDateKey) {
      const currentDatePendingCompletions = new Set<string>();
      pendingCircleHabitActionsRef.current.forEach((pendingAction, id) => {
        if (
          habitIds.includes(id) &&
          pendingAction.dateKey === currentDateKey &&
          pendingAction.action === "complete"
        ) {
          currentDatePendingCompletions.add(id);
        }
      });
      setCompletedCircleHabitIds(currentDatePendingCompletions);
      completionStateDateKeyRef.current = currentDateKey;
    }

    const loadCompletionState = async () => {
      try {
        const { data, error: completionLoadError } = await supabase
          .from("habit_completion_days")
          .select("habit_id")
          .eq("user_id", currentUserId)
          .eq("completion_day", currentDateKey)
          .in("habit_id", habitIds);

        if (completionLoadError) {
          throw completionLoadError;
        }

        if (!cancelled) {
          const completedIds = new Set(
            (data ?? [])
              .map((row) =>
                typeof row.habit_id === "string" ? row.habit_id : null,
              )
              .filter((habitId): habitId is string => habitId !== null),
          );
          pendingCircleHabitActionsRef.current.forEach((pendingAction, id) => {
            if (
              !habitIds.includes(id) ||
              pendingAction.dateKey !== currentDateKey
            ) {
              return;
            }

            if (pendingAction.action === "complete") {
              completedIds.add(id);
            } else {
              completedIds.delete(id);
            }
          });
          setCompletedCircleHabitIds(completedIds);
          completionStateDateKeyRef.current = currentDateKey;
          setCompletionError(null);
        }
      } catch (completionLoadError) {
        if (!cancelled) {
          console.error(
            "Error loading circle habit completion state:",
            completionLoadError,
          );
          setCompletionError("Unable to load habit completion state right now.");
        }
      }
    };

    void loadCompletionState();

    return () => {
      cancelled = true;
    };
  }, [circleHabitIdsKey, currentDateKey, currentUserId, supabase]);

  const handleCircleHabitCompletionToggle = useCallback(
    async (habitId: string) => {
      if (!currentUserId || pendingCircleHabitIds.has(habitId)) {
        return;
      }

      const habitBeforeUpdate =
        habits.find((habit) => habit.id === habitId) ?? null;
      if (!habitBeforeUpdate) {
        return;
      }

      const wasCompleted =
        isCircleHabitCompletedForCurrentDay(habitBeforeUpdate);
      const action = wasCompleted ? "undo" : "complete";
      const completedAt = new Date().toISOString();

      if (
        !bypassMemoCaptureRef.current &&
        action === "complete" &&
        normalizeCircleHabitType(habitBeforeUpdate.habit_type) === "MEMO"
      ) {
        setMemoCompletionState(habitBeforeUpdate);
        return;
      }

      setCompletionError(null);
      setPendingCircleHabitIds((previous) => {
        const next = new Set(previous);
        next.add(habitId);
        return next;
      });

      if (!wasCompleted && !previousCircleHabitStateRef.current.has(habitId)) {
        previousCircleHabitStateRef.current.set(habitId, {
          lastCompletedAt: habitBeforeUpdate.last_completed_at,
          nextDueOverride: habitBeforeUpdate.next_due_override,
        });
      }
      pendingCircleHabitActionsRef.current.set(habitId, {
        action,
        dateKey: currentDateKey,
      });

      setCompletedCircleHabitIds((previous) => {
        const next = new Set(previous);
        if (wasCompleted) {
          next.delete(habitId);
        } else {
          next.add(habitId);
        }
        return next;
      });
      setCircleHabitStateOverrides((previous) => {
        const next = new Map(previous);
        if (action === "complete") {
          next.set(habitId, {
            lastCompletedAt: completedAt,
            nextDueOverride: null,
          });
        } else {
          const previousState = previousCircleHabitStateRef.current.get(habitId);
          next.set(habitId, {
            lastCompletedAt: previousState?.lastCompletedAt ?? null,
            nextDueOverride:
              previousState?.nextDueOverride ??
              habitBeforeUpdate.next_due_override,
          });
        }
        return next;
      });

      try {
        const response = await fetch("/api/habits/completion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            habitId,
            completedAt,
            timeZone,
            action,
          }),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        if (action === "undo") {
          previousCircleHabitStateRef.current.delete(habitId);
        }
      } catch (completionUpdateError) {
        console.error(
          "Failed to update circle habit completion:",
          completionUpdateError,
        );
        setCompletionError("Unable to update habit completion right now.");
        toast.error(
          "Completion failed",
          "Unable to update habit completion right now.",
        );

        setCompletedCircleHabitIds((previous) => {
          const next = new Set(previous);
          if (wasCompleted) {
            next.add(habitId);
          } else {
            next.delete(habitId);
          }
          return next;
        });
        if (!wasCompleted) {
          previousCircleHabitStateRef.current.delete(habitId);
        }
        setCircleHabitStateOverrides((previous) => {
          const next = new Map(previous);
          next.set(habitId, {
            lastCompletedAt: habitBeforeUpdate.last_completed_at,
            nextDueOverride: habitBeforeUpdate.next_due_override,
          });
          return next;
        });
      } finally {
        pendingCircleHabitActionsRef.current.delete(habitId);
        setPendingCircleHabitIds((previous) => {
          const next = new Set(previous);
          next.delete(habitId);
          return next;
        });
      }
    },
    [
      currentDateKey,
      currentUserId,
      habits,
      isCircleHabitCompletedForCurrentDay,
      pendingCircleHabitIds,
      timeZone,
      toast,
    ],
  );

  const handleMemoCompletionSubmitted = useCallback(async () => {
    if (!memoCompletionState) return;

    bypassMemoCaptureRef.current = true;
    try {
      await handleCircleHabitCompletionToggle(memoCompletionState.id);
      setMemoCompletionState(null);
    } finally {
      bypassMemoCaptureRef.current = false;
    }
  }, [handleCircleHabitCompletionToggle, memoCompletionState]);

  const handleCircleHabitTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>, habitId: string) => {
      if (Date.now() < circleHabitSuppressCompletionUntilRef.current) {
        event.preventDefault();
        lastCircleHabitTapRef.current = null;
        return;
      }

      const now = Date.now();
      const previousTap = lastCircleHabitTapRef.current;

      if (
        previousTap?.habitId === habitId &&
        now - previousTap.timestamp <= CIRCLE_HABIT_DOUBLE_TAP_MS
      ) {
        event.preventDefault();
        lastCircleHabitTapRef.current = null;
        void handleCircleHabitCompletionToggle(habitId);
        return;
      }

      lastCircleHabitTapRef.current = {
        habitId,
        timestamp: now,
      };
    },
    [handleCircleHabitCompletionToggle],
  );

  const cancelCircleHabitLongPress = useCallback(
    (event?: PointerEvent<HTMLDivElement>) => {
      if (circleHabitLongPressTimerRef.current !== null) {
        window.clearTimeout(circleHabitLongPressTimerRef.current);
        circleHabitLongPressTimerRef.current = null;
      }

      setPressedCircleHabitId(null);

      if (event) {
        try {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }
        } catch {
          // Pointer capture can already be released by the browser.
        }
      }
    },
    [],
  );

  const handleCircleHabitPointerLeave = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse") {
        cancelCircleHabitLongPress(event);
      }
    },
    [cancelCircleHabitLongPress],
  );

  const handleCircleHabitPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, habit: CircleHabit) => {
      if (
        (event.pointerType === "mouse" && event.button !== 0) ||
        pendingCircleHabitIds.has(habit.id)
      ) {
        return;
      }

      const element = event.currentTarget;
      const { pointerId } = event;
      cancelCircleHabitLongPress();
      setPressedCircleHabitId(habit.id);
      lastCircleHabitTapRef.current = null;

      try {
        element.setPointerCapture?.(pointerId);
      } catch {
        // Pointer capture is best-effort across browsers and input types.
      }

      circleHabitLongPressTimerRef.current = window.setTimeout(() => {
        circleHabitLongPressTimerRef.current = null;
        circleHabitSuppressCompletionUntilRef.current =
          Date.now() + CIRCLE_HABIT_LONG_PRESS_SUPPRESS_MS;
        lastCircleHabitTapRef.current = null;
        setPressedCircleHabitId(null);
        try {
          if (element.hasPointerCapture?.(pointerId)) {
            element.releasePointerCapture?.(pointerId);
          }
        } catch {
          // Pointer capture can already be released by the browser.
        }
        onEditHabit(habit, element);
      }, CIRCLE_HABIT_LONG_PRESS_MS);
    },
    [cancelCircleHabitLongPress, onEditHabit, pendingCircleHabitIds],
  );

  const handleCircleHabitDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>, habitId: string) => {
      if (Date.now() < circleHabitSuppressCompletionUntilRef.current) {
        event.preventDefault();
        event.stopPropagation();
        lastCircleHabitTapRef.current = null;
        return;
      }

      void handleCircleHabitCompletionToggle(habitId);
    },
    [handleCircleHabitCompletionToggle],
  );

  useEffect(() => cancelCircleHabitLongPress, [cancelCircleHabitLongPress]);

  return (
    <>
      <Card className="relative gap-0 overflow-hidden rounded-3xl border-white/10 bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)] py-0 shadow-[0_24px_60px_-45px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.035),_transparent_70%)]" />
        <CardHeader className="relative px-6 pt-3 pb-1">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
              CIRCLE HABITS
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/38">
                {statusLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[10px] font-semibold leading-none text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                {habits.length}
              </span>
              <button
                type="button"
                aria-label={
                  isSmallCircleHabitDensity
                    ? "Use large cards"
                    : "Use small cards"
                }
                aria-pressed={isSmallCircleHabitDensity}
                onClick={() =>
                  setCircleHabitCardDensity((currentDensity) =>
                    currentDensity === "large" ? "small" : "large",
                  )
                }
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-zinc-500 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
                  isSmallCircleHabitDensity
                    ? "text-zinc-300 shadow-[0_0_16px_-8px_rgba(255,255,255,0.72)]"
                    : null,
                )}
              >
                {isSmallCircleHabitDensity ? (
                  <Grid2x2
                    className="h-3.5 w-3.5"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                ) : (
                  <Grid3x3
                    className="h-3.5 w-3.5"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                )}
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="relative pt-0 pb-4">
          {isLoading ? (
            <div className={circleHabitGridClass}>
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className={cn(
                    "aspect-[5/6] bg-white/[0.06]",
                    isSmallCircleHabitDensity
                      ? "min-h-[70px] rounded-xl"
                      : "min-h-[96px] rounded-2xl",
                  )}
                />
              ))}
            </div>
          ) : null}

          {!isLoading && error ? (
            <p className="text-xs text-white/60">{error}</p>
          ) : null}

          {!isLoading && completionError ? (
            <p className="mb-2 text-xs text-white/60">{completionError}</p>
          ) : null}

          {!isLoading && !error && habits.length === 0 ? (
            <p className="text-xs text-white/60">no circle habits yet</p>
          ) : null}

          {!isLoading && !error && habits.length > 0 ? (
            <div className={circleHabitGridClass}>
              {decoratedHabits.map((habit) => {
                const habitName = habit.name;
                const isHabitCompletedToday =
                  isCircleHabitCompletedForCurrentDay(habit);
                const isHabitPending = pendingCircleHabitIds.has(habit.id);
                const streakDays = habit.current_streak_days ?? 0;
                const showStreakBadge = streakDays >= 2;
                const habitSkillIcon =
                  (habit.skill_id ? skillIconById.get(habit.skill_id) : null) ||
                  "💡";
                const isHabitOverdue = habit.dueLabel === "OVERDUE";
                const habitPillLabel = isHabitCompletedToday
                  ? "COMPLETE"
                  : habit.dueLabel;
                const habitStateBorderClass =
                  !isHabitCompletedToday && isHabitOverdue
                    ? "related-habit-due-border"
                    : null;
                const habitPillClass = isHabitCompletedToday
                  ? "border-emerald-200/25 bg-emerald-400/15 text-emerald-50"
                  : isHabitOverdue
                    ? "border-rose-200/20 bg-rose-950/35 text-rose-100/85"
                    : "border-white/10 bg-white/[0.06] text-white/65";

                return (
                  <div
                    key={habit.id}
                    className={cn(
                      "goal-card group relative flex aspect-[5/6] w-full transform-gpu flex-col text-white transition duration-200 select-none",
                      isSmallCircleHabitDensity
                        ? "min-h-[70px] rounded-xl p-1.5 sm:min-h-[82px] sm:p-2"
                        : "min-h-[96px] rounded-2xl p-3 sm:p-4",
                      isHabitCompletedToday
                        ? CIRCLE_HABIT_COMPLETED_CARD_CLASS
                        : [
                            getCircleHabitCardTypeClass(
                              habit.normalizedHabitType,
                            ),
                            getCircleHabitCardBorderClass(
                              habit.normalizedHabitType,
                            ),
                          ],
                      isHabitPending
                        ? "pointer-events-none cursor-default opacity-75"
                        : "cursor-pointer",
                      pressedCircleHabitId === habit.id
                        ? "scale-[0.985] translate-y-px brightness-95"
                        : null,
                      habitStateBorderClass,
                    )}
                    role="button"
                    tabIndex={isHabitPending ? -1 : 0}
                    aria-pressed={isHabitCompletedToday}
                    aria-disabled={isHabitPending}
                    aria-label={`${habitName}. ${habitPillLabel}. Double tap to ${
                      isHabitCompletedToday ? "undo" : "complete"
                    }.`}
                    title={`${habitName} - ${habitPillLabel}. Double tap to ${
                      isHabitCompletedToday ? "undo" : "complete"
                    }.`}
                    draggable={false}
                    style={{
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      WebkitTouchCallout: "none",
                      WebkitTapHighlightColor: "transparent",
                    }}
                    onPointerDown={(event) =>
                      handleCircleHabitPointerDown(event, habit)
                    }
                    onPointerUp={cancelCircleHabitLongPress}
                    onPointerCancel={cancelCircleHabitLongPress}
                    onPointerLeave={handleCircleHabitPointerLeave}
                    onDoubleClick={(event) =>
                      handleCircleHabitDoubleClick(event, habit.id)
                    }
                    onTouchEnd={(event) =>
                      handleCircleHabitTouchEnd(event, habit.id)
                    }
                    onContextMenu={(event) => event.preventDefault()}
                    onDragStart={(event) => event.preventDefault()}
                  >
                    {isHabitCompletedToday ? (
                      <>
                        <span
                          className={CIRCLE_HABIT_COMPLETED_SHIMMER_CLASS}
                          aria-hidden="true"
                        />
                        <span
                          className={CIRCLE_HABIT_COMPLETED_FACET_CLASS}
                          aria-hidden="true"
                        />
                      </>
                    ) : null}
                    {showStreakBadge ? (
                      <span
                        className="pointer-events-none absolute -right-0.5 -top-0.5 z-[8] flex flex-col items-center gap-0 text-[9px] font-semibold leading-[0.85] text-amber-100/95"
                        aria-label={`${streakDays} habit streak`}
                      >
                        <FlameEmber
                          level={
                            streakDays >= 7
                              ? "HIGH"
                              : streakDays >= 4
                                ? "MEDIUM"
                                : "LOW"
                          }
                          size="sm"
                          className="scale-90 drop-shadow-[0_0_6px_rgba(0,0,0,0.4)]"
                        />
                        <span className="tracking-normal">{streakDays}x</span>
                      </span>
                    ) : null}
                    <div className="relative z-[2] flex min-h-0 flex-1 flex-col items-center justify-between gap-1 text-center">
                      <span
                        className={cn(
                          "mt-1 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 font-semibold leading-none text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)]",
                          isSmallCircleHabitDensity
                            ? "h-6 w-6 text-[11px] sm:h-7 sm:w-7"
                            : "h-7 w-7 text-xs sm:h-8 sm:w-8",
                          isHabitCompletedToday
                            ? "grayscale"
                            : "drop-shadow-[0_8px_18px_rgba(0,0,0,0.38)]",
                        )}
                        aria-hidden="true"
                      >
                        {habitSkillIcon}
                      </span>
                      <div className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center">
                        <span
                          className={cn(
                            "line-clamp-3 w-full min-w-0 break-words px-0.5 text-center font-semibold leading-tight text-white whitespace-normal",
                            isSmallCircleHabitDensity
                              ? "text-[8px] sm:text-[9px]"
                              : "text-[9px] sm:text-[10px]",
                          )}
                          style={{ hyphens: "auto" }}
                        >
                          {habitName}
                        </span>
                      </div>
                      <div className="flex w-full min-w-0 flex-col items-center gap-1">
                        <span
                          className={cn(
                            "w-fit max-w-none whitespace-nowrap rounded-full border font-semibold uppercase leading-none tracking-[0.06em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                            isSmallCircleHabitDensity
                              ? "px-1.5 py-[2px] text-[7px]"
                              : "px-2 py-[3px] text-[8px]",
                            habitPillClass,
                          )}
                        >
                          {habitPillLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <MemoCompletionDialog
        open={Boolean(memoCompletionState)}
        context={
          memoCompletionState
            ? {
                habitId: memoCompletionState.id,
                habitName:
                  memoCompletionState.name?.trim() || "Untitled habit",
                habitType: memoCompletionState.habit_type,
                skillId: memoCompletionState.skill_id,
                skillIcon:
                  (memoCompletionState.skill_id
                    ? skillIconById.get(memoCompletionState.skill_id)
                    : null) ?? null,
                memoCaptureConfig: memoCompletionState.memo_capture_config,
                completionDate: new Date().toISOString(),
              }
            : null
        }
        onOpenChange={(open) => {
          if (!open) {
            setMemoCompletionState(null);
          }
        }}
        onCompleted={handleMemoCompletionSubmitted}
      />
    </>
  );
}

function InlineCircleHeaderEditor({
  circle,
  onCancel,
  onSaved,
}: {
  circle: CommandCircle;
  onCancel: () => void;
  onSaved: (circle: CircleUpdate) => void;
}) {
  const [name, setName] = useState(circle.name);
  const [iconEmoji, setIconEmoji] = useState(circle.icon_emoji?.trim() ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setName(circle.name);
    setIconEmoji(circle.icon_emoji?.trim() ?? "");
    setIsSaving(false);
    setSaveError(null);
  }, [circle.id, circle.name, circle.icon_emoji]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedIconEmoji = iconEmoji.trim();

    if (!trimmedName) {
      setSaveError("Circle name is required.");
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);

      const response = await fetch(
        `/api/circles/${encodeURIComponent(circle.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: trimmedName,
            icon_emoji: trimmedIconEmoji || null,
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Unable to update Circle.");
      }

      const data = (await response.json()) as { circle?: CircleUpdate };
      onSaved(
        data.circle ?? {
          id: circle.id,
          name: trimmedName,
          icon_emoji: trimmedIconEmoji || null,
        },
      );
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to update Circle.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative z-10 flex min-w-0 flex-1 flex-col gap-3 sm:pl-10 sm:pr-10 lg:pl-9 lg:pr-9"
    >
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <input
          aria-label="Circle icon"
          value={iconEmoji}
          onChange={(event) => setIconEmoji(event.target.value)}
          placeholder={getCircleInitials(circle.name)}
          className="flex h-12 w-12 shrink-0 rounded-2xl border border-white/12 bg-[#09090b] text-center text-lg font-semibold text-white shadow-[0_14px_28px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition placeholder:text-white/32 focus:border-white/30 focus:ring-2 focus:ring-white/15 sm:h-14 sm:w-14 sm:text-xl"
          maxLength={24}
          disabled={isSaving}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <input
            aria-label="Circle name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xl font-semibold tracking-tight text-white outline-none transition placeholder:text-white/35 focus:border-white/30 focus:ring-2 focus:ring-white/15 sm:h-12 sm:text-2xl"
            placeholder="Name your Circle"
            maxLength={80}
            disabled={isSaving}
          />
          {saveError ? (
            <p className="text-xs font-medium text-red-200">{saveError}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              aria-label="Cancel circle edit"
              className="flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/72 shadow-xl transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            >
              <X
                className="h-4 w-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                aria-hidden="true"
              />
            </button>
            <button
              type="submit"
              disabled={isSaving}
              aria-label={isSaving ? "Saving circle" : "Save circle"}
              className="flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-white/18 bg-white/10 text-white shadow-xl transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            >
              <Check
                className="h-4 w-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function CircleCommandDetail({
  circle,
  onCircleUpdated,
  needsSafeAreaTopPadding = false,
}: {
  circle: CommandCircle;
  onCircleUpdated: (circle: CircleUpdate) => void;
  needsSafeAreaTopPadding?: boolean;
}) {
  const members = circle.memberPreview ?? [];
  const memberCount = circle.activeMemberCount ?? 0;
  const role = circle.viewerRole?.toUpperCase() ?? "MEMBER";
  const [circleView, setCircleView] = useState<CircleDetailView>("goals");
  const [detailMembers, setDetailMembers] = useState<CircleMember[] | null>(
    null,
  );
  const [detailHabits, setDetailHabits] = useState<CircleHabit[] | null>(null);
  const [detailViewerUserId, setDetailViewerUserId] = useState<string | null>(
    null,
  );
  const [ownerSkills, setOwnerSkills] = useState<OwnerSkillOption[]>([]);
  const [ownerLocationContexts, setOwnerLocationContexts] = useState<
    OwnerLocationContextOption[]
  >([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberConstraintActionId, setMemberConstraintActionId] = useState<
    string | null
  >(null);
  const [memberRoleActionId, setMemberRoleActionId] = useState<string | null>(
    null,
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [inlineEditOpen, setInlineEditOpen] = useState(false);
  const [fabEditTarget, setFabEditTarget] = useState<FabEditTarget | null>(
    null,
  );

  useEffect(() => {
    setCircleView("goals");
    setSelectedMemberId(null);
    setInlineEditOpen(false);
    setFabEditTarget(null);
    setMemberConstraintActionId(null);
    setMemberRoleActionId(null);
  }, [circle.id]);

  const loadCircleDetail = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsLoadingMembers(true);
        setMembersError(null);
        setDetailMembers(null);
        setDetailHabits(null);
        setDetailViewerUserId(null);
        setOwnerSkills([]);
        setOwnerLocationContexts([]);

        const response = await fetch(
          `/api/circles/${encodeURIComponent(circle.id)}`,
          {
            cache: "no-store",
            signal,
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Unable to load Circle members.");
        }

        const data = (await response.json()) as {
          members?: CircleMember[];
          habits?: CircleHabit[];
          viewerUserId?: string | null;
          ownerSkills?: OwnerSkillOption[];
          ownerLocationContexts?: OwnerLocationContextOption[];
        };
        setDetailMembers(
          (data.members ?? []).map((member) => ({
            ...member,
            skill_constraint_ids: normalizeStringArray(
              member.skill_constraint_ids,
            ),
            location_context_ids: normalizeStringArray(
              member.location_context_ids,
            ),
          })),
        );
        setDetailHabits(data.habits ?? []);
        setDetailViewerUserId(data.viewerUserId ?? null);
        setOwnerSkills(data.ownerSkills ?? []);
        setOwnerLocationContexts(data.ownerLocationContexts ?? []);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setDetailMembers(null);
        setDetailHabits([]);
        setDetailViewerUserId(null);
        setOwnerSkills([]);
        setOwnerLocationContexts([]);
        setMembersError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load Circle members.",
        );
      } finally {
        if (!signal?.aborted) {
          setIsLoadingMembers(false);
        }
      }
    },
    [circle.id],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadCircleDetail(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadCircleDetail]);

  const handleEditHabit = useCallback(
    (habit: CircleHabit, element?: HTMLElement | null) => {
      setFabEditTarget({
        entityType: "HABIT",
        entityId: habit.id,
        title: habit.name?.trim() || "Untitled habit",
        originRect: element ? getCircleHabitFabOriginRect(element) : null,
        habitSnapshot: {
          name: habit.name,
          habitType: habit.habit_type,
          recurrence: habit.recurrence,
          durationMinutes: habit.duration_minutes,
          skillId: habit.skill_id,
          routineId: habit.routine_id,
          circleId: habit.circle_id,
          nextDueOverride: habit.next_due_override,
        },
      });
    },
    [],
  );

  const handleFabEditSaved = useCallback(
    (target: FabEditTarget) => {
      if (target.entityType === "HABIT") {
        void loadCircleDetail();
      }
    },
    [loadCircleDetail],
  );

  const handleMemberRoleChange = useCallback(
    async (member: CircleMemberDisplay, nextRole: CircleMemberRole) => {
      if (
        member.isPreview ||
        memberRoleActionId ||
        member.role.trim().toUpperCase() === nextRole
      ) {
        return;
      }

      const previousMembers = detailMembers;

      try {
        setMemberRoleActionId(member.id);
        setMembersError(null);
        setDetailMembers((currentMembers) =>
          (currentMembers ?? []).map((currentMember) =>
            currentMember.id === member.id
              ? { ...currentMember, role: nextRole }
              : currentMember,
          ),
        );

        const response = await fetch(
          `/api/circles/${encodeURIComponent(
            circle.id,
          )}/members/${encodeURIComponent(member.id)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ role: nextRole }),
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Unable to update member role.");
        }

        const data = (await response.json()) as {
          member?: CircleMember;
        };

        if (data.member) {
          setDetailMembers((currentMembers) =>
            (currentMembers ?? []).map((currentMember) =>
              currentMember.id === member.id
                ? {
                    ...currentMember,
                    role: data.member?.role ?? currentMember.role,
                    skill_constraint_ids: normalizeStringArray(
                      data.member?.skill_constraint_ids,
                    ),
                    location_context_ids: normalizeStringArray(
                      data.member?.location_context_ids,
                    ),
                    updated_at:
                      data.member?.updated_at ?? currentMember.updated_at,
                  }
                : currentMember,
            ),
          );
        }
      } catch (updateError) {
        setDetailMembers(previousMembers);
        setMembersError(
          updateError instanceof Error
            ? updateError.message
            : "Unable to update member role.",
        );
      } finally {
        setMemberRoleActionId(null);
      }
    },
    [circle.id, detailMembers, memberRoleActionId],
  );

  const handleMemberConstraintChange = useCallback(
    async (
      member: CircleMemberDisplay,
      field: MemberConstraintField,
      nextIds: string[],
    ) => {
      if (member.isPreview || memberConstraintActionId) {
        return;
      }

      const previousMembers = detailMembers;
      const actionId = `${member.id}:${field}`;

      try {
        setMemberConstraintActionId(actionId);
        setMembersError(null);
        setDetailMembers((currentMembers) =>
          (currentMembers ?? []).map((currentMember) =>
            currentMember.id === member.id
              ? { ...currentMember, [field]: nextIds }
              : currentMember,
          ),
        );

        const response = await fetch(
          `/api/circles/${encodeURIComponent(
            circle.id,
          )}/members/${encodeURIComponent(member.id)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ [field]: nextIds }),
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Unable to update member profile.");
        }

        const data = (await response.json()) as {
          member?: CircleMember;
        };

        if (data.member) {
          setDetailMembers((currentMembers) =>
            (currentMembers ?? []).map((currentMember) =>
              currentMember.id === member.id
                ? {
                    ...currentMember,
                    skill_constraint_ids: normalizeStringArray(
                      data.member?.skill_constraint_ids,
                    ),
                    location_context_ids: normalizeStringArray(
                      data.member?.location_context_ids,
                    ),
                    updated_at:
                      data.member?.updated_at ?? currentMember.updated_at,
                  }
                : currentMember,
            ),
          );
        }
      } catch (updateError) {
        setDetailMembers(previousMembers);
        setMembersError(
          updateError instanceof Error
            ? updateError.message
            : "Unable to update member profile.",
        );
      } finally {
        setMemberConstraintActionId(null);
      }
    },
    [circle.id, detailMembers, memberConstraintActionId],
  );

  const activeMembers =
    detailMembers === null
      ? members.map(normalizePreviewMember)
      : detailMembers
          .filter((member) => member.status === "ACTIVE")
          .map(normalizeFullMember);
  const skillConstraintOptions = useMemo(
    () =>
      ownerSkills.map((skill) => ({
        id: skill.id,
        label: skill.name,
        icon: skill.icon ?? null,
      })),
    [ownerSkills],
  );
  const locationContextOptions = useMemo(
    () =>
      ownerLocationContexts.map((locationContext) => ({
        id: locationContext.id,
        label:
          locationContext.label?.trim() ||
          locationContext.value?.trim() ||
          "Untitled location",
      })),
    [ownerLocationContexts],
  );
  const selectedMember = selectedMemberId
    ? (activeMembers.find(
        (member) =>
          member.id === selectedMemberId || member.userId === selectedMemberId,
      ) ?? null)
    : null;
  const isOwner = role === "OWNER";
  const canMakeOffer = elevatedRoles.has(role);
  const canEditWorkProfile = role === "OWNER" || role === "MANAGER";
  const circleIcon = getCircleIconDisplay(circle.icon_emoji);
  const detailTopPaddingClass = needsSafeAreaTopPadding
    ? "pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:pt-4"
    : "pt-3 sm:pt-4";

  useEffect(() => {
    if (!selectedMemberId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedMemberId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedMemberId]);

  const memberProfileOverlay =
    typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence>
            {selectedMember ? (
              <motion.div
                className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-black/60 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-[calc(0.75rem+env(safe-area-inset-top,0px))] backdrop-blur-md sm:px-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <button
                  type="button"
                  aria-label="Close member profile"
                  onClick={() => setSelectedMemberId(null)}
                  className="absolute inset-0 cursor-default bg-black/62 backdrop-blur-[2px]"
                />
                <CircleMemberFloatingDetail
                  circle={circle}
                  member={selectedMember}
                  canMakeOffer={canMakeOffer}
                  canEditWorkProfile={canEditWorkProfile}
                  skillOptions={skillConstraintOptions}
                  locationContextOptions={locationContextOptions}
                  roleActionId={memberRoleActionId}
                  constraintActionId={memberConstraintActionId}
                  onRoleChange={handleMemberRoleChange}
                  onConstraintChange={handleMemberConstraintChange}
                  onClose={() => setSelectedMemberId(null)}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <div className="relative min-h-full w-full overflow-visible">
      <main
        key={circle.id}
        className={cn(
          "relative min-h-full overflow-x-hidden px-2.5 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-[calc(8rem+env(safe-area-inset-bottom,0px))] lg:px-8",
          detailTopPaddingClass,
        )}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-x-hidden pt-0 sm:gap-6">
          <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#050505] via-[#0f0f10] to-[#1b1b1d] px-3 pb-3 pt-1.5 text-white shadow-[0_24px_70px_-42px_rgba(0,0,0,0.82)] sm:px-4 sm:pb-3.5 sm:pt-2 md:rounded-3xl">
            <div className="pointer-events-none absolute inset-0 z-0">
              <div className="absolute inset-x-16 -top-20 h-40 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.14),_transparent_70%)] blur-3xl" />
              <div className="absolute bottom-0 right-0 h-40 w-40 translate-x-1/4 translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.045),_transparent_60%)] blur-3xl" />
            </div>
            {inlineEditOpen ? (
              <InlineCircleHeaderEditor
                circle={circle}
                onCancel={() => setInlineEditOpen(false)}
                onSaved={(updatedCircle) => {
                  onCircleUpdated(updatedCircle);
                  setInlineEditOpen(false);
                }}
              />
            ) : (
              <div className="relative z-10 flex flex-row items-center gap-3 sm:gap-4 sm:pl-10 sm:pr-10 lg:pl-9 lg:pr-9">
                <span
                  className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/18 bg-gradient-to-b from-[#040404] via-[#08080a] to-black text-lg font-semibold text-white shadow-[0_18px_34px_rgba(0,0,0,0.58)] sm:h-14 sm:w-14 sm:text-xl"
                  aria-label={`Circle: ${circle.name}`}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.55),_rgba(255,255,255,0.05))]"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-[2px] rounded-[18px] bg-gradient-to-b from-white/20 via-white/5 to-white/0 opacity-80"
                  />
                  <span
                    className={cn(
                      "relative z-10 drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]",
                      circleIcon &&
                        "max-w-10 truncate text-center text-base leading-none sm:max-w-11 sm:text-lg",
                    )}
                  >
                    {circleIcon ?? getCircleInitials(circle.name)}
                  </span>
                </span>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="min-w-0">
                      <h2
                        className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl"
                      >
                        {circle.name}
                      </h2>
                    </div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AvatarStack
                        members={members}
                        fallbackName={circle.name}
                      />
                      <span className="truncate text-xs font-semibold text-white/68 sm:text-sm">
                        {formatMemberCount(memberCount)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {isOwner ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Circle actions"
                            className="flex h-10 w-10 items-center justify-center rounded-full text-white/68 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 data-[state=open]:bg-white/[0.08] data-[state=open]:text-white"
                          >
                            <MoreVertical
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          sideOffset={8}
                          className="min-w-[160px] rounded-md border border-white/10 bg-[#050507] p-1 text-white shadow-[0_18px_45px_rgba(0,0,0,0.5)]"
                        >
                          <DropdownMenuItem
                            onSelect={() => setInlineEditOpen(true)}
                            className="cursor-default rounded px-2.5 py-2 text-sm font-medium text-white/80 outline-none transition focus:bg-white/[0.06] focus:text-white data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-white"
                          >
                            Edit circle
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="grid w-full grid-cols-1 gap-5 lg:gap-6 xl:auto-rows-min xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <section className="relative min-h-[260px] overflow-visible rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] px-3 py-4 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:overflow-hidden sm:p-7">
              <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_55%)]" />
              <div className="relative z-10 space-y-4">
                <CircleViewToggle value={circleView} onChange={setCircleView} />
                <div className="mt-3 overflow-visible">
                  <MonumentGoalsList
                    sourceType="circle"
                    circleId={circle.id}
                    monumentView={circleView}
                    roadmapEmptyState={
                      <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-center text-sm text-[#A7B0BD] shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
                        No true roadmap linked to this Circle yet.
                      </Card>
                    }
                  />
                </div>
              </div>
            </section>

            <CircleHabitsPanel
              habits={detailHabits ?? []}
              currentUserId={detailViewerUserId}
              isLoading={isLoadingMembers && detailHabits === null}
              error={membersError}
              ownerSkills={ownerSkills}
              onEditHabit={handleEditHabit}
            />
          </div>

          <CircleMembersPanel
            members={activeMembers}
            isLoading={isLoadingMembers}
            error={membersError}
            selectedMemberId={selectedMemberId}
            onSelectMember={setSelectedMemberId}
          />
        </div>
      </main>
      <LazyFab
        editTarget={fabEditTarget}
        onEditTargetChange={(target) => setFabEditTarget(target)}
        onEditClose={() => setFabEditTarget(null)}
        onEditSaved={handleFabEditSaved}
        hideLauncher
        portalToBody
      />
      {memberProfileOverlay}
    </div>
  );
}

export const CommandCirclesSection = forwardRef<
  CommandCirclesSectionHandle,
  CommandCirclesSectionProps
>(function CommandCirclesSection({ className }, ref) {
  const toast = useToastHelpers();
  const [circles, setCircles] = useState<CommandCircle[]>([]);
  const [incomingOffers, setIncomingOffers] = useState<IncomingOffer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOffers, setIsLoadingOffers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(
    null,
  );
  const [respondingOfferResponse, setRespondingOfferResponse] = useState<
    "ACCEPTED" | "DECLINED" | null
  >(null);
  const [offerResponseError, setOfferResponseError] = useState<string | null>(
    null,
  );
  const [offerResponseErrorId, setOfferResponseErrorId] = useState<
    string | null
  >(null);
  const [activeCircleId, setActiveCircleId] = useState<string | null>(null);
  const [circleTransition, setCircleTransition] =
    useState<CircleDetailTransition | null>(null);
  const circleCardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const previousFocus = useRef<HTMLElement | null>(null);
  const previousBodyOverflow = useRef<string | null>(null);
  const previousHtmlOverflow = useRef<string | null>(null);
  const previousHtmlOverscroll = useRef<string | null>(null);
  const previousBodyOverscroll = useRef<string | null>(null);
  const openScrollFrameRef = useRef<number | null>(null);
  const circleDetailOverlayScrollRef = useRef<HTMLDivElement | null>(null);

  const activeCircle =
    circles.find((circle) => circle.id === activeCircleId) ?? null;
  const isCircleDetailMounted = activeCircle !== null;

  const loadCircles = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/circles", {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Unable to load Circles.");
      }

      const data = (await response.json()) as { circles?: CommandCircle[] };
      setCircles(
        (data.circles ?? []).filter((circle) =>
          elevatedRoles.has(circle.viewerRole?.toUpperCase() ?? ""),
        ),
      );
    } catch (loadError) {
      if (
        loadError instanceof DOMException &&
        loadError.name === "AbortError"
      ) {
        return;
      }

      setCircles([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load Circles.",
      );
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  const loadIncomingOffers = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoadingOffers(true);
      setOffersError(null);

      const response = await fetch("/api/offers", {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Unable to load offers.");
      }

      const data = (await response.json()) as { offers?: IncomingOffer[] };
      setIncomingOffers(data.offers ?? []);
    } catch (loadError) {
      if (
        loadError instanceof DOMException &&
        loadError.name === "AbortError"
      ) {
        return;
      }

      setIncomingOffers([]);
      setOffersError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load offers.",
      );
    } finally {
      if (!signal?.aborted) {
        setIsLoadingOffers(false);
      }
    }
  }, []);

  const refreshCommandData = useCallback(
    () => Promise.all([loadCircles(), loadIncomingOffers()]).then(() => {}),
    [loadCircles, loadIncomingOffers],
  );

  const setCircleCardRef = useCallback(
    (circleId: string, node: HTMLButtonElement | null) => {
      if (node) {
        circleCardRefs.current.set(circleId, node);
      } else {
        circleCardRefs.current.delete(circleId);
      }
    },
    [],
  );

  const getCircleCardRect = useCallback((circleId: string) => {
    const sourceCard = circleCardRefs.current.get(circleId);

    if (!sourceCard) {
      return null;
    }

    const rect = sourceCard.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return measureCircleRect(rect);
  }, []);

  const openCircleDetail = useCallback(
    (circleId: string, event: MouseEvent<HTMLButtonElement>) => {
      const sourceElement = event.currentTarget;
      const sourceRect = measureCircleRect(
        sourceElement.getBoundingClientRect(),
      );

      if (sourceRect.width <= 0 || sourceRect.height <= 0) {
        return;
      }

      resetCircleDetailPageScroll();

      const appViewportRect = getCircleAppViewportRect();
      const targetRect = getCircleDetailPopupRect(appViewportRect);

      setCircleTransition({
        circleId,
        phase: "opening",
        sourceRect,
        targetRect,
        appViewportRect,
        sourceBorderRadius: getElementBorderRadius(sourceElement),
        targetBorderRadius:
          window.innerWidth >= 768
            ? CIRCLE_DETAIL_BORDER_RADIUS
            : CIRCLE_CARD_BORDER_RADIUS,
        closeRect: null,
      });
      setActiveCircleId(circleId);

      if (openScrollFrameRef.current !== null) {
        cancelAnimationFrame(openScrollFrameRef.current);
      }

      openScrollFrameRef.current = requestAnimationFrame(() => {
        openScrollFrameRef.current = null;
        const didCorrectScroll = resetCircleDetailPageScroll();

        if (!didCorrectScroll) {
          return;
        }

        setCircleTransition((currentTransition) => {
          if (
            !currentTransition ||
            currentTransition.circleId !== circleId ||
            currentTransition.phase === "closing"
          ) {
            return currentTransition;
          }

          const nextAppViewportRect = getCircleAppViewportRect();

          return {
            ...currentTransition,
            appViewportRect: nextAppViewportRect,
            targetRect: getCircleDetailPopupRect(nextAppViewportRect),
          };
        });
      });
    },
    [],
  );

  const closeCircleDetail = useCallback(() => {
    if (!activeCircleId) {
      return;
    }

    circleDetailOverlayScrollRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    const closeRect = getCircleCardRect(activeCircleId);

    setCircleTransition((currentTransition) => {
      if (!currentTransition || currentTransition.phase === "closing") {
        return currentTransition;
      }

      return {
        ...currentTransition,
        phase: "closing",
        closeRect,
      };
    });
  }, [activeCircleId, getCircleCardRect]);

  const handleCircleShellAnimationComplete = useCallback(() => {
    if (!circleTransition) {
      return;
    }

    if (circleTransition.phase === "opening") {
      setCircleTransition({
        ...circleTransition,
        phase: "open",
      });
      return;
    }

    if (circleTransition.phase === "closing") {
      setActiveCircleId(null);
      setCircleTransition(null);
    }
  }, [circleTransition]);

  useEffect(() => {
    if (!isCircleDetailMounted) {
      return;
    }

    const updateCircleDetailTargetRect = () => {
      setCircleTransition((currentTransition) => {
        if (!currentTransition || currentTransition.phase === "closing") {
          return currentTransition;
        }

        const appViewportRect = getCircleAppViewportRect();

        return {
          ...currentTransition,
          targetRect: getCircleDetailPopupRect(appViewportRect),
          appViewportRect,
          targetBorderRadius:
            window.innerWidth >= 768
              ? CIRCLE_DETAIL_BORDER_RADIUS
              : CIRCLE_CARD_BORDER_RADIUS,
        };
      });
    };

    window.addEventListener("resize", updateCircleDetailTargetRect);
    window.addEventListener("orientationchange", updateCircleDetailTargetRect);

    return () => {
      window.removeEventListener("resize", updateCircleDetailTargetRect);
      window.removeEventListener(
        "orientationchange",
        updateCircleDetailTargetRect,
      );
    };
  }, [isCircleDetailMounted]);

  useEffect(() => {
    if (!isCircleDetailMounted || circleTransition?.phase === "closing") {
      return;
    }

    setCircleTransition((currentTransition) => {
      if (!currentTransition || currentTransition.phase === "closing") {
        return currentTransition;
      }

      const appViewportRect = getCircleAppViewportRect();

      return {
        ...currentTransition,
        targetRect: getCircleDetailPopupRect(appViewportRect),
        appViewportRect,
      };
    });
  }, [circleTransition?.phase, isCircleDetailMounted]);

  const circleShellRect =
    circleTransition?.phase === "closing"
      ? (circleTransition.closeRect ?? circleTransition.targetRect)
      : circleTransition?.targetRect;
  const circleShellIsFallbackClose =
    circleTransition?.phase === "closing" && !circleTransition.closeRect;
  const circleShellBorderRadius =
    circleTransition?.phase === "closing" && circleTransition.closeRect
      ? circleTransition.sourceBorderRadius
      : (circleTransition?.targetBorderRadius ?? CIRCLE_DETAIL_BORDER_RADIUS);
  const circleDetailContentVisible = circleTransition?.phase === "open";
  const isCircleSourceCardHidden =
    circleTransition !== null &&
    circleTransition.circleId === activeCircleId &&
    circleTransition.phase !== "open";

  useImperativeHandle(
    ref,
    () => ({
      refresh: refreshCommandData,
      isDetailOpen: () => isCircleDetailMounted,
    }),
    [isCircleDetailMounted, refreshCommandData],
  );

  const handleOfferResponse = useCallback(
    async (offer: IncomingOffer, responseValue: "ACCEPTED" | "DECLINED") => {
      if (respondingOfferId) {
        return;
      }

      if (responseValue === "ACCEPTED" && offer.terms?.mode !== "FIXED") {
        setOfferResponseErrorId(offer.id);
        setOfferResponseError("Flexible acceptance is coming next.");
        return;
      }

      try {
        setRespondingOfferId(offer.id);
        setRespondingOfferResponse(responseValue);
        setOfferResponseErrorId(null);
        setOfferResponseError(null);

        const response = await fetch(
          `/api/offers/${encodeURIComponent(offer.id)}/respond`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ response: responseValue }),
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Unable to respond to offer.");
        }

        setIncomingOffers((currentOffers) =>
          currentOffers.filter((currentOffer) => currentOffer.id !== offer.id),
        );
        toast.success(
          responseValue === "ACCEPTED" ? "Offer accepted" : "Offer declined",
        );
      } catch (respondError) {
        setOfferResponseErrorId(offer.id);
        setOfferResponseError(
          respondError instanceof Error
            ? respondError.message
            : "Unable to respond to offer.",
        );
      } finally {
        setRespondingOfferId(null);
        setRespondingOfferResponse(null);
      }
    },
    [respondingOfferId, toast],
  );

  useEffect(() => {
    return () => {
      if (openScrollFrameRef.current !== null) {
        cancelAnimationFrame(openScrollFrameRef.current);
        openScrollFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void loadCircles(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadCircles]);

  useEffect(() => {
    const controller = new AbortController();

    void loadIncomingOffers(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadIncomingOffers]);

  useEffect(() => {
    const closeActiveDetail = () => closeCircleDetail();

    window.addEventListener(
      CLOSE_ACTIVE_COMMAND_CIRCLE_DETAIL_EVENT,
      closeActiveDetail,
    );

    return () => {
      window.removeEventListener(
        CLOSE_ACTIVE_COMMAND_CIRCLE_DETAIL_EVENT,
        closeActiveDetail,
      );
    };
  }, [closeCircleDetail]);

  useEffect(() => {
    if (!activeCircleId) return;

    requestAnimationFrame(() => {
      circleDetailOverlayScrollRef.current?.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });
    });
  }, [activeCircleId]);

  useEffect(() => {
    if (!isCircleDetailMounted) {
      previousFocus.current?.focus();
      return;
    }

    previousFocus.current = document.activeElement as HTMLElement;
    const { body, documentElement } = document;

    previousBodyOverflow.current = body.style.overflow;
    previousHtmlOverflow.current = documentElement.style.overflow;
    previousHtmlOverscroll.current = documentElement.style.overscrollBehavior;
    previousBodyOverscroll.current = body.style.overscrollBehavior;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    body.classList.add("command-circle-detail-open");

    return () => {
      body.style.overflow = previousBodyOverflow.current ?? "";
      documentElement.style.overflow = previousHtmlOverflow.current ?? "";
      documentElement.style.overscrollBehavior =
        previousHtmlOverscroll.current ?? "";
      body.style.overscrollBehavior = previousBodyOverscroll.current ?? "";
      previousBodyOverflow.current = null;
      previousHtmlOverflow.current = null;
      previousHtmlOverscroll.current = null;
      previousBodyOverscroll.current = null;
      body.classList.remove("command-circle-detail-open");
    };
  }, [isCircleDetailMounted]);

  if (
    !isLoading &&
    !error &&
    circles.length === 0 &&
    !isLoadingOffers &&
    !offersError &&
    incomingOffers.length === 0
  ) {
    return null;
  }

  const shouldShowCircles = isLoading || !!error || circles.length > 0;
  const circleDetailOverlay =
    activeCircle && circleTransition && circleShellRect
      ? (() => {
          const openingTransform = getCircleDetailTransform(
            circleTransition.sourceRect,
            circleTransition.targetRect,
          );
          const activeShellRect =
            circleTransition.phase === "closing" && circleTransition.closeRect
              ? circleTransition.closeRect
              : circleTransition.targetRect;
          const activeTransform = getCircleDetailTransform(
            activeShellRect,
            circleTransition.targetRect,
          );

          return (
            <div
              ref={circleDetailOverlayScrollRef}
              className="fixed inset-x-0 z-40 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-transparent pb-[calc(7rem+env(safe-area-inset-bottom,0px))] [-webkit-overflow-scrolling:touch] sm:pb-[calc(2rem+env(safe-area-inset-bottom,0px))]"
              style={{
                top: circleTransition.appViewportRect.top,
                height: circleTransition.appViewportRect.height,
              }}
            >
              <motion.div
                className="pointer-events-auto fixed inset-0 bg-black/60 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: circleTransition.phase === "closing" ? 0 : 1,
                }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                className={cn(
                  "app-card relative z-10 mx-auto flex min-h-[var(--circle-detail-overlay-height,100dvh)] flex-col border border-white/10 bg-[#050507] shadow-[0_38px_120px_rgba(0,0,0,0.72)] ring-1 ring-white/[0.06]",
                  circleTransition.phase === "open"
                    ? "overflow-visible"
                    : "overflow-hidden",
                )}
                style={{
                  width: circleTransition.targetRect.width,
                  "--circle-detail-overlay-height": `${circleTransition.targetRect.height}px`,
                  transformOrigin: "top left",
                } as CSSProperties}
                initial={{
                  x: openingTransform.x,
                  y: openingTransform.y,
                  scaleX: openingTransform.scaleX,
                  scaleY: openingTransform.scaleY,
                  borderRadius: circleTransition.sourceBorderRadius,
                  opacity: 1,
                }}
                animate={{
                  x:
                    circleTransition.phase === "closing"
                      ? activeTransform.x
                      : 0,
                  y:
                    circleTransition.phase === "closing"
                      ? activeTransform.y
                      : 0,
                  scaleX:
                    circleShellIsFallbackClose
                      ? 0.96
                      : circleTransition.phase === "closing"
                      ? activeTransform.scaleX
                      : 1,
                  scaleY:
                    circleShellIsFallbackClose
                      ? 0.96
                      : circleTransition.phase === "closing"
                      ? activeTransform.scaleY
                      : 1,
                  borderRadius: circleShellBorderRadius,
                  opacity: circleShellIsFallbackClose ? 0 : 1,
                }}
                transition={{
                  type: "spring",
                  stiffness: 520,
                  damping: 44,
                  mass: 0.9,
                }}
                onAnimationComplete={handleCircleShellAnimationComplete}
              >
                <motion.div
                  className="min-h-full w-full overflow-visible"
                  initial={false}
                  animate={{ opacity: circleDetailContentVisible ? 1 : 0 }}
                  transition={{ duration: 0.14, ease: "easeOut" }}
                >
                  <CircleCommandDetail
                    circle={activeCircle}
                    needsSafeAreaTopPadding={
                      circleTransition.appViewportRect.top <= 1
                    }
                    onCircleUpdated={(updatedCircle) => {
                      setCircles((currentCircles) =>
                        currentCircles.map((circle) =>
                          circle.id === updatedCircle.id
                            ? { ...circle, ...updatedCircle }
                            : circle,
                        ),
                      );
                    }}
                  />
                </motion.div>
              </motion.div>
            </div>
          );
        })()
      : null;

  return (
    <section className={cn("relative text-white", className)}>
      <div className="relative z-0">
        <IncomingOffersSection
          offers={incomingOffers}
          isLoading={isLoadingOffers}
          error={offersError}
          respondingOfferId={respondingOfferId}
          respondingResponse={respondingOfferResponse}
          responseErrorOfferId={offerResponseErrorId}
          responseError={offerResponseError}
          onRespond={handleOfferResponse}
        />

        {shouldShowCircles ? (
          <div className="mb-3 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-white">Circles</h2>
          </div>
        ) : null}

        {shouldShowCircles && isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="min-h-[184px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="h-5 w-2/3 rounded-full bg-white/10" />
                <div className="mt-3 h-3 w-1/3 rounded-full bg-white/10" />
                <div className="mt-9 h-3 w-full rounded-full bg-white/10" />
                <div className="mt-3 h-3 w-3/4 rounded-full bg-white/10" />
              </div>
            ))}
          </div>
        ) : null}

        {shouldShowCircles && !isLoading && error ? (
          <article className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-5 text-sm text-rose-100 shadow-xl shadow-rose-950/20">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200/70">
              Circles unavailable
            </p>
            <p className="mt-2 leading-6">{error}</p>
          </article>
        ) : null}

        {shouldShowCircles && !isLoading && !error && circles.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {circles.map((circle) => (
              <CircleCard
                key={circle.id}
                ref={(node) => setCircleCardRef(circle.id, node)}
                circle={circle}
                isHidden={
                  isCircleSourceCardHidden &&
                  circleTransition?.circleId === circle.id
                }
                onSelect={(event) => openCircleDetail(circle.id, event)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {circleDetailOverlay && typeof document !== "undefined"
        ? createPortal(circleDetailOverlay, document.body)
        : null}
    </section>
  );
});
