"use client";

import type { User } from "@supabase/supabase-js";
import { createPortal } from "react-dom";
import { Dumbbell, Droplet, Menu, Plus, Table2 } from "lucide-react";
import { Icon } from "@iconify/react";
import TopNavAvatar from "./TopNavAvatar";
import { useProfile } from "@/lib/hooks/useProfile";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppCart } from "@/components/cart/AppCartProvider";
import { AppCartQuickView, AppCheckoutFullscreen } from "@/components/cart/AppCartPanels";
import { resolveNoteIcon } from "@/components/notes/NoteEditorHeader";
import {
  NoteDatabaseEntrySheet,
  type NoteDatabaseDefinition,
  type NoteDatabaseDefinitions,
  type NoteDatabaseEntries,
  type NoteDatabaseEntry,
} from "@/components/notes/NoteSlashTextarea";
import { isScheduleRoute } from "@/components/appChromeVisibility";
import { getMonumentNote, updateMonumentNote } from "@/lib/monumentNotesStorage";
import { getNote, updateSkillNote } from "@/lib/notesStorage";

type PinnedBodyDatabase = {
  databaseId: string;
  title: string;
  noteId: string;
  skillId: string | null;
  monumentId: string | null;
  href: string;
  iconKey: BodyDatabaseIconKey;
  systemDatabaseKey: string | null;
};

type QuickAddBodyDatabaseTarget = PinnedBodyDatabase & {
  requestKey: number;
};

type NoteMetadataWithDatabases = {
  databases?: unknown;
};

type PinnedBodyDatabaseNoteRow = {
  id: string;
  skill_id: string | null;
  monument_id: string | null;
  metadata: unknown;
};

type NoteDatabaseMetadataDefinition = {
  id?: unknown;
  title?: unknown;
  iconKey?: unknown;
  pinnedSurface?: unknown;
  systemDatabaseKey?: unknown;
};

type BodyDatabaseIconKey = "stomach" | "droplet" | "dumbbell" | "table" | string;

const BODY_FALLBACK_ROWS = [
  {
    label: "Nutrition",
    iconKey: "stomach",
  },
  {
    label: "Hydration",
    iconKey: "droplet",
  },
  {
    label: "Fitness",
    iconKey: "dumbbell",
  },
] satisfies { label: string; iconKey: BodyDatabaseIconKey }[];

const BODY_DATABASE_SORT_ORDER = new Map([
  ["nutrition", 0],
  ["hydration", 1],
  ["fitness", 2],
]);

function normalizeBodyDatabaseKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getBodyDatabasePriority(database: {
  title: string;
  systemDatabaseKey?: string | null;
}) {
  const systemKeyPriority = BODY_DATABASE_SORT_ORDER.get(
    normalizeBodyDatabaseKey(database.systemDatabaseKey),
  );
  if (systemKeyPriority !== undefined) {
    return systemKeyPriority;
  }

  return BODY_DATABASE_SORT_ORDER.get(normalizeBodyDatabaseKey(database.title)) ?? 3;
}

