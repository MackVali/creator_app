"use client";

import type { User } from "@supabase/supabase-js";
import { Menu } from "lucide-react";
import TopNavAvatar from "./TopNavAvatar";
import { useProfile } from "@/lib/hooks/useProfile";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";
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
        <div className="flex items-center gap-2.5">
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
