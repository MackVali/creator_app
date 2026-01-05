"use client";

import { useMemo, useState } from "react";
import { DrilldownPanel } from "../_components/DrilldownPanel";
import { MetricBadge } from "../_components/MetricBadge";
import { SectionShell } from "../_components/SectionShell";
import { CircularProgress } from "@/components/visuals/CircularProgress";
import { useInViewport } from "@/lib/hooks/useInViewport";

export interface Skill {
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
  defaultExpanded?: boolean;
  onOpenDrilldown?: () => void;
}

export function SkillMasterySection({
  skills,
  loading,
  error,
  defaultExpanded = false,
  onOpenDrilldown,
}: SkillMasterySectionProps) {
  const [skillsView, setSkillsView] = useState<"grid" | "list">("grid");
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [viewportRef, isInView] = useInViewport<HTMLDivElement>();

  const totalXp = useMemo(
    () => skills.reduce((sum, skill) => sum + (skill.xpGained || 0), 0),
    [skills]
  );

  const topSkill = useMemo(
    () =>
      skills.length > 0
        ? skills.reduce((prev, curr) =>
            curr.progress > prev.progress ? curr : prev
          )
        : null,
    [skills]
  );

  const avgLevel = useMemo(
    () =>
      skills.length > 0
        ? +(
            skills.reduce((sum, skill) => sum + skill.level, 0) / skills.length
          ).toFixed(1)
        : 0,
    [skills]
  );

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
        tooltip="Total experience points earned"
      />
      <MetricBadge
        label="Avg Level"
        value={avgLevel}
        tooltip="Average skill level across all skills"
      />
    </>
  );

  const actions = (
    <button
      className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
      onClick={() => setSkillsView(skillsView === "grid" ? "list" : "grid")}
    >
      {skillsView === "grid" ? "List" : "Grid"}
    </button>
  );

  const handleOpenDrilldown = () => {
    setDrilldownOpen(true);
    onOpenDrilldown?.();
  };

  return (
    <>
      <div ref={viewportRef}>
        <SectionShell
          id="skills"
          title="Skill Mastery"
          subtitle="Track progress toward your next level-up"
          defaultExpanded={defaultExpanded}
          summary={summaryBadges}
          actions={actions}
          onOpenDrilldown={handleOpenDrilldown}
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
                  className={`grid gap-4 max-h-[420px] overflow-y-auto ${
                    skillsView === "grid"
                      ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                      : "grid-cols-1"
                  }`}
                >
                  {skills.slice(0, 12).map((skill) => (
                    <SkillCard key={skill.id} skill={skill} view={skillsView} />
                  ))}
                </div>
              )}
              {skills.length > 12 && (
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
          content={<SkillDrilldownTable skills={skills} />}
          onClose={() => setDrilldownOpen(false)}
        />
      )}
    </>
  );
}

function SkillCard({ skill, view }: { skill: Skill; view: "grid" | "list" }) {
  const size = view === "grid" ? 88 : 68;

  return (
    <div
      className={`group rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-700 ${
        view === "grid"
          ? "flex flex-col items-center gap-3 text-center"
          : "flex items-center gap-4"
      }`}
      role="listitem"
      aria-label={`${skill.name} level ${skill.level}, ${skill.progress}%`}
    >
      <CircularProgress
        size={size}
        progress={skill.progress}
        trackClassName="stroke-gray-700"
        progressClassName="stroke-red-400"
        label={`${skill.progress}%`}
      />
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

function SkillDrilldownTable({ skills }: { skills: Skill[] }) {
  const [sortBy, setSortBy] = useState<"name" | "level" | "progress" | "xp">(
    "xp"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortedSkills = useMemo(() => {
    return [...skills].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortBy) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "level":
          aVal = a.level;
          bVal = b.level;
          break;
        case "progress":
          aVal = a.progress;
          bVal = b.progress;
          break;
        case "xp":
          aVal = a.xpGained;
          bVal = b.xpGained;
          break;
        default:
          return 0;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      const diff = (aVal as number) - (bVal as number);
      return sortOrder === "asc" ? diff : -diff;
    });
  }, [skills, sortBy, sortOrder]);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => handleSort("xp")}
          className="px-3 py-1 text-xs bg-zinc-800 rounded"
        >
          Top Mover
        </button>
        <button
          onClick={() => handleSort("progress")}
          className="px-3 py-1 text-xs bg-zinc-800 rounded"
        >
          Least Attention
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-950">
            <tr className="text-left text-zinc-400">
              <th
                className="pb-2 cursor-pointer hover:text-white"
                onClick={() => handleSort("name")}
              >
                Name {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
              </th>
              <th
                className="pb-2 cursor-pointer hover:text-white"
                onClick={() => handleSort("level")}
              >
                Level {sortBy === "level" && (sortOrder === "asc" ? "↑" : "↓")}
              </th>
              <th
                className="pb-2 cursor-pointer hover:text-white"
                onClick={() => handleSort("progress")}
              >
                Progress%{" "}
                {sortBy === "progress" && (sortOrder === "asc" ? "↑" : "↓")}
              </th>
              <th
                className="pb-2 cursor-pointer hover:text-white"
                onClick={() => handleSort("xp")}
              >
                XP {sortBy === "xp" && (sortOrder === "asc" ? "↑" : "↓")}
              </th>
              <th className="pb-2">Last Worked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sortedSkills.map((skill) => (
              <tr key={skill.id} className="text-white">
                <td className="py-2 font-semibold">{skill.name}</td>
                <td className="py-2 text-zinc-300">{skill.level}</td>
                <td className="py-2 text-zinc-300">{skill.progress}%</td>
                <td className="py-2 text-zinc-300">+{skill.xpGained}</td>
                <td className="py-2 text-zinc-400">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
