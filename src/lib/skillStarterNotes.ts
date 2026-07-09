import type {
  NoteDatabaseDefinition,
  NoteDatabaseDefinitions,
  NoteDatabaseEntries,
  NoteDatabaseFieldDefinition,
  NoteDatabaseViewDefinition,
} from "@/components/notes/NoteSlashTextarea";
import { getSupabaseBrowser } from "@/lib/supabase";

type SkillStarterKind = "health" | "fitness" | "cooking";

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

type SkillStarterNoteIconKey = "stomach" | "dumbbell" | "chef-hat";

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
  cooking: "cooking",
  cook: "cooking",
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
export const ON_HAND_DATABASE_ID = "starter-cooking-on-hand";
export const NUTRITION_FOOD_FIELD_ID = `${NUTRITION_DATABASE_ID}-food`;
export const NUTRITION_CREATED_AT_FIELD_ID = `${NUTRITION_DATABASE_ID}-created-at`;
export const ON_HAND_NAME_FIELD_ID = `${ON_HAND_DATABASE_ID}-name`;
export const ON_HAND_QUANTITY_FIELD_ID = `${ON_HAND_DATABASE_ID}-quantity`;
export const ON_HAND_UNIT_FIELD_ID = `${ON_HAND_DATABASE_ID}-unit`;
export const ON_HAND_LOCATION_FIELD_ID = `${ON_HAND_DATABASE_ID}-location`;
export const ON_HAND_EXPIRES_ON_FIELD_ID = `${ON_HAND_DATABASE_ID}-expires-on`;
export const ON_HAND_NOTES_FIELD_ID = `${ON_HAND_DATABASE_ID}-notes`;

const LOCKED_STARTER_DATABASE_IDS = new Set([
  NUTRITION_DATABASE_ID,
  HYDRATION_DATABASE_ID,
  ON_HAND_DATABASE_ID,
]);
const LOCKED_STARTER_DATABASE_KEYS = new Set(["nutrition", "hydration", "on-hand"]);

export function isLockedStarterDatabaseId(databaseId: string | null | undefined) {
  return typeof databaseId === "string" && LOCKED_STARTER_DATABASE_IDS.has(databaseId);
}

export function isLockedStarterDatabase(
  database:
    | Pick<NoteDatabaseDefinition, "id" | "lockedSystemDatabase" | "systemDatabaseKey">
    | null
    | undefined,
) {
  if (!database) return false;
  if (isLockedStarterDatabaseId(database.id)) return true;

  return (
    database.lockedSystemDatabase === true &&
    typeof database.systemDatabaseKey === "string" &&
    LOCKED_STARTER_DATABASE_KEYS.has(database.systemDatabaseKey)
  );
}

const LEGACY_NUTRITION_CREATED_AT_FIELD_IDS = [
  `${NUTRITION_DATABASE_ID}-date-time`,
] as const;

