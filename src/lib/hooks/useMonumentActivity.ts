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
};

export type MonumentActivityEventType = "note" | "goal" | "xp";

export interface MonumentActivityEvent {
  id: string;
  type: MonumentActivityEventType;
  title: string;
  detail: string | null;
  timestamp: string;
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

function truncate(value: string, limit = 140) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

export function useMonumentActivity(monumentId: string) {
  const [{ events, summary, loading, error }, setState] = useState<UseMonumentActivityState>(
    {
      events: [],
      summary: DEFAULT_SUMMARY,
      loading: true,
      error: null,
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
      });
      return;
    }

    if (!supabase) {
      setState({
        events: [],
        summary: DEFAULT_SUMMARY,
        loading: false,
        error: "Supabase client not available",
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
          .select("id,created_at,amount,kind,source")
          .eq("user_id", userId)
          .eq("monument_id", monumentId)
          .order("created_at", { ascending: false })
          .limit(30),
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
      const xpEvents = (xpRes.data ?? []) as XpEventRow[];
      const goals = (goalsRes.data ?? []) as GoalRow[];

      const events: MonumentActivityEvent[] = [];

      for (const note of notes) {
        const timestamp = note.updated_at ?? note.created_at;
        if (!timestamp) continue;
        const title = note.title?.trim() || "Note captured";
        const content = note.content?.trim();
        events.push({
          id: `note-${note.id}`,
          type: "note",
          title,
          detail: content ? truncate(content) : null,
          timestamp,
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
        });
      }

      const sortedEvents = events.sort((a, b) =>
        b.timestamp.localeCompare(a.timestamp)
      );

      const totalXp = xpEvents.reduce((sum, xp) => sum + (xp.amount ?? 0), 0);
      const totalGoals = goalsRes.count ?? goals.length;
      const completedGoals = goals.filter(isGoalCompleted).length;
      const notesLogged = notes.length;

      const chargePercent = totalGoals > 0
        ? Math.round((completedGoals / totalGoals) * 100)
        : Math.min(Math.round((totalXp / 200) * 100), 100);

      const summary: MonumentActivitySummary = {
        chargePercent,
        totalXp,
        xpEvents: xpEvents.length,
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
    refresh: loadActivity,
  };
}

export type UseMonumentActivityResult = ReturnType<typeof useMonumentActivity>;
