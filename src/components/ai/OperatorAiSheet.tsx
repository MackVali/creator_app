"use client";

import * as React from "react";
import { AlertCircle, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiThreadPayload } from "@/lib/types/ai";
import type { IlavCheckIn, IlavCheckInItem } from "@/lib/ai/ilavCheckIn";
import {
  ILAV_CHECK_IN_QUERY_PARAM,
  ILAV_CHECK_IN_TYPES,
  isIlavCheckInType,
  type IlavCheckInType,
} from "@/lib/ai/ilavCheckInSchedule";

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
  checkIn?: IlavCheckIn;
};

type CheckInCompletionRequest =
  | {
      itemType: "due_habit";
      habitId: string;
      timeZone: string;
      completedAt?: string;
    }
  | {
      itemType: "scheduled_instance";
      scheduleInstanceId: string;
      timeZone: string;
      completedAt?: string;
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

function checkInIntro(type: IlavCheckInType) {
  if (type === "morning") return "Morning. Here's what today looks like.";
  if (type === "midday") return "How we looking so far?";
  return "Alright, what actually happened today?";
}

function checkInOutro(type: IlavCheckInType) {
  if (type === "morning") {
    return "Everything look good, or is there anything about today we should account for?";
  }
  if (type === "midday") return "Anything happen that I should know about?";
  return "Anything here wrong before we close today out?";
}

function formatCheckInThreadContext(checkIn: IlavCheckIn) {
  const isToday = checkIn.creatorDayDate === getLocalDayKey(checkIn.timeZone);
  const list = (label: string, items: IlavCheckInItem[]) =>
    items.length
      ? `${label}: ${items
          .slice(0, 8)
          .map((item) => `${item.timeRange ? `${item.timeRange} ` : ""}${item.title}`)
          .join("; ")}`
      : `${label}: none`;
  const habits = checkIn.dueUnscheduledHabits.length
    ? `${checkIn.type === "morning" ? "Due today" : "Still due"}: ${checkIn.dueUnscheduledHabits
        .slice(0, 8)
        .map((habit) => habit.title)
        .join("; ")}`
    : `${checkIn.type === "morning" ? "Due today" : "Still due"}: none`;

  if (checkIn.type === "morning") {
    return [
      `${checkInIntro(checkIn.type)} (${checkIn.type} check-in${
        isToday ? "" : ` for Creator day ${checkIn.creatorDayDate}`
      })`,
      list("Scheduled", checkIn.scheduled),
      habits,
      checkInOutro(checkIn.type),
    ].join("\n");
  }

  return [
    `${checkInIntro(checkIn.type)} (${checkIn.type} check-in${
      isToday ? "" : ` for Creator day ${checkIn.creatorDayDate}`
    })`,
    list("Done", checkIn.completed),
    list("Missed", checkIn.missed),
    ...(checkIn.type === "midday" ? [list("Up next", checkIn.upcoming)] : []),
    habits,
    checkInOutro(checkIn.type),
  ].join("\n");
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


function optimisticallyCompleteCheckIn(
  checkIn: IlavCheckIn,
  body: CheckInCompletionRequest,
  completedAt: string
): IlavCheckIn {
  if (body.itemType === "due_habit") {
    const dueUnscheduledHabits = checkIn.dueUnscheduledHabits.filter(
      (habit) => habit.sourceId !== body.habitId
    );

    if (
      dueUnscheduledHabits.length === checkIn.dueUnscheduledHabits.length
    ) {
      return checkIn;
    }

    return {
      ...checkIn,
      dueUnscheduledHabits,
      counts: {
        ...checkIn.counts,
        dueUnscheduledHabits: dueUnscheduledHabits.length,
      },
    };
  }

  const instanceId = body.scheduleInstanceId;

  const sourceItem =
    checkIn.scheduled.find(
      (item) => item.scheduleInstanceId === instanceId
    ) ??
    checkIn.completed.find(
      (item) => item.scheduleInstanceId === instanceId
    ) ??
    checkIn.missed.find(
      (item) => item.scheduleInstanceId === instanceId
    ) ??
    checkIn.upcoming.find(
      (item) => item.scheduleInstanceId === instanceId
    );

  if (!sourceItem) return checkIn;

  const completedItem: IlavCheckInItem = {
    ...sourceItem,
    isCompleted: true,
    canComplete: false,
    status: "completed",
    completedAt,
  };

  const scheduled = checkIn.scheduled.map((item) =>
    item.scheduleInstanceId === instanceId ? completedItem : item
  );

  const completed = checkIn.completed.some(
    (item) => item.scheduleInstanceId === instanceId
  )
    ? checkIn.completed.map((item) =>
        item.scheduleInstanceId === instanceId ? completedItem : item
      )
    : [...checkIn.completed, completedItem].sort((a, b) => {
        const aTime = a.startUtc ? Date.parse(a.startUtc) : Number.MAX_SAFE_INTEGER;
        const bTime = b.startUtc ? Date.parse(b.startUtc) : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });

  const missed = checkIn.missed.filter(
    (item) => item.scheduleInstanceId !== instanceId
  );

  const upcoming = checkIn.upcoming.filter(
    (item) => item.scheduleInstanceId !== instanceId
  );

  return {
    ...checkIn,
    scheduled,
    completed,
    missed,
    upcoming,
    counts: {
      ...checkIn.counts,
      scheduled: scheduled.length,
      completed: completed.length,
      missed: missed.length,
      upcoming: upcoming.length,
    },
  };
}


export default function OperatorAiSheet({
  onBack,
}: {
  onBack?: () => void;
}) {
  const [message, setMessage] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [checkInLoading, setCheckInLoading] = React.useState(false);
  const [pendingCheckInCompletionKeys, setPendingCheckInCompletionKeys] =
    React.useState<Set<string>>(() => new Set());
  const [completedCheckInCompletionKeys, setCompletedCheckInCompletionKeys] =
    React.useState<Set<string>>(() => new Set());
  const [checkInCompletionErrors, setCheckInCompletionErrors] = React.useState<
    Record<string, string>
  >({});
  const [error, setError] = React.useState<string | null>(null);
  const [contextSummary, setContextSummary] =
    React.useState<OperatorAiResponse["contextSummary"]>(undefined);
  const responseRef = React.useRef<HTMLDivElement | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const loadedCheckInRequestRef = React.useRef<string | null>(null);
  const pendingCheckInCompletionKeysRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    responseRef.current?.scrollTo({
      top: responseRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  React.useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "0px";
    composer.style.height = `${Math.min(composer.scrollHeight, 160)}px`;
  }, [message]);

  const fetchCheckIn = React.useCallback(
    async (type: IlavCheckInType, creatorDayDate?: string | null) => {
      const params = new URLSearchParams();
      params.set("type", type);
      params.set("deviceTimezone", getTimeZone());
      if (creatorDayDate) params.set("creatorDayDate", creatorDayDate);

      const response = await fetch(`/api/ai/operator/check-in?${params}`);
      const payload = (await response.json().catch(() => null)) as
        | { checkIn?: IlavCheckIn; error?: string }
        | null;
      if (!response.ok || !payload?.checkIn) {
        throw new Error(payload?.error ?? "Could not load ILAV check-in.");
      }
      return payload.checkIn;
    },
    []
  );

  const loadCheckIn = React.useCallback(
    async (type: IlavCheckInType, creatorDayDate?: string | null) => {
      if (checkInLoading) return;
      setCheckInLoading(true);
      setError(null);

      try {
        const checkIn = await fetchCheckIn(type, creatorDayDate);
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: formatCheckInThreadContext(checkIn),
            checkIn,
          },
        ]);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load ILAV check-in."
        );
      } finally {
        setCheckInLoading(false);
      }
    },
    [checkInLoading, fetchCheckIn]
  );

  const completeCheckInItem = React.useCallback(
    async (
      messageId: string,
      checkIn: IlavCheckIn,
      completionKey: string,
      body: CheckInCompletionRequest
    ) => {
      if (pendingCheckInCompletionKeysRef.current.has(completionKey)) return;
      pendingCheckInCompletionKeysRef.current.add(completionKey);

      const optimisticCompletedAt = new Date().toISOString();

      // Reconcile every visible checkpoint for this Creator day immediately.
      // Persistence and XP can finish behind the UI.
      setMessages((current) =>
        current.map((message) => {
          if (
            !message.checkIn ||
            message.checkIn.creatorDayDate !== checkIn.creatorDayDate
          ) {
            return message;
          }

          const optimisticCheckIn = optimisticallyCompleteCheckIn(
            message.checkIn,
            body,
            optimisticCompletedAt
          );

          if (optimisticCheckIn === message.checkIn) return message;

          return {
            ...message,
            content: formatCheckInThreadContext(optimisticCheckIn),
            checkIn: optimisticCheckIn,
          };
        })
      );

      // Make the checkbox feel immediate. Persistence still happens below;
      // this optimistic state is rolled back if the request fails.
      setCompletedCheckInCompletionKeys((current) => {
        if (current.has(completionKey)) return current;
        const next = new Set(current);
        next.add(completionKey);
        return next;
      });

      setPendingCheckInCompletionKeys((current) => {
        if (current.has(completionKey)) return current;
        const next = new Set(current);
        next.add(completionKey);
        return next;
      });

      setCheckInCompletionErrors((current) => {
        const next = { ...current };
        delete next[completionKey];
        return next;
      });

      try {
        const response = await fetch("/api/ai/operator/check-in/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...body,
            completedAt: optimisticCompletedAt,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { success?: boolean; error?: string }
          | null;
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? "Could not complete this item.");
        }

        // A Creator completion is global, not local to the chat card that
        // initiated it. Refresh every check-in checkpoint currently shown
        // for this Creator day so Morning / Midday / Night all agree.
        const visibleTypes = Array.from(
          new Set(
            messages
              .filter(
                (message) =>
                  message.checkIn?.creatorDayDate === checkIn.creatorDayDate
              )
              .map((message) => message.checkIn?.type)
              .filter(
                (type): type is IlavCheckInType =>
                  type === "morning" ||
                  type === "midday" ||
                  type === "night"
              )
          )
        );

        // Always include the checkpoint that initiated the completion.
        if (!visibleTypes.includes(checkIn.type)) {
          visibleTypes.push(checkIn.type);
        }

        const refreshedByType = new Map<
          IlavCheckInType,
          IlavCheckIn
        >();

        // The completion itself is already persisted at this point.
        // Reconcile any visible checkpoint cards in the background so this
        // network work never controls how long the checkbox feels pending.
        void Promise.all(
          visibleTypes.map(async (type) => {
            const refreshed = await fetchCheckIn(
              type,
              checkIn.creatorDayDate
            );
            refreshedByType.set(type, refreshed);
          })
        )
          .then(() => {
            setMessages((current) =>
              current.map((message) => {
                const currentCheckIn = message.checkIn;

                if (
                  !currentCheckIn ||
                  currentCheckIn.creatorDayDate !== checkIn.creatorDayDate
                ) {
                  return message;
                }

                const refreshed = refreshedByType.get(currentCheckIn.type);
                if (!refreshed) return message;

                return {
                  ...message,
                  content: formatCheckInThreadContext(refreshed),
                  checkIn: refreshed,
                };
              })
            );
          })
          .catch(() => {
            // The completion succeeded. A failed background reconciliation
            // should not make the completed checkbox look like it failed.
          });
      } catch (completionError) {
        const message =
          completionError instanceof Error
            ? completionError.message
            : "Could not complete this item.";
        setCompletedCheckInCompletionKeys((current) => {
          if (!current.has(completionKey)) return current;
          const next = new Set(current);
          next.delete(completionKey);
          return next;
        });
        setCheckInCompletionErrors((current) => ({
          ...current,
          [completionKey]: message,
        }));

        // The optimistic UI may have moved/removed the row. If persistence
        // failed, restore the authoritative Creator state.
        void Promise.all(
          ILAV_CHECK_IN_TYPES.map(async (type) => ({
            type,
            checkIn: await fetchCheckIn(type, checkIn.creatorDayDate),
          }))
        )
          .then((results) => {
            const restoredByType = new Map(
              results.map((result) => [result.type, result.checkIn])
            );

            setMessages((current) =>
              current.map((threadMessage) => {
                const currentCheckIn = threadMessage.checkIn;

                if (
                  !currentCheckIn ||
                  currentCheckIn.creatorDayDate !== checkIn.creatorDayDate
                ) {
                  return threadMessage;
                }

                const restored = restoredByType.get(currentCheckIn.type);
                if (!restored) return threadMessage;

                return {
                  ...threadMessage,
                  content: formatCheckInThreadContext(restored),
                  checkIn: restored,
                };
              })
            );
          })
          .catch(() => null);
      } finally {
        setPendingCheckInCompletionKeys((current) => {
          if (!current.has(completionKey)) return current;
          const next = new Set(current);
          next.delete(completionKey);
          return next;
        });
        pendingCheckInCompletionKeysRef.current.delete(completionKey);
      }
    },
    [fetchCheckIn, messages]
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const requestedType = params.get(ILAV_CHECK_IN_QUERY_PARAM);
    if (!isIlavCheckInType(requestedType)) return;
    const creatorDayDate = params.get("creatorDayDate");
    const requestKey = `${requestedType}:${creatorDayDate ?? ""}`;
    if (loadedCheckInRequestRef.current === requestKey) return;
    loadedCheckInRequestRef.current = requestKey;
    void loadCheckIn(requestedType, creatorDayDate);
  }, [loadCheckIn]);

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
      content: item.checkIn ? formatCheckInThreadContext(item.checkIn) : item.content,
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

  void contextSummary;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#070707] text-white">
      {/* Full-screen chat header */}
      <header className="shrink-0 border-b border-white/[0.06] bg-[#070707]/94 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[780px] items-center px-4 sm:px-5">
          <button
            type="button"
            aria-label="Back"
            onClick={() => {
              if (onBack) {
                onBack();
                return;
              }

              window.history.back();
            }}
            className="-ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/58 transition hover:bg-white/[0.05] hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <svg
              aria-hidden="true"
              className="h-[18px] w-[18px]"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M12.5 4.5 7 10l5.5 5.5"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>

          <div className="ml-1 flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05]">
              <span
                aria-hidden="true"
                className="text-[0.88rem] leading-none grayscale saturate-0 contrast-125"
              >
                💠
              </span>
            </div>

            <div className="min-w-0">
              <div className="truncate text-[0.88rem] font-semibold leading-tight text-white">
                Ilav
              </div>
              <div className="mt-0.5 text-[0.6rem] font-medium leading-none text-white/30">
                Creator
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Ilav options"
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full text-white/42 transition hover:bg-white/[0.05] hover:text-white/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <span className="text-lg leading-none">•••</span>
          </button>
        </div>

        {/* Checkpoint rail */}
        <div className="mx-auto flex w-full max-w-[780px] items-center px-4 sm:px-5">
          <div className="flex w-full items-center border-t border-white/[0.025]">
            {ILAV_CHECK_IN_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => void loadCheckIn(type)}
                disabled={checkInLoading}
                className="group relative flex flex-1 items-center justify-center py-2.5 text-[0.67rem] font-medium capitalize text-white/36 transition hover:text-white/68 disabled:cursor-wait disabled:opacity-45"
              >
                {type}
                <span className="absolute bottom-0 h-[2px] w-5 rounded-full bg-transparent transition group-hover:bg-white/16" />
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Conversation */}
      <div
        ref={responseRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-5"
      >
        <div className="mx-auto flex min-h-full w-full max-w-[780px] flex-col">
          {messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center pb-20 pt-10 text-center">
              <div className="max-w-[18rem]">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05]">
                  <span
                    aria-hidden="true"
                    className="text-[1rem] leading-none grayscale saturate-0 contrast-125"
                  >
                    💠
                  </span>
                </div>

                <div className="mt-4 text-[1rem] font-semibold leading-tight text-white/92">
                  What&apos;s on your mind?
                </div>

                <div className="mx-auto mt-2 max-w-[15rem] text-[0.75rem] leading-5 text-white/34">
                  I&apos;ll check in with you here throughout your Creator day.
                </div>
              </div>
            </div>
          ) : null}

          <div className={cn("space-y-8", messages.length ? "py-5" : "")}>
            {messages.map((item, index) => {
              const isUser = item.role === "user";
              const prevMessage = messages[index - 1];
              const nextMessage = messages[index + 1];
              const isSameAsPrev = prevMessage?.role === item.role;
              const isSameAsNext = nextMessage?.role === item.role;
              const showAssistantIdentity = !isUser && !isSameAsPrev;
              const spacingClass =
                index === 0 ? "mt-0" : isSameAsPrev ? "-mt-5" : "";

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
                  <div
                    className={cn(
                      "flex",
                      isUser ? "justify-end" : "justify-start"
                    )}
                  >
                    {isUser ? (
                      <div
                        className={cn(
                          "max-w-[76%] px-4 py-2.5 text-[0.94rem] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]",
                          bubbleShape,
                          "bg-[#2b2b2f] text-white"
                        )}
                      >
                        <p className="whitespace-pre-line break-words">
                          {item.content}
                        </p>
                      </div>
                    ) : (
                      <div className="w-full max-w-[720px] text-[0.9rem] leading-6 text-white/88">
                        {showAssistantIdentity ? (
                          <div className="mb-2 flex items-center gap-2">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.05]">
                              <span
                                aria-hidden="true"
                                className="text-[0.55rem] leading-none grayscale saturate-0 contrast-125"
                              >
                                💠
                              </span>
                            </div>
                            <div className="text-[0.7rem] font-semibold leading-none text-white/38">
                              Ilav
                            </div>
                          </div>
                        ) : null}

                        <p className="whitespace-pre-line break-words">
                          {item.checkIn
                            ? checkInIntro(item.checkIn.type)
                            : item.content}
                        </p>
                      </div>
                    )}
                  </div>

                  {item.role === "assistant" && item.checkIn ? (
                    <IlavCheckInCard
                      checkIn={item.checkIn}
                      messageId={item.id}
                      pendingCompletionKeys={pendingCheckInCompletionKeys}
                      completedCompletionKeys={completedCheckInCompletionKeys}
                      completionErrors={checkInCompletionErrors}
                      onComplete={completeCheckInItem}
                    />
                  ) : null}

                  {item.role === "assistant" &&
                  item.suggestedActions?.length ? (
                    <div className="max-w-[720px] space-y-2 pt-1">
                      <div className="px-1 text-[0.72rem] font-medium text-white/36">
                        Suggested
                      </div>
                      <div className="grid gap-1.5">
                        {item.suggestedActions.map((action) => (
                          <SuggestedActionCard
                            key={action.id}
                            action={action}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {item.role === "assistant" &&
                  item.proposedActions?.length ? (
                    <div className="max-w-[720px] space-y-1.5 pt-1">
                      <div className="grid gap-1.5">
                        {item.proposedActions.map(
                          (action, actionIndex) =>
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

            {loading ? <IlavThinkingIndicator /> : null}
            {checkInLoading ? <IlavThinkingIndicator /> : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-auto mb-2 flex w-[calc(100%-2rem)] max-w-[780px] items-start gap-2 rounded-xl border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-xs text-red-100">
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Composer */}
      <form
        className="shrink-0 border-t border-white/[0.035] bg-[#070707]/96 px-4 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur sm:px-5 sm:pb-[calc(0.65rem+env(safe-area-inset-bottom))] sm:pt-2.5"
        onSubmit={submit}
      >
        <div className="mx-auto flex min-h-[44px] max-w-[780px] items-center gap-1.5 rounded-[20px] border border-white/[0.09] bg-[#18181b] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] sm:min-h-[48px] sm:gap-2 sm:rounded-[22px] sm:px-2.5 sm:py-1.5">
          <button
            type="button"
            aria-label="Add"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base leading-none text-white/38 transition hover:bg-white/[0.05] hover:text-white/68 sm:h-8 sm:w-8 sm:text-lg"
          >
            +
          </button>

          <textarea
            ref={composerRef}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value.slice(0, MAX_MESSAGE_CHARS));
              setError(null);
            }}
            onKeyDown={handleComposerKeyDown}
            placeholder="Message Ilav..."
            rows={1}
            className="max-h-28 min-h-[32px] flex-1 resize-none overflow-y-auto bg-transparent px-1 py-1.5 text-[0.86rem] leading-5 text-white caret-white/80 outline-none placeholder:text-white/32 selection:bg-white/20 selection:text-white disabled:cursor-not-allowed disabled:opacity-55 sm:max-h-32 sm:min-h-[36px] sm:py-2 sm:text-[0.88rem]"
            disabled={loading}
          />

          <button
            type="submit"
            aria-label="Ask ILAV"
            disabled={loading || !message.trim()}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 active:scale-95 disabled:cursor-not-allowed disabled:bg-white/14 disabled:text-white/28 sm:h-8 sm:w-8"
          >
            {loading ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function IlavThinkingIndicator() {
  return (
    <div className="max-w-[720px] text-white/50">
      <div className="mb-2 text-[0.8rem] font-semibold leading-none text-white/46">
        Ilav
      </div>
      <div className="flex h-7 items-center gap-1.5" aria-label="Ilav is thinking">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/34" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/34 [animation-delay:160ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/34 [animation-delay:320ms]" />
      </div>
    </div>
  );
}

function CheckInList({
  title,
  items,
  empty,
  mark,
  timed,
  checkIn,
  messageId,
  interactive,
  pendingCompletionKeys,
  completedCompletionKeys,
  completionErrors,
  onComplete,
}: {
  title: string;
  items: Array<
    | IlavCheckInItem
    | IlavCheckIn["dueUnscheduledHabits"][number]
    | { id: string; title: string; timeRange?: null }
  >;
  empty: string;
  mark: string;
  timed?: boolean;
  checkIn?: IlavCheckIn;
  messageId?: string;
  interactive?: boolean;
  pendingCompletionKeys?: Set<string>;
  completedCompletionKeys?: Set<string>;
  completionErrors?: Record<string, string>;
  onComplete?: (
    messageId: string,
    checkIn: IlavCheckIn,
    completionKey: string,
    body: CheckInCompletionRequest
  ) => void;
}) {
  return (
    <div className="min-w-0">
      {title ? (
        <div className="mb-1.5 flex items-center text-[0.69rem] font-medium leading-4 text-white/48">
          {title}
        </div>
      ) : null}

      <div className="space-y-px overflow-x-auto overscroll-x-contain">
        {items.length ? (
          items.map((item, index) => {
            const previousItem = index > 0 ? items[index - 1] : null;

            const timeBlockLabel =
              timed &&
              "timeBlockLabel" in item &&
              typeof item.timeBlockLabel === "string" &&
              item.timeBlockLabel.trim()
                ? item.timeBlockLabel.trim()
                : null;

            const previousTimeBlockLabel =
              timed &&
              previousItem &&
              "timeBlockLabel" in previousItem &&
              typeof previousItem.timeBlockLabel === "string" &&
              previousItem.timeBlockLabel.trim()
                ? previousItem.timeBlockLabel.trim()
                : null;

            const showTimeBlockLabel =
              Boolean(timeBlockLabel) &&
              timeBlockLabel !== previousTimeBlockLabel;

            const completion = buildCheckInCompletion(
              item,
              checkIn,
              interactive === true
            );

            const isPending = completion
              ? pendingCompletionKeys?.has(completion.key) === true
              : false;

            const isOptimisticallyCompleted = completion
              ? completedCompletionKeys?.has(completion.key) === true
              : false;

            const rowError = completion
              ? completionErrors?.[completion.key] ?? null
              : null;

            const isCompleted =
              ("isCompleted" in item && item.isCompleted === true) ||
              isOptimisticallyCompleted;

            const visibleTime =
              "timeRange" in item && item.timeRange
                ? item.timeRange.split(" - ")[0]
                : null;

            return (
              <React.Fragment key={item.id}>
                {showTimeBlockLabel ? (
                  <div className="pl-[22px] pb-[1px] pt-[2px] text-[0.62rem] font-semibold leading-4 text-white/46">
                    {timeBlockLabel}
                  </div>
                ) : null}

                <div
                  className="group w-max min-w-full rounded-md px-0.5 py-[3px] transition-colors hover:bg-white/[0.025]"
                >
                <div className="flex w-max min-w-full items-center gap-2">
                  {completion && checkIn && messageId && onComplete ? (
                    <button
                      type="button"
                      aria-label={`Complete ${item.title}`}
                      disabled={isPending || isCompleted}
                      onClick={() =>
                        onComplete(
                          messageId,
                          checkIn,
                          completion.key,
                          completion.body
                        )
                      }
                      className={cn(
                        "inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[0.32rem] border text-[0.62rem] font-bold leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/25 active:scale-95",
                        isCompleted
                          ? "border-emerald-400/80 bg-emerald-500/90 text-white ring-1 ring-emerald-300/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_5px_rgba(16,185,129,0.18)]"
                          : "border-white/22 bg-transparent text-white/42 hover:border-white/48 hover:bg-white/[0.05]",
                        isPending ? "cursor-default" : "",
                        rowError
                          ? "border-red-300/65 bg-red-400/[0.07] text-red-100"
                          : ""
                      )}
                    >
                      {isCompleted ? (
                        "✓"
                      ) : isPending ? (
                        <Loader2
                          className="h-3 w-3 animate-spin"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  ) : (
                    <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[0.6rem] text-white/26">
                      {mark}
                    </span>
                  )}

                  {"glyph" in item && item.glyph ? (
                    <span
                      aria-hidden="true"
                      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[0.76rem] grayscale"
                    >
                      {item.glyph}
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className="h-[18px] w-[18px] shrink-0"
                    />
                  )}

                  {timed ? (
                    <span className="w-[4.35rem] shrink-0 text-[0.64rem] font-medium tabular-nums text-white/32">
                      {visibleTime ?? ""}
                    </span>
                  ) : null}

                  <span
                    className={cn(
                      "whitespace-nowrap text-[0.75rem] leading-[1.15rem] text-white/76",
                      isCompleted ? "text-white/42 line-through" : ""
                    )}
                  >
                    {item.title}
                  </span>
                </div>

                {rowError ? (
                  <div className="ml-[26px] mt-0.5 text-[0.64rem] leading-snug text-red-200/78">
                    {rowError}
                  </div>
                ) : null}
                </div>
              </React.Fragment>
            );
          })
        ) : (
          <div className="py-1 text-[0.69rem] leading-4 text-white/30">
            {empty}
          </div>
        )}
      </div>
    </div>
  );
}

function buildCheckInCompletion(
  item:
    | IlavCheckInItem
    | IlavCheckIn["dueUnscheduledHabits"][number]
    | { id: string; title: string; timeRange?: null },
  checkIn: IlavCheckIn | undefined,
  interactive: boolean
) {
  if (!interactive || !checkIn) return null;
  if ("itemType" in item && item.itemType === "due_habit" && item.canComplete) {
    return {
      key: `due_habit:${item.sourceId}:${checkIn.creatorDayDate}`,
      body: {
        itemType: "due_habit" as const,
        habitId: item.sourceId,
        timeZone: checkIn.timeZone,
      },
    };
  }
  if (
    "itemType" in item &&
    item.itemType === "scheduled_instance" &&
    item.canComplete
  ) {
    return {
      key: `scheduled_instance:${item.scheduleInstanceId}`,
      body: {
        itemType: "scheduled_instance" as const,
        scheduleInstanceId: item.scheduleInstanceId,
        timeZone: checkIn.timeZone,
      },
    };
  }
  return null;
}

function IlavCheckInCard({
  checkIn,
  messageId,
  pendingCompletionKeys,
  completedCompletionKeys,
  completionErrors,
  onComplete,
}: {
  checkIn: IlavCheckIn;
  messageId: string;
  pendingCompletionKeys: Set<string>;
  completedCompletionKeys: Set<string>;
  completionErrors: Record<string, string>;
  onComplete: (
    messageId: string,
    checkIn: IlavCheckIn,
    completionKey: string,
    body: CheckInCompletionRequest
  ) => void;
}) {
  const showCreatorDayDate =
    checkIn.creatorDayDate !== getLocalDayKey(checkIn.timeZone);

  const dueHabits = checkIn.dueUnscheduledHabits;

  const [activeTab, setActiveTab] = React.useState<
    "done" | "missed" | "due"
  >("missed");

  const [showAllPrimary, setShowAllPrimary] = React.useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = React.useState(false);
  const [showMorningDue, setShowMorningDue] = React.useState(false);
  const [showAllMorningDue, setShowAllMorningDue] = React.useState(false);

  const LIST_PREVIEW_COUNT = 5;

  const completionProps = {
    checkIn,
    messageId,
    pendingCompletionKeys,
    completedCompletionKeys,
    completionErrors,
    onComplete,
  };

  const activeItems =
    activeTab === "done"
      ? checkIn.completed
      : activeTab === "missed"
        ? checkIn.missed
        : dueHabits;

  const activeEmpty =
    activeTab === "done"
      ? "Nothing completed yet."
      : activeTab === "missed"
        ? "Nothing missed."
        : "Nothing still due.";

  const visibleActiveItems = showAllPrimary
    ? activeItems
    : activeItems.slice(0, LIST_PREVIEW_COUNT);

  const visibleUpcoming = showAllUpcoming
    ? checkIn.upcoming
    : checkIn.upcoming.slice(0, LIST_PREVIEW_COUNT);

  const visibleMorningScheduled = showAllPrimary
    ? checkIn.scheduled
    : checkIn.scheduled.slice(0, LIST_PREVIEW_COUNT);

  const visibleMorningDue = showAllMorningDue
    ? dueHabits
    : dueHabits.slice(0, LIST_PREVIEW_COUNT);

  const flatTabClass = (active: boolean) =>
    cn(
      "relative -mb-px border-b-2 px-0.5 pb-2 pt-1 text-[0.68rem] font-medium transition-colors",
      active
        ? "border-white/72 text-white/86"
        : "border-transparent text-white/34 hover:text-white/58"
    );

  return (
    <div className="max-w-[620px] pt-1">
      {showCreatorDayDate ? (
        <div className="mb-2 text-[0.65rem] font-medium text-white/28">
          {checkIn.creatorDayDate}
        </div>
      ) : null}

      {checkIn.type === "morning" ? (
        <div className="space-y-3">
          <CheckInList
            title={`Today · ${checkIn.scheduled.length}`}
            items={visibleMorningScheduled}
            empty="Nothing scheduled."
            mark="○"
            timed
            interactive
            {...completionProps}
          />

          {checkIn.scheduled.length > LIST_PREVIEW_COUNT ? (
            <button
              type="button"
              onClick={() => setShowAllPrimary((current) => !current)}
              className="text-[0.64rem] font-medium text-white/28 transition hover:text-white/52"
            >
              {showAllPrimary
                ? "Show less"
                : `Show ${checkIn.scheduled.length - LIST_PREVIEW_COUNT} more`}
            </button>
          ) : null}

          <div className="border-t border-white/[0.05] pt-1">
            <button
              type="button"
              onClick={() => setShowMorningDue((current) => !current)}
              className="flex w-full items-center justify-between py-1.5 text-left transition"
            >
              <span className="text-[0.69rem] font-medium text-white/46">
                Due today
              </span>

              <span className="text-[0.65rem] font-medium text-white/28">
                {dueHabits.length} {showMorningDue ? "⌄" : "›"}
              </span>
            </button>

            {showMorningDue ? (
              <div className="pt-1">
                <CheckInList
                  title=""
                  items={visibleMorningDue}
                  empty="Nothing due."
                  mark="○"
                  interactive
                  {...completionProps}
                />

                {dueHabits.length > LIST_PREVIEW_COUNT ? (
                  <button
                    type="button"
                    onClick={() =>
                      setShowAllMorningDue((current) => !current)
                    }
                    className="mt-1 text-[0.64rem] font-medium text-white/28 transition hover:text-white/52"
                  >
                    {showAllMorningDue
                      ? "Show less"
                      : `Show ${dueHabits.length - LIST_PREVIEW_COUNT} more`}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="flex items-center gap-5 border-b border-white/[0.05]">
            <button
              type="button"
              onClick={() => {
                setActiveTab("done");
                setShowAllPrimary(false);
              }}
              className={flatTabClass(activeTab === "done")}
            >
              Done {checkIn.completed.length}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("missed");
                setShowAllPrimary(false);
              }}
              className={flatTabClass(activeTab === "missed")}
            >
              Missed {checkIn.missed.length}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("due");
                setShowAllPrimary(false);
              }}
              className={flatTabClass(activeTab === "due")}
            >
              Due {dueHabits.length}
            </button>
          </div>

          <div>
            <CheckInList
              title=""
              items={visibleActiveItems}
              empty={activeEmpty}
              mark={activeTab === "done" ? "✓" : "○"}
              interactive={activeTab !== "done"}
              {...completionProps}
            />

            {activeItems.length > LIST_PREVIEW_COUNT ? (
              <button
                type="button"
                onClick={() => setShowAllPrimary((current) => !current)}
                className="mt-1 text-[0.64rem] font-medium text-white/28 transition hover:text-white/52"
              >
                {showAllPrimary
                  ? "Show less"
                  : `Show ${activeItems.length - LIST_PREVIEW_COUNT} more`}
              </button>
            ) : null}
          </div>

          {checkIn.type === "midday" && checkIn.upcoming.length > 0 ? (
            <div className="border-t border-white/[0.05] pt-2.5">
              <CheckInList
                title={`Up next · ${checkIn.upcoming.length}`}
                items={visibleUpcoming}
                empty="Nothing upcoming."
                mark="○"
                timed
                interactive
                {...completionProps}
              />

              {checkIn.upcoming.length > LIST_PREVIEW_COUNT ? (
                <button
                  type="button"
                  onClick={() => setShowAllUpcoming((current) => !current)}
                  className="mt-1 text-[0.64rem] font-medium text-white/28 transition hover:text-white/52"
                >
                  {showAllUpcoming
                    ? "Show less"
                    : `Show ${checkIn.upcoming.length - LIST_PREVIEW_COUNT} more`}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-4 max-w-[30rem] text-[0.76rem] leading-[1.45] text-white/56">
        {checkInOutro(checkIn.type)}
      </div>
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
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="text-[0.74rem] font-medium text-white/42">
        Proposed event
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
        <div className="text-[0.7rem] font-semibold text-white/38">
          {isAccepting
            ? "Creating..."
            : isAccepted
              ? "Created"
              : isDenied
                ? "Denied"
                : null}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleDeny}
            disabled={isAccepting || isAccepted || isDenied}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs font-semibold text-white/50 transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/18 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={!canAccept || isAccepting}
            className="rounded-lg border border-white/[0.12] bg-white/[0.08] px-2.5 py-1.5 text-xs font-semibold text-white/78 transition hover:border-white/[0.18] hover:bg-white/[0.12] hover:text-white/94 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/18 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isAccepting ? "Creating..." : "Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestedActionCard({ action }: { action: SuggestedAction }) {
  const actionCta = action.kind === "start_focus" ? "Start focus pomo" : "Open";
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
          <div className="inline-flex rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[0.65rem] font-semibold text-white/40">
            {badgeText}
          </div>
        </div>
      ) : null}
    </div>
  );

  const className =
    "block rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors hover:border-white/[0.14] hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/18";

  if (action.href && !action.unavailableReason) {
    return (
      <a href={action.href} className={className}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}
