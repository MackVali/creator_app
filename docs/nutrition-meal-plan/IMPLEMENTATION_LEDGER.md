# Project

Nutrition Meal Plan and Adaptive Nutrition Targets

# Source of Truth

[Approved PRD](./PRD.md)

Every future Codex session must read both the PRD and this ledger before editing.

# Current Phase

`Phase 2A — Nutrition Profile and Target Setup Completion`

# Current Status

`Phase 2A complete with manual SQL pending; authenticated persistence and real-app target setup verification remain post-SQL prerequisites`

# Phase 2A Completion Handoff (2026-07-22)

## Classification

`Phase 2A complete with manual SQL pending`

Codex completed the remaining local Phase 2A setup behavior without running Supabase commands, authenticating to Supabase, applying migrations, generating linked types, or beginning Phase 2B Daily Progress. The canonical SQL remains pending Mack's manual execution on `VALI-v19`.

## Resolved UX gaps

- Saved Nutrition profile and active goal values now prefill the setup sheet, including age, calculation setting, height, weight, preferred units, activity level, body-fat percentage, pregnancy/breastfeeding status, adjustments-enabled state, goal type/rate/weight, manual maintenance, manual calories/macros, and saved macro strategy.
- Unit conversion now uses canonical metric state for height, weight, and goal weight so reopening or switching Metric/U.S. customary does not compound conversions. Missing optional fields remain empty.
- Optional goal weight is exposed only for Lose and Gain, submitted in kilograms, stored in immutable goal versions, and shown in preview/calculation details when present.
- `Manual maintenance estimate` is available in calculated and manual flows with the approved supporting copy, a restore-calculated action, preview/detail labels, and calculation-input persistence as `maintenanceSource: manual_estimate`.
- `Current nutrition considerations` exposes `none`, `pregnant`, and `breastfeeding`. Pregnant or breastfeeding disables automatic Lose preview/save while manual targets remain available through existing engine rules.
- Suggested grams, custom grams, and custom percentages are all configurable. Percentage macros show live total, derived grams, and derived calorie contribution without rebalancing.
- Browser `prompt()` daily override was removed. A CREATOR sheet now edits calories, protein, carbohydrates, fat, and optional reason for one Creator day only.
- Daily override save uses the existing daily-target PATCH API, prevents repeated submit, shows inline validation errors, refreshes the summary, and supports restoring the day to goal-version values.
- Edit profile is explicit and profile-only. It does not create a goal version or mutate daily targets, warns that the active target is unchanged, and offers `Recalculate goal` after save.
- Update goal remains explicit: load current profile/goal values, preview server-calculated values, then save one new immutable goal version.
- Active target summary now shows calories, macros, goal type/rate, estimated maintenance, goal weight where present, source, selected Creator day, last updated date, and actions for View calculation, Edit profile, Update goal, and Daily override.

## Completed input model

The setup flow now supports age, calculation setting, height, current weight, preferred units, activity level, goal type, goal rate, optional goal weight, optional body-fat percentage, manual maintenance, pregnancy/breastfeeding status, suggested grams, custom grams, custom percentages, manual calorie target, and manual macro targets.

## API and persistence behavior

- `GET /api/nutrition/profile` already returns profile plus active goal for prefill.
- `PUT /api/nutrition/profile` now validates and saves profile fields directly without requiring a target preview or creating a goal version.
- Target preview and goal creation continue to recalculate authoritatively on the server.
- Goal creation now persists macro grams, macro percentages, manual maintenance source/value, goal weight, and other completed setup inputs inside `calculation_inputs`.
- `PATCH /api/nutrition/targets/:id` now supports a one-day reset to the linked goal-version values and allows intentional daily macro/calorie mismatch only with explicit confirmation.
- No arbitrary client calculation result is trusted for permanent goals.
- Sensitive pregnancy/breastfeeding values are not added to analytics or ordinary logs.

## SQL bundle

- Canonical manual SQL path: `supabase/manual/20260722_install_nutrition_profile_targets.sql`.
- No required column was missing. The existing bundle already supports profile fields, goal weight, immutable calculation input JSON, daily overrides, and nullable override reasons.
- No new partial Phase 2A SQL file was created.
- The static SQL tests remain pointed at the same canonical bundle.
- SQL remains pending Mack's manual execution.

## Changed files in this completion pass

- `src/lib/nutrition/targets.ts`
- `src/lib/nutrition/targetApi.ts`
- `src/lib/nutrition/targetForms.ts`
- `src/app/api/nutrition/profile/route.ts`
- `src/app/api/nutrition/targets/[id]/route.ts`
- `src/components/nutrition/NutritionTargetPanel.tsx`
- `test/lib/nutrition/targets.spec.ts`
- `test/lib/nutrition/targetForms.spec.ts`
- `test/lib/nutrition/nutritionTargetUiStatic.spec.ts`
- `docs/nutrition-meal-plan/IMPLEMENTATION_LEDGER.md`

## Preserved unrelated worktree changes

Pre-existing Focus, Fitness, Habit, Grocery, Nutrition, and Meal Plan worktree changes were not reverted. The tracked unrelated files shown by `git status` remain separate from this Phase 2A completion pass.

## Verification

