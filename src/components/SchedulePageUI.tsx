// Usage: Import and render <SchedulePage /> inside your /schedule page. Replace mockWindows and mockTasks with real data later.
import React, { useEffect, useMemo, useRef, useState } from "react";

const SLOT_MINUTES = 5;
const SLOT_HEIGHT = 20; // px height per 5-min slot

// ---- Types ----
interface Task {
  id: string;
  title: string;
  duration: number; // minutes
  energy: "Low" | "Med" | "High";
  priority: "P1" | "P2" | "P3";
  project: string;
  start?: number; // minutes from midnight
  windowId?: string;
}

interface WindowBlock {
  id: string;
  name: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  startMin: number; // derived
  endMin: number; // derived
}

// ---- Mock Data ----
const mockWindows: WindowBlock[] = [
  { id: "morning", name: "MORNING ROUTINE", start: "06:30", end: "08:30", startMin: 0, endMin: 0 },
  { id: "work1", name: "WORK 1", start: "09:00", end: "12:00", startMin: 0, endMin: 0 },
  { id: "work2", name: "WORK 2", start: "13:00", end: "17:00", startMin: 0, endMin: 0 },
  { id: "evening", name: "EVENING SPRINT", start: "19:00", end: "22:00", startMin: 0, endMin: 0 },
];

const mockTasks: Task[] = [
  { id: "t1", title: "Check emails", duration: 15, energy: "Low", priority: "P3", project: "Admin" },
  { id: "t2", title: "Design mockups", duration: 45, energy: "High", priority: "P1", project: "Design" },
  { id: "t3", title: "Team standup", duration: 30, energy: "Med", priority: "P2", project: "Meetings" },
  { id: "t4", title: "Code review", duration: 60, energy: "High", priority: "P1", project: "Dev" },
  { id: "t5", title: "Write specs", duration: 90, energy: "Med", priority: "P2", project: "Docs" },
  { id: "t6", title: "Workout", duration: 45, energy: "High", priority: "P1", project: "Health" },
  { id: "t7", title: "Plan sprint", duration: 30, energy: "Low", priority: "P2", project: "Planning" },
  { id: "t8", title: "Research", duration: 25, energy: "Low", priority: "P3", project: "Learning" },
  { id: "t9", title: "Fix bugs", duration: 60, energy: "High", priority: "P1", project: "Dev" },
  { id: "t10", title: "Read book", duration: 30, energy: "Low", priority: "P3", project: "Personal" },
  { id: "t11", title: "Call client", duration: 20, energy: "Med", priority: "P2", project: "Meetings" },
  { id: "t12", title: "Brainstorm", duration: 45, energy: "High", priority: "P1", project: "Ideation" },
];

// ---- Utils ----
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function snapTo5(min: number): number {
  return Math.round(min / SLOT_MINUTES) * SLOT_MINUTES;
}

function getNowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function hasConflict(
  tasks: Task[],
  windowId: string,
  start: number,
  duration: number,
  ignoreId?: string,
): boolean {
  const end = start + duration;
  return tasks.some((t) => {
    if (t.windowId !== windowId || t.start === undefined || t.id === ignoreId) return false;
    const tEnd = t.start + t.duration;
    return start < tEnd && end > t.start;
  });
}

function matchesFilters(task: Task, filters: Filters): boolean {
  if (filters.energy && task.energy !== filters.energy) return false;
  if (filters.priority && task.priority !== filters.priority) return false;
  if (filters.project && task.project !== filters.project) return false;
  return true;
}

// ---- Filters ----
interface Filters {
  energy?: "Low" | "Med" | "High";
  priority?: "P1" | "P2" | "P3";
  project?: string;
}

