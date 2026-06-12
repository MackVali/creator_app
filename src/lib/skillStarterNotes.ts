import type {
  NoteDatabaseDefinition,
  NoteDatabaseDefinitions,
  NoteDatabaseFieldDefinition,
  NoteDatabaseViewDefinition,
} from "@/components/notes/NoteSlashTextarea";

type SkillStarterKind = "health" | "fitness";

export type SkillStarterNote = {
  kind: SkillStarterKind;
  title: string;
  icon: string;
  content: string;
  metadata: {
    icon: string;
    databases: NoteDatabaseDefinitions;
    databaseEntries: Record<string, []>;
  };
};

type StarterNoteLike = {
  title?: string | null;
  metadata?: unknown;
};

const STARTER_SKILL_ALIASES: Record<string, SkillStarterKind> = {
  health: "health",
  fitness: "fitness",
  exercise: "fitness",
};

function normalizeSkillName(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase();
}

function databaseMarker(title: string, databaseId: string) {
  return `[Database: ${title}](creator-database:${databaseId})`;
}

function field(
  databaseId: string,
  suffix: string,
  name: string,
  type: NoteDatabaseFieldDefinition["type"],
  isTitle = false,
) {
  return {
    id: `${databaseId}-${suffix}`,
    name,
    type,
    isTitle,
  };
}

function views(databaseId: string, visibleFieldIds: string[]): NoteDatabaseViewDefinition[] {
  return [
    {
      id: `${databaseId}-view-table`,
      name: "Table",
      type: "table",
      visibleFieldIds,
    },
    {
      id: `${databaseId}-view-list`,
      name: "List",
      type: "list",
      visibleFieldIds,
    },
    {
      id: `${databaseId}-view-card`,
      name: "Card",
      type: "card",
      visibleFieldIds,
    },
  ];
}

function database(
  id: string,
  title: string,
  fields: NoteDatabaseFieldDefinition[],
): NoteDatabaseDefinition {
  const titleFieldId = fields.find((item) => item.isTitle)?.id ?? fields[0]?.id;
  const visibleFieldIds = fields.map((item) => item.id);

  return {
    id,
    title,
    titleFieldId,
    fields,
    views: views(id, visibleFieldIds),
    activeViewId: `${id}-view-table`,
    pinnedSurface: "body",
  };
}

function buildStarterNote(
  kind: SkillStarterKind,
  title: string,
  icon: string,
  databases: NoteDatabaseDefinition[],
): SkillStarterNote {
  return {
    kind,
    title,
    icon,
    content: databases.map((item) => databaseMarker(item.title, item.id)).join("\n\n"),
    metadata: {
      icon,
      databases: Object.fromEntries(databases.map((item) => [item.id, item])),
      databaseEntries: Object.fromEntries(databases.map((item) => [item.id, []])),
    },
  };
}

const NUTRITION_DATABASE_ID = "starter-health-nutrition";
const HYDRATION_DATABASE_ID = "starter-health-hydration";
const FITNESS_DATABASE_ID = "starter-fitness-fitness";

const HEALTH_STARTER_NOTE = buildStarterNote("health", "Health", "🩺", [
  database(NUTRITION_DATABASE_ID, "Nutrition", [
    field(NUTRITION_DATABASE_ID, "name", "Name", "text", true),
    field(NUTRITION_DATABASE_ID, "calories", "Calories", "number"),
    field(NUTRITION_DATABASE_ID, "protein", "Protein", "number"),
    field(NUTRITION_DATABASE_ID, "notes", "Notes", "longText"),
  ]),
  database(HYDRATION_DATABASE_ID, "Hydration", [
    field(HYDRATION_DATABASE_ID, "name", "Name", "text", true),
    field(HYDRATION_DATABASE_ID, "amount", "Amount", "number"),
    field(HYDRATION_DATABASE_ID, "notes", "Notes", "longText"),
  ]),
]);

const FITNESS_STARTER_NOTE = buildStarterNote("fitness", "Fitness", "💪", [
  database(FITNESS_DATABASE_ID, "Fitness", [
    field(FITNESS_DATABASE_ID, "name", "Name", "text", true),
    field(FITNESS_DATABASE_ID, "workout", "Workout", "text"),
    field(FITNESS_DATABASE_ID, "sets-reps-duration", "Sets/Reps or Duration", "text"),
    field(FITNESS_DATABASE_ID, "notes", "Notes", "longText"),
  ]),
]);

const STARTER_NOTES: Record<SkillStarterKind, SkillStarterNote> = {
  health: HEALTH_STARTER_NOTE,
  fitness: FITNESS_STARTER_NOTE,
};

export function getSkillStarterNote(skillName: string | null | undefined) {
  const kind = STARTER_SKILL_ALIASES[normalizeSkillName(skillName)];
  return kind ? STARTER_NOTES[kind] : null;
}

export function hasMatchingSkillStarterNote(
  notes: StarterNoteLike[],
  starterNote: SkillStarterNote,
) {
  const starterDatabaseIds = Object.keys(starterNote.metadata.databases);

  return notes.some((note) => {
    if ((note.title ?? "").trim() !== starterNote.title) {
      return false;
    }

    const metadata = note.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return false;
    }

    const databases = (metadata as { databases?: unknown }).databases;
    if (!databases || typeof databases !== "object" || Array.isArray(databases)) {
      return false;
    }

    return starterDatabaseIds.every((databaseId) =>
      Object.prototype.hasOwnProperty.call(databases, databaseId),
    );
  });
}