- `pnpm exec vitest run test/lib/nutrition/targets.spec.ts test/lib/nutrition/targetForms.spec.ts test/lib/nutrition/nutritionTargetSql.spec.ts test/lib/nutrition/nutritionTargetUiStatic.spec.ts` - passed, 4 files and 27 tests.
- Focused ESLint over the changed Phase 2A library, route, component, and test files - passed with no findings.
- `pnpm exec tsc --noEmit --pretty false 2>&1 | rg 'src/(lib/nutrition/(targets|targetApi|targetForms)|components/nutrition/NutritionTargetPanel|app/api/nutrition/(profile|goals|targets))|test/lib/nutrition/(targets|targetForms|nutritionTargetSql|nutritionTargetUiStatic)' || true` - no focused diagnostics.
- `git diff --check` - passed.

## Unresolved environment verification

- SQL was not installed by Codex.
- Authenticated persistence, RLS execution, and live `VALI-v19` behavior were not verified by Codex.
- Interactive mobile browser/device verification was not performed in this environment.
- Generated Supabase types were not regenerated.

## Manual installation and test step

`pbcopy < supabase/manual/20260722_install_nutrition_profile_targets.sql`

After Mack manually runs the SQL on `VALI-v19`, perform one real-app target setup test covering saved profile prefill, update goal, edit profile, daily override, and restore daily target.

## Phase 2B boundary

Phase 2B remains Daily Progress. Do not begin logged-versus-target progress bars, planned/projected/remaining composition, or adaptive adjustment work until manual SQL and real-app target setup verification are accepted.

# Phase 2A Handoff (2026-07-22)

## Classification

`Phase 2A incomplete`

Phase 1 was visually confirmed working by Mack in the real app, and the canonical Phase 1 Meal Plan SQL was manually installed on `VALI-v19`. Phase 2A now has a local, independently reviewable foundation, but it is not classified complete because the full requested persistence/API/UI test matrix and several setup UX options remain unfinished. No Supabase command, authentication, migration, remote SQL, generated-type command, or remote schema change was run by Codex.

## Calculation architecture

- `src/lib/nutrition/targets.ts` is the pure authoritative target module. The stable calculation version is `nutrition-target-v1`; saved timestamps can be supplied for deterministic reproduction.
- Mifflin–St Jeor uses the selected male or female equation constant. Resting and maintenance raw values are preserved, while displayed maintenance and final calories round to the nearest 10 kcal.
- Behavior-based activity coefficients are Sedentary 1.40, Light 1.50, Moderate 1.60, Active 1.75, and Very active 1.90.
- Lose and Gain use percentage-of-weight provisional deltas with the approved 20%/750 kcal deficit and 15%/500 kcal surplus caps. Maintain and Recomposition start with zero delta.
- BMI is labeled as screening context and adult category labels are suppressed before age 20.
- Suggested macros assign protein and fat first and carbohydrate from remaining calories. Defaults are Maintain 1.6/0.8 g/kg, Lose 1.8/0.7 g/kg, Gain 1.6/0.8 g/kg, and Recomposition 1.8/0.8 g/kg, with the 20% fat floor. Custom grams and percentages are validated against ±25 kcal or ±1%.
- Automatic under-18 targets and pregnancy/breastfeeding deficits are blocked; manual targets remain available. Automatic targets under 1,200 are blocked and targets under 1,500 require the low-calorie confirmation input.

## Persistence architecture and manual SQL

- Canonical manually runnable file: `supabase/manual/20260722_install_nutrition_profile_targets.sql`.
- The one-transaction bundle creates `nutrition_profiles`, immutable `nutrition_goal_versions`, and historical `daily_nutrition_targets`; it uses only `auth.users(id)` and the feature-owned goal-version relationship.
- It adds owner-only RLS, grants, active-goal and daily lookup indexes, `(user_id, creator_day_date)` uniqueness, a narrow updated-at helper, an immutable-goal trigger, and an advisory-lock-protected `save_nutrition_goal_version` rollover function.
- Goal rollover closes the previous active version and inserts a new version. Today's existing daily snapshot is not rewritten. New days snapshot the currently active goal. Daily overrides update one daily row only.
- The SQL never creates or references `food_resources`, `meal_templates`, or `recipes`.
- SQL is pending Mack's manual execution on `VALI-v19`; it was not applied or executed by Codex.

## API contracts

- `GET /api/nutrition/profile` returns the current Nutrition profile and active goal. `PUT` updates profile inputs without replacing the active goal.
- `POST /api/nutrition/targets/preview` validates and calculates authoritatively without persistence.
- `POST /api/nutrition/goals` recalculates server-side and invokes the narrow atomic rollover function to save the profile, immutable version, and today's snapshot.
- `GET /api/nutrition/targets?creator_day_date=YYYY-MM-DD&device_timezone=IANA` returns an existing snapshot or initializes a new date from the active goal using the shared Creator-day resolver.
- `PATCH /api/nutrition/targets/:id` applies a validated one-day calorie/macro override without modifying the goal version.
- Client calculation JSON is never accepted as authoritative or stored directly.

## Target setup UI

