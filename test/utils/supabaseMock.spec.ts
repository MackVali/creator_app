import { describe, expect, it } from "vitest";

import { createSupabaseMock } from "./supabaseMock";

describe("supabaseMock", () => {
  it("supports chained delete filters", () => {
    const { client: supabase } = createSupabaseMock();

    expect(() =>
      supabase
        .from("schedule_instances")
        .delete()
        .lt("end_utc", "2026-01-01")
        .gt("start_utc", "2025-12-31")
        .or("status.eq.canceled")
        .select()
    ).not.toThrow();
  });
});
