"use client";

import { useEffect, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MemoNoteSheetProps {
  open: boolean;
  habitName: string;
  skillId: string | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (content: string) => void;
}

export function MemoNoteSheet({
  open,
  habitName,
  skillId,
  saving = false,
  error = null,
  onClose,
  onSubmit,
}: MemoNoteSheetProps) {
  const [content, setContent] = useState("");

  useEffect(() => {
    if (open) {
      setContent("");
    }
  }, [open]);

  const canSubmit = !saving && Boolean(content.trim()) && Boolean(skillId);

  const helperMessage = !skillId
    ? "Link this memo habit to a skill to capture notes."
    : "Write your memo for today. We'll tuck it under this habit's skill.";

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <SheetContent side="bottom" className="max-h-[80vh] bg-[#05070c] text-white">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-lg font-semibold">
            {habitName ? `${habitName} memo` : "New memo"}
          </SheetTitle>
          <SheetDescription className="text-sm text-white/60">
            {helperMessage}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Capture a quick reflection or note for this habit's skill."
            className="min-h-[180px] rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/40 focus:border-indigo-400/60 focus-visible:ring-0"
            disabled={saving || !skillId}
          />
          {error ? (
            <p className="mt-2 text-xs text-red-300">{error}</p>
          ) : null}
        </div>
        <SheetFooter className="flex-row items-center justify-end gap-3 border-t border-white/10 bg-white/[0.02] px-4 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="text-white/70 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onSubmit(content)}
            disabled={!canSubmit}
            className={cn(
              "min-w-[120px] rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/90",
              !canSubmit && "opacity-60"
            )}
          >
            {saving ? "Saving…" : "Save memo"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default MemoNoteSheet;
