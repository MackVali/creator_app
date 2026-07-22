# Executive Finding

The approved PRD can be implemented incrementally without a broad rewrite. Grocery and Nutrition already meet inside `NoteDatabaseEntrySheet` in `src/components/notes/NoteSlashTextarea.tsx`; that sheet owns the shared food-action tabs, food selection, Grocery inventory selection, saved meals, recipes, Chef catalog, barcode flow, logging, and progress preview. The full database view is owned by `NoteDatabaseFullView` in the same file.

The current Grocery **Meal Plan** is not an implemented planner. `GROCERY_EXTRA_FOOD_ACTION_TABS` adds the tab only for the Grocery database, and `renderGroceryPlanningPlaceholder("meal-plan")` renders “Plan meals from Grocery List items here later.” It has no plan data shape, actions, or persistence. Phase 1 is therefore parity with an existing placeholder plus construction of the first real shared plan—not relocation of an existing working planner.

The safe seam is a focused shared Meal Plan component and hook mounted by both Grocery and Nutrition within the existing sheet. Do not duplicate state, do not store plans in note-entry component state, and do not refactor the rest of the 17,786-line `NoteSlashTextarea.tsx`. Existing `meal_templates`/`meal_template_items` should remain the reusable definition of a meal; existing `meals`/`meal_items` should remain immutable-ish consumption logs. A dated plan assignment is a distinct concept and needs new persistence in Phase 1.

# Existing Grocery Meal Plan

## Exact files and functions

- `src/components/notes/NoteSlashTextarea.tsx`
  - `GROCERY_EXTRA_FOOD_ACTION_TABS` declares `{ id: "meal-plan", label: "Meal Plan" }`.
  - `visibleFoodActionTabs` appends that tab only when `isGroceryDatabase` is true.
  - `selectedNutritionFoodAction` owns the selected tab inside `NoteDatabaseEntrySheet` and defaults to `"search"`.
  - `renderNutritionFoodSearchField` routes Grocery `"meal-plan"` to `renderGroceryPlanningPlaceholder("meal-plan")`.
  - `renderGroceryPlanningPlaceholder` produces the entire current Meal Plan UI.

## State ownership and remounting

The tab state is local React state in `NoteDatabaseEntrySheet`. The entry sheet is conditionally mounted by `NoteDatabaseFullView`; it receives `key={entrySheetKey}`, so opening a sheet creates a fresh instance and resets tab and draft state. Switching food-action tabs within an open sheet does not remount the sheet, but closing/reopening it does. Grocery and Nutrition open separate sheet instances and cannot share component-local state.

## Persistence and data shape

There is no Grocery Meal Plan persistence and no Meal Plan data shape. The placeholder reads no records and writes no records. Do not treat `grocerySearchDrafts`, `selectedNutritionFoods`, or `meal_templates` as the current plan.

## Supported actions

The Meal Plan placeholder supports only selecting the tab. It has no add, remove, reorder, schedule, log, or inventory-projection action.

Adjacent Grocery behavior is implemented:

- Search/Browse and Scan stage one or more `GrocerySearchDraft` values in `grocerySearchDrafts`.
- `saveGrocerySearchFood` persists each staged draft through `POST /api/food-resources`.
- The Grocery list reads active `food_resources` through `GET /api/food-resources?status=active&limit=200`.
- Editing, archiving, and `setQuantity` use `PATCH /api/food-resources`.
- Barcode scanning uses `scanNutritionBarcode` in `src/lib/nutrition/barcodeScanner.ts`; native Capacitor loads `@capacitor/barcode-scanner`, while web receives a manual-lookup fallback.
- Barcode resolution uses `GET /api/nutrition/foods/barcode`; incomplete packages remain staged until package facts are reconciled.

## Limitations

- No plan records, date, Creator-day key, or shared state exist.
- The label is Grocery-only.
- The placeholder is embedded in a very large component.
- Sheet closure discards local staged UI state.
- Existing Grocery depletion is tied to saving a Nutrition log from the Grocery food-action tab, not to planning.

# Existing Nutrition Form

## Exact files and functions

- `src/components/notes/NoteSlashTextarea.tsx`
  - `NoteDatabaseFullView` renders the Nutrition database, daily progress, and entry-sheet trigger.
  - `NoteDatabaseEntrySheet` renders the Nutrition form.
  - `NUTRITION_FOOD_ACTION_TABS` declares Search, Grocery, Scan, Favs, Custom, Meals, Recipes, Recent, and Chef. It does not include Meal Plan.
  - `renderNutritionFoodSearchField` routes each selected action.
  - `NutritionDailyProgressBars` renders calories, carbs, protein, and fat.
  - `getNutritionLocalDayWindow` calculates the current 4:00 AM browser-local window.
  - `buildNutritionMealDraft`, `createNutritionMeal`, `depleteGroceryFromNutritionItems`, and `saveDatabaseEntry` implement the save flow.