- `NutritionTargetPanel` is mounted only above the Nutrition view of the existing shared Meal Plan panel; Grocery and Meal Plan behavior remain unchanged.
- It includes the approved empty-state copy, suggested and manual entry points, equation wording, metric/U.S. customary conversion, behavior-based activity choices, goal/rate selection, authoritative preview, BMI/resting/maintenance/delta/macros/explanations, save, active summary, calculation disclosure, update/profile actions, and a one-day override action.
- Remaining UI gaps before completion: explicit custom-percentage setup controls, optional goal-weight/manual-maintenance controls in the rendered setup form, pregnancy/breastfeeding collection, saved-profile prefill for Edit profile, a non-prompt daily-override sheet, and dedicated component/mobile interaction tests.

## Historical behavior

- Daily target reads first return an existing `(user_id, creator_day_date)` record, so past snapshots remain unchanged.
- New dates snapshot the active version with the Creator-day timezone and 4:00 AM boundary at creation time.
- Saving a new goal does not rewrite an existing daily snapshot. Profile-only updates do not mutate an active goal. Daily overrides remain isolated to their selected row.

## Phase 2A changed files

- `src/lib/nutrition/targets.ts`
- `src/lib/nutrition/targetApi.ts`
- `src/app/api/nutrition/profile/route.ts`
- `src/app/api/nutrition/targets/preview/route.ts`
- `src/app/api/nutrition/goals/route.ts`
- `src/app/api/nutrition/targets/route.ts`
- `src/app/api/nutrition/targets/[id]/route.ts`
- `src/components/nutrition/NutritionTargetPanel.tsx`
- `src/components/nutrition/SharedMealPlanPanel.tsx`
- `supabase/manual/20260722_install_nutrition_profile_targets.sql`
- `test/lib/nutrition/targets.spec.ts`
- `test/lib/nutrition/nutritionTargetSql.spec.ts`
- `docs/nutrition-meal-plan/IMPLEMENTATION_LEDGER.md`

## Verification

- `pnpm exec vitest run test/lib/nutrition/targets.spec.ts test/lib/nutrition/nutritionTargetSql.spec.ts` — passed, 2 files and 19 tests.
- Focused ESLint over every Phase 2A module, route, component, and test listed above — passed with no findings.
- `pnpm exec tsc --noEmit --pretty false 2>&1 | rg 'nutrition/(targets|targetApi)|NutritionTargetPanel|api/nutrition/(profile|goals|targets)' || true` — no focused diagnostics.
- Persistence/API integration tests, cross-user execution, UI tests, and live `VALI-v19` verification remain outstanding. SQL was tested statically only.

## Exact next action after SQL confirmation

After Mack confirms the manual SQL completed successfully, add and run authenticated persistence/API tests against the installed feature tables, finish the named setup/override UX gaps, and run the focused UI/mobile regression suite before reclassifying Phase 2A complete.

Phase 2B begins at Daily Progress—logged-versus-target and planned/projected/remaining composition—not adaptive adjustments.

# Final Phase 1 Runtime Verification Pass (2026-07-22)

## Classification

`Phase 1 runtime verification incomplete`

The complete manual bundle was successfully installed on `VALI-v19` by Mack. Mack manually confirmed both Meal Plan tables, `grocery_depletion_results`, the consumed-meal reference, Creator-day uniqueness, RLS, all eight table policies, and the three required RPCs. Codex did not run Supabase CLI commands, SQL, migrations, type generation, or service-role verification.

## Application verification and correction

- Code-level verification confirms GET conflict-safe initialization and re-read, separate Creator-day date keys, food/Grocery-food/template addition, servings/status/meal-type/planned-time update, removal, snapshot parsing, and logging RPC boundaries.
- Confirmed and corrected the missing manual-item flow. Manual items now persist an explicitly non-loggable empty nutrition snapshot. The shared panel does not offer Nutrition logging for them, and the installed `log_meal_plan_item` RPC already rejects empty component arrays. No SQL change was required.
- Extended `useMealPlanDay` and the shared panel to expose meal type and planned time edits already accepted by the API.
- Food, Grocery-backed food, and saved-meal snapshots remain server-authored and versioned. Planning/update/skip routes contain no consumed-meal creation or Grocery depletion calls. Only the explicit log route calls the authoritative logging/depletion RPCs.
- Both Grocery and Nutrition mount the same `SharedMealPlanPanel`, hook, API, persisted day, selected-date input, and cross-instance refresh event. Grocery is no longer routed to the Meal Plan placeholder, and Nutrition includes the Meal Plan tab.
- The component uses compact wrapping controls and 40–44px minimum interactive heights, but actual iPhone rendering and draft preservation during tab switching were not executable here.

## Successful and Partially Logged traces

- Focused route/RPC tests verify: Nutrition creation failure stops before depletion; initial logging with complete depletion returns Logged; incomplete depletion returns Partially Logged; retry uses the stored meal and the depletion RPC only; completed work is skipped by the installed SQL contract; a completed retry becomes Logged; an incomplete retry remains Partially Logged; repeated already-logged requests perform no Grocery call.
- The migration lifecycle tests verify durable component results, diagnostics, completed-component skipping, retry finalization, and idempotency in the installed function definitions.
- These are controlled route/function-contract traces, not a live `VALI-v19` data trace. No permanent verification records were created.

## RLS verification

- Mack confirmed RLS enabled and four policies on each table. Code/migration tests verify policies are own-row/parent-own-row scoped and RPC lookup is constrained by `auth.uid()`.
- A second authenticated test user was unavailable, and no service-role access was used as proof. Cross-user read/insert/update/log/delete execution therefore remains incomplete.

