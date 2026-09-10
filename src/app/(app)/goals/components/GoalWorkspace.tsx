"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
} from "react";
import {
  NoteSlashTextarea,
  type NoteSlashTextareaHandle,
} from "@/components/notes/NoteSlashTextarea";
import { NoteTextActionBar } from "@/components/notes/NoteTextActionBar";
import { NOTE_SOFT_OLED_CLASSES } from "@/lib/notes/softOled";
import {
  loadGoalWorkspace,
  saveGoalWorkspace,
} from "@/lib/goals/goalWorkspace";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  buildNoteTodoMarker,
  parseStandaloneNoteTodoMarker,
  type NoteTodo,
} from "@/lib/notes/noteTodos";
import type { CatRow } from "@/lib/types/cat";
import type { SkillRow } from "@/lib/types/skill";
import type { Goal, Project, Task } from "../types";
import { ProjectsDropdown } from "./ProjectsDropdown";
import {
  ProjectRowTaskInteractionsProvider,
  type ProjectCardMorphOrigin,
} from "./ProjectRow";

type GoalWorkspaceProps = {
  goal: Goal;
  loading: boolean;
  workspaceExpanded?: boolean;
  alwaysShowNotes?: boolean;
  presentation?: "default" | "area-featured";
  projectDropdownMode?: "default" | "tasks-only";
  onProjectLongPress?: (
    project: Project,
    origin: ProjectCardMorphOrigin | null,
  ) => void;
  onProjectUpdated?: (projectId: string, updates: Partial<Project>) => void;
  onAddProject?: (originRect?: DOMRect) => void;
  addingProject?: boolean;
  onTaskEditOpen?: (
    task: Task,
    project: Project,
    origin: ProjectCardMorphOrigin | null,
  ) => void;
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentCompletedAt: string | null,
  ) => void;
};

const SAVE_DEBOUNCE_MS = 650;

function splitGoalWorkspaceContent(value: string, noteTodos: NoteTodo[]) {
  const lines = value.split("\n");
  const knownTodoIds = new Set(noteTodos.map((todo) => todo.id));
  const orderedTodoIds: string[] = [];
  const seenTodoIds = new Set<string>();
  const freeformLines: string[] = [];

  for (const line of lines) {
    const marker = parseStandaloneNoteTodoMarker(line);
    if (marker) {
      if (knownTodoIds.has(marker.todoId) && !seenTodoIds.has(marker.todoId)) {
        orderedTodoIds.push(marker.todoId);
        seenTodoIds.add(marker.todoId);
      }
      continue;
    }

    freeformLines.push(line);
  }

  for (const todo of noteTodos) {
    if (!seenTodoIds.has(todo.id)) {
      orderedTodoIds.push(todo.id);
      seenTodoIds.add(todo.id);
    }
  }

  return {
    todoValue: orderedTodoIds.map(buildNoteTodoMarker).join("\n"),
    freeformValue: freeformLines.join("\n").replace(/^\n+/, ""),
  };
}

function mergeGoalWorkspaceContent(todoValue: string, freeformValue: string) {
  const normalizedTodoValue = todoValue.trim();
  const normalizedFreeformValue = freeformValue.replace(/^\n+/, "");

  if (!normalizedTodoValue) return normalizedFreeformValue;
  if (!normalizedFreeformValue.trim()) return normalizedTodoValue;

  return `${normalizedTodoValue}\n\n${normalizedFreeformValue}`;
}