- `src/lib/nutrition/meals.ts` owns request types and pure parsing/validation for meals, meal templates, and recipes.
- `src/app/api/nutrition/meals/route.ts` owns meal list/create.
- `src/app/api/nutrition/meal-templates/route.ts`, `recipes/route.ts`, `recipes/search/route.ts`, `favorites/route.ts`, `foods/search/route.ts`, and `foods/barcode/route.ts` back the adjacent tabs.

## Tabs

Nutrition exposes Search, Grocery, Scan, Favs, Custom, Meals, Recipes, Recent, and Chef. Grocery filters the same base list and adds Meal Plan. The Recipes branch in this renderer still calls a placeholder even though recipe persistence and builders exist elsewhere in the same sheet; Chef is a local catalog backed by `src/lib/nutrition/chefRecipes.ts` and Grocery availability calculations.

## Logging flow and save path

Food selection builds `NutritionSelectedFoodItem` values with serving and optional `GroceryDeductionDraft`. `saveDatabaseEntry` first normalizes a note-database entry, then `buildNutritionMealDraft` creates a snapshot-based meal request. `POST /api/nutrition/meals` authenticates, validates with `parseNutritionMealDraft`, verifies food/recipe/source ownership, and calls the transactional `create_nutrition_meal` RPC. The returned meal id is stored in the note entry as `nutritionMealId`, and the note entry is saved through the parent `onSaveEntry` callback.

If the selected action is Grocery, a successful meal create is followed by sequential `PATCH /api/food-resources` calls from `depleteGroceryFromNutritionItems`. Failures are logged but do not roll back the meal. Planning must never call this function.

## Totals and progress UI

`GET /api/nutrition/meals?start=...&end=...&limit=100` supplies saved meals. `aggregateNutritionMealTotals` sums stored meal totals; `aggregateNutritionDraftTotals` supplies the unsaved preview. `NutritionDailyProgressBars` shows saved and preview segments. Targets are hard-coded constants: 2,000 calories, 250 g carbs, 150 g protein, and 70 g fat. Bars clamp visually to 100 percent and do not yet expose planned/projected/remaining values or user targets.

## Limitations

- No Nutrition Meal Plan tab.
- Targets are constants, not profile-backed or historical.
- Creator-day calculation is browser-local and duplicated within the large component.
- The `openedAt` memo means a long-lived open sheet does not cross into the next Creator day.
- Note-entry save and meal creation can partially succeed.
- Grocery depletion is a non-transactional post-save side effect.
- Most UI/state is coupled inside one very large file and has limited focused tests.

# Shared Meal Plan Opportunity

Use a **new focused component around existing food/meal concepts**, not the current placeholder as a reusable component. Extracting only the placeholder would preserve no useful behavior. Recommended seam:

- `SharedMealPlanPanel` renders one plan for a Creator-day key and accepts a surface context (`"grocery" | "nutrition"`) only for view-specific secondary information.
- `useMealPlanDay` owns server-backed query/mutation state and is the sole UI data source for both mounts.
- Pure mapping functions reuse `NutritionMealTemplateRow`, `NutritionMealTemplateItemRow`, food snapshots, and recipe ids from `src/lib/nutrition/meals.ts` where their semantics match.

Introduce a new persistence model for dated plan assignments. Do not extend `meals`: those records mean food was consumed, drive logged totals, and may trigger inventory depletion. Do not overload `meal_templates`: those are reusable meal definitions with no day, sequence, or planned quantity. Reuse/extend existing definitions by allowing plan items to reference a nullable `meal_template_id` and future nullable `recipe_id`, while storing snapshots required by the PRD.

Code evidence: both surfaces already render through `NoteDatabaseEntrySheet`; `visibleFoodActionTabs` can expose the same tab; the existing local tab state does not survive sheet remounts; and no plan branch currently has state to duplicate. A shared server-backed hook avoids two caches becoming authorities.

# Creator Day

There are two real 4:00 AM implementations and one important daily-key divergence:

