import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { EventModal } from "@/components/ui/EventModal";

const getSupabaseBrowserMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToastHelpers: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/lib/queries/goals", () => ({
  getGoalsForUser: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/queries/projects", () => ({
  getProjectsForGoal: vi.fn().mockResolvedValue([]),
  getProjectsForUser: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/queries/monuments", () => ({
  getMonumentsForUser: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/queries/skills", () => ({
  getSkillsForUser: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseBrowser: getSupabaseBrowserMock,
}));

describe("EventModal habit submission", () => {
  let insertMock: ReturnType<typeof vi.fn>;
  let selectAfterInsertMock: ReturnType<typeof vi.fn>;
  let singleMock: ReturnType<typeof vi.fn>;
  let selectWindowsMock: ReturnType<typeof vi.fn>;
  let eqMock: ReturnType<typeof vi.fn>;
  let orderMock: ReturnType<typeof vi.fn>;
  let fromMock: ReturnType<typeof vi.fn>;
  let getUserMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    singleMock = vi.fn(async () => ({ data: { id: "habit-1" }, error: null }));
    selectAfterInsertMock = vi.fn(() => ({ single: singleMock }));
    insertMock = vi.fn(() => ({ select: selectAfterInsertMock }));
    orderMock = vi.fn(async () => ({ data: [], error: null }));
    eqMock = vi.fn(() => ({ order: orderMock }));
    selectWindowsMock = vi.fn(() => ({ eq: eqMock }));
    fromMock = vi.fn((table: string) => {
      if (table === "habits") {
        return { insert: insertMock };
      }
      if (table === "windows") {
        return { select: selectWindowsMock };
      }
      return { insert: vi.fn(), select: vi.fn() } as unknown as Record<string, unknown>;
    });
    getUserMock = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });

    getSupabaseBrowserMock.mockReturnValue({
      auth: { getUser: getUserMock },
      from: fromMock,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a habit payload aligned with the schema", async () => {
    const onClose = vi.fn();

    render(<EventModal isOpen eventType="HABIT" onClose={onClose} />);

    await waitFor(() =>
      expect(screen.getByLabelText(/Habit name/i)).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText(/Habit name/i), {
      target: { value: "Morning focus" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Deep work" },
    });
    fireEvent.change(screen.getByLabelText(/Duration \(minutes\)/i), {
      target: { value: "25.4" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Create Habit/i }));

    await waitFor(() => expect(insertMock).toHaveBeenCalled());

    const habitPayload = insertMock.mock.calls[0][0];

    expect(fromMock).toHaveBeenCalledWith("habits");
    expect(habitPayload).toMatchObject({
      user_id: "user-123",
      name: "MORNING FOCUS",
      description: "Deep work",
      habit_type: "HABIT",
      recurrence: null,
      duration_minutes: 25,
      window_id: null,
    });
    expect(habitPayload).not.toHaveProperty("priority");
    expect(habitPayload).not.toHaveProperty("energy");
  });
});
