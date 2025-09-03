import React, { useState, useEffect } from "react";

export interface MonumentDetailsViewProps {
  monument: {
    id: string;
    icon?: string;
    title: string;
    createdAt: string;
    status?: "Charging" | "Idle" | "On Hold" | "Complete";
    progress?: number;
    tags?: string[];
  };
  relatedGoals?: Array<{ id: string; title: string; progress: number }>;
  notes?: Array<{ id: string; text: string; updatedAt: string }>;
  activity?: Array<{
    id: string;
    when: string;
    kind: "note" | "goal_linked" | "progress" | "status";
    text: string;
  }>;
  onEdit?(): void;
  onLinkGoals?(): void;
  onAddNote?(text: string): void;
  onArchive?(): void;
  onDelete?(): void;
}

// helpers
const classNames = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

function toPercent(n: number | undefined) {
  return typeof n === "number" ? `${Math.round(n)}%` : "0%";
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34812, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "second";
  let value = seconds;
  for (const [step, nextUnit] of units) {
    if (Math.abs(value) < step) {
      unit = nextUnit;
      break;
    }
    value /= step;
    unit = nextUnit;
  }
  return rtf.format(-Math.round(value), unit);
}

// token styles
const tokenStyle: React.CSSProperties = {
  "--bg": "#111315",
  "--surface": "#1C1F22",
  "--surface-2": "#22262A",
  "--border": "#2F343A",
  "--text": "#E6E6E6",
  "--text-2": "#A6A6A6",
  "--muted": "#7C838A",
  "--focus": "#9966CC",
  "--ok": "#6DD3A8",
  "--warn": "#E8C268",
} as React.CSSProperties;

// mock data used when props are omitted
const MOCK_GOALS = [
  { id: "1", title: "Reach the summit", progress: 30 },
  { id: "2", title: "Map the caverns", progress: 80 },
  { id: "3", title: "Collect artifacts", progress: 55 },
  { id: "4", title: "Study glyphs", progress: 10 },
];

const MOCK_NOTES = [
  {
    id: "n1",
    text: "Remember to bring the ancient key.",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "n2",
    text: "Check the western entrance before dusk.",
    updatedAt: new Date().toISOString(),
  },
];

const MOCK_ACTIVITY = [
  {
    id: "a1",
    when: new Date().toISOString(),
    kind: "progress",
    text: "Progress increased to 30%",
  },
  {
    id: "a2",
    when: new Date().toISOString(),
    kind: "note",
    text: "Added a note",
  },
  {
    id: "a3",
    when: new Date().toISOString(),
    kind: "status",
    text: "Status set to Charging",
  },
];

// subcomponents
function StatusPill({ status }: { status?: string }) {
  const colors: Record<string, string> = {
    Charging: "bg-[var(--surface-2)] text-[var(--text)]",
    Idle: "bg-[var(--surface-2)] text-[var(--text)]",
    "On Hold": "bg-[var(--warn)] text-black",
    Complete: "bg-[var(--ok)] text-black",
  };
  if (!status) return null;
  return (
    <span
      className={classNames(
        "ml-2 rounded-full px-2 py-0.5 text-xs font-medium",
        colors[status] || "bg-[var(--surface-2)] text-[var(--text)]"
      )}
    >
      {status}
    </span>
  );
}

function RingProgress({ progress = 0, status }: { progress?: number; status?: string }) {
  const radius = 90 / 2 - 8; // 90px size, stroke 8px
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(progress, 0), 100);
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative flex h-[90px] w-[90px] items-center justify-center">
      <svg
        className="h-full w-full"
        viewBox="0 0 90 90"
        role="img"
        aria-label={toPercent(progress)}
      >
        <circle
          cx="45"
          cy="45"
          r={radius}
          stroke="#2F343A"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx="45"
          cy="45"
          r={radius}
          stroke="#B9B9B9"
          strokeWidth="8"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          className={classNames(
            "transition-all duration-500",
            pct > 0 && "[filter:drop-shadow(0_0_4px_var(--focus))]"
          )}
          strokeLinecap="round"
        />
      </svg>
      {status === "Complete" ? (
        <span className="absolute text-3xl" aria-hidden="true">
          ✅
        </span>
      ) : (
        <span className="absolute text-lg font-semibold text-[var(--text)]">
          {toPercent(progress)}
        </span>
      )}
    </div>
  );
}

function ChargingBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="mt-2 h-1 w-full overflow-hidden rounded bg-[var(--border)]">
      <div className="h-full w-1/3 animate-charging rounded bg-[var(--focus)]" />
      <style>{`
        @keyframes charging {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        .animate-charging { animation: charging 3s linear infinite; }
      `}</style>
    </div>
  );
}

