"use client";

import { useEffect, useMemo, useState } from "react";
import { Reorder, motion } from "framer-motion";
import { GripVertical, X } from "lucide-react";

import type { Category } from "./useSkillsData";

interface ReorderCatsModalProps {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onSave: (ordered: Category[]) => Promise<void>;
  isSaving?: boolean;
}

function useBodyScrollLock(lock: boolean) {
  useEffect(() => {
    if (!lock) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [lock]);
}

export default function ReorderCatsModal({
  open,
  categories,
  onClose,
  onSave,
  isSaving = false,
}: ReorderCatsModalProps) {
  const [localOrder, setLocalOrder] = useState<Category[]>(categories);
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (open) {
      setLocalOrder(categories.map((cat) => ({ ...cat })));
      setError(null);
    }
  }, [categories, open]);

  const hasChanges = useMemo(() => {
    if (localOrder.length !== categories.length) return true;
    return localOrder.some((cat, index) => cat.id !== categories[index]?.id);
  }, [categories, localOrder]);

  if (!open) return null;

  const handleSave = async () => {
    setError(null);
    try {
      await onSave(localOrder.map((cat, index) => ({ ...cat, order: index })));
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save order";
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0b0d17] text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Reorder categories</h2>
            <p className="text-sm text-slate-400">
              Drag categories to arrange how they appear in your skills carousel.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-white/20 hover:text-white"
            aria-label="Close"
            disabled={isSaving}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {localOrder.length === 0 ? (
            <p className="text-sm text-slate-400">No categories available.</p>
          ) : (
            <Reorder.Group axis="y" values={localOrder} onReorder={setLocalOrder} className="space-y-3">
              {localOrder.map((cat) => {
                const icon = cat.icon?.trim();
                const displayIcon = icon && icon.length > 0 ? icon : cat.name.charAt(0).toUpperCase();
                return (
                  <Reorder.Item
                    key={cat.id}
                    value={cat}
                    as={motion.div}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg backdrop-blur-sm"
                    whileDrag={{ scale: 1.02 }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-base font-semibold">
                        {displayIcon}
                      </span>
                      <span className="text-sm font-medium">{cat.name}</span>
                    </div>
                    <GripVertical className="h-5 w-5 text-slate-400" />
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          )}
        </div>
        {error && (
          <div className="px-6 pb-2 text-sm text-red-300">{error}</div>
        )}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-black/40 px-6 py-4">
          <button
            type="button"
            className="text-sm font-medium text-slate-400 transition hover:text-slate-200"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || isSaving || localOrder.length === 0}
            className="inline-flex items-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save order"}
          </button>
        </div>
      </div>
    </div>
  );
}
