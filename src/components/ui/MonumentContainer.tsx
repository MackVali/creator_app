import React from "react";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { MonoCard } from "@/components/ui/MonoCard";

export function MonumentContainer(){
  return (
    <Section title={<Link href="/monuments">Monuments</Link>} className="mt-2">
      <div className="px-4 overflow-x-auto scroll-snap">
        <div className="flex">
          <MonoCard emoji="🏆" title="Achievement" value={5} />
          <MonoCard emoji="🎗️" title="Legacy" value={10} />
          <MonoCard emoji="🟊" title="Triumph" value={4} />
          <MonoCard emoji="⛰️" title="Pinnacle" value={7} />
        </div>
      </div>
    </Section>
  );
}

