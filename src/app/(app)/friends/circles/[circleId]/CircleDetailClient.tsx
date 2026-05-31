"use client";

import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  LockKeyhole,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

type CircleDetailClientProps = {
  circleId: string;
};

type Circle = {
  id: string;
  owner_user_id: string;
  name: string;
  circle_type: string;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

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

type InviteRole = "MEMBER" | "OPERATOR" | "MANAGER" | "VIEWER";

type InviteProfile = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

type DetailSection = {
  title: string;
  Icon: LucideIcon;
  rows: DetailRow[];
  helperText?: string;
  showAvatars?: boolean;
  emptyMessage?: string;
};

type DetailRow = {
  key?: string;
  label: string;
  value?: string;
  username?: string | null;
  avatarUrl?: string | null;
  avatarInitials?: string;
  workProfile?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
};

const defaultBody = "Manage people, roles, invites, and trust for this Circle.";

const memberPlaceholderRows = [
  { label: "You", value: "Owner / Active" },
  { label: "Alex", value: "Member / Pending" },
  { label: "Jordan", value: "Operator / Active" },
];

const permissionRows = [
  { label: "Can invite members" },
  { label: "Can manage roles" },
  { label: "Can view Circle members" },
  { label: "Can update Circle settings" },
];

const requestRows = [
  { label: "2 pending member invites" },
  { label: "1 invite awaiting response" },
];

const inviteRoleOptions: InviteRole[] = [
  "MEMBER",
  "OPERATOR",
  "MANAGER",
  "VIEWER",
];

type MemberConstraintField = "skill_constraint_ids" | "location_context_ids";

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function shortenUserId(userId: string) {
  if (userId.length <= 12) {
    return userId;
  }

  return `${userId.slice(0, 6)}...${userId.slice(-4)}`;
}

function getInitials(displayName: string, fallback: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return (words[0]?.slice(0, 2) || fallback.slice(0, 2)).toUpperCase();
}

function normalizeInviteSearchText(value: string | null) {
  if (!value) return "";

  const trimmed = value.trim();
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;

  return withoutAt.trim().toLowerCase();
}

function inviteTextMatchesProfile(value: string, profile: InviteProfile) {
  const normalizedValue = normalizeInviteSearchText(value);
  const normalizedUsername = normalizeInviteSearchText(profile.username);
  const normalizedName = normalizeInviteSearchText(profile.name);

  return (
    normalizedValue.length > 0 &&
    (normalizedValue === normalizedUsername ||
      normalizedValue === normalizedName)
  );
}

function getMemberRow(
  member: CircleMember,
  action?: DetailRow["action"],
): DetailRow {
  const shortenedUserId = shortenUserId(member.user_id);
  const profileName = member.profile?.name?.trim();
  const username = member.profile?.username?.trim();
  const displayName = profileName || username || shortenedUserId;
  const statusLabel = member.status === "INVITED" ? "Pending" : member.status;

  return {
    key: member.id,
    label: displayName,
    username: username ? `@${username}` : null,
    avatarUrl: member.profile?.avatar_url?.trim() || null,
    avatarInitials: getInitials(displayName, shortenedUserId),
    value: `${member.role} / ${statusLabel}`,
    action,
  };
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

  return hiddenCount > 0 ? `${visibleLabels}, +${hiddenCount}` : visibleLabels;
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

function ConstraintMultiSelect({
  label,
  options,
  selectedIds,
  emptyLabel,
  noOptionsLabel,
  canEdit,
  isSaving,
  onChange,
}: {
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
    <div className="relative min-w-0 rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
            {label}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-white/75">
            {isSaving ? "Saving..." : summary}
          </p>
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
                className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-2">
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
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? "border-emerald-300/60 bg-emerald-300/20 text-emerald-100"
                      : "border-white/15 bg-white/[0.03] text-transparent"
                  }`}
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

export default function CircleDetailClient({
  circleId,
}: CircleDetailClientProps) {
  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [ownerSkills, setOwnerSkills] = useState<OwnerSkillOption[]>([]);
  const [ownerLocationContexts, setOwnerLocationContexts] = useState<
    OwnerLocationContextOption[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("MEMBER");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSearchResults, setInviteSearchResults] = useState<
    InviteProfile[]
  >([]);
  const [isSearchingInvitees, setIsSearchingInvitees] = useState(false);
  const [inviteSearchError, setInviteSearchError] = useState<string | null>(
    null,
  );
  const [selectedInviteProfile, setSelectedInviteProfile] =
    useState<InviteProfile | null>(null);
  const [viewerCanManageMembers, setViewerCanManageMembers] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(
    null,
  );
  const [memberConstraintActionId, setMemberConstraintActionId] = useState<
    string | null
  >(null);

  const loadCircle = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `/api/circles/${encodeURIComponent(circleId)}`,
          {
            cache: "no-store",
            signal,
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Unable to load circle.");
        }

        const data = (await response.json()) as {
          circle: Circle;
          viewerCanManageMembers?: boolean;
          ownerSkills?: OwnerSkillOption[];
          ownerLocationContexts?: OwnerLocationContextOption[];
          members?: CircleMember[];
        };

        setCircle(data.circle);
        setMembers(
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
        setOwnerSkills(data.ownerSkills ?? []);
        setOwnerLocationContexts(data.ownerLocationContexts ?? []);
        setViewerCanManageMembers(data.viewerCanManageMembers ?? false);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setCircle(null);
        setMembers([]);
        setOwnerSkills([]);
        setOwnerLocationContexts([]);
        setViewerCanManageMembers(false);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load circle.",
        );
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [circleId],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadCircle(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadCircle]);

  useEffect(() => {
    if (
      selectedInviteProfile &&
      !inviteTextMatchesProfile(inviteUsername, selectedInviteProfile)
    ) {
      setSelectedInviteProfile(null);
    }

    const normalizedQuery = normalizeInviteSearchText(inviteUsername);

    if (normalizedQuery.length < 2) {
      setInviteSearchResults([]);
      setInviteSearchError(null);
      setIsSearchingInvitees(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsSearchingInvitees(true);
        setInviteSearchError(null);

        const response = await fetch(
          `/api/circles/member-search?q=${encodeURIComponent(inviteUsername)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Unable to search profiles.");
        }

        const data = (await response.json()) as {
          profiles?: InviteProfile[];
        };

        setInviteSearchResults(data.profiles ?? []);
      } catch (searchError) {
        if (
          searchError instanceof DOMException &&
          searchError.name === "AbortError"
        ) {
          return;
        }

        setInviteSearchResults([]);
        setInviteSearchError(
          searchError instanceof Error
            ? searchError.message
            : "Unable to search profiles.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingInvitees(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [inviteUsername, selectedInviteProfile]);

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submittedUsername =
      selectedInviteProfile?.username?.trim() || inviteUsername;

    if (!submittedUsername.trim()) {
      setInviteError("Username is required.");
      return;
    }

    try {
      setIsInviting(true);
      setInviteError(null);

      const response = await fetch(
        `/api/circles/${encodeURIComponent(circleId)}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: submittedUsername,
            role: inviteRole,
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Unable to send invite.");
      }

      setInviteUsername("");
      setInviteRole("MEMBER");
      setInviteSearchResults([]);
      setInviteSearchError(null);
      setSelectedInviteProfile(null);
      setShowInviteForm(false);
      await loadCircle();
    } catch (submitError) {
      setInviteError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send invite.",
      );
    } finally {
      setIsInviting(false);
    }
  }

  const handleMemberAction = useCallback(
    async (member: CircleMember, action: "remove" | "cancel_invite") => {
      try {
        setMemberActionId(member.id);
        setMemberActionError(null);

        const response = await fetch(
          `/api/circles/${encodeURIComponent(
            circleId,
          )}/members/${encodeURIComponent(member.id)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action }),
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Unable to update member.");
        }

        await loadCircle();
      } catch (updateError) {
        setMemberActionError(
          updateError instanceof Error
            ? updateError.message
            : "Unable to update member.",
        );
      } finally {
        setMemberActionId(null);
      }
    },
    [circleId, loadCircle],
  );

  const handleMemberConstraintChange = useCallback(
    async (
      member: CircleMember,
      field: MemberConstraintField,
      nextIds: string[],
    ) => {
      const previousMembers = members;
      const actionId = `${member.id}:${field}`;

      try {
        setMemberConstraintActionId(actionId);
        setMemberActionError(null);
        setMembers((currentMembers) =>
          currentMembers.map((currentMember) =>
            currentMember.id === member.id
              ? { ...currentMember, [field]: nextIds }
              : currentMember,
          ),
        );

        const response = await fetch(
          `/api/circles/${encodeURIComponent(
            circleId,
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
          setMembers((currentMembers) =>
            currentMembers.map((currentMember) =>
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
        setMembers(previousMembers);
        setMemberActionError(
          updateError instanceof Error
            ? updateError.message
            : "Unable to update member profile.",
        );
      } finally {
        setMemberConstraintActionId(null);
      }
    },
    [circleId, members],
  );

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "ACTIVE"),
    [members],
  );

  const pendingInvites = useMemo(
    () => members.filter((member) => member.status === "INVITED"),
    [members],
  );

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

  const activeMemberRows = useMemo(() => {
    if (isLoading) {
      return memberPlaceholderRows;
    }

    return activeMembers.map((member) => {
      const row = getMemberRow(
        member,
        viewerCanManageMembers && member.role !== "OWNER"
          ? {
              label: memberActionId === member.id ? "Removing..." : "Remove",
              onClick: () => void handleMemberAction(member, "remove"),
              disabled: memberActionId !== null,
            }
          : undefined,
      );
      const skillActionId = `${member.id}:skill_constraint_ids`;
      const locationActionId = `${member.id}:location_context_ids`;
      const isConstraintSaving = memberConstraintActionId !== null;

      return {
        ...row,
        workProfile: (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  Work Profile
                </p>
                <p className="mt-1 text-xs leading-5 text-white/48">
                  Empty skills allow all owner skills. Empty locations grant no
                  location access.
                </p>
              </div>
              {!viewerCanManageMembers ? (
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                  Read only
                </span>
              ) : null}
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <ConstraintMultiSelect
                label="Skill constraints"
                options={skillConstraintOptions}
                selectedIds={normalizeStringArray(member.skill_constraint_ids)}
                emptyLabel="All skills"
                noOptionsLabel="No owner skills yet"
                canEdit={viewerCanManageMembers && !isConstraintSaving}
                isSaving={memberConstraintActionId === skillActionId}
                onChange={(nextIds) =>
                  void handleMemberConstraintChange(
                    member,
                    "skill_constraint_ids",
                    nextIds,
                  )
                }
              />
              <ConstraintMultiSelect
                label="Location contexts"
                options={locationContextOptions}
                selectedIds={normalizeStringArray(member.location_context_ids)}
                emptyLabel="No locations granted"
                noOptionsLabel="No locations yet"
                canEdit={viewerCanManageMembers && !isConstraintSaving}
                isSaving={memberConstraintActionId === locationActionId}
                onChange={(nextIds) =>
                  void handleMemberConstraintChange(
                    member,
                    "location_context_ids",
                    nextIds,
                  )
                }
              />
            </div>
          </div>
        ),
      };
    });
  }, [
    activeMembers,
    handleMemberAction,
    handleMemberConstraintChange,
    isLoading,
    memberActionId,
    memberConstraintActionId,
    locationContextOptions,
    skillConstraintOptions,
    viewerCanManageMembers,
  ]);

  const pendingInviteRows = useMemo(() => {
    if (isLoading) {
      return [];
    }

    return pendingInvites.map((member) =>
      getMemberRow(
        member,
        viewerCanManageMembers
          ? {
              label:
                memberActionId === member.id ? "Canceling..." : "Cancel Invite",
              onClick: () => void handleMemberAction(member, "cancel_invite"),
              disabled: memberActionId !== null,
            }
          : undefined,
      ),
    );
  }, [
    handleMemberAction,
    isLoading,
    memberActionId,
    pendingInvites,
    viewerCanManageMembers,
  ]);

  const sections: DetailSection[] = useMemo(
    () => [
      {
        title: "Active Members",
        Icon: Users,
        rows: activeMemberRows,
        showAvatars: true,
        emptyMessage: "No active members yet.",
      },
      {
        title: "Pending Invites",
        Icon: UserPlus,
        rows: pendingInviteRows,
        helperText: "These people have been invited but have not accepted yet.",
        showAvatars: true,
        emptyMessage: "No pending invites.",
      },
      {
        title: "Permissions",
        Icon: ShieldCheck,
        rows: permissionRows,
      },
      {
        title: "Circle Activity",
        Icon: ClipboardList,
        rows: requestRows,
      },
      {
        title: "Circle Settings",
        Icon: Settings,
        rows: [
          { label: "Type", value: circle?.circle_type ?? "Household" },
          { label: "Status", value: circle?.status ?? "Active" },
          { label: "Visibility", value: "Private" },
        ],
      },
    ],
    [activeMemberRows, circle, pendingInviteRows],
  );

  const title = circle?.name ?? "Household";
  const body = circle?.description?.trim() || defaultBody;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] pt-0 mt-0 text-white">
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_34%),linear-gradient(135deg,rgba(18,18,18,0.96),rgba(0,0,0,0.92))] px-6 pb-6 pt-3 shadow-2xl shadow-black/50 sm:px-8 sm:pb-8 sm:pt-4">
        <Link
          href="/friends"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Link>

        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/50">
              CIRCLE
            </p>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-white/45">
              {circleId}
            </span>
          </div>
          <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
            {body}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              setShowInviteForm((current) => !current);
              setInviteError(null);
              setInviteSearchError(null);
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black/90 transition hover:bg-white/85"
            aria-expanded={showInviteForm}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Invite Person
          </button>
        </div>

        {showInviteForm ? (
          <form
            onSubmit={handleInviteSubmit}
            className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-3 ring-1 ring-white/5"
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto_auto] sm:items-start">
              <div className="relative min-w-0">
                <label className="sr-only" htmlFor="circle-member-search-query">
                  Username
                </label>
                <input
                  id="circle-member-search-query"
                  type="search"
                  inputMode="search"
                  value={inviteUsername}
                  onChange={(event) => {
                    setInviteUsername(event.target.value);
                    setInviteError(null);
                  }}
                  placeholder="name or @username"
                  className="h-11 w-full min-w-0 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-white outline-none transition placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.09]"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  name="circle-member-search-query"
                  aria-autocomplete="list"
                />
                <p className="mt-2 px-1 text-xs font-medium text-white/45">
                  Search by name or @username.
                </p>
                {isSearchingInvitees ||
                inviteSearchError ||
                inviteSearchResults.length > 0 ? (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-xl shadow-black/35 ring-1 ring-white/5">
                    {isSearchingInvitees ? (
                      <p className="px-4 py-3 text-sm font-medium text-white/55">
                        Searching...
                      </p>
                    ) : null}
                    {inviteSearchError ? (
                      <p className="px-4 py-3 text-sm font-medium text-rose-200">
                        {inviteSearchError}
                      </p>
                    ) : null}
                    {!inviteSearchError
                      ? inviteSearchResults.map((profile) => {
                          const username = profile.username?.trim() || null;
                          const profileName = profile.name?.trim();
                          const displayName =
                            profileName ||
                            username ||
                            shortenUserId(profile.user_id);
                          const isSelected =
                            selectedInviteProfile?.user_id === profile.user_id;

                          return (
                            <button
                              key={profile.user_id}
                              type="button"
                              onClick={() => {
                                setSelectedInviteProfile(profile);
                                setInviteUsername(
                                  username ? `@${username}` : displayName,
                                );
                                setInviteSearchError(null);
                                setInviteError(null);
                              }}
                              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                                isSelected
                                  ? "bg-white/[0.1]"
                                  : "hover:bg-white/[0.06]"
                              }`}
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black text-xs font-semibold uppercase text-white/75 ring-1 ring-white/15">
                                {profile.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={profile.avatar_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  getInitials(displayName, profile.user_id)
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-white/85">
                                  {displayName}
                                </span>
                                {username ? (
                                  <span className="mt-0.5 block truncate text-xs font-medium text-white/45">
                                    @{username}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          );
                        })
                      : null}
                  </div>
                ) : null}
              </div>
              <label className="sr-only" htmlFor="invite-role">
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(event) =>
                  setInviteRole(event.target.value as InviteRole)
                }
                className="h-11 rounded-full border border-white/10 bg-zinc-950 px-4 text-sm font-semibold text-white/80 outline-none transition focus:border-white/25"
              >
                {inviteRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setShowInviteForm(false);
                  setInviteUsername("");
                  setInviteRole("MEMBER");
                  setInviteError(null);
                  setInviteSearchResults([]);
                  setInviteSearchError(null);
                  setSelectedInviteProfile(null);
                }}
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/65 transition hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isInviting}
                className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-black/90 transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isInviting ? "Sending..." : "Send Invite"}
              </button>
            </div>
            {inviteError ? (
              <p className="mt-3 px-1 text-sm font-medium text-rose-200">
                {inviteError}
              </p>
            ) : null}
          </form>
        ) : null}
      </section>

      {isLoading ? (
        <section className="rounded-2xl border border-white/10 bg-black/45 p-5 shadow-xl shadow-black/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
                Loading Circle
              </p>
              <h2 className="mt-2 text-base font-semibold text-white">
                Pulling trust, access, and member records into view.
              </h2>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-white/60 shadow-[0_0_18px_rgba(255,255,255,0.45)]" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="h-2 rounded-full bg-white/10" />
            <div className="h-2 rounded-full bg-white/10" />
            <div className="h-2 rounded-full bg-white/10" />
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-5 text-sm text-rose-100 shadow-xl shadow-rose-950/20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200/70">
            Circle unavailable
          </p>
          <p className="mt-2 leading-6">{error}</p>
        </section>
      ) : null}

      {memberActionError ? (
        <section className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm font-medium text-rose-100 shadow-xl shadow-rose-950/20">
          {memberActionError}
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.Icon;

          return (
            <article
              key={section.title}
              className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-xl shadow-black/30"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">
                    {section.title}
                  </h2>
                  {section.helperText ? (
                    <p className="mt-1 text-sm leading-5 text-white/50">
                      {section.helperText}
                    </p>
                  ) : null}
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 ring-1 ring-white/10">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {section.rows.length > 0 ? (
                  section.rows.map((row) => (
                    <div
                      key={row.key ?? `${section.title}-${row.label}`}
                      className="rounded-xl bg-white/[0.04] px-3 py-2 ring-1 ring-white/5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {section.showAvatars ? (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-950 text-xs font-semibold uppercase text-white/75 ring-1 ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(0,0,0,0.35)]">
                              {row.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={row.avatarUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                row.avatarInitials
                              )}
                            </div>
                          ) : null}
                          <span className="min-w-0 text-sm font-medium text-white/80">
                            <span className="block truncate">{row.label}</span>
                            {row.username ? (
                              <span className="mt-0.5 block truncate text-xs font-medium text-white/45">
                                {row.username}
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                          {row.value ? (
                            <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                              {row.value}
                            </span>
                          ) : (
                            <CheckCircle2
                              className="h-4 w-4 shrink-0 text-emerald-300/80"
                              aria-hidden="true"
                            />
                          )}
                          {row.action ? (
                            <button
                              type="button"
                              onClick={row.action.onClick}
                              disabled={row.action.disabled}
                              className="inline-flex h-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {row.action.label}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {row.workProfile ? row.workProfile : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-white/[0.04] px-3 py-3 ring-1 ring-white/5">
                    <p className="text-sm font-medium text-white/55">
                      {section.emptyMessage}
                    </p>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-lg shadow-black/30">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 ring-1 ring-white/10">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">
              This is the Connect layer
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Circle detail manages trust, access, roles, and invites. Use the
              dashboard mode switch when you are ready to operate in Command.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
