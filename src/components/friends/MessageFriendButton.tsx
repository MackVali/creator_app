"use client";

import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToastHelpers } from "@/components/ui/toast";
import { getSupabaseBrowser } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Friend } from "@/lib/mock/friends";

interface MessageFriendButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "className" | "type" | "aria-label"
  > {
  friend: Friend;
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
}

export default function MessageFriendButton({
  friend,
  className,
  children,
  "aria-label": ariaLabel,
  type,
  ...rest
}: MessageFriendButtonProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const toast = useToastHelpers();

  useEffect(() => {
    if (!open) {
      setMessage("");
    }
  }, [open]);

  const displayName = friend.displayName || friend.username;
  const firstName = displayName.split(" ")[0] || displayName;
  const triggerLabel = children ?? "Message";
  const computedAriaLabel = ariaLabel ?? `Message ${displayName}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) {
      return;
    }

    setIsSending(true);

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        throw new Error("Supabase client unavailable");
      }

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        throw new Error("You need to be signed in to send messages.");
      }

      const response = await fetch(
        `/api/friends/${encodeURIComponent(friend.username)}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: message,
            senderId: user.id,
            recipientId: friend.id,
          }),
        }
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Failed to send message.");
      }

      toast.success("Message sent", `Your note to ${displayName} is on its way.`);
      setOpen(false);
    } catch (error) {
      console.error("Failed to send friend message", error);
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong.";
      toast.error("Couldn’t send message", errorMessage);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          {...rest}
          type={type ?? "button"}
          className={className}
          aria-label={computedAriaLabel}
        >
          {triggerLabel}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="border-l border-white/10 bg-slate-950/95 text-white backdrop-blur"
      >
        <SheetHeader className="p-4 pb-2">
          <SheetTitle className="text-lg text-white">Message {displayName}</SheetTitle>
          <SheetDescription className="text-sm text-white/60">
            Start the conversation and we&rsquo;ll drop it straight into their inbox.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <div className="flex-1 space-y-3 px-4">
            <label className="flex flex-col gap-2 text-sm text-white/70">
              <span className="font-medium text-white">Message</span>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={`Say hi to ${displayName}...`}
                className="min-h-[140px] resize-none border-white/10 bg-slate-900/60 text-sm text-white placeholder:text-white/40 focus-visible:ring-blue-400"
              />
            </label>
            <p className="text-xs text-white/40">
              We&rsquo;ll let {firstName} know you reached out.
            </p>
          </div>

          <SheetFooter className="flex-row items-center justify-end gap-3 border-t border-white/5 bg-slate-900/40 p-4">
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="text-white/70 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </Button>
            </SheetClose>
            <Button
              type="submit"
              className={cn(
                "bg-white text-slate-950 hover:bg-white/90",
                isSending && "cursor-wait"
              )}
              disabled={isSending || !message.trim()}
            >
              {isSending ? "Sending..." : "Send message"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