## Exact verification run

- `pnpm exec vitest run test/app/api/nutrition/meal-plan/log-route.spec.ts test/lib/nutrition/mealPlanLifecycleMigration.spec.ts test/lib/nutrition/mealPlans.spec.ts test/lib/nutrition/creatorDay.spec.ts` — passed before correction: 4 files, 37 tests.
- The same focused Vitest command after correction — passed: 4 files, 37 tests; subsequently expanded to 38 tests for the non-loggable manual snapshot contract.
- `pnpm exec eslint 'src/app/api/nutrition/meal-plan/route.ts' 'src/app/api/nutrition/meal-plan/items/[id]/route.ts' 'src/app/api/nutrition/meal-plan/items/[id]/log/route.ts' src/lib/nutrition/mealPlans.ts src/hooks/useMealPlanDay.ts src/components/nutrition/SharedMealPlanPanel.tsx test/app/api/nutrition/meal-plan/log-route.spec.ts test/lib/nutrition/mealPlanLifecycleMigration.spec.ts test/lib/nutrition/mealPlans.spec.ts test/lib/nutrition/creatorDay.spec.ts` — passed with no findings after the application correction.
- `pnpm exec tsc --noEmit --pretty false 2>&1 | rg 'src/(app/api/nutrition/meal-plan|lib/nutrition/mealPlans|hooks/useMealPlanDay|components/nutrition/SharedMealPlanPanel)|test/(app/api/nutrition/meal-plan|lib/nutrition/(mealPlanLifecycleMigration|mealPlans|creatorDay))'` — no focused diagnostics.
- `pnpm dev` — local server could not bind to `0.0.0.0:3000` in the sandbox; elevated execution was not approved.
- Browser skill setup was inspected, but its required browser-control runtime was not available in this session.
- `git diff --check` — passed.

## Remaining prerequisite and exact Phase 2 starting point

Before Phase 2, run one authenticated `VALI-v19` acceptance session with two non-service-role users: complete the full API CRUD/date/synchronization trace, successful and controlled partial logging traces, cross-user RLS denial checks, and Grocery/Nutrition iPhone UI/draft-preservation checks. Remove isolated records afterward. Generated Supabase types were not regenerated.

Phase 2 starts only after that named acceptance session, at Nutrition profile and immutable goal-version persistence followed by the pure target/macro engine and safety gates. Do not begin Phase 2 before accepting the remaining Phase 1 runtime gate.

# Canonical Manual Installation Correction (2026-07-22)

## Classification and failures

- Complete manual SQL bundle created at `supabase/manual/20260722_install_complete_nutrition_meal_plan.sql`; it is the only manual installation path for Phase 1 on `VALI-v19`.
- The first manual attempt failed because `public.meal_plan_items` did not exist when the additive correction was run.
- The subsequent base-migration attempt failed with `ERROR: 42P01: relation "public.meal_templates" does not exist`.
- Root cause: the original chain used unsafe, unproven live-schema foreign keys and RLS references to `meal_templates` and `recipes`, plus foreign keys to other optional source/consumed relations. Generated TypeScript and API usage were not accepted as proof of live relations.

## Corrected installation workflow

- Mack manually reviews and runs the complete bundle against `VALI-v19`. Codex never runs Supabase commands, connects to Supabase, authenticates to Supabase, or applies SQL remotely.
- The bundle wraps preflight, extension setup, both tables, compatibility columns, guarded constraints, indexes, feature-owned updated-at triggers, RLS policies, authenticated grants, and only the final corrected RPC definitions in one `begin`/`commit` transaction.
- Optional `food_id`, `meal_template_id`, `recipe_id`, and `consumed_meal_id` values remain nullable UUIDs without foreign keys. Policies likewise depend only on Meal Plan ownership. No placeholder source tables are created.
- `public.create_nutrition_meal(jsonb,jsonb)` is migration-backed and is the one mandatory preflight dependency because the current log route requires atomic Nutrition meal creation. Grocery depletion uses guarded dynamic SQL, so missing `food_resources` cannot prevent bundle installation and is recorded as durable component failure at runtime.
- The original `20260722000000` and `20260722000001` files remain for repository history and are not the manual installation path; their executable SQL was not changed.
- The bundle tolerates neither table, only the day table, both tables without correction columns, and prior feature policies/functions/triggers. It never drops/truncates Meal Plan tables or deletes data.

## Files changed for this correction

- `supabase/manual/20260722_install_complete_nutrition_meal_plan.sql`
- `supabase/migrations/20260722000000_create_nutrition_meal_plans.sql` (history/manual-path header only)
- `supabase/migrations/20260722000001_correct_meal_plan_partial_logging.sql` (history/manual-path header only)
- `test/lib/nutrition/mealPlanLifecycleMigration.spec.ts`
- `docs/nutrition-meal-plan/IMPLEMENTATION_LEDGER.md`

## Correction verification

