"use client";

import { useState } from "react";
import { Check, Edit2, Calendar as CalendarIcon } from "lucide-react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { MilestonesEmptyState } from "@/components/ui/empty-state";

interface Milestone {
  id: string;
  title: string;
  targetDate: string;
  completed: boolean;
}

interface MilestonesPanelProps {
  onMilestoneComplete?: () => void;
}

export function MilestonesPanel({ onMilestoneComplete }: MilestonesPanelProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(3);
  const [splitDate, setSplitDate] = useState("");

  const toggleComplete = async (id: string) => {
    setMilestones((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, completed: !m.completed } : m
      )
    );
    const target = milestones.find((m) => m.id === id);
    if (target && !target.completed) {
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
      onMilestoneComplete?.();
    }
  };

  const startEditing = (m: Milestone) => {
    setEditingId(m.id);
    setTitle(m.title);
    setDate(m.targetDate);
  };

  const saveEdit = (id: string) => {
    setMilestones((prev) =>
      prev.map((m) => (m.id === id ? { ...m, title, targetDate: date } : m))
    );
    setEditingId(null);
  };

  const addMilestones = (items: Milestone[]) => {
    setMilestones((prev) => [...prev, ...items]);
  };

  const handleSplitConfirm = () => {
    if (!splitDate) return;
    const end = new Date(splitDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    const step = diff / splitCount;
    const generated: Milestone[] = Array.from({ length: splitCount }).map((_, i) => {
      const date = new Date(now.getTime() + step * (i + 1));
      return {
        id: crypto.randomUUID(),
        title: `Milestone ${i + 1}`,
        targetDate: date.toISOString().slice(0, 10),
        completed: false,
      };
    });
    addMilestones(generated);
    setWizardOpen(false);
  };

  if (milestones.length === 0) {
    return (
      <>
        <MilestonesEmptyState onAction={() => setWizardOpen(true)} />
        {wizardOpen && (
          <AutoSplitWizard
            open={wizardOpen}
            onClose={() => setWizardOpen(false)}
            count={splitCount}
            onCountChange={(v) => setSplitCount(v)}
            targetDate={splitDate}
            onDateChange={(v) => setSplitDate(v)}
            onConfirm={handleSplitConfirm}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setWizardOpen(true)}>
          Auto Split
        </Button>
      </div>
      {milestones.map((m) => (
        <div
          key={m.id}
          className="flex items-center gap-3 rounded-lg bg-[var(--surface)] p-3 shadow-inner"
        >
          <input
            type="checkbox"
            checked={m.completed}
            onChange={() => toggleComplete(m.id)}
            className="h-4 w-4"
          />
          {editingId === m.id ? (
            <div className="flex flex-1 items-center gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 rounded bg-[var(--surface-2)] p-1 text-sm"
              />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded bg-[var(--surface-2)] p-1 text-sm"
              />
              <Button size="sm" onClick={() => saveEdit(m.id)}>
                Save
              </Button>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-between">
              <div>
                <div className="font-medium">{m.title}</div>
                <div className="text-xs text-[var(--muted)] flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" /> {m.targetDate}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {m.completed ? (
                  <Check className="h-4 w-4 text-[var(--accent)]" />
                ) : (
                  <div className="h-1 w-16 rounded bg-[var(--surface-2)]">
                    <div className="h-1 bg-[var(--accent)] w-0" />
                  </div>
                )}
                <button
                  onClick={() => startEditing(m)}
                  className="text-[var(--muted)] hover:text-[var(--accent)]"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {wizardOpen && (
        <AutoSplitWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          count={splitCount}
          onCountChange={(v) => setSplitCount(v)}
          targetDate={splitDate}
          onDateChange={(v) => setSplitDate(v)}
          onConfirm={handleSplitConfirm}
        />
      )}
    </div>
  );
}

interface AutoSplitWizardProps {
  open: boolean;
  onClose: () => void;
  count: number;
  onCountChange: (v: number) => void;
  targetDate: string;
  onDateChange: (v: string) => void;
  onConfirm: () => void;
}

function AutoSplitWizard({
  open,
  onClose,
  count,
  onCountChange,
  targetDate,
  onDateChange,
  onConfirm,
}: AutoSplitWizardProps) {
  if (!open) return null;
  const preview: { title: string; date: string }[] = [];
  if (targetDate) {
    const end = new Date(targetDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    const step = diff / count;
    for (let i = 0; i < count; i++) {
      const date = new Date(now.getTime() + step * (i + 1));
      preview.push({ title: `Milestone ${i + 1}`, date: date.toISOString().slice(0, 10) });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-[var(--surface)] p-4 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Auto Split</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="w-32 text-sm">Milestones</label>
            <input
              type="number"
              min={1}
              value={count}
              onChange={(e) => onCountChange(Number(e.target.value))}
              className="flex-1 rounded bg-[var(--surface-2)] p-1 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="w-32 text-sm">Target date</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="flex-1 rounded bg-[var(--surface-2)] p-1 text-sm"
            />
          </div>
          {preview.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded bg-[var(--surface-2)] p-2 text-sm">
              {preview.map((p, i) => (
                <div key={i} className="flex justify-between py-1">
                  <span>{p.title}</span>
                  <span className="text-[var(--muted)]">{p.date}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onConfirm}>Create</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MilestonesPanel;
