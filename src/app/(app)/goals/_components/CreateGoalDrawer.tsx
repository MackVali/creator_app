"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Goal, GoalPriority } from "./types";

interface CreateGoalDrawerProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  onCreate: (goal: Goal) => void;
}

export function CreateGoalDrawer({ open, setOpen, onCreate }: CreateGoalDrawerProps) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<GoalPriority>("Low");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const newGoal: Goal = {
      id: Date.now().toString(),
      title,
      emoji,
      dueDate,
      priority,
      progress: 0,
      status: "Active",
      updatedAt: new Date().toISOString(),
      projects: [],
    };
    onCreate(newGoal);
    setOpen(false);
    setTitle("");
    setEmoji("");
    setDueDate("");
    setPriority("Low");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Create Goal</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
          <Input
            required
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-gray-800 border-gray-700"
          />
          <Input
            placeholder="Emoji"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="bg-gray-800 border-gray-700"
          />
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="bg-gray-800 border-gray-700"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as GoalPriority)}
            className="rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm"
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
          <SheetFooter>
            <Button type="submit">Add Goal</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
