"use client";

import { Circle, CheckCircle2 } from "lucide-react";
import { taskDetailRoute } from "../../../../lib/route-helpers";
import type { Task } from "./types";
import { useRouter } from "next/navigation";

interface TaskRowProps {
  task: Task;
  showCompleted: boolean;
}

export function TaskRow({ task, showCompleted }: TaskRowProps) {
  const router = useRouter();
  const isDone = task.status === "done";
  if (isDone && !showCompleted) return null;

  const dueStatus = getDueStatus(task.dueAt);

  return (
    <div
      className="flex items-center justify-between p-2 pl-8 hover:bg-white/5 cursor-pointer"
      onClick={() => router.push(taskDetailRoute(task.id))}
    >
      <div className="flex items-center overflow-hidden flex-1">
        {isDone ? (
          <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
        ) : (
          <Circle className="w-4 h-4 mr-2 text-zinc-400" />
        )}
        <span className="flex-1 truncate text-sm">{task.title}</span>
      </div>
      {task.dueAt && (
        <span
          className={
            "text-xs px-2 py-0.5 rounded-full " +
            (dueStatus === "overdue"
              ? "bg-red-500/20 text-red-500"
              : dueStatus === "today"
              ? "bg-yellow-500/20 text-yellow-500"
              : "bg-zinc-700 text-zinc-300")
          }
        >
          {formatDue(task.dueAt)}
        </span>
      )}
      <span
        className={
          "ml-2 w-2 h-2 rounded-full " +
          (isDone ? "bg-green-500" : "bg-zinc-400")
        }
      />
    </div>
  );
}

function formatDue(date: string) {
  const d = new Date(date);
  return d.toLocaleDateString();
}

function getDueStatus(date?: string | null) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "upcoming";
}

