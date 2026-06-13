"use client";

import LinkedAccountsForm from "./LinkedAccountsForm";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LinkedAccountsPage() {
  const router = useRouter();

  return (
    <div className="app-bg app-settings-bg min-h-screen">
      <header className="app-top-nav sticky top-0 z-10 border-b backdrop-blur">
        <div className="relative mx-auto flex max-w-5xl items-center justify-between px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)]">
          <button
            type="button"
            aria-label="Back to settings"
            onClick={() => router.push("/settings")}
            className="inline-flex h-9 w-9 items-center justify-center text-[var(--text)] transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-lg font-semibold leading-tight text-[var(--text)]">
            Linked accounts
          </h1>
          <span className="h-9 w-9 shrink-0" aria-hidden="true" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-4">
        <LinkedAccountsForm />
      </main>
    </div>
  );
}
