"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import type { Goal } from "../types";
import { ProjectsDropdown } from "./ProjectsDropdown";
import { getSupabaseBrowser } from "@/lib/supabase";

interface GoalCardProps {
  goal: Goal;
  onEdit?: (goal: Goal) => void;
  onActiveChange?: (id: string, active: boolean) => void;
}

export function GoalCard({ goal, onEdit, onActiveChange }: GoalCardProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(goal.active);
  const menuRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const focusedIndex = useRef(0);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        menuOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      focusedIndex.current = 0;
      itemsRef.current[0]?.focus();
    }
  }, [menuOpen]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setMenuOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusedIndex.current =
        (focusedIndex.current + 1) % itemsRef.current.length;
      itemsRef.current[focusedIndex.current]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusedIndex.current =
        (focusedIndex.current - 1 + itemsRef.current.length) %
        itemsRef.current.length;
      itemsRef.current[focusedIndex.current]?.focus();
    }
  };

  const toggleActive = async () => {
    const supabase = getSupabaseBrowser();
    const newActive = !active;
    if (supabase) {
      try {
        await supabase
          .from("goals")
          .update({ active: newActive, status: newActive ? "ACTIVE" : "INACTIVE" })
          .eq("id", goal.id);
      } catch (err) {
        console.error("Failed to update goal", err);
      }
    }
    setActive(newActive);
    onActiveChange?.(goal.id, newActive);
    setMenuOpen(false);
  };

  const toggle = () => {
    setOpen((o) => !o);
    if (!open) {
      setLoading(true);
      setTimeout(() => setLoading(false), 500);
    }
  };

  const priorityColor =
    goal.priority === "High"
      ? "bg-red-600"
      : goal.priority === "Medium"
      ? "bg-yellow-600"
      : "bg-green-600";

  return (
    <div
      className={`bg-gray-800 rounded-lg shadow text-left ${
        active ? "" : "opacity-50"
      }`}
    >
      <div className="relative">
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`goal-${goal.id}`}
          className="w-full flex items-start justify-between p-4 active:scale-95 transition-transform motion-safe:duration-150 motion-reduce:transform-none"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {goal.emoji && <span className="text-xl" aria-hidden>{goal.emoji}</span>}
              <span id={`goal-${goal.id}-label`} className="font-medium truncate">
                {goal.title}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-300">
              <div className="w-10 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${goal.progress}%` }}
                />
              </div>
              {goal.dueDate && (
                <span className="px-2 py-0.5 bg-gray-700 rounded-full">
                  {new Date(goal.dueDate).toLocaleDateString()}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full ${priorityColor}`}>
                {goal.priority}
              </span>
              <span className="px-2 py-0.5 bg-gray-700 rounded-full">
                {goal.projects.length} projects
              </span>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 ml-2 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <div className="absolute top-2 right-2">
          <button
            ref={buttonRef}
            aria-label="Goal actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={`goal-menu-${goal.id}`}
            onClick={() => setMenuOpen((m) => !m)}
            className="p-1 rounded bg-gray-700"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <ul
              id={`goal-menu-${goal.id}`}
              role="menu"
              ref={menuRef}
              onKeyDown={onMenuKeyDown}
              className="absolute right-0 mt-1 bg-gray-700 rounded shadow-lg text-sm z-10 focus:outline-none"
            >
              <li role="none">
                <button
                  role="menuitem"
                  ref={(el) => (itemsRef.current[0] = el)}
                  className="block w-full text-left px-3 py-1 hover:bg-gray-600"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit?.({ ...goal, active });
                  }}
                >
                  Edit
                </button>
              </li>
              <li role="none">
                <button
                  role="menuitem"
                  ref={(el) => (itemsRef.current[1] = el)}
                  className="block w-full text-left px-3 py-1 hover:bg-gray-600"
                  onClick={toggleActive}
                >
                  {active ? "Mark Inactive" : "Mark Active"}
                </button>
              </li>
            </ul>
          )}
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