- `pnpm exec vitest run test/app/api/nutrition/meal-plan/log-route.spec.ts test/lib/nutrition/mealPlanLifecycleMigration.spec.ts test/lib/nutrition/mealPlans.spec.ts test/lib/nutrition/creatorDay.spec.ts` — passed, 4 files and 37 tests.
- `pnpm exec eslint 'src/app/api/nutrition/meal-plan/route.ts' 'src/app/api/nutrition/meal-plan/items/[id]/route.ts' 'src/app/api/nutrition/meal-plan/items/[id]/log/route.ts' src/lib/nutrition/mealPlans.ts src/hooks/useMealPlanDay.ts src/components/nutrition/SharedMealPlanPanel.tsx test/app/api/nutrition/meal-plan/log-route.spec.ts test/lib/nutrition/mealPlanLifecycleMigration.spec.ts test/lib/nutrition/mealPlans.spec.ts test/lib/nutrition/creatorDay.spec.ts` — passed with no findings.
- `pnpm exec tsc --noEmit --pretty false 2>&1 | rg 'src/(app/api/nutrition/meal-plan|lib/nutrition/mealPlans|hooks/useMealPlanDay|components/nutrition/SharedMealPlanPanel)|test/(app/api/nutrition/meal-plan|lib/nutrition/(mealPlanLifecycleMigration|mealPlans|creatorDay))'` — no focused diagnostics (the filter exited 1 because it matched no output).
- `git diff --check` — passed.
- SQL remains pending Mack's manual execution.

# Phase 1C Handoff (2026-07-22)

## Workflow rules

- `VALI-v19` is the only Supabase project used by CREATOR.
- Mack manually reviews and runs every SQL migration.
- Codex must never run Supabase migration commands, remote SQL, or Supabase authentication.
- SQL in this phase remains pending Mack's manual application.

## Root cause and corrected state machine

- Root cause: `log_meal_plan_item` persisted `logged` immediately after Nutrition meal creation even when Grocery work remained, while `deplete_logged_meal_plan_item` accepted only `logged` and stored only one item-level result. The API then retried the initial RPC, so the documented `partially_logged` recovery path could not exist and component-level progress was not durable.
- Corrected states: `planned` means no consumed meal exists; `partially_logged` means a consumed meal exists with at least one pending or failed Grocery component; `logged` means the consumed meal exists and all applicable Grocery work completed, or no Grocery work applied; `skipped` means not consumed.
- A stored `consumed_meal_id` is authoritative. Initial and retry RPCs lock the item row. Initial creation happens once; retry never creates a meal. Completed deduction components are skipped, failures retain diagnostics, and finalization changes to `logged` only after every component is complete.
- Nutrition creation failure occurs before any item update, so the transaction retains no consumed meal ID, runs no depletion, and leaves the item `planned`.

## Additive migration

- `20260722000001_correct_meal_plan_partial_logging.sql` adds only `meal_plan_items.grocery_depletion_results` and replaces `log_meal_plan_item` and `deplete_logged_meal_plan_item`.
- The migration is designed to run once against the existing, manually applied Phase 1 schema. It does not recreate tables, define `food_resources`, or add a foreign key to it.

## Changed files

- `supabase/migrations/20260722000001_correct_meal_plan_partial_logging.sql`
- `src/app/api/nutrition/meal-plan/items/[id]/log/route.ts`
- `src/lib/nutrition/mealPlans.ts`
- `src/hooks/useMealPlanDay.ts`
- `src/components/nutrition/SharedMealPlanPanel.tsx`
- `test/app/api/nutrition/meal-plan/log-route.spec.ts`
- `test/lib/nutrition/mealPlanLifecycleMigration.spec.ts`
- `docs/nutrition-meal-plan/IMPLEMENTATION_LEDGER.md`

## Verification

- `pnpm exec vitest run test/app/api/nutrition/meal-plan/log-route.spec.ts test/lib/nutrition/mealPlanLifecycleMigration.spec.ts test/lib/nutrition/mealPlans.spec.ts test/lib/nutrition/creatorDay.spec.ts` — passed, 4 files and 33 tests.
- `pnpm exec eslint 'src/app/api/nutrition/meal-plan/items/[id]/log/route.ts' src/lib/nutrition/mealPlans.ts src/hooks/useMealPlanDay.ts src/components/nutrition/SharedMealPlanPanel.tsx test/app/api/nutrition/meal-plan/log-route.spec.ts test/lib/nutrition/mealPlanLifecycleMigration.spec.ts` — passed with no findings.
- `pnpm exec tsc --noEmit --pretty false` — repository-wide check remains red on the existing baseline errors; filtering that output to every Phase 1C TypeScript/test path returned no Phase 1C diagnostics.
- `git diff --check` — passed.
- No Supabase command, remote SQL, migration application, authentication, or remote schema inspection was performed.

## Exact next action

After Mack confirms the SQL ran, rerun the focused local checks and perform the separately authorized applied-schema/API verification without starting Phase 2 or marking remote deployment verification complete.

# Approved Product Decisions

- Grocery and Nutrition share one Meal Plan.
- Planning does not equal logging.
- Planning does not deplete inventory.
- Creator day begins at 4:00 AM local time.
- Mifflin–St Jeor is the default resting formula.
- Manual targets remain supported.
- BMI is secondary screening context.
- Goal versions are immutable.
- Daily target snapshots preserve history.
- Adaptive changes are suggestions only.
- No adjustment occurs more frequently than every 14 days.
- Recipes are future-compatible but not required in Phase 1.

# Phase Checklist

## Phase 0 — Repository Audit

