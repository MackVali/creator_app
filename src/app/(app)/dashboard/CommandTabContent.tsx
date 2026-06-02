"use client";

import { useRef } from "react";

import {
  CommandCirclesSection,
  type CommandCirclesSectionHandle,
} from "@/components/command/CommandCirclesSection";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import { CommandPullRefreshShell } from "@/components/command/CommandPullRefreshShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import SkillsCarousel from "./_skills/SkillsCarousel";

export default function CommandTabContent() {
  const { user } = useAuth();
  const canUseCommandManagement = userHasAppManagerAccess(user);
  const commandSectionRef = useRef<CommandCirclesSectionHandle | null>(null);

  return (
    <CommandPullRefreshShell
      lockDocumentScroll={false}
      refreshRef={commandSectionRef}
    >
      <main className="pb-20">
        <LevelBanner />

        <MonumentContainer />

        <Section title="Skills" className="mt-1 px-4">
          <SkillsCarousel />
        </Section>

        {canUseCommandManagement ? (
          <div className="mx-auto w-full max-w-6xl px-4 pt-4">
            <CommandCirclesSection ref={commandSectionRef} />
          </div>
        ) : null}
      </main>
    </CommandPullRefreshShell>
  );
}
