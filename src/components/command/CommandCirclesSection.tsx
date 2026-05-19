"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  CircleDot,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Target,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { MonumentGoalsList } from "@/components/monuments/MonumentGoalsList";
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
  circle_type: CircleType;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  viewerRole?: string | null;
  activeMemberCount?: number;
  memberPreview?: CircleMemberPreview[];
};

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

type CircleMemberDisplay = {
  id: string;
  userId: string;
  role: string;
  status: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  initials: string;
};

type CommandCirclesSectionProps = {
  className?: string;
};

type CircleDetailView = "goals" | "roadmap";

const elevatedRoles = new Set(["OWNER", "MANAGER", "OPERATOR"]);

function formatCircleType(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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

  return (
    <motion.button
      type="button"
      layoutId={`command-circle-card-${circle.id}`}
      onClick={onSelect}
      className={cn(
        "group relative min-h-[184px] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.13),transparent_32%),linear-gradient(145deg,rgba(25,25,28,0.96),rgba(5,5,6,0.98))] p-4 text-left shadow-[0_24px_70px_rgba(0,0,0,0.42)] transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70",
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
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
            {formatCircleType(circle.circle_type)}
            {circle.status ? ` / ${circle.status}` : ""}
          </p>
        </div>
        {role && elevatedRoles.has(role) ? (
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-white/58">
            {role}
          </span>
        ) : null}
      </div>

      {circle.description?.trim() ? (
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-white/52">
          {circle.description}
        </p>
      ) : (
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-white/42">
          Circle operating view
        </p>
      )}

      <div className="mt-7 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AvatarStack members={members} fallbackName={circle.name} />
          <span className="text-sm font-medium text-white/68">
            {formatMemberCount(memberCount)}
          </span>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/55 transition group-hover:border-white/20 group-hover:text-white">
          <Users className="h-4 w-4" aria-hidden="true" />
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
}: {
  Icon: LucideIcon;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-white/10 bg-black/20 p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/48 ring-1 ring-white/10">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="pt-1 text-xs leading-5 text-white/48">{text}</p>
    </div>
  );
}

function CircleMemberExpandedDetail({
  member,
  isOwner,
}: {
  member: CircleMemberDisplay;
  isOwner: boolean;
}) {
  const statusLabel = formatMemberStatus(member.status);

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <MemberAvatar member={member} className="h-12 w-12 text-sm" />
          <div className="min-w-0">
            <h4 className="truncate text-base font-semibold text-white">
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
      </div>

      <div className="mt-5 grid gap-3">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BriefcaseBusiness
                  className="h-4 w-4 text-white/55"
                  aria-hidden="true"
                />
                <h5 className="text-sm font-semibold text-white">Workload</h5>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/50">
                No workload rules set.
              </p>
            </div>
            {isOwner ? <PlaceholderAction>Set Workload</PlaceholderAction> : null}
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
    </div>
  );
}

function CircleMembersPanel({
  members,
  isLoading,
  error,
  selectedMemberId,
  onToggleMember,
  isOwner,
}: {
  members: CircleMemberDisplay[];
  isLoading: boolean;
  error: string | null;
  selectedMemberId: string | null;
  onToggleMember: (memberId: string) => void;
  isOwner: boolean;
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
            const isSelected = selectedMemberId === member.id;

            return (
              <article
                key={member.id}
                className={cn(
                  "rounded-2xl border bg-[#0A0C10]/88 p-3 shadow-[0_18px_44px_rgba(0,0,0,0.36)] transition",
                  isSelected ? "border-white/22" : "border-white/[0.08]"
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggleMember(member.id)}
                  className="flex w-full items-center gap-3 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/65"
                  aria-expanded={isSelected}
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
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-white/45 transition",
                      isSelected && "rotate-180 text-white/75"
                    )}
                    aria-hidden="true"
                  />
                </button>

                {isSelected ? (
                  <CircleMemberExpandedDetail member={member} isOwner={isOwner} />
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
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

function CircleHabitsPanel() {
  return (
    <section className="relative min-h-[260px] overflow-visible rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] p-5 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:overflow-hidden sm:p-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_60%)]" />
      <div className="relative">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-white/60">
            Circle Habits
          </p>
          <button
            type="button"
            disabled
            className="inline-flex min-h-9 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-xs font-semibold text-white opacity-60 sm:w-auto"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Create Habit
          </button>
        </div>
        <article className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 ring-1 ring-white/10">
              <CircleDot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                No Circle habits yet.
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/48">
                Create recurring responsibilities for this Circle when Circle
                habits are connected.
              </p>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function CircleCommandDetail({
  circle,
  onClose,
}: {
  circle: CommandCircle;
  onClose: () => void;
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
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  useEffect(() => {
    setCircleView("goals");
    setGoalSection("active");
    setSelectedMemberId(null);
  }, [circle.id]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCircleMembers() {
      try {
        setIsLoadingMembers(true);
        setMembersError(null);
        setDetailMembers(null);

        const response = await fetch(
          `/api/circles/${encodeURIComponent(circle.id)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? "Unable to load Circle members.");
        }

        const data = (await response.json()) as { members?: CircleMember[] };
        setDetailMembers(data.members ?? []);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setDetailMembers(null);
        setMembersError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load Circle members."
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingMembers(false);
        }
      }
    }

    void loadCircleMembers();

    return () => {
      controller.abort();
    };
  }, [circle.id]);

  const activeMembers =
    detailMembers === null
      ? members.map(normalizePreviewMember)
      : detailMembers
          .filter((member) => member.status === "ACTIVE")
          .map(normalizeFullMember);
  const isOwner = role === "OWNER";

  const quickFacts = [
    {
      label: "Members",
      value: formatMemberCount(memberCount),
      Icon: Users,
    },
    {
      label: "Role",
      value: role,
      Icon: Target,
    },
  ] as const;

  return (
    <motion.div
      layoutId={`command-circle-card-${circle.id}`}
      role="dialog"
      aria-modal="true"
      className="relative h-full w-full max-h-[min(100vh-3rem,960px)] max-w-[min(100vw-3rem,420px)] overflow-y-auto rounded-2xl border border-white/5 bg-[#0B0E13] shadow-[0_6px_24px_rgba(0,0,0,0.35)] sm:max-h-[min(100vh-4rem,1000px)] sm:max-w-[min(100vw-4rem,640px)] md:rounded-3xl lg:max-w-[min(100vw-6rem,960px)] xl:max-w-[min(100vw-8rem,1160px)]"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 480, damping: 42, mass: 0.9 }}
    >
      <button
        type="button"
        aria-label="Close Circle detail"
        onClick={onClose}
        className="absolute left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/70 backdrop-blur transition hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <main className="overflow-x-hidden px-2.5 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-x-hidden sm:gap-6">
          <section className="relative min-h-0 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#050505] via-[#0f0f10] to-[#1b1b1d] px-3 py-3 text-white shadow-[0_35px_120px_-45px_rgba(0,0,0,0.85)] sm:min-h-[210px] sm:p-7">
            <div className="absolute inset-0">
              <div className="absolute inset-x-12 -top-16 h-48 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.18),_transparent_70%)] blur-3xl" />
              <div className="absolute bottom-0 right-0 h-56 w-56 translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.06),_transparent_60%)] blur-3xl" />
            </div>
            <div className="relative flex flex-row gap-4 pt-12 sm:items-start sm:gap-6 sm:pt-0">
              <span
                className="relative flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-b from-[#040404] via-[#08080a] to-black text-xl font-semibold text-white shadow-[0_25px_45px_rgba(0,0,0,0.65)] sm:h-[72px] sm:w-[72px] sm:text-2xl"
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
                <span className="relative z-10 drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]">
                  {getCircleInitials(circle.name)}
                </span>
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="min-w-0">
                  <motion.h2
                    layoutId={`command-circle-title-${circle.id}`}
                    className="truncate text-3xl font-semibold tracking-tight text-white sm:text-4xl"
                  >
                    {circle.name}
                  </motion.h2>
                </div>
                <div className="grid gap-1 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap">
                  {quickFacts.map(({ label, value, Icon }) => (
                    <div
                      key={label}
                      className="group flex items-center gap-1 rounded-full border border-black bg-white/5 px-2 py-1 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur transition hover:border-black hover:bg-white/10"
                    >
                      <span className="flex size-5 items-center justify-center rounded-full bg-white/10 text-white/70">
                        <Icon className="h-2.5 w-2.5" aria-hidden="true" />
                      </span>
                      <div className="flex flex-col leading-tight">
                        <span className="text-[7px] font-semibold uppercase tracking-[0.28em] text-white/45">
                          {label}
                        </span>
                        <span className="text-xs font-semibold text-white/85">
                          {value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <AvatarStack members={members} fallbackName={circle.name} />
                  <span className="text-sm font-semibold text-white/70">
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

            <CircleHabitsPanel />
          </div>

          <CircleMembersPanel
            members={activeMembers}
            isLoading={isLoadingMembers}
            error={membersError}
            selectedMemberId={selectedMemberId}
            onToggleMember={(memberId) =>
              setSelectedMemberId((currentMemberId) =>
                currentMemberId === memberId ? null : memberId
              )
            }
            isOwner={isOwner}
          />
        </div>
      </main>
    </motion.div>
  );
}

export function CommandCirclesSection({ className }: CommandCirclesSectionProps) {
  const [circles, setCircles] = useState<CommandCircle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setCircles(data.circles ?? []);
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

  useEffect(() => {
    const controller = new AbortController();

    void loadCircles(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadCircles]);

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

  return (
    <section className={cn("text-white", className)}>
      <div className="mb-3 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-white">Circles</h2>
      </div>

      {isLoading ? (
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

      {!isLoading && error ? (
        <article className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-5 text-sm text-rose-100 shadow-xl shadow-rose-950/20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200/70">
            Circles unavailable
          </p>
          <p className="mt-2 leading-6">{error}</p>
        </article>
      ) : null}

      {!isLoading && !error && circles.length === 0 ? (
        <article className="rounded-2xl border border-white/10 bg-black/45 p-6 shadow-xl shadow-black/30">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/65">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">
                Create or join a Circle to manage shared goals, projects, tasks,
                and habits.
              </p>
              <Link
                href="/friends"
                className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Go to Friends
              </Link>
            </div>
          </div>
        </article>
      ) : null}

      {!isLoading && !error && circles.length > 0 ? (
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
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
