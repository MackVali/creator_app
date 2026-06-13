"use client";

import { useCallback, useRef } from "react";

import {
  CommandCirclesSection,
  type CommandCirclesSectionHandle,
} from "@/components/command/CommandCirclesSection";
import { Section } from "@/components/ui/Section";
import { LevelBanner, type LevelBannerHandle } from "@/components/ui/LevelBanner";
import {
  MonumentContainer,
  type MonumentContainerHandle,
} from "@/components/ui/MonumentContainer";
import { CommandPullRefreshShell } from "@/components/command/CommandPullRefreshShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import SkillsCarousel, { type SkillsCarouselHandle } from "./_skills/SkillsCarousel";

export default function CommandTabContent() {
  const { user } = useAuth();
  const canUseCommandManagement = userHasAppManagerAccess(user);
  const levelBannerRef = useRef<LevelBannerHandle | null>(null);
  const monumentContainerRef = useRef<MonumentContainerHandle | null>(null);
  const skillsCarouselRef = useRef<SkillsCarouselHandle | null>(null);
  const commandSectionRef = useRef<CommandCirclesSectionHandle | null>(null);
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      levelBannerRef.current?.refresh(),
      monumentContainerRef.current?.refresh(),
      skillsCarouselRef.current?.refresh(),
      canUseCommandManagement ? commandSectionRef.current?.refresh() : undefined,
    ]);
  }, [canUseCommandManagement]);

  return (
    <CommandPullRefreshShell
      lockDocumentScroll={false}
      onRefresh={handleRefresh}
      refreshRef={commandSectionRef}
    >
      <main className="app-dashboard-bg pb-20">
        <LevelBanner ref={levelBannerRef} />

        <MonumentContainer ref={monumentContainerRef} />

        <Section title="Skills" className="mt-1 px-4">
          <SkillsCarousel ref={skillsCarouselRef} />
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
