"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { RescheduleButton } from "@/components/schedule/RescheduleButton";
import { ENERGY } from "@/lib/scheduler/config";
import { buildProjectItems, type ProjectItem } from "@/lib/scheduler/projects";
import { type WindowLite } from "@/lib/scheduler/repo";
import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";
import { toLocal } from "@/lib/time/tz";
import { useSchedulerMeta } from "@/lib/scheduler/useSchedulerMeta";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SCHEDULER_MODE_OPTIONS,
  modeRequiresMonument,
  modeRequiresSkills,
  type SchedulerMode,
} from "@/lib/scheduler/modes";
import { getMonumentsForUser } from "@/lib/queries/monuments";
import { getSkillsForUser } from "@/lib/data/skills";
import type { SkillRow } from "@/lib/types/skill";

const GAP_THRESHOLD_MINUTES = 1;

type SchedulerFailure = {
  itemId: string;
  reason: string;
  detail?: unknown;
};

type ScheduleDraft = {
  placed: ScheduleInstance[];
  failures: SchedulerFailure[];
  error?: unknown;
  timeline: PreparedPlacementEntry[];
};

type DraftPlacementEntry = {
  instance: ScheduleInstance;
  projectId: string;
  decision: "kept" | "new" | "rescheduled";
  availableStartLocal?: string | null;
  windowStartLocal?: string | null;
  scheduledDayOffset?: number | null;
};

type PreparedPlacementEntry = DraftPlacementEntry & {
  start: Date;
  end: Date;
  durationMin: number;
  availableStartLocalDate: Date | null;
  windowStartLocalDate: Date | null;
};

type PlacementView = {
  instance: ScheduleInstance;
  project?: ProjectItem;
  window?: WindowLite;
  start: Date;
  end: Date;
  durationMin: number;
  decision: DraftPlacementEntry["decision"];
  reason: string;
};

type GapEntry = {
  type: "gap";
  id: string;
  start: Date;
  end: Date;
  durationMin: number;
  message: string;
};

type TimelineEntry =
  | { type: "placement"; placement: PlacementView }
  | GapEntry;

