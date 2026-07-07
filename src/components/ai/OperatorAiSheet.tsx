"use client";

import * as React from "react";
import { AlertCircle, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiThreadPayload } from "@/lib/types/ai";

type OperatorAiResponse = {
  answer?: string;
  error?: string;
  suggestedActions?: SuggestedAction[];
  proposedActions?: OperatorProposedAction[];
  contextSummary?: {
    scheduleItems?: number;
    scheduledItems?: number;
    windows?: number;
    blocks?: number;
    goals?: number;
    projects?: number;
    habits?: number;
    recentCompletions?: number;
    suggestedActions?: number;
  };
};

type OperatorProposedAction = {
  kind: "create_schedule_event";
  status: "proposed";
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  notes?: string | null;
  display: {
    title: string;
    timeRange: string;
    typeLabel: "Event";
  };
};

type ClientMyListManualRow = {
  id: string;
  text: string;
  done?: boolean;
  completedAt?: string | null;
  skillIcon?: string | null;
  skillName?: string | null;
  dayBucketId?: string | null;
  priorityId?: string | null;
};

type ChatMessage = AiThreadPayload & {
  id: string;
  suggestedActions?: SuggestedAction[];
  proposedActions?: OperatorProposedAction[];
};

type ProposedActionUiStatus =
  | "proposed"
  | "accepting"
  | "accepted"
  | "denied"
  | "error";

type SuggestedAction = {
  id: string;
  kind:
    | "complete_due_item"
    | "start_focus"
    | "reschedule_missed_item"
    | "protect_recovery"
    | "open_context"
    | "triage_due_today";
  label: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  readOnly: true;
  href?: string;
  unavailableReason?: string;
};

const MAX_MESSAGE_CHARS = 2_000;
const MAX_THREAD_MESSAGES = 6;
const MY_LIST_MANUAL_ROWS_STORAGE_KEY = "creator:my-list:manual-rows";
const MY_LIST_CLIENT_ROW_CAP = 10;

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