// ---- Main Component ----
export default function SchedulePage() {
  const [windows] = useState<WindowBlock[]>(() =>
    mockWindows.map((w) => ({
      ...w,
      startMin: timeToMinutes(w.start),
      endMin: timeToMinutes(w.end),
    })),
  );
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [picked, setPicked] = useState<Task | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [view, setView] = useState<"day" | "compact">("day");
  const [date, setDate] = useState<string>(() => new Date().toISOString().substring(0, 10));
  const [showInbox, setShowInbox] = useState(false);
  const [search, setSearch] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const [conflictWindow, setConflictWindow] = useState<string | null>(null);
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes());

  useEffect(() => {
    const id = setInterval(() => setNowMinutes(getNowMinutes()), 60000);
    return () => clearInterval(id);
  }, []);

  const inboxTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.start === undefined && matchesFilters(t, filters) && t.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [tasks, filters, search],
  );

  const toggleFilter = (k: keyof Filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: f[k] === v ? undefined : (v as any) }));
  };

  const placeTask = (windowId: string, start: number) => {
    if (!picked) return;
    if (hasConflict(tasks, windowId, start, picked.duration, picked.id)) {
      setConflict("Slot already occupied");
      setConflictWindow(windowId);
      return;
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === picked.id ? { ...t, start, windowId } : t,
      ),
    );
    setPicked(null);
  };

  const moveTask = (task: Task, delta: number) => {
    const newStart = task.start !== undefined ? snapTo5(task.start + delta) : undefined;
    if (newStart === undefined) return;
    const win = windows.find((w) => w.id === task.windowId);
    if (!win) return;
    if (newStart < win.startMin || newStart + task.duration > win.endMin) return;
    if (hasConflict(tasks, win.id, newStart, task.duration, task.id)) {
      setConflict("Slot already occupied");
      setConflictWindow(win.id);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, start: newStart } : t)));
  };

  return (
    <div className="min-h-screen bg-[#1E1E1E] text-[#E0E0E0]">
      <ScheduleHeader
        date={date}
        onDateChange={setDate}
        onToday={() => setDate(new Date().toISOString().substring(0, 10))}
        filters={filters}
        toggleFilter={toggleFilter}
        view={view}
        setView={setView}
        onInbox={() => setShowInbox(true)}
      />

      <div className="space-y-4 p-4">
        {windows.map((w) => {
          const wTasks = tasks.filter((t) => t.windowId === w.id);
          return (
            <WindowCard
              key={w.id}
              window={w}
              tasks={wTasks}
              picked={picked}
              filters={filters}
              onPlace={(start) => placeTask(w.id, start)}
              onPick={setPicked}
              view={view}
              conflict={conflictWindow === w.id ? conflict : null}
              clearConflict={() => setConflict(null)}
              nowMinutes={nowMinutes}
              onMove={moveTask}
            />
          );
        })}
      </div>

      <InboxDrawer
        open={showInbox}
        onClose={() => setShowInbox(false)}
        tasks={inboxTasks}
        onPick={(t) => {
          setPicked(t);
          setShowInbox(false);
        }}
        search={search}
        setSearch={setSearch}
        filters={filters}
        toggleFilter={toggleFilter}
      />

      {conflict && <ConflictToast message={conflict} onClose={() => setConflict(null)} />}
    </div>
  );
}

// ---- Components ----
interface ScheduleHeaderProps {
  date: string;
  onDateChange: (v: string) => void;
  onToday: () => void;
  filters: Filters;
  toggleFilter: (k: keyof Filters, v: string) => void;
  view: "day" | "compact";
  setView: (v: "day" | "compact") => void;
  onInbox: () => void;
}

