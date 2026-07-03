"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Command,
  Plus,
  Search,
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
};

type StarterPath = {
  id: string;
  label: string;
  suggestedAction: string;
};

const STEP_LABELS = ["Identity", "Monuments", "Skill Stack", "First System", "Ready"];
const MIN_SELECTED_SKILLS = 5;
const MAX_SELECTED_SKILLS = 12;
const MAX_MONUMENTS = 3;
const MAX_IDENTITY_DIRECTIONS = 9;
const MONUMENT_MARKS = ["I", "II", "III"];

const IDENTITY_DIRECTIONS = [
  "Artist",
  "Founder",
  "Athlete",
  "Creator",
  "Student",
  "Operator",
  "Builder",
  "Healer",
];

const MONUMENT_TEMPLATES = [
  "Music",
  "Body",
  "Business",
  "Home",
  "Faith",
  "CREATOR",
  "Content",
];

const STARTER_PATHS: StarterPath[] = [
  {
    id: "goal",
    label: "Build a Goal",
    suggestedAction: "Build the first Goal that gives this system direction.",
  },
  {
    id: "project",
    label: "Start a Project",
    suggestedAction: "Start the first Project that moves one Monument forward.",
  },
  {
    id: "habit",
    label: "Create a Habit",
    suggestedAction: "Create the first Habit that trains one Skill repeatedly.",
  },
  {
    id: "task",
    label: "Plan a Task",
    suggestedAction: "Plan the first Task and move it through Command.",
  },
  {
    id: "schedule_later",
    label: "Set up Schedule later",
    suggestedAction: "Enter Command now. Time Blocks and Events can come later.",
  },
];

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function getClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatSkillSearchValue(skill: CreatorCatalogSkill) {
  return `${skill.name} ${skill.categoryName} ${skill.subcategoryName ?? ""}`.toLowerCase();
}

function createMonumentDraft(title: string, index: number): MonumentDraft {
  return {
    clientId: getClientId(),
    title,
    emoji: MONUMENT_MARKS[index] ?? "I",
  };
}

function assignSkillsToMonuments(
  monuments: MonumentDraft[],
  selectedSkillIds: string[],
) {
  return monuments.map((monument, monumentIndex) => ({
    ...monument,
    emoji: MONUMENT_MARKS[monumentIndex] ?? "I",
    skillIds: selectedSkillIds.filter(
      (_, skillIndex) => skillIndex % monuments.length === monumentIndex,
    ),
  }));
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
        "flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
        selected
          ? "border-white/75 bg-white/[0.13] text-white shadow-[0_0_28px_-16px_rgba(255,255,255,0.95)]"
          : "border-white/10 bg-zinc-950/55 text-zinc-300 hover:border-white/25 hover:bg-white/[0.06]",
        disabled ? "cursor-not-allowed opacity-45" : "",
      ].join(" ")}
      aria-pressed={selected}
    >
      <span className="h-2 w-2 shrink-0 rounded-full border border-white/35 bg-zinc-800" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{skill.name}</span>
        <span className="block truncate text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
          {skill.subcategoryName ?? skill.categoryName}
        </span>
      </span>
      {selected ? <Check className="h-4 w-4 text-white" aria-hidden="true" /> : null}
    </button>
  );
}