function sanitizeClientText(value: unknown, maxChars: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function readMyListManualRowsSnapshot(): ClientMyListManualRow[] {
  if (typeof window === "undefined") return [];
  try {
    const storedRows = window.localStorage.getItem(
      MY_LIST_MANUAL_ROWS_STORAGE_KEY
    );
    if (!storedRows) return [];
    const parsed = JSON.parse(storedRows) as unknown;
    if (!Array.isArray(parsed)) return [];
    const rows: ClientMyListManualRow[] = [];
    const seen = new Set<string>();
    for (const row of parsed) {
      if (rows.length >= MY_LIST_CLIENT_ROW_CAP) break;
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const id = sanitizeClientText(record.id, 80);
      const text = sanitizeClientText(record.text, 160);
      if (!id || !text || id === "empty-draft" || seen.has(id)) continue;
      seen.add(id);
      rows.push({
        id,
        text,
        done: Boolean(record.done),
        completedAt: sanitizeClientText(record.completedAt, 40) || null,
        skillIcon: sanitizeClientText(record.skillIcon, 16) || null,
        skillName: sanitizeClientText(record.skillName, 80) || null,
        dayBucketId: sanitizeClientText(record.dayBucketId, 32) || null,
        priorityId: sanitizeClientText(record.priorityId, 32) || null,
      });
    }
    return rows;
  } catch {
    return [];
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
          clientContext: {
            myListManualRows: {
              source: "client_local_storage",
              clientProvided: true,
              rows: readMyListManualRowsSnapshot(),
            },
          },
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
          suggestedActions: payload?.suggestedActions?.slice(0, 4) ?? [],
          proposedActions: payload?.proposedActions ?? [],
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

  const handleComposerKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.nativeEvent.isComposing ||
      !message.trim() ||
      loading
    ) {
      return;
    }

    event.preventDefault();
    void submit();
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
    : "CREATOR context";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-black/20 text-white">
      <div className="border-b border-white/[0.06] px-5 pb-3 pt-4 pr-16 backdrop-blur">
        <h2 className="text-sm font-semibold leading-tight text-white">
          Ilav - Operator
        </h2>
        <p className="mt-1 truncate text-[0.65rem] font-medium tracking-wide text-white/35">
          {contextLabel}
        </p>
      </div>

      <div
        ref={responseRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5"
      >
        {messages.length === 0 ? (
          <div className="mx-auto mt-auto max-w-[20rem] rounded-3xl border border-white/[0.08] bg-[#1c1c1e] px-4 py-3 text-center text-sm leading-relaxed text-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            Ask what matters today, what to do next, what you are neglecting,
            or paste a ramble for a small action plan.
          </div>
        ) : null}

        {messages.map((item, index) => {
          const isUser = item.role === "user";
          const prevMessage = messages[index - 1];
          const nextMessage = messages[index + 1];
          const isSameAsPrev = prevMessage?.role === item.role;
          const isSameAsNext = nextMessage?.role === item.role;
          const spacingClass =
            index === 0 ? "mt-0" : isSameAsPrev ? "mt-1" : "mt-3";
          const bubbleShape = isUser
            ? [
                "rounded-3xl",
                isSameAsPrev ? "rounded-tr-xl" : "rounded-tr-3xl",
                isSameAsNext ? "rounded-br-xl" : "rounded-br-lg",
              ].join(" ")
            : [
                "rounded-3xl",
                isSameAsPrev ? "rounded-tl-xl" : "rounded-tl-3xl",
                isSameAsNext ? "rounded-bl-xl" : "rounded-bl-lg",
              ].join(" ");

          return (
            <div key={item.id} className={cn(spacingClass, "space-y-2")}>
              <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[84%] px-4 py-2.5 text-[0.92rem] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
                    bubbleShape,
                    isUser
                      ? "bg-[#343438] text-white"
                      : "bg-[#242428] text-white/95"
                  )}
                >
                  <p className="whitespace-pre-line break-words">
                    {item.content}
                  </p>
                </div>
              </div>
              {item.role === "assistant" && item.suggestedActions?.length ? (
                <div className="max-w-[84%] space-y-1.5">
                  <div className="px-1 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-white/28">
                    Suggested
                  </div>
                  <div className="grid gap-1.5">
                    {item.suggestedActions.map((action) => (
                      <SuggestedActionCard key={action.id} action={action} />
                    ))}
                  </div>
                </div>
              ) : null}
              {item.role === "assistant" && item.proposedActions?.length ? (
                <div className="max-w-[84%] space-y-1.5">
                  <div className="grid gap-1.5">
                    {item.proposedActions.map((action, actionIndex) =>
                      action.kind === "create_schedule_event" ? (
                        <ProposedEventCard
                          key={`${item.id}:${action.kind}:${action.startAt}:${actionIndex}`}
                          action={action}
                        />
                      ) : null
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {loading ? (
          <div className="flex max-w-[84%] items-center gap-2 rounded-3xl rounded-bl-lg bg-[#242428] px-4 py-2.5 text-sm text-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
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
        className="border-t border-white/10 bg-black/80 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-5"
        onSubmit={submit}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={message}
            onChange={(event) => {
              setMessage(event.target.value.slice(0, MAX_MESSAGE_CHARS));
              setError(null);
            }}
            onKeyDown={handleComposerKeyDown}
            placeholder="What should I do next?"
            rows={1}
            className="min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-[#1c1c1e] px-4 py-2.5 text-sm leading-relaxed text-white caret-white/80 outline-none placeholder:text-white/38 selection:bg-white/20 selection:text-white focus:border-white/16 focus:bg-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-white/18 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={loading}
          />
          <button
            type="submit"
            aria-label="Ask ILAV"
            disabled={loading || !message.trim()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white text-black transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 active:scale-95 disabled:cursor-not-allowed disabled:bg-white/35 disabled:text-black/60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="mt-2 px-1 text-[0.65rem] font-medium text-white/32">
          ILAV can advise, summarize, plan, and prepare proposed actions.
        </div>
      </form>
    </div>
  );
}

function ProposedEventCard({ action }: { action: OperatorProposedAction }) {
  const [status, setStatus] =
    React.useState<ProposedActionUiStatus>("proposed");
  const [error, setError] = React.useState<string | null>(null);

  const isAccepting = status === "accepting";
  const isDenied = status === "denied";
  const isAccepted = status === "accepted";
  const canAccept = status === "proposed" || status === "error";
  const notes = action.notes?.trim();

  const handleDeny = () => {
    if (isAccepted || isAccepting) return;
    setError(null);
    setStatus("denied");
  };

  const handleAccept = async () => {
    if (!canAccept) return;

    setError(null);
    setStatus("accepting");

    try {
      const response = await fetch("/api/ai/operator/proposed-actions/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: {
            kind: "create_schedule_event",
            title: action.title,
            startAt: action.startAt,
            endAt: action.endAt,
            timezone: action.timezone,
            notes: action.notes ?? null,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || payload?.ok !== true) {
        throw new Error("Unable to create event.");
      }

      setStatus("accepted");
    } catch {
      setError("Could not create event. Try again.");
      setStatus("error");
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#1c1c1e] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-white/32">
        PROPOSED EVENT
      </div>
      <div className="mt-1 truncate text-[0.86rem] font-semibold leading-tight text-white/92">
        {action.display.title || action.title}
      </div>
      <div className="mt-1 text-xs leading-snug text-white/55">
        {action.display.timeRange}
      </div>
      <div className="mt-2 space-y-0.5 text-[0.72rem] leading-snug text-white/44">
        <div>Type: Event</div>
        {notes ? <div>Notes: {notes}</div> : null}
      </div>

      {error ? (
        <div className="mt-2 text-[0.68rem] leading-snug text-red-100/80">
          {error}
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-white/34">
          {isAccepting
            ? "CREATING..."
            : isAccepted
              ? "CREATED"
              : isDenied
                ? "DENIED"
                : null}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleDeny}
            disabled={isAccepting || isAccepted || isDenied}
            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[0.58rem] font-semibold tracking-[0.14em] text-white/42 transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/62 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/18 disabled:cursor-not-allowed disabled:opacity-45"
          >
            DENY
          </button>
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={!canAccept || isAccepting}
            className="rounded-md border border-white/[0.12] bg-white/[0.08] px-2 py-1 text-[0.58rem] font-semibold tracking-[0.14em] text-white/72 transition hover:border-white/[0.18] hover:bg-white/[0.12] hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/18 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isAccepting ? "CREATING..." : "ACCEPT"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestedActionCard({ action }: { action: SuggestedAction }) {
  const actionCta = action.kind === "start_focus" ? "START FOCUS POMO" : "OPEN";
  const badgeText = action.unavailableReason
    ? "Not wired yet"
    : action.href
      ? actionCta
      : null;
  const content = (
    <div className="min-w-0">
      <div className="truncate text-[0.82rem] font-semibold leading-tight text-white/90">
        {action.label}
      </div>
      <div className="mt-1 text-xs leading-snug text-white/52">
        {action.reason}
      </div>
      {action.unavailableReason ? (
        <div className="mt-1 text-[0.65rem] leading-snug text-white/32">
          {action.unavailableReason}
        </div>
      ) : null}
      {badgeText ? (
        <div className="mt-2 flex justify-end">
          <div className="inline-flex rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-[0.14em] text-white/36">
            {badgeText}
          </div>
        </div>
      ) : null}
    </div>
  );

  const className =
    "block rounded-2xl border border-white/[0.08] bg-[#1c1c1e] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors hover:border-white/[0.14] hover:bg-[#242428] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/18";

  if (action.href && !action.unavailableReason) {
    return (
      <a href={action.href} className={className}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}
