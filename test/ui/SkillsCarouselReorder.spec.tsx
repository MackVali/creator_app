import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

    const [categoryButton] = screen.getAllByRole("button", { name: /skills/i });
    fireEvent.click(categoryButton);

    expect(screen.queryByText(/change order/i)).toBeNull();
  });
});
