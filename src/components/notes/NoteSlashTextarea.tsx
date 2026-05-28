"use client";

import {
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  FilePlus2,
  GripVertical,
  List,
  ListChecks,
  Minus,
  Plus,
  X,
  Table2,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type SlashCommandId =
  | "text"
  | "checklist"
  | "bulletList"
  | "dashList"
  | "subpage"
  | "database"
  | "divider";

type SlashCommand = {
  id: SlashCommandId;
  label: string;
  description: string;
  icon: LucideIcon;
  replacement: string;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "text",
    label: "Text",
    description: "Clean writing line",
    icon: Type,
    replacement: "",
  },
  {
    id: "checklist",
    label: "Checklist",
    description: "Track a task",
    icon: ListChecks,
    replacement: "- [ ] ",
  },
  {
    id: "bulletList",
    label: "Bullet List",
    description: "Inline bullets",
    icon: List,
    replacement: "• ",
  },
  {
    id: "dashList",
    label: "Dash List",
    description: "Simple dash rows",
    icon: Minus,
    replacement: "- ",
  },
  {
    id: "subpage",
    label: "Subpage",
    description: "Placeholder page",
    icon: FilePlus2,
    replacement: "[Subpage: Untitled]",
  },
  {
    id: "database",
    label: "Database",
    description: "Placeholder table",
    icon: Table2,
    replacement: "[Database: Untitled]",
  },
  {
    id: "divider",
    label: "Divider",
    description: "Separate sections",
    icon: Minus,
    replacement: "---",
  },
];

const NOTE_SLASH_MENU_OPEN_CLASS = "note-slash-menu-open";
const NOTE_DIVIDER_MARKER = "---";
const NOTE_SUBPAGE_TITLE_FALLBACK = "Untitled";
const NOTE_SUBPAGE_MARKER_REGEX =
  /^\[Subpage:\s*([^\]]+?)\](?:\(creator-subpage:([^)]+)\))?$/;
const NOTE_DATABASE_TITLE_FALLBACK = "Untitled";
const NOTE_DATABASE_DISPLAY_TITLE_FALLBACK = "Untitled Database";
const NOTE_DATABASE_MARKER_REGEX =
  /^\[Database:\s*([^\]]+?)\]\(creator-database:([^)]+)\)$/;
const NOTE_CHECKLIST_MARKER_REGEX = /^-\s+\[([ xX])\](?:\s?(.*))$/;
const NOTE_BULLET_LIST_MARKER_REGEX = /^•(?:\s?(.*))$/;
const NOTE_DASH_LIST_MARKER_REGEX = /^-\s(?!\[[ xX]\])([\s\S]*)$/;

const NOTE_DATABASE_FIELD_TYPES = [
  "text",
  "number",
  "select",
  "photo",
  "rating",
  "longText",
  "date",
] as const;

export type NoteDatabaseFieldType = (typeof NOTE_DATABASE_FIELD_TYPES)[number];
export type NoteDatabaseViewType = "table" | "list" | "card";

const NOTE_DATABASE_FIELD_TYPE_LABELS: Record<NoteDatabaseFieldType, string> = {
  text: "Text",
  number: "Number",
  select: "Select",
  photo: "Photo",
  rating: "Rating",
  longText: "Long text",
  date: "Date",
};

const NOTE_DATABASE_VIEW_LABELS: Record<NoteDatabaseViewType, string> = {
  table: "Table",
  list: "List",
  card: "Card",
};

const NOTE_DATABASE_VIEW_TYPES: NoteDatabaseViewType[] = ["table", "list", "card"];
const NOTE_DATABASE_TITLE_FIELD_NAMES = new Set([
  "name",
  "title",
  "meal",
  "meal name",
  "entry",
  "item",
]);

export const NOTE_DIVIDER_LINE_CLASS =
  "h-px w-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),rgba(16,185,129,0.16),rgba(255,255,255,0.07),transparent)]";

export type NoteSubpageMarker = {
  title: string;
  subpageId: string | null;
};

export type NoteDatabaseMarker = {
  title: string;
  databaseId: string;
};

export type NoteDatabaseFieldDefinition = {
  id: string;
  name: string;
  type: NoteDatabaseFieldType;
  isTitle?: boolean;
};

export type NoteDatabaseViewDefinition = {
  id: string;
  name: string;
  type: NoteDatabaseViewType;
  visibleFieldIds: string[];
};

export type NoteDatabaseDefinition = {
  id: string;
  title: string;
  titleFieldId?: string;
  fields: NoteDatabaseFieldDefinition[];
  views?: NoteDatabaseViewDefinition[];
  activeViewId?: string;
};

export type NoteDatabaseDefinitions = Record<string, NoteDatabaseDefinition>;

export type NoteDatabaseEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  values: Record<string, unknown>;
};

export type NoteDatabaseEntries = Record<string, NoteDatabaseEntry[]>;

export function isStandaloneNoteDividerLine(line: string) {
  return line.trim() === NOTE_DIVIDER_MARKER;
}

export function parseStandaloneNoteSubpageMarker(line: string): NoteSubpageMarker | null {
  const match = line.trim().match(NOTE_SUBPAGE_MARKER_REGEX);
  if (!match) return null;

  return {
    title: match[1]?.trim() || NOTE_SUBPAGE_TITLE_FALLBACK,
    subpageId: match[2]?.trim() || null,
  };
}

export function parseStandaloneNoteDatabaseMarker(line: string): NoteDatabaseMarker | null {
  const match = line.trim().match(NOTE_DATABASE_MARKER_REGEX);
  if (!match?.[2]) return null;

  return {
    title: match[1]?.trim() || NOTE_DATABASE_TITLE_FALLBACK,
    databaseId: match[2].trim(),
  };
}

let openSlashMenuCount = 0;

