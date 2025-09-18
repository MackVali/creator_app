"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  Calendar,
  ChevronDown,
  Flame,
  List,
  MoreHorizontal,
} from "lucide-react";
import type { Goal } from "../types";
import { ProjectsDropdown } from "./ProjectsDropdown";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Folder } from "@/components/Folder";

interface GoalCardProps {
  goal: Goal;
  onEdit?: () => void;
  onToggleActive?: () => void;
}

const FOLDER_COLOR_FALLBACK = "#5227FF";
const MOBILE_FOLDER_SIZE = 0.92;
const DESKTOP_FOLDER_SIZE = 1;

const energyFolderColors: Record<Goal["energy"], string> = {
  No: "#5227FF",
  Low: "#4C7DFF",
  Medium: "#6A5CFF",
  High: "#FF885D",
  Ultra: "#FF6FA3",
  Extreme: "#FF4D6D",
};

export function GoalCard({ goal, onEdit, onToggleActive }: GoalCardProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [folderSize, setFolderSize] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return MOBILE_FOLDER_SIZE;
    }
    return window.matchMedia("(min-width: 640px)").matches
      ? DESKTOP_FOLDER_SIZE
      : MOBILE_FOLDER_SIZE;
  });

  const folderTimeoutRef = useRef<number | null>(null);
  const loadingTimeoutRef = useRef<number | null>(null);
  const folderLockRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sizeQuery = window.matchMedia("(min-width: 640px)");

    const handleMotionChange = () =>
      setPrefersReducedMotion(motionQuery.matches);
    const handleSizeChange = () =>
      setFolderSize(
        sizeQuery.matches ? DESKTOP_FOLDER_SIZE : MOBILE_FOLDER_SIZE
      );

    handleMotionChange();
    handleSizeChange();

    motionQuery.addEventListener("change", handleMotionChange);
    sizeQuery.addEventListener("change", handleSizeChange);

    return () => {
      motionQuery.removeEventListener("change", handleMotionChange);
      sizeQuery.removeEventListener("change", handleSizeChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (folderTimeoutRef.current !== null) {
        window.clearTimeout(folderTimeoutRef.current);
      }
      if (loadingTimeoutRef.current !== null) {
        window.clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setFolderOpen(false);
    }
  }, [open]);

  const animationDelay = prefersReducedMotion ? 0 : 200;

  const setCardOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (loadingTimeoutRef.current !== null) {
      window.clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    if (nextOpen) {
      setLoading(true);
      loadingTimeoutRef.current = window.setTimeout(() => {
        setLoading(false);
        loadingTimeoutRef.current = null;
      }, 500);
    } else {
      setLoading(false);
    }
  };

  const handleMainActivate = () => {
    const nextOpen = !open;
    setFolderOpen(nextOpen);
    setCardOpen(nextOpen);
  };

  const handleMainKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleMainActivate();
    }
  };

  const handleFolderClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const nextOpen = !open;

    if (folderLockRef.current) {
      return;
    }

    setFolderOpen(nextOpen);
    folderLockRef.current = true;

    if (folderTimeoutRef.current !== null) {
      window.clearTimeout(folderTimeoutRef.current);
      folderTimeoutRef.current = null;
    }

    if (animationDelay === 0) {
      setCardOpen(nextOpen);
      folderLockRef.current = false;
      return;
    }

    folderTimeoutRef.current = window.setTimeout(() => {
      setCardOpen(nextOpen);
      folderLockRef.current = false;
      folderTimeoutRef.current = null;
    }, animationDelay);
  };

  const goalColor = (goal as { color?: string | null }).color;
  const folderColor = useMemo(() => {
    const usableColor =
      typeof goalColor === "string" && goalColor.trim().length > 0
        ? goalColor
        : undefined;
    return (
      usableColor || energyFolderColors[goal.energy] || FOLDER_COLOR_FALLBACK
    );
  }, [goal.energy, goalColor]);

  const totalTasks = useMemo(() => {
    return goal.projects.reduce((sum, project) => sum + project.tasks.length, 0);
  }, [goal.projects]);

  const dueDateInfo = useMemo(() => {
    if (!goal.dueDate) {
      return { label: "No Due Date", dateTime: undefined as string | undefined };
    }
    const parsed = new Date(goal.dueDate);
    if (Number.isNaN(parsed.getTime())) {
      return { label: "No Due Date", dateTime: undefined as string | undefined };
    }
    return {
      label: parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      dateTime: goal.dueDate,
    };
  }, [goal.dueDate]);

  const tasksLabel = useMemo(() => {
    return `${totalTasks} ${totalTasks === 1 ? "task" : "tasks"}`;
  }, [totalTasks]);

  const energyLabel = useMemo(() => {
    return goal.energy === "No" ? "NO ENERGY" : goal.energy.toUpperCase();
  }, [goal.energy]);

  const folderItems = useMemo<ReactNode[]>(() => {
    const dueDateNode = (
      <span className="inline-flex items-center gap-1.5">
        <Calendar aria-hidden className="shrink-0" />
        {dueDateInfo.dateTime ? (
          <time dateTime={dueDateInfo.dateTime} className="truncate">
            {dueDateInfo.label}
          </time>
        ) : (
          <span className="truncate">{dueDateInfo.label}</span>
        )}
      </span>
    );

    const tasksNode = (
      <span className="inline-flex items-center gap-1.5">
        <List aria-hidden className="shrink-0" />
        <span className="truncate">{tasksLabel}</span>
      </span>
    );

    const energyNode = (
      <span className="inline-flex items-center gap-1.5 uppercase">
        <Flame aria-hidden className="shrink-0" />
        <span className="truncate">{energyLabel}</span>
      </span>
    );

    return [dueDateNode, tasksNode, energyNode];
  }, [dueDateInfo, tasksLabel, energyLabel]);

  const priorityStyles =
    goal.priority === "High"
      ? "bg-gray-200 text-gray-900"
      : goal.priority === "Medium"
      ? "bg-gray-400 text-gray-900"
      : "bg-gray-600 text-gray-100";

  return (
    <div className="rounded-lg border border-white/10 bg-[#2c2c2c] text-left shadow">
      <div className="relative flex items-start gap-4 p-4 sm:p-5">
        <div className="flex-shrink-0 pt-1">
          <Folder
            color={folderColor}
            size={folderSize}
            items={folderItems}
            open={folderOpen}
            onClick={handleFolderClick}
            aria-label={`${goal.title} summary folder`}
            aria-controls={`goal-${goal.id}`}
            className="transition-transform"
          />
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-controls={`goal-${goal.id}`}
          aria-expanded={open}
          onClick={handleMainActivate}
          onKeyDown={handleMainKeyDown}
          className="flex-1 min-w-0 cursor-pointer select-none rounded-xl p-1 pr-10 transition-colors duration-150 hover:bg-white/5 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {goal.emoji && (
                  <span className="text-xl" aria-hidden>
                    {goal.emoji}
                  </span>
                )}
                <span
                  id={`goal-${goal.id}-label`}
                  className="truncate font-medium text-white"
                >
                  {goal.title}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-300">
                <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-700">
                  <div
                    className="h-full bg-gray-200"
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
                {dueDateInfo.dateTime && (
                  <span className="rounded-full bg-gray-700 px-2 py-0.5">
                    {dueDateInfo.label}
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 ${priorityStyles}`}>
                  {goal.priority}
                </span>
                <span className="rounded-full bg-gray-700 px-2 py-0.5">
                  {goal.projects.length} projects
                </span>
              </div>
            </div>
            <ChevronDown
              className={`mt-1 h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </div>
        </div>
        <div className="absolute right-3 top-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Goal actions"
                className="rounded bg-gray-700 p-1 transition-colors hover:bg-gray-600"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit?.()}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onToggleActive?.()}>
                {goal.active ? "Mark Inactive" : "Mark Active"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ProjectsDropdown
        id={`goal-${goal.id}`}
        goalTitle={goal.title}
        projects={goal.projects}
        open={open}
        loading={loading}
      />
    </div>
  );
}
