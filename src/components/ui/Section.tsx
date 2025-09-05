import React from "react";
import clsx from "clsx";

export function Section({
  title,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "bg-panel rounded-lg border border-border shadow-soft p-6 md:p-7",
        className
      )}
    >
      {title ? (
        <h2 className="mb-4 text-textmed text-[12.5px] md:text-[13px] font-semibold tracking-section uppercase">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
