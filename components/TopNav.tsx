"use client";

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

export default function TopNav() {
  const pathname = usePathname();
  const shouldHideNav = pathname?.startsWith("/schedule");
  const { profile, userId } = useProfile();
  const [userEmail, setUserEmail] = useState<string | null>(null);
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
      setUserEmail(user?.email || null);
    };

    getUserEmail();
  }, [shouldHideNav, supabase]);

  if (shouldHideNav) {
    return null;
  }

  return (
    <nav className="w-full flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 bg-black/80 text-white border-b border-white/10 backdrop-blur">
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-11 w-11 p-2 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              aria-label="Open menu"
    <>
      <nav className="w-full flex items-center justify-between px-4 py-2 bg-black/80 text-white border-b border-white/10 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-11 w-11 p-2 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
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
                <Link href="/goals">Goals</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/habits">Habits</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/help">Help</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
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
