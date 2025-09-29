"use client";

import React, { useState } from "react";

import ProjectCard from "@/components/ProjectCard";

const PROJECTS = [
  { id: "project-alpha", title: "Integrate molten completion animation" },
  { id: "project-beta", title: "Wire timeline XP celebration" },
  { id: "project-gamma", title: "Finalize completed card polish" },
];

export default function ProjectCardDemoPage(): JSX.Element {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white/90">Project timeline</h1>
        <p className="text-sm text-white/60">
          Toggle a project to experience the molten crack-up, explosion, and
          pine resolve animation.
        </p>
      </header>
      <div className="flex flex-col gap-6">
        {PROJECTS.map((project) => (
          <ProjectCard
            key={project.id}
            id={project.id}
            title={project.title}
            completedAt={completed[project.id] ? new Date().toISOString() : undefined}
            onComplete={(projectId) =>
              setCompleted((prev) => ({ ...prev, [projectId]: true }))
            }
          />
        ))}
      </div>
    </div>
  );
}
