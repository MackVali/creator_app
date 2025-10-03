import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";

import SkillsCarousel, {
  PLACEHOLDER_CATEGORY_ID,
} from "../../src/app/(app)/dashboard/_skills/SkillsCarousel";
import type { Category } from "../../src/app/(app)/dashboard/_skills/useSkillsData";

(globalThis as unknown as { React?: typeof React }).React = React;

const hoisted = vi.hoisted(() => ({
  updateCatsOrderBulk: vi.fn(),
}));

const mockUseSkillsData = vi.fn();
const updateCatsOrderBulk = hoisted.updateCatsOrderBulk;
const toastSuccess = vi.fn();
const toastError = vi.fn();
let capturedOnSave: ((ordered: Category[]) => Promise<void>) | undefined;
const VALID_CAT_A = "11111111-1111-4111-8111-111111111111";
const VALID_CAT_B = "22222222-2222-4222-8222-222222222222";
let lastCategoryProps: { canReorder?: boolean } | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("framer-motion", () => ({
  __esModule: true,
  Reorder: {
    Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

vi.mock("../../src/app/(app)/dashboard/_skills/useSkillsData", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/app/(app)/dashboard/_skills/useSkillsData")
  >("../../src/app/(app)/dashboard/_skills/useSkillsData");
  return {
    ...actual,
    default: () => mockUseSkillsData(),
  };
});

vi.mock("../../src/app/(app)/dashboard/_skills/ReorderCatsModal", () => ({
  __esModule: true,
  default: (props: {
    onSave: (ordered: Category[]) => Promise<void>;
  }) => {
    capturedOnSave = props.onSave;
    return null;
  },
}));

vi.mock("../../src/app/(app)/dashboard/_skills/CategoryCard", () => ({
  __esModule: true,
  default: (props: { canReorder?: boolean }) => {
    lastCategoryProps = props;
    return <div data-testid="mock-category" data-can-reorder={props.canReorder} />;
  },
}));

vi.mock("@/lib/data/cats", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/cats")>(
    "@/lib/data/cats"
  );
  return {
    ...actual,
    updateCatsOrderBulk: hoisted.updateCatsOrderBulk,
  };
});

vi.mock("@/components/ui/toast", () => ({
  useToastHelpers: () => ({
    success: toastSuccess,
    error: toastError,
  }),
}));

beforeEach(() => {
  mockUseSkillsData.mockReset();
  mockUseSkillsData.mockReturnValue({
    categories: [
      {
        id: PLACEHOLDER_CATEGORY_ID,
        name: "Skills",
      },
    ],
    skillsByCategory: {},
    isLoading: false,
  });
  updateCatsOrderBulk.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  capturedOnSave = undefined;
  lastCategoryProps = null;
});

describe("SkillsCarousel reorder handling", () => {
  it("does not persist order when only the placeholder category exists", async () => {
    render(<SkillsCarousel />);
    expect(capturedOnSave).toBeTypeOf("function");

    await capturedOnSave?.([
      {
        id: PLACEHOLDER_CATEGORY_ID,
        name: "Skills",
      },
    ]);

    expect(updateCatsOrderBulk).not.toHaveBeenCalled();
  });

  it("hides the change order action when only the placeholder category exists", () => {
    render(<SkillsCarousel />);

    expect(lastCategoryProps?.canReorder).toBe(false);
  });

  it("persists order changes for categories with valid UUIDs", async () => {
    mockUseSkillsData.mockReturnValueOnce({
      categories: [
        { id: VALID_CAT_A, name: "Arcana" },
        { id: VALID_CAT_B, name: "Mysticism" },
      ],
      skillsByCategory: {},
      isLoading: false,
    });

    render(<SkillsCarousel />);
    expect(capturedOnSave).toBeTypeOf("function");

    await act(async () => {
      await capturedOnSave?.([
        { id: VALID_CAT_B, name: "Mysticism" },
        { id: VALID_CAT_A, name: "Arcana" },
      ]);
    });

    expect(updateCatsOrderBulk).toHaveBeenCalledWith([
      { id: VALID_CAT_B, sort_order: 0 },
      { id: VALID_CAT_A, sort_order: 1 },
    ]);
  });

  it("surfaces an error when non-UUID categories are present", async () => {
    mockUseSkillsData.mockReturnValueOnce({
      categories: [
        { id: VALID_CAT_A, name: "Arcana" },
        { id: VALID_CAT_B, name: "Mysticism" },
      ],
      skillsByCategory: {},
      isLoading: false,
    });

    render(<SkillsCarousel />);
    expect(capturedOnSave).toBeTypeOf("function");

    await act(async () => {
      await expect(
        capturedOnSave!([
          { id: "temp-cat", name: "Temporary" },
          { id: VALID_CAT_A, name: "Arcana" },
          { id: VALID_CAT_B, name: "Mysticism" },
        ])
      ).rejects.toThrow(/missing valid ids/i);
    });

    expect(updateCatsOrderBulk).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "Unable to save order",
      expect.stringMatching(/missing valid ids/i)
    );
  });

  it("trims whitespace from category ids before persisting", async () => {
    mockUseSkillsData.mockReturnValueOnce({
      categories: [
        { id: VALID_CAT_A, name: "Arcana" },
        { id: VALID_CAT_B, name: "Mysticism" },
      ],
      skillsByCategory: {},
      isLoading: false,
    });

    render(<SkillsCarousel />);
    expect(capturedOnSave).toBeTypeOf("function");

    await act(async () => {
      await capturedOnSave?.([
        { id: `  ${VALID_CAT_B}\n`, name: "Mysticism" },
        { id: `\t${VALID_CAT_A}  `, name: "Arcana" },
      ]);
    });

    expect(updateCatsOrderBulk).toHaveBeenLastCalledWith([
      { id: VALID_CAT_B, sort_order: 0 },
      { id: VALID_CAT_A, sort_order: 1 },
    ]);
  });
});
