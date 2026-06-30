"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import type {
  CreatorCatalogSkill,
  CreatorSkillCatalog,
} from "@/lib/onboarding/creatorSetup";

type CreatorOnboardingClientProps = {
  catalog: CreatorSkillCatalog;
};

type MonumentDraft = {
  clientId: string;
  title: string;
  emoji: string;
  skillIds: string[];
};

const STEP_LABELS = ["Primer", "Intentions", "Skills", "Monuments", "Next"];
const MIN_SELECTED_SKILLS = 5;
const MAX_SELECTED_SKILLS = 12;
const MAX_INTENTIONS = 3;
const MAX_MONUMENTS = 3;
const DEFAULT_MONUMENT_EMOJIS = ["🏛️", "⚡", "🧭"];

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function suggestMonumentName(value: string, index: number) {
  const cleaned = normalizeText(value)
    .replace(
      /^(i want to|i am trying to|i'm trying to|trying to|build|improve|grow|learn|create|my)\s+/i,
      "",
    )
    .replace(/[^\w\s&-]/g, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 4);
  return titleCase(words.join(" ")) || `Monument ${index + 1}`;
}

function getClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createInitialMonuments(
  intentions: string[],
  selectedSkillIds: string[],
): MonumentDraft[] {
  const count = Math.max(1, Math.min(intentions.length || 1, MAX_MONUMENTS));
  return Array.from({ length: count }, (_, index) => ({
    clientId: getClientId(),
    title: suggestMonumentName(intentions[index] ?? "", index),
    emoji: DEFAULT_MONUMENT_EMOJIS[index] ?? "🏛️",
    skillIds: selectedSkillIds.filter((_, skillIndex) => skillIndex % count === index),
  }));
}

function formatSkillSearchValue(skill: CreatorCatalogSkill) {
  return `${skill.name} ${skill.categoryName} ${skill.subcategoryName ?? ""}`.toLowerCase();
}

function SkillChip({
  skill,
  selected,
  disabled,
  onToggle,
}: {
  skill: CreatorCatalogSkill;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={[
        "flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
        selected
          ? "border-emerald-300/60 bg-emerald-300/15 text-white shadow-[0_10px_28px_-18px_rgba(16,185,129,0.9)]"
          : "border-white/10 bg-white/[0.045] text-zinc-200 hover:border-white/25 hover:bg-white/[0.075]",
        disabled ? "cursor-not-allowed opacity-45" : "",
      ].join(" ")}
      aria-pressed={selected}
    >
      <span className="text-base" aria-hidden="true">
        {skill.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{skill.name}</span>
        <span className="block truncate text-[11px] uppercase tracking-[0.12em] text-zinc-500">
          {skill.subcategoryName ?? skill.categoryName}
        </span>
      </span>
      {selected ? <Check className="h-4 w-4 text-emerald-200" aria-hidden="true" /> : null}
    </button>
  );
}

export default function CreatorOnboardingClient({
  catalog,
}: CreatorOnboardingClientProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [intentions, setIntentions] = useState([""]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState(
    catalog.popularSkills.length > 0 ? "popular" : catalog.categories[0]?.id ?? "",
  );
  const [skillSearch, setSkillSearch] = useState("");
  const [monuments, setMonuments] = useState<MonumentDraft[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const skillById = useMemo(
    () => new Map(catalog.skills.map((skill) => [skill.id, skill])),
    [catalog.skills],
  );

  const selectedSkills = useMemo(
    () =>
      selectedSkillIds
        .map((skillId) => skillById.get(skillId))
        .filter(Boolean) as CreatorCatalogSkill[],
    [selectedSkillIds, skillById],
  );

  const normalizedIntentions = useMemo(
    () => intentions.map(normalizeText).filter(Boolean).slice(0, MAX_INTENTIONS),
    [intentions],
  );

  const categoryOptions = useMemo(
    () => [
      ...(catalog.popularSkills.length > 0
        ? [{ id: "popular", name: "Popular", icon: "✦" }]
        : []),
      ...catalog.categories.map((category) => ({
        id: category.id,
        name: category.name,
        icon: category.icon ?? "◇",
      })),
    ],
    [catalog.categories, catalog.popularSkills.length],
  );

  const visibleSkillGroups = useMemo(() => {
    const query = skillSearch.trim().toLowerCase();
    if (query) {
      const matched = catalog.skills.filter((skill) =>
        formatSkillSearchValue(skill).includes(query),
      );
      return [{ id: "search", name: "Matches", skills: matched }];
    }

    if (activeCategoryId === "popular") {
      return [{ id: "popular", name: "Popular", skills: catalog.popularSkills }];
    }

    const category = catalog.categories.find((item) => item.id === activeCategoryId);
    return category?.subcategories ?? [];
  }, [
    activeCategoryId,
    catalog.categories,
    catalog.popularSkills,
    catalog.skills,
    skillSearch,
  ]);

  const assignedSkillIds = useMemo(() => {
    const assigned = new Set<string>();
    for (const monument of monuments) {
      for (const skillId of monument.skillIds) {
        assigned.add(skillId);
      }
    }
    return assigned;
  }, [monuments]);

  const unassignedSkills = selectedSkills.filter((skill) => !assignedSkillIds.has(skill.id));
  const hasValidIntentions =
    normalizedIntentions.length >= 1 && normalizedIntentions.length <= MAX_INTENTIONS;
  const hasValidSkillSelection =
    selectedSkillIds.length >= MIN_SELECTED_SKILLS &&
    selectedSkillIds.length <= MAX_SELECTED_SKILLS;
  const hasValidMonuments =
    monuments.length >= 1 &&
    monuments.length <= MAX_MONUMENTS &&
    monuments.every(
      (monument) => normalizeText(monument.title).length > 0 && monument.skillIds.length > 0,
    ) &&
    unassignedSkills.length === 0;

  useEffect(() => {
    const validIds = new Set(catalog.skills.map((skill) => skill.id));
    setSelectedSkillIds((current) => current.filter((skillId) => validIds.has(skillId)));
  }, [catalog.skills]);

  useEffect(() => {
    const selectedSet = new Set(selectedSkillIds);
    setMonuments((current) =>
      current.map((monument) => ({
        ...monument,
        skillIds: monument.skillIds.filter((skillId) => selectedSet.has(skillId)),
      })),
    );
  }, [selectedSkillIds]);

  useEffect(() => {
    if (categoryOptions.some((category) => category.id === activeCategoryId)) {
      return;
    }
    setActiveCategoryId(categoryOptions[0]?.id ?? "");
  }, [activeCategoryId, categoryOptions]);

  const toggleSkill = (skillId: string) => {
    setSubmitError(null);
    setSelectedSkillIds((current) => {
      if (current.includes(skillId)) {
        return current.filter((id) => id !== skillId);
      }
      if (current.length >= MAX_SELECTED_SKILLS) {
        return current;
      }
      return [...current, skillId];
    });
  };

  const updateIntention = (index: number, value: string) => {
    setIntentions((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  };

  const addIntention = () => {
    setIntentions((current) =>
      current.length >= MAX_INTENTIONS ? current : [...current, ""],
    );
  };

  const removeIntention = (index: number) => {
    setIntentions((current) => {
      if (current.length <= 1) return current;
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const updateMonument = (
    clientId: string,
    updates: Partial<Pick<MonumentDraft, "title" | "emoji">>,
  ) => {
    setMonuments((current) =>
      current.map((monument) =>
        monument.clientId === clientId ? { ...monument, ...updates } : monument,
      ),
    );
  };

  const toggleMonumentSkill = (clientId: string, skillId: string) => {
    setMonuments((current) =>
      current.map((monument) => {
        if (monument.clientId !== clientId) return monument;
        const nextSkillIds = monument.skillIds.includes(skillId)
          ? monument.skillIds.filter((id) => id !== skillId)
          : [...monument.skillIds, skillId];
        return { ...monument, skillIds: nextSkillIds };
      }),
    );
  };

  const addMonument = () => {
    if (monuments.length >= MAX_MONUMENTS) return;
    setMonuments((current) => [
      ...current,
      {
        clientId: getClientId(),
        title: `Monument ${current.length + 1}`,
        emoji: DEFAULT_MONUMENT_EMOJIS[current.length] ?? "🏛️",
        skillIds: [],
      },
    ]);
  };

  const removeMonument = (clientId: string) => {
    setMonuments((current) => {
      if (current.length <= 1) return current;
      return current.filter((monument) => monument.clientId !== clientId);
    });
  };

  const goBack = () => {
    setSubmitError(null);
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const goNext = () => {
    setSubmitError(null);
    if (stepIndex === 1 && !hasValidIntentions) return;
    if (stepIndex === 2 && !hasValidSkillSelection) return;

    if (stepIndex === 2 && monuments.length === 0) {
      setMonuments(createInitialMonuments(normalizedIntentions, selectedSkillIds));
    }

    if (stepIndex === 3 && !hasValidMonuments) return;
    setStepIndex((current) => Math.min(STEP_LABELS.length - 1, current + 1));
  };

  const handleSubmit = async () => {
    if (!hasValidIntentions || !hasValidSkillSelection || !hasValidMonuments) {
      setSubmitError("Finish the setup choices before continuing.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/onboarding/creator-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          intentions: normalizedIntentions,
          selectedSkillIds,
          monuments: monuments.map((monument) => ({
            title: normalizeText(monument.title),
            emoji: normalizeText(monument.emoji),
            skillIds: monument.skillIds,
          })),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to finish CREATOR setup.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unable to finish CREATOR setup.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canContinue =
    stepIndex === 0 ||
    (stepIndex === 1 && hasValidIntentions) ||
    (stepIndex === 2 && hasValidSkillSelection) ||
    (stepIndex === 3 && hasValidMonuments);

  return (
    <main className="min-h-screen bg-[#05070c] px-4 py-5 text-white sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
              CREATOR setup
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-normal text-white sm:text-3xl">
              Build your first system
            </h1>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-zinc-300">
            {stepIndex + 1}/{STEP_LABELS.length}
          </div>
        </header>

        <nav aria-label="Onboarding progress" className="flex gap-2 overflow-x-auto pb-1">
          {STEP_LABELS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (index < stepIndex) setStepIndex(index);
              }}
              className={[
                "h-9 shrink-0 rounded-full border px-3 text-[11px] font-bold uppercase tracking-[0.12em] transition",
                index === stepIndex
                  ? "border-emerald-300/50 bg-emerald-300/15 text-white"
                  : index < stepIndex
                    ? "border-white/15 bg-white/[0.06] text-zinc-200"
                    : "border-white/10 bg-transparent text-zinc-500",
              ].join(" ")}
              aria-current={index === stepIndex ? "step" : undefined}
            >
              {label}
            </button>
          ))}
        </nav>

        <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 shadow-[0_24px_70px_-42px_rgba(16,185,129,0.75)] backdrop-blur sm:p-6">
          {stepIndex === 0 ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-300/15">
                  <Sparkles className="h-5 w-5 text-emerald-100" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">CREATOR turns intention into structure.</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    Start with the pieces that define what you are building. Execution layers
                    come after the foundation is clear.
                  </p>
                </div>
              </div>

              <div className="grid gap-3">
                {[
                  ["Monuments", "major life pillars or identities"],
                  ["Skills", "capabilities the user is building"],
                  ["Goals / Projects / Habits / Tasks", "execution layers"],
                  ["Time Blocks", "schedule containers"],
                  ["Events", "scheduled Habits, Projects, or Tasks"],
                ].map(([term, definition]) => (
                  <div
                    key={term}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"
                  >
                    <p className="text-sm font-semibold text-white">
                      {term} = <span className="font-medium text-zinc-300">{definition}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {stepIndex === 1 ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white">
                  What are you trying to build or improve?
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Add 1-3 short intentions. These stay as draft setup context for v1.
                </p>
              </div>

              <div className="space-y-3">
                {intentions.map((value, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      value={value}
                      onChange={(event) => updateIntention(index, event.target.value)}
                      maxLength={96}
                      placeholder={
                        index === 0
                          ? "Build a stronger creator business"
                          : "Improve fitness, music, design..."
                      }
                      className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-300/15"
                    />
                    <button
                      type="button"
                      onClick={() => removeIntention(index)}
                      disabled={intentions.length <= 1}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-zinc-300 transition hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="Remove intention"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addIntention}
                disabled={intentions.length >= MAX_INTENTIONS}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add intention
              </button>
            </div>
          ) : null}

          {stepIndex === 2 ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Choose Skills</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    Select 5-12 Skills from the global community catalog.
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-bold text-zinc-300">
                  {selectedSkillIds.length}/{MAX_SELECTED_SKILLS}
                </div>
              </div>

              {catalog.skills.length === 0 ? (
                <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-3 text-sm text-amber-100">
                  The Skill catalog is empty right now.
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                      aria-hidden="true"
                    />
                    <input
                      value={skillSearch}
                      onChange={(event) => setSkillSearch(event.target.value)}
                      placeholder="Search Skills"
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-300/15"
                    />
                  </div>

                  {!skillSearch.trim() ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {categoryOptions.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => setActiveCategoryId(category.id)}
                          className={[
                            "flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition",
                            activeCategoryId === category.id
                              ? "border-cyan-200/50 bg-cyan-200/15 text-white"
                              : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/[0.06]",
                          ].join(" ")}
                        >
                          <span aria-hidden="true">{category.icon}</span>
                          {category.name}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="max-h-[48vh] space-y-5 overflow-y-auto pr-1">
                    {visibleSkillGroups.map((group) => (
                      <div key={group.id} className="space-y-2">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                          {group.name}
                        </h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {group.skills.map((skill) => {
                            const selected = selectedSkillIds.includes(skill.id);
                            return (
                              <SkillChip
                                key={skill.id}
                                skill={skill}
                                selected={selected}
                                disabled={!selected && selectedSkillIds.length >= MAX_SELECTED_SKILLS}
                                onToggle={() => toggleSkill(skill.id)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {stepIndex === 3 ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Create Monuments</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    Create 1-3 Monuments and assign your selected Skills.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addMonument}
                  disabled={monuments.length >= MAX_MONUMENTS}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Monument
                </button>
              </div>

              <div className="space-y-4">
                {monuments.map((monument, index) => (
                  <div
                    key={monument.clientId}
                    className="rounded-xl border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex gap-2">
                      <input
                        value={monument.emoji}
                        onChange={(event) =>
                          updateMonument(monument.clientId, {
                            emoji: event.target.value.slice(0, 16),
                          })
                        }
                        aria-label={`Monument ${index + 1} icon`}
                        className="h-12 w-14 shrink-0 rounded-xl border border-white/10 bg-black/25 px-2 text-center text-2xl text-white outline-none transition focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-300/15"
                      />
                      <input
                        value={monument.title}
                        onChange={(event) =>
                          updateMonument(monument.clientId, {
                            title: event.target.value,
                          })
                        }
                        maxLength={80}
                        placeholder={`Monument ${index + 1}`}
                        className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-300/15"
                      />
                      <button
                        type="button"
                        onClick={() => removeMonument(monument.clientId)}
                        disabled={monuments.length <= 1}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-zinc-300 transition hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="Remove Monument"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {selectedSkills.map((skill) => {
                        const selected = monument.skillIds.includes(skill.id);
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => toggleMonumentSkill(monument.clientId, skill.id)}
                            className={[
                              "flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
                              selected
                                ? "border-emerald-300/55 bg-emerald-300/15 text-white"
                                : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.07]",
                            ].join(" ")}
                            aria-pressed={selected}
                          >
                            <span aria-hidden="true">{skill.icon}</span>
                            <span className="min-w-0 flex-1 truncate font-semibold">
                              {skill.name}
                            </span>
                            {selected ? (
                              <Check className="h-4 w-4 text-emerald-200" aria-hidden="true" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {unassignedSkills.length > 0 ? (
                <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-3 text-sm text-amber-100">
                  Assign every selected Skill to at least one Monument.
                </div>
              ) : null}
            </div>
          ) : null}

          {stepIndex === 4 ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200/30 bg-cyan-200/15">
                  <Check className="h-5 w-5 text-cyan-100" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Your foundation is ready.</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    You can build Goals, Projects, Habits, and Time Blocks next.
                    Events are scheduled Habits, Projects, or Tasks.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-2xl font-black text-white">{selectedSkillIds.length}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Skills
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-2xl font-black text-white">{monuments.length}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Monuments
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-2xl font-black text-white">
                    {monuments.reduce((total, monument) => total + monument.skillIds.length, 0)}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Links
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {submitError ? (
            <div className="mt-5 rounded-xl border border-red-400/30 bg-red-950/25 px-3 py-3 text-sm text-red-100">
              {submitError}
            </div>
          ) : null}
        </section>

        <footer className="flex items-center justify-between gap-3 pb-4">
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0 || submitting}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm font-bold text-zinc-200 transition hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>

          {stepIndex < STEP_LABELS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canContinue || submitting}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200/40 bg-emerald-300/20 px-4 text-sm font-black text-white shadow-[0_18px_38px_-26px_rgba(16,185,129,0.95)] transition hover:bg-emerald-300/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.045] disabled:text-zinc-500 disabled:shadow-none"
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200/40 bg-emerald-300/20 px-4 text-sm font-black text-white shadow-[0_18px_38px_-26px_rgba(16,185,129,0.95)] transition hover:bg-emerald-300/25 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {submitting ? "Finishing..." : "Finish setup"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </footer>
      </div>
    </main>
  );
}
