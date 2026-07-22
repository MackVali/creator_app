import { describe, expect, it } from "vitest";

import {
  FOOD_BROWSE_DEPARTMENTS,
  getFoodBrowsePlacements,
  getFoodPrimaryGroceryDepartment,
  mapOpenFoodFactsCategoriesToBrowsePlacement,
  mapOpenFoodFactsProductToFoodInsert,
  mergeOpenFoodFactsFoodInsertWithExisting,
} from "@/lib/nutrition/foods";

describe("food grocery department selection", () => {
  it.each([
    ["Chicken breast", "Meat & Seafood"],
    ["Cereal", "Pantry"],
  ])("classifies %s by its first physical placement", (name, department) => {
    expect(getFoodPrimaryGroceryDepartment({ name })).toBe(department);
  });

  it("prefers linked catalog physical metadata over stale saved metadata", () => {
    const food = {
      name: "Tuna",
      catalog_metadata: {
        browse: [
          { department: "Everyday", aisle: "High protein regulars" },
          { department: "Meat & Seafood", aisle: "Fish" },
        ],
      },
      metadata: {
        browse: [{ department: "Everyday", aisle: "Quick snacks" }],
      },
    };

    expect(getFoodPrimaryGroceryDepartment(food)).toBe("Meat & Seafood");
    expect(getFoodBrowsePlacements(food)[0]?.department).toBe("Everyday");
  });

  it("uses a saved physical placement when linked metadata has none", () => {
    expect(
      getFoodPrimaryGroceryDepartment({
        name: "Custom staple",
        catalog_metadata: {
          browse: [{ department: "Everyday", aisle: "Breakfast basics" }],
        },
        metadata: {
          browse: [{ department: "Pantry", aisle: "Canned foods" }],
        },
      }),
    ).toBe("Pantry");
  });

  it.each([
    ["Produce", "Fruit"],
    ["Dairy & Eggs", "Milk"],
    ["Frozen", "Frozen vegetables"],
    ["Snacks", "Crackers"],
    ["Drinks", "Water"],
    ["Condiments & Sauces", "Sauces"],
    ["Prepared", "Ready meals"],
  ])("keeps %s foods in their physical department", (department, aisle) => {
    expect(
      getFoodPrimaryGroceryDepartment({
        name: `Representative ${department} food`,
        metadata: { browse: [{ department, aisle }] },
      }),
    ).toBe(department);
  });

  it("leaves genuinely unresolved custom foods unclassified", () => {
    expect(getFoodPrimaryGroceryDepartment({ name: "My custom food" })).toBeNull();
  });
});

describe("Open Food Facts Grocery placement", () => {
  it.each([
    [["en:breakfast-cereals"], "Pantry", "Rice & grains"],
    [["en:canned-tuna", "en:canned-foods"], "Meat & Seafood", "Fish"],
    [["en:yogurts"], "Dairy & Eggs", "Yogurt"],
    [["en:frozen-pizzas", "en:pizzas"], "Frozen", "Frozen meals"],
    [["en:potato-chips"], "Snacks", "Chips"],
    [["en:sodas"], "Drinks", "Soda"],
    [["en:ketchups"], "Condiments & Sauces", "Sauces"],
    [["en:refrigerated-meals"], "Prepared", "Ready meals"],
  ])("maps %j to %s / %s", (categoriesTags, department, aisle) => {
    expect(mapOpenFoodFactsCategoriesToBrowsePlacement({ categories_tags: categoriesTags }))
      .toEqual({ department, aisle });
  });

  it("uses normalized category names only when category tags do not classify", () => {
    expect(mapOpenFoodFactsCategoriesToBrowsePlacement({
      categories_tags: ["fr:produits-alimentaires"],
      categories: "Refrigerated meals",
    })).toEqual({ department: "Prepared", aisle: "Ready meals" });
  });

  it.each([
    [["en:food", "en:groceries"]],
    [["en:pizzas"]],
    [["en:canned-products"]],
  ])("leaves unknown or ambiguous categories unresolved: %j", (categoriesTags) => {
    expect(mapOpenFoodFactsCategoriesToBrowsePlacement({ categories_tags: categoriesTags }))
      .toBeNull();
  });

  it("returns only authoritative department and aisle pairs", () => {
    const validPairs = new Set(FOOD_BROWSE_DEPARTMENTS.flatMap((department) =>
      department.aisles.map((aisle) => `${department.label}:${aisle}`),
    ));
    const representativeTags = [
      "en:fruits", "en:chicken", "en:yogurts", "en:cereals", "en:frozen-meals",
      "en:chips", "en:sodas", "en:ketchups", "en:ready-meals",
    ];

    for (const category of representativeTags) {
      const placement = mapOpenFoodFactsCategoriesToBrowsePlacement({ categories_tags: [category] });
      expect(placement).not.toBeNull();
      expect(validPairs.has(`${placement?.department}:${placement?.aisle}`)).toBe(true);
    }
  });

  const makeExternalInsert = (categoriesTags: string[] = ["en:yogurts"]) =>
    mapOpenFoodFactsProductToFoodInsert({
      code: "012345678905",
      product_name: "Vanilla yogurt",
      categories_tags: categoriesTags,
      quantity: "4 x 100 g",
      nutriments: {
        "energy-kcal_serving": 120,
        carbohydrates_serving: 18,
        proteins_serving: 7,
        fat_serving: 2,
      },
      serving_size: "100 g",
    }, { barcode: "012345678905" });

  it("adds mapped browse metadata to a new external barcode food", () => {
    const insert = makeExternalInsert();
    expect(insert?.metadata).toMatchObject({
      browse: [{ department: "Dairy & Eggs", aisle: "Yogurt" }],
    });
  });

  it("leaves a new unclassifiable external food unresolved", () => {
    const insert = makeExternalInsert(["en:food"]);
    expect(insert?.metadata).not.toHaveProperty("browse");
  });

  it("preserves seeded browse metadata while refreshing nutrition and package metadata", () => {
    const insert = makeExternalInsert();
    expect(insert).not.toBeNull();
    const merged = mergeOpenFoodFactsFoodInsertWithExisting(insert!, {
      id: "11111111-1111-4111-8111-111111111111",
      metadata: {
        browse: [
          { department: "Everyday", aisle: "High protein regulars" },
          { department: "Meat & Seafood", aisle: "Fish" },
        ],
        catalog_note: "seeded",
        nutrition_per_serving: { calories: 80 },
        net_weight: "old",
      },
    });

    expect(merged.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(merged.metadata).toMatchObject({
      browse: [
        { department: "Everyday", aisle: "High protein regulars" },
        { department: "Meat & Seafood", aisle: "Fish" },
      ],
      catalog_note: "seeded",
      nutrition_per_serving: { calories: 120 },
      net_weight: "4 x 100 g",
    });
  });
});