function sortPinnedBodyDatabases(databases: PinnedBodyDatabase[]) {
  return [...databases].sort((a, b) => {
    const priorityDelta = getBodyDatabasePriority(a) - getBodyDatabasePriority(b);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

function isDefaultPinnedBodyDatabase(database: {
  title: string;
  systemDatabaseKey?: string | null;
}) {
  return (
    BODY_DATABASE_SORT_ORDER.has(normalizeBodyDatabaseKey(database.systemDatabaseKey)) ||
    BODY_DATABASE_SORT_ORDER.has(normalizeBodyDatabaseKey(database.title))
  );
}

function getBodyDatabaseIconKey({
  iconKey,
  systemDatabaseKey,
  title,
}: {
  iconKey: unknown;
  systemDatabaseKey: string | null;
  title: string;
}): BodyDatabaseIconKey {
  const normalizedSystemKey = normalizeBodyDatabaseKey(systemDatabaseKey);
  if (normalizedSystemKey === "nutrition") return "stomach";
  if (normalizedSystemKey === "hydration") return "droplet";
  if (normalizedSystemKey === "fitness") return "dumbbell";

  if (typeof iconKey === "string" && iconKey.trim()) {
    const normalizedIconKey = iconKey.trim();
    if (
      normalizedIconKey === "stomach" ||
      normalizedIconKey === "droplet" ||
      normalizedIconKey === "dumbbell" ||
      normalizedIconKey === "table"
    ) {
      return normalizedIconKey;
    }
    if (normalizeBodyDatabaseKey(normalizedIconKey) !== "database") {
      return normalizedIconKey;
    }
  }

  const normalizedTitle = normalizeBodyDatabaseKey(title);
  if (normalizedTitle === "nutrition") return "stomach";
  if (normalizedTitle === "hydration") return "droplet";
  if (normalizedTitle === "fitness") return "dumbbell";

  return "table";
}

function BodyPanelRowIcon({ iconKey }: { iconKey: BodyDatabaseIconKey }) {
  if (iconKey === "stomach") {
    return (
      <Icon
        icon="game-icons:stomach"
        className="h-4 w-4 shrink-0 text-zinc-400"
        aria-hidden="true"
      />
    );
  }

  if (iconKey === "droplet" || iconKey === "dumbbell" || iconKey === "table") {
    const LucideIcon =
      iconKey === "droplet" ? Droplet : iconKey === "dumbbell" ? Dumbbell : Table2;

    return <LucideIcon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />;
  }

  const resolvedIcon = resolveNoteIcon(iconKey);
  if (resolvedIcon.kind === "lucide") {
    const CustomIcon = resolvedIcon.Icon;
    return <CustomIcon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />;
  }
  if (resolvedIcon.kind === "iconify") {
    return (
      <Icon
        icon={resolvedIcon.icon}
        className="h-4 w-4 shrink-0 text-zinc-400"
        aria-hidden="true"
      />
    );
  }

  return (
    <span className="w-4 shrink-0 text-center text-sm leading-none" aria-hidden="true">
      {resolvedIcon.emoji}
    </span>
  );
}

function BodyPanelProgressRing({ label }: { label: string }) {
  return (
    <span
      className="relative ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--subtle-surface)] text-[8px] font-semibold text-[var(--muted)]"
      aria-label={`${label} progress 0%`}
    >
      <span
        className="absolute inset-1 rounded-full border border-[var(--border)] border-t-[var(--muted)]"
        aria-hidden="true"
      />
      <span className="relative">0%</span>
    </span>
  );
}

function BodyPanelAddEntryButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Add ${label} entry`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className="mr-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-400 text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition hover:bg-zinc-300 active:bg-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/60"
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}

function getPinnedBodyDatabasesFromMetadata({
  metadata,
  noteId,
  skillId,
  monumentId,
}: {
  metadata: unknown;
  noteId: string;
  skillId: string | null;
  monumentId: string | null;
}): PinnedBodyDatabase[] {
  if (!skillId && !monumentId) {
    return [];
  }

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  const databases = (metadata as NoteMetadataWithDatabases).databases;
  if (!databases || typeof databases !== "object" || Array.isArray(databases)) {
    return [];
  }

  return Object.entries(databases as Record<string, NoteDatabaseMetadataDefinition>).flatMap(
    ([databaseId, definition]) => {
      if (!definition || typeof definition !== "object") {
        return [];
      }

      if (definition.pinnedSurface !== "body") {
        return [];
      }

      const definitionId = typeof definition.id === "string" ? definition.id : databaseId;
      const title = typeof definition.title === "string" && definition.title.trim()
        ? definition.title.trim()
        : "Untitled Database";
      const systemDatabaseKey =
        typeof definition.systemDatabaseKey === "string"
          ? definition.systemDatabaseKey
          : null;
      const href = skillId
        ? `/skills/${skillId}/notes/${noteId}/databases/${definitionId}`
        : monumentId
          ? `/monuments/${monumentId}/notes/${noteId}/databases/${definitionId}`
          : null;
      if (!href) {
        return [];
      }

      return [
        {
          databaseId: definitionId,
          title,
          noteId,
          skillId,
          monumentId,
          href,
          iconKey: getBodyDatabaseIconKey({
            iconKey: definition.iconKey,
            systemDatabaseKey,
            title,
          }),
          systemDatabaseKey,
        },
      ];
    },
  );
}

function getMetadataDatabases(
  metadata: Record<string, unknown> | null | undefined,
): NoteDatabaseDefinitions {
  const databases = metadata?.databases;
  return databases && typeof databases === "object" && !Array.isArray(databases)
    ? (databases as NoteDatabaseDefinitions)
    : {};
}

function getMetadataDatabaseEntries(
  metadata: Record<string, unknown> | null | undefined,
): NoteDatabaseEntries {
  const databaseEntries = metadata?.databaseEntries;
  return databaseEntries && typeof databaseEntries === "object" && !Array.isArray(databaseEntries)
    ? (databaseEntries as NoteDatabaseEntries)
    : {};
}

type QuickAddNote = {
  id: string;
  title: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
};

function toQuickAddNote(note: {
  id: string;
  title?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
}): QuickAddNote {
  return {
    id: note.id,
    title: note.title ?? null,
    content: note.content ?? null,
    metadata: note.metadata ?? null,
  };
}

function QuickAddStatusDialog({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black/58 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Database entry form"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-[28px] border border-white/[0.05] bg-[#090909] px-5 py-6 text-center shadow-[0_24px_80px_-32px_rgba(0,0,0,1)]">
        <p className="text-sm font-medium text-white/68">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 inline-flex h-10 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.045] px-4 text-sm font-semibold text-white/68 outline-none transition hover:bg-white/[0.07] hover:text-white/86 focus-visible:ring-1 focus-visible:ring-white/24"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function TopNavQuickAddEntrySheet({
  target,
  onClose,
}: {
  target: QuickAddBodyDatabaseTarget;
  onClose: () => void;
}) {
  const [note, setNote] = useState<QuickAddNote | null>(null);
  const [noteMetadata, setNoteMetadata] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setLoadError(null);
    setNote(null);
    setNoteMetadata(null);

    (async () => {
      try {
        const fetchedNote = target.skillId
          ? await getNote(target.skillId, target.noteId)
          : target.monumentId
            ? await getMonumentNote(target.monumentId, target.noteId)
            : null;

        if (!isMounted) return;

        if (!fetchedNote) {
          setLoadError("Database not found.");
          return;
        }

        setNote(toQuickAddNote(fetchedNote));
        setNoteMetadata(fetchedNote.metadata ?? null);
      } catch (error) {
        console.error("Failed to load quick-add database", {
          error,
          databaseId: target.databaseId,
          noteId: target.noteId,
        });
        if (isMounted) {
          setLoadError("Unable to open this form right now.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [target.databaseId, target.monumentId, target.noteId, target.requestKey, target.skillId]);

  const databaseDefinition = useMemo<NoteDatabaseDefinition | null>(() => {
    const definition = getMetadataDatabases(noteMetadata)[target.databaseId];
    if (!definition) return null;

    return {
      ...definition,
      id: definition.id || target.databaseId,
    };
  }, [noteMetadata, target.databaseId]);

  async function saveQuickAddEntry(entry: NoteDatabaseEntry) {
    if (!note || !databaseDefinition) {
      throw new Error("Missing quick-add database.");
    }

    const currentEntries = getMetadataDatabaseEntries(noteMetadata);
    const nextDatabaseEntries: NoteDatabaseEntries = {
      ...currentEntries,
      [databaseDefinition.id]: [...(currentEntries[databaseDefinition.id] ?? []), entry],
    };
    const nextMetadata = {
      ...(noteMetadata ?? {}),
      databaseEntries: nextDatabaseEntries,
    };

    const savedNote = target.skillId
      ? await updateSkillNote(
          target.skillId,
          note.id,
          {
            title: note.title ?? "Untitled",
            content: note.content ?? "",
          },
          { metadata: nextMetadata },
        )
      : target.monumentId
        ? await updateMonumentNote(target.monumentId, note.id, {
            title: note.title ?? "Untitled",
            content: note.content ?? "",
            metadata: nextMetadata,
          })
        : null;

    if (!savedNote) {
      throw new Error("Unable to save quick-add database entry.");
    }

    setNote(toQuickAddNote(savedNote));
    setNoteMetadata(savedNote.metadata ?? nextMetadata);
    window.dispatchEvent(new Event("creator:pinned-body-databases-changed"));

    if (target.skillId) {
      window.dispatchEvent(
        new CustomEvent("creator:skill-notes-changed", {
          detail: { skillId: target.skillId, noteId: savedNote.id },
        }),
      );
    }
  }

  if (isLoading) {
    return <QuickAddStatusDialog message="Opening form..." onClose={onClose} />;
  }

  if (loadError || !databaseDefinition) {
    return (
      <QuickAddStatusDialog
        message={loadError ?? "Database not found."}
        onClose={onClose}
      />
    );
  }

  return (
    <NoteDatabaseEntrySheet
      key={`${target.requestKey}:${databaseDefinition.id}`}
      databaseDefinition={databaseDefinition}
      onClose={onClose}
      onSaveEntry={saveQuickAddEntry}
    />
  );
}

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const shouldHideNav = isScheduleRoute(pathname);
  const { profile, userId } = useProfile();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [pinnedBodyDatabases, setPinnedBodyDatabases] = useState<PinnedBodyDatabase[]>([]);
  const [quickAddTarget, setQuickAddTarget] = useState<QuickAddBodyDatabaseTarget | null>(null);
  const [isCartQuickViewOpen, setIsCartQuickViewOpen] = useState(false);
  const [isBodyMenuOpen, setIsBodyMenuOpen] = useState(false);
  const [isBodyPortalReady, setIsBodyPortalReady] = useState(false);
  const bodyMenuRef = useRef<HTMLDivElement | null>(null);
  const bodyMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const {
    items,
    itemCount,
    subtotal,
    isCheckoutExperienceOpen,
    checkoutState,
    openCheckoutExperience,
    closeCheckoutExperience,
    clearCart,
    initiateCheckout,
  } = useAppCart();

  const prefetchPriorityEditor = useCallback(() => {
    router.prefetch("/schedule/priorities");
  }, [router]);

  const handleQuickViewCheckout = useCallback(() => {
    setIsCartQuickViewOpen(false);
    requestAnimationFrame(() => {
      openCheckoutExperience();
    });
  }, [openCheckoutExperience]);

  useEffect(() => {
    if (isCheckoutExperienceOpen) {
      setIsCartQuickViewOpen(false);
    }
  }, [isCheckoutExperienceOpen]);

  useEffect(() => {
    setIsBodyPortalReady(true);
  }, []);

  useEffect(() => {
    if (!isBodyMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (
        target &&
        (bodyMenuRef.current?.contains(target) ||
          bodyMenuTriggerRef.current?.contains(target))
      ) {
        return;
      }

      setIsBodyMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsBodyMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBodyMenuOpen]);

  useEffect(() => {
    if (!supabase || shouldHideNav) {
      setPinnedBodyDatabases([]);
      return;
    }

    const getUserEmail = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUser(user ?? null);
      setUserEmail(user?.email || null);
    };

    getUserEmail();
  }, [shouldHideNav, supabase]);

  useEffect(() => {
    if (!supabase || shouldHideNav || !currentUser?.id) {
      setPinnedBodyDatabases([]);
      return;
    }

    let isCancelled = false;

    const loadPinnedBodyDatabases = async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("id, skill_id, monument_id, metadata")
        .eq("user_id", currentUser.id)
        .not("metadata", "is", null);

      if (isCancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load pinned body note databases", { error });
        setPinnedBodyDatabases([]);
        return;
      }

      const pinnedDatabases = ((data ?? []) as PinnedBodyDatabaseNoteRow[]).flatMap((note) =>
        getPinnedBodyDatabasesFromMetadata({
          metadata: note.metadata,
          noteId: note.id,
          skillId: note.skill_id ?? null,
          monumentId: note.monument_id ?? null,
        }),
      );

      setPinnedBodyDatabases(sortPinnedBodyDatabases(pinnedDatabases));
    };

    const handlePinnedBodyDatabasesChanged = () => {
      void loadPinnedBodyDatabases();
    };

    loadPinnedBodyDatabases();
    window.addEventListener(
      "creator:pinned-body-databases-changed",
      handlePinnedBodyDatabasesChanged,
    );

    return () => {
      isCancelled = true;
      window.removeEventListener(
        "creator:pinned-body-databases-changed",
        handlePinnedBodyDatabasesChanged,
      );
    };
  }, [currentUser?.id, shouldHideNav, supabase]);

  if (shouldHideNav) {
    return null;
  }

  const bodyPanelRows =
    pinnedBodyDatabases.length > 0
      ? pinnedBodyDatabases.map((database) => ({
          key: `${database.noteId}:${database.databaseId}`,
          label: database.title,
          iconKey: database.iconKey,
          onClick: () => {
            setIsBodyMenuOpen(false);
            router.push(database.href);
          },
          onAddEntryClick: isDefaultPinnedBodyDatabase(database)
            ? () => {
                setIsBodyMenuOpen(false);
                setQuickAddTarget({
                  ...database,
                  requestKey: Date.now(),
                });
              }
            : undefined,
        }))
      : BODY_FALLBACK_ROWS.map((row) => ({
          key: row.label,
          label: row.label,
          iconKey: row.iconKey,
          onClick: () => setIsBodyMenuOpen(false),
          onAddEntryClick: undefined,
        }));

  const bodyIntakePanel = isBodyMenuOpen ? (
    <div
      id="body-intake-panel"
      ref={bodyMenuRef}
      className="app-popover fixed left-0 z-[9999] w-48 rounded-r-lg border border-l-0 p-1 backdrop-blur"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 3.75rem)" }}
    >
      <div className="flex flex-col gap-1">
        {bodyPanelRows.map(({ key, label, iconKey, onClick, onAddEntryClick }) =>
          onAddEntryClick ? (
            <div
              key={key}
              className="flex h-9 w-full items-center rounded-md text-sm text-[var(--text)] transition hover:bg-[var(--card)] focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--accent)]"
            >
              <button
                type="button"
                aria-label={label}
                onClick={onClick}
                className="flex min-w-0 flex-1 self-stretch items-center gap-2 rounded-l-md px-2 text-left focus-visible:outline-none"
              >
                <BodyPanelRowIcon iconKey={iconKey} />
                <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
              </button>
              <BodyPanelAddEntryButton label={label} onClick={onAddEntryClick} />
            </div>
          ) : (
            <button
              key={key}
              type="button"
              aria-label={label}
              onClick={onClick}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <BodyPanelRowIcon iconKey={iconKey} />
              <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
              <BodyPanelProgressRing label={label} />
            </button>
          ),
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <nav className="app-top-nav w-full flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 border-b backdrop-blur">
        <div className="flex items-center gap-0.5">
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) {
                prefetchPriorityEditor();
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                className="h-11 w-11 p-2 hover:text-gray-200 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 [-webkit-tap-highlight-color:transparent]"
                aria-label="Open menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              alignOffset={-16}
              className="app-nav-menu"
            >
              <DropdownMenuItem asChild>
                <Link
                  href="/schedule/priorities"
                  prefetch
                  className="text-[var(--muted)]"
                  onFocus={prefetchPriorityEditor}
                  onMouseEnter={prefetchPriorityEditor}
                >
                  Priority Editor
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/focus-pomo" className="text-[var(--muted)]">
                  FocusPomo
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/schedule/matrix" className="text-[var(--muted)]">
                  Matrix
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/analytics">Analytics</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/help">Help</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            ref={bodyMenuTriggerRef}
            type="button"
            className="app-nav-icon inline-flex h-11 w-11 select-none items-center justify-center rounded-full p-2 backdrop-blur transition focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:outline-none [-webkit-tap-highlight-color:transparent]"
            aria-label="Open body intake panel"
            aria-expanded={isBodyMenuOpen}
            aria-controls="body-intake-panel"
            onClick={() => setIsBodyMenuOpen((open) => !open)}
          >
            <Icon icon="game-icons:stomach" className="h-5 w-5 text-zinc-500" aria-hidden="true" />
          </button>
        </div>


        <span className="font-semibold" data-testid="username">
          {profile?.username || userEmail || "Guest"}
        </span>
        <div className="flex items-center gap-3">
          <AppCartQuickView
            cartItems={items}
            itemCount={itemCount}
            subtotal={subtotal}
            open={isCartQuickViewOpen}
            onOpenChange={setIsCartQuickViewOpen}
            onCheckout={handleQuickViewCheckout}
            onClearCart={clearCart}
            isCheckoutDisabled={checkoutState.status === "loading"}
          />
          <TopNavAvatar profile={profile} userId={userId} />
        </div>
      </nav>
      <AppCheckoutFullscreen
        open={isCheckoutExperienceOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeCheckoutExperience();
          }
        }}
        items={items}
        subtotal={subtotal}
        onCheckoutInitiate={initiateCheckout}
        isSubmitting={checkoutState.status === "loading"}
        errorMessage={checkoutState.status === "error" ? checkoutState.error : null}
        checkoutResponse={checkoutState.response}
      />
      {isBodyPortalReady && bodyIntakePanel
        ? createPortal(bodyIntakePanel, document.body)
        : null}
      {isBodyPortalReady && quickAddTarget
        ? createPortal(
            <TopNavQuickAddEntrySheet
              key={`${quickAddTarget.requestKey}:${quickAddTarget.noteId}:${quickAddTarget.databaseId}`}
              target={quickAddTarget}
              onClose={() => setQuickAddTarget(null)}
            />,
            document.body,
          )
        : null}
    </>
  );
}
