"use client";

import { RotateCcw } from "lucide-react";
import { useToastHelpers } from "@/components/ui/toast";

const buttonClass =
  "rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-left text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-white/30";

export default function ToastTestPanel() {
  const toast = useToastHelpers();

  return (
    <main className="min-h-[calc(100vh-9rem)] bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
            Internal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Test
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-white/60">
            Admin-only toast style checks for the current shared toast system.
          </p>
        </div>

        <section className="rounded-lg border border-white/10 bg-[#090B11] p-4 shadow-2xl shadow-black/30 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                toast.success(
                  "Success toast",
                  "The requested update was saved and is ready to review."
                )
              }
            >
              Success with description
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                toast.error(
                  "Error toast",
                  "The request could not be completed. Check the inputs and try again."
                )
              }
            >
              Error with description
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                toast.warning(
                  "Warning toast",
                  "This change may affect scheduled creator workflows."
                )
              }
            >
              Warning with description
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                toast.info(
                  "Info toast",
                  "New status details are available in the activity feed."
                )
              }
            >
              Info with description
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => toast.success("Title-only success toast")}
            >
              Title-only success
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                toast.info(
                  "Longer toast",
                  "This message includes more detail to verify wrapping, spacing, and readability across compact mobile widths and desktop layouts."
                )
              }
            >
              Longer message-heavy toast
            </button>
            <button
              type="button"
              className={`${buttonClass} sm:col-span-2`}
              onClick={() =>
                toast.error(
                  "Retry available",
                  "The sync failed before all changes were confirmed.",
                  () =>
                    toast.info(
                      "Retry clicked",
                      "The retry action callback fired successfully."
                    )
                )
              }
            >
              <span className="inline-flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Error with retry action
              </span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
