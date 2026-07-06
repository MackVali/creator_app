"use client";

import * as React from "react";
import { AlertCircle, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AiThreadPayload } from "@/lib/types/ai";

type OperatorAiResponse = {
  answer?: string;
  error?: string;
  contextSummary?: {
    scheduleItems?: number;
    scheduledItems?: number;
    windows?: number;
    blocks?: number;
    goals?: number;
    projects?: number;
    habits?: number;
    recentCompletions?: number;
  };
};

type ChatMessage = AiThreadPayload & {
  id: string;
};

const MAX_MESSAGE_CHARS = 2_000;
const MAX_THREAD_MESSAGES = 6;

function getLocalDayKey(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

function getTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  } catch {
    return "America/Chicago";
  }
}

export default function OperatorAiSheet() {
  const [message, setMessage] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [contextSummary, setContextSummary] =
    React.useState<OperatorAiResponse["contextSummary"]>(undefined);
  const responseRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    responseRef.current?.scrollTo({
      top: responseRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || loading) return;
    if (trimmed.length > MAX_MESSAGE_CHARS) {
      setError(`Message must be ${MAX_MESSAGE_CHARS} characters or fewer.`);
      return;
    }

    const timeZone = getTimeZone();
    const outgoingThread = messages.slice(-MAX_THREAD_MESSAGES).map((item) => ({
      role: item.role,
      content: item.content,
    }));
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setMessage("");
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/ai/operator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          timeZone,
          dayKey: getLocalDayKey(timeZone),
          thread: outgoingThread,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | OperatorAiResponse
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "ILAV could not answer right now.");
      }
      const answer = payload?.answer?.trim() || "No answer returned.";
      setContextSummary(payload?.contextSummary);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer,
        },
      ]);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "ILAV could not answer right now.";
      setError(message);
      setMessages((current) =>
        current.filter((item) => item.id !== userMessage.id)
      );
    } finally {
      setLoading(false);
    }
  };

  const contextLabel = contextSummary
    ? [
        `${contextSummary.blocks ?? contextSummary.windows ?? 0} blocks`,
        `${
          contextSummary.scheduledItems ?? contextSummary.scheduleItems ?? 0
        } items`,
        `${contextSummary.projects ?? 0} projects`,
        `${contextSummary.goals ?? 0} goals`,
        `${contextSummary.habits ?? 0} habits`,
      ].join(" / ")
    : "Read-only CREATOR context";

  return (
    <div className="flex min-h-0 flex-1 flex-col text-white">
      <div className="border-b border-white/[0.08] px-6 pb-4 pt-5 pr-16">
        <h2 className="text-sm font-semibold leading-tight text-white">
          Ilav - Operator
        </h2>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
          {contextLabel}
        </p>
      </div>

      <div
        ref={responseRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4"
      >
        {messages.length === 0 ? (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-4 text-sm leading-relaxed text-white/70">
            Ask what matters today, what to do next, what you are neglecting,
            or paste a ramble for a small action plan.
          </div>
        ) : null}

        {messages.map((item) => (
          <div
            key={item.id}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-sm leading-relaxed",
              item.role === "user"
                ? "ml-8 border-white/[0.12] bg-white/[0.08] text-white"
                : "mr-8 border-emerald-400/15 bg-emerald-400/[0.06] text-white/88"
            )}
          >
            {item.content}
          </div>
        ))}

        {loading ? (
          <div className="mr-8 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/65">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Thinking from CREATOR context
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-xs text-red-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <form
        className="border-t border-white/[0.08] bg-black/20 px-5 pb-5 pt-4"
        onSubmit={submit}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={message}
            onChange={(event) => {
              setMessage(event.target.value.slice(0, MAX_MESSAGE_CHARS));
              setError(null);
            }}
            placeholder="What should I do next?"
            className="min-h-[76px] resize-none rounded-lg border-white/[0.12] bg-zinc-950/80 text-sm text-white placeholder:text-white/35 focus-visible:ring-white/20"
            disabled={loading}
          />
          <Button
            type="submit"
            aria-label="Ask ILAV"
            size="iconSquare"
            disabled={loading || !message.trim()}
            className="h-11 w-11 shrink-0 rounded-lg border border-white/[0.12] bg-white text-black hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
        <div className="mt-2 text-[10px] font-medium text-white/35">
          Phase 1 is read-only. ILAV can advise, summarize, and plan.
        </div>
      </form>
    </div>
  );
}
