"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, BatteryCharging, Flame, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import ActivityPanel from "./ActivityPanel";
import { MonumentGoalsList } from "@/components/monuments/MonumentGoalsList";
import { MonumentNotesGrid } from "@/components/notes/MonumentNotesGrid";
import type { MonumentNote } from "@/lib/types/monument-note";
import { cn } from "@/lib/utils";
import MonumentEditDialog from "@/components/monuments/MonumentEditDialog";
import { getSupabaseBrowser } from "@/lib/supabase";
import { deleteMonumentWithReassignment } from "@/lib/monuments/deleteMonument";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export interface MonumentDetailMonument {
  id: string;
  title: string;
  emoji: string | null;
}

interface MonumentDetailProps {
  monument: MonumentDetailMonument;
  notes: MonumentNote[];
}

export function MonumentDetail({ monument, notes }: MonumentDetailProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const { id } = monument;
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteMonument = async () => {
    if (!supabase) {
      setDeleteError("Supabase not configured.");
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setDeleteError(userError?.message || "You must be signed in.");
      setDeleting(false);
      return;
    }

    try {
      await deleteMonumentWithReassignment({
        monumentId: id,
        userId: user.id,
        supabase,
      });
      setConfirmDeleteOpen(false);
      router.push("/monuments");
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete monument.");
    } finally {
      setDeleting(false);
    }
  };

  const containerShell =
    "relative w-full overflow-hidden rounded-3xl border border-white/10";
  const sectionBackground =
    "bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)]";
  const overviewBackground =
    "bg-gradient-to-br from-[#050505] via-[#0f0f10] to-[#1b1b1d] shadow-[0_35px_120px_-45px_rgba(0,0,0,0.85)]";

  const quickFacts = [
    {
      label: "Streak",
      value: "0 days",
      description: "Build consistency to light this up.",
      icon: Flame,
    },
    {
      label: "Status",
      value: "Not charging yet",
      description: "No activity has been recorded for this monument yet.",
      icon: BatteryCharging,
    },
  ] as const;

  return (
    <main className="overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
      <MonumentEditDialog
        open={editDialogOpen}
        monumentId={id}
        onOpenChange={(open) => {
          if (!open) {
            setEditDialogOpen(false);
          }
        }}
        onSaved={() => setEditDialogOpen(false)}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 overflow-x-hidden">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-fit gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-medium text-white/70 backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <Link href="/monuments">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to monuments
          </Link>
        </Button>

        <section
          className={cn(
            containerShell,
            overviewBackground,
            "px-3 py-3 text-white sm:p-7",
            "min-h-0 sm:min-h-[210px]"
          )}
        >
          <div className="absolute inset-0">
            <div className="absolute inset-x-12 -top-16 h-48 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.18),_transparent_70%)] blur-3xl" />
            <div className="absolute bottom-0 right-0 h-56 w-56 translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.06),_transparent_60%)] blur-3xl" />
          </div>
          <div className="absolute top-3 right-3 z-10 flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Monument actions"
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:border-white/20 hover:bg-white/10"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditDialogOpen(true)}>
                  Edit monument
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-300 focus:bg-red-950/40 focus:text-red-200"
                  onSelect={() => {
                    setDeleteError(null);
                    setConfirmDeleteOpen(true);
                  }}
                >
                  Delete monument
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="relative flex flex-row gap-4 sm:flex-row sm:items-start sm:gap-6">
            <span
              className="relative flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-b from-[#040404] via-[#08080a] to-black text-3xl text-white shadow-[0_25px_45px_rgba(0,0,0,0.65)] sm:h-[72px] sm:w-[72px] sm:text-4xl"
              role="img"
              aria-label={`Monument: ${monument.title}`}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.55),_rgba(255,255,255,0.05))]"
              />
              <span
                aria-hidden="true"
                className="absolute inset-[2px] rounded-[18px] bg-gradient-to-b from-white/20 via-white/5 to-white/0 opacity-80"
              />
              <span className="relative z-10 drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]">
                {monument.emoji || "\uD83D\uDDFC\uFE0F"}
              </span>
            </span>
            <div className="flex flex-1 flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {monument.title}
              </h1>
              <div className="grid gap-0.5 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap">
                {quickFacts.map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="group flex items-center gap-0.5 rounded-full border border-black bg-white/5 px-1 py-0.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur transition hover:border-black hover:bg-white/10 sm:gap-1 sm:px-2 sm:py-1"
                  >
                    <span className="flex size-3 items-center justify-center rounded-full bg-white/10 text-white/70 sm:size-5">
                      <Icon className="h-1.5 w-1.5 sm:h-2.5 sm:w-2.5" aria-hidden="true" />
                    </span>
                    <div className="flex flex-col leading-tight">
                      <span className="text-[5px] font-semibold uppercase tracking-[0.28em] text-white/45 sm:text-[7px]">
                        {label}
                      </span>
                      <span className="text-[7px] font-semibold text-white/85 sm:text-xs">
                        {value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="grid w-full grid-cols-1 gap-5 lg:gap-6 xl:auto-rows-min xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <section
            className={cn(
              containerShell,
              sectionBackground,
              "p-5 sm:p-7",
              "min-h-[260px]",
              "overflow-visible sm:overflow-hidden"
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_55%)]" />
            <header className="relative flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
                GOALS
              </h2>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="rounded-full border border-black bg-white/5 px-4 text-white backdrop-blur hover:border-black hover:bg-white/10"
              >
                <Link href="/goals/new">New goal</Link>
              </Button>
            </header>
            <div className="relative mt-4 overflow-visible">
              <MonumentGoalsList monumentId={id} monumentEmoji={monument.emoji} />
            </div>
          </section>

          <section
            className={cn(
              containerShell,
              sectionBackground,
              "p-5 sm:p-7",
              "min-h-[260px]",
              "overflow-visible sm:overflow-hidden"
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_60%)]" />
            <header className="relative flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                  Notes
                </p>
              </div>
            </header>
            <div className="relative mt-5">
              <MonumentNotesGrid monumentId={id} initialNotes={notes} />
            </div>
          </section>

          <div className="w-full xl:col-span-2">
            <ActivityPanel monumentId={id} />
          </div>
        </div>
      </div>

      <Dialog.Root open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[240] bg-black/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[250] w-[min(90vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#05070c] p-5 text-white shadow-[0_30px_60px_rgba(0,0,0,0.55)] focus:outline-none">
            <Dialog.Title className="text-lg font-semibold">Delete monument?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-white/70">
              This will delete <span className="font-semibold text-white">{monument.title}</span>.
              Related data will stay intact and move to <span className="font-semibold text-white">Uncategorized</span>.
            </Dialog.Description>

            {deleteError ? (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {deleteError}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleting}
                  className="border-white/20 bg-transparent text-white hover:bg-white/10"
                >
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                disabled={deleting}
                onClick={handleDeleteMonument}
                className="bg-red-600 text-white hover:bg-red-500"
              >
                {deleting ? "Deleting..." : "Yes, delete monument"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

export default MonumentDetail;