const NUTRITION_DATABASE = database(
  NUTRITION_DATABASE_ID,
  "Nutrition",
  "nutrition",
  "stomach",
  [
    field(NUTRITION_DATABASE_ID, "food", "Food", "text", true),
    field(NUTRITION_DATABASE_ID, "calories", "Calories", "number"),
    field(NUTRITION_DATABASE_ID, "carbs", "Carbs", "number"),
    field(NUTRITION_DATABASE_ID, "protein", "Protein", "number"),
    field(NUTRITION_DATABASE_ID, "fat", "Fat", "number"),
    field(NUTRITION_DATABASE_ID, "created-at", "When", "createdAt"),
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

const ON_HAND_DATABASE = {
  ...database(
    ON_HAND_DATABASE_ID,
    "Grocery List",
    "on-hand",
    "🥬",
    [
      field(ON_HAND_DATABASE_ID, "name", "Name", "text", true),
      field(ON_HAND_DATABASE_ID, "quantity", "Quantity", "number"),
      field(ON_HAND_DATABASE_ID, "unit", "Unit", "text"),
      field(ON_HAND_DATABASE_ID, "location", "Location", "select"),
      field(ON_HAND_DATABASE_ID, "expires-on", "Expires", "date"),
      field(ON_HAND_DATABASE_ID, "notes", "Notes", "longText"),
    ],
  ),
  activeViewId: `${ON_HAND_DATABASE_ID}-view-list`,
};

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

const COOKING_STARTER_NOTE = buildStarterNote("cooking", "Cooking", "🍳", "chef-hat", [
  ON_HAND_DATABASE,
]);

const STARTER_NOTES: Record<SkillStarterKind, SkillStarterNote> = {
  health: HEALTH_STARTER_NOTE,
  fitness: FITNESS_STARTER_NOTE,
  cooking: COOKING_STARTER_NOTE,
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

function hasSameDefaultNutritionSchema(
  currentDatabase: Record<string, unknown>,
  starterDatabase: NoteDatabaseDefinition,
) {
  return (
    currentDatabase.titleFieldId === starterDatabase.titleFieldId &&
    currentDatabase.activeViewId === starterDatabase.activeViewId &&
    JSON.stringify(currentDatabase.fields) === JSON.stringify(starterDatabase.fields) &&
    JSON.stringify(currentDatabase.views) === JSON.stringify(starterDatabase.views)
  );
}

export function isDefaultNutritionDatabaseDefinition(
  definition: Pick<NoteDatabaseDefinition, "id" | "systemDatabaseKey"> | null | undefined,
) {
  return (
    definition?.systemDatabaseKey === "nutrition" ||
    definition?.id === NUTRITION_DATABASE_ID
  );
}

export function isDefaultFitnessDatabaseDefinition(
  definition: Pick<NoteDatabaseDefinition, "id" | "systemDatabaseKey"> | null | undefined,
) {
  return (
    definition?.systemDatabaseKey === "fitness" ||
    definition?.id === FITNESS_DATABASE_ID
  );
}

export function isOnHandDatabaseDefinition(
  definition:
    | Pick<NoteDatabaseDefinition, "id" | "systemDatabaseKey"> & { title?: string | null }
    | null
    | undefined,
) {
  const normalizedTitle = definition?.title?.trim().toLowerCase();

  return (
    definition?.systemDatabaseKey === "on-hand" ||
    definition?.id === ON_HAND_DATABASE_ID ||
    normalizedTitle === "on hand" ||
    normalizedTitle === "grocery list"
  );
}

export function getNutritionCreatedAtField(
  definition: Pick<NoteDatabaseDefinition, "id" | "systemDatabaseKey" | "fields"> | null | undefined,
) {
  if (!definition || !isDefaultNutritionDatabaseDefinition(definition)) return null;

  return (
    definition.fields.find((field) => field.id === NUTRITION_CREATED_AT_FIELD_ID) ??
    definition.fields.find(
      (field) => ["created at", "when"].includes(field.name.trim().toLowerCase()),
    ) ??
    null
  );
}

export function getNutritionCreatedAtInitialFormValues(
  definition: Pick<NoteDatabaseDefinition, "id" | "systemDatabaseKey" | "fields"> | null | undefined,
  openedAt: string,
) {
  const createdAtField = getNutritionCreatedAtField(definition);
  return createdAtField ? { [createdAtField.id]: openedAt } : {};
}

export function isDatabaseCreatedAtField(
  field: Pick<NoteDatabaseFieldDefinition, "id" | "name" | "type">,
) {
  if (field.type === "createdAt") return true;

  const normalizedName = field.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (normalizedName === "createdat") return true;

  const normalizedId = field.id.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalizedId === "createdat";
}

export function getDatabaseCreatedAtInitialFormValues(
  definition: Pick<NoteDatabaseDefinition, "fields"> | null | undefined,
  openedAt: string,
) {
  if (!definition) return {};

  return Object.fromEntries(
    definition.fields
      .filter(isDatabaseCreatedAtField)
      .map((field) => [field.id, openedAt]),
  );
}

export function isNutritionCreatedAtField(
  definition: Pick<NoteDatabaseDefinition, "id" | "systemDatabaseKey"> | null | undefined,
  field: Pick<NoteDatabaseFieldDefinition, "id" | "name">,
) {
  return (
    isDefaultNutritionDatabaseDefinition(definition) &&
    (field.id === NUTRITION_CREATED_AT_FIELD_ID ||
      ["created at", "when"].includes(field.name.trim().toLowerCase()))
  );
}

export function repairDefaultNutritionDatabaseEntries(
  databaseEntries: Record<string, unknown>,
): { databaseEntries: NoteDatabaseEntries; changed: boolean } {
  const nextDatabaseEntries: Record<string, unknown> = { ...databaseEntries };
  const currentEntries = nextDatabaseEntries[NUTRITION_DATABASE_ID];

  if (!Array.isArray(currentEntries)) {
    return {
      databaseEntries: nextDatabaseEntries as NoteDatabaseEntries,
      changed: false,
    };
  }

  let changed = false;
  const repairedEntries = currentEntries.map((entry) => {
    if (!isRecord(entry) || !isRecord(entry.values)) {
      return entry;
    }

    const values = { ...entry.values };
    let entryChanged = false;

    for (const legacyFieldId of LEGACY_NUTRITION_CREATED_AT_FIELD_IDS) {
      if (!Object.prototype.hasOwnProperty.call(values, legacyFieldId)) continue;

      if (!Object.prototype.hasOwnProperty.call(values, NUTRITION_CREATED_AT_FIELD_ID)) {
        values[NUTRITION_CREATED_AT_FIELD_ID] = values[legacyFieldId];
      }
      delete values[legacyFieldId];
      entryChanged = true;
    }

    if (!entryChanged) return entry;

    changed = true;
    return {
      ...entry,
      values,
    };
  });

  if (changed) {
    nextDatabaseEntries[NUTRITION_DATABASE_ID] = repairedEntries;
  }

  return {
    databaseEntries: nextDatabaseEntries as NoteDatabaseEntries,
    changed,
  };
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

    if (starterDatabase.systemDatabaseKey === "nutrition") {
      nextDatabase.titleFieldId = starterDatabase.titleFieldId;
      nextDatabase.fields = starterDatabase.fields;
      nextDatabase.views = starterDatabase.views;
      nextDatabase.activeViewId = starterDatabase.activeViewId;

      if (!hasSameDefaultNutritionSchema(currentDatabase, starterDatabase)) {
        changed = true;
      }
    } else if (starterDatabase.systemDatabaseKey === "on-hand") {
      nextDatabase.title = starterDatabase.title;

      if (currentDatabase.title !== starterDatabase.title) {
        changed = true;
      }
    }

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
  } else {
    const entryRepair = repairDefaultNutritionDatabaseEntries(currentMetadata.databaseEntries);
    nextMetadata.databaseEntries = entryRepair.databaseEntries;
    changed = changed || entryRepair.changed;
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
