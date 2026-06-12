"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Database, FileText, ImageIcon, X } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  createMemoDatabaseEntryForHabit,
  createMemoNoteForHabit,
} from "@/lib/notesStorage";
import { getDefaultMemoDatabaseTarget } from "@/lib/skillStarterNotes";
import { cn } from "@/lib/utils";
import type { Database as SupabaseDatabase } from "@/types/supabase";

type MemoCaptureConfig =
  SupabaseDatabase["public"]["Tables"]["habits"]["Row"]["memo_capture_config"];

type MemoCompletionStep = "form" | "note";

type MemoCompletionContext = {
  habitId: string;
  habitName: string;
  habitType?: string | null;
  skillId?: string | null;
  skillIcon?: string | null;
  memoCaptureConfig?: MemoCaptureConfig | null;
  completionDate?: string | null;
};

type MemoCompletionDialogProps = {
  open: boolean;
  context: MemoCompletionContext | null;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void | Promise<void>;
};

const LEGACY_FORM_TEMPLATE_TARGETS: Record<string, string | null> = {
  "water-log": "hydration",
  "food-log": "nutrition",
  "meds-log": null,
  "workout-log": "fitness",
  "custom-form": null,
};

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readBoolean(value: unknown) {
  return value === true;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function resolveMemoCapturePlan(config: MemoCaptureConfig | null | undefined) {
  const root = readObject(config);
  const actions = readObject(root?.actions);
  const note = actions ? readBoolean(actions.note) : true;
  const form = actions ? readBoolean(actions.form) : false;
  const photo = actions ? readBoolean(actions.photo) : false;
  const hasAnyAction = note || form || photo;
  const databaseCapture = readObject(root?.databaseCapture);
  const noteDestination = readObject(root?.noteDestination);
  const targetId =
    readString(databaseCapture?.targetId) ??
    readString(databaseCapture?.databaseTargetId) ??
    readString(databaseCapture?.databaseId);
  const legacyTemplateId = readString(databaseCapture?.templateId);
  const resolvedTargetId =
    targetId ?? (legacyTemplateId ? LEGACY_FORM_TEMPLATE_TARGETS[legacyTemplateId] : null);
  const target = getDefaultMemoDatabaseTarget(resolvedTargetId);

  return {
    note: hasAnyAction ? note : true,
    form,
    photo,
    noteSkillId: readString(noteDestination?.skillId),
    formLabel: target?.label ?? "Database capture",
    formTargetId: target?.id ?? null,
  };
}

export function MemoCompletionDialog({
  open,
  context,
  onOpenChange,
  onCompleted,
}: MemoCompletionDialogProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [noteContent, setNoteContent] = useState("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(
    () => resolveMemoCapturePlan(context?.memoCaptureConfig ?? null),
    [context?.memoCaptureConfig]
  );
  const requiredSteps = useMemo<MemoCompletionStep[]>(() => {
    const steps: MemoCompletionStep[] = [];
    if (plan.form) steps.push("form");
    if (plan.note) steps.push("note");
    return steps;
  }, [plan.form, plan.note]);
  const activeStep = requiredSteps[activeStepIndex] ?? null;
  const noteSkillId = plan.noteSkillId ?? context?.skillId ?? null;
  const formTarget = useMemo(
    () => getDefaultMemoDatabaseTarget(plan.formTargetId),
    [plan.formTargetId],
  );
  const formFields = formTarget?.database.fields ?? [];
  const skillIcon = context?.skillIcon?.trim() || null;
  const canSubmitNote =
    !saving && Boolean(noteSkillId) && noteContent.trim().length > 0;
  const canSubmitForm =
    !saving &&
    Boolean(context?.skillId) &&
    Boolean(formTarget) &&
    formFields.some((field) => formValues[field.id]?.trim().length > 0);

  useEffect(() => {
    if (!open) return;
    setActiveStepIndex(0);
    setNoteContent("");
    setFormValues({});
    setFormSubmitted(false);
    setSaving(false);
    setError(null);
  }, [open, context?.habitId]);

  const finishCompletion = async () => {
    setSaving(true);
    setError(null);
    try {
      await onCompleted();
      onOpenChange(false);
    } catch (completionError) {
      console.error("Failed to complete MEMO habit", completionError);
      setError("Unable to complete this MEMO right now.");
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = async () => {
    if (!context) return;
    if (!formTarget) {
      setError("Choose Nutrition, Hydration, or Fitness before saving this MEMO.");
      return;
    }
    if (!context.skillId) {
      setError("Link this MEMO habit to a skill to capture database entries.");
      return;
    }

    const values = formFields.reduce<Record<string, unknown>>((nextValues, field) => {
      const rawValue = formValues[field.id] ?? "";
      const trimmedValue = rawValue.trim();
      if (!trimmedValue) return nextValues;

      if (field.type === "number") {
        const numericValue = Number(trimmedValue);
        if (Number.isFinite(numericValue)) {
          nextValues[field.id] = numericValue;
        }
        return nextValues;
      }

      nextValues[field.id] = rawValue;
      return nextValues;
    }, {});

    if (Object.keys(values).length === 0) {
      setError("Add at least one database field before saving this MEMO.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await createMemoDatabaseEntryForHabit(
        context.skillId,
        context.habitId,
        context.habitName,
        formTarget.id,
        values,
      );

      if (!result.success) {
        setError(result.error ?? "Unable to save this database entry right now.");
        return;
      }

      setFormSubmitted(true);
      if (activeStepIndex < requiredSteps.length - 1) {
        setActiveStepIndex((index) => index + 1);
      } else {
        await onCompleted();
        onOpenChange(false);
      }
    } catch (formError) {
      console.error("Failed to save MEMO database entry", formError);
      setError("Something went wrong while saving this database entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleNoteSubmit = async () => {
    if (!context) return;
    if (!noteSkillId) {
      setError("Link this MEMO habit to a skill to capture notes.");
      return;
    }
    const trimmedContent = noteContent.trim();
    if (!trimmedContent) {
      setError("Write a note before saving this MEMO.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const note = await createMemoNoteForHabit(
        noteSkillId,
        context.habitId,
        context.habitName,
        trimmedContent
      );
      if (!note) {
        setError("Unable to save your MEMO note right now.");
        return;
      }
      if (activeStepIndex < requiredSteps.length - 1) {
        setActiveStepIndex((index) => index + 1);
      } else {
        await onCompleted();
        onOpenChange(false);
      }
    } catch (noteError) {
      console.error("Failed to save MEMO note", noteError);
      setError("Something went wrong while saving this MEMO.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrimaryAction = () => {
    if (!activeStep) {
      void finishCompletion();
      return;
    }
    if (activeStep === "form") {
      void handleFormSubmit();
      return;
    }
    void handleNoteSubmit();
  };

  const primaryLabel = saving
    ? "Saving..."
    : activeStep === "form"
      ? requiredSteps.length > 1
        ? "Continue"
        : "Submit capture"
      : activeStep === "note"
        ? "Save memo"
        : "Complete MEMO";
  const primaryDisabled =
    saving ||
    (activeStep === "note" ? !canSubmitNote : false) ||
    (activeStep === "form" ? !canSubmitForm : false);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-lg" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[260] max-h-[calc(100dvh-20px)] w-[calc(100vw-20px)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[22px] border border-white/10 bg-[#050505] text-white shadow-[0_28px_80px_rgba(0,0,0,0.78),inset_0_1px_0_rgba(255,255,255,0.08)] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/35">
          <div className="relative border-b border-white/10 px-4 pb-3 pt-4">
            <div className="min-w-0 pr-8">
              <Dialog.Title className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-white/38">
                MEMO COMPLETION
              </Dialog.Title>
              <Dialog.Description className="mt-1 flex min-w-0 items-center gap-1.5 text-[0.65rem] font-medium text-white">
                {skillIcon ? (
                  <span
                    className="shrink-0 text-[0.72rem] leading-none text-white/70"
                    aria-hidden
                  >
                    {skillIcon}
                  </span>
                ) : null}
                <span className="min-w-0 truncate">
                  {context?.habitName || "MEMO habit"}
                </span>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-3 top-3 grid h-6 w-6 place-items-center text-white/50 transition hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                aria-label="Close MEMO Completion"
                disabled={saving}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="max-h-[calc(100dvh-150px)] overflow-y-auto px-4 py-3">
            <div className="mb-3 flex items-center gap-1.5">
              {(["form", "note"] as MemoCompletionStep[]).map((step) => {
                const enabled = requiredSteps.includes(step);
                const active = activeStep === step;
                const stepIndex = requiredSteps.indexOf(step);
                const complete =
                  enabled &&
                  (step === "form" ? formSubmitted : activeStepIndex > stepIndex);
                const Icon = step === "form" ? Database : FileText;
                return (
                  <div
                    key={step}
                    className={cn(
                      "flex h-6 min-w-0 items-center gap-1.5 rounded-full border px-2 text-[0.6rem] font-semibold uppercase tracking-[0.14em]",
                      active
                        ? "border-white/35 bg-white/12 text-white"
                        : enabled
                          ? "border-white/12 bg-white/[0.04] text-white/58"
                          : "border-white/8 bg-white/[0.02] text-white/28"
                    )}
                  >
                    {complete ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                    {step}
                  </div>
                );
              })}
              {plan.photo ? (
                <div className="flex h-6 min-w-0 items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.02] px-2 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-white/28">
                  <ImageIcon className="h-3 w-3" />
                  Photo
                </div>
              ) : null}
            </div>

            {activeStep === "form" ? (
              <div className="rounded-[14px] border border-white/10 bg-white/[0.035] p-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">
                    {plan.formLabel}
                  </h3>
                  {formTarget ? (
                    <div className="mt-3 grid gap-2.5">
                      {formFields.map((field) => {
                        const value = formValues[field.id] ?? "";
                        const commonClassName =
                          "w-full rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-xs text-white outline-none transition placeholder:text-white/24 focus:border-white/35";
                        const handleChange = (
                          event:
                            | ChangeEvent<HTMLInputElement>
                            | ChangeEvent<HTMLTextAreaElement>,
                        ) => {
                          setFormValues((current) => ({
                            ...current,
                            [field.id]: event.target.value,
                          }));
                        };

                        return (
                          <label key={field.id} className="grid gap-1">
                            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-white/42">
                              {field.name}
                            </span>
                            {field.type === "longText" ? (
                              <textarea
                                value={value}
                                onChange={handleChange}
                                placeholder={`Add ${field.name.toLowerCase()}`}
                                className={cn(commonClassName, "min-h-[68px] resize-none")}
                                disabled={saving}
                              />
                            ) : (
                              <input
                                type={field.type === "number" ? "number" : "text"}
                                value={value}
                                onChange={handleChange}
                                placeholder={`Add ${field.name.toLowerCase()}`}
                                className={commonClassName}
                                disabled={saving}
                              />
                            )}
                          </label>
                        );
                      })}
                      {!context?.skillId ? (
                        <p className="text-xs leading-5 text-red-300/85">
                          Link this MEMO habit to a skill to save database entries.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs leading-5 text-red-300/85">
                      Choose Nutrition, Hydration, or Fitness for this MEMO form.
                    </p>
                  )}
                </div>
              </div>
            ) : activeStep === "note" ? (
              <div className="space-y-2">
                <Textarea
                  value={noteContent}
                  onChange={(event) => setNoteContent(event.target.value)}
                  placeholder="Write memo note"
                  className="min-h-[120px] rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-white/28 focus:border-white/35 focus-visible:ring-0"
                  disabled={saving || !noteSkillId}
                />
                {!noteSkillId ? (
                  <p className="text-xs text-red-300/85">
                    Link this MEMO habit to a skill to capture notes.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[14px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
                No required capture step is wired for this MEMO yet. Submit to
                complete it.
              </div>
            )}

            {plan.photo ? (
              <div className="mt-3 rounded-[12px] border border-dashed border-white/10 bg-white/[0.02] px-3 py-2">
                <div className="flex items-center gap-2 text-white/32">
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]">
                    Photo unavailable
                  </span>
                </div>
              </div>
            ) : null}

            {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-white/10 bg-white/[0.02] px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-8 px-3 text-xs text-white/58 hover:bg-white/[0.06] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handlePrimaryAction}
              disabled={primaryDisabled}
              className={cn(
                "h-8 min-w-[104px] rounded-lg bg-white px-3 text-xs font-semibold text-black transition hover:bg-white/90",
                primaryDisabled && "opacity-60"
              )}
            >
              {primaryLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default MemoCompletionDialog;
