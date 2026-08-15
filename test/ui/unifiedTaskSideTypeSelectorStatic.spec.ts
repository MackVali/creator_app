import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const fabPath = path.resolve(process.cwd(), "components/ui/Fab.tsx");
const fabSource = fs.readFileSync(fabPath, "utf8");

function getSnippet(start: string, end: string) {
  const startIndex = fabSource.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = fabSource.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return fabSource.slice(startIndex, endIndex);
}

describe("Unified Event Sheet Task-side Type selector", () => {
  it("defines exactly the six all-caps Type options in order", () => {
    const optionsMatch = fabSource.match(
      /UNIFIED_TASK_SIDE_TYPE_OPTIONS = \[([\s\S]*?)\] as const/,
    );

    expect(optionsMatch?.[1]).toBeDefined();
    const options = Array.from(
      optionsMatch![1].matchAll(
        /\{ value: "([^"]+)", label: "([^"]+)" \}/g,
      ),
    ).map((match) => ({ value: match[1], label: match[2] }));

    expect(options).toEqual([
      { value: "AUTO", label: "AUTO" },
      { value: "TO_DO", label: "TO DO" },
      { value: "TASK", label: "TASK" },
      { value: "HABIT", label: "HABIT" },
      { value: "PROJECT", label: "PROJECT" },
      { value: "GOAL", label: "GOAL" },
    ]);
    expect(options.every((option) => option.label === option.label.toUpperCase()))
      .toBe(true);
  });

  it("defaults fresh Task-side creation state to AUTO and resets back to AUTO", () => {
    expect(fabSource).toContain(
      'useState<UnifiedTaskSideSelectedType>("AUTO")',
    );
    expect(fabSource).not.toContain('setSelectedType("TASK")');
    expect(
      fabSource.match(/setSelectedType\("AUTO"\)/g)?.length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("appends the Type row after the existing Skill row", () => {
    const detailsSnippet = getSnippet(
      '<Brain className={detailIconClass} aria-hidden="true" />\n                          Skill',
      "</section>\n                  )}",
    );

    expect(detailsSnippet).toContain("data-unified-task-side-type-row");
    expect(
      detailsSnippet.indexOf("data-unified-task-side-type-row"),
    ).toBeGreaterThan(detailsSnippet.indexOf("Skill"));
  });

  it("hides the selector for saved edit flows", () => {
    const rowIndex = fabSource.indexOf("data-unified-task-side-type-row");
    expect(rowIndex).toBeGreaterThanOrEqual(0);
    const typeRowSnippet = fabSource.slice(Math.max(0, rowIndex - 160), rowIndex);

    expect(typeRowSnippet).toContain("{!editTarget ? (");
  });

  it("does not reset draft fields or drive existing row visibility when Type changes", () => {
    const typeChangeSnippet = getSnippet(
      "onValueChange={(value) => {\n                                void hapticSoftTick();\n                                setSaveError(null);\n                                setSelectedType",
      "value as UnifiedTaskSideSelectedType",
    );

    expect(typeChangeSnippet).not.toMatch(
      /set(Task|Habit|Project|Goal|UnifiedEventType|UnifiedCreationMode)/,
    );

    const nonTypeRowSource = fabSource.replace(
      /{!editTarget \? \([\s\S]*?data-unified-task-side-type-row[\s\S]*?\) : null}/,
      "",
    );
    expect(nonTypeRowSource).not.toMatch(
      /\{[^{}]*(selectedType)[^{}]*\?\s*\(/,
    );
    expect(nonTypeRowSource).not.toMatch(
      /(isTask|isHabit|isProject|isEventsMode|isTasksMode)\s*=.*selectedType/,
    );
  });

  it("routes explicit submit types directly and AUTO through the automatic resolver", () => {
    const routingSnippet = getSnippet(
      "const resolvedUnifiedAddEventSaveSelected =",
      "const resolvedAddEventTaskGoalId =",
    );

    expect(routingSnippet).toContain('if (selectedType === "AUTO")');
    expect(routingSnippet).toContain(
      "resolveAutomaticUnifiedTaskSideSaveType",
    );
    expect(routingSnippet).toContain("resolveAddEventSourceType");
    expect(routingSnippet).toContain("return selectedType;");
  });

  it("keeps AUTO as selector display while the button uses the resolved save type", () => {
    const labelSnippet = getSnippet(
      "const selectedTypeLabel =",
      "const unifiedAddEventSaveBlockReason =",
    );

    expect(labelSnippet).toContain("option.value === selectedType");
    expect(labelSnippet).toContain(
      "option.value === resolvedUnifiedAddEventSaveSelected",
    );
    expect(labelSnippet).toContain('?.label ?? "TO DO"');
    expect(labelSnippet).toContain("`add ${resolvedTypeLabel}`");
    expect(labelSnippet).not.toContain("`add ${selectedTypeLabel}`");

    const typeRowSnippet = getSnippet(
      "data-unified-task-side-type-row",
      "</SelectContent>\n                            </Select>",
    );
    expect(typeRowSnippet).toContain("{selectedTypeLabel}");
    expect(typeRowSnippet).not.toContain("resolvedTypeLabel");
  });

  it("does not expose AUTO as an addable entity label", () => {
    expect(fabSource).not.toContain("ADD AUTO");
    expect(fabSource).not.toContain("add AUTO");
  });

  it("keeps canonical save branches for all selected types", () => {
    expect(fabSource).toContain('if (saveSelected === "TO_DO")');
    expect(fabSource).toContain("createManualMyListItem");
    expect(fabSource).toContain('if (saveSelected === "GOAL")');
    expect(fabSource).toContain('else if (saveSelected === "PROJECT")');
    expect(fabSource).toContain('else if (saveSelected === "TASK")');
    expect(fabSource).toContain('else if (saveSelected === "HABIT")');
  });

  it("keeps AUTO classification precedence deterministic", () => {
    const resolverSnippet = getSnippet(
      "const resolveAutomaticUnifiedTaskSideSaveType =",
      "const AddEventPriorityDisplay =",
    );

    expect(resolverSnippet.indexOf('return "PROJECT";')).toBeLessThan(
      resolverSnippet.indexOf('return "HABIT";'),
    );
    expect(resolverSnippet.indexOf('return "HABIT";')).toBeLessThan(
      resolverSnippet.indexOf('return "GOAL";'),
    );
    expect(resolverSnippet.indexOf('return "GOAL";')).toBeLessThan(
      resolverSnippet.indexOf('return "TO_DO";'),
    );
    expect(resolverSnippet.indexOf('return "TO_DO";')).toBeLessThan(
      resolverSnippet.indexOf('return "TASK";'),
    );
  });

  it("resolves fresh AUTO and minimal capture to TO DO before normal Task planning", () => {
    const lightweightSnippet = getSnippet(
      "const hasLightweightManualMyListDraft =",
      "const resolveAutomaticUnifiedTaskSideSaveType =",
    );
    const resolverSnippet = getSnippet(
      "const resolveAutomaticUnifiedTaskSideSaveType =",
      "const AddEventPriorityDisplay =",
    );

    expect(lightweightSnippet).not.toContain("taskName.trim().length > 0");
    expect(lightweightSnippet).toContain('taskDuration.trim().length === 0');
    expect(lightweightSnippet).toContain('addEventTimingMode === "manual"');
    expect(resolverSnippet.indexOf('return "TO_DO";')).toBeLessThan(
      resolverSnippet.indexOf('return "TASK";'),
    );
  });

  it("uses established signals for AUTO recurrence, sub-actions, Goal, and manual My List", () => {
    expect(fabSource).toContain("isUnifiedTaskSideRecurrenceActive");
    expect(fabSource).toContain("hasSubActions: addEventSubActions.length > 0");
    expect(fabSource).toContain("hasGoalSpecificUnifiedTaskSideDraft");
    expect(fabSource).toContain("hasLightweightManualMyListDraft");
    expect(fabSource).not.toMatch(/title.*includes|taskName.*includes/i);
  });

  it("covers AUTO recurrence, canonical sub-actions, normal planning, and Goal signals", () => {
    const routingSnippet = getSnippet(
      "const resolvedUnifiedAddEventSaveSelected =",
      "const resolvedAddEventTaskGoalId =",
    );

    expect(routingSnippet).toContain("isUnifiedTaskSideRecurrenceActive");
    expect(routingSnippet).toContain("habitRecurrence");
    expect(routingSnippet).toContain("hasSubActions: addEventSubActions.length > 0");
    expect(routingSnippet).toContain("hasGoalSpecificUnifiedTaskSideDraft");
    expect(routingSnippet).toContain("taskDuration");
    expect(routingSnippet).toContain("taskDue");
    expect(routingSnippet).toContain("taskNotes");
  });

  it("validates missing required data without switching Type", () => {
    const validationSnippet = getSnippet(
      "const getUnifiedAddEventSaveBlockReason = (): string | null => {",
      "const saveUnifiedEvent = useCallback",
    );

    expect(validationSnippet).toContain('if (trimmedName.length === 0) return "Please enter a name.";');
    expect(validationSnippet).toContain('if (saveSelected === "TO_DO")');
    expect(validationSnippet).not.toContain("setSelectedType(");
  });

  it("uses the same resolved entity for button, validation, and persistence", () => {
    const validationSnippet = getSnippet(
      "const getUnifiedAddEventSaveBlockReason = (): string | null => {",
      "const saveUnifiedEvent = useCallback",
    );
    const persistenceSnippet = getSnippet(
      "const handleFabSave = useCallback(async () => {",
      "const isUnifiedAddEventSubmitHardDisabled =",
    );
    const labelSnippet = getSnippet(
      "const resolvedTypeLabel =",
      "const unifiedAddEventSaveBlockReason =",
    );

    expect(validationSnippet).toContain(
      "const saveSelected = resolvedUnifiedAddEventSaveSelected;",
    );
    expect(persistenceSnippet).toContain(
      "? resolvedUnifiedAddEventSaveSelected",
    );
    expect(labelSnippet).toContain(
      "option.value === resolvedUnifiedAddEventSaveSelected",
    );
    expect(fabSource).not.toContain('saveSelected === "AUTO"');
  });
});
