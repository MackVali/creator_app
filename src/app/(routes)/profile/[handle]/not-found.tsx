import Link from "next/link";
import { ArrowLeft, Home, Sparkles } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative min-h-screen bg-slate-950 px-4 py-24 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-18%] h-96 w-96 -translate-x-1/2 rounded-full bg-gradient-to-br from-violet-500/25 via-sky-400/20 to-transparent blur-[160px]" />
        <div className="absolute bottom-[-20%] right-[-10%] h-80 w-80 rounded-full bg-gradient-to-br from-fuchsia-500/15 via-rose-400/15 to-transparent blur-[180px]" />
      </div>

      <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white/70">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Profile offline
        </span>

        <h1 className="mt-6 text-3xl font-semibold leading-tight text-white sm:text-4xl">
          We can't find that creator just yet
        </h1>
        <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
          The handle you entered isn't launching a public page. It may be private, unpublished, or spelled differently.
        </p>

        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.7)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>

          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go to dashboard
          </Link>
        </div>

        <p className="mt-8 text-sm text-white/40">
          If this profile should exist, ask the creator to publish their cinematic page or double-check the handle.
        </p>
      </div>
    </div>
  );
}