- Nutrition defines `NUTRITION_DAY_START_HOUR = 4` and `getNutritionLocalDayWindow(referenceDate)` in `src/components/notes/NoteSlashTextarea.tsx`. It uses the browser process's local `Date`, `setHours(4, 0, 0, 0)`, and local-calendar `setDate`; it does not read `profiles.timezone`. `getLocalTimezone()` separately snapshots `Intl.DateTimeFormat().resolvedOptions().timeZone` into a saved meal, so the meal's timezone and the browser-local query window normally agree but are not derived through one contract. The open sheet memoizes `openedAt`, so its window does not roll over while the sheet remains mounted.
- Scheduler/productivity code defines `GLOBAL_DAY_START_HOUR = 4`, `startOfDayInTimeZone`, `addDaysInTimeZone`, `getSchedulerDayAnchorForNow`, and `formatDateKeyInTimeZone` in `src/lib/scheduler/timezone.ts`. These accept an IANA zone, construct the 4:00 AM wall-clock instant in that zone, and are used by scheduler placement, schedule widgets, completion-event analytics, FocusPomo, notifications, and daily analytics. `ScheduleTabContent` resolves `useProfile().localTimeZone`, then browser zone, then UTC. Scheduler server jobs generally read `profiles.timezone`, with route-specific metadata/browser/UTC fallbacks.
- Habit CRUD is not fully aligned: `src/app/api/habits/completion/route.ts` writes `habit_completion_days.completion_day` using `formatDateKeyInTimeZone(completedAt, resolvedTimeZone)` without first applying `startOfDayInTimeZone`, so that persisted key changes at midnight. By contrast, `completionProductivityDayKey` in `src/lib/completions/completionEvents.ts` first applies the 4:00 AM anchor. The schedule UI's `getHours() < 4` occurrence is only `DEBUG_DAY_SHIFT` diagnostics, not another key implementation.

`profiles.timezone` was added by `supabase/migrations/20260715000100_add_timezone_column_to_profiles.sql` as nullable text. `useProfile` reads and normalizes it, but the profile edit forms' `ProfileFormData` contain name, username, DOB, city, bio, and privacy—not timezone—and repository searches found no production profile insert/update that populates the column. It is therefore null for any account not changed out of band. Current consumers choose their own null behavior: Schedule uses browser zone then UTC, scheduler jobs generally fall back to metadata or UTC, and Nutrition ignores the profile column and uses browser local time. No repository constraint proves that stored timezone strings are valid IANA names.

The scheduler primitive performs wall-clock calendar arithmetic, so Creator days spanning a daylight-saving transition are correctly 23 or 25 elapsed hours rather than a fixed 24 hours. Nutrition's browser-local arithmetic has the same duration property only for the browser zone. Fixed offsets and UTC calendar dates are not acceptable Creator-day authorities because they do not track DST or the user's intended locale.

# Creator-Day Persistence Decision

The canonical Meal Plan identity is one date-only Creator-day key per user, accompanied by an immutable interpretation snapshot. The logical plan-day fields are:

- `user_id`
- `creator_day_date` (`date`), meaning the local calendar date on which the 4:00 AM interval begins
- `timezone` (validated IANA name)
- `timezone_source` (`profile`, `device`, or `utc_fallback`)
- `boundary_hour` (`smallint`, value `4` for this version)
- `starts_at` and `ends_at` (`timestamptz`), the resolved UTC instants for the two local 4:00 AM boundaries

The authoritative zone is a valid, nonblank `profiles.timezone`. Until the product supplies a profile-timezone editor, a valid device/browser IANA zone supplied with the authenticated request is the fallback; UTC is the deterministic last resort for server-only callers. The server must validate and recalculate the key and boundaries rather than trusting client-derived timestamps. At instant `t`, resolve the wall-clock date in the selected zone; if its local time is before 04:00, subtract one calendar day; that date is `creator_day_date`. Resolve 04:00 on that date and on the following local date independently to obtain `starts_at` and `ends_at`. This preserves 23/25-hour DST days.

Enforce exactly `UNIQUE (user_id, creator_day_date)`. Timezone must not participate in identity: including it would permit two plans for the same user's named Creator day after travel or a timezone edit. Store it with boundary/timestamp snapshots for audit and historical querying. `boundary_hour = 4`, `ends_at > starts_at`, nonblank/validated-zone enforcement, and own-row/parent-own-row RLS are additional constraints, not alternate identity.

Travel does not implicitly change a plan: if the profile zone remains set, it remains authoritative regardless of device location. An explicit profile-timezone change affects resolution of newly created days; existing rows retain their stored zone/boundaries and are never rewritten. If the newly resolved date already exists, return that row rather than creating or retiming it. This provides stable history and prevents duplicate days, while accepting that an intentional timezone change can shorten or lengthen the user's transition interval.

Phase 1 should add one narrow pure utility contract, not duplicate Nutrition or scheduler logic:

```ts
type ResolveCreatorDayInput = {
  instant: Date;
  profileTimeZone?: string | null;
  deviceTimeZone?: string | null;
  boundaryHour?: number; // defaults to 4
};

type CreatorDay = {
  key: string; // YYYY-MM-DD
  timeZone: string; // validated IANA zone
  timeZoneSource: "profile" | "device" | "utc_fallback";
  boundaryHour: number;
  startsAt: Date;
  endsAt: Date;
};
```

