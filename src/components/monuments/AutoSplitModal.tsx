"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { motion } from "framer-motion";
import { spring } from "@/lib/motion";

interface AutoSplitModalProps {
  onClose: () => void;
  onSubmit: (count: number, target: Date) => void;
}

export function AutoSplitModal({ onClose, onSubmit }: AutoSplitModalProps) {
  const [count, setCount] = useState(3);
  const [date, setDate] = useState("");
  const [step, setStep] = useState<"form" | "preview">("form");
  const [preview, setPreview] = useState<Date[]>([]);

  function buildPreview() {
    const target = date ? new Date(date) : new Date();
    const today = new Date();
    const diff = target.getTime() - today.getTime();
    const stepMs = Math.floor(diff / count);
    const dates = Array.from({ length: count }, (_, i) =>
      new Date(today.getTime() + stepMs * (i + 1))
    );
    setPreview(dates);
    setStep("preview");
  }

  function submit() {
    const target = date ? new Date(date) : new Date();
    onSubmit(count, target);
  }

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="bottom">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={spring}
          className="space-y-2"
        >
          <SheetHeader>
            <SheetTitle>Auto Split Milestones</SheetTitle>
          </SheetHeader>
          {step === "form" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="w-24 text-sm">Count</label>
                <Input
                  type="number"
                  value={count}
                  min={1}
                  onChange={(e) =>
                    setCount(parseInt(e.target.value, 10) || 0)
                  }
                  className="h-8"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-24 text-sm">Target Date</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="sm" onClick={buildPreview} disabled={!date}>
                  Preview
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <ul className="space-y-1 text-sm">
                {preview.map((d, i) => (
                  <li key={i} className="flex justify-between">
                    <span>Milestone {i + 1}</span>
                    <span>{d.toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("form")}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    submit();
                    onClose();
                  }}
                >
                  Confirm
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}

export default AutoSplitModal;