- [x] Preserve the approved PRD in the repository.
- [x] Audit Grocery, Nutrition, Creator-day, database/API, user/Fitness, and recipe architecture.
- [x] Produce the phased implementation map.
- [x] Record boundaries, risks, open decisions, and handoff rules.
- [ ] Phase 0 documentation reviewed and accepted.

## Phase 0.5 — Schema and Creator-Day Verification

- [x] Trace all current 4:00 AM Creator-day implementations and daily-key divergences.
- [x] Define canonical plan-day persistence, timezone fallback, DST, travel, and uniqueness behavior.
- [x] Establish the generated-type source of truth and Phase 1 regeneration workflow.
- [x] Trace `food_resources` through migrations, backups, runtime, types, branches, and Git history.
- [x] Classify Phase 1 readiness and the separate infrastructure repair requirement.

## Phase 1 — Shared Meal Plan Tab Parity

- [x] Resolve blocking Creator-day/schema/type-workflow decisions (completed in Phase 0.5).
- [x] Add shared plan persistence and RLS.
- [x] Add shared API, hook, and component.
- [x] Mount the same plan in Grocery and Nutrition.
- [x] Prove by executable focused tests and route/RPC boundaries that planning does not log or deplete; linked-schema RLS execution remains a deployment prerequisite.
- [x] Meet Phase 1 completion criteria and update this ledger.

## Phase 2 — Nutrition Profile and Target Engine

- [ ] Add profile, immutable goal versions, and daily snapshots.
- [ ] Implement and test pure target/macro formulas and safety gates.
- [ ] Add preview and persistence APIs.
- [ ] Add setup, explanation, manual override, and reset UI.
- [ ] Meet Phase 2 completion criteria and update this ledger.

## Phase 3 — Daily Progress

- [ ] Compose logged, planned, projected, and remaining daily values.
- [ ] Replace fixed progress targets with daily snapshots.
- [ ] Verify Creator-day and accessibility behavior.
- [ ] Meet Phase 3 completion criteria and update this ledger.

## Phase 4 — Weight Check-ins and Trends

- [ ] Add weight and completion records with RLS.
- [ ] Implement rolling-average and evidence logic.
- [ ] Add check-in and trend UI.
- [ ] Meet Phase 4 completion criteria and update this ledger.

## Phase 5 — Adaptive Suggestions

- [ ] Add review/suggestion persistence.
- [ ] Implement data-quality, cooldown, and conservative adjustment rules.
- [ ] Add accept, dismiss, pause, and history flows.
- [ ] Prove no target changes automatically.
- [ ] Meet Phase 5 completion criteria and update this ledger.

## Phase 6 — Recipes and Inventory Intelligence

- [ ] Connect recipe/Chef-compatible plan references.
- [ ] Add missing-ingredient and inventory projections.
- [ ] Prove projections do not deplete inventory.
- [ ] Meet Phase 6 completion criteria and update this ledger.

# Work Completed

## Phase 1

- Added a pure `src/lib/creatorDay.ts` resolver with profile → device → UTC precedence, IANA validation, a 4:00 AM wall-clock boundary, selected-date resolution, immutable timestamp snapshots, and DST-aware independently resolved boundaries.
- Added focused Creator-day tests for before/at/after 4:00 AM, timezone precedence/fallback/invalid values, and 23/25-hour DST days.
- Added `meal_plan_days` and `meal_plan_items` persistence with day uniqueness, stable ordering, status/serving/source constraints, references only to migration-confirmed tables, updated-at triggers, indexes, grants, and explicit own-row/parent-own-row RLS.
- Added authenticated Meal Plan fetch/initialize, add, update, remove, and log API routes. Day initialization uses conflict-safe upsert and then re-reads the persisted snapshot; logging delegates to the atomic plan-item RPC described below.
- Replaced client-authored/manual nutrition JSON with server-built, versioned snapshots from authoritative active `foods` or owned active `meal_templates`. Persisted snapshots are validated on creation and read, and reusable templates retain every ordered component for consumed-log expansion.
- Replaced the process-local log claim with `log_meal_plan_item`, which locks the owned plan item and performs component expansion, consumed meal creation, and plan linkage in one transaction. Manual/empty snapshots are not loggable, and clients cannot PATCH an item into Logged or Partially Logged.
- Added durable Grocery depletion state and `deplete_logged_meal_plan_item`. Grocery-backed planned foods snapshot an owned resource deduction; planning never calls depletion. Logging leaves work durably Pending and the depletion RPC atomically changes inventory plus marks completion, making termination and retry non-duplicating. Pending work is visible and retryable in the shared panel.
- Added saved-meal, individual-food search, and Grocery-backed food choices to the one shared panel. The API resolves all labels/nutrition/template components from existing authorities rather than accepting parallel client models.
- Passed an explicit Nutrition form date field into the shared hook/API when selected; otherwise the canonical current Creator day remains the fallback.
- Added narrow application Meal Plan contracts/parsers because linked generated-type regeneration was unavailable.
- Added one `useMealPlanDay` hook and one `SharedMealPlanPanel` used by both Grocery and Nutrition. The panel has local loading/error/retry state, an iPhone-sized add control, count/date summary, servings edits, removal, skipped/logged states, and cross-instance refresh events.
- Added the Nutrition Meal Plan tab and replaced the Grocery placeholder through surgical `NoteSlashTextarea.tsx` mount changes while preserving concurrent Fitness edits.
- Planning routes write only Meal Plan tables. They do not create consumed `meals` and do not call or mutate Grocery inventory. Logging alone calls the established consumed-meal RPC. Phase 1's manual planner does not associate inventory deductions, so it cannot independently deplete Grocery.
- Existing divergent Creator-day consumers remain intentionally unchanged: browser-local Nutrition daily windows, scheduler timezone utilities, and the midnight-keyed habit completion route are deferred for later cleanup.

