// @vitest-environment jsdom

import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
vi.setConfig({ testTimeout: 30000 });

const roadmapQueryMocks = vi.hoisted(() => ({
  addCampaignToRoadmap: vi.fn(),
  addGoalToCampaign: vi.fn(
    async (
      _userId: string,
      input: { campaignId: string; goalId: string; position: number },
    ) => ({
      campaign_id: input.campaignId,
      goal_id: input.goalId,
      position: input.position,
    }),
  ),
  createCampaign: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));
const myListStorageMocks = vi.hoisted(() => ({
  consumeManualMyListUpgradeSource: vi.fn(async () => undefined),
  createManualMyListItem: vi.fn(async () => ({
    id: "manual-row-created",
    origin: "manual-my-list-upgrade",
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const passthrough = React.forwardRef<
    HTMLElement,
    React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }
  >(({ children, ...props }, ref) =>
    React.createElement("div", { ...props, ref }, children),
  );
  passthrough.displayName = "MockMotionElement";

  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    animate: vi.fn(() => ({ stop: vi.fn() })),
    motion: new Proxy(
      {},
      {
        get: () => passthrough,
      },
    ),
    useDragControls: () => ({ start: vi.fn() }),
    useMotionTemplate: () => "",
    useMotionValue: () => ({ get: () => 0, set: vi.fn() }),
    useReducedMotion: () => false,
    useTransform: () => "",
  };
});

vi.mock("@/components/ui/button", async () => {
  const React = await import("react");
  const Button = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
    ({ children, ...props }, ref) => {
      const buttonProps = { ...props } as React.ComponentProps<"button"> & {
        haptic?: unknown;
      };
      delete buttonProps.haptic;
      return React.createElement("button", { ...buttonProps, ref }, children);
    },
  );
  Button.displayName = "MockButton";
  return {
    Button,
  };
});

vi.mock("@/components/ui/input", async () => {
  const React = await import("react");
  const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
    (props, ref) => React.createElement("input", { ...props, ref }),
  );
  Input.displayName = "MockInput";
  return {
    Input,
  };
});

vi.mock("@/components/ui/textarea", async () => {
  const React = await import("react");
  const Textarea = React.forwardRef<
    HTMLTextAreaElement,
    React.ComponentProps<"textarea">
  >((props, ref) => React.createElement("textarea", { ...props, ref }));
  Textarea.displayName = "MockTextarea";
  return {
    Textarea,
  };
});

vi.mock("@/components/ui/label", async () => {
  const React = await import("react");
  const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<"label">>(
    ({ children, ...props }, ref) =>
      React.createElement("label", { ...props, ref }, children),
  );
  Label.displayName = "MockLabel";
  return {
    Label,
  };
});

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
    selectedValue?: string;
    selectedLabel?: string;
  }>({});

  const getText = (nodes: React.ReactNode): string =>
    React.Children.toArray(nodes)
      .map((child) => {
        if (typeof child === "string" || typeof child === "number") {
          return String(child);
        }
        if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
          return getText(child.props.children);
        }
        return "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  const SelectItem = ({
    children,
    disabled,
    label,
    value,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    label?: string;
    value: string;
  }) => {
    const context = React.useContext(SelectContext);
    return React.createElement(
      "button",
      {
        "data-select-item-value": value,
        disabled,
        onClick: () => {
          if (!disabled) context.onValueChange?.(value);
        },
        type: "button",
      },
      label ?? getText(children),
    );
  };

  const findLabel = (nodes: React.ReactNode, value?: string): string => {
    if (!value) return "";
    let label = "";
    React.Children.forEach(nodes, (child) => {
      if (label || !React.isValidElement(child)) return;
      const props = child.props as {
        children?: React.ReactNode;
        label?: string;
        value?: string;
      };
      if (child.type === SelectItem && props.value === value) {
        label = props.label ?? getText(props.children);
        return;
      }
      label = findLabel(props.children, value);
    });
    return label;
  };

  const Select = ({
    children,
    onValueChange,
    placeholder,
    trigger,
    value,
  }: {
    children?: React.ReactNode;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    trigger?: React.ReactNode;
    value?: string;
  }) => {
    const selectedLabel = findLabel(children, value);
    return React.createElement(
      SelectContext.Provider,
      { value: { onValueChange, selectedValue: value, selectedLabel } },
      React.createElement(
        "div",
        null,
        React.createElement(
          "button",
          { type: "button" },
          trigger ?? selectedLabel ?? placeholder ?? "",
        ),
        React.createElement("div", { hidden: true }, children),
      ),
    );
  };

  const SelectContent = ({ children }: { children?: React.ReactNode }) => (
    React.createElement("div", null, children)
  );
  const SelectTrigger = Select;
  const SelectValue = ({ placeholder }: { placeholder?: string }) => {
    const context = React.useContext(SelectContext);
    return React.createElement(
      "span",
      null,
      context.selectedLabel || placeholder || "",
    );
  };

  return {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    useSelectContext: () => React.useContext(SelectContext),
  };
});

