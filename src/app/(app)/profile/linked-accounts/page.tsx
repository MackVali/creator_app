"use client";

import LinkedAccountsForm from "./LinkedAccountsForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const pageStyles =
  "relative mx-auto w-full max-w-4xl space-y-10 rounded-[32px] border border-border/40 bg-gradient-to-br from-background/80 via-background/40 to-background/70 p-8 shadow-[0_35px_80px_-40px_rgba(15,23,42,0.5)] backdrop-blur";

export default function LinkedAccountsPage() {
  return (
    <div className="relative mx-auto flex w-full max-w-5xl justify-center px-4 py-10 sm:py-14">
      <div className={pageStyles}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              Profile Suite
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Curate your connected presence
              </h1>
              <p className="max-w-xl text-sm text-muted-foreground/80 sm:text-base">
                Add the platforms your audience already knows and loves. We’ll showcase them with
                premium styling so your personality shines everywhere.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="self-start border-border/50 bg-background/80">
            <Link href="/profile">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to profile
            </Link>
          </Button>
        </div>

        <LinkedAccountsForm />
      </div>
    </div>
  );
}
