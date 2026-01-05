"use client";

import { useState } from "react";
import { SectionShell } from "./SectionShell";
import { MetricBadge } from "./MetricBadge";
import { DrilldownPanel } from "./DrilldownPanel";
import { useInViewport } from "@/lib/hooks/useInViewport";

interface Skill {
  id: string;
  name: string;
  level: number;
  progress: number;
  xpGained: number;
}

interface SkillMasterySectionProps {
  skills: Skill[];
  loading?: boolean;
  error?: string | null;
}

export function SkillMasterySection({
  skills,
  loading,
  error,
}: SkillMasterySectionProps) {
  const [skillsView, setSkillsView] = useState<"grid" | "list">("grid");
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [viewportRef, isInView] = useInViewport<HTMLDivElement>();

  // Calculate summary metrics
  const topSkill = skills.length > 0 ? skills[0] : null;
  const totalXp = skills.reduce((sum, skill) => sum + skill.xpGained, 0);
  const avgLevel =
    skills.length > 0
      ? Math.round(
          skills.reduce((sum, skill) => sum + skill.level, 0) / skills.length
        )
      : 0;

  // Mock spark data
  const xpSpark = [10, 15, 8, 22, 18, 25, 12];
  const levelSpark = [1, 1.2, 1.1, 1.4, 1.3, 1.6, 1.4];

  const summaryBadges = (
    <>
      {topSkill && (
        <MetricBadge
          label="Top Skill"
          value={topSkill.name}
          tooltip={`Level ${topSkill.level} • ${topSkill.progress}% progress`}
        />
      )}
      <MetricBadge
        label="XP Gained"
        value={totalXp}
        spark={xpSpark}
        tooltip="Total experience points earned"
      />
      <MetricBadge
        label="Avg Level"
        value={avgLevel}
        delta={0.2}
        spark={levelSpark}
        tooltip="Average skill level across all skills"
      />
    </>
  );

  const actions = (
    <button
      className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
      onClick={() => setSkillsView(skillsView === "grid" ? "list" : "grid")}
    >
      {skillsView === "grid" ? "List" : "Grid"}
    </button>
  );

  return (
    <>
      <div ref={viewportRef}>
        <SectionShell
          id="skills"
          title="Skill Mastery"
          subtitle="Track progress toward your next level-up"
          summary={summaryBadges}
          actions={actions}
          onOpenDrilldown={() => setDrilldownOpen(true)}
        >
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-xl bg-zinc-800"
                />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-red-200">
              {error}
            </div>
          ) : skills.length === 0 ? (
            <div className="text-center py-8 text-zinc-400">
              No skills gained XP in this range yet.
              <p className="text-sm mt-2">
                Complete skill-linked rituals to see progress here.
              </p>
            </div>
          ) : (
            <>
              {isInView && (
                <div
                  className={`grid gap-4 ${
                    skillsView === "grid"
                      ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                      : "grid-cols-1"
                  }`}
                >
                  {skills.slice(0, 6).map((skill) => (
                    <SkillCard key={skill.id} skill={skill} view={skillsView} />
                  ))}
                </div>
              )}
              {skills.length > 6 && (
                <div className="mt-4 text-center">
                  <button className="text-sm text-zinc-400 hover:text-white">
                    Show all {skills.length} skills →
                  </button>
                </div>
              )}
            </>
          )}
        </SectionShell>
      </div>

      {drilldownOpen && (
        <DrilldownPanel
          title="Skill Details"
          content={
            <div className="space-y-4">
              <div className="text-sm text-zinc-400">
                Detailed skill breakdown and filters coming soon.
              </div>
              {/* Placeholder for detailed skill table */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="text-zinc-300">Skill analytics table...</div>
              </div>
            </div>
          }
          onClose={() => setDrilldownOpen(false)}
        />
      )}
    </>
  );
}

// Extracted SkillCard component
function SkillCard({ skill, view }: { skill: Skill; view: "grid" | "list" }) {
  const size = view === "grid" ? 88 : 68;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (skill.progress / 100) * circumference;

  return (
    <div
      className={`group rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-700 ${
        view === "grid"
          ? "flex flex-col items-center gap-3 text-center"
          : "flex items-center gap-4"
      }`}
    >
      <div
        className={`relative flex items-center justify-center rounded-full bg-zinc-800 ${
          view === "grid" ? "h-20 w-20" : "h-16 w-16"
        }`}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#374151"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#F87171"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-xs font-semibold text-white">
          {skill.progress}%
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-semibold text-white ${
            view === "grid" ? "text-center" : "text-left"
          }`}
        >
          {skill.name}
        </div>
        <div
          className={`mt-1 text-xs text-zinc-400 ${
            view === "grid" ? "text-center" : "text-left"
          }`}
        >
          Level {skill.level} · +{skill.xpGained} XP
        </div>
        <div
          className={`mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-700 ${
            view === "grid" ? "mx-auto max-w-24" : ""
          }`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-500 to-pink-500"
            style={{ width: `${skill.progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
