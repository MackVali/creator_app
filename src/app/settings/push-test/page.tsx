"use client";

import { useState } from "react";

type PushResult =
  | {
      ok?: boolean;
      successCount?: number;
      failureCount?: number;
      error?: string;
    }
  | null;

export default function PushTestPage() {
  const [result, setResult] = useState<PushResult>(null);
  const [sending, setSending] = useState(false);

  const sendTestPush = async () => {
    setSending(true);
    setResult(null);

    try {
      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "CREATOR backend test",
          body: "This came from the CREATOR backend.",
        }),
      });

      const payload = (await response.json().catch(() => null)) as PushResult;

      setResult(
        payload ?? {
          ok: false,
          error: `Request failed with status ${response.status}`,
        },
      );
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-black px-5 py-10 text-zinc-100">
      <div className="mx-auto flex max-w-md flex-col gap-5 rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
            CREATOR
          </p>
          <h1 className="mt-2 text-2xl font-bold">Push test</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Sends a notification to the current logged-in user using the CREATOR backend.
          </p>
        </div>

        <button
          type="button"
          onClick={sendTestPush}
          disabled={sending}
          className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send test push"}
        </button>

        {result && (
          <pre className="overflow-auto rounded-2xl border border-white/10 bg-black p-3 text-xs text-zinc-300">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </main>
  );
}