Its responsibilities are limited to validating/falling back the zone, deriving the date key, and resolving DST-aware UTC boundaries. It must be deterministic and side-effect free; it must not fetch profiles, persist records, or decide whether an existing plan is retimed. A companion `resolveCreatorDayForKey(key, timeZone, boundaryHour)` may support selected historical dates. Phase 1 tests must cover 03:59/04:00, invalid/null zones, spring-forward and fall-back days, and profile/device zone disagreement. Existing scheduler helpers are the repository-grounded implementation precedent, but Phase 1 should expose a domain contract that Nutrition and later daily facts can share.

# Existing Data Model

The generated database surface in `src/types/supabase.ts` and relevant migrations show:

- `foods`: shared catalog identity, barcode/normalized keys, serving facts, calories/macros, source/external ids, optional creator, active flag, metadata. Authenticated users can select active rows; normal clients do not receive catalog write grants.
- `food_resources`: user-scoped inventory with optional `food_id`, name/brand, quantity/unit, location, expiration, notes, status, and metadata. It is present in generated types and APIs, but no creating migration was found in `supabase/migrations`; migration provenance must be reconciled before depending on a fresh schema.
- `meals`: user-scoped consumed/logged event with `occurred_at`, timezone, optional note/habit sources, stored macro totals, metadata, soft delete, timestamps.
- `meal_items`: child snapshots with `food_id` or nullable `recipe_id`, quantity/unit/grams, stored name/brand/macros, metadata, ordering.
- `meal_templates` and `meal_template_items`: reusable, active user-owned meal definitions with stored totals and item snapshots; item types already support food, recipe, and custom.
- `recipes` and `recipe_items`: user-owned recipe definitions and ingredient snapshots; recipe items currently support food/custom, while meal items can reference recipes.
- `nutrition_favorites`: user/item-type/item-id unique favorites for food, recipe, or meal template.
- `profiles`: `dob` and `timezone` exist alongside public/profile presentation fields. There are no authoritative height, body weight, formula sex, body fat, or activity-level columns.
- `goals`: the `weight` and `weight_boost` columns are prioritization/ranking weights, not body weight.
- schedules/events/habits: scheduling entities can represent MEAL time blocks/events, but they are not nutrition plans or nutrition targets.

Relevant RLS convention is explicit `ENABLE ROW LEVEL SECURITY`, authenticated own-row policies using `user_id = auth.uid()`, parent-ownership `EXISTS` policies for child rows, revoked default grants, narrow authenticated grants, and service-role grants. New health tables must follow own-row policies for every operation and child table.

Gaps: no meal-plan day/item, nutrition profile, immutable nutrition goal version, daily target snapshot, body-weight check-in, adjustment review/suggestion, or nutrition-day completion model exists. No present table can represent a dated shared plan without competing with the semantics of logged meals or reusable templates.

Both generated-type-shaped files are active and divergent. Most application imports use `@/types/supabase`, which resolves to `src/types/supabase.ts`; several scheduler modules/tests use `../../../types/supabase`, and `supabase/functions/scheduler_cron/index.ts` imports the root `types/supabase.ts`. The root file is therefore not unused. `src/types/supabase.ts` has the current Supabase CLI output shape (`export type Database`, `__InternalSupabase`, PostgREST version, and generated `Relationships`); the root file is an older hand-maintained `export interface Database` shape. Git history shows `src/types/supabase.ts` was originally a re-export of the root file, then commit `806a38c5` replaced it with a full CLI-shaped schema. Commit `84df94dd` manually added `food_resources` declarations to both files while adding its API, without a migration.

# Supabase Type Workflow

Phase 0.5 establishes `src/types/supabase.ts` as the authoritative generated file. The canonical command is:

```bash
supabase gen types typescript --linked --schema public > src/types/supabase.ts
```

The expected generation source is the linked remote project, not checked-in SQL and not the local database. Evidence: `supabase/.temp/project-ref` records a linked project; the README documents `supabase link`, `db pull`, and linked-project drift recovery; and the CLI-shaped file contains `food_resources`, which no checked-in migration or schema dump creates. There is no package script, CI job, or existing exact generation command, so this documented command is the new repository authority rather than a claim that automation already existed. Generated types are expected to be committed: both files have long commit histories, and `docs/migration-application-guide.md` explicitly says to commit regenerated Supabase types.

Current runtime code does depend on manual extensions: commit `84df94dd` inserted `food_resources` into both files by hand, and root-type consumers depend on a separately maintained schema. Phase 1 must first apply its migration to the linked development database, then run the canonical command, review the schema-only diff, and commit the result. Do not generate from a local reset until migration history is repaired, because a migration-only local database cannot contain `food_resources`. As a follow-up cleanup, migrate root relative imports and the edge function to the canonical generated artifact (or a generated copy produced by one script), then delete the hand-maintained duplicate. Until that cleanup lands, a schema phase must not silently edit one file and leave the other compiling against different tables; any temporary compatibility update must be explicit and mechanically derived from the canonical output.

