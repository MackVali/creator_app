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
import type { NoteTodo } from "@/lib/notes/noteTodos";
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
  projectDropdownMode?: "default" | "tasks-only";
  onProjectLongPress?: (
    project: Project,
    origin: ProjectCardMorphOrigin | null,
  ) => void;
  onProjectUpdated?: (projectId: string, updates: Partial<Project>) => void;
  onAddProject?: () => void;
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

export function GoalWorkspace({
  goal,
  loading,
  workspaceExpanded = false,
  projectDropdownMode = "default",
  onProjectLongPress,
  onProjectUpdated,
  onTaskEditOpen,
  onTaskToggleCompletion,
}: GoalWorkspaceProps) {
  const textareaRef = useRef<NoteSlashTextareaHandle | null>(null);
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
    [],
  );

  return (
    <div
      className={
        workspaceExpanded
          ? "flex max-h-[calc(100dvh-8rem)] flex-col overflow-hidden"
          : ""
      }
    >
      <div
        className={`relative isolate bg-black px-1 py-2 text-white ${
          workspaceExpanded
            ? "min-h-0 overflow-y-auto"
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
            hideAddProjectControl
            workspaceEmbedded
          />
        </ProjectRowTaskInteractionsProvider>

        {workspaceExpanded ? (
          <>
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-2 z-30 flex justify-center px-1 transition-[opacity,transform] duration-150 ${
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
                textareaRef.current?.applyTextFormat(command)
              }
              onBlockFormat={(format) =>
                textareaRef.current?.applyBlockFormat(format)
              }
            />
          </div>
        </div>

        <NoteSlashTextarea
          ref={textareaRef}
          value={content}
          onValueChange={setContent}
          noteTodos={noteTodos}
          onNoteTodosChange={setNoteTodos}
          noteTodoOwner={{ type: "GOAL", id: goal.id }}
          skills={skills}
          skillCategories={skillCategories}
          noteId={`goal-workspace:${goal.id}`}
          placeholder="Write inside this goal..."
          className={`min-h-40 w-full border-0 bg-transparent p-0 text-base leading-7 ${NOTE_SOFT_OLED_CLASSES.body} ${NOTE_SOFT_OLED_CLASSES.caret} outline-none ${NOTE_SOFT_OLED_CLASSES.placeholder}`}
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
      `}</style>
    </div>
  );
}
