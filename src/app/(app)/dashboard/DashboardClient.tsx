"use client";

import Link from "next/link";
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import { useTour } from "@/components/tour/TourProvider";
import { dashboardTourSteps } from "@/lib/tours/dashboardTour";
import SkillsCarousel from "./_skills/SkillsCarousel";

export default function DashboardClient() {
  const router = useRouter();

  const finishTour = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dashboardTourCompleted", "true");
    }
    router.push("/schedule");
  }, [router]);

  const { start } = useTour(dashboardTourSteps, finishTour);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("dashboardTourCompleted") === "true") return;
    const timer = window.setTimeout(() => {
      start();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [start]);

  return (
    <main className="pb-20">
      <LevelBanner />

      <MonumentContainer />

      <Section title={<Link href="/skills" data-tour="nav-skills">Skills</Link>} className="mt-1 px-4">
        <SkillsCarousel />
      </Section>
    </main>
  );
}
