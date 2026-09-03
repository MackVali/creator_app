// @vitest-environment jsdom

import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NoteSlashTextarea } from "../../src/components/notes/NoteSlashTextarea";
import { buildNoteTodoMarker, type NoteTodo } from "../../src/lib/notes/noteTodos";
import type { CatRow } from "../../src/lib/types/cat";
import type { SkillRow } from "../../src/lib/types/skill";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}

if (!globalThis.PointerEvent) {
  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
}

const skills: SkillRow[] = [
  {
    id: "skill-1",
    user_id: "user-1",
    name: "Dentistry",
    icon: "🦷",
    cat_id: "cat-1",
    monument_id: null,
    level: 1,
    sort_order: 1,
  },
  {
    id: "skill-2",
    user_id: "user-1",
    name: "Writing",
    icon: "✍",
    cat_id: "cat-1",
    monument_id: null,
    level: 1,
    sort_order: 2,
  },
];

const skillCategories: CatRow[] = [
  {
    id: "cat-1",
    user_id: "user-1",
    name: "Work",
    sort_order: 1,
  },
];

function Harness({
  initialValue,
  initialTodos,
  ownerType = "AREA",
  onTodosChange,
}: {
  initialValue: string;
  initialTodos: NoteTodo[];
  ownerType?: "AREA" | "MONUMENT" | "SKILL";
  onTodosChange?: (todos: NoteTodo[]) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [todos, setTodos] = useState(initialTodos);

  return React.createElement(NoteSlashTextarea, {
    value,
    onValueChange: (nextValue: string) => {
      setValue(nextValue);
      document.body.dataset.noteValue = nextValue;
    },
    noteTodos: todos,
    onNoteTodosChange: (nextTodos: NoteTodo[]) => {
      setTodos(nextTodos);
      document.body.dataset.noteTodos = JSON.stringify(nextTodos);
      onTodosChange?.(nextTodos);
    },
    noteTodoOwner: { type: ownerType, id: "skill-1" },
    skills,
    skillCategories,
    "aria-label": "Note editor",
  });
}

async function renderHarness(props: React.ComponentProps<typeof Harness>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(Harness, props));
  });

  return { container, root };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function unmount(root: Root) {
  await act(async () => {
    root.unmount();
  });
}

function focusTextbox(container: HTMLElement, label: string) {
  const textbox = container.querySelector<HTMLElement>(`[role="textbox"][aria-label="${label}"]`);
  expect(textbox).toBeTruthy();
  act(() => {
    textbox?.focus();
    textbox?.click();
  });
  return textbox as HTMLElement;
}

function blurElement(element: HTMLElement) {
  act(() => {
    element.blur();
  });
}

function pointerDown(element: Element, pointerId = 1) {
  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId,
      pointerType: "touch",
    }),
  );
}

