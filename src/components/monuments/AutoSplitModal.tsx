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
          className="space-y-3"
        >
          <SheetHeader>
            <SheetTitle>Auto Split Milestones</SheetTitle>
          </SheetHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="w-24 text-sm">Count</label>
              <Input
              type="number"
              value={count}
              min={1}
              onChange={(e) => setCount(parseInt(e.target.value, 10))}
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
              <Button
                size="sm"
                onClick={() => {
                  submit();
                  onClose();
                }}
              >
                Split
              </Button>
            </div>
          </div>
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}

export default AutoSplitModal;

