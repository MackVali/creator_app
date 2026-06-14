import type {
  NoteDatabaseDefinition,
  NoteDatabaseDefinitions,
  NoteDatabaseEntries,
  NoteDatabaseViewDefinition,
  NoteDatabaseViewType,
} from "@/components/notes/NoteSlashTextarea";

const DEFAULT_TOP_LEVEL_DATABASE_TITLE = "Database";
const DATABASE_VIEW_TYPES: NoteDatabaseViewType[] = ["table", "list", "card"];
const DATABASE_VIEW_LABELS: Record<NoteDatabaseViewType, string> = {
  table: "Table",
  list: "List",
  card: "Card",
};

export type TopLevelDatabaseNoteDisplay = {
  databaseId: string;
  title: string;
  fieldCount: number;
  entryCount: number;
  activeViewLabel: string;
};

function buildClientDatabaseId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `database-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function buildDefaultDatabaseViewId(databaseId: string, viewType: NoteDatabaseViewType) {
  return `${databaseId}-${viewType}-view`;
}

function createDefaultDatabaseView(
  databaseId: string,
  viewType: NoteDatabaseViewType,
  visibleFieldIds: string[],
): NoteDatabaseViewDefinition {
  return {
    id: buildDefaultDatabaseViewId(databaseId, viewType),
    name: DATABASE_VIEW_LABELS[viewType],
    type: viewType,
    visibleFieldIds,
  };
}

function buildDatabaseMarker(databaseId: string, title: string) {
  return `[Database: ${title}](creator-database:${databaseId})`;
}

export function createTopLevelDatabaseNotePayload(title = DEFAULT_TOP_LEVEL_DATABASE_TITLE) {
  const databaseId = buildClientDatabaseId();
  const titleFieldId = `${databaseId}-title`;
  const visibleFieldIds = [titleFieldId];
  const databaseDefinition: NoteDatabaseDefinition = {
    id: databaseId,
    title,
    titleFieldId,
    fields: [
      {
        id: titleFieldId,
        name: "Name",
        type: "text",
        isTitle: true,
      },
    ],
    views: DATABASE_VIEW_TYPES.map((viewType) =>
      createDefaultDatabaseView(databaseId, viewType, visibleFieldIds),
    ),
    activeViewId: buildDefaultDatabaseViewId(databaseId, "table"),
    pinnedSurface: "body",
    iconKey: "database",
  };
  const metadata: Record<string, unknown> = {
    icon: "DB",
    iconKey: "database",
    topLevelDatabase: true,
    topLevelDatabaseId: databaseId,
    databases: {
      [databaseId]: databaseDefinition,
    } satisfies NoteDatabaseDefinitions,
    databaseEntries: {
      [databaseId]: [],
    } satisfies NoteDatabaseEntries,
  };

  return {
    databaseId,
    note: {
      title,
      content: buildDatabaseMarker(databaseId, title),
    },
    metadata,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getDatabaseDefinitions(metadata: Record<string, unknown>) {
  return isRecord(metadata.databases)
    ? (metadata.databases as NoteDatabaseDefinitions)
    : {};
}

function getDatabaseEntries(metadata: Record<string, unknown>) {
  return isRecord(metadata.databaseEntries)
    ? (metadata.databaseEntries as NoteDatabaseEntries)
    : {};
}

export function getTopLevelDatabaseNoteDisplay(
  metadata: Record<string, unknown> | null | undefined,
): TopLevelDatabaseNoteDisplay | null {
  if (!metadata || metadata.topLevelDatabase !== true) {
    return null;
  }

  const databases = getDatabaseDefinitions(metadata);
  const metadataDatabaseId =
    typeof metadata.topLevelDatabaseId === "string" ? metadata.topLevelDatabaseId : null;
  const databaseId = metadataDatabaseId ?? Object.keys(databases)[0] ?? null;
  if (!databaseId) return null;

  const definition = databases[databaseId];
  if (!definition) return null;

  const entries = getDatabaseEntries(metadata)[databaseId] ?? [];
  const activeView = definition.views?.find((view) => view.id === definition.activeViewId);
  const activeViewLabel =
    activeView?.name?.trim() ||
    (activeView?.type ? DATABASE_VIEW_LABELS[activeView.type] : DATABASE_VIEW_LABELS.table);

  return {
    databaseId,
    title: definition.title?.trim() || DEFAULT_TOP_LEVEL_DATABASE_TITLE,
    fieldCount: Array.isArray(definition.fields) ? definition.fields.length : 0,
    entryCount: entries.length,
    activeViewLabel,
  };
}
