"use client"

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchReadyTasks,
  fetchWindowsForDate,
  type WindowLite,
} from "@/lib/scheduler/repo";
import { placeByEnergyWeight } from "@/lib/scheduler/placer";
import { TaskLite, taskWeight } from "@/lib/scheduler/weight";
import { MOCK_TASKS, MOCK_WINDOWS } from "@/lib/scheduler/mock";

function fmt(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DraftSchedulerPage() {
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [windows, setWindows] = useState<WindowLite[]>([]);
  const [placements, setPlacements] = useState<
    ReturnType<typeof placeByEnergyWeight>["placements"]
  >([]);
  const [unplaced, setUnplaced] = useState<
    ReturnType<typeof placeByEnergyWeight>["unplaced"]
  >([]);
  const [debug, setDebug] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const windowsByEnergy = useMemo(() => {
    const map: Record<string, WindowLite[]> = {};
    for (const w of windows) {
      if (!map[w.energy]) map[w.energy] = [];
      map[w.energy].push(w);
    }
    return map;
  }, [windows]);

  const windowMap = useMemo(() => {
    const map: Record<string, WindowLite> = {};
    for (const w of windows) map[w.id] = w;
    return map;
  }, [windows]);

  const taskMap = useMemo(() => {
    const map: Record<string, TaskLite> = {};
    for (const t of tasks) map[t.id] = t;
    return map;
  }, [tasks]);

  function handleLoadMock() {
    setWindows(MOCK_WINDOWS);
    setTasks(MOCK_TASKS);
    setPlacements([]);
    setUnplaced([]);
    setError(null);
  }

  async function handleLoad() {
    try {
      const weekday = new Date().getDay();
      const [ws, ts] = await Promise.all([
        fetchWindowsForDate(weekday),
        fetchReadyTasks(),
      ]);
      setWindows(ws);
      setTasks(ts);
      setPlacements([]);
      setUnplaced([]);
      setError(null);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setWindows([]);
      setTasks([]);
      setPlacements([]);
      setUnplaced([]);
    }
  }

  function handleAutoPlace() {
    const date = new Date();
    const result = placeByEnergyWeight(tasks, windows, date);
    setPlacements(result.placements);
    setUnplaced(result.unplaced);
  }

  return (
    <div className="space-y-6 p-4 text-zinc-100">
      <div className="flex gap-2">
        <Button
          className="flex-1 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          onClick={handleLoad}
        >
          Load Data
        </Button>
        <Button
          className="flex-1 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          onClick={handleLoadMock}
        >
          Load Mock
        </Button>
        <Button
          className="flex-1 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          onClick={handleAutoPlace}
          disabled={!tasks.length || !windows.length}
        >
          Auto-place
        </Button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {windows.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Windows</h2>
          {Object.entries(windowsByEnergy).map(([energy, list]) => (
            <div key={energy} className="mb-4">
              <div className="mb-1 text-sm font-medium">{energy}</div>
              <ul className="ml-4 list-disc text-xs text-zinc-400">
                {list.map((w) => (
                  <li key={w.id}>
                    {w.label} {w.start_local}–{w.end_local}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {tasks.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Tasks</h2>
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
                <div className="flex justify-between text-sm">
                  <span>{t.name}</span>
                  <div className="flex gap-1">
                    {t.energy && (
                      <Badge variant="outline" className="text-[10px]">
                        {t.energy}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {taskWeight(t)}
                    </Badge>
                  </div>
                </div>
                <div className="text-xs text-zinc-400">
                  {t.priority} / {t.stage} • {t.duration_min}m
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {placements.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Placements</h2>
          <ul className="space-y-2">
            {placements.map((p) => {
              const w = windowMap[p.windowId];
              return (
                <li
                  key={p.taskId}
                  className="rounded-md border border-zinc-800 bg-zinc-900 p-2"
                >
                  <div className="flex justify-between text-sm">
                    <span>{taskMap[p.taskId]?.name ?? p.taskId}</span>
                    <div className="flex gap-1">
                      {w && (
                        <Badge variant="outline" className="text-[10px]">
                          {w.energy}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {p.weight}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {w ? w.label : p.windowId} {fmt(p.start)}–{fmt(p.end)}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {unplaced.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Unplaced</h2>
          <ul className="space-y-2">
            {unplaced.map((u) => {
              const t = taskMap[u.taskId];
              return (
                <li
                  key={u.taskId}
                  className="rounded-md border border-zinc-800 bg-zinc-900 p-2"
                >
                  <div className="flex justify-between text-sm">
                    <span>{t ? t.name : u.taskId}</span>
                    <div className="flex gap-1">
                      {t?.energy && (
                        <Badge variant="outline" className="text-[10px]">
                          {t.energy}
                        </Badge>
                      )}
                      {t && (
                        <Badge variant="outline" className="text-[10px]">
                          {taskWeight(t)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400">{u.reason}</div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div>
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-300"
          onClick={() => setDebug((d) => !d)}
        >
          {debug ? "Hide" : "Show"} Debug
        </Button>
        {debug && (
          <pre className="mt-2 max-h-60 overflow-auto rounded bg-zinc-900 p-2 text-[10px]">
            {JSON.stringify({ tasks, windows, placements, unplaced }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

