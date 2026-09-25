import { describe, expect, it } from "vitest";

import {
  getCanonicalXpAwardBase,
  sumCanonicalXp,
} from "@/lib/xp/canonicalXp";

describe("canonical XP aggregation", () => {
  it("strips attribution suffixes from award keys", () => {
    expect(
      getCanonicalXpAwardBase(
        "sched:abc:habit:cycle:1:skill:skill-1"
      )
    ).toBe("sched:abc:habit:cycle:1");

    expect(
      getCanonicalXpAwardBase(
        "sched:abc:habit:cycle:1:mon:monument-1"
      )
    ).toBe("sched:abc:habit:cycle:1");

    expect(
      getCanonicalXpAwardBase(
        "sched:abc:habit:cycle:1:area:work"
      )
    ).toBe("sched:abc:habit:cycle:1");
  });

  it("counts one completion once across skill, monument, and area attribution rows", () => {
    expect(
      sumCanonicalXp([
        {
          id: "1",
          amount: 1,
          award_key: "sched:abc:habit:cycle:1:skill:skill-1",
          completion_event_id: "completion-1",
        },
        {
          id: "2",
          amount: 1,
          award_key: "sched:abc:habit:cycle:1:mon:monument-1",
          completion_event_id: "completion-1",
        },
        {
          id: "3",
          amount: 1,
          award_key: "sched:abc:habit:cycle:1:area:work",
          completion_event_id: "completion-1",
        },
        {
          id: "4",
          amount: 1,
          award_key: "sched:abc:habit:cycle:1:area:creation",
          completion_event_id: "completion-1",
        },
      ])
    ).toBe(1);
  });

  it("preserves award amounts while deduping attribution rows", () => {
    expect(
      sumCanonicalXp([
        {
          id: "1",
          amount: 3,
          award_key: "sched:project:project:cycle:1:skill:skill-1",
          completion_event_id: "completion-1",
        },
        {
          id: "2",
          amount: 3,
          award_key: "sched:project:project:cycle:1:area:work",
          completion_event_id: "completion-1",
        },
      ])
    ).toBe(3);
  });

  it("sums separate completions normally", () => {
    expect(
      sumCanonicalXp([
        {
          id: "1",
          amount: 1,
          award_key: "sched:first:habit:cycle:1:area:work",
          completion_event_id: "completion-1",
        },
        {
          id: "2",
          amount: 1,
          award_key: "sched:second:habit:cycle:1:area:body",
          completion_event_id: "completion-2",
        },
        {
          id: "3",
          amount: 1,
          award_key: "habit:third:day:2026-09-25:cycle:1:area:creation",
          completion_event_id: "completion-3",
        },
      ])
    ).toBe(3);
  });

  it("does not count a fully reversed logical award", () => {
    expect(
      sumCanonicalXp([
        {
          id: "1",
          amount: 1,
          award_key: "sched:abc:habit:cycle:1:skill:skill-1",
          completion_event_id: "completion-1",
        },
        {
          id: "2",
          amount: 1,
          award_key: "sched:abc:habit:cycle:1:area:work",
          completion_event_id: "completion-1",
        },
        {
          id: "3",
          amount: -1,
          award_key: "reverse:sched:abc:habit:cycle:1:skill:skill-1",
          completion_event_id: "completion-1",
        },
        {
          id: "4",
          amount: -1,
          award_key: "reverse:sched:abc:habit:cycle:1:area:work",
          completion_event_id: "completion-1",
        },
      ])
    ).toBe(0);
  });

  it("falls back to completion identity when an award key is missing", () => {
    expect(
      sumCanonicalXp([
        {
          id: "1",
          amount: 2,
          award_key: null,
          completion_event_id: "completion-1",
        },
        {
          id: "2",
          amount: 2,
          award_key: null,
          completion_event_id: "completion-1",
        },
      ])
    ).toBe(2);
  });
});