# Migration History Integrity

No active migration, backup migration, schema dump, seed, SQL helper, or reachable branch/commit creates `public.food_resources`. `rg` finds the table only in the two type files and runtime API/UI code. `git log --all -S 'food_resources' -- supabase` returns no migration provenance, and deleted-migration history contains no food-resource filename. Commit `84df94dd` introduced the API and manually added both type declarations, but added no SQL. The strongest repository-grounded conclusion is that the deployed/linked database had the table through an out-of-band/manual remote change or an uncommitted migration; the repository cannot distinguish those two cases. It did not come from the checked-in remote-schema squashes in `supabase/migrations` or `_migrations_backup`.

Known schema from the two type files and live API contract is limited to columns `id`, `user_id`, nullable `food_id`, `name`, nullable `brand_name`, nullable `quantity`, nullable `unit`, nullable `location`, nullable `expires_on`, nullable `notes`, `status`, `metadata`, `created_at`, and `updated_at`. `food_id` has generated relationship name `food_resources_food_id_fkey` to `foods.id`; no generated relationship to `profiles` or `auth.users` is exposed. The API treats `user_id` as ownership, allows positive quantities (and zero only for depletion), allow-lists units and statuses, and stores package/count details in JSON metadata. Those are application validations, not proof of database constraints.

The repository does **not** establish the table's primary-key declaration/default, a user foreign key, database defaults/check constraints, indexes, grants, RLS enablement, or policy definitions. The optional generated `id` strongly suggests a database default and runtime addresses rows by `id`, but this is not enough to assert a primary key. Likewise, route-level `.eq("user_id", user.id)` filters do not prove RLS. These unknowns are part of the infrastructure risk and must be captured from the linked schema during repair.

A clean database created solely from `supabase/migrations` will not contain `food_resources`; seeds also do not create it. Phase 1 Meal Plan migrations should be ordinary forward-only migrations against their own new tables and against migration-backed tables such as `foods`, `meal_templates`, and `recipes`. They must not add a foreign key to or otherwise require `food_resources`, and must not include a disguised `CREATE TABLE IF NOT EXISTS food_resources` reconstruction. Inventory projection remains an API-level future concern. If a later migration genuinely needs a `food_resources` reference, the historical baseline repair must land first.

Repair decision: **Can be repaired separately but before deployment.** Phase 1's minimal plan schema does not need `food_resources`, so implementation can proceed and run against the existing linked development database. However, no release should claim reproducible migrations, run a fresh-environment integration gate, or deploy a migration that depends on inventory until a separate infrastructure change captures the actual remote definition (including indexes, constraints, grants, and RLS), reconciles migration history, and proves `supabase db reset` plus type generation. This is safer than inventing historical SQL from TypeScript declarations.

# Phase 1 Readiness

**Ready with documented infrastructure risk.** The schema/API decisions that blocked Phase 1 are now resolved:

- Creator-day identity is `(user_id, creator_day_date)` with profile-zone authority, device/UTC fallback, and stored zone/boundary/UTC snapshots.
- A narrow DST-aware utility contract and travel/timezone-change behavior are specified.
- `src/types/supabase.ts` and linked-remote generation are the established type authority; the active root duplicate is explicitly tracked for cleanup.
- No Meal Plan migration needs to reference `food_resources`, so its missing history does not block the Phase 1 schema.

The documented risk is that repository migrations cannot reproduce the current inventory table and current type generation is remote-dependent. The `food_resources` baseline repair is required before deployment/fresh-environment certification, but it is a separate infrastructure task rather than a prerequisite to begin Phase 1.

# Existing API Model

Relevant routes:

- `/api/food-resources`: authenticated GET/POST/PATCH; explicit normalization, allow-listed statuses/units/locations, package-profile reconciliation, owner filters, and `{ foodResources }`/error responses.
- `/api/nutrition/foods/search`: authenticated catalog/Grocery search and browse.
- `/api/nutrition/foods/barcode`: authenticated barcode validation, rate limiting, catalog/external resolution, and structured resolution statuses.
- `/api/nutrition/meals`: authenticated GET with before/start/end/limit and POST using a pure parser plus ownership checks and RPC transaction.
- `/api/nutrition/meal-templates`: authenticated GET/POST with parser, ownership checks, and snapshot totals.
- `/api/nutrition/recipes` and `/api/nutrition/recipes/search`: authenticated list/create/search.
- `/api/nutrition/favorites`: authenticated list/add/delete.

The common route pattern is: create a cookie-backed server Supabase client, return 500 if it is unavailable, call `auth.getUser`, return 401 when absent, validate JSON/query values, scope every query to `user.id` even with RLS, return 400 for invalid input, and log sanitized server errors before returning a generic 500. Types usually come from `Database` plus focused parser/result types in `src/lib/nutrition`.

