"use client";

import { useMemo } from "react";

const swatches = [
  "bg-neutral-900 text-white",
  "bg-neutral-800 text-white",
  "bg-neutral-700 text-white",
  "bg-gray-900 text-white",
  "bg-zinc-900 text-white",
  "bg-black text-white",
  "from-neutral-900 via-black to-neutral-950 bg-gradient-to-br text-white",
];

const buttons = [
  "rounded-full bg-neutral-900 border border-white/10 shadow-lg px-4 py-2 hover:scale-105 active:scale-95 transition",
  "rounded-xl bg-gray-800 px-4 py-2 hover:bg-gray-700 active:bg-gray-600 transition",
  "rounded-2xl from-neutral-900 via-black to-neutral-950 bg-gradient-to-br px-4 py-2 shadow hover:scale-105 transition",
];

export default function StyleDebugPage() {
  const randomClientId = useMemo(() => Math.random().toString(36).slice(2), []);

  return (
    <div className="space-y-8 py-6">
      <h1 className="text-2xl font-semibold">Style Debug</h1>

      <section>
        <h2 className="mb-3 font-medium">Swatches</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {swatches.map((cls, i) => (
            <div key={i} className={`${cls} rounded-xl p-4 border border-white/10`}>
              <div className="text-sm">{cls}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-medium">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          {buttons.map((cls, i) => (
            <button key={i} className={cls}>Button {i + 1}</button>
          ))}
        </div>
      </section>

      <section className="text-sm text-white/70">
        <div>Client ID: <code>{randomClientId}</code></div>
        <div>Env: <code>{process.env.NEXT_PUBLIC_APP_ENV ?? "unknown"}</code></div>
        <div>Commit: <code>{process.env.VERCEL_GIT_COMMIT_SHA ?? "local"}</code></div>
      </section>
    </div>
  );
}
