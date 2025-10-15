"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getSupabaseBrowser } from "@/lib/supabase";

type NoteRow = {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type GoalRow = {
  id: string;
  name: string | null;
  status: string | null;
  active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type XpEventRow = {
  id: string;
  created_at: string | null;
  amount: number | null;
  kind: string | null;
  source: string | null;
  schedule_instance_id: string | null;
};

function removeCancellingScheduleXpEvents(events: XpEventRow[]): XpEventRow[] {
  if (events.length === 0) return events;

  const scheduleAggregates = new Map<string, { sum: number; indexes: number[] }>();

  events.forEach((event, index) => {
    const scheduleId = event.schedule_instance_id;
    if (!scheduleId) return;

    const amount = typeof event.amount === "number" ? event.amount : 0;
    const aggregate = scheduleAggregates.get(scheduleId);

    if (aggregate) {
      aggregate.sum += amount;
      aggregate.indexes.push(index);
    } else {
      scheduleAggregates.set(scheduleId, {
        sum: amount,
        indexes: [index],
      });
    }
  });

  if (scheduleAggregates.size === 0) return events;

  const cancelledIndexes = new Set<number>();

  for (const aggregate of scheduleAggregates.values()) {
    if (aggregate.indexes.length < 2) continue;
    if (aggregate.sum === 0) {
      for (const index of aggregate.indexes) {
        cancelledIndexes.add(index);
      }
    }
  }

  if (cancelledIndexes.size === 0) return events;

  return events.filter((_, index) => !cancelledIndexes.has(index));
}

const XP_KIND_WEIGHTS: Record<"task" | "habit" | "project" | "goal", number> = {
  task: 1,
  habit: 1,
  project: 3,
  goal: 5,
};

export type MonumentActivityEventType = "note" | "goal" | "xp";

export interface MonumentActivityEvent {
  id: string;
  type: MonumentActivityEventType;
  title: string;
  detail: string | null;
  timestamp: string;
  attribution: string | null;
  noteId?: string;
}

export interface MonumentActivitySummary {
  chargePercent: number;
  totalXp: number;
  xpEvents: number;
  notesLogged: number;
  totalGoals: number;
  completedGoals: number;
  lastUpdated: string | null;
}

interface UseMonumentActivityState {
  events: MonumentActivityEvent[];
  summary: MonumentActivitySummary;
  loading: boolean;
  error: string | null;
  notes: MonumentActivityNote[];
}

const DEFAULT_SUMMARY: MonumentActivitySummary = {
  chargePercent: 0,
  totalXp: 0,
  xpEvents: 0,
  notesLogged: 0,
  totalGoals: 0,
  completedGoals: 0,
  lastUpdated: null,
};

function isGoalCompleted(goal: GoalRow) {
  const status = goal.status?.toLowerCase().trim();
  if (status) {
    if (status.includes("complete")) return true;
    if (status === "done" || status.includes("done")) return true;
  }
  if (goal.active === false) {
    // Treat inactive goals without a status as finished checkpoints
    return true;
  }
  return false;
}

export interface MonumentActivityNote {
  id: string;
  title: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
}

function truncate(value: string, limit = 140) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

export function useMonumentActivity(monumentId: string) {
  const [{ events, summary, loading, error, notes }, setState] =
    useState<UseMonumentActivityState>(
      {
        events: [],
        summary: DEFAULT_SUMMARY,
        loading: true,
        error: null,
        notes: [],
      }
    );

  const supabase = useMemo(() => getSupabaseBrowser(), []);

  const loadActivity = useCallback(async () => {
    if (!monumentId) {
      setState({
        events: [],
        summary: DEFAULT_SUMMARY,
        loading: false,
        error: "Missing monument identifier",
        notes: [],
      });
      return;
    }

    if (!supabase) {
      setState({
        events: [],
        summary: DEFAULT_SUMMARY,
        loading: false,
        error: "Supabase client not available",
        notes: [],
      });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      await supabase.auth.getSession();
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) {
        throw new Error("User not authenticated");
      }

      const [notesRes, xpRes, goalsRes] = await Promise.all([
        supabase
          .from("notes")
          .select("id,title,content,created_at,updated_at", { count: "exact" })
          .eq("user_id", userId)
          .eq("monument_id", monumentId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("xp_events")
          .select("id,created_at,amount,kind,source,schedule_instance_id")
          .eq("user_id", userId)
          .eq("monument_id", monumentId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("goals")
          .select("id,name,status,active,created_at,updated_at", { count: "exact" })
          .eq("user_id", userId)
          .eq("monument_id", monumentId)
          .order("updated_at", { ascending: false })
          .limit(60),
      ]);

      const noteError = notesRes.error;
      const xpError = xpRes.error;
      const goalError = goalsRes.error;

      if (noteError || xpError || goalError) {
        const firstError = noteError ?? xpError ?? goalError;
        throw firstError;
      }

      const notes = (notesRes.data ?? []) as NoteRow[];
      const xpEvents = removeCancellingScheduleXpEvents(
        (xpRes.data ?? []) as XpEventRow[]
      );
      const goals = (goalsRes.data ?? []) as GoalRow[];

      const events: MonumentActivityEvent[] = [];
      const activityNotes: MonumentActivityNote[] = [];

      const actorName =
        authData.user?.user_metadata?.full_name?.toString().trim() ||
        authData.user?.user_metadata?.name?.toString().trim() ||
        authData.user?.email ||
        null;

      for (const note of notes) {
        const timestamp = note.updated_at ?? note.created_at;
        if (!timestamp) continue;
        const title = note.title?.trim() || "Note captured";
        const content = note.content?.trim();
        activityNotes.push({
          id: note.id,
          title,
          content: content ?? null,
          createdAt: note.created_at ?? timestamp,
          updatedAt: note.updated_at ?? note.created_at ?? timestamp,
        });
        events.push({
          id: `note-${note.id}`,
          type: "note",
          title,
          detail: content ? truncate(content) : null,
          timestamp,
          attribution: actorName,
          noteId: note.id,
        });
      }

      for (const goal of goals) {
        if (!isGoalCompleted(goal)) continue;
        const timestamp = goal.updated_at ?? goal.created_at;
        if (!timestamp) continue;
        const title = goal.name?.trim() || "Goal completed";
        events.push({
          id: `goal-${goal.id}`,
          type: "goal",
          title: `Goal completed: ${title}`,
          detail: null,
          timestamp,
          attribution: actorName,
        });
      }

      for (const xp of xpEvents) {
        const timestamp = xp.created_at;
        if (!timestamp) continue;
        const amount = xp.amount ?? 0;
        const kind = xp.kind?.toString() ?? "activity";
        const source = xp.source?.trim();
        events.push({
          id: `xp-${xp.id}`,
          type: "xp",
          title: amount
            ? `Gained ${amount} XP`
            : `Logged XP from ${kind}`,
          detail: source ? truncate(source, 100) : kind ? `Source: ${kind}` : null,
          timestamp,
          attribution: actorName,
        });
      }

      const sortedEvents = events.sort((a, b) =>
        b.timestamp.localeCompare(a.timestamp)
      );

      const windowStart = new Date();
      windowStart.setMonth(windowStart.getMonth() - 1);
      const windowStartMs = windowStart.getTime();

      const chargeEligibleXp = xpEvents.filter((xp) => {
        if (!xp.schedule_instance_id) return false;
        if (!xp.created_at) return false;
        const createdTime = Date.parse(xp.created_at);
        if (Number.isNaN(createdTime)) return false;
        if (createdTime < windowStartMs) return false;
        const kind = xp.kind?.toLowerCase().trim();
        if (!kind) return false;
        return kind === "task" || kind === "habit" || kind === "project" || kind === "goal";
      });

      const totalXp = chargeEligibleXp.reduce((sum, xp) => {
        const kind = xp.kind?.toLowerCase().trim();
        const defaultAmount =
          kind && kind in XP_KIND_WEIGHTS
            ? XP_KIND_WEIGHTS[kind as keyof typeof XP_KIND_WEIGHTS]
            : 0;
        const amount = xp.amount ?? defaultAmount;
        return sum + (amount > 0 ? amount : defaultAmount);
      }, 0);
      const totalGoals = goalsRes.count ?? goals.length;
      const completedGoals = goals.filter(isGoalCompleted).length;
      const notesLogged = notes.length;

      const chargePercent = Math.min(Math.round(totalXp), 100);

      const summary: MonumentActivitySummary = {
        chargePercent,
        totalXp,
        xpEvents: chargeEligibleXp.length,
        notesLogged,
        totalGoals,
        completedGoals,
        lastUpdated: sortedEvents[0]?.timestamp ?? null,
      };

      setState({
        events: sortedEvents.slice(0, 40),
        summary,
        loading: false,
        error: null,
        notes: activityNotes,
      });
    } catch (err) {
      console.error("Failed to load monument activity", {
        error: err,
        monumentId,
      });
      setState({
        events: [],
        summary: DEFAULT_SUMMARY,
        loading: false,
        error:
          err instanceof Error ? err.message : "Failed to load monument activity",
        notes: [],
      });
    }
  }, [monumentId, supabase]);

  useEffect(() => {
    let ignore = false;
    if (ignore) return;
    void loadActivity();
    return () => {
      ignore = true;
    };
  }, [loadActivity]);

  return {
    events,
    summary,
    loading,
    error,
    notes,
    refresh: loadActivity,
  };
}

export type UseMonumentActivityResult = ReturnType<typeof useMonumentActivity>;