function QuickActions({ onLinkGoals, onAddNote }: { onLinkGoals?: () => void; onAddNote?: () => void }) {
  return (
    <div className="mt-4 flex items-center justify-around text-sm text-[var(--text-2)]">
      <button
        className="flex flex-col items-center rounded p-2 hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        onClick={onLinkGoals}
      >
        <span className="mb-1 text-lg">🎯</span>
        Link Goals
      </button>
      <button
        className="flex flex-col items-center rounded p-2 hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        onClick={onAddNote}
      >
        <span className="mb-1 text-lg">📝</span>
        Add Note
      </button>
      <button
        className="flex flex-col items-center rounded p-2 hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        <span className="mb-1 text-lg">⋯</span>
        More
      </button>
    </div>
  );
}

function TagChip({ label }: { label: string }) {
  return (
    <span className="mr-2 rounded-full bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-2)]">
      {label}
    </span>
  );
}

function GoalCard({ goal }: { goal: { id: string; title: string; progress: number } }) {
  return (
    <button
      key={goal.id}
      className="group relative flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-left hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
    >
      <div className="flex items-start justify-between">
        <h4 className="mr-2 line-clamp-2 text-sm text-[var(--text)] group-active:scale-[0.985]">
          {goal.title}
        </h4>
        <span className="text-xs text-[var(--text-2)]">{toPercent(goal.progress)}</span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded bg-[var(--border)]">
        <div
          className="h-full bg-[var(--ok)]"
          style={{ width: `${goal.progress}%` }}
        />
      </div>
    </button>
  );
}

function EmptyState({ emoji, text, cta, onClick }: { emoji: string; text: string; cta: string; onClick?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-6 text-center text-[var(--text-2)]">
      <div className="mb-2 text-2xl">{emoji}</div>
      <p className="mb-4 text-sm">{text}</p>
      <button
        onClick={onClick}
        className="rounded bg-[var(--surface)] px-3 py-1 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        {cta}
      </button>
    </div>
  );
}

