"use client";

import type { User } from "@supabase/supabase-js";
import { createPortal } from "react-dom";
import { Dumbbell, Droplet, Menu, Table2 } from "lucide-react";
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

type RoleMetadata = {
  role?: unknown;
  roles?: unknown;
  is_admin?: unknown;
};

type PinnedBodyDatabase = {
  databaseId: string;
  title: string;
  noteId: string;
  href: string;
  iconKey: BodyDatabaseIconKey;
  systemDatabaseKey: string | null;
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

type BodyDatabaseIconKey = "stomach" | "droplet" | "dumbbell" | "table";

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

function getBodyDatabaseIconKey({
  iconKey,
  systemDatabaseKey,
  title,
}: {
  iconKey: unknown;
  systemDatabaseKey: string | null;
  title: string;
}): BodyDatabaseIconKey {
  if (iconKey === "stomach" || iconKey === "droplet" || iconKey === "dumbbell") {
    return iconKey;
  }

  const normalizedSystemKey = normalizeBodyDatabaseKey(systemDatabaseKey);
  if (normalizedSystemKey === "nutrition") return "stomach";
  if (normalizedSystemKey === "hydration") return "droplet";
  if (normalizedSystemKey === "fitness") return "dumbbell";

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

  const LucideIcon =
    iconKey === "droplet" ? Droplet : iconKey === "dumbbell" ? Dumbbell : Table2;

  return <LucideIcon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />;
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

function normalizeRole(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function collectRoles(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectRoles);
  }

  return [];
}

function userIsTopNavAdmin(user: User | null) {
  if (!user) {
    return false;
  }

  const userMetadata = (user.user_metadata ?? {}) as RoleMetadata;
  const appMetadata = (user.app_metadata ?? {}) as RoleMetadata;

  if (userMetadata.is_admin === true || appMetadata.is_admin === true) {
    return true;
  }

  const roles = [
    ...collectRoles(userMetadata.role),
    ...collectRoles(appMetadata.role),
    ...collectRoles(userMetadata.roles),
    ...collectRoles(appMetadata.roles),
  ];

  return roles.some((role) => normalizeRole(role) === "admin");
}


export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const shouldHideNav =
    pathname?.startsWith("/schedule") &&
    pathname !== "/schedule/matrix" &&
    !pathname?.startsWith("/schedule/matrix/");
  const { profile, userId } = useProfile();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [pinnedBodyDatabases, setPinnedBodyDatabases] = useState<PinnedBodyDatabase[]>([]);
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
        }))
      : BODY_FALLBACK_ROWS.map((row) => ({
          key: row.label,
          label: row.label,
          iconKey: row.iconKey,
          onClick: () => setIsBodyMenuOpen(false),
        }));

  const bodyIntakePanel = isBodyMenuOpen ? (
    <div
      id="body-intake-panel"
      ref={bodyMenuRef}
      className="app-popover fixed left-0 z-[9999] w-48 rounded-r-lg border border-l-0 p-1 backdrop-blur"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 3.75rem)" }}
    >
      <div className="flex flex-col gap-1">
        {bodyPanelRows.map(({ key, label, iconKey, onClick }) => (
          <button
            key={key}
            type="button"
            aria-label={label}
            onClick={onClick}
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <BodyPanelRowIcon iconKey={iconKey} />
            <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
            <span
              className="relative ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--subtle-surface)] text-[8px] font-semibold text-[var(--muted)]"
              aria-label={`${label} progress 0%`}
            >
              <span className="absolute inset-1 rounded-full border border-[var(--border)] border-t-[var(--muted)]" aria-hidden="true" />
              <span className="relative">0%</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <>
      <nav className="app-top-nav w-full flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 border-b backdrop-blur">
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
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
              className="app-nav-menu"
            >
              {userIsTopNavAdmin(currentUser) ? (
                <DropdownMenuItem asChild>
                  <Link href="/schedule/priorities" className="text-[var(--muted)]">
                    Priority Editor
                  </Link>
                </DropdownMenuItem>
              ) : null}
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
    </>
  );
}
