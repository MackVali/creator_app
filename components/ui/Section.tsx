import React from "react";

interface Props {
  title: string;
  children: React.ReactNode;
}

export default function Section({ title, children }: Props) {
  return (
    <section className="flex flex-col gap-4 md:gap-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-white/70">
        {title}
      </h2>
      {children}
    </section>
  );
}
