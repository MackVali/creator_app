import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionProps = {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  hideBackground?: boolean;
};

export function Section({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  hideBackground = false,
}: SectionProps) {
  const hasHeader = title || description || action;

  return (
    <section
      className={cn(
        "relative mx-4 mt-6 overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.02] px-5 py-6 shadow-[0_24px_60px_rgba(8,8,18,0.45)] backdrop-blur-2xl",
        hideBackground && "border-transparent bg-transparent px-0 py-0 shadow-none backdrop-blur-none",
        className,
      )}
    >
      {!hideBackground ? (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-[26px] bg-[radial-gradient(circle_at_top,_rgba(80,200,255,0.12),_transparent_55%)]" />
          <span className="pointer-events-none absolute inset-px rounded-[25px] bg-gradient-to-br from-white/[0.05] via-white/[0.015] to-transparent" />
          <span className="pointer-events-none absolute -right-12 top-10 h-32 w-32 rounded-full bg-emerald-400/15 blur-3xl" />
          <span className="pointer-events-none absolute -left-10 -top-12 h-28 w-28 rounded-full bg-sky-500/15 blur-2xl" />
        </>
      ) : null}

      <div className="relative z-10">
        {hasHeader ? (
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              {title ? (
                <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/80">
                  {title}
                </div>
              ) : null}
              {description ? (
                <p className="mt-2 max-w-prose text-sm font-medium leading-relaxed text-white/60">
                  {description}
                </p>
              ) : null}
            </div>
            {action ? (
              <div className="text-sm font-semibold text-white/75">{action}</div>
            ) : null}
          </div>
        ) : null}

        <div className={cn("space-y-4", contentClassName)}>{children}</div>
      </div>
    </section>
  );
}
