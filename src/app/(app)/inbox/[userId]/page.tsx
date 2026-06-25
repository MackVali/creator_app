"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useRemoteParticipants,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  ChevronDown,
  Loader2,
  Mic,
  MicOff,
  MoreHorizontal,
  Phone,
  PhoneOff,
  Volume2,
  Video,
  VideoOff,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToastHelpers } from "@/components/ui/toast";
import {
  hapticComplete,
  hapticErrorPattern,
  hapticSnap,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";

type ThreadMessage = {
  id: string;
  body: string;
  senderId: string;
  recipientId: string;
  createdAt: string;
  readAt?: string | null;
  isPending?: boolean;
};

type ThreadParticipant = {
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  canStartVoiceCall: boolean;
};

type ThreadResponse = {
  currentUserId: string;
  participant: ThreadParticipant;
  messages: ThreadMessage[];
};

type CreatorCallType = "voice" | "video";

type CreatorCallSession = {
  serverUrl: string;
  token: string;
  callType: CreatorCallType;
};

const INBOX_REFRESH_REQUEST_KEY = "premium-app:inbox-refresh-requested";
const CAMERA_UNAVAILABLE_MESSAGE = "Camera unavailable";

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "";

  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (!Number.isFinite(diffSeconds)) return "";

  if (Math.abs(diffSeconds) < 5) return "just now";

  const elapsed = Math.abs(diffSeconds);
  const ranges: Array<[number, number, string]> = [
    [60, 1, "s"],
    [3600, 60, "m"],
    [86400, 3600, "h"],
    [604800, 86400, "d"],
    [2629800, 604800, "w"],
    [31557600, 2629800, "mo"],
    [Number.POSITIVE_INFINITY, 31557600, "y"],
  ];

  for (const [limit, divisor, suffix] of ranges) {
    if (elapsed < limit) {
      const magnitude = Math.max(1, Math.floor(elapsed / divisor));
      return `${magnitude}${suffix}`;
    }
  }

  return "";
}

function getInitials(label: string) {
  const parts = label.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getCameraUnavailableMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission is blocked.";
    }

    if (
      error.name === "OverconstrainedError" ||
      error.name === "NotReadableError"
    ) {
      return CAMERA_UNAVAILABLE_MESSAGE;
    }
  }

  if (error instanceof Error) {
    if (error.name === "NotAllowedError") {
      return "Camera permission is blocked.";
    }

    if (
      error.name === "OverconstrainedError" ||
      error.name === "NotReadableError"
    ) {
      return CAMERA_UNAVAILABLE_MESSAGE;
    }
  }

  return CAMERA_UNAVAILABLE_MESSAGE;
}