export function GoalWorkspace({
  goal,
  loading,
  workspaceExpanded = false,
  alwaysShowNotes = false,
  presentation = "default",
  projectDropdownMode = "default",
  onProjectLongPress,
  onProjectUpdated,
  onAddProject,
  addingProject,
  onTaskEditOpen,
  onTaskToggleCompletion,
}: GoalWorkspaceProps) {
  const noteTextareaRef = useRef<NoteSlashTextareaHandle | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedGoalIdRef = useRef<string | null>(null);
  const contentRef = useRef("");
  const noteTodosRef = useRef<NoteTodo[]>([]);
  const [content, setContent] = useState("");
  const [noteTodos, setNoteTodos] = useState<NoteTodo[]>([]);
  const [editorActive, setEditorActive] = useState(false);
  const [editingTodo, setEditingTodo] = useState(false);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadedGoalIdRef.current = null;
    setContent("");
    setNoteTodos([]);

    void loadGoalWorkspace(goal.id).then((workspace) => {
      if (cancelled) return;
      loadedGoalIdRef.current = goal.id;
      setContent(workspace?.content ?? "");
      setNoteTodos(workspace?.noteTodos ?? []);
    });

    return () => {
      cancelled = true;
    };
  }, [goal.id]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;

    void Promise.all([
      supabase
        .from("skills")
        .select("id, user_id, name, icon, cat_id, monument_id, level, sort_order"),
      supabase.from("cats").select("id, user_id, name, sort_order"),
    ]).then(([skillsResult, categoriesResult]) => {
      if (cancelled) return;
      if (!skillsResult.error) setSkills((skillsResult.data ?? []) as SkillRow[]);
      if (!categoriesResult.error) {
        setSkillCategories((categoriesResult.data ?? []) as CatRow[]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    noteTodosRef.current = noteTodos;
  }, [noteTodos]);

  const flushWorkspaceSave = useCallback(() => {
    if (loadedGoalIdRef.current !== goal.id) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    void saveGoalWorkspace({
      goalId: goal.id,
      content: contentRef.current,
      noteTodos: noteTodosRef.current,
    });
  }, [goal.id]);

  useEffect(() => {
    if (loadedGoalIdRef.current !== goal.id) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      flushWorkspaceSave();
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, flushWorkspaceSave, goal.id, noteTodos]);

  useEffect(() => {
    return () => {
      if (loadedGoalIdRef.current !== goal.id) return;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      void saveGoalWorkspace({
        goalId: goal.id,
        content: contentRef.current,
        noteTodos: noteTodosRef.current,
      });
    };
  }, [goal.id]);

  const handleEditorFocusCapture = useCallback(
    (event: ReactFocusEvent<HTMLDivElement>) => {
      setEditorActive(true);

      const target =
        event.target instanceof HTMLElement ? event.target : null;

      setEditingTodo(Boolean(target?.closest("[data-note-todo-row]")));
    },
    [],
  );

  const handleEditorBlurCapture = useCallback(
    (event: ReactFocusEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return;
      }
      setEditorActive(false);
      setEditingTodo(false);
      flushWorkspaceSave();
    },
    [flushWorkspaceSave],
  );

  const showNotes = alwaysShowNotes || workspaceExpanded;
  const usesExpandedLayout = workspaceExpanded && !alwaysShowNotes;
  const { todoValue, freeformValue } = splitGoalWorkspaceContent(
    content,
    noteTodos,
  );
  const handleTodoValueChange = useCallback(
    (nextTodoValue: string) => {
      setContent(mergeGoalWorkspaceContent(nextTodoValue, freeformValue));
    },
    [freeformValue],
  );
  const handleFreeformValueChange = useCallback(
    (nextFreeformValue: string) => {
      setContent(mergeGoalWorkspaceContent(todoValue, nextFreeformValue));
    },
    [todoValue],
  );
  return (
    <div className={usesExpandedLayout ? "min-h-0" : ""}>
      <div
        className={`relative isolate text-white ${
          presentation === "area-featured"
            ? "bg-transparent px-0 py-0.5 sm:py-1"
            : "bg-transparent px-0 py-0"
        } ${
          usesExpandedLayout
            ? "min-h-0"
            : "min-h-0"
        }`}
        onFocusCapture={handleEditorFocusCapture}
        onBlurCapture={handleEditorBlurCapture}
        data-goal-workspace-editor
      >
        <ProjectRowTaskInteractionsProvider
          value={{ goalId: goal.id, onTaskEditOpen, onTaskToggleCompletion }}
        >
          <ProjectsDropdown
            id={`goal-${goal.id}`}
            goalTitle={goal.title}
            projects={goal.projects}
            loading={loading}
            onProjectLongPress={onProjectLongPress}
            onProjectUpdated={onProjectUpdated}
            goalId={goal.id}
            projectTasksOnly={projectDropdownMode === "tasks-only"}
            onTaskToggleCompletion={onTaskToggleCompletion}
            onAddProject={onAddProject}
            addingProject={addingProject}
            workspaceEmbedded
          />
        </ProjectRowTaskInteractionsProvider>

        {showNotes ? (
          <>
            <NoteSlashTextarea
              value={todoValue}
              onValueChange={handleTodoValueChange}
              noteTodos={noteTodos}
              onNoteTodosChange={setNoteTodos}
              noteTodoOwner={{ type: "GOAL", id: goal.id }}
              skills={skills}
              skillCategories={skillCategories}
              noteId={`goal-workspace:${goal.id}`}
              className={`goal-workspace-todos ${todoValue ? "" : "goal-workspace-todos-empty"} w-full border-0 bg-transparent p-0 text-[15px] leading-6 ${NOTE_SOFT_OLED_CLASSES.body} ${NOTE_SOFT_OLED_CLASSES.caret} outline-none ${NOTE_SOFT_OLED_CLASSES.placeholder}`}
              aria-label="Goal todos"
            />

            <div className="goal-workspace-freeform-divider" aria-hidden="true" />

            <div
              className={`pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-2 transition-[opacity,transform] duration-150 ${
                editorActive && !editingTodo
                  ? "translate-y-0 opacity-100"
                  : "translate-y-1 opacity-0"
              }`}
            >
              <div
                className="pointer-events-auto max-w-full rounded-xl bg-black/90 px-1 py-1 shadow-[0_12px_34px_rgba(0,0,0,0.5)] backdrop-blur-xl"
                onPointerDown={(event) => event.preventDefault()}
              >
                <NoteTextActionBar
                  onFormat={(command) =>
                    noteTextareaRef.current?.applyTextFormat(command)
                  }
                  onBlockFormat={(format) =>
                    noteTextareaRef.current?.applyBlockFormat(format)
                  }
                />
              </div>
            </div>

            <NoteSlashTextarea
              ref={noteTextareaRef}
              value={freeformValue}
              onValueChange={handleFreeformValueChange}
              noteTodos={noteTodos}
              onNoteTodosChange={setNoteTodos}
              noteTodoOwner={{ type: "GOAL", id: goal.id }}
              skills={skills}
              skillCategories={skillCategories}
              noteId={`goal-workspace:${goal.id}`}
              placeholder="Write inside this goal..."
              className={`goal-workspace-freeform min-h-[76px] w-full border-0 bg-transparent p-0 text-[15px] leading-6 ${NOTE_SOFT_OLED_CLASSES.body} ${NOTE_SOFT_OLED_CLASSES.caret} outline-none ${NOTE_SOFT_OLED_CLASSES.placeholder}`}
              aria-label="Goal workspace"
            />
          </>
        ) : null}
      </div>

      <style jsx global>{`
        [data-goal-workspace-editor] [data-note-text-action-bar] {
          position: static !important;
          bottom: auto !important;
          padding-left: 0;
          padding-right: 0;
          opacity: 1 !important;
          pointer-events: auto !important;
        }

        [data-goal-workspace-editor] [data-note-text-action-bar] > div {
          max-width: none;
        }

        [data-goal-workspace-editor]
          .goal-workspace-todos-empty {
          display: none !important;
        }

        /*
         * Goal todos live in their own NoteSlashTextarea. NoteSlashTextarea
         * intentionally appends a trailing empty text segment, but that segment
         * is not meaningful inside this todo-only surface and otherwise appears
         * as a blank draggable row beneath the final todo.
         */
        [data-goal-workspace-editor]
          .goal-workspace-todos
          .group\\/note-sortable:has(
            [data-note-editable-segment-id^="text-"]
          ) {
          display: none !important;
        }

        /*
         * Incomplete Goal todos should be neutral. Green is reserved for the
         * completed state.
         */
        [data-goal-workspace-editor]
          .goal-workspace-todos
          [data-note-todo-row]
          [role="checkbox"][aria-checked="false"] {
          border-color: rgba(255, 255, 255, 0.24) !important;
          background: rgba(255, 255, 255, 0.035) !important;
        }

        [data-goal-workspace-editor]
          .goal-workspace-todos
          [data-note-todo-row]
          [role="checkbox"][aria-checked="false"]:hover {
          border-color: rgba(255, 255, 255, 0.38) !important;
          background: rgba(255, 255, 255, 0.055) !important;
        }

        /*
         * Goal workspace todos need workspace-local centering while staying
         * compact enough for the open Goal card.
         */
        [data-goal-workspace-editor]
          .goal-workspace-todos
          [data-note-todo-row] {
          min-height: 32px !important;
          gap: 9px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }

        [data-goal-workspace-editor]
          .goal-workspace-todos
          [data-note-todo-row]
          [role="checkbox"] {
          width: 22px !important;
          height: 22px !important;
          border-radius: 999px !important;
        }

        [data-goal-workspace-editor]
          .goal-workspace-todos
          [data-note-todo-row]
          [role="checkbox"]
          svg {
          width: 14px !important;
          height: 14px !important;
        }

        [data-goal-workspace-editor]
          .goal-workspace-todos
          [data-note-todo-row]
          [data-note-todo-no-long-press].ml-auto {
          display: none !important;
        }


        [data-goal-workspace-editor]
          .goal-workspace-todos
          .group\\/note-sortable:has([data-note-todo-row])
          > button:first-child {
          margin-top: 1px !important;
        }

        @media (min-width: 640px) {
          [data-goal-workspace-editor]
            .goal-workspace-todos
            .group\\/note-sortable:has([data-note-todo-row])
            > button:first-child {
            margin-top: 4px !important;
          }
        }

        /*
         * The Goal todo editor contains only promoted todos. NoteSlashTextarea
         * appends one empty text segment for editing continuity; hide that
         * synthetic row on this todo-only surface.
         */
        [data-goal-workspace-editor]
          .goal-workspace-todos
          [data-note-sortable-segment][data-note-segment-type="text"] {
          display: none !important;
        }

        /*
         * Match the drag target to the Goal workspace todo row instead of the
         * shared mobile handle geometry.
         */
        [data-goal-workspace-editor]
          .goal-workspace-todos
          [data-note-sortable-segment][data-note-segment-type="noteTodo"]
          > [data-note-sortable-handle] {
          height: 32px !important;
          margin-top: 0 !important;
          align-self: center;
        }

        [data-goal-workspace-editor]
          [data-note-editable-segment-id^="text-"],
        [data-goal-workspace-editor]
          [data-note-editable-segment-id^="checklist-"],
        [data-goal-workspace-editor]
          [data-note-editable-segment-id^="noteTodo-"],
        [data-goal-workspace-editor]
          [data-note-editable-segment-id^="list-"],
        [data-goal-workspace-editor]
          [data-note-editable-segment-id^="quote-"] {
          min-height: 24px !important;
          font-size: 15px !important;
          line-height: 24px !important;
        }

        [data-goal-workspace-editor]
          .goal-workspace-freeform-divider {
          height: 1px;
          margin: 8px 0 10px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.12),
            transparent
          );
        }

        [data-goal-workspace-editor]
          .goal-workspace-freeform::placeholder,
        [data-goal-workspace-editor]
          .goal-workspace-freeform
          [contenteditable]:empty::before {
          font-size: 15px !important;
        }
      `}</style>
    </div>
  );
}