vi.mock("@/components/wheel-picker", () => ({
  WheelPicker: () => null,
  WheelPickerWrapper: ({ children }: { children?: React.ReactNode }) => (
    React.createElement("div", null, children)
  ),
}));

vi.mock("@/components/habits/habit-form-fields", () => ({
  HABIT_RECURRENCE_OPTIONS: [
    { label: "Never", value: "__never__" },
    { label: "Weekly", value: "weekly" },
  ],
  HABIT_TYPE_OPTIONS: [{ label: "Standard", value: "STANDARD" }],
}));

vi.mock("@/components/schedule/DayTimeline", () => ({
  DayTimeline: () => null,
}));

vi.mock("@/components/ai/OperatorAiSheet", () => ({
  default: () => null,
}));
vi.mock("../../components/ui/EventModal", () => ({ EventModal: () => null }));
vi.mock("../../components/ui/NoteModal", () => ({ NoteModal: () => null }));
vi.mock("../../components/ui/ComingSoonModal", () => ({
  ComingSoonModal: () => null,
}));
vi.mock("../../components/ui/PostModal", () => ({ PostModal: () => null }));
vi.mock("@/app/(app)/schedule/priorities/PriorityEditorClient", () => ({
  default: () => null,
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ setStatusIsland: vi.fn() }),
  useToastHelpers: () => toastMocks,
}));

vi.mock("@/components/entitlement/EntitlementProvider", () => ({
  useEntitlement: () => ({
    current_period_end: null,
    isPlus: true,
    isReady: true,
    is_active: true,
    refreshEntitlement: vi.fn(async () => undefined),
    tier: "CREATOR PLUS",
  }),
}));

vi.mock("@/components/ui/FabCreationContext", () => ({
  useFabCreation: () => ({
    openOfferChooser: vi.fn(),
    requestEntityEdit: vi.fn(),
    requestGoalCreation: vi.fn(),
    requestHabitCreation: vi.fn(),
    requestProjectCreation: vi.fn(),
    requestTaskCreation: vi.fn(),
  }),
}));
vi.mock("../../components/ui/toast", () => ({
  useToast: () => ({ setStatusIsland: vi.fn() }),
  useToastHelpers: () => toastMocks,
}));

vi.mock("@/lib/haptics/creatorHaptics", () => ({
  hapticComplete: vi.fn(),
  hapticErrorPattern: vi.fn(),
  hapticLongPress: vi.fn(),
  hapticPress: vi.fn(),
  hapticSelectionChangedOnly: vi.fn(),
  hapticSelectionEnd: vi.fn(),
  hapticSelectionStart: vi.fn(),
  hapticSnap: vi.fn(),
  hapticSoftTick: vi.fn(),
  hapticWarningPattern: vi.fn(),
}));

vi.mock("@/lib/hooks/useLocationContexts", () => ({
  useLocationContexts: () => ({
    error: null,
    loading: false,
    options: [],
    refresh: vi.fn(),
  }),
}));

type SupabaseMockQuery = {
  data: unknown[];
  error: null;
};
type SupabaseMockSingleResult = {
  data: { id: string } | null;
  error: { message?: string } | null;
};

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const ROADMAP_ID = "22222222-2222-4222-8222-222222222222";
const CIRCLE_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_GOAL_ID = "44444444-4444-4444-8444-444444444444";
const DEFAULT_AREA_ID = "body";

