"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
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

import { MonumentGoalsList } from "@/components/monuments/MonumentGoalsList";
import { Fab, type FabEditTarget } from "@/components/ui/Fab";
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
};

type CommandCirclesSectionProps = {
  className?: string;
};

type CircleDetailView = "goals" | "roadmap";
type OfferMode = "FIXED" | "FLEXIBLE";

type CommandOfferTerms = {
  mode?: OfferMode;
  dateStart?: string;
  dateEnd?: string;
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

type OfferWeekdayValue = (typeof offerWeekdays)[number]["value"];

function formatMemberCount(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
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
  dateEnd: string,
  daysOfWeek: OfferWeekdayValue[]
) {
  const start = parseDateInputValue(dateStart);
  const end = parseDateInputValue(dateEnd);

  if (!start || !end || end.getTime() < start.getTime()) {
    return null;
  }

  const selectedDays = new Set(daysOfWeek);
  const current = new Date(start);

  while (current.getTime() <= end.getTime()) {
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
    ? habit.recurrence_days.find(
        (day) => Number.isInteger(day) && day > 0
      )
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
  };
}

function normalizePreviewMember(
  member: CircleMemberPreview
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
        className
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
        isSelected && "border-white/30"
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
          circle.description?.trim() ? "mt-6" : "mt-8"
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
            circleIcon && "px-1 text-center text-sm font-semibold leading-none"
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

function PlaceholderAction({
  children,
}: {
  children: ReactNode;
}) {
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

function WorkProfilePlaceholderRow({
  Icon,
  title,
  text,
  secondaryText,
  actionLabel,
  showAction,
}: {
  Icon: LucideIcon;
  title: string;
  text: string;
  secondaryText: string;
  actionLabel: string;
  showAction: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/48 ring-1 ring-white/10">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h6 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
            {title}
          </h6>
          <p className="mt-2 text-sm font-semibold text-white/78">{text}</p>
          <p className="mt-1 text-xs leading-5 text-white/48">
            {secondaryText}
          </p>
        </div>
      </div>
      {showAction ? (
        <div className="shrink-0 sm:pt-1">
          <PlaceholderAction>{actionLabel}</PlaceholderAction>
        </div>
      ) : null}
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
  const [dateEnd, setDateEnd] = useState(initialWindow.date);
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
    const parsedDateEnd = parseDateInputValue(dateEnd);

    if (!parsedDateStart || !parsedDateEnd) {
      setError("Choose a valid offer length.");
      return;
    }

    if (parsedDateEnd.getTime() < parsedDateStart.getTime()) {
      setError("End date must not be before start date.");
      return;
    }

    if (daysOfWeek.length === 0) {
      setError("Select at least one day.");
      return;
    }

    const firstSelectedDate = getFirstSelectedDateInRange(
      dateStart,
      dateEnd,
      daysOfWeek
    );

    if (!firstSelectedDate) {
      setError("Select a day that occurs during the offer length.");
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
      dateEnd,
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
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Unable to create offer.");
      }

      onCreated();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create offer."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-end justify-center p-3 sm:items-center"
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
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-zinc-950 p-5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.03)]">
          <div>
            <h3
              id={`make-offer-title-${member.id}`}
              className="text-base font-semibold text-white"
            >
              Make Offer
            </h3>
            <p className="mt-1 text-sm leading-5 text-white/52">
              Make an offer for when this member can receive Circle command work.
            </p>
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
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2">
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
                className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/52">
                End date
              </span>
              <input
                type="date"
                value={dateEnd}
                onChange={(event) => {
                  setDateEnd(event.target.value);
                  setError(null);
                }}
                disabled={isSubmitting}
                className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </div>

          <div className="grid gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              FIXED / FLEXIBLE
            </span>
            <div className="inline-grid w-fit grid-cols-2 rounded-full border border-white/10 bg-black/55 p-0.5">
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
                    "h-7 rounded-full px-3 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                    mode === modeOption
                      ? "bg-zinc-200 text-black shadow-[0_8px_18px_rgba(255,255,255,0.10)]"
                      : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
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
            <div className="flex flex-wrap gap-2">
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
                          : [...currentDays, weekday.value]
                      );
                      setError(null);
                    }}
                    disabled={isSubmitting}
                    className={cn(
                      "h-10 min-w-12 rounded-full border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                      isSelected
                        ? "border-white/30 bg-white text-black"
                        : "border-white/10 bg-zinc-950/70 text-white/58 hover:border-white/22 hover:bg-zinc-900 hover:text-white"
                    )}
                    aria-pressed={isSelected}
                  >
                    {weekday.label}
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
                  className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="h-11 rounded-2xl border border-white/10 bg-black/45 px-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="resize-none rounded-2xl border border-white/10 bg-black/45 px-3 py-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-white/28 focus:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
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
            className="h-10 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/72 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/18 bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-70"
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
  onClose,
}: {
  circle: CommandCircle;
  member: CircleMemberDisplay;
  isOwner: boolean;
  canMakeOffer: boolean;
  onClose: () => void;
}) {
  const statusLabel = formatMemberStatus(member.status);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [offerSuccess, setOfferSuccess] = useState<string | null>(null);

  useEffect(() => {
    setIsOfferOpen(false);
    setOfferSuccess(null);
  }, [circle.id, member.id]);

  return (
    <motion.article
      role="dialog"
      aria-modal="true"
      aria-labelledby={`circle-member-profile-${member.id}`}
      className="relative z-10 flex max-h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#08090c]/95 shadow-[0_38px_120px_rgba(0,0,0,0.76)] ring-1 ring-white/[0.06] backdrop-blur-xl sm:max-h-[calc(100%-3rem)]"
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
                <ShieldCheck className="h-4 w-4 text-white/55" aria-hidden="true" />
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
            {isOwner ? <PlaceholderAction>Change Role</PlaceholderAction> : null}
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
            <WorkProfilePlaceholderRow
              Icon={Target}
              title="Skill Constraints"
              text="Not connected yet."
              secondaryText="Circle skills will be imported separately so Circle XP does not affect personal skills."
              actionLabel="Import Skills"
              showAction={isOwner}
            />
            <WorkProfilePlaceholderRow
              Icon={MapPin}
              title="Location Contexts"
              text="Not connected yet."
              secondaryText="Circle location constraints will be connected after shared locations are defined."
              actionLabel="Add Location"
              showAction={isOwner}
            />
            <WorkProfilePlaceholderRow
              Icon={CalendarDays}
              title="Availability"
              text="Not connected yet."
              secondaryText="Availability will come from approved Command Blocks."
              actionLabel="Set Availability"
              showAction={isOwner}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
          <div className="flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-white/55" aria-hidden="true" />
            <h5 className="text-sm font-semibold text-white">Command Blocks</h5>
          </div>
          <div className="mt-3">
            <MemberDetailEmptyRow
              Icon={CircleDot}
              text="No approved Command Blocks yet."
              secondaryText="Command Blocks will define when this Circle can schedule work for this member."
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
            <CalendarDays className="h-4 w-4 text-white/55" aria-hidden="true" />
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
            <p className="text-sm font-semibold text-white">No active members.</p>
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
                    : "border-white/[0.08]"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectMember(member.userId)}
                  className="flex w-full items-center gap-3 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/65"
                  aria-haspopup="dialog"
                  aria-controls={
                    isSelected ? `circle-member-profile-${member.id}` : undefined
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
  onRespond: (
    offer: IncomingOffer,
    response: "ACCEPTED" | "DECLINED"
  ) => void;
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
              : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200"
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
    <div className="rounded-2xl border border-white/[0.08] bg-[#080A0F] px-4 py-3 shadow-[0_12px_34px_rgba(0,0,0,0.34)] sm:px-5 sm:py-4">
      <h2 className="text-sm font-semibold text-white">
        Start this Circle roadmap
      </h2>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[#A7B0BD]">
        Add the first goal to give this Circle a shared direction.
      </p>
    </div>
  );
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
        }
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Unable to update Circle.");
      }

      const data = (await response.json()) as { circle?: CircleUpdate };
      onSaved(
        data.circle ?? {
          id: circle.id,
          name: trimmedName,
          icon_emoji: trimmedIconEmoji || null,
        }
      );
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to update Circle."
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
        }
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Unable to delete Circle.");
      }

      didDelete = true;
      onDeleted(circle.id);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Unable to delete Circle."
      );
    } finally {
      if (!didDelete) {
        setIsDeleting(false);
      }
    }
  }

  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-end justify-center p-3 sm:items-center sm:p-6"
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
  const [goalSection, setGoalSection] = useState<"active" | "completed">(
    "active"
  );
  const [detailMembers, setDetailMembers] = useState<CircleMember[] | null>(
    null
  );
  const [detailHabits, setDetailHabits] = useState<CircleHabit[] | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [fabEditTarget, setFabEditTarget] = useState<FabEditTarget | null>(
    null
  );

  useEffect(() => {
    setCircleView("goals");
    setGoalSection("active");
    setSelectedMemberId(null);
    setIsEditOpen(false);
    setFabEditTarget(null);
  }, [circle.id]);

  const loadCircleDetail = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsLoadingMembers(true);
        setMembersError(null);
        setDetailMembers(null);
        setDetailHabits(null);

        const response = await fetch(
          `/api/circles/${encodeURIComponent(circle.id)}`,
          {
            cache: "no-store",
            signal,
          }
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? "Unable to load Circle members.");
        }

        const data = (await response.json()) as {
          members?: CircleMember[];
          habits?: CircleHabit[];
        };
        setDetailMembers(data.members ?? []);
        setDetailHabits(data.habits ?? []);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setDetailMembers(null);
        setDetailHabits([]);
        setMembersError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load Circle members."
        );
      } finally {
        if (!signal?.aborted) {
          setIsLoadingMembers(false);
        }
      }
    },
    [circle.id]
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
    [loadCircleDetail]
  );

  const activeMembers =
    detailMembers === null
      ? members.map(normalizePreviewMember)
      : detailMembers
          .filter((member) => member.status === "ACTIVE")
          .map(normalizeFullMember);
  const selectedMember = selectedMemberId
    ? activeMembers.find(
        (member) =>
          member.id === selectedMemberId || member.userId === selectedMemberId
      ) ?? null
    : null;
  const isOwner = role === "OWNER";
  const canMakeOffer = elevatedRoles.has(role);
  const circleIcon = getCircleIconDisplay(circle.icon_emoji);

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
      className="relative h-full w-full max-h-[min(100vh-3rem,960px)] max-w-[min(100vw-3rem,420px)] overflow-hidden rounded-2xl border border-white/5 bg-[#0B0E13] shadow-[0_6px_24px_rgba(0,0,0,0.35)] sm:max-h-[min(100vh-4rem,1000px)] sm:max-w-[min(100vw-4rem,640px)] md:rounded-3xl lg:max-w-[min(100vw-6rem,960px)] xl:max-w-[min(100vw-8rem,1160px)]"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 480, damping: 42, mass: 0.9 }}
    >
      <main className="h-full overflow-y-auto overflow-x-hidden px-2.5 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-x-hidden sm:gap-6">
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              aria-label="Close Circle detail"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/70 backdrop-blur transition hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            {isOwner ? (
              <button
                type="button"
                aria-label="Edit Circle"
                onClick={() => setIsEditOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/70 backdrop-blur transition hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#050505] via-[#0f0f10] to-[#1b1b1d] px-3 py-3 text-white shadow-[0_24px_70px_-42px_rgba(0,0,0,0.82)] sm:px-4 sm:py-3.5 md:rounded-3xl">
            <div className="absolute inset-0">
              <div className="absolute inset-x-16 -top-20 h-40 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.14),_transparent_70%)] blur-3xl" />
              <div className="absolute bottom-0 right-0 h-40 w-40 translate-x-1/4 translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.045),_transparent_60%)] blur-3xl" />
            </div>
            <div className="relative flex flex-row items-center gap-3 sm:gap-4 sm:pl-10 sm:pr-10 lg:pl-9 lg:pr-9">
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
                      "max-w-10 truncate text-center text-base leading-none sm:max-w-11 sm:text-lg"
                  )}
                >
                  {circleIcon ?? getCircleInitials(circle.name)}
                </span>
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="min-w-0">
                  <motion.h2
                    layoutId={`command-circle-title-${circle.id}`}
                    className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl"
                  >
                    {circle.name}
                  </motion.h2>
                </div>
                <div className="flex items-center gap-2.5">
                  <AvatarStack members={members} fallbackName={circle.name} />
                  <span className="text-xs font-semibold text-white/68 sm:text-sm">
                    {formatMemberCount(memberCount)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <div className="grid w-full grid-cols-1 gap-5 lg:gap-6 xl:auto-rows-min xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <section className="relative min-h-[260px] overflow-visible rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] px-3 py-4 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:overflow-hidden sm:p-7">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_55%)]" />
              <div className="relative space-y-4">
                <CircleViewToggle
                  value={circleView}
                  onChange={setCircleView}
                />
                <div className="mt-3 overflow-visible">
                  <MonumentGoalsList
                    sourceType="circle"
                    sourceId={circle.id}
                    circleId={circle.id}
                    monumentView={circleView}
                    goalSection={goalSection}
                    onGoalSectionChange={setGoalSection}
                    roadmapEmptyState={<CircleRoadmapEmptyState />}
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
      <Fab
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
            className="absolute inset-0 z-30 flex items-end justify-center p-3 sm:items-center sm:p-6"
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
              onClose={() => setSelectedMemberId(null)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export function CommandCirclesSection({ className }: CommandCirclesSectionProps) {
  const toast = useToastHelpers();
  const [circles, setCircles] = useState<CommandCircle[]>([]);
  const [incomingOffers, setIncomingOffers] = useState<IncomingOffer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOffers, setIsLoadingOffers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(
    null
  );
  const [respondingOfferResponse, setRespondingOfferResponse] = useState<
    "ACCEPTED" | "DECLINED" | null
  >(null);
  const [offerResponseError, setOfferResponseError] = useState<string | null>(
    null
  );
  const [offerResponseErrorId, setOfferResponseErrorId] = useState<
    string | null
  >(null);
  const [activeCircleId, setActiveCircleId] = useState<string | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

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
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Unable to load Circles.");
      }

      const data = (await response.json()) as { circles?: CommandCircle[] };
      setCircles(
        (data.circles ?? []).filter(
          (circle) => elevatedRoles.has(circle.viewerRole?.toUpperCase() ?? "")
        )
      );
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }

      setCircles([]);
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load Circles."
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
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Unable to load offers.");
      }

      const data = (await response.json()) as { offers?: IncomingOffer[] };
      setIncomingOffers(data.offers ?? []);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }

      setIncomingOffers([]);
      setOffersError(
        loadError instanceof Error ? loadError.message : "Unable to load offers."
      );
    } finally {
      if (!signal?.aborted) {
        setIsLoadingOffers(false);
      }
    }
  }, []);

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
          }
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? "Unable to respond to offer.");
        }

        setIncomingOffers((currentOffers) =>
          currentOffers.filter((currentOffer) => currentOffer.id !== offer.id)
        );
        toast.success(
          responseValue === "ACCEPTED" ? "Offer accepted" : "Offer declined"
        );
      } catch (respondError) {
        setOfferResponseErrorId(offer.id);
        setOfferResponseError(
          respondError instanceof Error
            ? respondError.message
            : "Unable to respond to offer."
        );
      } finally {
        setRespondingOfferId(null);
        setRespondingOfferResponse(null);
      }
    },
    [respondingOfferId, toast]
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
    if (activeCircleId) {
      previousFocus.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
      document.body.classList.add("modal-open");
    } else {
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
      previousFocus.current?.focus();
    }

    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
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

  return (
    <section className={cn("text-white", className)}>
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

      <AnimatePresence>
        {activeCircle ? (
          <motion.div
            key="command-circle-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md sm:p-6"
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
                      : circle
                  )
                );
              }}
              onCircleDeleted={(circleId) => {
                setActiveCircleId(null);
                setCircles((currentCircles) =>
                  currentCircles.filter((circle) => circle.id !== circleId)
                );
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