Phase APIs should follow this structure. For multi-row plan and target writes, prefer a database function or another atomic transaction boundary rather than the recipe route’s insert-then-cleanup pattern.

# Existing User and Fitness Data

`profiles.dob` is optional and can be an authoritative birth date only after the user confirms it for nutrition use; age should always be derived as of the goal version’s effective date, not stored as a mutable profile age. `profiles.timezone` is optional and is the strongest existing timezone candidate.

No persisted height, body mass, body composition, formula sex, or activity-level field was found. Fitness tabs, plan templates, routine templates, exercise data, and selected plan setup in `NoteDatabaseEntrySheet` are workout-oriented local/catalog concepts. They do not establish nutrition activity coefficients and must not be inferred as such. Fitness “weight” occurrences refer to exercise loads or prioritization, not authoritative body weight.

The Nutrition profile should own its health-specific current values. Goal versions should snapshot every formula input used, including any confirmed DOB-derived age and weight. A future integration may offer a user-confirmed copy from another surface, but must not silently link mutable profile/fitness data into historical calculations.

# Recipes and Chef

Persisted recipes already exist through `recipes`, `recipe_items`, `src/lib/nutrition/meals.ts`, and Nutrition recipe APIs. Stored meal and meal-template items already allow nullable recipe references. `src/lib/nutrition/chefRecipes.ts` is a code-defined Chef catalog; `src/lib/nutrition/chefRecipeNutrition.ts` calculates its estimates, and the entry sheet compares Chef ingredients with loaded `food_resources`. Chef is not yet the persisted recipe authority.

Meal Plan items should support nullable `recipe_id` and nullable `meal_template_id` from the first schema, with snapshot/custom fallback so deletion or later recipe edits do not destroy history. Phase 1 need not expose recipe planning. Chef-generated builds should remain future-compatible adapters into persisted recipes/templates rather than a second plan model.

# Recommended Component Architecture

- `src/components/nutrition/SharedMealPlanPanel.tsx`: shared Grocery/Nutrition panel; compact surface-context variations only.
- `src/components/nutrition/MealPlanItemEditor.tsx`: focused add/edit UI if Phase 1 needs it.
- `src/hooks/useMealPlanDay.ts`: fetch/mutate/revalidate one Creator-day plan.
- `src/lib/nutrition/mealPlans.ts`: request/response types, parsers, snapshot mapping, and planned totals.
- `src/lib/creatorDay.ts`: the only 4:00 AM timezone-aware boundary/key implementation.
- Later: `src/lib/nutrition/targets.ts`, `src/lib/nutrition/weightTrends.ts`, and `src/lib/nutrition/adaptiveSuggestions.ts` as pure tested engines.

Keep `NoteSlashTextarea.tsx` changes surgical: include Meal Plan in the Nutrition-visible tab list, import/mount `SharedMealPlanPanel`, pass surface context and resolved Creator-day identity, and delete the Meal Plan placeholder branch only after parity. Do not relocate unrelated search, barcode, Chef, Fitness, or note-database code.

The current entry form is a centered modal (`fixed inset-0`, `role="dialog"`, `aria-modal`, `max-h-[88vh]`, `max-w-xl`) rather than a mobile bottom sheet. The builder uses a bottom-sheet layout on small screens. Shared plan UI must fit the existing scroll/keyboard/touch constraints and must persist state server-side so dialog remounting is harmless. Preserve native barcode behavior and avoid introducing web-only gesture assumptions.

# Recommended Data Architecture

- `foods`: **reuse existing table** as catalog identity.
- `food_resources`: **reuse existing table** for inventory; do not write/deplete during planning.
- `meal_templates`/`meal_template_items`: **reuse existing tables** for reusable meal definitions.
- `recipes`/`recipe_items`: **reuse existing tables** and keep references nullable.
- `meals`/`meal_items`: **reuse existing tables** only for consumed/logged nutrition.
- Meal plan days: **new table** keyed by user plus Creator-day local date, with timezone/boundary metadata and flexible-plan mode.
- Meal plan items: **new table** belonging to a plan day, ordered, optionally referencing a meal template or recipe, with quantity and nutrition snapshot; do not use a logged `meal_id` as the plan identity.
- Nutrition profiles: **new table**, user-scoped current inputs/preferences and suggestion pause state; optionally reference profile DOB provenance without making public profile fields the health record.
- Nutrition goal versions: **new immutable table** containing formula version, full input snapshot, suggested and accepted/manual targets, rationale, and effective interval.
- Daily nutrition targets: **new table** with one historical snapshot per Creator day and optional temporary override fields.
- Weight check-ins: **new table** keyed to Creator day with measured timestamp, unit-normalized value, timezone, and optional note.
- Adjustment reviews/suggestions: **new table** preserving evidence window, data-quality result, proposed delta, status, and accepted goal-version reference.
- Nutrition-day completion: preferably **new explicit table or immutable daily fact** once completion semantics are finalized; do not infer historical completeness from mutable current logs.

