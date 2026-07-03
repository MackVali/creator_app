"use client";

import * as React from "react";
import { createContext, useContext, useState } from "react";
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";
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

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const clearToasts = () => {
    setToasts([]);
  };

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, clearToasts }}
    >
      {children}
      <ToastContainer />
    </ToastContext.Provider>
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
