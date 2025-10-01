"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical, X } from "lucide-react";
import { Reorder, motion } from "framer-motion";

import type { Category } from "./useSkillsData";

interface ReorderCategoriesModalProps {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onSubmit: (ordered: Category[]) => Promise<void> | void;
  isSubmitting?: boolean;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const panelVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

export default function ReorderCategoriesModal({
  open,
  categories,
  onClose,
  onSubmit,
  isSubmitting = false,
}: ReorderCategoriesModalProps) {
  const [mounted, setMounted] = useState(false);
  const [localOrder, setLocalOrder] = useState<Category[]>([]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const orderedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const orderA = typeof a.order === "number" ? a.order : Number.POSITIVE_INFINITY;
      const orderB = typeof b.order === "number" ? b.order : Number.POSITIVE_INFINITY;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [categories]);

  useEffect(() => {
    if (open) {
      setLocalOrder(orderedCategories);
    }
  }, [open, orderedCategories]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!mounted || !open) {
    return null;
  }

  const handleSubmit = async () => {
    if (isSubmitting) return;
    await onSubmit(localOrder);
  };

  return createPortal(
    <motion.div
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={overlayVariants}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
    >
      <motion.div
        variants={panelVariants}
        className="relative flex w-full max-w-xl flex-col gap-6 rounded-3xl border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl backdrop-blur"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Reorder skill categories</h2>
            <p className="mt-1 text-sm text-slate-300">
              Drag and drop the categories below to set how they appear in your carousel.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
            disabled={isSubmitting}
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <Reorder.Group
            axis="y"
            values={localOrder}
            onReorder={setLocalOrder}
            className="flex flex-col gap-3"
          >
            {localOrder.map((category, index) => (
              <Reorder.Item
                key={category.id}
                value={category}
                className="group flex cursor-grab items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-base font-medium text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:cursor-grabbing"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold text-white/80">
                  {index + 1}
                </span>
                <div className="flex flex-1 flex-col">
                  <span className="text-lg font-semibold leading-tight">{category.name}</span>
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    New position {index + 1}
                  </span>
                </div>
                <GripVertical className="h-5 w-5 text-slate-400 transition group-hover:text-white" aria-hidden />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>
        <footer className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-full bg-blue-500 px-5 py-2 text-sm font-semibold uppercase tracking-wide text-white shadow-lg transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save order"}
          </button>
        </footer>
      </motion.div>
    </motion.div>,
    document.body
  );
}