No migrations are created in Phase 0.

# Risks

- **Duplicated Meal Plan state:** two local implementations would drift. Mitigate with one persisted model, component, hook, and API contract.
- **Creator-day disagreement:** current browser-local logic is embedded and schedule logic is separate. Centralize before plan date keys are written.
- **Large-component state coupling:** adding more state directly to `NoteSlashTextarea.tsx` will worsen remount and regression risk. Keep the seam focused.
- **Grocery depletion regressions:** current depletion runs after logged meal creation. Ensure all plan operations bypass it; add negative tests.
- **Historical target mutation:** reading current profile/goal values for old days would rewrite history. Immutable goal versions and daily snapshots are mandatory.
- **Mobile remounting:** the modal is keyed and conditionally mounted. Draft UI must survive via server state or intentional local recovery.
- **RLS omissions:** every health and child table needs explicit own-row or parent-ownership policy plus route scoping.
- **Sensitive health-data logging:** existing `console.error` patterns sometimes include ids/context. Never log profile measurements, DOB, weight, targets, meal contents, or adjustment evidence.
- **Generated-type breakage:** duplicate/stale generated type files can make migrations compile incorrectly. Establish and run one generation workflow in every schema phase.
- **Partial save/depletion:** note save, meal RPC, and inventory PATCH are separate transactions. Phase 1 must not deepen this coupling.
- **DST/timezone changes:** a local date alone is insufficient; preserve resolved zone and boundary snapshot for historical interpretation.

# Open Decisions

Resolved in Phase 0.5: Creator-day timezone/fallback, stored interpretation, travel behavior, plan-day uniqueness, canonical generated type file/command/source, and the `food_resources` repair timing. The remaining non-blocking product choice is the minimum Phase 1 item picker: use existing meal templates and individual foods with nutrition snapshots; retain nullable recipe compatibility but leave recipe/Chef controls out of Phase 1.

Infrastructure follow-ups are decisions already made, not open architecture questions: consolidate all imports on `src/types/supabase.ts`, and repair the real linked `food_resources` baseline before deployment.

# Phased Implementation Map

## Phase 1 — Shared Meal Plan Tab Parity

- **Objective:** expose Meal Plan in Nutrition and Grocery using one persisted Creator-day plan and the same shared component/hook.
- **Files likely involved:** `NoteSlashTextarea.tsx`; new `SharedMealPlanPanel.tsx`, `useMealPlanDay.ts`, `mealPlans.ts`, and shared Creator-day module; new plan API route; Supabase types and migration.
- **Schema work:** new plan-day and plan-item tables, indexes, constraints, nullable template/recipe references, snapshots, RLS, grants.
- **API work:** authenticated get/upsert/update/delete/reorder contract scoped to one Creator day; atomic multi-row writes.
- **UI work:** replace Grocery placeholder, add Nutrition tab, add/remove/reorder planned items, surface-context summaries, loading/empty/error states.
- **Testing requirements:** Creator-day/DST tests; parser/API auth/ownership/RLS tests; shared-state parity; remount/refetch; planning never creates `meals` or PATCHes inventory; mobile dialog tests.
- **Dependencies:** resolve timezone/day uniqueness and type workflow; validate migration baseline.
- **Explicit exclusions:** calorie target/profile engine, progress targets, weight, adaptations, Chef/ingredient projection, logging-on-plan.
- **Completion criteria:** both tabs read/write identical records; reload/remount persists; planning neither logs nor depletes; no duplicated plan state.
- **Recommended commit boundary:** one reviewable commit (or schema/API then UI/tests commits in one Phase 1 PR) ending with parity fully green.

## Phase 2 — Nutrition Profile and Target Engine

- **Objective:** profile setup, explainable Mifflin–St Jeor targets, macros, manual overrides, immutable goal versions, and daily snapshots.
- **Files likely involved:** new pure `targets.ts` and tests, profile/target components and hook, profile/preview/goal/daily-target API routes, shared Creator-day module.
- **Schema work:** nutrition profile, immutable goal versions, daily target snapshots, constraints/RLS; preserve formula/version/input snapshots.
- **API work:** profile read/update, non-persisting preview, goal-version creation, current/day target, temporary daily override.
- **UI work:** first-use setup, calculation explanation, BMI secondary context, manual target/reset controls, safety language.
- **Testing requirements:** formula examples, unit conversions, age/pediatric and pregnancy gates, boundaries, macro-energy validation/property tests, immutable-history/RLS/API tests.
- **Dependencies:** Phase 1 Creator-day authority and generated-type workflow.
- **Explicit exclusions:** logged/planned progress composition, trend computation, adaptive proposals.
- **Completion criteria:** deterministic versioned targets and snapshots meet PRD safety/acceptance criteria; manual mode remains first-class.
- **Recommended commit boundary:** pure engine/tests; schema/API; UI integration as independently reviewable commits within one phase.

