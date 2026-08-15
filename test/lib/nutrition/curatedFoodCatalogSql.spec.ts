import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { FOOD_BROWSE_DEPARTMENTS } from "@/lib/nutrition/foods";
import {
  CURATED_ADD_NOW_NORMALIZED_NAMES,
  CURATED_EXISTING_KEEP_NORMALIZED_NAMES,
  CURATED_EXISTING_REMOVE_NORMALIZED_NAMES,
  CURATED_OPTIONAL_LATER_NORMALIZED_NAMES,
  CURATED_RENAMED_EXISTING_NORMALIZED_NAMES,
} from "./foodCatalogCurationManifest";

const starterPath = "supabase/migrations/20260620000000_create_foods_catalog.sql";
const corePath = "supabase/migrations/20260620002000_seed_core_grocery_foods.sql";
const sharedPath = "supabase/migrations/20260719000000_seed_drinks_condiments_prepared_foods.sql";
const expansionPath = "supabase/migrations/20260731000000_expand_nutrition_food_catalog.sql";
const cleanupPath = "supabase/migrations/20260731001000_curate_nutrition_food_catalog.sql";
const searchRoutePath = "src/app/api/nutrition/foods/search/route.ts";

const cleanupSql = readFileSync(resolve(process.cwd(), cleanupPath), "utf8");
const searchRoute = readFileSync(resolve(process.cwd(), searchRoutePath), "utf8");

type SeedRow = {
  name: string;
  normalizedName: string;
  placements: string[];
  dedupeKey?: string;
};

