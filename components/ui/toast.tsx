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
    <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[2147483647] w-[min(calc(100vw-1.5rem),20rem)] space-y-1.5 sm:right-5 sm:top-[calc(env(safe-area-inset-top)+1rem)] sm:w-80">
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
        return <CheckCircle className="h-4 w-4 text-emerald-300" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-rose-300" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-300" />;
      case "info":
        return <Info className="h-4 w-4 text-sky-300" />;
    }
  };

  const getToneClasses = () => {
    switch (toast.type) {
      case "success":
        return "border-emerald-300/20 bg-emerald-300/[0.07]";
      case "error":
        return "border-rose-300/20 bg-rose-300/[0.07]";
      case "warning":
        return "border-amber-300/20 bg-amber-300/[0.07]";
      case "info":
        return "border-zinc-600/35 bg-zinc-800/[0.18]";
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 shadow-lg shadow-black/25 backdrop-blur-xl transition-all duration-300 ease-in-out",
        "bg-zinc-950/75 text-zinc-100 ring-1 ring-white/[0.08] supports-[backdrop-filter]:bg-zinc-950/60",
        getToneClasses()
      )}
    >
      <div className="flex items-start space-x-2.5">
        {getIcon()}
        <div className="flex-1 space-y-1">
          <h4 className="text-sm font-medium text-zinc-50">{toast.title}</h4>
          {toast.description && (
            <p className="text-xs leading-5 text-zinc-300">
              {toast.description}
            </p>
          )}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="text-sm font-medium text-white/90 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          onClick={() => onRemove(toast.id)}
          className="rounded-md p-0.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
          aria-label="Close toast"
        >
          <X className="h-4 w-4" />
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
