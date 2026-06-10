"use client";

import type { User } from "@supabase/supabase-js";
import { Dumbbell, Droplet, Menu, Pill, Utensils } from "lucide-react";
import { Icon } from "@iconify/react";
import TopNavAvatar from "./TopNavAvatar";
import { useProfile } from "@/lib/hooks/useProfile";
import { getSupabaseBrowser } from "@/lib/supabase";
import { type SVGProps, useCallback, useEffect, useMemo, useState } from "react";
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/35 p-2 text-white/80 backdrop-blur transition hover:border-white/25 hover:bg-black/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black [-webkit-tap-highlight-color:transparent]"
                aria-label="Open body intake panel"
              >
                <Icon icon="game-icons:stomach" className="h-5 w-5 text-zinc-500" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="w-[min(92vw,300px)] rounded-2xl border border-white/15 bg-[#05070c]/95 p-3 text-white shadow-[0_26px_70px_rgba(0,0,0,0.75)] backdrop-blur"
            >
              <div className="grid grid-cols-4 gap-2">
                {[
                  {
                    label: "Water",
                    Icon: Droplet,
                    tone: "border-sky-200/20 bg-[radial-gradient(circle_at_50%_22%,rgba(125,211,252,0.34),rgba(14,116,144,0.24)_48%,rgba(8,47,73,0.48)_100%)] text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_rgba(8,47,73,0.24)] hover:border-sky-100/35 hover:brightness-110",
                  },
                  {
                    label: "Food",
                    Icon: Utensils,
                    tone: "border-orange-200/20 bg-[radial-gradient(circle_at_50%_22%,rgba(251,146,60,0.34),rgba(154,52,18,0.28)_48%,rgba(67,20,7,0.52)_100%)] text-orange-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_rgba(67,20,7,0.24)] hover:border-orange-100/35 hover:brightness-110",
                  },
                  {
                    label: "Meds",
                    Icon: Pill,
                    tone: "border-red-200/20 bg-[radial-gradient(circle_at_50%_22%,rgba(248,113,113,0.34),rgba(153,27,27,0.28)_48%,rgba(69,10,10,0.52)_100%)] text-red-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_rgba(69,10,10,0.24)] hover:border-red-100/35 hover:brightness-110",
                  },
                  {
                    label: "Workout",
                    Icon: Dumbbell,
                    tone: "border-emerald-200/20 bg-[radial-gradient(circle_at_50%_22%,rgba(52,211,153,0.34),rgba(6,95,70,0.28)_48%,rgba(2,44,34,0.52)_100%)] text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_rgba(2,44,34,0.24)] hover:border-emerald-100/35 hover:brightness-110",
                  },
                ].map(({ label, Icon, tone }) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={label}
                    className={`flex aspect-square items-center justify-center rounded-2xl border transition duration-150 hover:-translate-y-0.5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070c] ${tone}`}
                  >
                    <Icon className="h-6 w-6 drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
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
    </>
  );
}
