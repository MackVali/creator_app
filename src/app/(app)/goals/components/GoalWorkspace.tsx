"use client";

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

export function GoalWorkspace({
  goal,
  loading,
  workspaceExpanded = false,
  presentation = "default",
  projectDropdownMode = "default",
  onProjectLongPress,
  onProjectUpdated,
  onAddProject,
  addingProject,
  onTaskEditOpen,
  onTaskToggleCompletion,
}: GoalWorkspaceProps) {
  return (
    <div className={workspaceExpanded ? "min-h-0" : ""}>
      <div
        className={`relative isolate min-h-0 text-white ${
          presentation === "area-featured"
            ? "bg-transparent px-0 py-0.5 sm:py-1"
            : "bg-transparent px-0 py-0"
        }`}
      >
        <ProjectRowTaskInteractionsProvider
          value={{
            goalId: goal.id,
            onTaskEditOpen,
            onTaskToggleCompletion,
          }}
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
      </div>
    </div>
  );
}
