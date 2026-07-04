"use client";

import * as React from "react";
import { Capacitor } from "@capacitor/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { X, AlertCircle, CheckCircle, Info, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Toast {
  id: string;
  title: string;
  description?: string;
  type: "success" | "error" | "warning" | "info";
  action?: {
    label: string;
    onClick: () => void;
  };
}

type StatusIslandState = "idle" | "processing" | "success" | "error";

interface StatusIslandMessage {
  id: string;
  state: StatusIslandState;
  title: string;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  statusIsland: StatusIslandMessage;
  setStatusIsland: (status: Omit<StatusIslandMessage, "id">) => void;
  clearStatusIsland: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const IDLE_STATUS_ISLAND: StatusIslandMessage = {
  id: "idle",
  state: "idle",
  title: "",
};

const PROCESSING_KEYWORDS = [
  "adding",
  "creating",
  "loading",
  "placing",
  "posting",
  "publishing",
  "saving",
  "scheduling",
  "syncing",
  "updating",
];

const LIGHTWEIGHT_SUCCESS_KEYWORDS = [
  "added",
  "created",
  "copied",
  "complete",
  "completed",
  "deleted",
  "placed",
  "posted",
  "published",
  "ready",
  "removed",
  "saved",
  "sent",
  "shared",
  "synced",
  "updated",
];

const LIGHTWEIGHT_ERROR_KEYWORDS = [
  "copy failed",
  "sync failed",
  "update failed",
  "save failed",
];

function normalizeToastText(title: string, description?: string) {
  return [title, description].filter(Boolean).join(" ").trim();
}

function compactStatusText(title: string, description?: string) {
  const text = normalizeToastText(title, description).replace(/\s+/g, " ");

  if (text.length <= 38) return text;

  return `${text.slice(0, 35).trimEnd()}...`;
}

function includesAnyKeyword(value: string, keywords: string[]) {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function canUseStatusIslandSurface() {
  if (typeof window === "undefined") return false;

  const platform = Capacitor.getPlatform();
  const nativeIos = Capacitor.isNativePlatform() && platform === "ios";
  const userAgent = window.navigator.userAgent;
  const ipadOsDesktopMode =
    window.navigator.platform === "MacIntel" &&
    window.navigator.maxTouchPoints > 1;
  const browserIos = /iPad|iPhone|iPod/.test(userAgent) || ipadOsDesktopMode;
  const coarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ??
    window.navigator.maxTouchPoints > 0;
  const mobileViewport = window.innerWidth <= 820;

  return (nativeIos || browserIos) && coarsePointer && mobileViewport;
}

function shouldRouteToStatusIsland(toast: Omit<Toast, "id">) {
  if (!canUseStatusIslandSurface()) return false;
  if (toast.action) return false;

  const message = normalizeToastText(toast.title, toast.description);
  const hasLongDescription = Boolean(toast.description && toast.description.length > 48);
  if (message.length === 0 || message.length > 72 || hasLongDescription) {
    return false;
  }

  if (toast.type === "info") {
    return (
      toast.title.endsWith("...") ||
      toast.title.endsWith("…") ||
      includesAnyKeyword(message, PROCESSING_KEYWORDS) ||
      includesAnyKeyword(message, LIGHTWEIGHT_SUCCESS_KEYWORDS)
    );
  }

  if (toast.type === "success") {
    return includesAnyKeyword(message, LIGHTWEIGHT_SUCCESS_KEYWORDS);
  }

  if (toast.type === "error") {
    return !toast.description && includesAnyKeyword(message, LIGHTWEIGHT_ERROR_KEYWORDS);
  }

  return false;
}

function toStatusIslandState(type: Toast["type"], title: string): StatusIslandState {
  if (type === "success") return "success";
  if (type === "error") return "error";

  const normalizedTitle = title.toLowerCase();
  if (
    title.endsWith("...") ||
    title.endsWith("…") ||
    includesAnyKeyword(normalizedTitle, PROCESSING_KEYWORDS)
  ) {
    return "processing";
  }

  return "success";
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [statusIsland, setStatusIslandState] =
    useState<StatusIslandMessage>(IDLE_STATUS_ISLAND);
  const statusIslandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStatusIslandTimer = useCallback(() => {
    if (!statusIslandTimerRef.current) return;

    clearTimeout(statusIslandTimerRef.current);
    statusIslandTimerRef.current = null;
  }, []);

  const clearStatusIsland = useCallback(() => {
    clearStatusIslandTimer();
    setStatusIslandState(IDLE_STATUS_ISLAND);
  }, [clearStatusIslandTimer]);

  const setStatusIsland = useCallback(
    (status: Omit<StatusIslandMessage, "id">) => {
      clearStatusIslandTimer();

      const id = Math.random().toString(36).substr(2, 9);
      setStatusIslandState({ ...status, id });

      if (status.state === "success" || status.state === "error") {
        statusIslandTimerRef.current = setTimeout(() => {
          setStatusIslandState(IDLE_STATUS_ISLAND);
          statusIslandTimerRef.current = null;
        }, status.state === "success" ? 1800 : 2600);
      }
    },
    [clearStatusIslandTimer]
  );

  useEffect(() => clearStatusIslandTimer, [clearStatusIslandTimer]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      if (shouldRouteToStatusIsland(toast)) {
        setStatusIsland({
          state: toStatusIslandState(toast.type, toast.title),
          title: compactStatusText(toast.title, toast.description),
        });
        return;
      }

      const id = Math.random().toString(36).substr(2, 9);
      const newToast = { ...toast, id };
      setToasts((prev) => [...prev, newToast]);

      // Auto-remove after 5 seconds
      setTimeout(() => {
        removeToast(id);
      }, 5000);
    },
    [removeToast, setStatusIsland]
  );

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const value = useMemo(
    () => ({
      toasts,
      addToast,
      removeToast,
      clearToasts,
      statusIsland,
      setStatusIsland,
      clearStatusIsland,
    }),
    [
      toasts,
      addToast,
      removeToast,
      clearToasts,
      statusIsland,
      setStatusIsland,
      clearStatusIsland,
    ]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <CreatorStatusIsland />
      <ToastContainer />
    </ToastContext.Provider>
  );
}

function CreatorStatusIsland() {
  const { statusIsland } = useToast();
  const isIdle = statusIsland.state === "idle";

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-[2147483647] -translate-x-1/2 sm:top-[calc(env(safe-area-inset-top,0px)+0.75rem)]"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={cn(
          "flex h-9 items-center justify-center overflow-hidden rounded-full border border-white/[0.12] bg-black/[0.88] text-zinc-100 shadow-[0_14px_38px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-black/35 backdrop-blur-2xl transition-[width,opacity,transform] duration-300 ease-out motion-reduce:transition-none supports-[backdrop-filter]:bg-black/[0.72]",
          isIdle
            ? "w-10 scale-95 opacity-0"
            : "w-[min(calc(100vw-2rem),17rem)] scale-100 opacity-100"
        )}
      >
        {!isIdle && (
          <div className="flex min-w-0 items-center gap-2 px-3">
            <StatusIslandIcon state={statusIsland.state} />
            <span className="min-w-0 truncate text-[12.5px] font-medium leading-none tracking-normal text-zinc-100">
              {statusIsland.title}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIslandIcon({ state }: { state: StatusIslandState }) {
  if (state === "processing") {
    return (
      <Loader2
        className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-300 motion-reduce:animate-none"
        aria-hidden="true"
      />
    );
  }

  if (state === "error") {
    return (
      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-zinc-300" aria-hidden="true" />
    );
  }

  return (
    <CheckCircle className="h-3.5 w-3.5 shrink-0 text-zinc-300" aria-hidden="true" />
  );
}

function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[2147483647] flex w-[min(calc(100vw-1.5rem),22rem)] flex-col gap-2 sm:right-5 sm:top-[calc(env(safe-area-inset-top)+1rem)] sm:w-[22rem]">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}

function Toast({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return <CheckCircle className="h-3.5 w-3.5 text-emerald-200" />;
      case "error":
        return <AlertCircle className="h-3.5 w-3.5 text-rose-200" />;
      case "warning":
        return <AlertTriangle className="h-3.5 w-3.5 text-amber-200" />;
      case "info":
        return <Info className="h-3.5 w-3.5 text-sky-200" />;
    }
  };

  const getToneClasses = () => {
    switch (toast.type) {
      case "success":
        return "from-emerald-300/10";
      case "error":
        return "from-rose-300/10";
      case "warning":
        return "from-amber-300/10";
      case "info":
        return "from-sky-300/10";
    }
  };

  return (
    <div
      className={cn(
        "pointer-events-auto relative overflow-hidden rounded-xl border border-white/[0.09] px-3 py-2.5 text-zinc-100 shadow-[0_18px_45px_rgba(0,0,0,0.34),0_2px_8px_rgba(0,0,0,0.22)] ring-1 ring-black/30 backdrop-blur-2xl transition-all duration-300 ease-out",
        "bg-gradient-to-r via-zinc-950/90 to-zinc-950/80 supports-[backdrop-filter]:via-zinc-950/75 supports-[backdrop-filter]:to-zinc-950/70",
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/15 before:content-[''] after:absolute after:inset-y-1.5 after:left-0 after:w-px after:bg-white/20 after:content-['']",
        getToneClasses()
      )}
    >
      <div className="relative flex items-start gap-2.5">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] shadow-inner shadow-white/[0.03]">
          {getIcon()}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5 pr-1">
          <h4 className="break-words text-[13px] font-medium leading-5 text-zinc-50">
            {toast.title}
          </h4>
          {toast.description && (
            <p className="break-words text-xs leading-5 text-zinc-300/90">
              {toast.description}
            </p>
          )}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-1 inline-flex h-7 items-center rounded-md border border-white/[0.1] bg-white/[0.06] px-2 text-xs font-medium text-zinc-100 transition-colors hover:border-white/[0.16] hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-white/20"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          onClick={() => onRemove(toast.id)}
          className="-mr-1 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-white/20"
          aria-label="Close toast"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// Convenience functions for common toast types
export function useToastHelpers() {
  const { addToast } = useToast();

  return {
    success: (title: string, description?: string) =>
      addToast({ title, description, type: "success" }),
    error: (title: string, description?: string, retry?: () => void) =>
      addToast({
        title,
        description,
        type: "error",
        action: retry ? { label: "Retry", onClick: retry } : undefined,
      }),
    warning: (title: string, description?: string) =>
      addToast({ title, description, type: "warning" }),
    info: (title: string, description?: string) =>
      addToast({ title, description, type: "info" }),
  };
}
