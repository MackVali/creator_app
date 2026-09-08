"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
} from "react";
import { Plus } from "lucide-react";
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
  onTaskEditOpen,
  onTaskToggleCompletion,
}: GoalWorkspaceProps) {
  const todoTextareaRef = useRef<NoteSlashTextareaHandle | null>(null);
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
  const handleAddTodo = useCallback(() => {
    todoTextareaRef.current?.insertTodo();
  }, []);

  return (
    <div className={usesExpandedLayout ? "min-h-full" : ""}>
      <div
        className={`relative isolate text-white ${
          presentation === "area-featured"
            ? "bg-transparent px-0 py-0.5 sm:py-1"
            : "bg-transparent px-0 py-0"
        } ${
          usesExpandedLayout
            ? "min-h-full"
            : "min-h-0"
        }`}
        onFocusCapture={handleEditorFocusCapture}
        onBlurCapture={handleEditorBlurCapture}
        data-goal-workspace-editor
      >
        {showNotes && projectDropdownMode !== "tasks-only" ? (
          <button
            type="button"
            aria-label="Add goal todo"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleAddTodo();
            }}
            className="absolute -bottom-3 right-2 z-20 flex h-7 w-7 items-center justify-center text-white/46 outline-none transition hover:text-white/80 focus-visible:text-white focus-visible:ring-1 focus-visible:ring-white/18"
          >
            <Plus aria-hidden="true" className="h-4 w-4 stroke-[2.1]" />
          </button>
        ) : null}
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
            hideAddProjectControl
            workspaceEmbedded
          />
        </ProjectRowTaskInteractionsProvider>

        {showNotes ? (
          <>
            <NoteSlashTextarea
              ref={todoTextareaRef}
              value={todoValue}
              onValueChange={handleTodoValueChange}
              noteTodos={noteTodos}
              onNoteTodosChange={setNoteTodos}
              noteTodoOwner={{ type: "GOAL", id: goal.id }}
              skills={skills}
              skillCategories={skillCategories}
              noteId={`goal-workspace:${goal.id}`}
              className={`goal-workspace-todos ${todoValue ? "" : "goal-workspace-todos-empty"} w-full border-0 bg-transparent p-0 text-sm leading-5 ${NOTE_SOFT_OLED_CLASSES.body} ${NOTE_SOFT_OLED_CLASSES.caret} outline-none ${NOTE_SOFT_OLED_CLASSES.placeholder}`}
              aria-label="Goal todos"
            />


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
              className={`min-h-[64px] w-full border-0 bg-transparent p-0 text-sm leading-5 ${NOTE_SOFT_OLED_CLASSES.body} ${NOTE_SOFT_OLED_CLASSES.caret} outline-none ${NOTE_SOFT_OLED_CLASSES.placeholder}`}
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
         * Mobile sortable handles are 32px tall while the todo row is 28px.
         * Pull the handle up 2px so their visual centers line up. At the sm
         * breakpoint the handle becomes 24px tall, where the existing +2px
         * offset correctly centers it.
         */
        [data-goal-workspace-editor]
          .goal-workspace-todos
          .group\\/note-sortable:has([data-note-todo-row])
          > button:first-child {
          margin-top: -2px !important;
        }

        @media (min-width: 640px) {
          [data-goal-workspace-editor]
            .goal-workspace-todos
            .group\\/note-sortable:has([data-note-todo-row])
            > button:first-child {
            margin-top: 2px !important;
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
         * Match the drag target to the actual 28px Goal todo row instead of
         * using the shared 32px mobile handle geometry.
         */
        [data-goal-workspace-editor]
          .goal-workspace-todos
          [data-note-sortable-segment][data-note-segment-type="noteTodo"]
          > [data-note-sortable-handle] {
          height: 28px !important;
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
          font-size: 14px !important;
          line-height: 20px !important;
        }
      `}</style>
    </div>
  );
}
