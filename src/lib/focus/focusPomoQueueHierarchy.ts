import type { FocusPomoQueueItem } from "@/lib/focus/focusPomoQueue";

export type FocusPomoQueueProjectGroup = {
  type: "project";
  projectId: string;
  title: string;
  item: FocusPomoQueueItem | null;
  items: FocusPomoQueueItem[];
};

export type FocusPomoQueueGoalChild =
  | { type: "item"; item: FocusPomoQueueItem }
  | FocusPomoQueueProjectGroup;

export type FocusPomoGoalQueueGroup = {
  type: "goal";
  goalId: string;
  title: string;
  icon: string | null;
  items: FocusPomoQueueItem[];
  nextItem: FocusPomoQueueItem | null;
  children: FocusPomoQueueGoalChild[];
};

export type FocusPomoQueueHierarchyEntry =
  | { type: "item"; item: FocusPomoQueueItem }
  | FocusPomoGoalQueueGroup;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function goalIdForItem(item: FocusPomoQueueItem): string | null {
  return readString(item.goalId) ?? readString(item.goal_id);
}

function goalTitleForItem(item: FocusPomoQueueItem): string {
  return (
    readString(item.goalTitle) ??
    readString(item.goal_name) ??
    readString(item.goal?.name) ??
    "Goal"
  );
}

function goalIconForItem(item: FocusPomoQueueItem): string | null {
  return (
    readString(item.goalIcon) ??
    readString(item.goal_emoji) ??
    readString(item.goal?.icon) ??
    null
  );
}

export function focusPomoProjectIdForItem(
  item: FocusPomoQueueItem
): string | null {
  return readString(item.projectId) ?? readString(item.project_id);
}

function projectTitleForItem(item: FocusPomoQueueItem): string {
  return (
    readString(item.projectName) ??
    readString(item.project_name) ??
    (item.kind === "project" ? item.title : null) ??
    "Project"
  );
}

export function isFocusPomoProjectQueueItem(
  item: FocusPomoQueueItem
): boolean {
  return item.kind === "project" || item.sourceType === "PROJECT";
}

function isProjectChildItem(item: FocusPomoQueueItem): boolean {
  return (
    !isFocusPomoProjectQueueItem(item) &&
    focusPomoProjectIdForItem(item) !== null
  );
}

function representedProjectIdForItem(item: FocusPomoQueueItem): string | null {
  if (!isFocusPomoProjectQueueItem(item)) return null;
  return focusPomoProjectIdForItem(item) ?? readString(item.id);
}

export function buildFocusPomoExecutionQueue(
  items: FocusPomoQueueItem[]
): FocusPomoQueueItem[] {
  const representedProjectIds = new Set(
    items
      .map(representedProjectIdForItem)
      .filter((id): id is string => id !== null)
  );

  return items.filter((item) => {
    if (isFocusPomoProjectQueueItem(item)) return true;

    const projectId = focusPomoProjectIdForItem(item);
    return !projectId || !representedProjectIds.has(projectId);
  });
}

export function getFocusPomoProjectChecklistItems(
  items: FocusPomoQueueItem[],
  projectItem: FocusPomoQueueItem
): FocusPomoQueueItem[] {
  const projectId = representedProjectIdForItem(projectItem);
  if (!projectId) return [];

  return items.filter(
    (item) =>
      !isFocusPomoProjectQueueItem(item) &&
      focusPomoProjectIdForItem(item) === projectId
  );
}

function buildGoalChildren(items: FocusPomoQueueItem[]): FocusPomoQueueGoalChild[] {
  const projectGroups = new Map<string, FocusPomoQueueProjectGroup>();
  const projectIdsWithChildren = new Set(
    items
      .filter(isProjectChildItem)
      .map(focusPomoProjectIdForItem)
      .filter((id): id is string => id !== null)
  );
  const children: FocusPomoQueueGoalChild[] = [];

  for (const item of items) {
    const projectId = focusPomoProjectIdForItem(item);

    if (
      projectId &&
      (isProjectChildItem(item) || isFocusPomoProjectQueueItem(item))
    ) {
      const shouldGroupProject =
        isProjectChildItem(item) ||
        (isFocusPomoProjectQueueItem(item) &&
          projectIdsWithChildren.has(projectId));

      if (shouldGroupProject) {
        let group = projectGroups.get(projectId);
        if (!group) {
          group = {
            type: "project",
            projectId,
            title: projectTitleForItem(item),
            item: null,
            items: [],
          };
          projectGroups.set(projectId, group);
          children.push(group);
        }

        if (isFocusPomoProjectQueueItem(item)) {
          group.item = item;
          group.title = projectTitleForItem(item);
        } else {
          group.items.push(item);
          if (group.title === "Project") group.title = projectTitleForItem(item);
        }
        continue;
      }
    }

    children.push({ type: "item", item });
  }

  return children;
}

export function buildFocusPomoQueueHierarchy(
  items: FocusPomoQueueItem[]
): FocusPomoQueueHierarchyEntry[] {
  const entries: FocusPomoQueueHierarchyEntry[] = [];
  const groupsByGoalId = new Map<string, FocusPomoGoalQueueGroup>();

  for (const item of items) {
    const goalId = goalIdForItem(item);
    if (!goalId) {
      entries.push({ type: "item", item });
      continue;
    }

    let group = groupsByGoalId.get(goalId);
    if (!group) {
      group = {
        type: "goal",
        goalId,
        title: goalTitleForItem(item),
        icon: goalIconForItem(item),
        items: [],
        nextItem: null,
        children: [],
      };
      groupsByGoalId.set(goalId, group);
      entries.push(group);
    }

    group.items.push(item);
    group.nextItem ??= item;
    if (group.title === "Goal") group.title = goalTitleForItem(item);
    group.icon ??= goalIconForItem(item);
  }

  for (const group of groupsByGoalId.values()) {
    group.children = buildGoalChildren(group.items);
    group.nextItem = buildFocusPomoExecutionQueue(group.items)[0] ?? null;
  }

  return entries;
}

export function getVisibleFocusPomoHierarchyItemKeys(
  entry: FocusPomoQueueHierarchyEntry,
  collapsedGoalIds: ReadonlySet<string>,
  getItemKey: (item: FocusPomoQueueItem) => string
): string[] {
  if (entry.type === "item") return [getItemKey(entry.item)];
  if (collapsedGoalIds.has(entry.goalId)) return [];

  return entry.children.flatMap((child) => {
    if (child.type === "item") return [getItemKey(child.item)];
    if (child.item) return [getItemKey(child.item)];
    return child.items.map(getItemKey);
  });
}

export function flattenFocusPomoQueueHierarchy(
  entries: FocusPomoQueueHierarchyEntry[]
): FocusPomoQueueItem[] {
  return entries.flatMap((entry) =>
    entry.type === "goal" ? entry.items : [entry.item]
  );
}
