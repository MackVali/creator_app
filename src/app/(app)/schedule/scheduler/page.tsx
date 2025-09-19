"use client";

import { useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";

export default function SchedulerPage() {
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleReschedule() {
    setStatus("pending");
    setError(null);

    try {
      const response = await fetch("/api/scheduler/run", {
        method: "POST",
        cache: "no-store",
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch (parseError) {
        if (response.ok) {
          console.warn("Failed to parse scheduler response", parseError);
        }
      }

      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error?: unknown }).error ?? "Failed to trigger reschedule")
            : "Failed to trigger reschedule";
        throw new Error(message);
      }

      setStatus("success");
    } catch (err) {
      console.error("Failed to trigger scheduler", err);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to trigger reschedule");
    }
  }

  return (
    <ProtectedRoute>
      <div className="space-y-4 p-4 text-zinc-100">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scheduler</h1>
          <p className="text-sm text-zinc-400">
            Run the scheduler on demand to reschedule tasks and projects.
          </p>
        </div>
        <Button
          onClick={handleReschedule}
          disabled={status === "pending"}
          className="bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
        >
          {status === "pending" ? "Rescheduling..." : "Trigger Reschedule"}
        </Button>
        {status === "success" && (
          <p className="text-sm text-emerald-400">Reschedule triggered.</p>
        )}
        {status === "error" && error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>
    </ProtectedRoute>
  );
}
