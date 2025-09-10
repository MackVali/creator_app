"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchReadyTasks } from "@/lib/scheduler/repo";
import { TaskLite, taskWeight } from "@/lib/scheduler/weight";

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const ts = await fetchReadyTasks();
        setTasks(ts);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
  }, []);

  return (
    <ProtectedRoute>
      <div className="space-y-6 p-4 text-zinc-100 bg-[var(--surface)]">
        <div className="relative">
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <Link href="/schedule">
            <Button
              size="sm"
              className="absolute right-0 top-0 bg-gray-800 text-gray-100 hover:bg-gray-700"
            >
              Back
            </Button>
          </Link>
          <p className="text-muted-foreground">All tasks</p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <ul className="space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="rounded-md border border-zinc-800 bg-[var(--surface-2)] p-2"
            >
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
      </div>
    </ProtectedRoute>
  );
}
