import type {
  NoteDatabaseDefinition,
  NoteDatabaseDefinitions,
  NoteDatabaseFieldDefinition,
  NoteDatabaseViewDefinition,
} from "@/components/notes/NoteSlashTextarea";
import { getSupabaseBrowser } from "@/lib/supabase";

type SkillStarterKind = "health" | "fitness";

export type SkillStarterNote = {
  kind: SkillStarterKind;
  title: string;
  icon: string;
  content: string;
  metadata: {
    icon: string;
    iconKey: SkillStarterNoteIconKey;
    lockedSystemNote: true;
    systemNoteKey: string;
    databases: NoteDatabaseDefinitions;
    databaseEntries: Record<string, []>;
  };
};

export type DefaultMemoDatabaseTargetId = "nutrition" | "hydration" | "fitness";

export type DefaultMemoDatabaseTarget = {
  id: DefaultMemoDatabaseTargetId;
  label: string;
  databaseId: string;
  database: NoteDatabaseDefinition;
};

type SkillStarterNoteIconKey = "stomach" | "dumbbell";

type StarterNoteLike = {
  id?: string | null;
  title?: string | null;
  content?: string | null;
  metadata?: unknown;
};

type BackfillSkillStarterNoteInput = {
  userId: string | null | undefined;
  skillId: string | null | undefined;
  skillName: string | null | undefined;
};

type BackfillSkillStarterNoteResult = {
  created: boolean;
  skipped: boolean;
  starterNote: SkillStarterNote | null;
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
  systemDatabaseKey: string,
  iconKey: string,
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
    lockedSystemDatabase: true,
    systemDatabaseKey,
    iconKey,
  };
}

function buildStarterNote(
  kind: SkillStarterKind,
  title: string,
  icon: string,
  iconKey: SkillStarterNoteIconKey,
  databases: NoteDatabaseDefinition[],
): SkillStarterNote {
  return {
    kind,
    title,
    icon,
    content: databases.map((item) => databaseMarker(item.title, item.id)).join("\n\n"),
    metadata: {
      icon,
      iconKey,
      lockedSystemNote: true,
      systemNoteKey: `${kind}-starter`,
      databases: Object.fromEntries(databases.map((item) => [item.id, item])),
      databaseEntries: Object.fromEntries(databases.map((item) => [item.id, []])),
    },
  };
}

export const NUTRITION_DATABASE_ID = "starter-health-nutrition";
export const HYDRATION_DATABASE_ID = "starter-health-hydration";
export const FITNESS_DATABASE_ID = "starter-fitness-fitness";

const NUTRITION_DATABASE = database(
  NUTRITION_DATABASE_ID,
  "Nutrition",
  "nutrition",
  "stomach",
  [
    field(NUTRITION_DATABASE_ID, "name", "Name", "text", true),
    field(NUTRITION_DATABASE_ID, "calories", "Calories", "number"),
    field(NUTRITION_DATABASE_ID, "protein", "Protein", "number"),
    field(NUTRITION_DATABASE_ID, "notes", "Notes", "longText"),
  ],
);

const HYDRATION_DATABASE = database(
  HYDRATION_DATABASE_ID,
  "Hydration",
  "hydration",
  "droplet",
  [
    field(HYDRATION_DATABASE_ID, "name", "Name", "text", true),
    field(HYDRATION_DATABASE_ID, "amount", "Amount", "number"),
    field(HYDRATION_DATABASE_ID, "notes", "Notes", "longText"),
  ],
);

const FITNESS_DATABASE = database(
  FITNESS_DATABASE_ID,
  "Fitness",
  "fitness",
  "dumbbell",
  [
    field(FITNESS_DATABASE_ID, "name", "Name", "text", true),
    field(FITNESS_DATABASE_ID, "workout", "Workout", "text"),
    field(FITNESS_DATABASE_ID, "sets-reps-duration", "Sets/Reps or Duration", "text"),
    field(FITNESS_DATABASE_ID, "notes", "Notes", "longText"),
  ],
);

export const DEFAULT_MEMO_DATABASE_TARGETS: DefaultMemoDatabaseTarget[] = [
  {
    id: "nutrition",
    label: "Nutrition",
    databaseId: NUTRITION_DATABASE_ID,
    database: NUTRITION_DATABASE,
  },
  {
    id: "hydration",
    label: "Hydration",
    databaseId: HYDRATION_DATABASE_ID,
    database: HYDRATION_DATABASE,
  },
  {
    id: "fitness",
    label: "Fitness",
    databaseId: FITNESS_DATABASE_ID,
    database: FITNESS_DATABASE,
  },
];

export function getDefaultMemoDatabaseTarget(
  targetId: string | null | undefined,
): DefaultMemoDatabaseTarget | null {
  return (
    DEFAULT_MEMO_DATABASE_TARGETS.find((target) => target.id === targetId) ?? null
  );
}

const HEALTH_STARTER_NOTE = buildStarterNote("health", "Health", "🩺", "stomach", [
  NUTRITION_DATABASE,
  HYDRATION_DATABASE,
]);

