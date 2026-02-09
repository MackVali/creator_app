"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
  label: string;
  overlayClassName?: string;
}

export function ComingSoonModal({
  isOpen,
  onClose,
  label,
  overlayClassName,
}: ComingSoonModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4${
        overlayClassName ? ` ${overlayClassName}` : ""
      }`}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[300px]">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Add {label}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 text-center text-white">{label} form coming soon!</div>
      </div>
    </div>,
    document.body
  );
}