export default function InboxThreadPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const toast = useToastHelpers();
  const participantId = params?.userId;

  const [participant, setParticipant] = useState<ThreadParticipant | null>(
    null
  );
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [callSession, setCallSession] = useState<CreatorCallSession | null>(
    null
  );
  const [callStartingType, setCallStartingType] =
    useState<CreatorCallType | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const composerEditVersionRef = useRef(0);

  const loadThread = useCallback(async () => {
    if (!participantId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/inbox/threads/${participantId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Unable to load conversation.");
      }

      const data = (await response.json()) as ThreadResponse;
      setParticipant(data.participant);
      setMessages(data.messages ?? []);
      setCurrentUserId(data.currentUserId ?? null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load conversation.";
      setError(message);
      setParticipant(null);
      setMessages([]);
      setCurrentUserId(null);
    } finally {
      setLoading(false);
    }
  }, [participantId]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    router.prefetch("/inbox");
  }, [router]);

  useEffect(() => {
    if (!endRef.current) return;
    endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const handleBackToInbox = useCallback(() => {
    void hapticSnap();
    try {
      sessionStorage.setItem(INBOX_REFRESH_REQUEST_KEY, "1");
    } catch {
      // Navigation should still proceed if session storage is unavailable.
    }

    const historyState = window.history.state as { idx?: number } | null;

    if (typeof historyState?.idx === "number" && historyState.idx > 0) {
      router.back();
      return;
    }

    router.push("/inbox");
  }, [router]);

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    const submittedComposerValue = composerValue;
    const composerEditVersionAtSubmit = composerEditVersionRef.current;
    const trimmed = composerValue.trim();
    if (!trimmed) {
      void hapticWarningPattern();
      return;
    }
    if (!participant?.username || !participant?.userId || !currentUserId) {
      void hapticWarningPattern();
      setSendError("Unable to send a message right now.");
      return;
    }

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticMessage: ThreadMessage = {
      id: optimisticId,
      body: trimmed,
      senderId: currentUserId,
      recipientId: participant.userId,
      createdAt: optimisticCreatedAt,
      readAt: null,
      isPending: true,
    };

    try {
      setSending(true);
      setSendError(null);
      setComposerValue("");
      setMessages((prev) => [...prev, optimisticMessage]);

      const response = await fetch(
        `/api/friends/${encodeURIComponent(participant.username)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: trimmed,
            senderId: currentUserId,
            recipientId: participant.userId,
          }),
        }
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Unable to send message.");
      }

      const data = (await response.json()) as {
        message?: { id: string; createdAt: string; readAt?: string | null };
      };

      const createdAt = data.message?.createdAt ?? new Date().toISOString();
      const id = data.message?.id ?? `${Date.now()}`;
      const readAt = data.message?.readAt ?? null;

      setMessages((prev) =>
        prev.map((message) =>
          message.id === optimisticId
            ? {
                ...message,
                id,
                createdAt,
                readAt,
                isPending: false,
              }
            : message
        )
      );
      void hapticComplete();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to send message.";
      void hapticErrorPattern();
      setSendError(message);
      setMessages((prev) =>
        prev.filter((message) => message.id !== optimisticId)
      );
      if (composerEditVersionRef.current === composerEditVersionAtSubmit) {
        setComposerValue(submittedComposerValue);
      }
    } finally {
      setSending(false);
    }
  };

  const handleStartCall = useCallback(async (callType: CreatorCallType) => {
    if (
      !participant?.canStartVoiceCall ||
      !participant.userId ||
      callStartingType
    ) {
      void hapticWarningPattern();
      return;
    }

    const callLabel = callType === "video" ? "Video calls" : "Voice calls";

    try {
      setCallStartingType(callType);
      const response = await fetch("/api/voice-calls/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: participant.userId, callType }),
      });

      if (!response.ok) {
        throw new Error(`${callLabel} are not configured yet.`);
      }

      const data = (await response.json()) as Partial<CreatorCallSession>;
      if (!data.serverUrl || !data.token) {
        throw new Error(`${callLabel} are not configured yet.`);
      }

      setCallSession({
        serverUrl: data.serverUrl,
        token: data.token,
        callType,
      });
      void hapticComplete();
    } catch {
      void hapticWarningPattern();
      toast.info(
        `${callLabel} are not configured yet`,
        "CREATOR app-to-app calling will turn on after LiveKit is configured."
      );
    } finally {
      setCallStartingType(null);
    }
  }, [callStartingType, participant, toast]);

  const handleStartVoiceCall = useCallback(() => {
    void handleStartCall("voice");
  }, [handleStartCall]);

  const handleStartVideoCall = useCallback(() => {
    void handleStartCall("video");
  }, [handleStartCall]);

  const threadTitle = participant?.displayName ?? "Conversation";
  const threadSubtitle = participant?.username
    ? `@${participant.username}`
    : null;

  const messageItems = useMemo(
    () =>
      messages.map((message, index) => {
        const isSender = message.senderId === currentUserId;
        const prevMessage = messages[index - 1];
        const nextMessage = messages[index + 1];
        const isSameAsPrev = prevMessage?.senderId === message.senderId;
        const isSameAsNext = nextMessage?.senderId === message.senderId;
        const timeLabel = formatRelativeTime(message.createdAt);
        const showTimestamp = Boolean(timeLabel) && !isSameAsNext;
        const statusLabel = isSender
          ? message.isPending
            ? "Sending…"
            : message.readAt
              ? "Read"
              : "Sent"
          : null;
        const metaLabel = [statusLabel, showTimestamp ? timeLabel : null]
          .filter(Boolean)
          .join(" · ");
        const showMeta = Boolean(metaLabel) && !isSameAsNext;

        const spacingClass =
          index === 0 ? "mt-0" : isSameAsPrev ? "mt-1" : "mt-3";

        const bubbleShape = isSender
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
          <div
            key={message.id}
            className={`flex ${spacingClass} ${
              isSender ? "justify-end" : "justify-start"
            }`}
          >
            <div className="flex max-w-[82%] flex-col gap-1">
              <div
                className={`${bubbleShape} px-4 py-2.5 text-[0.92rem] leading-relaxed ${
                  isSender
                    ? "bg-[#343438] text-white"
                    : "bg-[#242428] text-white/95"
                }`}
              >
                <p className="whitespace-pre-line">{message.body}</p>
              </div>
              {showMeta ? (
                <p
                  className={`px-1 text-[0.65rem] tracking-wide ${
                    isSender
                      ? "text-right text-white/40"
                      : "text-left text-white/35"
                  }`}
                >
                  {metaLabel}
                </p>
              ) : null}
            </div>
          </div>
        );
      }),
    [messages, currentUserId]
  );

  return (
    <div className="h-[100dvh] min-h-screen overflow-hidden bg-black text-white">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-4 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:px-6">
        <header className="sticky top-0 z-20 -mx-4 mb-1 shrink-0 border-b border-white/5 bg-black/95 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex min-h-11 items-center gap-2">
            <button
              type="button"
              aria-label="Back to inbox"
              onClick={handleBackToInbox}
              className="-ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-white/55 transition hover:bg-white/5 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="none"
              >
                <path
                  d="M12.5 4.5 7 10l5.5 5.5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
            {participant ? (
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="h-8 w-8 bg-white/10">
                    {participant.avatarUrl ? (
                      <AvatarImage
                        src={participant.avatarUrl}
                        alt={`${participant.displayName} avatar`}
                      />
                    ) : null}
                    <AvatarFallback className="bg-white/10 text-[0.6rem] font-semibold text-white/75">
                      {getInitials(participant.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {threadTitle}
                    </p>
                    {threadSubtitle ? (
                      <p className="truncate text-[0.7rem] text-white/45">
                        {threadSubtitle}
                      </p>
                    ) : null}
                  </div>
                </div>
                {participant.canStartVoiceCall ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleStartVoiceCall}
                      disabled={Boolean(callStartingType)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-white/75 transition hover:bg-white/[0.14] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`Start CREATOR voice call with ${threadTitle}`}
                    >
                      {callStartingType === "voice" ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Phone className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartVideoCall}
                      disabled={Boolean(callStartingType)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-white/75 transition hover:bg-white/[0.14] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`Start CREATOR video call with ${threadTitle}`}
                    >
                      {callStartingType === "video" ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Video className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm font-semibold text-white">{threadTitle}</p>
            )}
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-hidden bg-black">
          <div className="flex h-full min-h-0 flex-col gap-4 px-1 py-4 sm:px-2">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => {
                  const isSender = index % 2 === 0;
                  return (
                    <div
                      key={`skeleton-${index}`}
                      className={`flex ${isSender ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`h-9 ${
                          isSender ? "w-[55%]" : "w-[62%]"
                        } rounded-3xl bg-white/[0.07]`}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            {!loading && !error && messages.length === 0 ? (
              <p className="mt-auto px-6 pb-1 text-center text-sm text-white/35">
                Say hello to start this conversation.
              </p>
            ) : null}

            {!loading && !error && messages.length > 0 ? (
              <div className="flex flex-1 flex-col overflow-y-auto pr-1">
                {messageItems}
                <div ref={endRef} />
              </div>
            ) : null}
          </div>
        </section>

        <form
          onSubmit={handleSend}
          className="-mx-4 mt-2 flex shrink-0 flex-col gap-2 border-t border-white/10 bg-black/95 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:-mx-6 sm:px-6"
        >
          {sendError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {sendError}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              value={composerValue}
              onChange={(event) => {
                composerEditVersionRef.current += 1;
                setComposerValue(event.target.value);
              }}
              placeholder="Write a message..."
              rows={1}
              className="min-h-[42px] flex-1 resize-none rounded-2xl border border-white/10 bg-[#1c1c1e] px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <button
              type="submit"
              disabled={
                sending ||
                !composerValue.trim() ||
                !participant?.username ||
                !currentUserId
              }
              className="h-10 rounded-2xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
            >
              {sending ? "Sending" : "Send"}
            </button>
          </div>
          {!participant?.username ? (
            <p className="text-[0.65rem] text-white/40">
              Replying is unavailable until this profile is resolved.
            </p>
          ) : null}
        </form>
      </div>
      {participant && callSession ? (
        <CreatorCallSheet
          session={callSession}
          participant={participant}
          open={Boolean(callSession)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setCallSession(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

type CreatorCallSheetProps = {
  session: CreatorCallSession;
  participant: ThreadParticipant;
  open: boolean;
  onOpenChange(nextOpen: boolean): void;
};

function CreatorCallSheet({
  session,
  participant,
  open,
  onOpenChange,
}: CreatorCallSheetProps) {
  const isVideoCall = session.callType === "video";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="inset-0 h-[100dvh] w-screen max-w-none gap-0 overflow-hidden border-0 bg-[#1c1d20] p-0 text-white shadow-none sm:inset-0 sm:h-[100dvh] sm:max-w-none [&>button:last-child]:hidden"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{participant.displayName}</SheetTitle>
          <SheetDescription>
            {isVideoCall ? "CREATOR video call" : "CREATOR voice call"}
          </SheetDescription>
        </SheetHeader>
        <LiveKitRoom
          token={session.token}
          serverUrl={session.serverUrl}
          connect
          audio
          video={isVideoCall}
          onDisconnected={() => onOpenChange(false)}
          className="contents"
        >
          <RoomAudioRenderer />
          {isVideoCall ? (
            <VideoCallExperience
              sessionKey={session.token}
              participant={participant}
              onEnd={() => onOpenChange(false)}
            />
          ) : (
            <VoiceCallExperience
              participant={participant}
              onEnd={() => onOpenChange(false)}
            />
          )}
        </LiveKitRoom>
      </SheetContent>
    </Sheet>
  );
}

function CallParticipantAvatar({
  participant,
  sizeClassName = "h-28 w-28",
  fallbackClassName = "text-2xl",
}: {
  participant: ThreadParticipant;
  sizeClassName?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar
      className={`${sizeClassName} border border-white/[0.08] bg-zinc-800 shadow-[0_18px_48px_rgba(0,0,0,0.28)]`}
    >
      {participant.avatarUrl ? (
        <AvatarImage
          src={participant.avatarUrl}
          alt={`${participant.displayName} avatar`}
        />
      ) : null}
      <AvatarFallback
        className={`bg-zinc-700 font-semibold text-white/85 ${fallbackClassName}`}
      >
        {getInitials(participant.displayName)}
      </AvatarFallback>
    </Avatar>
  );
}

function CallDismissButton({ onEnd }: { onEnd(): void }) {
  return (
    <button
      type="button"
      onClick={onEnd}
      className="fixed left-4 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-30 inline-flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition hover:bg-white/[0.06] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 sm:left-6"
      aria-label="End call"
    >
      <ChevronDown className="h-7 w-7 stroke-[1.75]" aria-hidden="true" />
    </button>
  );
}

function CallControlDock({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:px-6 sm:pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]">
      <div className="pointer-events-auto mx-auto flex h-[88px] w-full max-w-[430px] items-center justify-between rounded-full border border-white/[0.08] bg-zinc-950/85 px-4 shadow-[0_18px_54px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl sm:h-24 sm:max-w-[480px] sm:px-5">
        {children}
      </div>
    </div>
  );
}

function callControlClassName(active: boolean) {
  return [
    "inline-flex h-12 w-12 items-center justify-center rounded-full border border-transparent transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 sm:h-14 sm:w-14",
    active
      ? "bg-transparent text-white hover:bg-white/[0.07] focus-visible:ring-white/25"
      : "bg-white/[0.08] text-white/55 hover:bg-white/[0.12] focus-visible:ring-white/20",
  ].join(" ");
}

function disabledCallControlClassName() {
  return "inline-flex h-12 w-12 cursor-not-allowed items-center justify-center rounded-full border border-transparent bg-transparent text-white/35 focus-visible:outline-none sm:h-14 sm:w-14";
}

function endCallControlClassName() {
  return "inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_12px_30px_rgba(239,68,68,0.28)] transition hover:bg-red-400 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/60 sm:h-16 sm:w-16";
}

function VideoCallExperience({
  sessionKey,
  participant,
  onEnd,
}: {
  sessionKey: string;
  participant: ThreadParticipant;
  onEnd(): void;
}) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const tracks = useTracks([Track.Source.Camera]);
  const localTrack = tracks.find((track) => track.participant.isLocal);
  const remoteTrack = tracks.find((track) => !track.participant.isLocal);
  const heroTrack = remoteTrack ?? localTrack;
  const cameraFallbackMessage = localTrack ? null : cameraError;
  const callStatus = remoteTrack
    ? "Connected"
    : localTrack
      ? "Calling..."
      : "Camera starting...";

  useEffect(() => {
    setCameraError(null);
  }, [sessionKey]);

  useEffect(() => {
    if (localTrack) {
      setCameraError(null);
    }
  }, [localTrack]);

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-[#17181b] text-white">
      {heroTrack ? (
        <VideoTrack
          trackRef={heroTrack}
          className={`absolute inset-0 h-full w-full object-cover ${
            heroTrack.participant.isLocal ? "scale-x-[-1]" : ""
          }`}
        />
      ) : (
        <div className="absolute inset-0 bg-[#17181b]" />
      )}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.34)_0%,rgba(0,0,0,0.08)_38%,rgba(0,0,0,0.10)_58%,rgba(0,0,0,0.46)_100%)]" />
      <CallDismissButton onEnd={onEnd} />
      <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+6.5rem)] z-20 flex justify-center px-6 text-center sm:top-[calc(env(safe-area-inset-top,0px)+7.5rem)]">
        <div className="flex max-w-[20rem] flex-col items-center">
          <CallParticipantAvatar
            participant={participant}
            sizeClassName="h-[112px] w-[112px] sm:h-32 sm:w-32"
            fallbackClassName="text-3xl sm:text-4xl"
          />
          <p className="mt-6 max-w-full truncate text-4xl font-bold leading-tight tracking-normal text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.45)] sm:text-5xl">
            {participant.displayName}
          </p>
          <p className="mt-3 text-base font-medium text-white/70 drop-shadow-[0_1px_10px_rgba(0,0,0,0.4)]">
            {callStatus}
          </p>
        </div>
      </div>
      {remoteTrack && localTrack ? (
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+7.25rem)] right-5 z-20 h-36 w-24 overflow-hidden rounded-[22px] border border-white/15 bg-zinc-950 shadow-[0_14px_40px_rgba(0,0,0,0.45)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+8rem)] sm:right-7 sm:h-44 sm:w-32">
          <VideoTrack
            trackRef={localTrack}
            className="h-full w-full scale-x-[-1] object-cover"
          />
        </div>
      ) : null}
      {cameraFallbackMessage ? (
        <p className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+6.25rem)] z-30 px-6 text-center text-sm font-medium text-white/55 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+7rem)]">
          {cameraFallbackMessage}
        </p>
      ) : null}
      <VideoCallControls onEnd={onEnd} onCameraError={setCameraError} />
    </div>
  );
}

