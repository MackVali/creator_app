import { describe, expect, it } from "vitest";
import {
  buildTargetPayload,
  createInitialTargetForm,
  derivePercentageMacroDetails,
  inferPreferredUnitsFromLocales,
  macroPercentTotal,
  prefillTargetSetupForm,
  resolveInitialTargetUnits,
  setTargetFormUnits,
  setWeightDisplay,
} from "@/lib/nutrition/targetForms";

describe("Nutrition target setup form helpers", () => {
  it("prefills profile and active goal fields without zeroing optional values", () => {
    const form = prefillTargetSetupForm({
      profile: {
        age_years: 36,
        formula_sex: "female",
        height_cm: 168,
        current_weight_kg: 72.5,
        preferred_units: "us",
        activity_level: "active",
        activity_coefficient: 1.75,
        pregnancy_status: "breastfeeding",
        adjustments_enabled: false,
      },
      activeGoal: {
        goal_type: "gain",
        goal_weight_kg: 78,
        target_rate_pct_per_week: 0.25,
        calorie_target_kcal: 2550,
        protein_target_g: 145,
        carb_target_g: 300,
        fat_target_g: 78,
        calculation_inputs: {
          macroMode: "custom_percentages",
          proteinPct: 25,
          carbPct: 45,
          fatPct: 30,
          manualMaintenanceKcal: 2400,
        },
      },
    });

    expect(form.age).toBe("36");
    expect(form.formulaInput).toBe("female");
    expect(form.units).toBe("us");
    expect(form.weight).toBe("159.8");
    expect(form.goalWeight).toBe("172");
    expect(form.activityLevel).toBe("active");
    expect(form.pregnancyStatus).toBe("breastfeeding");
    expect(form.adjustmentsEnabled).toBe(false);
    expect(form.macroMode).toBe("custom_percentages");
    expect(form.proteinPct).toBe("25");
    expect(form.carbPct).toBe("45");
    expect(form.fatPct).toBe("30");
    expect(form.bodyFatPct).toBe("");
  });

  it("keeps canonical metric state when switching units repeatedly", () => {
    let form = createInitialTargetForm();
    form = setWeightDisplay(form, "80");
    expect(form.weightKgCanonical).toBe("80");

    form = setTargetFormUnits(form, "us");
    expect(form.weight).toBe("176.4");

    form = setTargetFormUnits(form, "metric");
    expect(form.weight).toBe("80");

    form = setTargetFormUnits(form, "us");
    expect(form.weight).toBe("176.4");
  });

  it("resolves saved unit preference before unsaved state or locale", () => {
    const unsaved = createInitialTargetForm({ units: "metric" });
    expect(resolveInitialTargetUnits({ profile: { preferred_units: "us" }, unsavedForm: unsaved, localeUnits: "metric" })).toBe("us");
    expect(resolveInitialTargetUnits({ profile: { preferred_units: "metric" }, unsavedForm: createInitialTargetForm({ units: "us" }), localeUnits: "us" })).toBe("metric");
  });

  it("uses unsaved setup units before locale defaults", () => {
    expect(resolveInitialTargetUnits({ profile: null, unsavedForm: createInitialTargetForm({ units: "us" }), localeUnits: "metric" })).toBe("us");
  });

  it("defaults U.S. locales to US units and non-U.S. locales to Metric", () => {
    expect(inferPreferredUnitsFromLocales(["en-US"])).toBe("us");
    expect(inferPreferredUnitsFromLocales(["en-US", "fr-FR"])).toBe("us");
    expect(inferPreferredUnitsFromLocales(["en-GB"])).toBe("metric");
    expect(inferPreferredUnitsFromLocales(["fr-CA"])).toBe("metric");
    expect(inferPreferredUnitsFromLocales(null)).toBe("metric");
  });

  it("builds goal weight, manual maintenance, and custom percentage payloads", () => {
    const form = {
      ...createInitialTargetForm({ goalType: "lose", rate: "0.5", goalWeightKgCanonical: "70", goalWeight: "70" }),
      manualMaintenance: "2300",
      macroMode: "custom_percentages" as const,
      proteinPct: "30",
      carbPct: "40",
      fatPct: "30",
    };

    expect(buildTargetPayload(form, "America/Chicago")).toMatchObject({
      goalWeightKg: 70,
      manualMaintenanceKcal: 2300,
      macroMode: "custom_percentages",
      proteinPct: 30,
      carbPct: 40,
      fatPct: 30,
      deviceTimezone: "America/Chicago",
    });
  });

  it("derives percentage macro grams and total without rebalancing", () => {
    const form = { ...createInitialTargetForm(), calories: "2000", proteinPct: "30", carbPct: "45", fatPct: "25" };
    expect(macroPercentTotal(form)).toBe(100);
    expect(derivePercentageMacroDetails(form)).toMatchObject({
      protein: { grams: 150, calories: 600 },
      carbs: { grams: 225, calories: 900 },
    });
    expect(derivePercentageMacroDetails(form)?.fat.grams).toBeCloseTo(55.56, 2);
  });
});