export default function SchedulerPage() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [mode, setMode] = useState<SchedulerMode>("regular");
  const [selectedMonumentId, setSelectedMonumentId] = useState<string>("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [monuments, setMonuments] = useState<
    Awaited<ReturnType<typeof getMonumentsForUser>>
  >([]);
  const [isLoadingMonuments, setIsLoadingMonuments] = useState(false);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);

  const { tasks, projects, windowMap, status: metaStatus, error: metaError } =
    useSchedulerMeta();

  useEffect(() => {
    let active = true;
    if (!userId) {
      setMonuments([]);
      setIsLoadingMonuments(false);
      return () => {
        active = false;
      };
    }

    setIsLoadingMonuments(true);
    getMonumentsForUser(userId)
      .then(data => {
        if (!active) return;
        setMonuments(data ?? []);
      })
      .catch(err => {
        console.error("Failed to load monuments", err);
        if (active) setMonuments([]);
      })
      .finally(() => {
        if (active) setIsLoadingMonuments(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setSkills([]);
      setIsLoadingSkills(false);
      return () => {
        active = false;
      };
    }

    setIsLoadingSkills(true);
    getSkillsForUser(userId)
      .then(data => {
        if (!active) return;
        setSkills(data ?? []);
      })
      .catch(err => {
        console.error("Failed to load skills", err);
        if (active) setSkills([]);
      })
      .finally(() => {
        if (active) setIsLoadingSkills(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const projectItems = useMemo(
    () => buildProjectItems(projects, tasks),
    [projects, tasks],
  );

  const { projectMap, energyGroups } = useMemo(() => {
    const map: Record<string, ProjectItem> = {};
    const grouped = new Map<ProjectItem["energy"], ProjectItem[]>();

    for (const item of projectItems) {
      map[item.id] = item;
      const existing = grouped.get(item.energy);
      if (existing) {
        existing.push(item);
      } else {
        grouped.set(item.energy, [item]);
      }
    }

    const groups = ENERGY.LIST.flatMap(energy => {
      const items = grouped.get(energy);
      if (!items || items.length === 0) return [];
      items.sort((a, b) => b.weight - a.weight);
      return [{ energy, items }];
    });

    return { projectMap: map, energyGroups: groups };
  }, [projectItems]);

  const placements = useMemo<PlacementView[]>(() => {
    if (!scheduleDraft) return [];
    return scheduleDraft.timeline.map(entry => {
      const { instance, decision, start, end, durationMin } = entry;
      const projectId =
        typeof instance.source_id === "string" && instance.source_id
          ? instance.source_id
          : entry.projectId;
      const project = projectId ? projectMap[projectId] : undefined;
      const window =
        typeof instance.window_id === "string"
          ? windowMap[instance.window_id]
          : undefined;
      const reason = describePlacementReason({
        decision,
        project,
        window,
        instance,
        start,
        availableStartLocal: entry.availableStartLocalDate,
        windowStartLocal: entry.windowStartLocalDate,
      });
      return {
        instance,
        project,
        window,
        start,
        end,
        durationMin,
        decision,
        reason,
      };
    });
  }, [scheduleDraft, projectMap, windowMap]);

  const requiresMonument = modeRequiresMonument(mode);
  const requiresSkills = modeRequiresSkills(mode);
  const activeMode = useMemo(
    () => SCHEDULER_MODE_OPTIONS.find(option => option.value === mode),
    [mode],
  );
  const selectedSkillDetails = useMemo(() => {
    if (selectedSkillIds.length === 0) return [] as SkillRow[];
    const map = new Map(skills.map(skill => [skill.id, skill]));
    return selectedSkillIds
      .map(id => map.get(id))
      .filter((skill): skill is SkillRow => Boolean(skill));
  }, [skills, selectedSkillIds]);
  const skillTriggerLabel = requiresSkills
    ? selectedSkillIds.length > 0
      ? `${selectedSkillIds.length} selected`
      : isLoadingSkills
        ? "Loading skills…"
        : "Choose skills"
    : "Choose skills";
  const monumentPlaceholder = isLoadingMonuments
    ? "Loading monuments…"
    : monuments.length > 0
      ? "Choose monument"
      : "No monuments available";
  const isRescheduleDisabled =
    status === "pending" ||
    (requiresMonument && !selectedMonumentId) ||
    (requiresSkills && selectedSkillIds.length === 0);

  const failureDetails = useMemo(() => {
    if (!scheduleDraft) return [] as Array<{
      failure: SchedulerFailure;
      project?: ProjectItem;
      message: string;
      detail?: string | null;
    }>;
    return scheduleDraft.failures.map(failure => {
      const project = projectMap[failure.itemId];
      const description = describeFailure(failure, project);
      return {
        failure,
        project,
        message: description.message,
        detail: description.detail,
      };
    });
  }, [scheduleDraft, projectMap]);

  const failureSummary = useMemo(() => {
    if (failureDetails.length === 0) return null;
    return failureDetails
      .map(detail =>
        detail.detail ? `${detail.message} ${detail.detail}` : detail.message,
      )
      .join(" ");
  }, [failureDetails]);

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    if (placements.length === 0) return [];
    const entries: TimelineEntry[] = [];
    for (let index = 0; index < placements.length; index += 1) {
      const placement = placements[index];
      entries.push({ type: "placement", placement });
      const next = placements[index + 1];
      if (!next) continue;
      const gapMs = next.start.getTime() - placement.end.getTime();
      const gapMinutes = Math.round(gapMs / 60000);
      if (gapMinutes <= GAP_THRESHOLD_MINUTES) continue;
      entries.push({
        type: "gap",
        id: `${placement.instance.id}-gap-${next.instance.id}`,
        start: placement.end,
        end: next.start,
        durationMin: gapMinutes,
        message: buildGapMessage({ previous: placement, next, failureSummary }),
      });
    }
    return entries;
  }, [placements, failureSummary]);

  const timelineParentRef = useRef<HTMLDivElement | null>(null);

  const timelineVirtualizer = useVirtualizer({
    count: timelineEntries.length,
    getScrollElement: () => timelineParentRef.current,
    estimateSize: () => 176,
    overscan: 6,
    getItemKey: index => {
      const entry = timelineEntries[index];
      return entry.type === "placement"
        ? `placement-${entry.placement.instance.id}`
        : `gap-${entry.id}`;
    },
    measureElement:
      typeof window !== "undefined"
        ? element => element.getBoundingClientRect().height
        : undefined,
  });

  async function handleReschedule() {
    setStatus("pending");
    setError(null);

    try {
      const requestBody: Record<string, unknown> = {
        mode,
        monumentId: requiresMonument
          ? selectedMonumentId.trim() || null
          : null,
        skillIds: requiresSkills ? selectedSkillIds : [],
        localTimeIso: new Date().toISOString(),
      };

      try {
        if (typeof Intl !== "undefined") {
          const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (resolved) {
            requestBody.timeZone = resolved;
          }
        }
      } catch (tzError) {
        console.debug("Failed to resolve local time zone", tzError);
      }

      const response = await fetch("/api/scheduler/run", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch (parseError) {
        if (response.ok) {
          console.warn("Failed to parse scheduler response", parseError);
        }
      }

      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String(
                (payload as { error?: unknown }).error ??
                  "Failed to trigger reschedule",
              )
            : "Failed to trigger reschedule";
        throw new Error(message);
      }

      if (payload && typeof payload === "object" && "schedule" in payload) {
        const parsed = parseScheduleDraft(
          (payload as { schedule?: unknown }).schedule,
        );
        setScheduleDraft(
          parsed ?? { placed: [], failures: [], timeline: [] },
        );
      } else {
        setScheduleDraft(null);
      }

      setLastRunAt(new Date());
      setStatus("success");
    } catch (err) {
      console.error("Failed to trigger scheduler", err);
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Failed to trigger reschedule",
      );
    }
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6 p-4 text-zinc-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Scheduler</h1>
            <p className="text-sm text-zinc-400">
              Run the scheduler on demand to reschedule tasks and projects.
            </p>
          </div>
          <Button
            asChild
            size="sm"
            className="bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          >
            <Link href="/schedule">Back</Link>
          </Button>
        </div>
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Scheduler mode
              </h2>
              <p className="text-xs text-zinc-400">
                {activeMode?.description ??
                  "Choose how the scheduler should prioritize work."}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold text-zinc-300">
                  Mode
                </Label>
                <Select
                  value={mode}
                  onValueChange={value => setMode(value as SchedulerMode)}
                  className="mt-1"
                  triggerClassName="h-10 rounded-xl border-white/10 bg-white/[0.05] px-3 text-left text-sm text-zinc-100"
                  contentWrapperClassName="bg-zinc-900/95"
                >
                  <SelectContent>
                    {SCHEDULER_MODE_OPTIONS.map(option => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        label={option.label}
                        className="text-sm text-zinc-100"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-zinc-100">
                            {option.label}
                          </span>
                          <span className="text-xs text-zinc-400">
                            {option.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {requiresMonument && (
                <div>
                  <Label className="text-xs font-semibold text-zinc-300">
                    Focus monument
                  </Label>
                  <Select
                    value={selectedMonumentId}
                    onValueChange={setSelectedMonumentId}
                    placeholder={monumentPlaceholder}
                    className="mt-1"
                    triggerClassName="h-10 rounded-xl border-white/10 bg-white/[0.05] px-3 text-left text-sm text-zinc-100"
                    contentWrapperClassName="bg-zinc-900/95"
                  >
                    <SelectContent>
                      <SelectItem
                        value=""
                        label="Clear selection"
                        className="text-sm text-zinc-300"
                      >
                        <span className="text-zinc-400">Clear selection</span>
                      </SelectItem>
                      {monuments.map(monument => (
                        <SelectItem
                          key={monument.id}
                          value={monument.id}
                          label={`${monument.emoji ?? "🏛️"} ${monument.title}`}
                          className="text-sm text-zinc-100"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              {monument.emoji ?? "🏛️"}
                            </span>
                            <span>{monument.title}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {monuments.length === 0 && !isLoadingMonuments && (
                    <p className="mt-1 text-xs text-zinc-500">
                      Add a monument to enable Monumental mode.
                    </p>
                  )}
                </div>
              )}
              {requiresSkills && (
                <div className={requiresMonument ? "md:col-span-2" : undefined}>
                  <Label className="text-xs font-semibold text-zinc-300">
                    Focus skills
                  </Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={isLoadingSkills || skills.length === 0}
                        className="mt-1 flex h-10 w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.05] px-3 text-left text-sm text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span>{skillTriggerLabel}</span>
                        <ChevronDown className="h-4 w-4 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-[14rem] bg-zinc-900/95 text-sm text-zinc-100">
                      {skills.map(skill => (
                        <DropdownMenuCheckboxItem
                          key={skill.id}
                          checked={selectedSkillIds.includes(skill.id)}
                          onCheckedChange={checked => {
                            setSelectedSkillIds(prev => {
                              const isChecked = checked === true;
                              if (isChecked) {
                                if (prev.includes(skill.id)) return prev;
                                return [...prev, skill.id];
                              }
                              return prev.filter(id => id !== skill.id);
                            });
                          }}
                        >
                          <span className="text-lg leading-none">
                            {skill.icon ?? "✦"}
                          </span>
                          <span>{skill.name}</span>
                        </DropdownMenuCheckboxItem>
                      ))}
                      {skills.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-zinc-400">
                          No skills available.
                        </div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {selectedSkillDetails.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedSkillDetails.map(skill => (
                        <Badge
                          key={skill.id}
                          variant="secondary"
                          className="bg-zinc-800/80 text-zinc-100"
                        >
                          <span>{skill.icon ?? "✦"}</span>
                          <span>{skill.name}</span>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">
                      {isLoadingSkills
                        ? "Loading skills…"
                        : "Select at least one skill to use Skilled mode."}
                    </p>
                  )}
                </div>
              )}
            </div>
            {(requiresMonument && !selectedMonumentId) ||
            (requiresSkills && selectedSkillIds.length === 0) ? (
              <p className="text-xs text-amber-400">
                {requiresMonument && !selectedMonumentId
                  ? "Select a monument to enable Monumental mode."
                  : "Choose at least one skill to enable Skilled mode."}
              </p>
            ) : null}
          </div>
        </section>
        <RescheduleButton
          onClick={handleReschedule}
          disabled={isRescheduleDisabled}
          isRunning={status === "pending"}
        />
        {status === "success" && (
          <p className="text-sm text-emerald-400">Reschedule triggered.</p>
        )}
        {status === "error" && error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold text-zinc-100">
                Schedule draft
              </h2>
              <p className="text-xs text-zinc-400">
                Preview the placements created during the latest scheduler run.
              </p>
            </div>
            {lastRunAt && (
              <p className="text-xs text-zinc-500">
                Generated {lastRunAt.toLocaleString()}
              </p>
            )}
          </div>

          {metaStatus === "loading" && (
            <p className="mt-3 text-sm text-zinc-400">
              Loading projects and windows...
            </p>
          )}

          {metaStatus === "error" && metaError && (
            <p className="mt-3 text-sm text-red-400">
              Failed to load scheduler context: {metaError}
            </p>
          )}

          {scheduleDraft ? (
            <div className="mt-4 space-y-3">
              {scheduleDraft.error && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                  Scheduler reported an error while saving placements:{" "}
                  {formatFailureDetail(scheduleDraft.error) ?? "Unknown error"}
                </p>
              )}

              {timelineEntries.length > 0 ? (
                <div
                  ref={timelineParentRef}
                  className="max-h-[60vh] overflow-y-auto"
                >
                  <div
                    style={{
                      height: `${timelineVirtualizer.getTotalSize()}px`,
                      position: "relative",
                      width: "100%",
                    }}
                  >
                    {timelineVirtualizer.getVirtualItems().map(virtualRow => {
                      const entry = timelineEntries[virtualRow.index];
                      const isLast = virtualRow.index === timelineEntries.length - 1;

                      if (entry.type === "placement") {
                        const { placement } = entry;
                        const projectName = placement.project?.name?.trim()
                          ? placement.project.name
                          : placement.instance.source_id || "Untitled project";

                        return (
                          <div
                            key={virtualRow.key}
                            ref={timelineVirtualizer.measureElement}
                            className="absolute left-0 right-0"
                            style={{
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                          >
                            <div
                              style={{
                                paddingBottom: isLast ? 0 : "0.75rem",
                              }}
                            >
                              <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-medium text-zinc-100">
                                      {projectName}
                                    </div>
                                    <div className="text-xs text-zinc-400">
                                      {(placement.project?.stage || "") && (
                                        <span>{placement.project?.stage}</span>
                                      )}
                                      {placement.project?.priority && (
                                        <span>
                                          {placement.project?.stage ? " · " : ""}
                                          {placement.project.priority}
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                                      <span className="inline-flex items-center rounded-full bg-zinc-800/80 px-2 py-0.5">
                                        {formatDecisionLabel(placement.decision)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right text-xs text-zinc-400">
                                    <div>{formatDateTime(placement.start)}</div>
                                    <div className="text-zinc-500">
                                      → {formatDateTime(placement.end)}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-400">
                                  <span>
                                    Window:{" "}
                                    {placement.window?.label ||
                                      placement.instance.window_id ||
                                      "Unassigned"}
                                  </span>
                                  <span>
                                    Duration: {formatDurationMinutes(placement.durationMin)}
                                  </span>
                                  <span>
                                    Energy:{" "}
                                    {placement.project?.energy ||
                                      placement.instance.energy_resolved ||
                                      "NO"}
                                  </span>
                                </div>
                                <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                                  {placement.reason}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={virtualRow.key}
                          ref={timelineVirtualizer.measureElement}
                          className="absolute left-0 right-0"
                          style={{
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <div
                            style={{
                              paddingBottom: isLast ? 0 : "0.75rem",
                            }}
                          >
                            <div className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/10 p-3 text-amber-100">
                              <div className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                                Gap
                              </div>
                              <div className="mt-1 text-xs text-amber-100/80">
                                {formatDateTime(entry.start)} → {formatDateTime(entry.end)}
                              </div>
                              <div className="mt-1 text-xs">
                                {formatDurationMinutes(entry.durationMin)} gap between
                                placements.
                              </div>
                              <p className="mt-2 text-xs leading-relaxed text-amber-50">
                                {entry.message}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">
                  The scheduler did not return any placements. Run the scheduler
                  to generate a draft timeline.
                </p>
              )}

              {failureDetails.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                    Unscheduled projects
                  </div>
                  <ul className="mt-2 space-y-2 text-xs text-amber-100/90">
                    {failureDetails.map(({ failure, project, message, detail }) => (
                      <li key={failure.itemId}>
                        <div className="font-medium text-amber-50">
                          {project?.name || failure.itemId}
                        </div>
                        <div>{message}</div>
                        {detail && (
                          <div className="text-amber-200/80">{detail}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">
              Run the scheduler to generate a draft preview of upcoming
              placements.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Projects by energy
            </h2>
            <p className="text-xs text-zinc-400">
              Explore the backlog grouped by energy level. Each list is sorted by
              scheduler weight (highest first).
            </p>
          </div>

          {metaStatus === "loading" && (
            <p className="text-sm text-zinc-400">Loading projects…</p>
          )}

          {metaStatus === "error" && metaError && (
            <p className="text-sm text-red-400">
              Failed to load projects: {metaError}
            </p>
          )}

          {metaStatus === "loaded" && energyGroups.length === 0 && (
            <p className="text-sm text-zinc-400">No projects available.</p>
          )}

          {metaStatus === "loaded" && energyGroups.length > 0 && (
            <div className="space-y-2">
              {energyGroups.map(group => (
                <details
                  key={group.energy}
                  className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-zinc-100">
                    <span>Energy: {group.energy}</span>
                    <span className="text-xs text-zinc-400">
                      {group.items.length} project
                      {group.items.length === 1 ? "" : "s"}
                    </span>
                  </summary>
                  <div className="border-t border-zinc-800 bg-zinc-900/70 px-4 py-3">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-sm text-zinc-200">
                        <thead className="text-xs uppercase text-zinc-400">
                          <tr>
                            <th className="py-2 pr-3 font-medium">Project</th>
                            <th className="py-2 pr-3 font-medium">Stage</th>
                            <th className="py-2 pr-3 font-medium">Priority</th>
                            <th className="py-2 pr-3 text-right font-medium">Weight</th>
                            <th className="py-2 pr-3 text-right font-medium">Duration</th>
                            <th className="py-2 pl-3 text-right font-medium">Tasks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {group.items.map(project => (
                            <tr key={project.id}>
                              <td className="py-2 pr-3 align-top">
                                <div className="font-medium text-zinc-100">
                                  {project.name || "Untitled project"}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  {project.id}
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-xs uppercase tracking-wide text-zinc-400">
                                {project.stage}
                              </td>
                              <td className="py-2 pr-3 text-xs uppercase tracking-wide text-zinc-400">
                                {project.priority}
                              </td>
                              <td className="py-2 pr-3 text-right text-sm font-semibold text-zinc-100">
                                {project.weight.toFixed(2)}
                              </td>
                              <td className="py-2 pr-3 text-right text-xs text-zinc-400">
                                {formatDurationMinutes(
                                  Math.round(project.duration_min),
                                )}
                              </td>
                              <td className="py-2 pl-3 text-right text-xs text-zinc-400">
                                {project.taskCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </ProtectedRoute>
  );
}

function parseScheduleDraft(input: unknown): ScheduleDraft | null {
  if (!input || typeof input !== "object") return null;
  const payload = input as {
    placed?: unknown;
    failures?: unknown;
    error?: unknown;
    timeline?: unknown;
  };

  const placed: ScheduleInstance[] = Array.isArray(payload.placed)
    ? payload.placed
        .map(toScheduleInstance)
        .filter((item): item is ScheduleInstance => item !== null)
    : [];

  const failures: SchedulerFailure[] = Array.isArray(payload.failures)
    ? payload.failures
        .map(toSchedulerFailure)
        .filter((item): item is SchedulerFailure => item !== null)
    : [];

  const error = payload.error;

  const timeline: PreparedPlacementEntry[] = Array.isArray(payload.timeline)
    ? payload.timeline
        .map(toDraftPlacementEntry)
        .filter((item): item is DraftPlacementEntry => item !== null)
        .map(prepareDraftPlacementEntry)
        .filter(
          (item): item is PreparedPlacementEntry => item !== null,
        )
        .sort((a, b) => a.start.getTime() - b.start.getTime())
    : [];

  if (placed.length === 0 && failures.length === 0 && !error && timeline.length === 0) {
    return { placed: [], failures: [], timeline: [] };
  }

  return { placed, failures, error, timeline };
}

function toScheduleInstance(input: unknown): ScheduleInstance | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Partial<ScheduleInstance>;
  if (typeof record.id !== "string") return null;
  if (typeof record.start_utc !== "string") return null;
  if (typeof record.end_utc !== "string") return null;
  return record as ScheduleInstance;
}

function toSchedulerFailure(input: unknown): SchedulerFailure | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Partial<SchedulerFailure>;
  if (typeof record.itemId !== "string") return null;
  if (typeof record.reason !== "string") return null;
  return {
    itemId: record.itemId,
    reason: record.reason,
    detail: record.detail,
  };
}

function toDraftPlacementEntry(input: unknown): DraftPlacementEntry | null {
  if (!input || typeof input !== "object") return null;
  const record = input as {
    instance?: unknown;
    decision?: unknown;
    projectId?: unknown;
    availableStartLocal?: unknown;
    windowStartLocal?: unknown;
    scheduledDayOffset?: unknown;
  };
  const instance = toScheduleInstance(record.instance);
  if (!instance) return null;
  const decision = record.decision;
  if (decision !== "kept" && decision !== "new" && decision !== "rescheduled") {
    return null;
  }
  const projectId =
    typeof record.projectId === "string"
      ? record.projectId
      : typeof instance.source_id === "string"
        ? instance.source_id
        : "";
  return {
    instance,
    projectId,
    decision,
    availableStartLocal:
      typeof record.availableStartLocal === "string"
        ? record.availableStartLocal
        : null,
    windowStartLocal:
      typeof record.windowStartLocal === "string"
        ? record.windowStartLocal
        : null,
    scheduledDayOffset:
      typeof record.scheduledDayOffset === "number"
        ? record.scheduledDayOffset
        : null,
  };
}

function prepareDraftPlacementEntry(
  entry: DraftPlacementEntry,
): PreparedPlacementEntry | null {
  const { instance } = entry;
  if (typeof instance.start_utc !== "string") return null;
  if (typeof instance.end_utc !== "string") return null;

  const start = toLocal(instance.start_utc);
  const end = toLocal(instance.end_utc);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const durationMin = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 60000),
  );

  const availableStartLocalDate = entry.availableStartLocal
    ? new Date(entry.availableStartLocal)
    : null;
  const windowStartLocalDate = entry.windowStartLocal
    ? new Date(entry.windowStartLocal)
    : null;

  const validAvailable =
    availableStartLocalDate &&
    !Number.isNaN(availableStartLocalDate.getTime())
      ? availableStartLocalDate
      : null;
  const validWindowStart =
    windowStartLocalDate && !Number.isNaN(windowStartLocalDate.getTime())
      ? windowStartLocalDate
      : null;

  return {
    ...entry,
    start,
    end,
    durationMin,
    availableStartLocalDate: validAvailable,
    windowStartLocalDate: validWindowStart,
  };
}

function formatDecisionLabel(decision: DraftPlacementEntry["decision"]): string {
  switch (decision) {
    case "kept":
      return "Kept from previous run";
    case "rescheduled":
      return "Rescheduled";
    case "new":
    default:
      return "New placement";
  }
}

function describePlacementReason({
  decision,
  project,
  window,
  instance,
  start,
  availableStartLocal,
  windowStartLocal,
}: {
  decision: DraftPlacementEntry["decision"];
  project?: ProjectItem;
  window?: WindowLite;
  instance: ScheduleInstance;
  start: Date;
  availableStartLocal: Date | null;
  windowStartLocal: Date | null;
}): string {
  const projectName = project?.name?.trim()
    ? project.name
    : instance.source_id
      ? `Project ${instance.source_id}`
      : "This project";
  const windowName = window?.label?.trim()
    ? window.label
    : instance.window_id
      ? `window ${instance.window_id}`
      : "an available window";
  const formatEnergy = (value?: string | null) => {
    if (!value) return null;
    const text = value.toString().trim();
    return text ? text.toUpperCase() : null;
  };
  const projectEnergy = formatEnergy(project?.energy ?? instance.energy_resolved);
  const windowEnergy = formatEnergy(window?.energy);

  const parts: string[] = [];
  const startLabel = formatDateTime(start);

  switch (decision) {
    case "kept":
      parts.push(
        `${projectName} was already scheduled in ${windowName} starting ${startLabel}, so the scheduler kept the placement unchanged.`,
      );
      break;
    case "rescheduled":
      parts.push(
        `${projectName} was rescheduled into ${windowName} starting ${startLabel} to reuse its existing slot as early as possible.`,
      );
      break;
    case "new":
      parts.push(
        `${projectName} was scheduled into ${windowName} starting ${startLabel}, the earliest opening the scheduler could find.`,
      );
      break;
  }

  if (windowEnergy && projectEnergy) {
    if (windowEnergy === projectEnergy) {
      parts.push(`Both the project and window align at ${windowEnergy} energy.`);
    } else {
      parts.push(
        `The project targets ${projectEnergy} energy while the window provides ${windowEnergy}, which satisfies the requirement.`,
      );
    }
  } else if (projectEnergy) {
    parts.push(`The project targets ${projectEnergy} energy.`);
  } else if (windowEnergy) {
    parts.push(`The window supplies ${windowEnergy} energy.`);
  }

  const validAvailable =
    availableStartLocal instanceof Date && !Number.isNaN(availableStartLocal.getTime());
  const validWindowStart =
    windowStartLocal instanceof Date && !Number.isNaN(windowStartLocal.getTime());

  if (decision !== "kept" && validAvailable && validWindowStart) {
    const diffMinutes = Math.max(
      0,
      Math.round(
        (availableStartLocal.getTime() - windowStartLocal.getTime()) / 60000,
      ),
    );
    if (diffMinutes > 0) {
      parts.push(
        `Earlier slots in the window were occupied, so the project begins ${formatDurationMinutes(diffMinutes)} after the window opened.`,
      );
    } else {
      parts.push(`The window was open immediately, so the project starts right at the window's beginning.`);
    }
  }

  return parts.join(" ");
}

function describeFailure(
  failure: SchedulerFailure,
  project?: ProjectItem,
): { message: string; detail?: string | null } {
  const projectName = project?.name?.trim()
    ? project.name
    : `Project ${failure.itemId}`;
  const detail = formatFailureDetail(failure.detail);
  switch (failure.reason) {
    case "NO_WINDOW":
      return {
        message: `${projectName} could not be placed in an available window within the scheduling horizon.`,
        detail,
      };
    case "error":
      return {
        message: `${projectName} encountered an error while scheduling.`,
        detail,
      };
    default:
      return {
        message: `${projectName} was not scheduled (${failure.reason}).`,
        detail,
      };
  }
}

function buildGapMessage({
  previous,
  next,
  failureSummary,
}: {
  previous: PlacementView;
  next: PlacementView;
  failureSummary: string | null;
}): string {
  const base = `No project scheduled from ${formatDateTime(previous.end)} to ${formatDateTime(next.start)}.`;
  const windowNote = next.window
    ? ` Next available window "${next.window.label}" begins at ${formatDateTime(next.start)}.`
    : ` Next scheduled project "${next.project?.name ?? next.instance.source_id ?? "project"}" begins at ${formatDateTime(next.start)}.`;
  const failureNote = failureSummary
    ? ` Scheduler also reported: ${failureSummary}`
    : "";
  return `${base}${windowNote}${failureNote}`;
}

function formatDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (parts.length === 0) return "0m";
  return parts.join(" ");
}

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatFailureDetail(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (detail instanceof Error) return detail.message;
  if (typeof detail === "object") {
    const maybeMessage = (detail as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
}