type AddRow = SeedRow & {
  canonicalKey: string;
  servingSize: number;
  servingUnit: string;
  servingGrams: number;
  calories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
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

function parseTuple(line: string) {
  return splitTopLevelCsv(line.replace(/,$/, "").replace(/^\(/, "").replace(/\)$/, ""));
}

function parseExistingSeedRows() {
  const rows: SeedRow[] = [];
  const starterSql = readFileSync(resolve(process.cwd(), starterPath), "utf8");
  const coreSql = readFileSync(resolve(process.cwd(), corePath), "utf8");
  const sharedSql = readFileSync(resolve(process.cwd(), sharedPath), "utf8");
  const expansionSql = readFileSync(resolve(process.cwd(), expansionPath), "utf8");

  for (const line of tupleLinesBetween(starterSql, "  VALUES", ")\nINSERT")) {
    const fields = parseTuple(line);
    rows.push({
      name: parseSqlString(fields[0]),
      normalizedName: parseSqlString(fields[1]),
      placements: [],
      dedupeKey: parseSqlString(fields[11]),
    });
  }
  for (const line of tupleLinesBetween(coreSql, "  VALUES", "),\nseed_rows")) {
    const fields = parseTuple(line);
    rows.push({
      name: parseSqlString(fields[0]),
      normalizedName: parseSqlString(fields[1]),
      placements: parseSqlTextArray(fields[10]),
      dedupeKey: parseSqlString(fields[9]),
    });
  }
  for (const line of tupleLinesBetween(sharedSql, "  VALUES", "),\nseed_rows")) {
    const fields = parseTuple(line);
    rows.push({
      name: parseSqlString(fields[1]),
      normalizedName: parseSqlString(fields[2]),
      placements: [`${parseSqlString(fields[13])}|${parseSqlString(fields[14])}`],
      dedupeKey: `catalog:${parseSqlString(fields[2])}:${parseSqlNumber(fields[8])}`,
    });
  }
  for (const line of tupleLinesBetween(expansionSql, "  VALUES", "),\nseed_rows")) {
    const fields = parseTuple(line);
    rows.push({
      name: parseSqlString(fields[1]),
      normalizedName: parseSqlString(fields[2]),
      placements: parseSqlTextArray(fields[13]),
      dedupeKey: `catalog:expanded:${parseSqlString(fields[0])}:${parseSqlNumber(fields[8])}`,
    });
  }

  return rows;
}

function dedupeExistingSeedRows() {
  const rowsByName = new Map<string, SeedRow>();

  for (const row of parseExistingSeedRows()) {
    const existing = rowsByName.get(row.normalizedName);
    if (!existing) {
      rowsByName.set(row.normalizedName, row);
      continue;
    }

    rowsByName.set(row.normalizedName, {
      ...existing,
      ...row,
      placements: [...new Set([...existing.placements, ...row.placements])],
      dedupeKey: existing.dedupeKey || row.dedupeKey,
    });
  }

  return [...rowsByName.values()];
}

function parseRemovalRows() {
  return tupleLinesBetween(cleanupSql, "WITH remove_foods", "),\nhidden_foods").map((line) => {
    const fields = parseTuple(line);
    expect(fields).toHaveLength(3);
    return parseSqlString(fields[0]);
  });
}

function parseAddRows(): AddRow[] {
  return tupleLinesBetween(cleanupSql, "WITH seed_foods", "),\nseed_rows").map((line) => {
    const fields = parseTuple(line);
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

describe("curated Nutrition food catalog cleanup migration", () => {
  const existingRows = dedupeExistingSeedRows();
  const existingNames = new Set(existingRows.map((row) => row.normalizedName));
  const removeNames = parseRemovalRows();
  const addRows = parseAddRows();
  const addNames = addRows.map((row) => row.normalizedName);
  const keepNamesAfterRename = CURATED_EXISTING_KEEP_NORMALIZED_NAMES.map(
    (name) =>
      CURATED_RENAMED_EXISTING_NORMALIZED_NAMES[
        name as keyof typeof CURATED_RENAMED_EXISTING_NORMALIZED_NAMES
      ] ?? name,
  );
  const finalActiveNames = new Set([...keepNamesAfterRename, ...addNames]);

  it("keeps the approved manifest counts stable", () => {
    expect(CURATED_EXISTING_KEEP_NORMALIZED_NAMES).toHaveLength(250);
    expect(CURATED_EXISTING_REMOVE_NORMALIZED_NAMES).toHaveLength(86);
    expect(CURATED_ADD_NOW_NORMALIZED_NAMES).toHaveLength(75);
    expect(CURATED_OPTIONAL_LATER_NORMALIZED_NAMES).toHaveLength(10);
  });

  it("accounts for every one of the 336 existing canonical foods exactly once", () => {
    expect(existingRows).toHaveLength(336);
    expect(new Set(CURATED_EXISTING_KEEP_NORMALIZED_NAMES).size).toBe(250);
    expect(new Set(CURATED_EXISTING_REMOVE_NORMALIZED_NAMES).size).toBe(86);

    const manifestExisting = [
      ...CURATED_EXISTING_KEEP_NORMALIZED_NAMES,
      ...CURATED_EXISTING_REMOVE_NORMALIZED_NAMES,
    ];
    expect(new Set(manifestExisting).size).toBe(336);
    expect(new Set(manifestExisting)).toEqual(existingNames);
  });

  it("hides exactly the approved 86 built-in foods and does not hard-delete or deactivate them", () => {
    expect(removeNames).toHaveLength(86);
    expect(new Set(removeNames)).toEqual(new Set(CURATED_EXISTING_REMOVE_NORMALIZED_NAMES));
    expect(cleanupSql).toContain("ADD COLUMN IF NOT EXISTS is_catalog_visible");
    expect(cleanupSql).toContain("is_catalog_visible = false");
    expect(cleanupSql).not.toContain("is_active = false");
    expect(cleanupSql).toContain("food.created_by_user_id IS NULL");
    expect(cleanupSql).toContain("food.source = 'catalog'");
    expect(cleanupSql).toContain("food.dedupe_key LIKE 'catalog:%'");
  });

  it("inserts exactly the approved 75 foods with valid placements and nutrition", () => {
    const validPlacements = new Set(
      FOOD_BROWSE_DEPARTMENTS.flatMap((department) =>
        department.aisles.map((aisle) => `${department.label}|${aisle}`),
      ),
    );

    expect(addRows).toHaveLength(75);
    expect(new Set(addNames)).toEqual(new Set(CURATED_ADD_NOW_NORMALIZED_NAMES));
    expect(new Set(addRows.map((row) => row.canonicalKey)).size).toBe(75);

    for (const row of addRows) {
      expect(row.normalizedName).toMatch(/^[a-z0-9 ]+$/);
      expect(row.servingSize).toBeGreaterThan(0);
      expect(row.servingUnit.trim().length).toBeGreaterThan(0);
      expect(row.servingGrams).toBeGreaterThan(0);
      expect(row.calories).toBeGreaterThanOrEqual(0);
      expect(row.calories).toBeLessThanOrEqual(1000);
      expect(row.carbsG).toBeGreaterThanOrEqual(0);
      expect(row.proteinG).toBeGreaterThanOrEqual(0);
      expect(row.fatG).toBeGreaterThanOrEqual(0);
      expect(row.placements.length).toBeGreaterThan(0);
      for (const placement of row.placements) {
        expect(validPlacements.has(placement), `${row.name}: ${placement}`).toBe(true);
      }
    }
  });

  it("includes representative approved additions and excludes optional-later foods", () => {
    expect(addNames).toEqual(expect.arrayContaining([
      "salt",
      "almonds",
      "green bell pepper",
      "white onion",
      "chuck roast",
      "whole chicken",
      "vegetable broth",
      "garlic powder",
      "vanilla extract",
      "active dry yeast",
    ]));

    for (const optionalName of CURATED_OPTIONAL_LATER_NORMALIZED_NAMES) {
      expect(addNames).not.toContain(optionalName);
      expect(removeNames).not.toContain(optionalName);
    }
  });

  it("produces the approved final active canonical count without normalized-name conflicts", () => {
    expect(finalActiveNames.size).toBe(325);
    expect(finalActiveNames.has("2 milk")).toBe(false);
    expect(finalActiveNames.has("2 percent milk")).toBe(true);
    for (const removedName of CURATED_EXISTING_REMOVE_NORMALIZED_NAMES) {
      expect(finalActiveNames.has(removedName)).toBe(false);
    }
  });

  it("keeps normal food search and browse limited to active visible foods", () => {
    expect(searchRoute.match(/\.eq\("is_active", true\)/g)).toHaveLength(3);
    expect(searchRoute.match(/\.eq\("is_catalog_visible", true\)/g)).toHaveLength(3);
  });

  it("uses idempotent insertion guards and count assertions", () => {
    expect(cleanupSql).toContain("WHERE NOT EXISTS");
    expect(cleanupSql).toContain("existing.normalized_name = seed_rows.normalized_name");
    expect(cleanupSql).toContain("existing.dedupe_key = seed_rows.dedupe_key");
    expect(cleanupSql).toContain("Expected 86 hidden curated foods");
    expect(cleanupSql).toContain("Expected 75 visible curated additions");
    expect(cleanupSql).toContain("Expected 325 active visible canonical foods");
  });
});