const FITNESS_STARTER_NOTE = buildStarterNote("fitness", "Fitness", "💪", "dumbbell", [
  FITNESS_DATABASE,
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
  return Boolean(findMatchingSkillStarterNote(notes, starterNote));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function findMatchingSkillStarterNote(
  notes: StarterNoteLike[],
  starterNote: SkillStarterNote,
): StarterNoteLike | null {
  const starterDatabaseIds = Object.keys(starterNote.metadata.databases);

  return (
    notes.find((note) => {
      if ((note.title ?? "").trim() !== starterNote.title) {
        return false;
      }

      const contentMatches = (note.content ?? "").trim() === starterNote.content.trim();
      const metadata = note.metadata;
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return contentMatches;
      }

      const databases = (metadata as { databases?: unknown }).databases;
      if (!databases || typeof databases !== "object" || Array.isArray(databases)) {
        return contentMatches;
      }

      return starterDatabaseIds.every((databaseId) =>
        Object.prototype.hasOwnProperty.call(databases, databaseId),
      );
    }) ?? null
  );
}

export function getSkillStarterNoteMetadataRepair(
  note: StarterNoteLike,
  starterNote: SkillStarterNote,
): Record<string, unknown> | null {
  const currentMetadata = isRecord(note.metadata) ? note.metadata : {};
  const nextMetadata: Record<string, unknown> = {
    ...currentMetadata,
    icon:
      typeof currentMetadata.icon === "string" && currentMetadata.icon.trim()
        ? currentMetadata.icon
        : starterNote.metadata.icon,
    iconKey: starterNote.metadata.iconKey,
    lockedSystemNote: true,
    systemNoteKey: starterNote.metadata.systemNoteKey,
  };
  let changed =
    currentMetadata.lockedSystemNote !== true ||
    currentMetadata.systemNoteKey !== starterNote.metadata.systemNoteKey ||
    currentMetadata.iconKey !== starterNote.metadata.iconKey ||
    nextMetadata.icon !== currentMetadata.icon;

  const currentDatabases = isRecord(currentMetadata.databases)
    ? currentMetadata.databases
    : {};
  const nextDatabases: NoteDatabaseDefinitions = {
    ...currentDatabases,
  } as NoteDatabaseDefinitions;

  for (const [databaseId, starterDatabase] of Object.entries(starterNote.metadata.databases)) {
    const currentDatabase = isRecord(currentDatabases[databaseId])
      ? currentDatabases[databaseId]
      : {};
    const nextDatabase = {
      ...starterDatabase,
      ...currentDatabase,
      id: starterDatabase.id,
      lockedSystemDatabase: true,
      systemDatabaseKey: starterDatabase.systemDatabaseKey,
      iconKey: starterDatabase.iconKey,
      pinnedSurface: "body" as const,
    };

    nextDatabases[databaseId] = nextDatabase;

    if (
      currentDatabase.lockedSystemDatabase !== true ||
      currentDatabase.systemDatabaseKey !== starterDatabase.systemDatabaseKey ||
      currentDatabase.iconKey !== starterDatabase.iconKey ||
      currentDatabase.pinnedSurface !== "body"
    ) {
      changed = true;
    }
  }

  nextMetadata.databases = nextDatabases;

  if (!isRecord(currentMetadata.databaseEntries)) {
    nextMetadata.databaseEntries = starterNote.metadata.databaseEntries;
    changed = true;
  }

  return changed ? nextMetadata : null;
}

function dispatchStarterNoteBackfillEvents(skillId: string, noteId: string | null) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event("creator:pinned-body-databases-changed"));
  window.dispatchEvent(
    new CustomEvent("creator:skill-notes-changed", {
      detail: { skillId, noteId },
    }),
  );
}

export async function backfillSkillStarterNote({
  userId,
  skillId,
  skillName,
}: BackfillSkillStarterNoteInput): Promise<BackfillSkillStarterNoteResult> {
  const starterNote = getSkillStarterNote(skillName);
  if (!starterNote || !userId || !skillId) {
    return { created: false, skipped: true, starterNote };
  }

  const supabase = getSupabaseBrowser();
  if (!supabase) {
    return { created: false, skipped: true, starterNote };
  }

  try {
    const { data: existingNotes, error: readError } = await supabase
      .from("notes")
      .select("id,title,content,metadata")
      .eq("user_id", userId)
      .eq("skill_id", skillId);

    if (readError) {
      console.error("Failed to read notes for starter skill note backfill", {
        error: readError,
        userId,
        skillId,
        skillName,
      });
      return { created: false, skipped: true, starterNote };
    }

    const matchingStarterNote = findMatchingSkillStarterNote(
      existingNotes ?? [],
      starterNote,
    );
    if (matchingStarterNote) {
      const repairedMetadata = getSkillStarterNoteMetadataRepair(
        matchingStarterNote,
        starterNote,
      );
      if (matchingStarterNote.id && repairedMetadata) {
        const { error: repairError } = await supabase
          .from("notes")
          .update({ metadata: repairedMetadata } as never)
          .eq("user_id", userId)
          .eq("skill_id", skillId)
          .eq("id", matchingStarterNote.id);

        if (repairError) {
          console.error("Failed to repair starter skill note locks", {
            error: repairError,
            userId,
            skillId,
            skillName,
            noteId: matchingStarterNote.id,
          });
        } else {
          dispatchStarterNoteBackfillEvents(skillId, matchingStarterNote.id);
        }
      }
      return { created: false, skipped: true, starterNote };
    }

    const { data: createdNote, error: insertError } = await supabase
      .from("notes")
      .insert({
        user_id: userId,
        skill_id: skillId,
        title: starterNote.title,
        content: starterNote.content,
        metadata: starterNote.metadata,
      } as never)
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert starter skill note backfill", {
        error: insertError,
        userId,
        skillId,
        skillName,
      });
      return { created: false, skipped: true, starterNote };
    }

    const createdNoteId = (createdNote as { id?: string } | null)?.id ?? null;
    dispatchStarterNoteBackfillEvents(skillId, createdNoteId);

    return { created: true, skipped: false, starterNote };
  } catch (error) {
    console.error("Failed to backfill starter skill note", {
      error,
      userId,
      skillId,
      skillName,
    });
    return { created: false, skipped: true, starterNote };
  }
}
