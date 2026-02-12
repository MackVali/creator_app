"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { MonumentCreationForm } from "@/components/monuments/MonumentCreationForm";

export const OPEN_MONUMENT_DIALOG_EVENT = "premium-app.open-monument-dialog";

export function AddMonumentDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleExternalOpen = () => setOpen(true);
    window.addEventListener(OPEN_MONUMENT_DIALOG_EVENT, handleExternalOpen);
    return () => {
      window.removeEventListener(OPEN_MONUMENT_DIALOG_EVENT, handleExternalOpen);
    };
  }, []);

  const handleCreate = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[210] bg-black/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[220] w-[min(90vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#05070c] p-5 shadow-[0_30px_60px_rgba(0,0,0,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
                Monument
              </p>
              <h2 className="text-xl font-semibold text-white">Create a monument</h2>
              <p className="text-xs text-white/70">
                Pillar of life, where your skills take form in action.
              </p>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-full border border-white/15 bg-white/5 p-2 text-white/70 transition hover:text-white"
                aria-label="Close create monument modal"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_45px_-25px_rgba(15,23,42,0.85)]">
            <ProtectedRoute>
              <MonumentCreationForm onCreate={handleCreate} />
            </ProtectedRoute>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default AddMonumentDialog;
