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
        <Dialog.Overlay className="fixed inset-0 z-[210] bg-black/75 backdrop-blur-xl" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[220] max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(160deg,rgba(32,33,36,0.96)_0%,rgba(9,10,13,0.98)_46%,rgba(3,4,7,1)_100%)] text-white shadow-[0_34px_90px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.11),inset_0_-28px_70px_rgba(0,0,0,0.46)] backdrop-blur-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />

          <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45">
                Monument
              </p>
              <Dialog.Title className="mt-1 text-[1.35rem] font-semibold leading-tight tracking-normal text-white">
                Create a monument
              </Dialog.Title>
              <Dialog.Description className="mt-1 max-w-[22rem] text-xs leading-5 text-white/60">
                Pillar of life, where your skills take form in action.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                aria-label="Close create monument modal"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="max-h-[calc(100dvh-150px)] overflow-y-auto px-4 py-4 sm:px-5">
            <ProtectedRoute>
              <MonumentCreationForm onCreate={handleCreate} variant="dialog" />
            </ProtectedRoute>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default AddMonumentDialog;
