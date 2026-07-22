import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
    rpc,
  })),
}));

import { POST } from "@/app/api/nutrition/meal-plan/items/[id]/log/route";

const context = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };
const request = new NextRequest("http://localhost/api/nutrition/meal-plan/items/11111111-1111-4111-8111-111111111111/log", { method: "POST" });

function claim(overrides: Record<string, unknown> = {}) {
  return { data: { meal_id: "22222222-2222-4222-8222-222222222222", already_logged: false, retry_required: true, initial_log: true, result: "partially_logged", ...overrides }, error: null };
}

describe("Meal Plan log route lifecycle", () => {
  beforeEach(() => rpc.mockReset());

  it("returns a Nutrition creation failure without attempting Grocery depletion", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    expect((await POST(request, context)).status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns logged after initial creation and complete depletion", async () => {
    rpc.mockResolvedValueOnce(claim()).mockResolvedValueOnce({ data: "completed", error: null });
    const response = await POST(request, context);
    expect(await response.json()).toMatchObject({ result: "logged", groceryDepletionPending: false });
  });

  it("returns partially_logged after initial creation and incomplete depletion", async () => {
    rpc.mockResolvedValueOnce(claim()).mockResolvedValueOnce({ data: "incomplete", error: null });
    const response = await POST(request, context);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ result: "partially_logged", groceryDepletionPending: true });
  });

  it("returns retry_completed without invoking a second creation path", async () => {
    rpc.mockResolvedValueOnce(claim({ initial_log: false })).mockResolvedValueOnce({ data: "completed", error: null });
    expect(await (await POST(request, context)).json()).toMatchObject({ result: "retry_completed" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["log_meal_plan_item", "deplete_logged_meal_plan_item"]);
  });

  it("returns retry_incomplete with a concise explanation", async () => {
    rpc.mockResolvedValueOnce(claim({ initial_log: false })).mockResolvedValueOnce({ data: "incomplete", error: null });
    expect(await (await POST(request, context)).json()).toMatchObject({ result: "retry_incomplete", message: expect.stringContaining("Retry") });
  });

  it("returns already_logged without Grocery side effects", async () => {
    rpc.mockResolvedValueOnce(claim({ already_logged: true, retry_required: false, initial_log: false, result: "already_logged" }));
    expect(await (await POST(request, context)).json()).toMatchObject({ result: "already_logged", alreadyLogged: true });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("finalizes an item with no Grocery deductions directly as logged", async () => {
    rpc.mockResolvedValueOnce(claim({ retry_required: false, result: "logged" }));
    expect(await (await POST(request, context)).json()).toMatchObject({ result: "logged" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps invalid manual items unloggable", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023" } });
    const response = await POST(request, context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "This planned item cannot be logged" });
  });
});