## Earlier phases

- Added the approved PRD as the permanent product source of truth with an approval/read-first header.
- Inspected the current Grocery Meal Plan placeholder and its local tab state.
- Inspected the Nutrition renderer, selection/logging flow, daily totals, fixed progress targets, Creator-day logic, and save/depletion paths.
- Inspected food inventory, staged Grocery and native barcode flows, meals, meal templates, recipes, Chef, relevant APIs, Supabase migrations/types/RLS, profile/timezone/DOB data, Fitness semantics, mobile modal behavior, and tests.
- Recorded the recommended component/data architecture, concrete risks, genuine open decisions, and Phases 1–6.
- Verified that Nutrition's 4:00 AM window is browser-local while scheduler/productivity uses the IANA-zone-aware `GLOBAL_DAY_START_HOUR`, `startOfDayInTimeZone`, and related helpers; also recorded the midnight `habit_completion_days` key divergence.
- Verified that `profiles.timezone` is nullable, read by `useProfile`, absent from the profile edit form/write payload, and not populated by a production repository path; established valid profile zone → valid device zone → UTC as the explicit fallback chain.
- Chose `creator_day_date` plus immutable `timezone`, `timezone_source`, `boundary_hour`, `starts_at`, and `ends_at` snapshots, with `UNIQUE (user_id, creator_day_date)` and wall-clock/DST-aware resolution.
- Defined the Phase 1 shared Creator-day utility's exact pure inputs, outputs, responsibilities, and boundary/DST test cases.
- Verified both Supabase type files are actively imported. Established CLI-shaped `src/types/supabase.ts` as canonical and `supabase gen types typescript --linked --schema public > src/types/supabase.ts` as the documented generation command; generated output remains committed.
- Verified no package script or CI type-generation job exists, root `types/supabase.ts` is an active older/manual schema, and commit `84df94dd` manually added `food_resources` declarations to both files.
- Verified no active/backup migration, schema dump, seed, reachable branch, or Git history creates `food_resources`; therefore migration-only clean databases omit it and its primary key/defaults, indexes, constraints, grants, and RLS cannot be proven from the repository.
- Decided the `food_resources` baseline can be repaired separately but must be repaired before deployment/fresh-environment certification. Phase 1 must not reference it from new migrations.

# Changed Files

## Phase 1 changes

- `docs/nutrition-meal-plan/IMPLEMENTATION_LEDGER.md` — Phase status and complete handoff record.
- `src/lib/creatorDay.ts` — canonical Meal Plan Creator-day resolver.
- `src/lib/__tests__/creatorDay.test.ts` and `test/lib/nutrition/creatorDay.spec.ts` — boundary, fallback, and correctly attributed DST tests.
- `test/lib/nutrition/mealPlans.spec.ts` — strict snapshot rejection and template-component preservation tests.
- `src/lib/nutrition/mealPlans.ts` — narrow plan API/component contracts and status labels.
- `src/app/api/nutrition/meal-plan/route.ts` — fetch/initialize and add-item contracts.
- `src/app/api/nutrition/meal-plan/items/[id]/route.ts` — edit/remove contracts.
- `src/app/api/nutrition/meal-plan/items/[id]/log/route.ts` — idempotent claim, existing meal RPC logging, failure restore, and consumed-meal linkage.
- `src/hooks/useMealPlanDay.ts` — shared fetch/mutation/revalidation state.
- `src/components/nutrition/SharedMealPlanPanel.tsx` — shared Grocery/Nutrition Meal Plan UI.
- `src/components/notes/NoteSlashTextarea.tsx` — imported/mounted the shared panel and exposed Meal Plan in Nutrition; no unrelated sections were reformatted.
- `supabase/migrations/20260722000000_create_nutrition_meal_plans.sql` — plan schema, indexes, grants, triggers, and RLS.

`src/types/supabase.ts` was not changed: the Supabase CLI and linked execution environment are unavailable, and the generated file was not broadly hand-edited.

## Pre-existing unrelated worktree changes

- `src/components/notes/NoteSlashTextarea.tsx` already contained concurrent Fitness workout-log changes before Phase 1 (weight-unit modeling and controls, parsing/formatting helpers, source routine/plan metadata, workout log metadata persistence/preview, and related Fitness state/UI changes). Those hunks continued changing concurrently during this task. Phase 1 preserved them and added only the shared-panel import, Nutrition tab entry, placeholder narrowing/removal, and shared mount branch.
- `src/lib/fitness/progressiveOverload.ts` appeared as an unrelated untracked Fitness file during Phase 1B and was not read or modified.
- The untracked `docs/nutrition-meal-plan/` directory, including `PRD.md` and `REPOSITORY_AUDIT.md`, pre-existed Phase 1. The PRD and audit were read completely and not modified by Phase 1.

