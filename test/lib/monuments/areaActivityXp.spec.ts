import { describe, expect, it } from "vitest";

import { normalizeAreaXpEvents } from "@/lib/hooks/useMonumentActivity";

type TestXpEvent = Parameters<typeof normalizeAreaXpEvents>[0][number];

function xpEvent(overrides: Partial<TestXpEvent> & { id: string }): TestXpEvent {
  return {
    id: overrides.id,
    created_at: overrides.created_at ?? "2026-09-01T12:00:00.000Z",
    amount: overrides.amount ?? 1,
    kind: overrides.kind ?? "task",
    skill_id: overrides.skill_id ?? null,
    monument_id: overrides.monument_id ?? null,
    area_id: overrides.area_id ?? null,
    award_key: overrides.award_key ?? null,
    completion_event_id: overrides.completion_event_id ?? null,
    source: overrides.source ?? null,
    schedule_instance_id: overrides.schedule_instance_id ?? null,
  };
}

describe("normalizeAreaXpEvents", () => {
  const areaId = "area-1";
  const areaMonumentIds = new Set(["mon-1"]);
  const areaSkillIds = new Set(["skill-1"]);

  it("prefers an explicit area row over sibling skill and monument rows", () => {
    const normalized = normalizeAreaXpEvents(
      [
        xpEvent({
          id: "skill-xp",
          skill_id: "skill-1",
          completion_event_id: "completion-1",
          award_key: "sched:instance-1:task:skill:skill-1",
        }),
        xpEvent({
          id: "monument-xp",
          monument_id: "mon-1",
          completion_event_id: "completion-1",
          award_key: "sched:instance-1:task:mon:mon-1",
        }),
        xpEvent({
          id: "area-xp",
          area_id: areaId,
          completion_event_id: "completion-1",
          award_key: "sched:instance-1:task:area:area-1",
        }),
      ],
      areaId,
      areaMonumentIds,
      areaSkillIds
    );

    expect(normalized.historyEvents).toHaveLength(1);
    expect(normalized.historyEvents[0].id).toBe("area-xp");
    expect(normalized.skillMixEvents).toMatchObject([
      { id: "area-xp", skill_id: "skill-1" },
    ]);
  });

  it("uses a child skill row as the legacy fallback when no area row exists", () => {
    const normalized = normalizeAreaXpEvents(
      [
        xpEvent({
          id: "legacy-skill-xp",
          skill_id: "skill-1",
          award_key: "sched:instance-2:habit:skill:skill-1",
        }),
      ],
      areaId,
      areaMonumentIds,
      areaSkillIds
    );

    expect(normalized.historyEvents).toMatchObject([
      { id: "legacy-skill-xp", skill_id: "skill-1" },
    ]);
    expect(normalized.skillMixEvents).toMatchObject([
      { id: "legacy-skill-xp", skill_id: "skill-1" },
    ]);
  });

  it("collapses sibling skill and monument rows with the same award key base", () => {
    const normalized = normalizeAreaXpEvents(
      [
        xpEvent({
          id: "legacy-skill-xp",
          skill_id: "skill-1",
          award_key: "sched:instance-3:project:skill:skill-1",
          amount: 3,
          kind: "project",
        }),
        xpEvent({
          id: "legacy-monument-xp",
          monument_id: "mon-1",
          award_key: "sched:instance-3:project:mon:mon-1",
          amount: 3,
          kind: "project",
        }),
      ],
      areaId,
      areaMonumentIds,
      areaSkillIds
    );

    expect(normalized.historyEvents).toHaveLength(1);
    expect(normalized.historyEvents[0]).toMatchObject({
      id: "legacy-monument-xp",
      monument_id: "mon-1",
      amount: 3,
    });
    expect(normalized.skillMixEvents).toMatchObject([
      { id: "legacy-monument-xp", skill_id: "skill-1", amount: 3 },
    ]);
  });

  it("keeps rows without completion identity or award keys distinct", () => {
    const normalized = normalizeAreaXpEvents(
      [
        xpEvent({ id: "manual-1", skill_id: "skill-1" }),
        xpEvent({ id: "manual-2", monument_id: "mon-1" }),
      ],
      areaId,
      areaMonumentIds,
      areaSkillIds
    );

    expect(normalized.historyEvents.map((event) => event.id)).toEqual([
      "manual-1",
      "manual-2",
    ]);
  });
});
