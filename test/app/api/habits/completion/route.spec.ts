import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/completions/completionEvents", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/completions/completionEvents")>(
      "@/lib/completions/completionEvents"
    );
  return {
    ...actual,
    ensureCompletionEvent: vi.fn(),
  };
});

vi.mock("@/lib/streaks", () => ({
  refreshHabitStreak: vi.fn(),
}));

import { POST } from "@/app/api/habits/completion/route";
import { ensureCompletionEvent } from "@/lib/completions/completionEvents";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { refreshHabitStreak } from "@/lib/streaks";

const createSupabaseServerClientMock = vi.mocked(createSupabaseServerClient);
const ensureCompletionEventMock = vi.mocked(ensureCompletionEvent);
const refreshHabitStreakMock = vi.mocked(refreshHabitStreak);

const userId = "11111111-1111-4111-8111-111111111111";
const habitId = "22222222-2222-4222-8222-222222222222";

function buildRequest(completedAt: string) {
  return new Request("http://localhost/api/habits/completion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      habitId,
      completedAt,
      timeZone: "America/Chicago",
      action: "complete",
    }),
  });
}

function mockSupabase() {
  const rpc = vi.fn().mockResolvedValue({
    data: [{ completion_count: 1, completion_target: 2, finished_at: null }],
    error: null,
  });
  createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
    rpc,
  } as never);
  return { rpc };
}

describe("POST /api/habits/completion", () => {
  beforeEach(() => {
    createSupabaseServerClientMock.mockReset();
    ensureCompletionEventMock.mockReset();
    refreshHabitStreakMock.mockReset();
    ensureCompletionEventMock.mockResolvedValue(undefined);
    refreshHabitStreakMock.mockResolvedValue(undefined);
  });

  it("passes the CREATOR 4 AM completion day into the lifecycle rpc", async () => {
    const { rpc } = mockSupabase();

    const beforeBoundary = await POST(
      buildRequest("2026-07-22T08:59:00.000Z") as never
    );
    expect(beforeBoundary.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("set_habit_completion_day", {
      p_habit_id: habitId,
      p_completion_day: "2026-07-21",
      p_completed_at: "2026-07-22T08:59:00.000Z",
      p_is_complete: true,
    });

    const atBoundary = await POST(
      buildRequest("2026-07-22T09:00:00.000Z") as never
    );
    expect(atBoundary.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("set_habit_completion_day", {
      p_habit_id: habitId,
      p_completion_day: "2026-07-22",
      p_completed_at: "2026-07-22T09:00:00.000Z",
      p_is_complete: true,
    });
  });
});
