"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { ProductCheckoutResponse } from "@/types/checkout";

export type AppCartItem = {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  image_url: string | null;
  quantity: number;
  sellerHandle: string;
  sellerUserId: string;
};

type CheckoutState = {
  status: "idle" | "loading" | "success" | "error";
  response: ProductCheckoutResponse | null;
  error: string | null;
};

type AddCartItemOptions = {
  allowMultipleUnits?: boolean;
};

type AppCartContextValue = {
  items: AppCartItem[];
  itemCount: number;
  subtotal: number;
  isCheckoutExperienceOpen: boolean;
  checkoutState: CheckoutState;
  addItem: (item: AppCartItem, options?: AddCartItemOptions) => string;
  clearCart: () => void;
  openCheckoutExperience: () => void;
  closeCheckoutExperience: () => void;
  initiateCheckout: () => Promise<void>;
};

const createIdleCheckoutState = (): CheckoutState => ({
  status: "idle",
  response: null,
  error: null,
});

const AppCartContext = createContext<AppCartContextValue | null>(null);

export function AppCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<AppCartItem[]>([]);
  const [isCheckoutExperienceOpen, setIsCheckoutExperienceOpen] = useState(false);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>(() => createIdleCheckoutState());

  const resetCheckoutState = useCallback(() => {
    setCheckoutState(createIdleCheckoutState());
  }, []);

  const addItem = useCallback((item: AppCartItem, options?: AddCartItemOptions) => {
    const allowMultipleUnits = options?.allowMultipleUnits ?? false;
    let message = "Added to cart";

    setItems((prev) => {
      const existingIndex = prev.findIndex((candidate) => candidate.id === item.id);
      if (existingIndex !== -1) {
        const existing = prev[existingIndex];
        if (allowMultipleUnits) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...existing,
            quantity: existing.quantity + Math.max(1, Math.floor(item.quantity)),
          };
          return updated;
        }
        message = "Already in cart (quantity locked to 1)";
        return prev;
      }

      return [
        ...prev,
        {
          ...item,
          quantity: Math.max(1, Math.floor(item.quantity)),
        },
      ];
    });

    return message;
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const openCheckoutExperience = useCallback(() => {
    if (items.length === 0) {
      return;
    }
    resetCheckoutState();
    setIsCheckoutExperienceOpen(true);
  }, [items.length, resetCheckoutState]);

  const closeCheckoutExperience = useCallback(() => {
    setIsCheckoutExperienceOpen(false);
    resetCheckoutState();
  }, [resetCheckoutState]);

  const initiateCheckout = useCallback(async () => {
    if (items.length === 0) {
      return;
    }

    const requestItems = items
      .map((item) => ({
        id: item.id,
        quantity: Math.max(1, Math.floor(item.quantity)),
      }))
      .filter((item) => item.id && item.quantity > 0);

    if (requestItems.length === 0) {
      setCheckoutState({
        status: "error",
        response: null,
        error: "Cart contains no valid items.",
      });
      return;
    }

    setCheckoutState({ status: "loading", response: null, error: null });

    try {
      const response = await fetch("/api/checkout/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: requestItems }),
      });

      const payload = (await response.json().catch(() => null)) as
        | ProductCheckoutResponse
        | { error?: string }
        | null;

      if (!response.ok || !payload || typeof payload !== "object") {
        const serverMessage =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to start checkout.";
        setCheckoutState({
          status: "error",
          response: null,
          error: serverMessage,
        });
        return;
      }

      if (typeof (payload as ProductCheckoutResponse).checkoutId !== "string") {
        setCheckoutState({
          status: "error",
          response: null,
          error: "Unexpected checkout response.",
        });
        return;
      }

      const checkoutPayload = payload as ProductCheckoutResponse;
      const checkoutUrl = checkoutPayload.payment?.checkoutUrl;
      if (!checkoutUrl) {
        setCheckoutState({
          status: "error",
          response: null,
          error: "Checkout session missing redirect URL.",
        });
        return;
      }

      setCheckoutState({
        status: "success",
        response: checkoutPayload,
        error: null,
      });

      if (typeof window !== "undefined") {
        window.location.assign(checkoutUrl);
      }
    } catch (error) {
      console.error("Failed to start checkout", error);
      setCheckoutState({
        status: "error",
        response: null,
        error: error instanceof Error ? error.message : "Unable to start checkout.",
      });
    }
  }, [items]);

  useEffect(() => {
    if (items.length === 0 && isCheckoutExperienceOpen) {
      setIsCheckoutExperienceOpen(false);
    }

    if (items.length === 0 && checkoutState.status !== "idle") {
      resetCheckoutState();
    }
  }, [checkoutState.status, isCheckoutExperienceOpen, items.length, resetCheckoutState]);

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0),
    [items],
  );

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + Math.max(1, item.quantity) * (typeof item.price === "number" ? item.price : 0),
        0,
      ),
    [items],
  );

  const value = useMemo<AppCartContextValue>(
    () => ({
      items,
      itemCount,
      subtotal,
      isCheckoutExperienceOpen,
      checkoutState,
      addItem,
      clearCart,
      openCheckoutExperience,
      closeCheckoutExperience,
      initiateCheckout,
    }),
    [
      addItem,
      checkoutState,
      clearCart,
      closeCheckoutExperience,
      initiateCheckout,
      isCheckoutExperienceOpen,
      itemCount,
      items,
      openCheckoutExperience,
      subtotal,
    ],
  );

  return <AppCartContext.Provider value={value}>{children}</AppCartContext.Provider>;
}

export function useAppCart() {
  const context = useContext(AppCartContext);
  if (!context) {
    throw new Error("useAppCart must be used inside AppCartProvider.");
  }
  return context;
}
