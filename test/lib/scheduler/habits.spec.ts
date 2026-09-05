import { describe, expect, it } from "vitest";

import { fetchHabitsForSchedule } from "@/lib/scheduler/habits";

function createHabitSchedulerClient() {
  const habitRows = [
    {
      id: "habit-1",
      name: "Skill Area Habit",
      habit_type: "HABIT",
      skill_id: "skill-body",
      goal_id: "goal-work",
      goal: {
        area_id: "work",
        monument_id: "goal-monument",
      },
      current_streak_days: 0,
      longest_streak_days: 0,
    },
  ];
  const areaSkillRows = [
    {
      skill_id: "skill-body",
      area_id: "body",
    },
  ];

  return {
    from(table: string) {
      if (table === "habits") {
        return {
          select() {
            return {
              eq() {
                return {
                  is() {
                    return {
                      order: async () => ({
                        data: habitRows,
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "area_skills") {
        return {
          select() {
            return {
              eq() {
                return {
                  in: async () => ({
                    data: areaSkillRows,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("fetchHabitsForSchedule", () => {
  it("populates Habit areaId from skill Area relations without replacing goalAreaId", async () => {
    const habits = await fetchHabitsForSchedule(
      "user-1",
      createHabitSchedulerClient() as never
    );

    expect(habits).toHaveLength(1);
    expect(habits[0]?.skillId).toBe("skill-body");
    expect(habits[0]?.areaId).toBe("body");
    expect(habits[0]?.goalAreaId).toBe("work");
  });
});
