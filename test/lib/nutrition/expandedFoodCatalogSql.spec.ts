import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { FOOD_BROWSE_DEPARTMENTS } from "@/lib/nutrition/foods";

const expansionPath = "supabase/migrations/20260731000000_expand_nutrition_food_catalog.sql";
const expansionSql = readFileSync(resolve(process.cwd(), expansionPath), "utf8");

type CatalogSeedRow = {
  canonicalKey: string;
  name: string;
  normalizedName: string;
  servingSize: number;
  servingUnit: string;
  servingGrams: number;
  calories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  placements: string[];
};

function splitTopLevelCsv(value: string) {
  const parts: string[] = [];
  let current = "";
  let quote = false;
  let bracketDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (char === "'" && quote && next === "'") {
      current += "''";
      index += 1;
      continue;
    }

    if (char === "'") quote = !quote;
    if (!quote && char === "[") bracketDepth += 1;
    if (!quote && char === "]") bracketDepth -= 1;

    if (!quote && bracketDepth === 0 && char === ",") {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSqlString(value: string) {
  const match = value.match(/^'(.*)'$/);
  if (!match) throw new Error(`Expected SQL string literal, received ${value}`);
  return match[1].replace(/''/g, "'");
}

function parseSqlNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected SQL number, received ${value}`);
  return parsed;
}

function parseSqlTextArray(value: string) {
  const match = value.match(/^ARRAY\[(.*)\]$/);
  if (!match) throw new Error(`Expected SQL text array, received ${value}`);
  if (!match[1].trim()) return [];
  return splitTopLevelCsv(match[1]).map(parseSqlString);
}

function tupleLinesBetween(sql: string, startNeedle: string, endNeedle: string) {
  const start = sql.indexOf(startNeedle);
  const end = sql.indexOf(endNeedle, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return sql
    .slice(start, end)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("('"));
}

function parseExpansionRows(): CatalogSeedRow[] {
  return tupleLinesBetween(expansionSql, "  VALUES", "),\nseed_rows").map((line) => {
    const tuple = line.replace(/,$/, "").replace(/^\(/, "").replace(/\)$/, "");
    const fields = splitTopLevelCsv(tuple);
    expect(fields).toHaveLength(14);

    return {
      canonicalKey: parseSqlString(fields[0]),
      name: parseSqlString(fields[1]),
      normalizedName: parseSqlString(fields[2]),
      servingSize: parseSqlNumber(fields[6]),
      servingUnit: parseSqlString(fields[7]),
      servingGrams: parseSqlNumber(fields[8]),
      calories: parseSqlNumber(fields[9]),
      carbsG: parseSqlNumber(fields[10]),
      proteinG: parseSqlNumber(fields[11]),
      fatG: parseSqlNumber(fields[12]),
      placements: parseSqlTextArray(fields[13]),
    };
  });
}

function parseExistingNormalizedNames() {
  const starterSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260620000000_create_foods_catalog.sql"),
    "utf8",
  );
  const coreSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260620002000_seed_core_grocery_foods.sql"),
    "utf8",
  );
  const sharedSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260719000000_seed_drinks_condiments_prepared_foods.sql"),
    "utf8",
  );

  const existing = new Set<string>();
  for (const line of tupleLinesBetween(starterSql, "  VALUES", ")\nINSERT")) {
    existing.add(parseSqlString(splitTopLevelCsv(line.replace(/,$/, "").replace(/^\(/, "").replace(/\)$/, ""))[1]));
  }
  for (const line of tupleLinesBetween(coreSql, "  VALUES", "),\nseed_rows")) {
    existing.add(parseSqlString(splitTopLevelCsv(line.replace(/,$/, "").replace(/^\(/, "").replace(/\)$/, ""))[1]));
  }
  for (const line of tupleLinesBetween(sharedSql, "  VALUES", "),\nseed_rows")) {
    existing.add(parseSqlString(splitTopLevelCsv(line.replace(/,$/, "").replace(/^\(/, "").replace(/\)$/, ""))[2]));
  }

  return existing;
}

describe("expanded Nutrition food catalog seed", () => {
  const rows = parseExpansionRows();
  const validPlacements = new Set(
    FOOD_BROWSE_DEPARTMENTS.flatMap((department) =>
      department.aisles.map((aisle) => `${department.label}|${aisle}`),
    ),
  );

  it("adds the expected number of new generic foods", () => {
    expect(rows).toHaveLength(190);
    expect(parseExistingNormalizedNames().size).toBe(146);
  });

  it("does not duplicate canonical keys, normalized names, or previous seed names", () => {
    const existingNames = parseExistingNormalizedNames();
    expect(new Set(rows.map((row) => row.canonicalKey)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.normalizedName)).size).toBe(rows.length);
    expect(rows.filter((row) => existingNames.has(row.normalizedName))).toEqual([]);
  });

  it("uses valid browse placements and covers every existing department", () => {
    const departments = new Set<string>();

    for (const row of rows) {
      expect(row.placements.length).toBeGreaterThan(0);
      for (const placement of row.placements) {
        expect(validPlacements.has(placement), `${row.name}: ${placement}`).toBe(true);
        departments.add(placement.split("|")[0]);
      }
    }

    expect(departments).toEqual(new Set(FOOD_BROWSE_DEPARTMENTS.map((department) => department.label)));
  });

  it("keeps required serving and nutrition fields present and realistic", () => {
    for (const row of rows) {
      expect(row.name.trim()).toBe(row.name);
      expect(row.normalizedName).toMatch(/^[a-z0-9 ]+$/);
      expect(row.servingSize).toBeGreaterThan(0);
      expect(row.servingUnit.trim().length).toBeGreaterThan(0);
      expect(row.servingGrams).toBeGreaterThan(0);
      expect(row.calories).toBeGreaterThanOrEqual(0);
      expect(row.calories).toBeLessThanOrEqual(1000);
      expect(row.carbsG).toBeGreaterThanOrEqual(0);
      expect(row.proteinG).toBeGreaterThanOrEqual(0);
      expect(row.fatG).toBeGreaterThanOrEqual(0);
    }
  });

  it("includes representative searchable foods in the right browse containers", () => {
    expect(rows.find((row) => row.normalizedName === "red bell pepper")?.placements).toContain("Produce|Vegetables");
    expect(rows.find((row) => row.normalizedName === "garlic")?.placements).toContain("Produce|Vegetables");
    expect(rows.find((row) => row.normalizedName === "cod")?.placements).toContain("Meat & Seafood|Fish");
    expect(rows.find((row) => row.normalizedName === "jasmine rice")?.placements).toContain("Pantry|Rice & grains");
    expect(rows.find((row) => row.normalizedName === "frozen broccoli")?.placements).toContain("Frozen|Frozen vegetables");
    expect(rows.find((row) => row.normalizedName === "black pepper")?.placements).toContain("Condiments & Sauces|Seasonings");
  });
});