describe("note-owned todos UI", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.dataset.noteValue = "";
    document.body.dataset.noteTodos = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("shows promotion only for a plain active checklist row", async () => {
    const { container, root } = await renderHarness({
      initialValue: "- [ ] Call dentist",
      initialTodos: [],
    });

    expect(container.querySelector('[aria-label="Promote checklist item to todo"]')).toBeNull();
    focusTextbox(container, "Checklist item text");
    expect(container.querySelector('[aria-label="Promote checklist item to todo"]')).toBeTruthy();

    await unmount(root);
  });

  it("renders promoted todos compactly at rest with the skill control visible", async () => {
    const todo: NoteTodo = {
      id: "todo-1",
      title: "Call dentist",
      completed: false,
      priority: "MEDIUM",
      skillId: null,
      energy: "MEDIUM",
    };
    const { container, root } = await renderHarness({
      initialValue: buildNoteTodoMarker(todo.id),
      initialTodos: [todo],
    });

    expect(container.querySelector('[aria-label="Promote checklist item to todo"]')).toBeNull();
    expect(container.querySelector('[aria-label="Open todo details"]')).toBeNull();
    expect(container.querySelector('[aria-label="Choose Skill"]')?.textContent).toBe("✦");
    expect(container.querySelector('[aria-label="Todo priority Medium"]')).toBeNull();
    expect(container.querySelector('[aria-label="Remove todo structure"]')).toBeNull();

    await unmount(root);
  });

  it("reveals promoted todo row controls while active and returns compact after blur", async () => {
    const todo: NoteTodo = {
      id: "todo-1",
      title: "Call dentist",
      completed: false,
      priority: "MEDIUM",
      skillId: "skill-1",
      energy: "MEDIUM",
    };
    const { container, root } = await renderHarness({
      initialValue: buildNoteTodoMarker(todo.id),
      initialTodos: [todo],
    });

    expect(container.querySelector('[aria-label="Todo priority Medium"]')).toBeNull();
    expect(container.querySelector('[aria-label="Remove todo structure"]')).toBeNull();
    expect(container.querySelector('[aria-label="Change Skill: Dentistry"]')?.textContent).toBe(
      "🦷",
    );

    const todoText = focusTextbox(container, "Todo text");
    expect(container.querySelector('[aria-label="Todo priority Medium"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Remove todo structure"]')).toBeTruthy();

    blurElement(todoText);
    await flush();
    expect(container.querySelector('[aria-label="Todo priority Medium"]')).toBeNull();
    expect(container.querySelector('[aria-label="Remove todo structure"]')).toBeNull();
    expect(container.querySelector('[aria-label="Change Skill: Dentistry"]')?.textContent).toBe(
      "🦷",
    );

    await unmount(root);
  });

  it("keeps promoted todo row controls revealed while skill and priority interactions are active", async () => {
    const todo: NoteTodo = {
      id: "todo-1",
      title: "Call dentist",
      completed: false,
      priority: "MEDIUM",
      skillId: null,
      energy: "MEDIUM",
    };
    const onTodosChange = vi.fn();
    const { container, root } = await renderHarness({
      initialValue: buildNoteTodoMarker(todo.id),
      initialTodos: [todo],
      onTodosChange,
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Choose Skill"]')?.click();
    });
    expect(container.querySelector('[role="listbox"][aria-label="Choose Skill"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Todo priority Medium"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Remove todo structure"]')).toBeTruthy();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Choose Skill"]')?.click();
    });
    await flush();
    expect(container.querySelector('[aria-label="Todo priority Medium"]')).toBeNull();
    expect(container.querySelector('[aria-label="Remove todo structure"]')).toBeNull();

    focusTextbox(container, "Todo text");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Todo priority Medium"]')?.click();
    });
    expect(onTodosChange).toHaveBeenLastCalledWith([{ ...todo, priority: "LOW" }]);
    expect(container.querySelector('[aria-label="Todo priority Low"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Remove todo structure"]')).toBeTruthy();

    await unmount(root);
  });

  it("keeps promoted todo controls visible during delete confirmation", async () => {
    const todo: NoteTodo = {
      id: "todo-1",
      title: "Call dentist",
      completed: false,
      priority: "MEDIUM",
      skillId: "skill-1",
      energy: "MEDIUM",
    };
    const { container, root } = await renderHarness({
      initialValue: buildNoteTodoMarker(todo.id),
      initialTodos: [todo],
    });

    focusTextbox(container, "Todo text");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Remove todo structure"]')?.click();
    });

    expect(container.querySelector('[aria-label="Todo priority Medium"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Confirm remove todo structure"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Confirm remove todo structure"] svg')).toBeTruthy();

    await unmount(root);
  });

  it("selects and renders skill icons, including inherited Skill note todos", async () => {
    const todo: NoteTodo = {
      id: "todo-1",
      title: "Call dentist",
      completed: false,
      priority: "MEDIUM",
      skillId: null,
      energy: "MEDIUM",
    };
    const onTodosChange = vi.fn();
    const { container, root } = await renderHarness({
      initialValue: buildNoteTodoMarker(todo.id),
      initialTodos: [todo],
      onTodosChange,
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Choose Skill"]')?.click();
    });
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'))
        .find((button) => button.textContent?.includes("Dentistry"))
        ?.click();
    });
    await flush();

    expect(onTodosChange).toHaveBeenLastCalledWith([{ ...todo, skillId: "skill-1" }]);
    expect(container.querySelector('[aria-label="Change Skill: Dentistry"]')?.textContent).toBe(
      "🦷",
    );

    await unmount(root);

    const inherited = { ...todo, skillId: "skill-1" };
    const second = await renderHarness({
      initialValue: buildNoteTodoMarker(inherited.id),
      initialTodos: [inherited],
      ownerType: "SKILL",
    });
    expect(
      second.container.querySelector('[aria-label="Change Skill: Dentistry"]')?.textContent,
    ).toBe("🦷");
    await unmount(second.root);
  });

  it("keeps priority editable and downgrades without deleting note text", async () => {
    const todo: NoteTodo = {
      id: "todo-1",
      title: "Call dentist",
      completed: true,
      priority: "MEDIUM",
      skillId: "skill-1",
      energy: "MEDIUM",
    };
    const onTodosChange = vi.fn();
    const { container, root } = await renderHarness({
      initialValue: buildNoteTodoMarker(todo.id),
      initialTodos: [todo],
      onTodosChange,
    });

    focusTextbox(container, "Todo text");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Todo priority Medium"]')?.click();
    });
    expect(onTodosChange).toHaveBeenLastCalledWith([{ ...todo, priority: "LOW" }]);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Remove todo structure"]')?.click();
    });
    expect(container.querySelector('[aria-label="Confirm remove todo structure"]')).toBeTruthy();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Confirm remove todo structure"]')
        ?.click();
    });
    await flush();

    expect(document.body.dataset.noteValue?.split("\n")[0]).toBe("- [x] Call dentist");
    expect(JSON.parse(document.body.dataset.noteTodos || "[]")).toEqual([]);
    expect(container.querySelector('[aria-label="Promote checklist item to todo"]')).toBeTruthy();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Promote checklist item to todo"]')?.click();
    });
    await flush();
    expect(JSON.parse(document.body.dataset.noteTodos || "[]")).toHaveLength(1);

    await unmount(root);
  });

  it("blocks control presses from long-press details while preserving row long press", async () => {
    const todo: NoteTodo = {
      id: "todo-1",
      title: "Call dentist",
      completed: false,
      priority: "MEDIUM",
      skillId: null,
      energy: "MEDIUM",
    };
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const { container, root } = await renderHarness({
      initialValue: buildNoteTodoMarker(todo.id),
      initialTodos: [todo],
    });

    focusTextbox(container, "Todo text");
    const controlLabels = ["Choose Skill", "Todo priority Medium", "Remove todo structure"];
    for (const label of controlLabels) {
      const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
      expect(button).toBeTruthy();
      act(() => {
        pointerDown(button as HTMLButtonElement);
        vi.advanceTimersByTime(600);
      });
    }
    expect(dispatchSpy).not.toHaveBeenCalled();

    const row = container.querySelector('[aria-label="Todo text"]')?.parentElement;
    expect(row).toBeTruthy();
    act(() => {
      pointerDown(row as HTMLElement, 9);
      vi.advanceTimersByTime(600);
    });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "schedule:open-quick-create-task-details",
      }),
    );

    await unmount(root);
  });
});
