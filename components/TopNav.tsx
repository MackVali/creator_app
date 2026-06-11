"use client";

import type { User } from "@supabase/supabase-js";
import { createPortal } from "react-dom";
import { Dumbbell, Droplet, Menu, Utensils } from "lucide-react";
import { Icon } from "@iconify/react";
import TopNavAvatar from "./TopNavAvatar";
import { useProfile } from "@/lib/hooks/useProfile";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const shouldHideNav =
    pathname?.startsWith("/schedule") &&
    pathname !== "/schedule/matrix" &&
    !pathname?.startsWith("/schedule/matrix/");
  const { profile, userId } = useProfile();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
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

  if (shouldHideNav) {
    return null;
  }

  const bodyIntakePanel = isBodyMenuOpen ? (
    <div
      id="body-intake-panel"
      ref={bodyMenuRef}
      className="fixed left-0 z-[9999] w-48 rounded-r-lg border border-l-0 border-black bg-[#070707]/95 p-1 text-white shadow-[0_18px_44px_rgba(0,0,0,0.65)] backdrop-blur"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 3.75rem)" }}
    >
      <div className="flex flex-col gap-1">
        {[
          {
            label: "Nutrition",
            Icon: Utensils,
          },
          {
            label: "Hydration",
            Icon: Droplet,
          },
          {
            label: "Fitness",
            Icon: Dumbbell,
          },
        ].map(({ label, Icon }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-white/85 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070707]"
          >
            <Icon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
            <span
              className="relative ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/40 text-[8px] font-semibold text-white/80"
              aria-label={`${label} progress 0%`}
            >
              <span className="absolute inset-1 rounded-full border border-white/20 border-t-white/70" aria-hidden="true" />
              <span className="relative">0%</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <>
      <nav className="w-full flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 bg-black/80 text-white border-b border-white/10 backdrop-blur">
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
              className="bg-[#111111] border-[#2A2A2A] text-[#E6E6E6]"
            >
              <DropdownMenuItem asChild>
                <Link href="/analytics">Analytics</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/help">Help</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              {userIsTopNavAdmin(currentUser) ? (
                <DropdownMenuItem asChild>
                  <Link href="/schedule/priorities" className="text-zinc-500">
                    Priority Editor
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href="/focus-pomo" className="text-zinc-500">
                  PomoFocus
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/schedule/matrix" className="text-zinc-500">
                  Matrix
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            ref={bodyMenuTriggerRef}
            type="button"
            className="inline-flex h-11 w-11 select-none items-center justify-center rounded-full bg-black/35 p-2 text-white/80 backdrop-blur transition hover:bg-black/50 hover:text-white focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:outline-none [-webkit-tap-highlight-color:transparent]"
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
