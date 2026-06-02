"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDot,
  Handshake,
  LockKeyhole,
  MapPin,
  MoreHorizontal,
  ShieldCheck,
  Target,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { LazyFab } from "@/components/ui/LazyFab";
import type { FabEditTarget } from "@/components/ui/Fab";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToastHelpers } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

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
  recurrence: string | null;
  recurrence_days: number[] | null;
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

type CircleDetailView = "goals" | "roadmap";
type MemberConstraintField = "skill_constraint_ids" | "location_context_ids";
type OfferMode = "FIXED" | "FLEXIBLE";

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

const PULL_EXIT_THRESHOLD_PX = 56;
const PULL_REFRESH_THRESHOLD_PX = 72;
const PULL_REFRESH_MAX_OFFSET_PX = 96;

function isInteractivePullTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "a,button,input,select,textarea,[role='button'],[role='menuitem']",
      ),
    )
  );
}

type PullRefreshStatus = "idle" | "pulling" | "ready" | "refreshing";

type OfferWeekdayValue = (typeof offerWeekdays)[number]["value"];

function formatMemberCount(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
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

function formatLabelValue(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatHabitDuration(durationMinutes: number | null | undefined) {
  if (
    typeof durationMinutes !== "number" ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return null;
  }

  return `${durationMinutes} min`;
}

function formatHabitRecurrence(habit: CircleHabit) {
  const recurrence = habit.recurrence?.trim();

  if (!recurrence) {
    return null;
  }

  const normalized = recurrence.toLowerCase();
  const interval = Array.isArray(habit.recurrence_days)
    ? habit.recurrence_days.find((day) => Number.isInteger(day) && day > 0)
    : null;

  if (normalized === "every x days" && interval) {
    return `Every ${interval} ${interval === 1 ? "day" : "days"}`;
  }

  return formatLabelValue(recurrence);
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

function CircleCard({
  circle,
  isSelected,
  onSelect,
}: {
  circle: CommandCircle;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const memberCount = circle.activeMemberCount ?? 0;
  const members = circle.memberPreview ?? [];
  const role = circle.viewerRole?.toUpperCase() ?? null;
  const circleIcon = getCircleIconDisplay(circle.icon_emoji);

  return (
    <motion.button
      type="button"
      layoutId={`command-circle-card-${circle.id}`}
      onClick={onSelect}
      className={cn(
        "group relative min-h-[156px] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.13),transparent_32%),linear-gradient(145deg,rgba(25,25,28,0.96),rgba(5,5,6,0.98))] p-4 text-left shadow-[0_24px_70px_rgba(0,0,0,0.42)] transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70",
        isSelected && "border-white/30",
      )}
    >
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <motion.h2
            layoutId={`command-circle-title-${circle.id}`}
            className="truncate text-lg font-semibold text-white"
          >
            {circle.name}
          </motion.h2>
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
    </motion.button>
  );
}

function PlaceholderAction({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      disabled
      className="inline-flex min-h-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] px-3 text-[11px] font-semibold text-white/45 opacity-70"
      title="Coming next"
    >
      {children}
    </button>
  );
}

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

function getConstraintSummary(
  selectedIds: string[],
  optionById: Map<string, ConstraintOption>,
  emptyLabel: string,
) {
  if (selectedIds.length === 0) {
    return emptyLabel;
  }

  const labels = selectedIds.map(
    (id) => optionById.get(id)?.label ?? shortenUserId(id),
  );
  const visibleLabels = labels.slice(0, 2).join(", ");
  const hiddenCount = labels.length - 2;

  return hiddenCount > 0
    ? `${visibleLabels}, +${hiddenCount} more`
    : visibleLabels;
}

function getConstraintOptionLabel(
  id: string,
  optionById: Map<string, ConstraintOption>,
) {
  return optionById.get(id)?.label ?? shortenUserId(id);
}

function ConstraintSelectionPreview({
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
      <span className="inline-flex min-h-7 max-w-full items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-semibold text-white/58">
        {emptyLabel}
      </span>
    );
  }

  const visibleIds = selectedIds.slice(0, 2);
  const hiddenCount = selectedIds.length - visibleIds.length;

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {visibleIds.map((id) => {
        const option = optionById.get(id);

        return (
          <span
            key={id}
            className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-semibold text-white/62"
          >
            {option?.icon ? (
              <span className="shrink-0 text-xs" aria-hidden="true">
                {option.icon}
              </span>
            ) : null}
            <span className="truncate">
              {getConstraintOptionLabel(id, optionById)}
            </span>
          </span>
        );
      })}
      {hiddenCount > 0 ? (
        <span className="inline-flex min-h-7 items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-semibold text-white/50">
          +{hiddenCount} more
        </span>
      ) : null}
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
  const summary = getConstraintSummary(selectedIds, optionById, emptyLabel);
  const canOpen = canEdit && !isSaving && options.length > 0;
  const canReset = canEdit && !isSaving && selectedIds.length > 0;

  useEffect(() => {
    if (!canOpen) {
      setIsOpen(false);
    }
  }, [canOpen]);

  return (
    <div className="relative min-w-0 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/48 ring-1 ring-white/10">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h6 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
              {label}
            </h6>
            <p className="mt-1 truncate text-xs font-semibold text-white/75">
              {isSaving ? "Saving..." : summary}
            </p>
          </div>
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

      <div className="mt-3">
        <ConstraintSelectionPreview
          selectedIds={selectedIds}
          optionById={optionById}
          emptyLabel={emptyLabel}
        />
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
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/48 ring-1 ring-white/10">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h6 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
            {label}
          </h6>
          <div className="mt-3">
            <ConstraintSelectionPreview
              selectedIds={selectedIds}
              optionById={optionById}
              emptyLabel={emptyLabel}
            />
          </div>
        </div>
      </div>
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
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/48 ring-1 ring-white/10">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
        </span>
        <h6 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
          Availability
        </h6>
      </div>

      <div className="mt-3 grid gap-2">
        {commandAccess.isLoading ? (
          <p className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-sm font-semibold text-white/70">
            Loading command access...
          </p>
        ) : commandAccess.error ? (
          <div className="rounded-xl border border-amber-300/15 bg-amber-400/10 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <p className="text-sm font-semibold text-amber-50/88">
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
                      className="w-full rounded-xl border border-white/[0.10] bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-black px-3.5 py-3 shadow-[0_10px_20px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.06)]"
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
                    className="w-full rounded-xl border border-dashed border-white/[0.14] bg-white/[0.025] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
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
                <p className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-sm font-semibold text-white/78">
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
              <p className="rounded-lg border border-amber-300/15 bg-amber-400/10 px-2.5 py-2 text-xs leading-5 text-amber-50/75">
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
  isOwner,
  canMakeOffer,
  canEditWorkProfile,
  skillOptions,
  locationContextOptions,
  constraintActionId,
  onConstraintChange,
  onClose,
}: {
  circle: CommandCircle;
  member: CircleMemberDisplay;
  isOwner: boolean;
  canMakeOffer: boolean;
  canEditWorkProfile: boolean;
  skillOptions: ConstraintOption[];
  locationContextOptions: ConstraintOption[];
  constraintActionId: string | null;
  onConstraintChange: (
    member: CircleMemberDisplay,
    field: MemberConstraintField,
    nextIds: string[],
  ) => void;
  onClose: () => void;
}) {
  const statusLabel = formatMemberStatus(member.status);
  const skillActionId = `${member.id}:skill_constraint_ids`;
  const locationActionId = `${member.id}:location_context_ids`;
  const isConstraintSaving = constraintActionId !== null;
  const [isOfferOpen, setIsOfferOpen] = useState(false);
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
      className="relative z-10 flex h-[100dvh] max-h-none w-[calc(100%-1.5rem)] max-w-2xl flex-col overflow-y-auto rounded-3xl border border-white/10 bg-[#08090c]/95 shadow-[0_38px_120px_rgba(0,0,0,0.76)] ring-1 ring-white/[0.06] backdrop-blur-xl"
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
              <span>{statusLabel}</span>
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

      <div className="grid gap-3 overflow-y-auto p-4 sm:p-5">
        {offerSuccess ? (
          <div className="rounded-2xl border border-emerald-200/15 bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-50/85">
            {offerSuccess}
          </div>
        ) : null}

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className="h-4 w-4 text-white/55"
                  aria-hidden="true"
                />
                <h5 className="text-sm font-semibold text-white">
                  Role & Access
                </h5>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/50">
                Current role:{" "}
                <span className="font-semibold text-white/75">
                  {member.role.toUpperCase()}
                </span>
              </p>
            </div>
            {isOwner ? (
              <PlaceholderAction>Change Role</PlaceholderAction>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
          <div className="flex items-center gap-2">
            <BriefcaseBusiness
              className="h-4 w-4 text-white/55"
              aria-hidden="true"
            />
            <h5 className="text-sm font-semibold text-white">Work Profile</h5>
          </div>
          <div className="mt-3 grid gap-2.5">
            {canEditWorkProfile ? (
              <>
                <WorkProfileConstraintMultiSelect
                  Icon={Target}
                  label="Skill constraints"
                  options={skillOptions}
                  selectedIds={member.skillConstraintIds}
                  emptyLabel="All skills"
                  noOptionsLabel="No owner skills yet"
                  canEdit={!member.isPreview && !isConstraintSaving}
                  isSaving={constraintActionId === skillActionId}
                  onChange={(nextIds) =>
                    onConstraintChange(member, "skill_constraint_ids", nextIds)
                  }
                />
                <WorkProfileConstraintMultiSelect
                  Icon={MapPin}
                  label="Location contexts"
                  options={locationContextOptions}
                  selectedIds={member.locationContextIds}
                  emptyLabel="No locations granted"
                  noOptionsLabel="No locations yet"
                  canEdit={!member.isPreview && !isConstraintSaving}
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
                  label="Skill constraints"
                  options={skillOptions}
                  selectedIds={member.skillConstraintIds}
                  emptyLabel="All skills"
                />
                <WorkProfileConstraintReadOnly
                  Icon={MapPin}
                  label="Location contexts"
                  options={locationContextOptions}
                  selectedIds={member.locationContextIds}
                  emptyLabel="No locations granted"
                />
              </>
            )}
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
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-white/55" aria-hidden="true" />
            <h5 className="text-sm font-semibold text-white">
              Assigned Circle Work
            </h5>
          </div>
          <div className="mt-3">
            <MemberDetailEmptyRow
              Icon={BriefcaseBusiness}
              text="No assigned Circle work yet."
            />
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
          <div className="flex items-center gap-2">
            <CalendarDays
              className="h-4 w-4 text-white/55"
              aria-hidden="true"
            />
            <h5 className="text-sm font-semibold text-white">
              Scheduled Circle Events
            </h5>
          </div>
          <div className="mt-3">
            <MemberDetailEmptyRow
              Icon={CalendarDays}
              text="No Circle events scheduled yet."
            />
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-white/55" aria-hidden="true" />
            <h5 className="text-sm font-semibold text-white">Performance</h5>
          </div>
          <div className="mt-3">
            <MemberDetailEmptyRow
              Icon={BarChart3}
              text="Completion stats will appear here once Circle work is scheduled."
            />
          </div>
        </section>
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

function CircleRoadmapEmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.03] px-4 py-5 shadow-[0_12px_34px_rgba(0,0,0,0.28)] sm:px-5 sm:py-6">
      <h2 className="text-sm font-semibold text-white">
        No Circle work linked yet
      </h2>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[#A7B0BD]">
        Add habits, roles, or command blocks to this Circle to build its
        roadmap.
      </p>
    </div>
  );
}

function CircleWorkRenderer({
  view,
  habits,
  members,
  isLoading,
  error,
  onEditHabit,
}: {
  view: CircleDetailView;
  habits: CircleHabit[];
  members: CircleMemberDisplay[];
  isLoading: boolean;
  error: string | null;
  onEditHabit: (habit: CircleHabit) => void;
}) {
  const hasHabits = habits.length > 0;
  const title = view === "roadmap" ? "Circle Roadmap" : "Circle Goal Grid";
  const eyebrow = view === "roadmap" ? "Command Roadmap" : "Command Work";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-white/60">
            {eyebrow}
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">{title}</h3>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-white/52">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            {habits.length} {habits.length === 1 ? "habit" : "habits"}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/45">
          Loading Circle work...
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!isLoading && !error && !hasHabits ? <CircleRoadmapEmptyState /> : null}

      {!isLoading && !error && hasHabits ? (
        view === "roadmap" ? (
          <div className="grid gap-2.5">
            {habits.map((habit, index) => (
              <CircleRoadmapHabitRow
                key={habit.id}
                habit={habit}
                stepNumber={index + 1}
                onEditHabit={onEditHabit}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {habits.map((habit) => (
              <CircleGoalGridHabitCard
                key={habit.id}
                habit={habit}
                onEditHabit={onEditHabit}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function CircleGoalGridHabitCard({
  habit,
  onEditHabit,
}: {
  habit: CircleHabit;
  onEditHabit: (habit: CircleHabit) => void;
}) {
  const meta = getCircleHabitMeta(habit);

  return (
    <button
      type="button"
      onClick={() => onEditHabit(habit)}
      className="min-h-[8.5rem] w-full rounded-2xl border border-white/[0.08] bg-black/[0.24] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/[0.16] hover:bg-white/[0.045] active:border-white/[0.18] active:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/65"
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/58 ring-1 ring-white/10">
            <Target className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
              Circle Habit
            </p>
            <h4 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-white/86">
              {habit.name?.trim() || "Untitled habit"}
            </h4>
          </div>
        </div>
        {meta.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {meta.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/50"
              >
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function CircleRoadmapHabitRow({
  habit,
  stepNumber,
  onEditHabit,
}: {
  habit: CircleHabit;
  stepNumber: number;
  onEditHabit: (habit: CircleHabit) => void;
}) {
  const meta = getCircleHabitMeta(habit);

  return (
    <button
      type="button"
      onClick={() => onEditHabit(habit)}
      className="w-full rounded-2xl border border-white/[0.08] bg-black/[0.24] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/[0.16] hover:bg-white/[0.045] active:border-white/[0.18] active:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/65"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-xs font-semibold text-white/58">
          {stepNumber}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="min-w-0 truncate text-sm font-semibold text-white/86">
              {habit.name?.trim() || "Untitled habit"}
            </h4>
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
              Circle Habit
            </span>
          </div>
          {meta.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {meta.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/50"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function getCircleHabitMeta(habit: CircleHabit) {
  return [
    habit.habit_type ? formatLabelValue(habit.habit_type) : null,
    formatHabitDuration(habit.duration_minutes),
    formatHabitRecurrence(habit),
  ].filter((item): item is string => Boolean(item));
}

function CircleHabitsPanel({
  habits,
  isLoading,
  error,
  onEditHabit,
}: {
  habits: CircleHabit[];
  isLoading: boolean;
  error: string | null;
  onEditHabit: (habit: CircleHabit) => void;
}) {
  return (
    <section className="relative min-h-[260px] overflow-visible rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] p-5 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:overflow-hidden sm:p-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_60%)]" />
      <div className="relative space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-white/60">
            Circle Habits
          </p>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/45">
            Loading Circle habits...
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {!isLoading && !error && habits.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-4 text-sm text-white/48">
            No Circle habits yet.
          </div>
        ) : null}

        {!isLoading && !error && habits.length > 0 ? (
          <div className="grid gap-2.5">
            {habits.map((habit) => {
              const meta = [
                habit.habit_type ? formatLabelValue(habit.habit_type) : null,
                formatHabitDuration(habit.duration_minutes),
                formatHabitRecurrence(habit),
              ].filter((item): item is string => Boolean(item));

              return (
                <button
                  type="button"
                  key={habit.id}
                  onClick={() => onEditHabit(habit)}
                  className="w-full cursor-pointer rounded-2xl border border-white/[0.08] bg-black/[0.22] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/[0.16] hover:bg-white/[0.04] active:border-white/[0.18] active:bg-white/[0.055] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/65"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/58 ring-1 ring-white/10">
                      <CircleDot className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-white/85">
                        {habit.name?.trim() || "Untitled habit"}
                      </h3>
                      {meta.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {meta.map((item) => (
                            <span
                              key={item}
                              className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/50"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EditCircleModal({
  circle,
  onClose,
  onSaved,
  onDeleted,
}: {
  circle: CommandCircle;
  onClose: () => void;
  onSaved: (circle: CircleUpdate) => void;
  onDeleted: (circleId: string) => void;
}) {
  const [name, setName] = useState(circle.name);
  const [iconEmoji, setIconEmoji] = useState(circle.icon_emoji?.trim() ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canDelete = deleteConfirmation === circle.name;
  const isBusy = isSaving || isDeleting;

  useEffect(() => {
    setName(circle.name);
    setIconEmoji(circle.icon_emoji?.trim() ?? "");
    setIsSaving(false);
    setSaveError(null);
    setDeleteConfirmation("");
    setIsDeleting(false);
    setDeleteError(null);
  }, [circle.id, circle.name, circle.icon_emoji]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isDeleting) {
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
      setDeleteError(null);

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
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to update Circle.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!canDelete || isSaving || isDeleting) {
      return;
    }

    let didDelete = false;

    try {
      setIsDeleting(true);
      setSaveError(null);
      setDeleteError(null);

      const response = await fetch(
        `/api/circles/${encodeURIComponent(circle.id)}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Unable to delete Circle.");
      }

      didDelete = true;
      onDeleted(circle.id);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Unable to delete Circle.",
      );
    } finally {
      if (!didDelete) {
        setIsDeleting(false);
      }
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-black/60 px-0 pb-0 pt-0 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <button
        type="button"
        aria-label="Close Edit Circle"
        onClick={onClose}
        disabled={isBusy}
        className="absolute inset-0 cursor-default bg-black/68 backdrop-blur-[3px]"
      />
      <motion.form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`edit-circle-title-${circle.id}`}
        className="relative z-10 flex max-h-[calc(100%-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#08090c]/95 text-white shadow-[0_38px_120px_rgba(0,0,0,0.76)] ring-1 ring-white/[0.06] backdrop-blur-xl sm:max-h-[calc(100%-3rem)]"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 430, damping: 38, mass: 0.8 }}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 bg-white/[0.025] p-5">
          <div>
            <h3
              id={`edit-circle-title-${circle.id}`}
              className="text-base font-semibold text-white"
            >
              Edit Circle
            </h3>
          </div>
          <button
            type="button"
            aria-label="Close Edit Circle"
            onClick={onClose}
            disabled={isBusy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/65 backdrop-blur transition hover:border-white/25 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-5 overflow-y-auto p-5">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/52">
              Circle name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/28 focus:border-white/28 focus:bg-black/60"
              maxLength={80}
              disabled={isBusy}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/52">
              Circle icon
            </span>
            <input
              value={iconEmoji}
              onChange={(event) => setIconEmoji(event.target.value)}
              placeholder="House, studio, team, etc."
              className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/28 focus:border-white/28 focus:bg-black/60"
              maxLength={24}
              disabled={isBusy}
            />
          </label>

          {saveError ? (
            <p className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {saveError}
            </p>
          ) : null}

          <section className="rounded-2xl border border-rose-300/20 bg-[#17090d] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div>
              <h4 className="text-sm font-semibold text-rose-100">
                Danger Zone
              </h4>
              <p className="mt-2 text-sm leading-6 text-rose-100/65">
                This removes the Circle from your dashboard and active Circle
                views. It does not delete related roadmap, campaign, goal,
                project, task, or member records.
              </p>
            </div>
            <label className="mt-4 grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-100/55">
                Type this Circle name to confirm
              </span>
              <code className="break-words rounded-xl border border-rose-200/10 bg-black/30 px-3 py-2 text-sm font-semibold text-rose-50/85">
                {circle.name}
              </code>
              <input
                value={deleteConfirmation}
                onChange={(event) => {
                  setDeleteConfirmation(event.target.value);
                  setDeleteError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                  }
                }}
                className="h-10 rounded-2xl border border-rose-200/15 bg-black/45 px-3 text-sm font-semibold text-rose-50 outline-none transition placeholder:text-rose-100/28 focus:border-rose-200/35 focus:bg-black/60"
                disabled={isBusy}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {deleteError ? (
              <p className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {deleteError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete || isBusy}
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-rose-200/20 bg-rose-500/[0.14] px-4 text-sm font-semibold text-rose-100 transition hover:border-rose-200/35 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:border-rose-200/10 disabled:bg-rose-500/[0.08] disabled:text-rose-100/40"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {isDeleting ? "Deleting..." : "Delete Circle"}
            </button>
          </section>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 bg-black/30 p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="h-10 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/72 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isBusy}
            className="h-10 rounded-full border border-white/18 bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function CircleCommandDetail({
  circle,
  onClose,
  onCircleUpdated,
  onCircleDeleted,
}: {
  circle: CommandCircle;
  onClose: () => void;
  onCircleUpdated: (circle: CircleUpdate) => void;
  onCircleDeleted: (circleId: string) => void;
}) {
  const members = circle.memberPreview ?? [];
  const memberCount = circle.activeMemberCount ?? 0;
  const role = circle.viewerRole?.toUpperCase() ?? "MEMBER";
  const [circleView, setCircleView] = useState<CircleDetailView>("goals");
  const [detailMembers, setDetailMembers] = useState<CircleMember[] | null>(
    null,
  );
  const [detailHabits, setDetailHabits] = useState<CircleHabit[] | null>(null);
  const [ownerSkills, setOwnerSkills] = useState<OwnerSkillOption[]>([]);
  const [ownerLocationContexts, setOwnerLocationContexts] = useState<
    OwnerLocationContextOption[]
  >([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberConstraintActionId, setMemberConstraintActionId] = useState<
    string | null
  >(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [fabEditTarget, setFabEditTarget] = useState<FabEditTarget | null>(
    null,
  );
  const detailScrollRef = useRef<HTMLElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullExitTriggeredRef = useRef(false);
  const pullPointerIdRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    detailScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [circle.id]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverscroll =
      document.documentElement.style.overscrollBehavior;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overscrollBehavior =
        previousHtmlOverscroll;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, []);

  useEffect(() => {
    setCircleView("goals");
    setSelectedMemberId(null);
    setIsEditOpen(false);
    setFabEditTarget(null);
    setMemberConstraintActionId(null);
  }, [circle.id]);

  const loadCircleDetail = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsLoadingMembers(true);
        setMembersError(null);
        setDetailMembers(null);
        setDetailHabits(null);
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

  const handleEditHabit = useCallback((habit: CircleHabit) => {
    setFabEditTarget({
      entityType: "HABIT",
      entityId: habit.id,
    });
  }, []);

  const handleFabEditSaved = useCallback(
    (target: FabEditTarget) => {
      if (target.entityType === "HABIT") {
        void loadCircleDetail();
      }
    },
    [loadCircleDetail],
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
  const pullExitBlocked =
    isEditOpen || Boolean(selectedMember) || Boolean(fabEditTarget);

  const isDetailAtTop = useCallback(
    () => (detailScrollRef.current?.scrollTop ?? 0) <= 2,
    [],
  );

  const resetPullExit = useCallback(() => {
    pullStartYRef.current = null;
    pullExitTriggeredRef.current = false;
    pullPointerIdRef.current = null;
  }, []);

  const handlePullExitStart = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (
        pullExitBlocked ||
        (event.pointerType !== "touch" && event.pointerType !== "mouse") ||
        !isDetailAtTop() ||
        isInteractivePullTarget(event.target)
      ) {
        resetPullExit();
        return;
      }

      pullStartYRef.current = event.clientY;
      pullExitTriggeredRef.current = false;
      pullPointerIdRef.current = event.pointerId;
    },
    [isDetailAtTop, pullExitBlocked, resetPullExit],
  );

  const handlePullExitMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const pullStartY = pullStartYRef.current;

      if (
        pullExitBlocked ||
        pullStartY === null ||
        pullExitTriggeredRef.current ||
        pullPointerIdRef.current !== event.pointerId ||
        !isDetailAtTop()
      ) {
        return;
      }

      const pullDistance = event.clientY - pullStartY;

      if (pullDistance > PULL_EXIT_THRESHOLD_PX) {
        pullExitTriggeredRef.current = true;
        pullStartYRef.current = null;
        pullPointerIdRef.current = null;
        onClose();
      }
    },
    [isDetailAtTop, onClose, pullExitBlocked],
  );

  const handlePullExitEnd = resetPullExit;

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

  return (
    <motion.div
      layoutId={`command-circle-card-${circle.id}`}
      role="dialog"
      aria-modal="true"
      className="relative h-[100dvh] max-h-none w-full max-w-[min(100vw,420px)] overflow-hidden rounded-2xl border border-white/5 bg-[#0B0E13] shadow-[0_6px_24px_rgba(0,0,0,0.35)] overscroll-contain sm:max-w-[min(100vw,640px)] md:rounded-3xl lg:max-w-[min(100vw,960px)] xl:max-w-[min(100vw,1160px)]"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 480, damping: 42, mass: 0.9 }}
    >
      <main
        key={circle.id}
        ref={detailScrollRef}
        className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-2.5 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] pt-0 sm:px-6 sm:pb-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:pt-0 lg:px-8" style={{ paddingTop: 0 }}
        onPointerDown={handlePullExitStart}
        onPointerMove={handlePullExitMove}
        onPointerUp={handlePullExitEnd}
        onPointerCancel={handlePullExitEnd}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-x-hidden pt-0 sm:gap-6">
          <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#050505] via-[#0f0f10] to-[#1b1b1d] px-3 pb-3 pt-1.5 text-white shadow-[0_24px_70px_-42px_rgba(0,0,0,0.82)] sm:px-4 sm:pb-3.5 sm:pt-2 md:rounded-3xl">
            <div className="pointer-events-none absolute inset-0 z-0">
              <div className="absolute inset-x-16 -top-20 h-40 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.14),_transparent_70%)] blur-3xl" />
              <div className="absolute bottom-0 right-0 h-40 w-40 translate-x-1/4 translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.045),_transparent_60%)] blur-3xl" />
            </div>
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
                    <motion.h2
                      layoutId={`command-circle-title-${circle.id}`}
                      className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl"
                    >
                      {circle.name}
                    </motion.h2>
                  </div>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AvatarStack members={members} fallbackName={circle.name} />
                    <span className="truncate text-xs font-semibold text-white/68 sm:text-sm">
                      {formatMemberCount(memberCount)}
                    </span>
                  </div>
                </div>

                {isOwner ? (
                  <button
                    type="button"
                    aria-label="Edit Circle"
                    onClick={() => setIsEditOpen(true)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/70 backdrop-blur transition hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <div className="grid w-full grid-cols-1 gap-5 lg:gap-6 xl:auto-rows-min xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <section className="relative min-h-[260px] overflow-visible rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] px-3 py-4 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:overflow-hidden sm:p-7">
              <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_55%)]" />
              <div className="relative z-10 space-y-4">
                <CircleViewToggle value={circleView} onChange={setCircleView} />
                <div className="mt-3 overflow-visible">
                  <CircleWorkRenderer
                    view={circleView}
                    habits={detailHabits ?? []}
                    members={activeMembers}
                    isLoading={isLoadingMembers && detailHabits === null}
                    error={membersError}
                    onEditHabit={handleEditHabit}
                  />
                </div>
              </div>
            </section>

            <CircleHabitsPanel
              habits={detailHabits ?? []}
              isLoading={isLoadingMembers && detailHabits === null}
              error={membersError}
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
      <AnimatePresence>
        {isEditOpen ? (
          <EditCircleModal
            circle={circle}
            onClose={() => setIsEditOpen(false)}
            onSaved={onCircleUpdated}
            onDeleted={(circleId) => {
              setIsEditOpen(false);
              onCircleDeleted(circleId);
              onClose();
            }}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {selectedMember ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-black/60 px-0 pb-0 pt-0 backdrop-blur-md"
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
              isOwner={isOwner}
              canMakeOffer={canMakeOffer}
              canEditWorkProfile={canEditWorkProfile}
              skillOptions={skillConstraintOptions}
              locationContextOptions={locationContextOptions}
              constraintActionId={memberConstraintActionId}
              onConstraintChange={handleMemberConstraintChange}
              onClose={() => setSelectedMemberId(null)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export function CommandCirclesSection({
  className,
}: CommandCirclesSectionProps) {
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
  const [pullRefreshOffset, setPullRefreshOffset] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [pullRefreshStatus, setPullRefreshStatus] =
    useState<PullRefreshStatus>("idle");
  const previousFocus = useRef<HTMLElement | null>(null);
  const pullRefreshStartYRef = useRef<number | null>(null);
  const pullRefreshPointerIdRef = useRef<number | null>(null);
  const pullRefreshActiveRef = useRef(false);
  const pullRefreshOffsetRef = useRef(0);

  const activeCircle =
    circles.find((circle) => circle.id === activeCircleId) ?? null;

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

  const resetPullRefreshGesture = useCallback(() => {
    pullRefreshStartYRef.current = null;
    pullRefreshPointerIdRef.current = null;
    pullRefreshActiveRef.current = false;

    if (!isPullRefreshing) {
      pullRefreshOffsetRef.current = 0;
      setPullRefreshOffset(0);
      setPullRefreshStatus("idle");
    }
  }, [isPullRefreshing]);

  const runPullRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    setPullRefreshStatus("refreshing");
    pullRefreshOffsetRef.current = PULL_REFRESH_THRESHOLD_PX;
    setPullRefreshOffset(PULL_REFRESH_THRESHOLD_PX);

    try {
      await Promise.all([loadCircles(), loadIncomingOffers()]);
    } finally {
      setIsPullRefreshing(false);
      pullRefreshOffsetRef.current = 0;
      setPullRefreshOffset(0);
      setPullRefreshStatus("idle");
    }
  }, [loadCircles, loadIncomingOffers]);

  const handlePullRefreshStart = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (
        activeCircleId ||
        isPullRefreshing ||
        event.pointerType !== "touch" ||
        window.scrollY > 2 ||
        isInteractivePullTarget(event.target)
      ) {
        resetPullRefreshGesture();
        return;
      }

      pullRefreshStartYRef.current = event.clientY;
      pullRefreshPointerIdRef.current = event.pointerId;
      pullRefreshActiveRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setPullRefreshStatus("pulling");
    },
    [activeCircleId, isPullRefreshing, resetPullRefreshGesture],
  );

  const handlePullRefreshMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const startY = pullRefreshStartYRef.current;

      if (
        activeCircleId ||
        isPullRefreshing ||
        !pullRefreshActiveRef.current ||
        startY === null ||
        pullRefreshPointerIdRef.current !== event.pointerId
      ) {
        return;
      }

      const pullDistance = event.clientY - startY;

      if (pullDistance <= 0) {
        pullRefreshOffsetRef.current = 0;
        setPullRefreshOffset(0);
        setPullRefreshStatus("pulling");
        return;
      }

      if (window.scrollY > 2) {
        resetPullRefreshGesture();
        return;
      }

      event.preventDefault();

      const nextOffset = Math.min(
        PULL_REFRESH_MAX_OFFSET_PX,
        pullDistance * 0.58,
      );
      pullRefreshOffsetRef.current = nextOffset;
      setPullRefreshOffset(nextOffset);
      setPullRefreshStatus(
        nextOffset >= PULL_REFRESH_THRESHOLD_PX ? "ready" : "pulling",
      );
    },
    [activeCircleId, isPullRefreshing, resetPullRefreshGesture],
  );

  const handlePullRefreshEnd = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (
        !pullRefreshActiveRef.current ||
        pullRefreshPointerIdRef.current !== event.pointerId
      ) {
        resetPullRefreshGesture();
        return;
      }

      const shouldRefresh =
        activeCircleId === null &&
        !isPullRefreshing &&
        window.scrollY <= 2 &&
        pullRefreshOffsetRef.current >= PULL_REFRESH_THRESHOLD_PX;

      pullRefreshStartYRef.current = null;
      pullRefreshPointerIdRef.current = null;
      pullRefreshActiveRef.current = false;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (shouldRefresh) {
        void runPullRefresh();
        return;
      }

      pullRefreshOffsetRef.current = 0;
      setPullRefreshOffset(0);
      setPullRefreshStatus("idle");
    },
    [
      activeCircleId,
      isPullRefreshing,
      resetPullRefreshGesture,
      runPullRefresh,
    ],
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
    if (!activeCircleId) {
      previousFocus.current?.focus();
      return;
    }

    previousFocus.current = document.activeElement as HTMLElement;
    const previousBodyOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.classList.add("command-circle-detail-open");

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.classList.remove("command-circle-detail-open");
    };
  }, [activeCircleId]);

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
  const isPullRefreshVisible = isPullRefreshing || pullRefreshOffset > 2;
  const pullRefreshLabel =
    pullRefreshStatus === "refreshing"
      ? "Refreshing"
      : pullRefreshStatus === "ready"
        ? "Release to refresh"
        : "Pull to refresh";
  const isPullRefreshDragging =
    !isPullRefreshing &&
    (pullRefreshStatus === "pulling" || pullRefreshStatus === "ready");
  const pullRefreshContentY = isPullRefreshing
    ? 46
    : Math.min(72, pullRefreshOffset * 0.72);
  const pullRefreshContentTransition = isPullRefreshDragging
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.8 };

  return (
    <section
      className={cn("relative text-white", className)}
      onPointerDown={handlePullRefreshStart}
      onPointerMove={handlePullRefreshMove}
      onPointerUp={handlePullRefreshEnd}
      onPointerCancel={handlePullRefreshEnd}
    >
      <motion.div
        aria-hidden={!isPullRefreshVisible}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        initial={false}
        animate={{
          opacity: isPullRefreshVisible ? 1 : 0,
          y: isPullRefreshing
            ? 10
            : Math.max(-34, pullRefreshOffset - 54),
        }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/92 px-3 py-2 text-xs font-semibold text-white/70 shadow-2xl shadow-black/35 backdrop-blur-md">
          <span
            className={cn(
              "h-4 w-4 rounded-full border-2 border-white/25 border-t-white/90",
              (isPullRefreshing || pullRefreshStatus === "ready") &&
                "animate-spin",
            )}
          />
          <span>{pullRefreshLabel}</span>
        </div>
      </motion.div>

      <motion.div
        initial={false}
        animate={{ y: pullRefreshContentY }}
        transition={pullRefreshContentTransition}
        className="relative z-0"
      >
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
                circle={circle}
                isSelected={activeCircleId === circle.id}
                onSelect={() => setActiveCircleId(circle.id)}
              />
            ))}
          </div>
        ) : null}
      </motion.div>

      <AnimatePresence>
        {activeCircle ? (
          <motion.div
            key="command-circle-overlay"
            className="fixed inset-0 z-40 flex items-start justify-center overflow-hidden bg-black/65 px-0 pb-0 pt-0 backdrop-blur-md sm:px-0 sm:pb-0 sm:pt-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <CircleCommandDetail
              circle={activeCircle}
              onClose={() => setActiveCircleId(null)}
              onCircleUpdated={(updatedCircle) => {
                setCircles((currentCircles) =>
                  currentCircles.map((circle) =>
                    circle.id === updatedCircle.id
                      ? { ...circle, ...updatedCircle }
                      : circle,
                  ),
                );
              }}
              onCircleDeleted={(circleId) => {
                setActiveCircleId(null);
                setCircles((currentCircles) =>
                  currentCircles.filter((circle) => circle.id !== circleId),
                );
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
