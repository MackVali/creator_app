import React from "react";

interface Props {
  title: string;
  children: React.ReactNode;
}

export default function Section({ title, children }: Props) {
  return (
    <section>
      <h2 className="mb-4 md:mb-6 text-sm md:text-base font-medium uppercase tracking-wide text-white/70">
        {title}
      </h2>
      {children}
    </section>
  );
}
