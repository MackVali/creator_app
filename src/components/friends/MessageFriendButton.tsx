"use client";

import {
  useEffect,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import type { Friend } from "@/types/friends";

interface MessageFriendButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "className" | "type" | "aria-label"
  > {
  friend: Friend;
  className?: string;
  children?: ReactNode;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  "aria-label"?: string;
}

export default function MessageFriendButton({
  friend,
  className,
  children,
  "aria-label": ariaLabel,
  type,
  onClick,
  ...rest
}: MessageFriendButtonProps) {
  const router = useRouter();

  const displayName = friend.displayName || friend.username;
  const triggerLabel = children ?? "Message";
  const computedAriaLabel = ariaLabel ?? `Message ${displayName}`;
  const isActionable = Boolean(friend.userId);
  const inboxHref = friend.userId ? `/inbox/${friend.userId}` : null;

  useEffect(() => {
    if (!isActionable || !inboxHref) {
      return;
    }

    router.prefetch(inboxHref);
  }, [inboxHref, isActionable, router]);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented || !inboxHref) {
      return;
    }

    router.push(inboxHref);
  }

  if (!isActionable) {
    return (
      <button
        {...rest}
        type={type ?? "button"}
        className={cn(
          "cursor-not-allowed opacity-50",
          className
        )}
        aria-label={computedAriaLabel}
        aria-disabled="true"
        disabled
        title="This contact can't receive messages yet."
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <button
      {...rest}
      type={type ?? "button"}
      className={className}
      aria-label={computedAriaLabel}
      onClick={handleClick}
    >
      {triggerLabel}
    </button>
  );
}