function VideoCallControls({
  onEnd,
  onCameraError,
}: {
  onEnd(): void;
  onCameraError(message: string | null): void;
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();

  const handleToggleMute = useCallback(() => {
    void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [isMicrophoneEnabled, localParticipant]);

  const handleToggleCamera = useCallback(() => {
    localParticipant
      .setCameraEnabled(!isCameraEnabled)
      .then(() => {
        onCameraError(null);
      })
      .catch((error: unknown) => {
        console.warn("Failed to toggle video call camera", error);
        onCameraError(getCameraUnavailableMessage(error));
      });
  }, [isCameraEnabled, localParticipant, onCameraError]);

  return (
    <CallControlDock>
      <button
        type="button"
        onClick={handleToggleMute}
        className={callControlClassName(isMicrophoneEnabled)}
        aria-label={
          isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"
        }
      >
        {isMicrophoneEnabled ? (
          <Mic className="h-5 w-5" aria-hidden="true" />
        ) : (
          <MicOff className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        onClick={handleToggleCamera}
        className={callControlClassName(isCameraEnabled)}
        aria-label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
      >
        {isCameraEnabled ? (
          <Video className="h-5 w-5" aria-hidden="true" />
        ) : (
          <VideoOff className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        disabled
        className={disabledCallControlClassName()}
        aria-label="Speaker controls unavailable"
      >
        <Volume2 className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled
        className={disabledCallControlClassName()}
        aria-label="More call options unavailable"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onEnd}
        className={endCallControlClassName()}
        aria-label="End video call"
      >
        <PhoneOff className="h-5 w-5" aria-hidden="true" />
      </button>
    </CallControlDock>
  );
}

function VoiceCallExperience({
  participant,
  onEnd,
}: {
  participant: ThreadParticipant;
  onEnd(): void;
}) {
  const remoteParticipants = useRemoteParticipants();
  const callStatus = remoteParticipants.length > 0 ? "Connected" : "Calling...";

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-[#18191b] px-6 text-center text-white">
      <CallDismissButton onEnd={onEnd} />
      <div className="flex h-full min-h-0 items-center justify-center pb-[calc(env(safe-area-inset-bottom,0px)+8.75rem)] pt-[calc(env(safe-area-inset-top,0px)+4.75rem)] sm:pb-[calc(env(safe-area-inset-bottom,0px)+10rem)] sm:pt-[calc(env(safe-area-inset-top,0px)+5.5rem)]">
        <div className="flex max-w-[20rem] flex-col items-center">
          <CallParticipantAvatar
            participant={participant}
            sizeClassName="h-[120px] w-[120px] sm:h-32 sm:w-32"
            fallbackClassName="text-3xl sm:text-4xl"
          />
          <p className="mt-7 max-w-full truncate text-4xl font-bold leading-tight tracking-normal text-white sm:text-5xl">
            {participant.displayName}
          </p>
          <p className="mt-3 text-base font-medium text-white/45 sm:text-lg">
            {callStatus}
          </p>
        </div>
      </div>
      <VoiceCallControls onEnd={onEnd} />
    </div>
  );
}

function VoiceCallControls({ onEnd }: { onEnd(): void }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  const handleToggleMute = useCallback(() => {
    void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [isMicrophoneEnabled, localParticipant]);

  return (
    <CallControlDock>
      <button
        type="button"
        onClick={handleToggleMute}
        className={callControlClassName(isMicrophoneEnabled)}
        aria-label={
          isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"
        }
      >
        {isMicrophoneEnabled ? (
          <Mic className="h-5 w-5" aria-hidden="true" />
        ) : (
          <MicOff className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        disabled
        className={disabledCallControlClassName()}
        aria-label="Video controls unavailable in voice call"
      >
        <VideoOff className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled
        className={disabledCallControlClassName()}
        aria-label="Speaker controls unavailable"
      >
        <Volume2 className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled
        className={disabledCallControlClassName()}
        aria-label="More call options unavailable"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onEnd}
        className={endCallControlClassName()}
        aria-label="End voice call"
      >
        <PhoneOff className="h-5 w-5" aria-hidden="true" />
      </button>
    </CallControlDock>
  );
}
