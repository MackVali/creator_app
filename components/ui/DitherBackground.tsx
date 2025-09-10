import { cn } from "@/lib/utils";

interface DitherBackgroundProps {
  /** Optional additional classes to override colors or size */
  className?: string;
}

export default function DitherBackground({ className }: DitherBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 h-full w-full [background-size:8px_8px] bg-[radial-gradient(circle_at_1px_1px,theme(colors.neutral.200)_1px,transparent_0)] dark:bg-[radial-gradient(circle_at_1px_1px,theme(colors.neutral.800)_1px,transparent_0)]",
        className
      )}
    />
  );
}

