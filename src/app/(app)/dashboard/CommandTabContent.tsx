"use client";

import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import { CommandCirclesSection } from "@/components/command/CommandCirclesSection";
import { useAuth } from "@/components/auth/AuthProvider";
import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import SkillsCarousel from "./_skills/SkillsCarousel";

export default function CommandTabContent() {
  const { user } = useAuth();
  const canUseCommandManagement = userHasAppManagerAccess(user);

  return (
    <main className="pb-20">
      <LevelBanner />

      <MonumentContainer />

      <Section title="Skills" className="mt-1 px-4">
        <SkillsCarousel />
      </Section>

      {canUseCommandManagement ? (
        <Section className="mt-5 px-4">
          <CommandCirclesSection />
        </Section>
      ) : null}
    </main>
  );
}
