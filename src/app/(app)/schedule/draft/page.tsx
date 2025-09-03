"use client"

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchReadyTasks,
  fetchWindowsForDate,
  fetchProjectsMap,
  type WindowLite,
} from "@/lib/scheduler/repo";
import { placeByEnergyWeight } from "@/lib/scheduler/placer";
import { ENERGY } from "@/lib/scheduler/config";
import {
  TaskLite,
  ProjectLite,
  taskWeight,
  projectWeight,
} from "@/lib/scheduler/weight";
import { MOCK_TASKS, MOCK_WINDOWS, MOCK_PROJECTS } from "@/lib/scheduler/mock";

function fmt(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DraftSchedulerPage() {
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [windows, setWindows] = useState<WindowLite[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [mode, setMode] = useState<"TASK" | "PROJECT">("TASK");
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

  const weightedTasks = useMemo(
    () => tasks.map((t) => ({ ...t, weight: taskWeight(t) })),
    [tasks]
  );

  const projectItems = useMemo(() => {
    const items: (
      ProjectLite & {
        duration_min: number;
        energy: string | null;
        weight: number;
      }
    )[] = [];
    for (const p of projects) {
      const related = tasks.filter((t) => t.project_id === p.id);
      if (related.length === 0) continue;
      const duration_min = related.reduce(
        (sum, t) => sum + t.duration_min,
        0
      );
      const energy = related.reduce<string | null>((acc, t) => {
        if (!t.energy) return acc;
        if (!acc) return t.energy;
        return ENERGY.LIST.indexOf(t.energy) > ENERGY.LIST.indexOf(acc)
          ? t.energy
          : acc;
      }, null);
      const relatedWeightSum = related.reduce(
        (sum, t) => sum + taskWeight(t),
        0
      );
      const weight = projectWeight(p, relatedWeightSum);
      items.push({ ...p, duration_min, energy, weight });
    }
    return items.sort((a, b) => b.weight - a.weight);
  }, [projects, tasks]);

  const taskMap = useMemo(() => {
    const map: Record<string, typeof weightedTasks[number]> = {};
    for (const t of weightedTasks) map[t.id] = t;
    return map;
  }, [weightedTasks]);

  const projectMap = useMemo(() => {
    const map: Record<string, typeof projectItems[number]> = {};
    for (const p of projectItems) map[p.id] = p;
    return map;
  }, [projectItems]);

  const getItem = (id: string) => taskMap[id] ?? projectMap[id];

  function handleLoadMock() {
    setWindows(MOCK_WINDOWS);
    setTasks(MOCK_TASKS);
    setProjects(MOCK_PROJECTS);
    setPlacements([]);
    setUnplaced([]);
    setError(null);
  }

  async function handleLoad() {
    try {
      const weekday = new Date().getDay();
      const [ws, ts, pm] = await Promise.all([
        fetchWindowsForDate(weekday),
        fetchReadyTasks(),
        fetchProjectsMap(),
      ]);
      setWindows(ws);
      setTasks(ts);
      setProjects(Object.values(pm));
      setPlacements([]);
      setUnplaced([]);
      setError(null);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setWindows([]);
      setTasks([]);
      setProjects([]);
      setPlacements([]);
      setUnplaced([]);
    }
  }

  function handleAutoPlace() {
    const date = new Date();
    const items = mode === "PROJECT" ? projectItems : weightedTasks;
    const result = placeByEnergyWeight(items, windows, date);
    setPlacements(result.placements);
    setUnplaced(result.unplaced);
  }

  return (
    <div className="space-y-6 p-4 text-zinc-100">
      <div className="flex gap-2">
        <Button
          className={`flex-1 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 ${
            mode === "TASK" ? "bg-zinc-700" : ""
          }`}
          onClick={() => setMode("TASK")}
        >
          Task Planning
        </Button>
        <Button
          className={`flex-1 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 ${
            mode === "PROJECT" ? "bg-zinc-700" : ""
          }`}
          onClick={() => setMode("PROJECT")}
        >
          Project Planning
        </Button>
      </div>

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
          disabled={
            !windows.length ||
            (mode === "PROJECT"
              ? projectItems.length === 0
              : weightedTasks.length === 0)
          }
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

      {mode === "TASK" && weightedTasks.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Tasks</h2>
          <ul className="space-y-2">
            {weightedTasks.map((t) => (
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
                      {t.weight}
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

      {mode === "PROJECT" && projectItems.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Projects</h2>
          <ul className="space-y-2">
            {projectItems.map((p) => (
              <li
                key={p.id}
                className="rounded-md border border-zinc-800 bg-zinc-900 p-2"
              >
                <div className="flex justify-between text-sm">
                  <span>{p.name ?? p.id}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {p.weight.toFixed(2)}
                  </Badge>
                </div>
                <div className="text-xs text-zinc-400">
                  {p.priority} / {p.stage} • {p.duration_min}m
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
              const item = getItem(p.taskId);
              return (
                <li
                  key={p.taskId}
                  className="rounded-md border border-zinc-800 bg-zinc-900 p-2"
                >
                  <div className="flex justify-between text-sm">
                    <span>{item?.name ?? p.taskId}</span>
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
              const item = getItem(u.taskId);
              return (
                <li
                  key={u.taskId}
                  className="rounded-md border border-zinc-800 bg-zinc-900 p-2"
                >
                  <div className="flex justify-between text-sm">
                    <span>{item ? item.name : u.taskId}</span>
                    <div className="flex gap-1">
                      {item?.energy && (
                        <Badge variant="outline" className="text-[10px]">
                          {item.energy}
                        </Badge>
                      )}
                      {item && (
                        <Badge variant="outline" className="text-[10px]">
                          {item.weight}
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
            {JSON.stringify({ tasks, projects, windows, placements, unplaced, mode }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