export default function CreatorOnboardingClient({
  catalog,
}: CreatorOnboardingClientProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedIdentityDirections, setSelectedIdentityDirections] = useState<string[]>([]);
  const [customIdentity, setCustomIdentity] = useState("");
  const [monuments, setMonuments] = useState<MonumentDraft[]>([]);
  const [customMonument, setCustomMonument] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState(
    catalog.popularSkills.length > 0 ? "popular" : catalog.categories[0]?.id ?? "",
  );
  const [skillSearch, setSkillSearch] = useState("");
  const [starterPathId, setStarterPathId] = useState(STARTER_PATHS[0]?.id ?? "");
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

  const normalizedIdentityDirections = useMemo(() => {
    const directions = [...selectedIdentityDirections];
    const custom = normalizeText(customIdentity);
    if (custom) directions.push(custom);
    return Array.from(new Set(directions.map(normalizeText).filter(Boolean))).slice(
      0,
      MAX_IDENTITY_DIRECTIONS,
    );
  }, [customIdentity, selectedIdentityDirections]);

  const categoryOptions = useMemo(
    () => [
      ...(catalog.popularSkills.length > 0
        ? [{ id: "popular", name: "Signal" }]
        : []),
      ...catalog.categories.map((category) => ({
        id: category.id,
        name: category.name,
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
      return [{ id: "popular", name: "Community Signal", skills: catalog.popularSkills }];
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

  const assignedMonuments = useMemo(
    () => assignSkillsToMonuments(monuments, selectedSkillIds),
    [monuments, selectedSkillIds],
  );

  const starterPath =
    STARTER_PATHS.find((path) => path.id === starterPathId) ?? STARTER_PATHS[0];

  const hasValidIdentity = normalizedIdentityDirections.length > 0;
  const hasValidMonuments =
    monuments.length >= 1 &&
    monuments.length <= MAX_MONUMENTS &&
    monuments.every((monument) => normalizeText(monument.title).length > 0);
  const hasValidSkillSelection =
    selectedSkillIds.length >= MIN_SELECTED_SKILLS &&
    selectedSkillIds.length <= MAX_SELECTED_SKILLS;
  const hasValidStarterPath = Boolean(starterPathId);
  const hasValidSetup =
    hasValidIdentity &&
    hasValidMonuments &&
    hasValidSkillSelection &&
    hasValidStarterPath &&
    assignedMonuments.every((monument) => monument.skillIds.length > 0);

  const toggleIdentityDirection = (direction: string) => {
    setSubmitError(null);
    setSelectedIdentityDirections((current) => {
      if (current.includes(direction)) {
        return current.filter((item) => item !== direction);
      }
      if (normalizedIdentityDirections.length >= MAX_IDENTITY_DIRECTIONS) {
        return current;
      }
      return [...current, direction];
    });
  };

  const addMonumentFromTitle = (title: string) => {
    const cleaned = normalizeText(title);
    if (!cleaned || monuments.length >= MAX_MONUMENTS) return;
    if (
      monuments.some(
        (monument) =>
          normalizeText(monument.title).toLowerCase() === cleaned.toLowerCase(),
      )
    ) {
      return;
    }
    setSubmitError(null);
    setMonuments((current) => [...current, createMonumentDraft(cleaned, current.length)]);
  };

  const removeMonument = (clientId: string) => {
    setSubmitError(null);
    setMonuments((current) => current.filter((monument) => monument.clientId !== clientId));
  };

  const updateMonumentTitle = (clientId: string, title: string) => {
    setSubmitError(null);
    setMonuments((current) =>
      current.map((monument) =>
        monument.clientId === clientId ? { ...monument, title } : monument,
      ),
    );
  };

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

  const goBack = () => {
    setSubmitError(null);
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const goNext = () => {
    setSubmitError(null);
    if (stepIndex === 0 && !hasValidIdentity) return;
    if (stepIndex === 1 && !hasValidMonuments) return;
    if (stepIndex === 2 && !hasValidSkillSelection) return;
    if (stepIndex === 3 && !hasValidStarterPath) return;
    setStepIndex((current) => Math.min(STEP_LABELS.length - 1, current + 1));
  };

  const handleSubmit = async () => {
    if (!hasValidSetup) {
      setSubmitError("Complete the CREATOR initiation before entering Command.");
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
          identityDirections: normalizedIdentityDirections,
          selectedSkillIds,
          monuments: assignedMonuments.map((monument) => ({
            title: normalizeText(monument.title),
            emoji: monument.emoji,
            skillIds: monument.skillIds,
          })),
          starterPath: starterPathId,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to finish CREATOR initiation.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unable to finish CREATOR initiation.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canContinue =
    stepIndex === 0 ? hasValidIdentity :
    stepIndex === 1 ? hasValidMonuments :
    stepIndex === 2 ? hasValidSkillSelection :
    stepIndex === 3 ? hasValidStarterPath :
    true;

  return (
    <main className="min-h-screen bg-black px-4 py-4 text-white sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col gap-5">
        <header className="flex items-start justify-between gap-4 pt-1">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-500">
              CREATOR initiation
            </p>
            <h1 className="mt-2 max-w-2xl text-2xl font-black leading-tight text-white sm:text-4xl">
              Tell CREATOR who you are becoming.
            </h1>
          </div>
          <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-zinc-300 backdrop-blur">
            {stepIndex + 1}/{STEP_LABELS.length}
          </div>
        </header>

        <nav aria-label="Onboarding progress" className="space-y-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-emerald-300 transition-all duration-300"
              style={{ width: `${((stepIndex + 1) / STEP_LABELS.length) * 100}%` }}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STEP_LABELS.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (index < stepIndex) setStepIndex(index);
                }}
                className={[
                  "h-9 shrink-0 rounded-full border px-3 text-[10px] font-bold uppercase tracking-[0.14em] transition",
                  index === stepIndex
                    ? "border-white/45 bg-white/[0.10] text-white"
                    : index < stepIndex
                      ? "border-emerald-300/40 bg-emerald-300/[0.08] text-zinc-200"
                      : "border-white/10 bg-transparent text-zinc-600",
                ].join(" ")}
                aria-current={index === stepIndex ? "step" : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        <section className="flex-1 pb-24">
          {stepIndex === 0 ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-black leading-tight text-white">
                  What are you building yourself into?
                </h2>
                <p className="max-w-xl text-sm leading-6 text-zinc-400">
                  Tell CREATOR who you are becoming. CREATOR builds the system around that.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {IDENTITY_DIRECTIONS.map((direction) => {
                  const selected = selectedIdentityDirections.includes(direction);
                  return (
                    <button
                      key={direction}
                      type="button"
                      onClick={() => toggleIdentityDirection(direction)}
                      disabled={!selected && normalizedIdentityDirections.length >= MAX_IDENTITY_DIRECTIONS}
                      className={[
                        "group flex min-h-24 flex-col justify-between rounded-lg border p-4 text-left transition",
                        selected
                          ? "border-white/80 bg-white/[0.12] shadow-[0_0_34px_-20px_rgba(255,255,255,0.95)]"
                          : "border-white/10 bg-zinc-950/70 hover:border-white/30 hover:bg-white/[0.05]",
                        !selected && normalizedIdentityDirections.length >= MAX_IDENTITY_DIRECTIONS
                          ? "cursor-not-allowed opacity-45"
                          : "",
                      ].join(" ")}
                      aria-pressed={selected}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                        Archetype
                      </span>
                      <span className="mt-5 flex items-center justify-between gap-2 text-lg font-black text-white">
                        {direction}
                        {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-lg border border-white/10 bg-zinc-950/70 p-3">
                <label
                  htmlFor="custom-identity"
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500"
                >
                  Custom direction
                </label>
                <input
                  id="custom-identity"
                  value={customIdentity}
                  onChange={(event) => setCustomIdentity(event.target.value)}
                  maxLength={40}
                  placeholder="Architect, Producer, Leader..."
                  className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-700 focus:border-white/45 focus:ring-2 focus:ring-white/10"
                />
              </div>
            </div>
          ) : null}

          {stepIndex === 1 ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-black leading-tight text-white">
                  What pillars does this life need?
                </h2>
                <p className="max-w-xl text-sm leading-6 text-zinc-400">
                  Monuments are the major pillars or identities your system is built around.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {MONUMENT_TEMPLATES.map((title) => {
                  const selected = monuments.some((monument) => monument.title === title);
                  return (
                    <button
                      key={title}
                      type="button"
                      onClick={() => {
                        if (selected) {
                          const match = monuments.find((monument) => monument.title === title);
                          if (match) removeMonument(match.clientId);
                          return;
                        }
                        addMonumentFromTitle(title);
                      }}
                      disabled={!selected && monuments.length >= MAX_MONUMENTS}
                      className={[
                        "min-h-28 rounded-lg border p-4 text-left transition",
                        selected
                          ? "border-white/80 bg-white/[0.12] shadow-[0_0_34px_-20px_rgba(255,255,255,0.95)]"
                          : "border-white/10 bg-zinc-950/70 hover:border-white/30 hover:bg-white/[0.05]",
                        !selected && monuments.length >= MAX_MONUMENTS
                          ? "cursor-not-allowed opacity-45"
                          : "",
                      ].join(" ")}
                      aria-pressed={selected}
                    >
                      <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                        Monument
                      </span>
                      <span className="mt-8 flex items-center justify-between gap-2 text-lg font-black text-white">
                        {title}
                        {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-lg border border-white/10 bg-zinc-950/70 p-3">
                <label
                  htmlFor="custom-monument"
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500"
                >
                  Custom Monument
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="custom-monument"
                    value={customMonument}
                    onChange={(event) => setCustomMonument(event.target.value)}
                    maxLength={80}
                    placeholder="Studio, Mind, Family..."
                    className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-700 focus:border-white/45 focus:ring-2 focus:ring-white/10"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addMonumentFromTitle(customMonument);
                        setCustomMonument("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      addMonumentFromTitle(customMonument);
                      setCustomMonument("");
                    }}
                    disabled={!normalizeText(customMonument) || monuments.length >= MAX_MONUMENTS}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.08] text-white transition hover:border-white/30 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Add custom Monument"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {monuments.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {monuments.map((monument, index) => (
                    <div
                      key={monument.clientId}
                      className="rounded-lg border border-white/15 bg-white/[0.07] p-4 backdrop-blur"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                          {MONUMENT_MARKS[index] ?? "I"}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeMonument(monument.clientId)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-zinc-300 transition hover:border-white/25 hover:text-white"
                          aria-label={`Remove ${monument.title}`}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <input
                        value={monument.title}
                        onChange={(event) =>
                          updateMonumentTitle(monument.clientId, event.target.value)
                        }
                        maxLength={80}
                        className="mt-8 h-11 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-lg font-black text-white outline-none transition placeholder:text-zinc-700 focus:border-white/45 focus:ring-2 focus:ring-white/10"
                        aria-label={`Monument ${index + 1} name`}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {stepIndex === 2 ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                  <h2 className="text-2xl font-black leading-tight text-white">
                    What abilities does this version of you need?
                  </h2>
                  <p className="max-w-xl text-sm leading-6 text-zinc-400">
                    Skills are the capabilities you are actively building.
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-zinc-300">
                  {selectedSkillIds.length}/{MAX_SELECTED_SKILLS}
                </div>
              </div>

              {catalog.skills.length === 0 ? (
                <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-3 text-sm text-amber-100">
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
                      className="h-12 w-full rounded-lg border border-white/10 bg-zinc-950/75 pl-9 pr-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-700 focus:border-white/45 focus:ring-2 focus:ring-white/10"
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
                            "h-10 shrink-0 rounded-full border px-3 text-xs font-bold uppercase tracking-[0.12em] transition",
                            activeCategoryId === category.id
                              ? "border-white/55 bg-white/[0.11] text-white"
                              : "border-white/10 bg-zinc-950/70 text-zinc-400 hover:border-white/25 hover:text-zinc-200",
                          ].join(" ")}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="max-h-[50vh] space-y-5 overflow-y-auto pr-1">
                    {visibleSkillGroups.map((group) => (
                      <div key={group.id} className="space-y-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">
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
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-black leading-tight text-white">
                  What should CREATOR help you move first?
                </h2>
                <p className="max-w-xl text-sm leading-6 text-zinc-400">
                  Choose the first execution layer. CREATOR will not create scheduled Events yet.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {STARTER_PATHS.map((path) => {
                  const selected = starterPathId === path.id;
                  return (
                    <button
                      key={path.id}
                      type="button"
                      onClick={() => setStarterPathId(path.id)}
                      className={[
                        "flex min-h-20 items-center justify-between gap-3 rounded-lg border p-4 text-left transition",
                        selected
                          ? "border-white/80 bg-white/[0.12] shadow-[0_0_34px_-20px_rgba(255,255,255,0.95)]"
                          : "border-white/10 bg-zinc-950/70 hover:border-white/30 hover:bg-white/[0.05]",
                      ].join(" ")}
                      aria-pressed={selected}
                    >
                      <span className="text-base font-black text-white">{path.label}</span>
                      {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {stepIndex === 4 ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-3xl font-black leading-tight text-white">
                  Your system is ready.
                </h2>
                <p className="max-w-xl text-sm leading-6 text-zinc-400">
                  CREATOR has the identity layer. Command comes next.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">
                    Created Monuments
                  </h3>
                  <div className="grid gap-2">
                    {assignedMonuments.map((monument, index) => (
                      <div
                        key={monument.clientId}
                        className="rounded-lg border border-white/10 bg-zinc-950/70 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-lg font-black text-white">{monument.title}</p>
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                            {MONUMENT_MARKS[index] ?? "I"}
                          </span>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-zinc-500">
                          {monument.skillIds.length} Skills linked
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">
                    Selected Skills
                  </h3>
                  <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-lg border border-white/10 bg-zinc-950/70 p-3">
                    {selectedSkills.map((skill) => (
                      <span
                        key={skill.id}
                        className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-zinc-200"
                      >
                        {skill.name}
                      </span>
                    ))}
                  </div>

                  <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200/80">
                      Next suggested action
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-white">
                      {starterPath?.suggestedAction}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {submitError ? (
            <div className="mt-6 rounded-lg border border-red-400/30 bg-red-950/25 px-3 py-3 text-sm text-red-100">
              {submitError}
            </div>
          ) : null}
        </section>

        <footer className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-black/85 px-4 py-3 backdrop-blur sm:static sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:pb-4">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={stepIndex === 0 || submitting}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 text-sm font-bold text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>

            {stepIndex < STEP_LABELS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canContinue || submitting}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/70 bg-white px-4 text-sm font-black text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.06] disabled:text-zinc-600"
              >
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/70 bg-white px-4 text-sm font-black text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Command className="h-4 w-4" aria-hidden="true" />
                {submitting ? "Entering..." : "Enter Command"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </main>
  );
}