type NoteSlashTextareaProps = {
  value: string;
  onValueChange: (value: string) => void;
  databaseDefinitions?: NoteDatabaseDefinitions | null;
  onDatabaseDefinitionsChange?: (databases: NoteDatabaseDefinitions) => void;
  databaseEntries?: NoteDatabaseEntries | null;
  onDatabaseEntriesChange?: (entries: NoteDatabaseEntries) => void;
  onCreateSubpage?: () => Promise<{ id: string; title: string; href?: string } | null>;
  onSubpageCreated?: (
    subpage: { id: string; title: string; href?: string },
    parentContent: string,
  ) => Promise<void> | void;
  onOpenSubpage?: (subpageId: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

type NoteTextSegment = {
  type: "text";
  text: string;
};

type NoteDividerSegment = {
  type: "divider";
};

type NoteChecklistSegment = {
  type: "checklist";
  checked: boolean;
  text: string;
};

type NoteListSegment = {
  type: "list";
  kind: "bullet" | "dash";
  text: string;
};

type NoteSubpageSegment = NoteSubpageMarker & {
  type: "subpage";
  marker: string;
};

type NoteDatabaseSegment = NoteDatabaseMarker & {
  type: "database";
  marker: string;
};

type NoteSegment =
  | NoteTextSegment
  | NoteDividerSegment
  | NoteChecklistSegment
  | NoteListSegment
  | NoteSubpageSegment
  | NoteDatabaseSegment;

type SlashTrigger = {
  segmentIndex: number;
  triggerIndex: number;
} | null;

type PendingSelection =
  | {
      type: "text";
      segmentIndex: number;
      caretPosition: number;
    }
  | {
      type: "checklist";
      segmentIndex: number;
      caretPosition: number;
    }
  | {
      type: "list";
      segmentIndex: number;
      caretPosition: number;
    };

function buildStandaloneLineInsertion(marker: string, beforeSlash: string, afterCommand: string) {
  const currentLineStart = beforeSlash.lastIndexOf("\n") + 1;
  const currentLinePrefix = beforeSlash.slice(currentLineStart);
  const beforeWithoutBlankPrefix =
    currentLinePrefix.trim().length === 0 ? beforeSlash.slice(0, currentLineStart) : beforeSlash;
  const normalizedBefore = beforeWithoutBlankPrefix.replace(/\n{2,}$/, "\n");
  const afterWithoutInlineWhitespace = afterCommand.replace(/^[\t ]*(?=\n|$)/, "");
  const normalizedAfter = afterWithoutInlineWhitespace.replace(/^\n{2,}/, "\n");
  const prefix = normalizedBefore.length > 0 && !normalizedBefore.endsWith("\n") ? "\n" : "";
  const suffix = normalizedAfter.startsWith("\n") ? "" : "\n";
  const insertion = `${prefix}${marker}${suffix}`;
  const nextValue = normalizedBefore + insertion + normalizedAfter;
  const markerStart = normalizedBefore.length + prefix.length;
  const caretPosition = normalizedBefore.length + insertion.length;

  return { caretPosition, markerStart, nextValue };
}

function buildSubpageMarker(subpage: { id?: string | null; title?: string | null }) {
  const title = subpage.title?.trim() || NOTE_SUBPAGE_TITLE_FALLBACK;
  const id = subpage.id?.trim();
  return id ? `[Subpage: ${title}](creator-subpage:${id})` : `[Subpage: ${title}]`;
}

function buildDatabaseMarker(database: { id: string; title?: string | null }) {
  const title = database.title?.trim() || NOTE_DATABASE_TITLE_FALLBACK;
  return `[Database: ${title}](creator-database:${database.id})`;
}

function buildClientDatabaseId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `database-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function buildClientDatabaseFieldId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `field-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function buildDefaultDatabaseTitleFieldId(databaseId: string) {
  return `${databaseId}-title`;
}

function buildDefaultDatabaseViewId(databaseId: string, viewType: NoteDatabaseViewType) {
  return `${databaseId}-${viewType}-view`;
}

function buildClientDatabaseEntryId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function getDatabaseDisplayTitle(title: string | null | undefined) {
  const trimmedTitle = title?.trim() ?? "";
  return trimmedTitle.length === 0 || trimmedTitle === NOTE_DATABASE_TITLE_FALLBACK
    ? NOTE_DATABASE_DISPLAY_TITLE_FALLBACK
    : trimmedTitle;
}

function normalizeDatabaseFieldType(type: unknown): NoteDatabaseFieldType {
  if (typeof type !== "string") return "text";
  const normalizedType = NOTE_DATABASE_FIELD_TYPES.find(
    (fieldType) => fieldType.toLowerCase() === type.toLowerCase(),
  );
  return normalizedType ?? "text";
}

function createDefaultDatabaseTitleField(databaseId: string): NoteDatabaseFieldDefinition {
  return {
    id: buildDefaultDatabaseTitleFieldId(databaseId),
    name: "Name",
    type: "text",
    isTitle: true,
  };
}

function getDefaultDatabaseVisibleFieldIds(fields: NoteDatabaseFieldDefinition[], titleFieldId: string) {
  return [
    titleFieldId,
    ...fields.filter((field) => field.id !== titleFieldId).map((field) => field.id),
  ].slice(0, 5);
}

function createDefaultDatabaseView(
  databaseId: string,
  viewType: NoteDatabaseViewType,
  visibleFieldIds: string[],
): NoteDatabaseViewDefinition {
  return {
    id: buildDefaultDatabaseViewId(databaseId, viewType),
    name: NOTE_DATABASE_VIEW_LABELS[viewType],
    type: viewType,
    visibleFieldIds,
  };
}

function createDefaultDatabaseDefinition(segment: NoteDatabaseSegment): NoteDatabaseDefinition {
  const titleField = createDefaultDatabaseTitleField(segment.databaseId);
  const visibleFieldIds = getDefaultDatabaseVisibleFieldIds([titleField], titleField.id);

  return {
    id: segment.databaseId,
    title: NOTE_DATABASE_DISPLAY_TITLE_FALLBACK,
    titleFieldId: titleField.id,
    fields: [titleField],
    views: NOTE_DATABASE_VIEW_TYPES.map((viewType) =>
      createDefaultDatabaseView(segment.databaseId, viewType, visibleFieldIds),
    ),
    activeViewId: buildDefaultDatabaseViewId(segment.databaseId, "table"),
  };
}

function createDefaultDatabaseField(): NoteDatabaseFieldDefinition {
  return {
    id: buildClientDatabaseFieldId(),
    name: "Untitled field",
    type: "text",
  };
}

function findInferredDatabaseTitleField(fields: NoteDatabaseFieldDefinition[]) {
  const explicitTitleField = fields.find((field) => field.isTitle);
  if (explicitTitleField) return explicitTitleField;

  return fields.find((field) => {
    const normalizedName = field.name.trim().toLowerCase();
    return field.type === "text" && NOTE_DATABASE_TITLE_FIELD_NAMES.has(normalizedName);
  });
}

function normalizeDatabaseVisibleFieldIds(
  visibleFieldIds: unknown,
  fields: NoteDatabaseFieldDefinition[],
  titleFieldId: string,
) {
  const validFieldIds = new Set(fields.map((field) => field.id));
  const existingIds = Array.isArray(visibleFieldIds)
    ? visibleFieldIds.filter((fieldId): fieldId is string => {
        return typeof fieldId === "string" && validFieldIds.has(fieldId);
      })
    : [];
  const orderedIds =
    existingIds.length > 0
      ? [
          titleFieldId,
          ...fields
            .map((field) => field.id)
            .filter((fieldId) => fieldId !== titleFieldId && existingIds.includes(fieldId)),
        ]
      : getDefaultDatabaseVisibleFieldIds(fields, titleFieldId);

  return Array.from(new Set(orderedIds));
}

function normalizeDatabaseDefinition(definition: NoteDatabaseDefinition): NoteDatabaseDefinition {
  const databaseId = definition.id;
  const normalizedFields = (Array.isArray(definition.fields) ? definition.fields : []).map(
    (field) => ({
      ...field,
      id: field.id || buildClientDatabaseFieldId(),
      name: typeof field.name === "string" ? field.name : "Untitled field",
      type: normalizeDatabaseFieldType(field.type),
    }),
  );
  const existingTitleField =
    (definition.titleFieldId
      ? normalizedFields.find((field) => field.id === definition.titleFieldId)
      : null) ?? findInferredDatabaseTitleField(normalizedFields);
  const titleField = existingTitleField ?? createDefaultDatabaseTitleField(databaseId);
  const titleFieldId = titleField.id;
  const hasTitleField = normalizedFields.some((field) => field.id === titleFieldId);
  const fields = (hasTitleField ? normalizedFields : [titleField, ...normalizedFields]).map(
    (field) =>
      field.id === titleFieldId
        ? { ...field, type: "text" as const, isTitle: true }
        : { ...field, isTitle: false },
  );
  const defaultVisibleFieldIds = getDefaultDatabaseVisibleFieldIds(fields, titleFieldId);
  const rawViews = Array.isArray(definition.views) ? definition.views : [];
  const views = NOTE_DATABASE_VIEW_TYPES.map((viewType) => {
    const existingView = rawViews.find((view) => view?.type === viewType);
    return existingView
      ? {
          ...existingView,
          id: existingView.id || buildDefaultDatabaseViewId(databaseId, viewType),
          name: existingView.name?.trim() || NOTE_DATABASE_VIEW_LABELS[viewType],
          type: viewType,
          visibleFieldIds: normalizeDatabaseVisibleFieldIds(
            existingView.visibleFieldIds,
            fields,
            titleFieldId,
          ),
        }
      : createDefaultDatabaseView(databaseId, viewType, defaultVisibleFieldIds);
  });
  const activeView = views.find((view) => view.id === definition.activeViewId) ?? views[0];

  return {
    ...definition,
    id: databaseId,
    title: definition.title?.trim() ? definition.title : NOTE_DATABASE_DISPLAY_TITLE_FALLBACK,
    titleFieldId,
    fields,
    views,
    activeViewId: activeView?.id,
  };
}

function normalizeDatabaseDefinitionsForSegments(
  segments: NoteSegment[],
  databaseDefinitions: NoteDatabaseDefinitions | null | undefined,
) {
  const currentDefinitions = databaseDefinitions ?? {};
  const nextDefinitions: NoteDatabaseDefinitions = { ...currentDefinitions };
  let changed = false;

  segments.forEach((segment) => {
    if (segment.type !== "database") return;

    const currentDefinition =
      nextDefinitions[segment.databaseId] ?? createDefaultDatabaseDefinition(segment);
    const normalizedDefinition = normalizeDatabaseDefinition(currentDefinition);

    if (JSON.stringify(currentDefinition) !== JSON.stringify(normalizedDefinition)) {
      changed = true;
    }

    if (!nextDefinitions[segment.databaseId]) {
      changed = true;
    }

    nextDefinitions[segment.databaseId] = normalizedDefinition;
  });

  return { changed, definitions: nextDefinitions };
}

function getDatabaseTitleField(definition: NoteDatabaseDefinition) {
  return (
    definition.fields.find((field) => field.id === definition.titleFieldId) ??
    definition.fields.find((field) => field.isTitle) ??
    definition.fields[0] ??
    null
  );
}

function getDatabaseFieldsWithTitleFirst(definition: NoteDatabaseDefinition) {
  const titleField = getDatabaseTitleField(definition);
  if (!titleField) return definition.fields;

  return [
    titleField,
    ...definition.fields.filter((field) => field.id !== titleField.id),
  ];
}

function getActiveDatabaseView(definition: NoteDatabaseDefinition) {
  return (
    definition.views?.find((view) => view.id === definition.activeViewId) ??
    definition.views?.[0] ??
    createDefaultDatabaseView(
      definition.id,
      "table",
      getDefaultDatabaseVisibleFieldIds(definition.fields, definition.titleFieldId ?? ""),
    )
  );
}

function getVisibleDatabaseFields(definition: NoteDatabaseDefinition) {
  const activeView = getActiveDatabaseView(definition);
  const titleField = getDatabaseTitleField(definition);
  const visibleIds = new Set(activeView.visibleFieldIds);
  const visibleFields = getDatabaseFieldsWithTitleFirst(definition).filter(
    (field) => field.id === titleField?.id || visibleIds.has(field.id),
  );

  return visibleFields.length > 0 ? visibleFields : getDatabaseFieldsWithTitleFirst(definition);
}

function isUsefulDatabaseEntryValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function formatDatabaseEntryValue(value: unknown, fieldType?: NoteDatabaseFieldType) {
  if (!isUsefulDatabaseEntryValue(value)) return "";

  if (fieldType === "rating") {
    return `${value}/5`;
  }

  if (fieldType === "date" && typeof value === "string") {
    const parsedDate = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
  }

  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  return "";
}

function getDatabaseFieldName(field: NoteDatabaseFieldDefinition) {
  return field.name.trim() || (field.isTitle ? "Name" : "Untitled field");
}

function getDatabaseEntryTitle(entry: NoteDatabaseEntry, definition: NoteDatabaseDefinition) {
  const titleField = getDatabaseTitleField(definition);
  if (!titleField) return "Untitled";

  return formatDatabaseEntryValue(entry.values[titleField.id], titleField.type) || "Untitled";
}

function getDatabaseEntryProperties(
  entry: NoteDatabaseEntry,
  definition: NoteDatabaseDefinition,
  limit?: number,
) {
  const titleField = getDatabaseTitleField(definition);
  const properties = getVisibleDatabaseFields(definition)
    .filter((field) => field.id !== titleField?.id)
    .map((field) => ({
      field,
      value: formatDatabaseEntryValue(entry.values[field.id], field.type),
    }));

  return typeof limit === "number" ? properties.slice(0, limit) : properties;
}

function getDatabaseEntryFieldValue(
  field: NoteDatabaseFieldDefinition,
  rawValue: string,
): unknown {
  const trimmedValue = rawValue.trim();

  if (field.type === "number") {
    if (trimmedValue.length === 0) return null;
    const numericValue = Number(trimmedValue);
    return Number.isNaN(numericValue) ? null : numericValue;
  }

  if (field.type === "rating") {
    if (trimmedValue.length === 0) return null;
    const numericValue = Number(trimmedValue);
    if (Number.isNaN(numericValue)) return null;
    return Math.min(5, Math.max(1, numericValue));
  }

  if (field.type === "photo") {
    return null;
  }

  return rawValue;
}

function serializeSegment(segment: NoteSegment) {
  if (segment.type === "text") return segment.text;
  if (segment.type === "divider") return NOTE_DIVIDER_MARKER;
  if (segment.type === "checklist") return `- [${segment.checked ? "x" : " "}] ${segment.text}`;
  if (segment.type === "list") return `${segment.kind === "bullet" ? "•" : "-"} ${segment.text}`;
  return segment.marker;
}

function parseStandaloneNoteChecklistMarker(line: string): NoteChecklistSegment | null {
  const match = line.match(NOTE_CHECKLIST_MARKER_REGEX);
  if (!match) return null;

  return {
    type: "checklist",
    checked: match[1]?.toLowerCase() === "x",
    text: match[2] ?? "",
  };
}

function parseStandaloneNoteListMarker(line: string): NoteListSegment | null {
  const bulletMatch = line.match(NOTE_BULLET_LIST_MARKER_REGEX);
  if (bulletMatch) {
    return {
      type: "list",
      kind: "bullet",
      text: bulletMatch[1] ?? "",
    };
  }

  const dashMatch = line.match(NOTE_DASH_LIST_MARKER_REGEX);
  if (!dashMatch) return null;

  return {
    type: "list",
    kind: "dash",
    text: dashMatch[1] ?? "",
  };
}

function parseNoteSegments(content: string): NoteSegment[] {
  const nextSegments: NoteSegment[] = [];
  const textLines: string[] = [];

  function flushText() {
    if (textLines.length === 0) return;
    nextSegments.push({ type: "text", text: textLines.join("\n") });
    textLines.length = 0;
  }

  content.split("\n").forEach((line) => {
    if (isStandaloneNoteDividerLine(line)) {
      flushText();
      nextSegments.push({ type: "divider" });
      return;
    }

    const subpageMarker = parseStandaloneNoteSubpageMarker(line);
    if (subpageMarker) {
      flushText();
      nextSegments.push({
        type: "subpage",
        marker: buildSubpageMarker(subpageMarker),
        ...subpageMarker,
      });
      return;
    }

    const databaseMarker = parseStandaloneNoteDatabaseMarker(line);
    if (databaseMarker) {
      flushText();
      nextSegments.push({
        type: "database",
        marker: buildDatabaseMarker({
          id: databaseMarker.databaseId,
          title: databaseMarker.title,
        }),
        ...databaseMarker,
      });
      return;
    }

    const checklistMarker = parseStandaloneNoteChecklistMarker(line);
    if (checklistMarker) {
      flushText();
      nextSegments.push(checklistMarker);
      return;
    }

    const listMarker = parseStandaloneNoteListMarker(line);
    if (listMarker) {
      flushText();
      nextSegments.push(listMarker);
      return;
    }

    textLines.push(line);
  });

  flushText();

  if (nextSegments.length === 0 || nextSegments[nextSegments.length - 1]?.type !== "text") {
    nextSegments.push({ type: "text", text: "" });
  }

  return nextSegments;
}

function serializeNoteSegments(nextSegments: NoteSegment[]) {
  return nextSegments.map(serializeSegment).join("\n");
}

function getSegmentStartOffsets(nextSegments: NoteSegment[]) {
  let offset = 0;
  return nextSegments.map((segment, index) => {
    const segmentOffset = offset;
    offset += serializeSegment(segment).length;
    if (index < nextSegments.length - 1) {
      offset += 1;
    }
    return segmentOffset;
  });
}

function findTextSelectionForCaret(nextSegments: NoteSegment[], caretOffset: number) {
  const offsets = getSegmentStartOffsets(nextSegments);
  let previousTextIndex: number | null = null;

  for (let index = 0; index < nextSegments.length; index += 1) {
    const segment = nextSegments[index];
    const start = offsets[index] ?? 0;
    const end = start + serializeSegment(segment).length;

    if (segment.type !== "text") {
      continue;
    }

    if (caretOffset >= start && caretOffset <= end) {
      return { type: "text" as const, segmentIndex: index, caretPosition: caretOffset - start };
    }

    if (start > caretOffset) {
      return { type: "text" as const, segmentIndex: index, caretPosition: 0 };
    }

    previousTextIndex = index;
  }

  if (previousTextIndex !== null) {
    const previousText = nextSegments[previousTextIndex];
    return {
      type: "text" as const,
      segmentIndex: previousTextIndex,
      caretPosition: previousText.type === "text" ? previousText.text.length : 0,
    };
  }

  return null;
}

function findChecklistSelectionForCaret(nextSegments: NoteSegment[], caretOffset: number) {
  const offsets = getSegmentStartOffsets(nextSegments);

  for (let index = 0; index < nextSegments.length; index += 1) {
    const segment = nextSegments[index];
    if (segment.type !== "checklist") continue;

    const start = offsets[index] ?? 0;
    const markerLength = segment.checked ? "- [x] ".length : "- [ ] ".length;
    const end = start + serializeSegment(segment).length;

    if (caretOffset >= start && caretOffset <= end) {
      return {
        type: "checklist" as const,
        segmentIndex: index,
        caretPosition: Math.max(0, caretOffset - start - markerLength),
      };
    }
  }

  return null;
}

function findListSelectionForCaret(nextSegments: NoteSegment[], caretOffset: number) {
  const offsets = getSegmentStartOffsets(nextSegments);

  for (let index = 0; index < nextSegments.length; index += 1) {
    const segment = nextSegments[index];
    if (segment.type !== "list") continue;

    const start = offsets[index] ?? 0;
    const markerLength = `${segment.kind === "bullet" ? "•" : "-"} `.length;
    const end = start + serializeSegment(segment).length;

    if (caretOffset >= start && caretOffset <= end) {
      return {
        type: "list" as const,
        segmentIndex: index,
        caretPosition: Math.max(0, caretOffset - start - markerLength),
      };
    }
  }

  return null;
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export function NoteSlashTextarea({
  value,
  onValueChange,
  databaseDefinitions,
  onDatabaseDefinitionsChange,
  databaseEntries,
  onDatabaseEntriesChange,
  onCreateSubpage,
  onSubpageCreated,
  onOpenSubpage,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: NoteSlashTextareaProps) {
  const textareaRefs = useRef(new Map<number, HTMLTextAreaElement>());
  const lineInputRefs = useRef(new Map<number, HTMLInputElement>());
  const [slashTrigger, setSlashTrigger] = useState<SlashTrigger>(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [activeDatabaseId, setActiveDatabaseId] = useState<string | null>(null);
  const [activeEntryDatabaseId, setActiveEntryDatabaseId] = useState<string | null>(null);
  const [entryFormValues, setEntryFormValues] = useState<Record<string, string>>({});
  const isMenuOpen = slashTrigger !== null;

  const segments = useMemo(() => parseNoteSegments(value), [value]);
  const normalizedDatabaseDefinitions = useMemo(
    () => normalizeDatabaseDefinitionsForSegments(segments, databaseDefinitions).definitions,
    [databaseDefinitions, segments],
  );
  const activeDatabaseSegment = useMemo(
    () =>
      activeDatabaseId
        ? segments.find(
            (segment): segment is NoteDatabaseSegment =>
              segment.type === "database" && segment.databaseId === activeDatabaseId,
          ) ?? null
        : null,
    [activeDatabaseId, segments],
  );
  const activeDatabaseDefinition =
    activeDatabaseId && activeDatabaseSegment
      ? (normalizedDatabaseDefinitions[activeDatabaseId] ??
        createDefaultDatabaseDefinition(activeDatabaseSegment))
      : null;
  const activeEntryDatabaseSegment = useMemo(
    () =>
      activeEntryDatabaseId
        ? segments.find(
            (segment): segment is NoteDatabaseSegment =>
              segment.type === "database" && segment.databaseId === activeEntryDatabaseId,
          ) ?? null
        : null,
    [activeEntryDatabaseId, segments],
  );
  const activeEntryDatabaseDefinition =
    activeEntryDatabaseId && activeEntryDatabaseSegment
      ? (normalizedDatabaseDefinitions[activeEntryDatabaseId] ??
        createDefaultDatabaseDefinition(activeEntryDatabaseSegment))
      : null;
  const activeEntryDatabaseFields = activeEntryDatabaseDefinition
    ? getDatabaseFieldsWithTitleFirst(activeEntryDatabaseDefinition)
    : [];
  const activeDatabaseFields = activeDatabaseDefinition
    ? getDatabaseFieldsWithTitleFirst(activeDatabaseDefinition)
    : [];
  const activeDatabaseView = activeDatabaseDefinition
    ? getActiveDatabaseView(activeDatabaseDefinition)
    : null;

  useEffect(() => {
    if (!isMenuOpen) return;

    const roots = [document.documentElement, document.body];
    openSlashMenuCount += 1;
    roots.forEach((root) => root.classList.add(NOTE_SLASH_MENU_OPEN_CLASS));

    return () => {
      openSlashMenuCount = Math.max(0, openSlashMenuCount - 1);

      if (openSlashMenuCount === 0) {
        roots.forEach((root) => root.classList.remove(NOTE_SLASH_MENU_OPEN_CLASS));
      }
    };
  }, [isMenuOpen]);

  useLayoutEffect(() => {
    if (pendingSelection === null) return;

    if (pendingSelection.type === "checklist" || pendingSelection.type === "list") {
      const input = lineInputRefs.current.get(pendingSelection.segmentIndex);
      if (!input) return;

      input.focus();
      input.setSelectionRange(pendingSelection.caretPosition, pendingSelection.caretPosition);
      setPendingSelection(null);
      return;
    }

    const textarea = textareaRefs.current.get(pendingSelection.segmentIndex);
    if (!textarea) return;

    resizeTextarea(textarea);
    textarea.focus();
    textarea.setSelectionRange(pendingSelection.caretPosition, pendingSelection.caretPosition);
    setPendingSelection(null);
  }, [pendingSelection, value]);

  useEffect(() => {
    if (!slashTrigger) return;

    const segment = segments[slashTrigger.segmentIndex];
    if (segment?.type !== "text" || segment.text[slashTrigger.triggerIndex] !== "/") {
      setSlashTrigger(null);
    }
  }, [segments, slashTrigger]);

  useEffect(() => {
    const { changed, definitions } = normalizeDatabaseDefinitionsForSegments(
      segments,
      databaseDefinitions,
    );

    if (changed) {
      onDatabaseDefinitionsChange?.(definitions);
    }
  }, [databaseDefinitions, onDatabaseDefinitionsChange, segments]);

  useEffect(() => {
    if (activeDatabaseId) {
      const databaseStillExists = segments.some(
        (segment) => segment.type === "database" && segment.databaseId === activeDatabaseId,
      );

      if (!databaseStillExists) {
        setActiveDatabaseId(null);
      }
    }

    if (activeEntryDatabaseId) {
      const entryDatabaseStillExists = segments.some(
        (segment) => segment.type === "database" && segment.databaseId === activeEntryDatabaseId,
      );

      if (!entryDatabaseStillExists) {
        setActiveEntryDatabaseId(null);
        setEntryFormValues({});
      }
    }

  }, [activeDatabaseId, activeEntryDatabaseId, segments]);

  function closeMenu() {
    setSlashTrigger(null);
    setSelectedCommandIndex(0);
  }

  function syncSlashTrigger(segmentIndex: number, nextText: string, caretPosition: number) {
    if (nextText[caretPosition - 1] === "/") {
      setSlashTrigger({ segmentIndex, triggerIndex: caretPosition - 1 });
      setSelectedCommandIndex(0);
      return;
    }

    if (slashTrigger?.segmentIndex === segmentIndex) {
      const slashWasDeleted = nextText[slashTrigger.triggerIndex] !== "/";
      const caretMovedBeforeTrigger = caretPosition <= slashTrigger.triggerIndex;

      if (slashWasDeleted || caretMovedBeforeTrigger) {
        closeMenu();
      }
    }
  }

  function updateTextSegment(segmentIndex: number, nextText: string) {
    const nextSegments = segments.map((segment, index) =>
      index === segmentIndex && segment.type === "text"
        ? { type: "text" as const, text: nextText }
        : segment,
    );
    onValueChange(serializeNoteSegments(nextSegments));
  }

  function removeSegment(segmentIndex: number) {
    const removedSegment = segments[segmentIndex];
    const nextSegments = segments.filter((_, index) => index !== segmentIndex);
    const focusIndex = findNearestTextSegmentIndex(nextSegments, segmentIndex);
    onValueChange(serializeNoteSegments(nextSegments));

    if (removedSegment?.type === "database" && databaseDefinitions?.[removedSegment.databaseId]) {
      const nextDefinitions = { ...databaseDefinitions };
      delete nextDefinitions[removedSegment.databaseId];
      onDatabaseDefinitionsChange?.(nextDefinitions);
    }

    if (removedSegment?.type === "database" && databaseEntries?.[removedSegment.databaseId]) {
      const nextEntries = { ...databaseEntries };
      delete nextEntries[removedSegment.databaseId];
      onDatabaseEntriesChange?.(nextEntries);
    }

    if (focusIndex !== null) {
      const focusSegment = nextSegments[focusIndex];
      setPendingSelection({
        type: "text",
        segmentIndex: focusIndex,
        caretPosition: focusSegment.type === "text" ? focusSegment.text.length : 0,
      });
    }
  }

  function updateChecklistSegment(
    segmentIndex: number,
    nextChecklist: Partial<Pick<NoteChecklistSegment, "checked" | "text">>,
  ) {
    const nextSegments = segments.map((segment, index) =>
      index === segmentIndex && segment.type === "checklist"
        ? { ...segment, ...nextChecklist }
        : segment,
    );
    onValueChange(serializeNoteSegments(nextSegments));
  }

  function updateListSegment(
    segmentIndex: number,
    nextListItem: Partial<Pick<NoteListSegment, "text">>,
  ) {
    const nextSegments = segments.map((segment, index) =>
      index === segmentIndex && segment.type === "list"
        ? { ...segment, ...nextListItem }
        : segment,
    );
    onValueChange(serializeNoteSegments(nextSegments));
  }

  function exitInlineRow(segmentIndex: number) {
    const segmentStart = getSegmentStartOffsets(segments)[segmentIndex] ?? 0;
    const nextSegments = segments.map((segment, index) =>
      index === segmentIndex ? { type: "text" as const, text: "" } : segment,
    );
    const nextValue = serializeNoteSegments(nextSegments);
    const parsedNextSegments = parseNoteSegments(nextValue);

    onValueChange(nextValue);
    setPendingSelection(findTextSelectionForCaret(parsedNextSegments, segmentStart));
  }

  function splitInlineRow(
    segmentIndex: number,
    selectionStart: number,
    selectionEnd: number,
  ) {
    const segment = segments[segmentIndex];
    if (segment?.type !== "checklist" && segment?.type !== "list") return;

    if (segment.text.trim().length === 0) {
      exitInlineRow(segmentIndex);
      return;
    }

    const nextText = segment.text.slice(0, selectionStart);
    const insertedText = segment.text.slice(selectionEnd);
    const insertedSegment =
      segment.type === "checklist"
        ? ({
            type: "checklist",
            checked: false,
            text: insertedText,
          } satisfies NoteChecklistSegment)
        : ({
            type: "list",
            kind: segment.kind,
            text: insertedText,
          } satisfies NoteListSegment);

    const nextSegments = segments.map((currentSegment, index) =>
      index === segmentIndex ? { ...segment, text: nextText } : currentSegment,
    );
    nextSegments.splice(segmentIndex + 1, 0, insertedSegment);
    onValueChange(serializeNoteSegments(nextSegments));
    setPendingSelection({
      type: insertedSegment.type,
      segmentIndex: segmentIndex + 1,
      caretPosition: 0,
    });
  }

  function findNearestTextSegmentIndex(nextSegments: NoteSegment[], removedIndex: number) {
    for (let index = Math.min(removedIndex, nextSegments.length - 1); index >= 0; index -= 1) {
      if (nextSegments[index]?.type === "text") return index;
    }

    for (let index = removedIndex; index < nextSegments.length; index += 1) {
      if (nextSegments[index]?.type === "text") return index;
    }

    return null;
  }

  function openSubpage(subpageId: string | null) {
    if (!subpageId) return;
    onOpenSubpage?.(subpageId);
  }

  function updateDatabaseDefinition(
    databaseId: string,
    getNextDefinition: (currentDefinition: NoteDatabaseDefinition) => NoteDatabaseDefinition,
  ) {
    const databaseSegment = segments.find(
      (segment): segment is NoteDatabaseSegment =>
        segment.type === "database" && segment.databaseId === databaseId,
    );
    if (!databaseSegment) return;

    const currentDefinitions = normalizedDatabaseDefinitions;
    const currentDefinition =
      currentDefinitions[databaseId] ?? createDefaultDatabaseDefinition(databaseSegment);
    const nextDefinition = normalizeDatabaseDefinition(getNextDefinition(currentDefinition));

    onDatabaseDefinitionsChange?.({
      ...currentDefinitions,
      [databaseId]: nextDefinition,
    });
  }

  function openDatabaseBuilder(segment: NoteDatabaseSegment) {
    setActiveDatabaseId(segment.databaseId);

    if (!databaseDefinitions?.[segment.databaseId]) {
      updateDatabaseDefinition(segment.databaseId, (currentDefinition) => currentDefinition);
    }
  }

  function openDatabaseEntrySheet(segment: NoteDatabaseSegment) {
    setActiveEntryDatabaseId(segment.databaseId);
    setEntryFormValues({});

    if (!databaseDefinitions?.[segment.databaseId]) {
      updateDatabaseDefinition(segment.databaseId, (currentDefinition) => currentDefinition);
    }
  }

  function closeDatabaseEntrySheet() {
    setActiveEntryDatabaseId(null);
    setEntryFormValues({});
  }

  function updateEntryFormValue(fieldId: string, value: string) {
    setEntryFormValues((current) => ({ ...current, [fieldId]: value }));
  }

  function saveDatabaseEntry() {
    if (!activeEntryDatabaseDefinition) return;

    const now = new Date().toISOString();
    const formFields = getDatabaseFieldsWithTitleFirst(activeEntryDatabaseDefinition);
    const values = formFields.reduce<Record<string, unknown>>(
      (nextValues, field) => {
        const rawValue = entryFormValues[field.id] ?? "";
        const value = getDatabaseEntryFieldValue(field, rawValue);

        if (isUsefulDatabaseEntryValue(value)) {
          nextValues[field.id] = value;
        }

        return nextValues;
      },
      {},
    );
    const nextEntry: NoteDatabaseEntry = {
      id: buildClientDatabaseEntryId(),
      createdAt: now,
      updatedAt: now,
      values,
    };
    const currentEntries = databaseEntries ?? {};

    onDatabaseEntriesChange?.({
      ...currentEntries,
      [activeEntryDatabaseDefinition.id]: [
        ...(currentEntries[activeEntryDatabaseDefinition.id] ?? []),
        nextEntry,
      ],
    });
    closeDatabaseEntrySheet();
  }

  function updateDatabaseTitle(databaseId: string, title: string) {
    updateDatabaseDefinition(databaseId, (currentDefinition) => ({
      ...currentDefinition,
      title,
    }));
  }

  function addDatabaseField(databaseId: string) {
    updateDatabaseDefinition(databaseId, (currentDefinition) => {
      const nextField = createDefaultDatabaseField();

      return {
        ...currentDefinition,
        fields: [...currentDefinition.fields, nextField],
        views: currentDefinition.views?.map((view) => ({
          ...view,
          visibleFieldIds: Array.from(new Set([...view.visibleFieldIds, nextField.id])),
        })),
      };
    });
  }

  function updateDatabaseField(
    databaseId: string,
    fieldId: string,
    updates: Partial<Pick<NoteDatabaseFieldDefinition, "name" | "type">>,
  ) {
    updateDatabaseDefinition(databaseId, (currentDefinition) => ({
      ...currentDefinition,
      fields: currentDefinition.fields.map((field) =>
        field.id === fieldId ? { ...field, ...updates } : field,
      ),
    }));
  }

  function removeDatabaseField(databaseId: string, fieldId: string) {
    updateDatabaseDefinition(databaseId, (currentDefinition) => {
      if (fieldId === currentDefinition.titleFieldId) return currentDefinition;

      return {
        ...currentDefinition,
        fields: currentDefinition.fields.filter((field) => field.id !== fieldId),
        views: currentDefinition.views?.map((view) => ({
          ...view,
          visibleFieldIds: view.visibleFieldIds.filter(
            (visibleFieldId) => visibleFieldId !== fieldId,
          ),
        })),
      };
    });
  }

  function updateDatabaseActiveView(databaseId: string, viewType: NoteDatabaseViewType) {
    updateDatabaseDefinition(databaseId, (currentDefinition) => {
      const activeView = currentDefinition.views?.find((view) => view.type === viewType);
      return {
        ...currentDefinition,
        activeViewId:
          activeView?.id ?? buildDefaultDatabaseViewId(currentDefinition.id, viewType),
      };
    });
  }

  function updateDatabaseViewFieldVisibility(
    databaseId: string,
    viewId: string,
    fieldId: string,
    isVisible: boolean,
  ) {
    updateDatabaseDefinition(databaseId, (currentDefinition) => {
      const titleField = getDatabaseTitleField(currentDefinition);
      if (!titleField || (fieldId === titleField.id && !isVisible)) return currentDefinition;

      const fieldsWithTitleFirst = getDatabaseFieldsWithTitleFirst(currentDefinition);

      return {
        ...currentDefinition,
        views: currentDefinition.views?.map((view) => {
          if (view.id !== viewId) return view;

          const visibleIds = new Set(view.visibleFieldIds);
          if (isVisible) {
            visibleIds.add(fieldId);
          } else {
            visibleIds.delete(fieldId);
          }
          visibleIds.add(titleField.id);

          return {
            ...view,
            visibleFieldIds: fieldsWithTitleFirst
              .filter((field) => field.id === titleField.id || visibleIds.has(field.id))
              .map((field) => field.id),
          };
        }),
      };
    });
  }

  async function applyCommand(command: SlashCommand) {
    if (!slashTrigger) return;

    const activeSegment = segments[slashTrigger.segmentIndex];
    if (activeSegment?.type !== "text") return;

    const textarea = textareaRefs.current.get(slashTrigger.segmentIndex);
    const selectionEnd = textarea?.selectionEnd ?? slashTrigger.triggerIndex + 1;
    const replacementEnd = Math.max(selectionEnd, slashTrigger.triggerIndex + 1);
    const before = activeSegment.text.slice(0, slashTrigger.triggerIndex);
    const after = activeSegment.text.slice(replacementEnd);
    let replacement = command.replacement;
    let createdSubpage: { id: string; title: string; href?: string } | null = null;
    let createdDatabaseDefinition: NoteDatabaseDefinition | null = null;

    if (command.id === "subpage" && onCreateSubpage) {
      try {
        const subpage = await onCreateSubpage();
        if (!subpage) return;
        createdSubpage = subpage;
        replacement = buildSubpageMarker(subpage);
      } catch (error) {
        console.error("Failed to create subpage note", { error });
        return;
      }
    }

    if (command.id === "database") {
      const databaseId = buildClientDatabaseId();
      replacement = buildDatabaseMarker({ id: databaseId });
      createdDatabaseDefinition = createDefaultDatabaseDefinition({
        type: "database",
        marker: replacement,
        title: NOTE_DATABASE_TITLE_FALLBACK,
        databaseId,
      });
    }

    const shouldInsertStandaloneLine = [
      "checklist",
      "bulletList",
      "dashList",
      "divider",
      "subpage",
      "database",
    ].includes(command.id);
    const {
      caretPosition,
      markerStart,
      nextValue: nextText,
    } = shouldInsertStandaloneLine
      ? buildStandaloneLineInsertion(replacement, before, after)
      : {
          caretPosition: slashTrigger.triggerIndex + replacement.length,
          markerStart: slashTrigger.triggerIndex,
          nextValue: before + replacement + after,
        };

    const activeSegmentStart = getSegmentStartOffsets(segments)[slashTrigger.segmentIndex] ?? 0;
    const nextSegments = segments.map((segment, index) =>
      index === slashTrigger.segmentIndex && segment.type === "text"
        ? { type: "text" as const, text: nextText }
        : segment,
    );
    const nextValue = serializeNoteSegments(nextSegments);
    const parsedNextSegments = parseNoteSegments(nextValue);
    const nextSelection =
      command.id === "checklist"
        ? findChecklistSelectionForCaret(parsedNextSegments, activeSegmentStart + markerStart)
        : command.id === "bulletList" || command.id === "dashList"
          ? findListSelectionForCaret(parsedNextSegments, activeSegmentStart + markerStart)
        : findTextSelectionForCaret(parsedNextSegments, activeSegmentStart + caretPosition);

    onValueChange(nextValue);
    if (createdDatabaseDefinition) {
      onDatabaseDefinitionsChange?.({
        ...normalizedDatabaseDefinitions,
        [createdDatabaseDefinition.id]: createdDatabaseDefinition,
      });
    }
    setPendingSelection(
      nextSelection ?? {
        type: "text",
        segmentIndex: slashTrigger.segmentIndex,
        caretPosition,
      },
    );
    closeMenu();

    if (createdSubpage) {
      await onSubpageCreated?.(createdSubpage, nextValue);
    }
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isMenuOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedCommandIndex((current) => (current + 1) % SLASH_COMMANDS.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedCommandIndex(
        (current) => (current - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void applyCommand(SLASH_COMMANDS[selectedCommandIndex]);
    }
  }

  function handleBlockKeyDown(event: KeyboardEvent<HTMLButtonElement>, segmentIndex: number) {
    if (event.key !== "Backspace" && event.key !== "Delete") return;
    event.preventDefault();
    removeSegment(segmentIndex);
  }

  function handleInlineRowKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    segmentIndex: number,
  ) {
    if (event.key === "Backspace" || event.key === "Delete") {
      const selectionStart = event.currentTarget.selectionStart ?? 0;
      const selectionEnd = event.currentTarget.selectionEnd ?? 0;
      const isEmptyRow = event.currentTarget.value.length === 0;
      const isCollapsedAtStart = selectionStart === 0 && selectionEnd === 0;

      if (isEmptyRow && isCollapsedAtStart) {
        event.preventDefault();
        exitInlineRow(segmentIndex);
      }

      return;
    }

    if (event.key !== "Enter") return;

    event.preventDefault();
    splitInlineRow(
      segmentIndex,
      event.currentTarget.selectionStart ?? event.currentTarget.value.length,
      event.currentTarget.selectionEnd ?? event.currentTarget.value.length,
    );
  }

  return (
    <div
      className={`${className ?? ""} relative flex flex-col gap-1 overflow-visible`}
      aria-label={ariaLabel}
    >
      {segments.map((segment, index) => {
        if (segment.type === "divider") {
          return (
            <div key={`${index}-divider`} className="flex min-h-7 items-center py-1">
              <button
                type="button"
                aria-label="Divider block. Press Backspace or Delete to remove."
                onKeyDown={(event) => handleBlockKeyDown(event, index)}
                className="group flex h-5 w-full items-center rounded-md outline-none focus-visible:bg-white/[0.035]"
              >
                <span className={NOTE_DIVIDER_LINE_CLASS} />
              </button>
            </div>
          );
        }

        if (segment.type === "checklist") {
          return (
            <div key={`${index}-checklist`} className="group flex min-h-7 items-center gap-2 py-0">
              <button
                type="button"
                role="checkbox"
                aria-checked={segment.checked}
                onClick={() => updateChecklistSegment(index, { checked: !segment.checked })}
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border outline-none transition ${
                  segment.checked
                    ? "border-white/18 bg-white/38 text-black/80 hover:bg-white/45 focus-visible:ring-1 focus-visible:ring-white/28"
                    : "border-white/18 bg-black text-transparent hover:border-white/26 focus-visible:ring-1 focus-visible:ring-white/26"
                }`}
                aria-label={
                  segment.checked
                    ? "Mark checklist item incomplete"
                    : "Mark checklist item complete"
                }
              >
                <X className="h-3 w-3 stroke-[2.4]" />
              </button>
              <input
                ref={(node) => {
                  if (node) {
                    lineInputRefs.current.set(index, node);
                  } else {
                    lineInputRefs.current.delete(index);
                  }
                }}
                value={segment.text}
                onChange={(event) => updateChecklistSegment(index, { text: event.target.value })}
                onKeyDown={(event) => handleInlineRowKeyDown(event, index)}
                placeholder="Item text"
                className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-base leading-7 outline-none placeholder:text-white/24 selection:bg-emerald-300/25 selection:text-white ${
                  segment.checked ? "text-white/58" : "text-white"
                }`}
                aria-label="Checklist item text"
              />
            </div>
          );
        }

        if (segment.type === "list") {
          return (
            <div key={`${index}-list`} className="group flex min-h-7 items-center gap-2 py-0">
              <span
                className="flex h-7 w-[18px] shrink-0 items-center justify-center text-base font-semibold leading-7 text-white/72"
                aria-hidden="true"
              >
                {segment.kind === "bullet" ? "•" : "-"}
              </span>
              <input
                ref={(node) => {
                  if (node) {
                    lineInputRefs.current.set(index, node);
                  } else {
                    lineInputRefs.current.delete(index);
                  }
                }}
                value={segment.text}
                onChange={(event) => updateListSegment(index, { text: event.target.value })}
                onKeyDown={(event) => handleInlineRowKeyDown(event, index)}
                placeholder="List item"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-base leading-7 text-white outline-none placeholder:text-white/24 selection:bg-emerald-300/25 selection:text-white"
                aria-label={segment.kind === "bullet" ? "Bullet list item text" : "Dash list item text"}
              />
            </div>
          );
        }

        if (segment.type === "subpage") {
          const canOpenSubpage = Boolean(segment.subpageId && onOpenSubpage);

          return (
            <div key={`${index}-subpage`} className="flex min-h-9 items-center py-1">
              <div className="group flex w-full max-w-[28rem] items-center gap-1">
                <button
                  type="button"
                  disabled={!canOpenSubpage}
                  aria-label={
                    canOpenSubpage ? `Open subpage ${segment.title}` : `Subpage ${segment.title}`
                  }
                  onClick={() => openSubpage(segment.subpageId)}
                  onKeyDown={(event) => handleBlockKeyDown(event, index)}
                  className={`flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.045] px-2 text-left text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus-visible:border-emerald-300/35 focus-visible:bg-white/[0.075] ${
                    canOpenSubpage
                      ? "cursor-pointer hover:border-emerald-300/20 hover:bg-white/[0.075] active:scale-[0.995]"
                      : "cursor-default"
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-black/25 text-white/55">
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium leading-4">
                      {segment.title}
                    </span>
                    <span className="block truncate text-[10px] font-medium leading-3 text-white/32">
                      Subpage
                    </span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/35" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove subpage block ${segment.title}`}
                  onClick={() => removeSegment(index)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/35 opacity-100 outline-none transition hover:bg-white/[0.07] hover:text-white/70 focus-visible:bg-white/[0.07] focus-visible:text-white/75 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        }

        if (segment.type === "database") {
          const definition =
            normalizedDatabaseDefinitions[segment.databaseId] ??
            createDefaultDatabaseDefinition(segment);
          const displayTitle = getDatabaseDisplayTitle(definition?.title ?? segment.title);
          const entries = databaseEntries?.[segment.databaseId] ?? [];
          const activeView = getActiveDatabaseView(definition);
          const visibleFields = getVisibleDatabaseFields(definition);
          const titleField = getDatabaseTitleField(definition);

          return (
            <div key={`${index}-database`} className="flex min-h-[4.25rem] items-center py-1.5">
              <div className="group flex w-full max-w-[42rem] items-center gap-1">
                <div className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.035))] px-3 py-2.5 text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_12px_34px_-28px_rgba(0,0,0,0.95)]">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/[0.1] bg-black/35 text-emerald-100/70">
                      <Table2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="truncate text-sm font-semibold leading-4">{displayTitle}</p>
                      <div className="flex justify-end">
                        <div className="flex h-8 w-fit rounded-md border border-white/[0.08] bg-black/20 p-0.5">
                          {NOTE_DATABASE_VIEW_TYPES.map((viewType) => (
                            <button
                              key={viewType}
                              type="button"
                              onClick={() => updateDatabaseActiveView(segment.databaseId, viewType)}
                              className={`rounded px-2 text-[11px] font-semibold outline-none transition focus-visible:ring-1 focus-visible:ring-emerald-200/35 ${
                                activeView.type === viewType
                                  ? "bg-white/[0.1] text-white/88"
                                  : "text-white/42 hover:bg-white/[0.055] hover:text-white/68"
                              }`}
                            >
                              {NOTE_DATABASE_VIEW_LABELS[viewType]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5">
                    {entries.length > 0 && activeView.type === "table" ? (
                      <div className="overflow-x-auto rounded-md border border-white/[0.07] bg-black/14">
                        <div className="min-w-[30rem] divide-y divide-white/[0.06]">
                          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/32">
                            {visibleFields.map((field) => (
                              <span
                                key={field.id}
                                className={`shrink-0 truncate ${
                                  field.id === titleField?.id ? "w-36" : "w-28"
                                }`}
                              >
                                {getDatabaseFieldName(field)}
                              </span>
                            ))}
                          </div>
                          {entries.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex items-center gap-2 px-2.5 py-1.5 text-xs"
                            >
                              {visibleFields.map((field) => {
                                const isTitleField = field.id === titleField?.id;
                                const value = formatDatabaseEntryValue(
                                  entry.values[field.id],
                                  field.type,
                                );

                                return (
                                  <span
                                    key={field.id}
                                    className={`shrink-0 truncate ${
                                      isTitleField ? "w-36 font-semibold" : "w-28 font-medium"
                                    } ${
                                      isTitleField
                                        ? "text-white/82"
                                        : value
                                          ? "text-white/58"
                                          : "text-white/24"
                                    }`}
                                  >
                                    {isTitleField
                                      ? getDatabaseEntryTitle(entry, definition)
                                      : value || "Empty"}
                                  </span>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : entries.length > 0 && activeView.type === "list" ? (
                      <div className="space-y-1.5">
                        {entries.map((entry) => {
                          const properties = getDatabaseEntryProperties(entry, definition);

                          return (
                            <div
                              key={entry.id}
                              className="rounded-md border border-white/[0.07] bg-black/16 px-2.5 py-1.5"
                            >
                              <p className="truncate text-xs font-semibold leading-4 text-white/82">
                                {getDatabaseEntryTitle(entry, definition)}
                              </p>
                              {properties.length > 0 ? (
                                <p className="mt-0.5 truncate text-[11px] font-medium leading-4 text-white/38">
                                  {properties
                                    .map(({ field, value }) => {
                                      return `${getDatabaseFieldName(field)}: ${value || "Empty"}`;
                                    })
                                    .join(" · ")}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : entries.length > 0 && activeView.type === "card" ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {entries.map((entry) => {
                          const properties = getDatabaseEntryProperties(entry, definition);

                          return (
                            <div
                              key={entry.id}
                              className="rounded-md border border-white/[0.08] bg-[#080808] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                            >
                              <p className="truncate text-sm font-semibold leading-5 text-white/88">
                                {getDatabaseEntryTitle(entry, definition)}
                              </p>
                              <div className="mt-1.5 space-y-1">
                                {properties.map(({ field, value }) => (
                                  <div
                                    key={field.id}
                                    className="flex items-center justify-between gap-2 rounded border border-white/[0.055] bg-white/[0.035] px-2 py-1 text-[11px] font-medium"
                                  >
                                    <span className="truncate text-white/34">
                                      {getDatabaseFieldName(field)}
                                    </span>
                                    <span
                                      className={`max-w-[55%] truncate ${
                                        value ? "text-white/70" : "text-white/26"
                                      }`}
                                    >
                                      {value || "Empty"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-md border border-dashed border-white/[0.08] bg-black/12 px-2.5 py-2 text-xs font-medium text-white/34">
                        No entries yet
                      </p>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openDatabaseEntrySheet(segment)}
                      className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.11] bg-[#2a2a2a] px-2.5 text-xs font-semibold text-white/88 outline-none transition hover:border-white/[0.16] hover:bg-[#333] focus-visible:ring-1 focus-visible:ring-white/24"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                    <button
                      type="button"
                      aria-label={`Open database builder for ${displayTitle}. Press Backspace or Delete to remove.`}
                      onClick={() => openDatabaseBuilder(segment)}
                      onKeyDown={(event) => handleBlockKeyDown(event, index)}
                      className="flex h-8 items-center justify-center rounded-md border border-white/[0.08] bg-black/20 px-2.5 text-xs font-semibold text-white/60 outline-none transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/78 focus-visible:border-emerald-300/35 focus-visible:bg-white/[0.075]"
                    >
                      Open builder
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove database block ${displayTitle}`}
                  onClick={() => removeSegment(index)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/35 opacity-100 outline-none transition hover:bg-white/[0.07] hover:text-white/70 focus-visible:bg-white/[0.07] focus-visible:text-white/75 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        }

        return (
          <textarea
            key={`${index}-text`}
            ref={(node) => {
              if (node) {
                textareaRefs.current.set(index, node);
                resizeTextarea(node);
              } else {
                textareaRefs.current.delete(index);
              }
            }}
            value={segment.text}
            rows={Math.max(1, segment.text.split("\n").length)}
            onChange={(event) => {
              const nextText = event.target.value;
              updateTextSegment(index, nextText);
              resizeTextarea(event.currentTarget);
              syncSlashTrigger(index, nextText, event.target.selectionStart ?? nextText.length);
            }}
            onKeyDown={handleTextKeyDown}
            onSelect={(event) => {
              syncSlashTrigger(
                index,
                segment.text,
                event.currentTarget.selectionStart ?? segment.text.length,
              );
            }}
            onBlur={closeMenu}
            placeholder={segments.length === 1 ? placeholder : undefined}
            className="w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-base leading-7 text-white outline-none placeholder:text-white/28 caret-white selection:bg-emerald-300/25 selection:text-white"
            aria-label={ariaLabel}
            aria-controls={isMenuOpen ? "note-slash-command-menu" : undefined}
          />
        );
      })}

      {isMenuOpen ? (
        <div
          id="note-slash-command-menu"
          role="listbox"
          aria-label="Slash commands"
          className="note-slash-command-menu fixed inset-x-4 z-[60] overflow-y-auto overscroll-contain rounded-[22px] border border-white/10 bg-[#090909]/95 p-1.5 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl md:absolute md:left-0 md:right-auto md:w-80 md:overflow-hidden"
        >
          {SLASH_COMMANDS.map((command, index) => {
            const Icon = command.icon;
            const isSelected = index === selectedCommandIndex;

            return (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onPointerDown={(event) => {
                  event.preventDefault();
                  void applyCommand(command);
                }}
                onMouseEnter={() => setSelectedCommandIndex(index)}
                className={`flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition ${
                  isSelected
                    ? "bg-emerald-400/15 text-emerald-100"
                    : "text-white/82 hover:bg-white/8"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border ${
                    isSelected
                      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                      : "border-white/10 bg-white/[0.04] text-white/45"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5">{command.label}</span>
                  <span className="block truncate text-xs leading-4 text-white/42">
                    {command.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {activeEntryDatabaseDefinition ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/62 px-3 pb-3 pt-10 backdrop-blur-sm sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Add entry to ${getDatabaseDisplayTitle(activeEntryDatabaseDefinition.title)}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDatabaseEntrySheet();
            }
          }}
        >
          <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#080808] shadow-[0_28px_90px_-34px_rgba(0,0,0,1)]">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/34">
                  Add entry
                </p>
                <h2 className="mt-1 truncate text-xl font-semibold leading-7 text-white">
                  {getDatabaseDisplayTitle(activeEntryDatabaseDefinition.title)}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close entry form"
                onClick={closeDatabaseEntrySheet}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/45 outline-none transition hover:bg-white/[0.07] hover:text-white/80 focus-visible:bg-white/[0.07] focus-visible:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {activeEntryDatabaseFields.length > 0 ? (
                <div className="space-y-3">
                  {activeEntryDatabaseFields.map((field) => {
                    const fieldName = getDatabaseFieldName(field);
                    const fieldValue = entryFormValues[field.id] ?? "";
                    const inputClassName =
                      "mt-1.5 w-full rounded-xl border border-white/[0.09] bg-white/[0.045] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 selection:bg-emerald-300/25 hover:border-white/[0.14] focus-visible:border-emerald-300/35";

                    return (
                      <label key={field.id} className="block">
                        <span className="flex items-center justify-between gap-2 text-xs font-semibold text-white/64">
                          <span className="min-w-0 truncate">
                            {field.isTitle ? "Title" : fieldName}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {field.isTitle ? (
                              <span className="rounded border border-emerald-300/16 bg-emerald-300/8 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-100/58">
                                {fieldName}
                              </span>
                            ) : null}
                            <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">
                              {NOTE_DATABASE_FIELD_TYPE_LABELS[field.type]}
                            </span>
                          </span>
                        </span>
                        {field.type === "longText" ? (
                          <textarea
                            value={fieldValue}
                            onChange={(event) =>
                              updateEntryFormValue(field.id, event.target.value)
                            }
                            rows={4}
                            className={`${inputClassName} resize-none`}
                            placeholder={fieldName}
                          />
                        ) : field.type === "number" ? (
                          <input
                            type="number"
                            value={fieldValue}
                            onChange={(event) =>
                              updateEntryFormValue(field.id, event.target.value)
                            }
                            className={inputClassName}
                            placeholder={fieldName}
                          />
                        ) : field.type === "rating" ? (
                          <input
                            type="number"
                            min={1}
                            max={5}
                            step={1}
                            value={fieldValue}
                            onChange={(event) =>
                              updateEntryFormValue(field.id, event.target.value)
                            }
                            className={inputClassName}
                            placeholder="1-5"
                          />
                        ) : field.type === "date" ? (
                          <input
                            type="date"
                            value={fieldValue}
                            onChange={(event) =>
                              updateEntryFormValue(field.id, event.target.value)
                            }
                            className={inputClassName}
                          />
                        ) : field.type === "photo" ? (
                          <input
                            disabled
                            readOnly
                            value=""
                            className={`${inputClassName} cursor-not-allowed text-white/28`}
                            placeholder="Photo field coming later"
                          />
                        ) : (
                          <input
                            type="text"
                            value={fieldValue}
                            onChange={(event) =>
                              updateEntryFormValue(field.id, event.target.value)
                            }
                            className={inputClassName}
                            placeholder={field.type === "select" ? "Select value" : fieldName}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.025] px-3 py-6 text-center text-sm text-white/42">
                  Add fields in the builder before creating entries.
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-white/[0.07] p-3">
              <button
                type="button"
                onClick={closeDatabaseEntrySheet}
                className="flex h-10 flex-1 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-sm font-semibold text-white/64 outline-none transition hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-white/82 focus-visible:ring-1 focus-visible:ring-white/22"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={activeEntryDatabaseFields.length === 0}
                onClick={saveDatabaseEntry}
                className="flex h-10 flex-1 items-center justify-center rounded-xl border border-emerald-300/18 bg-emerald-300/10 text-sm font-semibold text-emerald-50 outline-none transition hover:border-emerald-300/28 hover:bg-emerald-300/15 focus-visible:ring-1 focus-visible:ring-emerald-200/35 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.03] disabled:text-white/28"
              >
                Save entry
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeDatabaseDefinition ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/62 px-3 pb-3 pt-10 backdrop-blur-sm sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Database builder for ${getDatabaseDisplayTitle(activeDatabaseDefinition.title)}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveDatabaseId(null);
            }
          }}
        >
          <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#080808] shadow-[0_28px_90px_-34px_rgba(0,0,0,1)]">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/34">
                  Database builder
                </p>
                <input
                  value={activeDatabaseDefinition.title}
                  onChange={(event) =>
                    updateDatabaseTitle(activeDatabaseDefinition.id, event.target.value)
                  }
                  placeholder={NOTE_DATABASE_DISPLAY_TITLE_FALLBACK}
                  className="mt-1 w-full border-0 bg-transparent p-0 text-xl font-semibold leading-7 text-white outline-none placeholder:text-white/24 selection:bg-emerald-300/25"
                  aria-label="Database title"
                />
              </div>
              <button
                type="button"
                aria-label="Close database builder"
                onClick={() => setActiveDatabaseId(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/45 outline-none transition hover:bg-white/[0.07] hover:text-white/80 focus-visible:bg-white/[0.07] focus-visible:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="space-y-2">
                {activeDatabaseFields.length > 0 ? (
                  activeDatabaseFields.map((field) => {
                    const isTitleField = field.id === activeDatabaseDefinition.titleFieldId;
                    const isFieldVisible =
                      isTitleField || Boolean(activeDatabaseView?.visibleFieldIds.includes(field.id));
                    const activeViewLabel = activeDatabaseView
                      ? NOTE_DATABASE_VIEW_LABELS[activeDatabaseView.type]
                      : "active view";

                    return (
                      <div
                        key={field.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.045] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                      >
                        <span
                          className="flex h-8 w-5 items-center justify-center text-white/25"
                          aria-hidden="true"
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <input
                          value={field.name}
                          onChange={(event) =>
                            updateDatabaseField(activeDatabaseDefinition.id, field.id, {
                              name: event.target.value,
                            })
                          }
                          placeholder="Field name"
                          className="min-w-0 border-0 bg-transparent p-0 text-sm font-medium leading-6 text-white outline-none placeholder:text-white/24 selection:bg-emerald-300/25"
                          aria-label="Field name"
                        />
                        {isTitleField ? (
                          <span className="flex h-8 items-center gap-1.5 rounded-full border border-emerald-300/16 bg-emerald-300/8 px-2 text-xs font-semibold text-emerald-100/70">
                            Title
                            <span className="text-white/30">Text</span>
                          </span>
                        ) : (
                          <select
                            value={field.type}
                            onChange={(event) =>
                              updateDatabaseField(activeDatabaseDefinition.id, field.id, {
                                type: event.target.value as NoteDatabaseFieldType,
                              })
                            }
                            className="h-8 max-w-[8rem] rounded-full border border-white/[0.09] bg-[#111] px-2 text-xs font-semibold text-white/70 outline-none transition hover:border-white/[0.16] focus-visible:border-emerald-300/35"
                            aria-label="Field type"
                          >
                            {NOTE_DATABASE_FIELD_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {NOTE_DATABASE_FIELD_TYPE_LABELS[type]}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          aria-label={
                            isTitleField
                              ? `Title field stays visible in ${activeViewLabel}`
                              : `${isFieldVisible ? "Hide" : "Show"} field ${
                                  field.name || "Untitled field"
                                } in ${activeViewLabel}`
                          }
                          onClick={() => {
                            if (!activeDatabaseView) return;

                            updateDatabaseViewFieldVisibility(
                              activeDatabaseDefinition.id,
                              activeDatabaseView.id,
                              field.id,
                              !isFieldVisible,
                            );
                          }}
                          disabled={isTitleField || !activeDatabaseView}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg outline-none transition focus-visible:bg-white/[0.07] focus-visible:text-white ${
                            isFieldVisible
                              ? "text-emerald-100/70 hover:bg-emerald-300/10 hover:text-emerald-50"
                              : "text-white/24 hover:bg-white/[0.07] hover:text-white/58"
                          } disabled:cursor-not-allowed disabled:hover:bg-transparent ${
                            isTitleField ? "disabled:text-emerald-100/38" : "disabled:text-white/14"
                          }`}
                        >
                          {isFieldVisible ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove field ${field.name || "Untitled field"}`}
                          onClick={() => removeDatabaseField(activeDatabaseDefinition.id, field.id)}
                          disabled={isTitleField}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/34 outline-none transition hover:bg-white/[0.07] hover:text-white/72 focus-visible:bg-white/[0.07] focus-visible:text-white disabled:cursor-not-allowed disabled:text-white/14 disabled:hover:bg-transparent"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.025] px-3 py-6 text-center text-sm text-white/42">
                    Add fields to shape this database block.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/[0.07] p-3">
              <button
                type="button"
                onClick={() => addDatabaseField(activeDatabaseDefinition.id)}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/18 bg-emerald-300/10 text-sm font-semibold text-emerald-50 outline-none transition hover:border-emerald-300/28 hover:bg-emerald-300/15 focus-visible:ring-1 focus-visible:ring-emerald-200/35"
              >
                <Plus className="h-4 w-4" />
                Add Field
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