function ScheduleHeader({
  date,
  onDateChange,
  onToday,
  filters,
  toggleFilter,
  view,
  setView,
  onInbox,
}: ScheduleHeaderProps) {
  const energies: Array<NonNullable<Filters["energy"]>> = ["Low", "Med", "High"];
  const priorities: Array<NonNullable<Filters["priority"]>> = ["P1", "P2", "P3"];
  const projects = ["Admin", "Design", "Meetings", "Dev", "Docs", "Health", "Planning", "Learning", "Personal", "Ideation"];
  return (
    <header className="sticky top-0 z-10 bg-[#1E1E1E] p-4 space-y-2 border-b border-[#3C3C3C]">
      <div className="flex items-center space-x-2">
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="bg-[#2B2B2B] text-[#E0E0E0] px-2 py-1 rounded"
        />
        <button
          onClick={onToday}
          className="px-2 py-1 rounded bg-[#2B2B2B] hover:bg-[#353535]"
        >
          Today
        </button>
        <button
          onClick={onInbox}
          className="ml-auto px-2 py-1 rounded bg-[#2B2B2B] hover:bg-[#353535]"
        >
          Inbox
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {energies.map((e) => (
          <FilterChip
            key={e}
            label={e}
            active={filters.energy === e}
            onClick={() => toggleFilter("energy", e)}
          />
        ))}
        {priorities.map((p) => (
          <FilterChip
            key={p}
            label={p}
            active={filters.priority === p}
            onClick={() => toggleFilter("priority", p)}
          />
        ))}
        {projects.map((p) => (
          <FilterChip
            key={p}
            label={p}
            active={filters.project === p}
            onClick={() => toggleFilter("project", p)}
          />
        ))}
        <div className="ml-auto flex space-x-1">
          <button
            onClick={() => setView("day")}
            className={`px-2 py-1 rounded ${view === "day" ? "bg-[#353535]" : "bg-[#2B2B2B]"}`}
          >
            Day
          </button>
          <button
            onClick={() => setView("compact")}
            className={`px-2 py-1 rounded ${view === "compact" ? "bg-[#353535]" : "bg-[#2B2B2B]"}`}
          >
            Compact
          </button>
        </div>
      </div>
    </header>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-full text-xs border ${active ? "bg-[#353535]" : "bg-[#2B2B2B]"} border-[#3C3C3C]`}
    >
      {label}
    </button>
  );
}

interface WindowCardProps {
  window: WindowBlock;
  tasks: Task[];
  picked: Task | null;
  filters: Filters;
  onPlace: (start: number) => void;
  onPick: (t: Task | null) => void;
  view: "day" | "compact";
  conflict: string | null;
  clearConflict: () => void;
  nowMinutes: number;
  onMove: (t: Task, delta: number) => void;
}

function WindowCard({
  window,
  tasks,
  picked,
  filters,
  onPlace,
  onPick,
  view,
  conflict,
  clearConflict,
  nowMinutes,
  onMove,
}: WindowCardProps) {
  const range = `${window.start} – ${window.end}`;
  return (
    <div className="rounded-lg bg-[#2B2B2B] border border-[#3C3C3C]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3C3C3C]">
        <div>
          <div className="font-semibold">{window.name}</div>
          <div className="text-xs text-[#A0A0A0]">{range}</div>
        </div>
      </div>
      {conflict && (
        <InlineWarning message={conflict} onDismiss={clearConflict} />
      )}
      <SlotGrid
        window={window}
        tasks={tasks}
        picked={picked}
        filters={filters}
        onPlace={onPlace}
        onPick={onPick}
        view={view}
        nowMinutes={nowMinutes}
        onMove={onMove}
      />
    </div>
  );
}

interface SlotGridProps {
  window: WindowBlock;
  tasks: Task[];
  picked: Task | null;
  filters: Filters;
  onPlace: (start: number) => void;
  onPick: (t: Task | null) => void;
  view: "day" | "compact";
  nowMinutes: number;
  onMove: (t: Task, delta: number) => void;
}

function SlotGrid({
  window,
  tasks,
  picked,
  filters,
  onPlace,
  onPick,
  view,
  nowMinutes,
  onMove,
}: SlotGridProps) {
  const startTick = window.startMin / SLOT_MINUTES;
  const endTick = window.endMin / SLOT_MINUTES;
  const ticks = endTick - startTick;

  const handleDrop = (tick: number) => {
    const start = window.startMin + tick * SLOT_MINUTES;
    onPlace(start);
  };

  return (
    <div className="relative">
      <div className="flex">
        {view === "day" && (
          <div className="w-12 sticky left-0">
            {Array.from({ length: ticks }).map((_, i) => {
              const min = window.startMin + i * SLOT_MINUTES;
              const label = min % 30 === 0 ? minutesToTime(min) : "";
              return (
                <div key={i} style={{ height: SLOT_HEIGHT }} className="text-[10px] text-[#A0A0A0]">
                  {label}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex-1">
          {Array.from({ length: ticks }).map((_, i) => (
            <div
              key={i}
              style={{ height: SLOT_HEIGHT }}
              className="border-b border-[#3C3C3C]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              onClick={() => picked && handleDrop(i)}
            />
          ))}
        </div>
      </div>

      {/* Scheduled tasks */}
      {tasks.map((t) => {
        if (t.start === undefined) return null;
        const top = ((t.start - window.startMin) / SLOT_MINUTES) * SLOT_HEIGHT;
        const height = (t.duration / SLOT_MINUTES) * SLOT_HEIGHT;
        const faded = !matchesFilters(t, filters);
        return (
          <div
            key={t.id}
            className="absolute left-12 right-0 px-1"
            style={{ top, height }}
          >
            <TaskChip
              task={t}
              faded={faded}
              onDragStart={(task) => onPick(task)}
              onClick={() => onPick(t)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  onMove(t, -SLOT_MINUTES);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  onMove(t, SLOT_MINUTES);
                }
              }}
            />
          </div>
        );
      })}

      {/* Now line */}
      {nowMinutes >= window.startMin && nowMinutes <= window.endMin && (
        <NowLine top={((nowMinutes - window.startMin) / SLOT_MINUTES) * SLOT_HEIGHT} />
      )}
    </div>
  );
}

interface TaskChipProps {
  task: Task;
  faded?: boolean;
  onDragStart?: (t: Task) => void;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

function TaskChip({ task, faded, onDragStart, onClick, onKeyDown }: TaskChipProps) {
  return (
    <div
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart && onDragStart(task);
      }}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`h-full rounded bg-[#353535] text-xs px-2 py-1 flex flex-col justify-center border border-[#3C3C3C] ${
        faded ? "opacity-40" : ""
      }`}
    >
      <span>{task.title}</span>
      <div className="mt-1 flex gap-1 flex-wrap">
        <span className="px-1 rounded bg-[#2B2B2B] text-[10px]">{task.energy}</span>
        <span className="px-1 rounded bg-[#2B2B2B] text-[10px]">{task.priority}</span>
        <span className="px-1 rounded bg-[#2B2B2B] text-[10px]">{task.project}</span>
      </div>
    </div>
  );
}

interface InboxDrawerProps {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  onPick: (t: Task) => void;
  search: string;
  setSearch: (v: string) => void;
  filters: Filters;
  toggleFilter: (k: keyof Filters, v: string) => void;
}

function InboxDrawer({
  open,
  onClose,
  tasks,
  onPick,
  search,
  setSearch,
  filters,
  toggleFilter,
}: InboxDrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-20 flex items-end bg-black/50"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-h-[80%] overflow-y-auto rounded-t-lg bg-[#2B2B2B] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center mb-2">
          <input
            autoFocus
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-[#1E1E1E] px-2 py-1 rounded"
          />
          <button
            onClick={onClose}
            className="ml-2 px-2 py-1 bg-[#1E1E1E] rounded"
          >
            Close
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          {["Low", "Med", "High"].map((e) => (
            <FilterChip
              key={e}
              label={e}
              active={filters.energy === e}
              onClick={() => toggleFilter("energy", e)}
            />
          ))}
          {["P1", "P2", "P3"].map((p) => (
            <FilterChip
              key={p}
              label={p}
              active={filters.priority === p}
              onClick={() => toggleFilter("priority", p)}
            />
          ))}
        </div>
        <div className="space-y-2">
          {tasks.length === 0 && <EmptyState message="No tasks" />}
          {tasks.map((t) => (
            <div key={t.id} onClick={() => onPick(t)}>
              <TaskChip task={t} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConflictToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, 3000);
    return () => clearTimeout(id);
  }, [onClose]);
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#353535] text-[#E0E0E0] px-3 py-2 rounded border border-[#3C3C3C]">
      {message}
    </div>
  );
}

function InlineWarning({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="px-3 py-2 text-sm text-[#FF5A5A] flex justify-between items-center bg-[#1E1E1E]">
      <span>{message}</span>
      <button onClick={onDismiss} className="text-[#A0A0A0] text-xs">
        Dismiss
      </button>
    </div>
  );
}

function NowLine({ top }: { top: number }) {
  return (
    <div
      className="absolute left-12 right-0 h-[2px] bg-[#FF5A5A]"
      style={{ top }}
    />
  );
}

function LoadingSkeleton() {
  return <div className="animate-pulse h-10 bg-[#353535]" />;
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-center text-[#A0A0A0] py-4">{message}</div>;
}

