export type AreaId =
  | "body"
  | "mind"
  | "work"
  | "money"
  | "people"
  | "life"
  | "creation"
  | "experience";

export type AreaConfig = {
  id: AreaId;
  label: string;
  emoji: string;
  sortOrder: number;
};

export const AREAS: readonly AreaConfig[] = [
  { id: "body", label: "Body", emoji: "🦾", sortOrder: 1 },
  { id: "mind", label: "Mind", emoji: "🧠", sortOrder: 2 },
  { id: "work", label: "Work", emoji: "🧱", sortOrder: 3 },
  { id: "money", label: "Money", emoji: "💵", sortOrder: 4 },
  { id: "people", label: "People", emoji: "👥", sortOrder: 5 },
  { id: "life", label: "Life", emoji: "🏠", sortOrder: 6 },
  { id: "creation", label: "Creation", emoji: "🎨", sortOrder: 7 },
  { id: "experience", label: "Experience", emoji: "🌎", sortOrder: 8 },
];

export const AREA_IDS = AREAS.map((area) => area.id);

export function isAreaId(value: string | null | undefined): value is AreaId {
  return Boolean(value && (AREA_IDS as readonly string[]).includes(value));
}

export function getAreaById(areaId: string | null | undefined) {
  return AREAS.find((area) => area.id === areaId) ?? null;
}
