"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CheckCircle2, StickyNote, Zap, Flag } from "lucide-react";
import confetti from "canvas-confetti";

interface ActivityEvent {
  id: string;
  type: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface ActivityPanelProps {
  monumentId: string;
}

export function ActivityPanel({ monumentId }: ActivityPanelProps) {
  const supabase = getSupabaseBrowser();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("monument_activity")
        .select("id,type,details,created_at")
        .eq("monument_id", monumentId)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        if (error) {
          console.error("Failed to load activity", error);
          setEvents([]);
        } else {
          setEvents(data ?? []);
        }
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, monumentId]);

  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  const fired = useRef(new Set<string>());

  function renderIcon(type: string) {
    switch (type) {
      case "milestone_done":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "goal_progress":
        return <Flag className="h-4 w-4 text-blue-500" />;
      case "note_added":
        return <StickyNote className="h-4 w-4 text-yellow-500" />;
      case "charge_update":
        return <Zap className="h-4 w-4 text-purple-500" />;
      default:
        return null;
    }
  }

  function summary(e: ActivityEvent) {
    switch (e.type) {
      case "milestone_done":
        return "Milestone completed";
      case "goal_progress":
        return "Goal progressed";
      case "note_added":
        return "Note added";
      case "charge_update":
        return `Charge updated to ${e.details?.charge ?? 0}`;
      default:
        return e.type;
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!events.length) {
    return <p className="text-sm text-muted-foreground">No activity yet</p>;
  }

  return (
    <div ref={parentRef} className="h-64 overflow-auto">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const event = events[virtualRow.index];
          if (
            event.type === "milestone_done" &&
            !fired.current.has(event.id)
          ) {
            fired.current.add(event.id);
            confetti({ particleCount: 20, spread: 20, origin: { y: 0.2 } });
          }
          return (
            <div
              key={event.id}
              className="flex items-center gap-2 px-2 py-1 absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {renderIcon(event.type)}
              <div className="flex-1 text-sm">{summary(event)}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(event.created_at).toLocaleTimeString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ActivityPanel;
