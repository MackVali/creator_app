import { beforeEach, describe, expect, it, vi } from "vitest";

const booleanSetterSpies: Array<
  vi.Mock<[import("react").SetStateAction<unknown>], unknown>
> = [];

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const realUseState = actual.useState;
  return {
    ...actual,
    useState: ((initialState: unknown) => {
      const result = realUseState(initialState as never) as [
        unknown,
        import("react").Dispatch<import("react").SetStateAction<unknown>>,
      ];
      if (typeof result[0] === "boolean") {
        const setterSpy = vi.fn(
          (value: import("react").SetStateAction<unknown>) => value
        );
        booleanSetterSpies.push(
          setterSpy as vi.Mock<
            [import("react").SetStateAction<unknown>],
            unknown
          >
        );
        const originalSetter = result[1];
        const wrappedSetter: typeof originalSetter = (value) => {
          setterSpy(value);
          return originalSetter(value);
        };
        return [result[0], wrappedSetter] as typeof result;
      }
      return result;
    }) as typeof actual.useState,
  };
});

import React from "react";
import { renderToString } from "react-dom/server";

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

vi.mock("../../src/app/(app)/dashboard/_skills/CategoryCard", () => ({
  __esModule: true,
  default: () => null,
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
    booleanSetterSpies.splice(0, booleanSetterSpies.length);
  });

  it("skips Supabase reorder when only the synthetic category exists", async () => {
    renderToString(<SkillsCarousel />);

    expect(typeof submitRef.current).toBe("function");
    expect(booleanSetterSpies.length).toBeGreaterThan(0);

    await submitRef.current?.([{ id: "uncategorized", name: "Skills" }]);

    expect(reorderCatsMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(applyCategoryOrderMock).not.toHaveBeenCalled();
    const recordedValues = booleanSetterSpies.flatMap((spy) =>
      spy.mock.calls.map(([value]) => value)
    );
    expect(recordedValues).toContain(false);
  });
});
