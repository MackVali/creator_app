import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Ensure components compiled with the classic runtime find React in scope
(globalThis as unknown as { React: typeof React }).React = React;

type SubmitHandler = (ordered: Array<{ id: string; name?: string }>) => unknown | Promise<unknown>;

const { reorderCatsMock, refreshMock, applyCategoryOrderMock } = vi.hoisted(() => ({
  reorderCatsMock: vi.fn(async () => {}),
  refreshMock: vi.fn(async () => {}),
  applyCategoryOrderMock: vi.fn(),
}));

const submitRef: { current: SubmitHandler | null } = { current: null };

vi.mock("next/navigation", () => {
  const replace = vi.fn();
  return {
    useRouter: () => ({ replace }),
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

vi.mock("framer-motion", () => ({
  Reorder: {
    Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock("../../src/app/(app)/dashboard/_skills/useSkillsData", () => ({
  __esModule: true,
  default: () => ({
    categories: [{ id: "uncategorized", name: "Skills" }],
    skillsByCategory: { uncategorized: [] },
    isLoading: false,
    refresh: refreshMock,
    applyCategoryOrder: applyCategoryOrderMock,
  }),
}));

vi.mock("../../src/app/(app)/dashboard/_skills/ReorderCategoriesModal", () => ({
  __esModule: true,
  default: (props: { onSubmit: SubmitHandler }) => {
    submitRef.current = props.onSubmit;
    return null;
  },
}));

vi.mock("@/lib/data/cats", () => ({
  getCatsForUser: vi.fn(),
  reorderCats: reorderCatsMock,
  updateCatColor: vi.fn(),
  updateCatIcon: vi.fn(),
  updateCatOrder: vi.fn(),
}));

// Import after mocks
import SkillsCarousel from "../../src/app/(app)/dashboard/_skills/SkillsCarousel";

describe("SkillsCarousel fallback category", () => {
  beforeEach(() => {
    reorderCatsMock.mockClear();
    refreshMock.mockClear();
    applyCategoryOrderMock.mockClear();
    submitRef.current = null;
  });

  it("skips Supabase reorder when only the synthetic category exists", async () => {
    renderToString(<SkillsCarousel />);

    expect(typeof submitRef.current).toBe("function");

    await submitRef.current?.([{ id: "uncategorized", name: "Skills" }]);

    expect(reorderCatsMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(applyCategoryOrderMock).not.toHaveBeenCalled();
  });
});