const supabaseMutationState: {
  insertCalls: Array<{ tableName: string; payload: unknown }>;
  goalSingleError: { message?: string } | null;
  goalSingleReject: unknown;
  goalSingleResult: Promise<SupabaseMockSingleResult> | null;
} = {
  insertCalls: [],
  goalSingleError: null,
  goalSingleReject: null,
  goalSingleResult: null,
};

const nextTick = () => new Promise((resolve) => window.setTimeout(resolve, 0));
const setNativeInputValue = (input: HTMLInputElement, value: string) => {
  flushSync(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const setNativeDateInputValue = (input: HTMLInputElement, value: string) => {
  flushSync(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const openQuickCreateTaskDetails = (detail: Record<string, unknown> = {}) => {
  window.dispatchEvent(
    new CustomEvent("schedule:open-quick-create-task-details", {
      detail,
    }),
  );
};

const getUnifiedTitleInput = () => {
  const input = document.querySelector<HTMLInputElement>(
    "#unified-event-title",
  );
  expect(input).toBeTruthy();
  return input as HTMLInputElement;
};

const getUnifiedRelationshipStrip = () => {
  const strip = document.querySelector<HTMLElement>(
    "[data-unified-event-goal-link]",
  );
  expect(strip).toBeTruthy();
  return strip as HTMLElement;
};

const getUnifiedEventSheet = () => {
  const sheet = document.querySelector<HTMLElement>("[data-unified-event-sheet]");
  expect(sheet).toBeTruthy();
  return sheet as HTMLElement;
};

const getGoalRoadmapTrigger = () => {
  const trigger = document.querySelector<HTMLElement>(
    "[data-unified-goal-roadmap-trigger]",
  );
  expect(trigger).toBeTruthy();
  return trigger as HTMLElement;
};

const getGoalPrimaryRelationTrigger = () => {
  const trigger = document.querySelector<HTMLElement>(
    "[data-unified-goal-primary-relation-trigger]",
  );
  expect(trigger).toBeTruthy();
  return trigger as HTMLElement;
};

const selectUnifiedTaskSideType = (value: string) => {
  const option = document.querySelector<HTMLButtonElement>(
    `[data-unified-task-side-type-row] [data-select-item-value="${value}"]`,
  );
  expect(option).toBeTruthy();
  flushSync(() => {
    option?.click();
  });
};

const selectGoalTopRelationshipValue = (
  relation: "roadmap" | "circle",
  value: string,
) => {
  const triggerAttribute =
    relation === "roadmap"
      ? "data-unified-goal-roadmap-trigger"
      : "data-unified-goal-primary-relation-trigger";
  const itemValue = relation === "circle" ? `CIRCLE:${value}` : value;
  const trigger = document.querySelector<HTMLElement>(`[${triggerAttribute}]`);
  expect(trigger).toBeTruthy();
  const selectRoot = trigger?.closest("div");
  const option =
    selectRoot?.querySelector<HTMLButtonElement>(
      `[data-select-item-value="${itemValue}"]`,
    ) ??
    document.querySelector<HTMLButtonElement>(
      `[data-select-item-value="${itemValue}"]`,
    );
  expect(option).toBeTruthy();
  flushSync(() => {
    option?.click();
  });
};

const getGoalDueDateInput = () => {
  const input = document.querySelector<HTMLInputElement>(
    "#unified-goal-due-date",
  );
  expect(input).toBeTruthy();
  return input as HTMLInputElement;
};

const submitUnifiedGoal = () => {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "[data-unified-event-sheet] button",
    ),
  );
  const submitButton = buttons.find(
    (button) => button.textContent?.trim() === "add GOAL",
  );
  expect(submitButton).toBeTruthy();
  flushSync(() => {
    submitButton?.click();
  });
};

const getInsertedPayloadForTable = (tableName: string) => {
  const call = supabaseMutationState.insertCalls.find(
    (entry) => entry.tableName === tableName,
  );
  return call?.payload as Record<string, unknown> | undefined;
};

const closeUnifiedEventSheet = () => {
  const backdrop = document.querySelector<HTMLElement>(
    "[data-unified-event-sheet] > div",
  );
  expect(backdrop).toBeTruthy();
  flushSync(() => {
    backdrop?.click();
  });
};

const queryRowsByTable: Record<string, unknown[]> = {
  campaigns: [
    {
      emoji: "R",
      id: CAMPAIGN_ID,
      name: "Roadmap X",
      position: 1,
      primary_area_id: null,
      primary_circle_id: CIRCLE_ID,
      primary_monument_id: null,
      roadmap_id: ROADMAP_ID,
      scheduling_state: "ACTIVE",
    },
  ],
};

const createSupabaseBuilder = (tableName: string) => {
  const builder = {
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => {
      if (tableName === "goals") {
        if (supabaseMutationState.goalSingleReject) {
          throw supabaseMutationState.goalSingleReject;
        }
        if (supabaseMutationState.goalSingleResult) {
          return supabaseMutationState.goalSingleResult;
        }
        return {
          data: supabaseMutationState.goalSingleError
            ? null
            : { id: CREATED_GOAL_ID },
          error: supabaseMutationState.goalSingleError,
        };
      }
      return { data: null, error: null };
    }),
    insert: vi.fn((payload: unknown) => {
      supabaseMutationState.insertCalls.push({ tableName, payload });
      return builder;
    }),
    upsert: vi.fn(() => builder),
    then: (
      resolve: (value: SupabaseMockQuery) => void,
      reject?: (reason: unknown) => void,
    ) =>
      Promise.resolve({
        data: queryRowsByTable[tableName] ?? [],
        error: null,
      }).then(resolve, reject),
  };
  return builder;
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseBrowser: () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
    from: vi.fn((tableName: string) => createSupabaseBuilder(tableName)),
  }),
}));