function NotesList({
  notes,
  onAddNote,
}: {
  notes: Array<{ id: string; text: string; updatedAt: string }>;
  onAddNote?: (text: string) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [localNotes, setLocalNotes] = useState(notes);
  useEffect(() => setLocalNotes(notes), [notes]);

  const save = () => {
    const newNote = { id: Date.now().toString(), text, updatedAt: new Date().toISOString() };
    setLocalNotes([newNote, ...localNotes]);
    setText("");
    setComposing(false);
    onAddNote && onAddNote(newNote.text);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text)]">Notes</h3>
        <button
          onClick={() => setComposing(true)}
          className="rounded bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          Add Note
        </button>
      </div>
      {composing && (
        <div className="mb-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={save}
              className="rounded bg-[var(--focus)] px-3 py-1 text-sm text-black"
            >
              Save
            </button>
          </div>
        </div>
      )}
      {localNotes.length === 0 && !composing ? (
        <EmptyState emoji="📝" text="No notes yet" cta="Add Note" onClick={() => setComposing(true)} />
      ) : (
        <ul className="space-y-3">
          {localNotes.map((n) => (
            <li key={n.id} className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[var(--text)]">
              <p className="text-sm">{n.text}</p>
              <span className="mt-2 block text-xs text-[var(--text-2)]">
                Last updated {formatRelativeTime(n.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityTimeline({ items }: { items: MonumentDetailsViewProps["activity"] }) {
  const [showAll, setShowAll] = useState(false);
  const list = items || [];
  const visible = showAll ? list : list.slice(0, 5);
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-[var(--text)]">Activity</h3>
      <ul className="relative ml-4 space-y-3 border-l border-[var(--border)]">
        {visible.map((a) => (
          <li key={a.id} className="ml-4">
            <div className="absolute -left-2 mt-1 h-2 w-2 rounded-full bg-[var(--focus)]" />
            <div className="text-sm text-[var(--text)]">{a.text}</div>
            <div className="text-xs text-[var(--text-2)]">{formatRelativeTime(a.when)}</div>
          </li>
        ))}
      </ul>
      {list.length > 5 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs text-[var(--focus)] underline"
        >
          Show more
        </button>
      )}
    </div>
  );
}

function StickyActionBar({ onArchive, onDelete }: { onArchive?: () => void; onDelete?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 bg-[var(--surface)]/80 p-4 backdrop-blur supports-[backdrop-filter]:bg-[color:rgb(28_31_34_/_0.8)]">
      <div className="mx-auto flex max-w-md justify-between gap-4">
        <button
          onClick={onArchive}
          className="flex-1 rounded bg-transparent px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          Archive
        </button>
        <button
          onClick={() => setConfirm(true)}
          className="flex-1 rounded bg-red-600 px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          Delete
        </button>
      </div>
      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded bg-[var(--surface)] p-4 text-[var(--text)]">
            <h4 className="mb-2 text-lg font-semibold">Confirm Delete</h4>
            <p className="mb-4 text-sm">
              This action cannot be undone. Type the monument title to confirm.
            </p>
            <input
              type="text"
              className="mb-4 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] p-2"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirm(false)}
                className="rounded px-3 py-1 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirm(false);
                  onDelete && onDelete();
                }}
                className="rounded bg-red-600 px-3 py-1 text-sm text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MonumentDetailsView({
  monument,
  relatedGoals,
  notes,
  activity,
  onEdit,
  onLinkGoals,
  onAddNote,
  onArchive,
  onDelete,
}: MonumentDetailsViewProps) {
  const [goals, setGoals] = useState(relatedGoals);
  const [noteList, setNoteList] = useState(notes);
  const [activityList, setActivityList] = useState(activity);
  const [loading, setLoading] = useState({ goals: !relatedGoals, notes: !notes, activity: !activity });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!relatedGoals) setGoals(MOCK_GOALS);
      if (!notes) setNoteList(MOCK_NOTES);
      if (!activity) setActivityList(MOCK_ACTIVITY);
      setLoading({ goals: false, notes: false, activity: false });
    }, 800);
    return () => clearTimeout(timer);
  }, [relatedGoals, notes, activity]);

  return (
    <div style={tokenStyle} className="min-h-screen bg-[var(--bg)] pb-32 text-[var(--text)]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex flex-col border-b border-[var(--border)] bg-[var(--bg)]/80 p-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <button
            aria-label="Back"
            className="rounded p-2 text-xl hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            ←
          </button>
          <div className="flex items-center gap-2 text-base font-semibold">
            <span>{monument.icon || "🏛️"}</span>
            <span className="capitalize">{monument.title.toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase())}</span>
          </div>
          <button
            onClick={onEdit}
            className="rounded px-3 py-1 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            Edit
          </button>
        </div>
        <div className="mt-2 flex items-center text-xs text-[var(--text-2)]">
          <span>Created {formatRelativeTime(monument.createdAt)}</span>
          <StatusPill status={monument.status} />
        </div>
      </header>

      {/* Progress Section */}
      <section className="mx-auto mt-6 flex max-w-md flex-col items-center p-4">
        <RingProgress progress={monument.progress} status={monument.status} />
        <div className="mt-2 text-sm text-[var(--text-2)]">{monument.status}</div>
        <ChargingBar active={monument.status === "Charging"} />
        <QuickActions onLinkGoals={onLinkGoals || (() => setGoals(MOCK_GOALS))} onAddNote={onAddNote} />
      </section>

      {/* Tags */}
      {monument.tags && monument.tags.length > 0 && (
        <div className="mt-4 overflow-x-auto px-4">
          <div className="flex w-max items-center">
            {monument.tags.map((t) => (
              <TagChip key={t} label={t} />
            ))}
          </div>
        </div>
      )}

      {/* Related Goals */}
      <section className="mx-auto mt-8 max-w-md px-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">
            Goals {goals ? `(${goals.length})` : ""}
          </h3>
          <button
            onClick={onLinkGoals}
            className="rounded px-2 py-1 text-xs text-[var(--focus)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            Manage
          </button>
        </div>
        {loading.goals ? (
          <Skeletons type="goals" />
        ) : goals && goals.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {goals.map((g) => (
              <GoalCard key={g.id} goal={g} />
            ))}
          </div>
        ) : (
          <EmptyState emoji="🎯" text="No goals linked" cta="Link Goals" onClick={onLinkGoals} />
        )}
      </section>

      {/* Notes */}
      <section className="mx-auto mt-8 max-w-md px-4">
        {loading.notes ? <Skeletons type="notes" /> : <NotesList notes={noteList || []} onAddNote={onAddNote} />}
      </section>

      {/* Activity */}
      <section className="mx-auto mt-8 max-w-md px-4">
        {loading.activity ? <Skeletons type="activity" /> : <ActivityTimeline items={activityList} />}
      </section>

      <StickyActionBar onArchive={onArchive} onDelete={onDelete} />
    </div>
  );
}

function Skeletons({ type }: { type: "goals" | "notes" | "activity" }) {
  switch (type) {
    case "goals":
      return (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-[var(--surface-2)]" />
          ))}
        </div>
      );
    case "notes":
      return (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-[var(--surface-2)]" />
          ))}
        </div>
      );
    case "activity":
      return (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-[var(--surface-2)]" />
          ))}
        </div>
      );
  }
  return null;
}

