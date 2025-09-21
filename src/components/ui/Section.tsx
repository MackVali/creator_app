import React from "react";

import { cn } from "@/lib/utils";

type SectionTone = "plain" | "frosted";

interface SectionProps {
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  tone?: SectionTone;
}

export function Section({
  title,
  children,
  className,
  tone = "plain",
}: SectionProps) {
  return (
    <section
      className={cn(
        "section",
        tone === "frosted" &&
          "frosted-surface border border-white/10 bg-white/5 backdrop-blur",
        className,
      )}
    >
      {title ? <div className="h-label mb-3">{title}</div> : null}
      {children}
    </section>
  );
}