# Schema Changes

- Migration: `20260722000000_create_nutrition_meal_plans.sql`.
- Tables: `meal_plan_days`, `meal_plan_items`.
- Unique constraint: `(user_id, creator_day_date)`; timezone is intentionally excluded.
- Foreign keys: authenticated user, plan-day parent, confirmed `foods`, `meal_templates`, `recipes`, and consumed `meals` tables only.
- Indexes: user/day lookup, ordered day items, and day/status lookup.
- RLS: explicit select/insert/update/delete policies for owned days and parent-owned items.
- Confirmed: the migration adds no `food_resources` foreign key or static schema dependency, and the historical missing migration was untouched. The depletion RPC uses fixed dynamic SQL so migration creation remains independent while runtime deployment still requires the existing linked table.

# Runtime Changes

## API contracts

- `GET /api/nutrition/meal-plan?creator_day_date=YYYY-MM-DD&device_timezone=IANA` → `{ plan }`; date is optional, server reads `profiles.timezone`, resolves boundaries, conflict-safely initializes, and returns the persisted timezone snapshot.
- `POST /api/nutrition/meal-plan` with `{ mealPlanDayId, sourceSurface, servings?, position?, mealType?, plannedTime?, foodId }` or `{ ..., mealTemplateId }`, plus optional owned `foodResourceId` for a Grocery-backed food → `{ item }`. Labels and versioned snapshots are server-derived; manual/client-authored snapshots are rejected by construction.
- `PATCH /api/nutrition/meal-plan/items/:id` with any supported `{ label, servings, position, mealType, plannedTime, status }` → `{ item }`.
- `DELETE /api/nutrition/meal-plan/items/:id` → `{ deleted: true }`.
- `POST /api/nutrition/meal-plan/items/:id/log` → `{ mealId, alreadyLogged, groceryDepletionPending }`; the consumed log and linkage are atomic, duplicate calls return the existing meal, and durable pending Grocery work is safely retried.

# Tests Run

## Phase 1 verification

- `pnpm exec vitest run test/lib/nutrition/creatorDay.spec.ts test/lib/nutrition/mealPlans.spec.ts` — passed, 2 files and 14 tests.
- Focused ESLint across all Phase 1 route/component/hook/library/test files — passed.
- `pnpm exec tsc --noEmit --pretty false` — repository-wide check ran and failed on thousands of pre-existing unrelated errors. Filtering the same output to Phase 1 paths found no Phase 1 errors after correcting the server-client import and profile cast.
- `supabase db lint --local` — attempted; local Postgres at `127.0.0.1:54322` is unavailable in this environment, so schema/RLS execution remains a deployment prerequisite.
- `git diff --check` — passed.
- Focused source search confirmed plan creation paths never call a meal/depletion RPC; only the explicit log route invokes them.
- Phase-boundary search found no BMI, BMR, TDEE, target, weight-tracking, adaptive, or recipe-generation implementation in the new Phase 1 runtime files.

## Unrelated failures

- The repository-wide TypeScript check remains red on extensive pre-existing errors outside Phase 1, including generated Next route validators, legacy component/provider types, scheduler tests, and Vitest config typing. Focused Phase 1 filtering is clean.
- Local Supabase schema lint could not connect because no local database is running/accessible.

# Existing Unrelated Worktree Changes

See the separated Phase 1/pre-existing list under Changed Files. The original pre-edit `NoteSlashTextarea.tsx` diff was captured before Phase 1 edits and preserved; it began with Fitness weight-unit, workout-detail, source-routine, metadata, and Fitness review UI changes. Concurrent work added further Fitness preview changes while Phase 1 was in progress.

# Open Decisions

- Non-blocking Phase 1 picker scope: existing meal templates and individual foods with snapshots; recipe/Chef controls remain deferred while nullable compatibility is preserved.
- No Creator-day, uniqueness, type-source, or `food_resources` repair-timing decision remains open for Phase 1.

# Unresolved Phase 1 Issues

- No implementation issue remains in the Phase 1B scope. Applying/linting the migration against the linked schema, regenerating authoritative types, and authenticated RLS/UI execution are deployment prerequisites listed below.

# Next Action

Complete the deployment prerequisites below in the linked environment. Do not begin Phase 2 until that release gate is accepted.

# Deployment Prerequisites

- Apply the Phase 1 migration to the linked project.
- Regenerate and commit authoritative `src/types/supabase.ts` with the documented linked command; remove the temporary need for loose application query casts where generated relationships permit.
- Run authenticated/RLS integration tests against the applied schema and verify rapid Add/Log behavior and cross-surface refresh.
- Repair the historical `food_resources` migration baseline separately before deployment/fresh-environment certification.
- Provide linked Supabase credentials/project access for type generation and authenticated schema verification.

# Handoff Rules

- Read `PRD.md`, `REPOSITORY_AUDIT.md`, and `IMPLEMENTATION_LEDGER.md` before editing.
- Update this ledger after every implementation phase.
- Never silently change an approved product decision.
- Record every migration and API contract.
- Record tests and unrelated existing failures separately.
- Preserve unrelated worktree changes.
- Keep each phase independently reviewable and commit-ready.
- Do not begin a later phase until the current phase’s acceptance criteria are met.
