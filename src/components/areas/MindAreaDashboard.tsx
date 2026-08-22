"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { AlertCircle, ArrowLeft, LoaderCircle, Plus, X } from "lucide-react";
import { useFabCreation } from "@/components/ui/FabCreationContext";

type Course = {
  id: string;
  owner_user_id: string;
  title: string;
  description: string | null;
  status: string;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
};

type CoursesResponse = {
  courses: Course[];
};

type CreateCourseResponse = {
  course: Course;
};

type CurriculumNodeType = "GOAL" | "PROJECT" | "TASK" | "HABIT";

type CurriculumNode = {
  id: string;
  course_id: string;
  parent_node_id: string | null;
  node_type: CurriculumNodeType;
  name: string;
  position: number;
  definition: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type CurriculumResponse = {
  nodes: CurriculumNode[];
};

type CourseCurriculumNodeCreatedEventDetail = {
  courseId: string;
  node: CurriculumNode;
};

type ApiErrorBody = {
  error?: unknown;
  issues?: unknown;
  message?: unknown;
};

function apiErrorMessage(body: ApiErrorBody, fallback: string) {
  if (Array.isArray(body.issues)) {
    const issues = body.issues.filter(
      (issue): issue is string => typeof issue === "string"
    );
    if (issues.length > 0) return issues.join(" ");
  }

  if (typeof body.error === "string" && body.error.trim()) return body.error;
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  return fallback;
}

const COURSE_CURRICULUM_NODE_CREATED_EVENT =
  "course-curriculum-node-created";

const NODE_LABEL_CLASS: Record<CurriculumNodeType, string> = {
  GOAL: "border-emerald-200/15 bg-emerald-300/10 text-emerald-100/76",
  PROJECT: "border-sky-200/15 bg-sky-300/10 text-sky-100/76",
  TASK: "border-zinc-200/12 bg-zinc-300/10 text-zinc-100/70",
  HABIT: "border-amber-200/15 bg-amber-300/10 text-amber-100/76",
};

export function MindAreaDashboard() {
  const fabCreation = useFabCreation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [curriculumNodes, setCurriculumNodes] = useState<CurriculumNode[]>([]);
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [curriculumError, setCurriculumError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const childrenByParentId = useMemo(() => {
    const map = new Map<string | null, CurriculumNode[]>();
    for (const node of curriculumNodes) {
      const parentId = node.parent_node_id ?? null;
      const siblings = map.get(parentId) ?? [];
      siblings.push(node);
      map.set(parentId, siblings);
    }

    for (const siblings of map.values()) {
      siblings.sort((left, right) => {
        const positionDiff = left.position - right.position;
        if (positionDiff !== 0) return positionDiff;
        return left.created_at.localeCompare(right.created_at);
      });
    }

    return map;
  }, [curriculumNodes]);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    async function loadCourses() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch("/api/courses", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as Partial<CoursesResponse> &
          ApiErrorBody;

        if (!response.ok) {
          throw new Error(apiErrorMessage(body, "Unable to load courses."));
        }

        if (isActive) setCourses(Array.isArray(body.courses) ? body.courses : []);
      } catch (reason) {
        if (reason instanceof Error && reason.name === "AbortError") return;
        if (isActive) {
          setLoadError(
            reason instanceof Error ? reason.message : "Unable to load courses."
          );
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void loadCourses();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!selectedCourseId) {
      setCurriculumNodes([]);
      setCurriculumError(null);
      setCurriculumLoading(false);
      return;
    }

    const controller = new AbortController();
    let isActive = true;

    async function loadCurriculum() {
      setCurriculumLoading(true);
      setCurriculumError(null);

      try {
        const response = await fetch(
          `/api/courses/${encodeURIComponent(selectedCourseId)}/curriculum`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const body = (await response.json()) as Partial<CurriculumResponse> &
          ApiErrorBody;

        if (!response.ok) {
          throw new Error(apiErrorMessage(body, "Unable to load curriculum."));
        }

        if (isActive) {
          setCurriculumNodes(Array.isArray(body.nodes) ? body.nodes : []);
        }
      } catch (reason) {
        if (reason instanceof Error && reason.name === "AbortError") return;
        if (isActive) {
          setCurriculumError(
            reason instanceof Error
              ? reason.message
              : "Unable to load curriculum.",
          );
        }
      } finally {
        if (isActive) setCurriculumLoading(false);
      }
    }

    void loadCurriculum();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [selectedCourseId]);

  useEffect(() => {
    function handleNodeCreated(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as Partial<CourseCurriculumNodeCreatedEventDetail>;
      if (!detail.courseId || !detail.node) return;
      if (detail.courseId !== selectedCourseId) return;

      setCurriculumNodes((currentNodes) => [
        ...currentNodes.filter((node) => node.id !== detail.node?.id),
        detail.node,
      ]);
    }

    window.addEventListener(
      COURSE_CURRICULUM_NODE_CREATED_EVENT,
      handleNodeCreated,
    );
    return () => {
      window.removeEventListener(
        COURSE_CURRICULUM_NODE_CREATED_EVENT,
        handleNodeCreated,
      );
    };
  }, [selectedCourseId]);

  function resetCreateForm() {
    setTitle("");
    setDescription("");
    setCreateError(null);
  }

  function closeCreateForm() {
    if (isSaving) return;
    setCreateOpen(false);
    resetCreateForm();
  }

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle || isSaving) return;

    setIsSaving(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          ...(trimmedDescription ? { description: trimmedDescription } : {}),
        }),
      });
      const body = (await response.json()) as Partial<CreateCourseResponse> &
        ApiErrorBody;

      if (!response.ok || !body.course) {
        throw new Error(apiErrorMessage(body, "Unable to create course."));
      }

      setCourses((currentCourses) => [
        body.course,
        ...currentCourses.filter((course) => course.id !== body.course?.id),
      ]);
      setCreateOpen(false);
      resetCreateForm();
    } catch (reason) {
      setCreateError(
        reason instanceof Error ? reason.message : "Unable to create course."
      );
    } finally {
      setIsSaving(false);
    }
  }

  const getNextPosition = useCallback(
    (parentNodeId: string | null) =>
      (childrenByParentId.get(parentNodeId)?.length ?? 0) + 1,
    [childrenByParentId],
  );

  const openCourseAuthoring = useCallback(
    (nodeType: CurriculumNodeType, parentNode?: CurriculumNode | null) => {
      if (!selectedCourse || !fabCreation) return;

      const courseContext = {
        courseId: selectedCourse.id,
        parentNodeId: parentNode?.id ?? null,
        parentNodeType: parentNode?.node_type ?? null,
        position: getNextPosition(parentNode?.id ?? null),
      };

      if (nodeType === "GOAL") {
        fabCreation.requestGoalCreation(null, null, { courseContext });
        return;
      }
      if (nodeType === "PROJECT") {
        fabCreation.requestProjectCreation(null, null, { courseContext });
        return;
      }
      if (nodeType === "TASK") {
        fabCreation.requestTaskCreation(null, null, null, { courseContext });
        return;
      }
      fabCreation.requestHabitCreation(null, null, { courseContext });
    },
    [fabCreation, getNextPosition, selectedCourse],
  );

  function renderAddActions(node: CurriculumNode) {
    const actions: CurriculumNodeType[] =
      node.node_type === "GOAL"
        ? ["PROJECT", "TASK", "HABIT"]
        : node.node_type === "PROJECT"
          ? ["TASK"]
          : [];

    if (actions.length === 0) return null;

    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {actions.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => openCourseAuthoring(type, node)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/52 transition hover:bg-white/[0.07] hover:text-white/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {type}
          </button>
        ))}
      </div>
    );
  }

  function renderCurriculumNode(node: CurriculumNode, depth = 0) {
    const children = childrenByParentId.get(node.id) ?? [];

    return (
      <div key={node.id} className={depth === 0 ? "" : "mt-2"}>
        <div
          className="rounded-xl border border-white/[0.065] bg-black/22 px-3 py-3"
          style={{ marginLeft: depth ? `${Math.min(depth * 14, 42)}px` : 0 }}
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <span
                className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.12em] ${NODE_LABEL_CLASS[node.node_type]}`}
              >
                {node.node_type}
              </span>
              <p className="mt-1.5 break-words text-sm font-semibold leading-5 text-white/84">
                {node.name}
              </p>
            </div>
          </div>
          {renderAddActions(node)}
        </div>
        {children.length > 0 ? (
          <div className="mt-2 space-y-2">
            {children.map((child) => renderCurriculumNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  if (selectedCourse) {
    const rootNodes = childrenByParentId.get(null) ?? [];

    return (
      <section
        className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
        aria-label="Course workspace"
      >
        <div className="border-b border-white/[0.055] px-3 py-3">
          <button
            type="button"
            onClick={() => setSelectedCourseId(null)}
            className="mb-2 inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.035] px-2 text-[11px] font-semibold text-white/54 transition hover:bg-white/[0.07] hover:text-white/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </button>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words text-lg font-semibold leading-6 text-white/90">
                {selectedCourse.title}
              </h2>
              {selectedCourse.description ? (
                <p className="mt-1 text-sm leading-5 text-white/45">
                  {selectedCourse.description}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              <button
                type="button"
                onClick={() => openCourseAuthoring("GOAL")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.095] bg-white/[0.045] px-2.5 text-[11px] font-semibold text-white/72 transition hover:bg-white/[0.075] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Goal
              </button>
              <button
                type="button"
                onClick={() => openCourseAuthoring("HABIT")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.095] bg-white/[0.035] px-2.5 text-[11px] font-semibold text-white/62 transition hover:bg-white/[0.065] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Habit
              </button>
            </div>
          </div>
        </div>

        <div className="p-3">
          {curriculumLoading ? (
            <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-white/[0.055] bg-black/20 text-xs font-semibold text-white/42">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading curriculum
            </div>
          ) : curriculumError ? (
            <div className="rounded-xl border border-red-200/10 bg-red-950/10 px-3 py-3">
              <p className="flex items-start gap-2 text-xs font-medium text-red-100/76">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{curriculumError}</span>
              </p>
            </div>
          ) : rootNodes.length === 0 ? (
            <div className="rounded-xl border border-white/[0.055] bg-black/20 px-3 py-4">
              <p className="text-sm font-semibold text-white/72">
                No curriculum yet.
              </p>
              <p className="mt-1 text-xs leading-5 text-white/38">
                Add a goal or top-level habit to begin this Course.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {rootNodes.map((node) => renderCurriculumNode(node))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
      aria-label="Courses"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.055] px-3 py-2.5">
        <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-white/46">
          COURSES
        </h2>
        <button
          type="button"
          onClick={() => {
            setCreateOpen((open) => !open);
            setCreateError(null);
          }}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.095] bg-white/[0.045] px-2.5 text-[11px] font-semibold text-white/72 transition hover:bg-white/[0.075] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 active:scale-95"
          aria-expanded={createOpen}
        >
          {createOpen ? (
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {createOpen ? "Close" : "Add"}
        </button>
      </div>

      {createOpen ? (
        <form
          onSubmit={createCourse}
          className="space-y-3 border-b border-white/[0.055] bg-white/[0.025] px-3 py-3"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="mind-course-title"
              className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42"
            >
              Title
            </label>
            <input
              id="mind-course-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isSaving}
              required
              className="h-10 w-full rounded-xl border border-white/[0.085] bg-black/40 px-3 text-sm font-medium text-white outline-none transition placeholder:text-white/25 focus:border-white/20 focus:bg-black/55 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Course title"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="mind-course-description"
              className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42"
            >
              Description
            </label>
            <textarea
              id="mind-course-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={isSaving}
              rows={3}
              className="min-h-[5.5rem] w-full resize-none rounded-xl border border-white/[0.085] bg-black/40 px-3 py-2.5 text-sm font-medium leading-5 text-white outline-none transition placeholder:text-white/25 focus:border-white/20 focus:bg-black/55 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Optional"
            />
          </div>
          {createError ? (
            <p className="flex items-start gap-2 text-xs font-medium text-red-100/76">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{createError}</span>
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeCreateForm}
              disabled={isSaving}
              className="h-9 rounded-lg px-3 text-xs font-semibold text-white/46 transition hover:text-white/72 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.095] px-3 text-xs font-semibold text-white transition hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Create
            </button>
          </div>
        </form>
      ) : null}

      <div className="p-3">
        {isLoading ? (
          <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-white/[0.055] bg-black/20 text-xs font-semibold text-white/42">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading courses
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-red-200/10 bg-red-950/10 px-3 py-3">
            <p className="flex items-start gap-2 text-xs font-medium text-red-100/76">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{loadError}</span>
            </p>
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-xl border border-white/[0.055] bg-black/20 px-3 py-4">
            <p className="text-sm font-semibold text-white/72">No courses yet.</p>
            <p className="mt-1 text-xs leading-5 text-white/38">
              Add the first course when you are ready to build one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <button
                key={course.id}
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setSelectedCourseId(course.id);
                }}
                className="min-w-0 overflow-hidden rounded-xl border border-white/[0.075] bg-black/24 text-left transition hover:border-white/[0.14] hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              >
                {course.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={course.cover_image_url}
                    alt=""
                    className="h-20 w-full object-cover opacity-70"
                  />
                ) : null}
                <div className="space-y-2 px-3 py-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <h3 className="min-w-0 truncate text-sm font-semibold text-white/86">
                      {course.title}
                    </h3>
                    <span className="shrink-0 rounded-md border border-white/[0.075] bg-white/[0.045] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">
                      {course.status}
                    </span>
                  </div>
                  {course.description ? (
                    <p className="line-clamp-2 text-xs leading-5 text-white/42">
                      {course.description}
                    </p>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
