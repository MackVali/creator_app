"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToastHelpers } from "@/components/ui/toast";
import { createRecord } from "@/lib/db";
import type {
  HabitInput,
  HabitRecurrence,
  HabitRow,
  HabitType,
} from "@/lib/types/habit";
import { cn } from "@/lib/utils";

const HABIT_TYPE_OPTIONS: { value: HabitType; label: string; helper: string }[] = [
  {
    value: "HABIT",
    label: "Habit",
    helper: "Track ongoing routines that move you forward.",
  },
  {
    value: "CHORE",
    label: "Chore",
    helper: "Manage maintenance tasks that keep life running.",
  },
];

const RECURRENCE_OPTIONS: {
  value: HabitRecurrence;
  label: string;
  helper: string;
}[] = [
  { value: "daily", label: "Daily", helper: "Repeats every day." },
  { value: "weekly", label: "Weekly", helper: "Repeats every week." },
  {
    value: "bi-weekly",
    label: "Bi-weekly",
    helper: "Occurs every other week.",
  },
  { value: "monthly", label: "Monthly", helper: "Repeats once a month." },
  {
    value: "bi-monthly",
    label: "Bi-monthly",
    helper: "Happens every other month.",
  },
  { value: "yearly", label: "Yearly", helper: "Repeats once a year." },
  {
    value: "every x days",
    label: "Custom cadence",
    helper: "Use this for flexible spacing (set details in your notes).",
  },
];

type FormState = {
  name: string;
  description: string;
  habitType: HabitType;
  recurrence: HabitRecurrence;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

export default function NewHabitPage() {
  const router = useRouter();
  const toast = useToastHelpers();
  const [form, setForm] = useState<FormState>({
    name: "",
    description: "",
    habitType: "HABIT",
    recurrence: "daily",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    const nextErrors: FormErrors = {};
    if (!form.name.trim()) {
      nextErrors.name = "Give your habit a name.";
    }

    if (!form.recurrence) {
      nextErrors.recurrence = "Pick how often this habit repeats.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload: HabitInput = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      habit_type: form.habitType,
      recurrence: form.recurrence,
    };

    setSubmitting(true);
    try {
      const { error } = await createRecord<HabitRow>(
        "habits",
        payload,
        { includeUpdatedAt: true }
      );

      if (error) {
        throw new Error(error.message);
      }

      toast.success("Habit created", "Your new routine is ready to track.");
      router.push("/habits");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create habit.";
      setServerError(message);
      toast.error("Could not create habit", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <PageHeader
            title="Create a habit"
            description="Define the cadence and intent for a new routine you want to keep."
          />

          <form
            onSubmit={handleSubmit}
            className="space-y-8 rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm sm:p-8"
          >
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="habit-name">Habit name</Label>
                <Input
                  id="habit-name"
                  placeholder="e.g. Morning reading"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  aria-invalid={errors.name ? "true" : "false"}
                  aria-describedby={errors.name ? "habit-name-error" : undefined}
                />
                {errors.name && (
                  <p
                    id="habit-name-error"
                    className="text-sm text-destructive"
                  >
                    {errors.name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="habit-description">Description (optional)</Label>
                <Textarea
                  id="habit-description"
                  placeholder="What does success look like for this routine?"
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  className="min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  Add context, milestones, or instructions you want to remember.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Habit type</Label>
                  <Select
                    value={form.habitType}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        habitType: value as HabitType,
                      }))
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl border border-border/60 bg-background text-left text-sm text-foreground focus:border-primary focus-visible:ring-0">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0b101b] text-sm text-white">
                      {HABIT_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div>
                            <p className="font-medium text-white">{option.label}</p>
                            <p className="text-xs text-zinc-400">{option.helper}</p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Recurrence</Label>
                  <Select
                    value={form.recurrence}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        recurrence: value as HabitRecurrence,
                      }))
                    }
                  >
                    <SelectTrigger
                      className={cn(
                        "h-11 rounded-xl border border-border/60 bg-background text-left text-sm text-foreground focus:border-primary focus-visible:ring-0",
                        errors.recurrence && "border-destructive"
                      )}
                      aria-invalid={errors.recurrence ? "true" : "false"}
                      aria-describedby={
                        errors.recurrence ? "habit-recurrence-error" : undefined
                      }
                    >
                      <SelectValue placeholder="Choose cadence" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0b101b] text-sm text-white">
                      {RECURRENCE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div>
                            <p className="font-medium text-white">{option.label}</p>
                            <p className="text-xs text-zinc-400">{option.helper}</p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.recurrence && (
                    <p
                      id="habit-recurrence-error"
                      className="text-sm text-destructive"
                    >
                      {errors.recurrence}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {serverError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {serverError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button variant="outline" type="button" asChild>
                <Link href="/habits">Cancel</Link>
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create habit"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </ProtectedRoute>
  );
}