vi.mock("@/lib/queries/skills", () => ({
  getSkillsForUser: vi.fn(async () => [
    {
      cat_id: null,
      icon: "H",
      id: "skill-health",
      monument_id: null,
      name: "Health",
      sort_order: 1,
    },
  ]),
}));

vi.mock("@/lib/data/cats", () => ({
  getCatsForUser: vi.fn(async () => []),
}));

vi.mock("@/lib/queries/goals", () => ({
  getGoalsForUser: vi.fn(async () => []),
}));

vi.mock("@/lib/queries/roadmaps", () => ({
  addCampaignToRoadmap: roadmapQueryMocks.addCampaignToRoadmap,
  addGoalToCampaign: roadmapQueryMocks.addGoalToCampaign,
  createCampaign: roadmapQueryMocks.createCampaign,
}));

vi.mock("@/lib/queries/monuments", () => ({
  getMonumentsForUser: vi.fn(async () => []),
}));

vi.mock("@/lib/my-list/pinnedSourceItems", () => ({
  isSourceItemPinned: vi.fn(() => false),
  setSourceItemPinned: vi.fn(),
}));

vi.mock("@/lib/my-list/myListItemsStorage", () => ({
  consumeManualMyListUpgradeSource:
    myListStorageMocks.consumeManualMyListUpgradeSource,
  createManualMyListItem: myListStorageMocks.createManualMyListItem,
}));