## Phase 3 — Daily Progress

- **Objective:** show logged, planned, projected, and remaining calories/macros for the same Creator day.
- **Files likely involved:** `NutritionDailyProgressBars` extraction/replacement, shared plan hook/types, meal query API, daily-target hook, Creator-day module.
- **Schema work:** normally none beyond Phases 1–2; add only indexed query support proven necessary.
- **API work:** composed daily summary or coordinated target/plan/log endpoints with stable response types.
- **UI work:** target-driven bars, neutral over-target behavior, planned versus consumed legends, incomplete-data states.
- **Testing requirements:** aggregation math, missing nutrients, over-target values, plan edits/log updates, 4:00 AM/DST/timezone, accessibility meters.
- **Dependencies:** persisted plans and daily snapshots.
- **Explicit exclusions:** weight and adaptive recommendations.
- **Completion criteria:** every displayed category reconciles to stored plan/log/target data without treating plan as consumption.
- **Recommended commit boundary:** pure aggregation/API then progress UI/tests.

## Phase 4 — Weight Check-ins and Trends

- **Objective:** capture weight safely, compute rolling trends, preserve nutrition-day completion, and show progress without reacting to one measurement.
- **Files likely involved:** new weight/trend pure modules, check-in and trend APIs/hooks/components, Nutrition progress card.
- **Schema work:** weight check-ins and explicit daily completion facts with RLS/indexes.
- **API work:** create/list weight, mark/read nutrition-day completeness, trend summary.
- **UI work:** unit-aware check-in, rolling-average chart/card, sparse-data messaging.
- **Testing requirements:** unit conversion, same-day policy, rolling averages, sparse/outlier windows, Creator-day attribution, privacy/RLS.
- **Dependencies:** shared Creator day and target snapshots.
- **Explicit exclusions:** generating or applying target changes.
- **Completion criteria:** trend and completeness are reproducible from historical facts and meet minimum-evidence rules.
- **Recommended commit boundary:** storage/API; pure trend engine; UI/tests.

## Phase 5 — Adaptive Suggestions

- **Objective:** conservative hold/increase/reduce/maintenance-break suggestions with explicit acceptance, dismissal, pause, and new goal versions.
- **Files likely involved:** new `adaptiveSuggestions.ts`, review APIs, suggestion card, goal-version service.
- **Schema work:** adjustment reviews/suggestions with evidence snapshot, status, cooldown, and accepted-version linkage; profile pause fields if not already present.
- **API work:** preview/review, accept atomically by creating a new immutable goal version, dismiss, pause/resume.
- **UI work:** calm explanation, data-quality failures, hold state, confirmation, history.
- **Testing requirements:** every goal mode, insufficient data, 14-day gate, max increments/safety floors, accept/dismiss idempotency, no automatic mutation, RLS.
- **Dependencies:** Phases 2 and 4 with sufficient historical facts.
- **Explicit exclusions:** automatic application, wearable expenditure, diagnosis.
- **Completion criteria:** no persistent change without confirmation; accepted suggestions create versions; cooldown and data-quality gates are enforced server-side.
- **Recommended commit boundary:** pure engine/tests; schema/API; UI/acceptance tests.

## Phase 6 — Recipes and Inventory Intelligence

- **Objective:** connect persisted recipes and Chef-compatible plan items to missing ingredients and non-destructive Grocery projections.
- **Files likely involved:** recipe/meal-plan adapters, Chef modules, shared panel, Grocery projection components/APIs.
- **Schema work:** extend plan references/snapshots only if Phase 1 compatibility fields are insufficient; optional projection/cache model only with evidence.
- **API work:** recipe-to-plan, ingredient gap, inventory projection; actual depletion remains logging-only.
- **UI work:** recipe plan items, Chef-to-plan flow, missing-ingredient actions, projected-versus-on-hand display.
- **Testing requirements:** recipe edits/deletes preserve snapshots, unit conversion, partial inventory, missing ingredients, projection versus actual depletion, both surfaces stay consistent.
- **Dependencies:** shared plan, stable recipes, reliable inventory measurement metadata.
- **Explicit exclusions:** automatic seven-day generation, planning-triggered depletion, separate Chef plan model.
- **Completion criteria:** one recipe-capable plan works in both surfaces; projections never mutate inventory; actual logging remains the only depletion trigger.
- **Recommended commit boundary:** adapters/API; shared UI; projection/depletion regression tests.