describe("Fab quick-create task details hydration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    supabaseMutationState.insertCalls = [];
    supabaseMutationState.goalSingleError = null;
    supabaseMutationState.goalSingleReject = null;
    supabaseMutationState.goalSingleResult = null;
    roadmapQueryMocks.addCampaignToRoadmap.mockReset();
    roadmapQueryMocks.addGoalToCampaign.mockClear();
    roadmapQueryMocks.createCampaign.mockReset();
    myListStorageMocks.consumeManualMyListUpgradeSource.mockReset();
    myListStorageMocks.consumeManualMyListUpgradeSource.mockImplementation(
      async () => undefined,
    );
    myListStorageMocks.createManualMyListItem.mockReset();
    myListStorageMocks.createManualMyListItem.mockImplementation(async () => ({
      id: "manual-row-created",
      origin: "manual-my-list-upgrade",
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          circles: [
            {
              activeMemberCount: 1,
              id: CIRCLE_ID,
              memberPreview: [],
              name: "Circle Y",
              viewerRole: "OWNER",
            },
          ],
        }),
        ok: true,
      })),
    );
    window.confirm = vi.fn(() => true);
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();
    window.scrollTo = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: "",
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("keeps manual todo seed values visible after the unified sheet opens", async () => {
    const { Fab } = await import("../../components/ui/Fab");

    flushSync(() => {
      root.render(React.createElement(Fab, { hideLauncher: true }));
    });
    await nextTick();

    flushSync(() => {
      window.dispatchEvent(
        new CustomEvent("schedule:open-quick-create-task-details", {
          detail: {
            energy: "MEDIUM",
            origin: "manual-my-list-upgrade",
            priority: "HIGH",
            skillId: "skill-health",
            sourceManualMyListItemId: "manual-row-1",
            title: "Test hydration",
          },
        }),
      );
    });
    await nextTick();

    const sheet = document.querySelector("[data-unified-event-sheet]");
    expect(sheet).toBeTruthy();

    const titleInput = document.querySelector<HTMLInputElement>(
      "#unified-event-title",
    );
    expect(titleInput?.value).toBe("Test hydration");
    expect(sheet?.textContent).toContain("Health");
    expect(sheet?.textContent).toContain("High");

    flushSync(() => {
      window.dispatchEvent(
        new CustomEvent("schedule:open-quick-create-task-details", {
          detail: {
            energy: "MEDIUM",
            origin: "manual-my-list-upgrade",
            priority: "LOW",
            skillId: "skill-health",
            sourceManualMyListItemId: "manual-row-2",
            title: "Second hydration",
          },
        }),
      );
    });
    await nextTick();

    expect(titleInput?.value).toBe("Second hydration");
    expect(sheet?.textContent).toContain("Health");
    expect(sheet?.textContent).toContain("Low");
  });

  it("keeps a hydrated manual todo title while switching unified task-side types", async () => {
    const { Fab } = await import("../../components/ui/Fab");

    flushSync(() => {
      root.render(React.createElement(Fab, { hideLauncher: true }));
    });
    await nextTick();

    flushSync(() => {
      openQuickCreateTaskDetails({
        energy: "MEDIUM",
        origin: "manual-my-list-upgrade",
        priority: "HIGH",
        skillId: "skill-health",
        sourceManualMyListItemId: "manual-row-1",
        title: "Test hydration",
      });
    });
    await nextTick();

    expect(document.querySelector("[data-unified-event-sheet]")).toBeTruthy();
    expect(getUnifiedTitleInput().value).toBe("Test hydration");

    selectUnifiedTaskSideType("GOAL");
    await nextTick();
    expect(getUnifiedTitleInput().value).toBe("Test hydration");
    const relationshipStrip = getUnifiedRelationshipStrip();
    expect(getGoalRoadmapTrigger().textContent?.trim()).toBe("add ROADMAP");
    expect(getGoalPrimaryRelationTrigger().textContent?.trim()).toBe("Body");
    expect(relationshipStrip.textContent).toContain("add ROADMAP");
    expect(relationshipStrip.textContent).toContain("Body");
    expect(relationshipStrip.textContent).not.toContain("Add to Roadmap");
    expect(relationshipStrip.textContent).not.toContain("Add to Circle");
    const goalSheet = getUnifiedEventSheet();
    expect(goalSheet.querySelector('[aria-label="Pin Goal"]')).toBeTruthy();
    expect(goalSheet.textContent).toContain("Priority");
    expect(goalSheet.textContent).toContain("Energy");
    expect(goalSheet.textContent).toContain("Due date");
    expect(getGoalDueDateInput().value).toBe("");
    expect(goalSheet.textContent).toContain("Type");
    expect(goalSheet.textContent).toContain("Tags");
    expect(goalSheet.textContent).toContain("Notes");
    expect(goalSheet.textContent).not.toContain("Manual");
    expect(goalSheet.textContent).not.toContain("Dynamic");
    expect(goalSheet.textContent).not.toContain("Starts");
    expect(goalSheet.textContent).not.toContain("Ends");
    expect(goalSheet.textContent).not.toContain("Duration");
    expect(goalSheet.textContent).not.toContain("Recurrence");
    expect(goalSheet.textContent).not.toContain("Skill");
    expect(goalSheet.textContent).not.toContain("Forms");
    expect(goalSheet.textContent).not.toContain("More");

    selectUnifiedTaskSideType("TASK");
    await nextTick();
    expect(getUnifiedTitleInput().value).toBe("Test hydration");
    const taskSheet = getUnifiedEventSheet();
    expect(taskSheet.textContent).toContain("Manual");
    expect(taskSheet.textContent).toContain("Dynamic");
    expect(taskSheet.textContent).toContain("Starts");
    expect(taskSheet.textContent).toContain("Ends");
    expect(taskSheet.textContent).toContain("Recurrence");
  });

  it("shows Goal relationship controls only in the top relationship strip", async () => {
    const { Fab } = await import("../../components/ui/Fab");

    flushSync(() => {
      root.render(React.createElement(Fab, { hideLauncher: true }));
    });
    await nextTick();

    flushSync(() => {
      openQuickCreateTaskDetails({
        origin: "manual-my-list-upgrade",
        sourceManualMyListItemId: "manual-row-1",
        title: "Test hydration",
      });
    });
    await nextTick();

    const taskSheet = document.querySelector("[data-unified-event-sheet]");
    expect(taskSheet).toBeTruthy();
    expect(taskSheet?.textContent).not.toContain("Add to Roadmap");
    expect(taskSheet?.textContent).not.toContain("add ROADMAP");
    const taskRelationshipStrip = getUnifiedRelationshipStrip();
    expect(taskRelationshipStrip.textContent).toContain("Link to GOAL / PROJECT");
    expect(taskRelationshipStrip.textContent).toContain("add to CIRCLE");

    selectUnifiedTaskSideType("GOAL");
    await nextTick();

    const goalSheet = document.querySelector("[data-unified-event-sheet]");
    const goalRelationshipStrip = getUnifiedRelationshipStrip();
    expect(getGoalRoadmapTrigger().textContent?.trim()).toBe("add ROADMAP");
    expect(getGoalPrimaryRelationTrigger().textContent?.trim()).toBe("Body");
    expect(goalRelationshipStrip.textContent).toContain("add ROADMAP");
    expect(goalRelationshipStrip.textContent).toContain("Body");
    expect(goalRelationshipStrip.textContent).not.toContain("Add to Roadmap");
    expect(goalRelationshipStrip.textContent).not.toContain("Add to Circle");
    expect(goalSheet?.querySelector("[data-unified-goal-roadmap-row]")).toBeNull();
    expect(goalSheet?.querySelector("[data-unified-goal-circle-row]")).toBeNull();
    expect(getUnifiedTitleInput().value).toBe("Test hydration");
  });

  it("updates Goal top relationship placeholders after Roadmap and Circle selection", async () => {
    const { Fab } = await import("../../components/ui/Fab");

    flushSync(() => {
      root.render(React.createElement(Fab, { hideLauncher: true }));
    });
    await nextTick();

    flushSync(() => {
      openQuickCreateTaskDetails({
        energy: "MEDIUM",
        origin: "manual-my-list-upgrade",
        priority: "HIGH",
        skillId: "skill-health",
        sourceManualMyListItemId: "manual-row-1",
        title: "Test hydration",
      });
    });
    await nextTick();

    selectUnifiedTaskSideType("GOAL");
    await nextTick();
    await nextTick();

    expect(getUnifiedTitleInput().value).toBe("Test hydration");
    expect(getGoalRoadmapTrigger().textContent?.trim()).toBe("add ROADMAP");
    expect(getGoalPrimaryRelationTrigger().textContent?.trim()).toBe("Body");

    selectGoalTopRelationshipValue("circle", CIRCLE_ID);
    await nextTick();
    expect(getGoalRoadmapTrigger().textContent?.trim()).toBe("add ROADMAP");
    expect(getGoalPrimaryRelationTrigger().textContent).toContain("Circle Y");
    expect(getUnifiedTitleInput().value).toBe("Test hydration");

    selectGoalTopRelationshipValue("roadmap", CAMPAIGN_ID);
    await nextTick();
    expect(getGoalRoadmapTrigger().textContent).toContain("Roadmap X");
    expect(getGoalPrimaryRelationTrigger().textContent).toContain("Circle Y");
    expect(getUnifiedTitleInput().value).toBe("Test hydration");
  });

  it("persists selected Roadmap and Circle ids when saving a unified Goal", async () => {
    const { Fab } = await import("../../components/ui/Fab");

    flushSync(() => {
      root.render(React.createElement(Fab, { hideLauncher: true }));
    });
    await nextTick();

    flushSync(() => {
      openQuickCreateTaskDetails({
        origin: "manual-my-list-upgrade",
        sourceManualMyListItemId: "manual-row-1",
        title: "Roadmap relationship test",
      });
    });
    await nextTick();

    selectUnifiedTaskSideType("GOAL");
    await nextTick();
    await nextTick();

    selectGoalTopRelationshipValue("circle", CIRCLE_ID);
    await nextTick();
    selectGoalTopRelationshipValue("roadmap", CAMPAIGN_ID);
    await nextTick();

    submitUnifiedGoal();
    await nextTick();
    await nextTick();

    expect(getInsertedPayloadForTable("goals")).toMatchObject({
      area_id: null,
      circle_id: CIRCLE_ID,
      name: "Roadmap relationship test",
      roadmap_id: ROADMAP_ID,
      user_id: "user-1",
    });
    expect(roadmapQueryMocks.addGoalToCampaign).toHaveBeenCalledWith("user-1", {
      campaignId: CAMPAIGN_ID,
      goalId: CREATED_GOAL_ID,
      position: 1,
    });
  });

  it("persists Goal due date from the unified Goal control", async () => {
    const { Fab } = await import("../../components/ui/Fab");

    flushSync(() => {
      root.render(React.createElement(Fab, { hideLauncher: true }));
    });
    await nextTick();

    flushSync(() => {
      openQuickCreateTaskDetails({
        origin: "manual-my-list-upgrade",
        sourceManualMyListItemId: "manual-row-1",
        title: "Due date goal",
      });
    });
    await nextTick();

    selectUnifiedTaskSideType("GOAL");
    await nextTick();

    setNativeDateInputValue(getGoalDueDateInput(), "2026-10-31");
    await nextTick();

    submitUnifiedGoal();
    await nextTick();
    await nextTick();

    expect(getInsertedPayloadForTable("goals")).toMatchObject({
      area_id: DEFAULT_AREA_ID,
      due_date: "2026-10-31",
      name: "Due date goal",
      user_id: "user-1",
    });
  });

  it("keeps a directly typed title across type switches but clears it for a fresh sheet session", async () => {
    const { Fab } = await import("../../components/ui/Fab");

    flushSync(() => {
      root.render(React.createElement(Fab, { hideLauncher: true }));
    });
    await nextTick();

    flushSync(() => {
      openQuickCreateTaskDetails();
    });
    await nextTick();

    setNativeInputValue(getUnifiedTitleInput(), "Direct draft");
    await nextTick();
    expect(getUnifiedTitleInput().value).toBe("Direct draft");

    selectUnifiedTaskSideType("GOAL");
    await nextTick();
    expect(getUnifiedTitleInput().value).toBe("Direct draft");

    selectUnifiedTaskSideType("PROJECT");
    await nextTick();
    expect(getUnifiedTitleInput().value).toBe("Direct draft");

    closeUnifiedEventSheet();
    await nextTick();

    flushSync(() => {
      openQuickCreateTaskDetails();
    });
    await nextTick();
    expect(getUnifiedTitleInput().value).toBe("");

    selectUnifiedTaskSideType("GOAL");
    await nextTick();
    expect(getUnifiedTitleInput().value).toBe("");
  });
});
