# Approved Product Source of Truth

> This document is the approved product source of truth for the CREATOR Nutrition Meal Plan and Adaptive Targets project. Every later implementation prompt and Codex session must read this file before making changes.

---

# CREATOR Nutrition Meal Plan & Adaptive Targets

## Product Requirements Document

**Status:** Draft for product approval
**Product:** CREATOR
**Feature area:** Nutrition, Grocery, Meal Planning
**Primary surfaces:** Nutrition form and Grocery List form
**Target platforms:** Responsive web, Capacitor iOS, mobile Safari
**Creator day boundary:** 4:00 AM local time
**Implementation status:** Not started
**PRD purpose:** Establish product behavior and technical requirements before creating Codex implementation prompts

---

# 1. Product Summary

CREATOR will add the existing **Meal Plan** tab to the Nutrition form and connect both the Grocery and Nutrition Meal Plan surfaces to one shared nutrition-planning system.

The system will allow users to:

- Set a body and nutrition goal.
- Receive an estimated daily calorie and macronutrient target.
- Understand how the target was calculated.
- Manually override any recommendation.
- See planned, logged, consumed, and remaining nutrition for the current Creator day.
- Use foods, meals, and eventually recipes already available in CREATOR.
- Track body-weight trends over time.
- Receive conservative suggestions to increase, hold, reduce, or temporarily normalize calorie intake.
- Apply target changes only after explicit confirmation.

This is not intended to become a separate calorie-counting application inside CREATOR. It is a planning and decision layer that connects:

**Goal → Daily target → Available food → Chosen meal → Nutrition log → Progress trend → Suggested adjustment**

The Nutrition Meal Plan tab will answer:

> What does my body goal require today, what have I consumed, and what could I eat next?

The Grocery Meal Plan tab will answer:

> What meals can I support with the food I own, and what ingredients am I missing?

Both surfaces must use the same underlying meal plans, nutrition targets, foods, recipes, and user profile. They are two views of one system, not separate implementations.

---

# 2. Problem Statement

The current CREATOR Nutrition form supports food logging and Grocery inventory interaction, but it does not provide a durable daily target or planning layer.

As a result:

- Users can log calories and macros without knowing their intended target.
- Progress bars cannot represent meaningful goal progress.
- The Grocery Meal Plan tab is not mirrored inside Nutrition.
- Meal planning and meal logging are disconnected.
- The application does not know whether a user is trying to lose, maintain, gain, or recomp.
- The application does not adapt when real-world results differ from the initial estimate.
- Foods, available inventory, recipes, and body goals are not yet connected into one feedback system.
- A user may repeatedly change calorie targets without history or explanation.
- Formula changes could retroactively alter old nutrition records unless targets are versioned.

Initial BMR and TDEE formulas are estimates rather than measurements. Long-term body-weight response is also dynamic because energy expenditure and body composition change over time. CREATOR therefore needs to treat the first target as a starting estimate and progressively calibrate through observed trends rather than presenting it as permanent truth. NIDDK’s Body Weight Planner is based on dynamic energy-balance research and explicitly accounts for changing metabolic needs over time.

---

# 3. Product Vision

CREATOR should become capable of saying:

> Based on your current profile and goal, your starting target is approximately 2,400 calories with 160 grams of protein. You have logged 1,450 calories today, and your available groceries support several meals that fit what remains. Your two-week weight trend is moving close to target, so no calorie change is recommended.

The system should feel like a calm operating layer rather than a judgmental diet application.

It should:

- Help the user decide.
- Explain its reasoning.
- Preserve user control.
- Avoid false precision.
- Adapt slowly.
- Never punish a user for exceeding a target.
- Avoid turning one weigh-in or one unusual day into a recommendation.
- Connect food planning to the rest of the CREATOR life system.

---

# 4. Product Principles

## 4.1 One shared system

Grocery Meal Plan and Nutrition Meal Plan must read and update the same records.

There must not be:

- A Grocery-only meal plan.
- A Nutrition-only meal plan.
- Separate calorie targets by form.
- Separate recipe or food representations.
- Different Creator-day calculations between surfaces.

## 4.2 Flexible planning by default

CREATOR should not assume every user wants breakfast, lunch, and dinner rigidly scheduled.

The default mode is **Flexible Plan**:

- A daily calorie and macro target exists.
- Meals may be optionally planned.
- Users can browse available meals when they are ready to eat.
- Planned food is not treated as consumed food.
- Grocery inventory is not depleted until the meal is actually logged.

A more rigid Scheduled Plan may be added later, but it is not required for the first release.

## 4.3 Estimates, not diagnoses

BMI is useful only as contextual screening information. CDC identifies BMI as a screening measure that should be considered alongside other factors and not used to diagnose a condition. Adult BMI categories should only be shown for users age 20 and older.

The interface must use language such as:

- Estimated maintenance
- Suggested starting target
- Based on the information provided
- Adjust as your trend becomes clearer

It must not use language such as:

- Your body needs exactly
- Your ideal weight is
- You must eat
- This guarantees a specific weight change

## 4.4 The user remains authoritative

Every calculated value must support:

- Manual override.
- Reset to suggested.
- Explanation.
- Version history.
- Temporary daily override.
- Pausing adjustment suggestions.

## 4.5 Slow adaptation over reactive adjustment

One day of eating, one weigh-in, or one week of incomplete logs cannot change the user’s permanent targets.

The adjustment engine must:

- Use smoothed weight trends.
- Require sufficient data.
- Consider logging completeness.
- Wait at least 14 days between persistent changes.
- Recommend rather than automatically apply changes.

## 4.6 Preserve CREATOR’s visual language

The feature must preserve CREATOR’s premium, compact, liquid-glass visual system.

- No broad redesign of Grocery or Nutrition.
- No blue default accents.
- Green remains limited to successful completion or target completion.
- Neutral monochrome states should represent ordinary progress.
- Warnings should remain restrained and readable.
- Mobile touch behavior is a first-class requirement.

---

# 5. Goals

## 5.1 Primary goals

1. Add a Meal Plan tab to the Nutrition form using the existing Grocery Meal Plan tab as the visual and behavioral precedent.

2. Create a shared, user-scoped nutrition profile.

3. Calculate an estimated starting calorie target from:

   * age
   * formula sex
   * height
   * weight
   * activity level
   * goal
   * goal rate

4. Calculate daily protein, fat, and carbohydrate targets.

5. Allow manual calorie and macro overrides.

6. Display daily calorie and macro progress inside Nutrition.

7. Connect planned meals to existing Nutrition logging.

8. Allow body-weight check-ins and trend calculation.

9. Generate conservative nutrition adjustment suggestions.

10. Preserve historical targets after the user’s profile or formula changes.

## 5.2 Secondary goals

- Support both metric and U.S. customary units.
- Support future recipe and Chef integration.
- Support future Grocery ingredient-gap calculation.
- Support future schedule integration with MEAL Events.
- Support future fitness-plan or wearable inputs.
- Make calculation behavior auditable and unit-testable.

---

# 6. Non-Goals

The first release will not:

- Diagnose health conditions.
- Replace a dietitian, physician, or trainer.
- Automatically modify targets without confirmation.
- Create medical diets.
- Handle pediatric calorie planning.
- Recommend weight loss during pregnancy.
- Build a complete micronutrient tracking system.
- Integrate Apple Health, Fitbit, or other wearable expenditure data.
- Generate an entire seven-day meal calendar automatically.
- Deplete Grocery inventory when a meal is merely planned.
- Require users to follow fixed meal times.
- Replace the existing Nutrition logging workflow.
- Refactor the entire `NoteSlashTextarea.tsx` architecture.
- Use AI-generated calorie recommendations as the source of truth.

---

# 7. Target Users

## 7.1 Flexible tracker

A user who wants to know what remains for the day but does not want a rigid menu.

Needs:

- Daily targets.
- Remaining calories and macros.
- Available meal suggestions.
- Fast logging.

## 7.2 Fat-loss user

A user who wants to reduce body weight gradually.

Needs:

- A moderate starting deficit.
- High enough protein.
- Weight-trend feedback.
- Protection against aggressive repeated reductions.
- Optional maintenance periods.

## 7.3 Muscle-gain user

A user who wants to gain weight and support resistance training.

Needs:

- A controlled surplus.
- Protein and carbohydrate targets.
- Feedback when gain is too slow or too fast.
- Integration with future Fitness Plans.

## 7.4 Maintenance or recomposition user

A user who wants stable body weight, better nutrition, or improved body composition.

Needs:

- Maintenance estimate.
- Protein emphasis.
- No forced weight-change target.
- Trend monitoring without aggressive adjustments.

---

# 8. User Jobs

The feature must support the following user jobs:

- “Help me establish a reasonable starting calorie target.”
- “Show me how much protein, fat, and carbohydrate I have left.”
- “Show me food or meals I can make with what I own.”
- “Let me plan something without claiming I already ate it.”
- “Let me log a planned meal quickly when I actually eat it.”
- “Tell me whether my current target appears to be working.”
- “Explain why you are suggesting a target adjustment.”
- “Let me ignore, pause, or override the recommendation.”
- “Do not rewrite my historical progress when my weight changes.”
- “Do not force me into a strict daily meal schedule.”

---

# 9. Product Terminology

Use the following product-facing terminology:

| Concept                                | Product label                  |
| -------------------------------------- | ------------------------------ |
| Calculated daily energy recommendation | Suggested target               |
| Estimated maintenance energy           | Estimated maintenance          |
| Basal energy calculation               | Resting estimate               |
| TDEE                                   | Estimated maintenance calories |
| Macro target                           | Daily macros                   |
| Permanent goal configuration           | Nutrition goal                 |
| One-day target change                  | Daily override                 |
| Weight measurement                     | Weight check-in                |
| Algorithm recommendation               | Suggested adjustment           |
| Increase calories                      | Increase target                |
| Keep calories unchanged                | Hold target                    |
| Decrease calories                      | Reduce target                  |
| Temporary maintenance phase            | Maintenance break              |

“Progressive overload” and “deload” are useful conceptual references but are not ideal primary labels for nutrition.

For CREATOR:

- **Nutrition overload** maps to a controlled increase in calorie availability.
- **Nutrition reduction** maps to a controlled calorie decrease.
- **Nutrition deload** maps to a maintenance break or reduced goal aggressiveness.
- **Hold** means there is no reason to change the current target.

---

# 10. Surface Architecture

## 10.1 Shared plan, different perspective

### Grocery Meal Plan

Primary purpose:

- Inventory readiness.
- Ingredients available.
- Ingredients missing.
- Meals supported by owned foods.
- Add missing food to Grocery.
- Projected Grocery usage.

### Nutrition Meal Plan

Primary purpose:

- Daily calorie and macro target.
- Planned meals.
- Logged meals.
- Remaining nutrition.
- Log planned meal.
- Weight trend.
- Goal and adjustment status.

The two tabs must share:

- `meal_plan_id`
- Creator-day date
- planned meals
- planned foods
- recipe references
- daily target snapshot
- user nutrition goal
- inventory relationship

## 10.2 Planning must not equal consumption

A planned meal:

- Contributes to “planned” totals.
- Does not contribute to “consumed” totals.
- Does not deplete Grocery inventory.
- Does not mark a Nutrition entry as completed.
- Can be edited or removed freely.

A logged meal:

- Contributes to consumed totals.
- Uses the existing Nutrition save path.
- Uses existing Grocery depletion behavior.
- May preserve a reference to the originating plan item.
- Updates plan-item status to Logged or Partially Logged.

---

# 11. Nutrition Form: Meal Plan Tab

## 11.1 Tab placement

Add `Meal Plan` to the existing Nutrition form tab strip.

Requirements:

- Reuse the existing tab primitive and visual style.
- Match the Grocery Meal Plan tab label exactly.
- Preserve the current Nutrition tab order unless the Grocery precedent establishes a shared order.
- Keep tab state stable while the form remains open.
- Do not remount active food drafts unnecessarily when switching tabs.
- Make the tab horizontally reachable on iPhone without tiny touch targets.

## 11.2 First-use empty state

When no Nutrition profile or active goal exists, show:

**Build your daily target**

“Add a few details to estimate your maintenance calories and set daily calorie and macro targets.”

Primary action:

`Set up target`

Secondary action:

`Use manual target`

Informational disclosure:

“Estimates are starting points and can be adjusted at any time.”

## 11.3 Active tab layout

The active Meal Plan tab should contain these sections in order:

### A. Daily target summary

Displays:

- selected Creator-day date
- goal type
- calorie target
- protein target
- carbohydrate target
- fat target
- target source
- last target update

Example:

**2,320 kcal**

Cut · Moderate rate

Protein 160 g
Carbs 270 g
Fat 66 g

### B. Daily progress

Primary calorie bar:

- logged calories
- daily target
- remaining or over amount
- progress percentage

Macro rows or compact secondary bars:

- protein consumed / target
- carbs consumed / target
- fat consumed / target

Required states:

- No food logged
- In progress
- Target reached
- Over target
- Incomplete nutrition data
- Daily override active

The user must always see numerical text. The meaning cannot depend only on bar color.

### C. Planned nutrition

Displays:

- planned calories
- planned protein
- planned carbs
- planned fat
- projected total if all planned meals are logged
- projected difference from the daily target

Example:

Logged: 1,150 kcal
Planned: 780 kcal
Projected: 1,930 / 2,320 kcal
Remaining after plan: 390 kcal

### D. Planned meals

Each planned meal row may reference:

- an existing saved meal
- one or more foods
- a future recipe
- a manual meal label

Row actions:

- View contents
- Edit servings
- Replace
- Remove from plan
- Log meal
- Mark skipped

Logging must invoke the existing Nutrition logging flow rather than creating a second logging system.

### E. Available next meals

This section should eventually use:

- Grocery inventory
- saved meals
- recipes
- remaining macros
- user preferences

Version one may show only existing saved meals and manually planned foods.

The system should rank but not automatically select meals.

### F. Goal and profile summary

Compact read-only summary:

- current weight
- optional goal weight
- activity level
- estimated maintenance
- active calorie target
- formula
- latest check-in

Actions:

- Edit profile
- Edit goal
- View calculation
- Pause adjustments

### G. Progress and adjustment card

Visible only when weight data exists.

Displays:

- current seven-day average
- prior seven-day average
- observed weekly rate
- intended weekly rate
- data confidence
- current recommendation

Possible recommendation states:

- More data needed
- Hold target
- Consider increasing target
- Consider reducing target
- Consider maintenance break

---

# 12. Profile Setup Flow

## 12.1 Required inputs

The target setup flow requires:

- age
- formula sex
- height
- current weight
- activity level
- goal type
- preferred unit system

## 12.2 Optional inputs

- goal weight
- body-fat percentage
- target rate
- manual estimated maintenance
- manual calorie target
- custom macros
- pregnancy or breastfeeding status when applicable
- notes about current target source

## 12.3 Formula sex language

The Mifflin–St Jeor equation uses sex-specific constants. The app should not infer this field from name, profile photo, or gender identity.

Suggested copy:

**Calculation setting**

“Energy equations use one of two biological input constants. Choose the equation input you want CREATOR to use, or set calories manually.”

Options:

- Male equation
- Female equation
- Use manual calories

Store this as `formula_sex`, not as the user’s general gender identity.

## 12.4 Activity selection

Use behavior-based descriptions rather than vague labels alone.

### Sedentary — coefficient 1.40

- Mostly seated.
- Little intentional exercise.
- Low daily walking.

### Light — coefficient 1.50

- Regular walking.
- Light exercise one to three days per week.
- Mostly non-physical work.

### Moderate — coefficient 1.60

- Intentional training three to five days per week.
- Regular walking or moderately active work.

### Active — coefficient 1.75

- Hard training most days.
- Physical work or high daily movement.

### Very active — coefficient 1.90

- High-volume training.
- Physically demanding work.
- Multiple active sessions on many days.

Physical Activity Level is formally represented as total daily energy expenditure divided by BMR, and BMR multiplied by PAL provides an estimated adult energy requirement.

The selected label and exact coefficient must both be stored. The coefficient must not be silently changed by a later app update.

## 12.5 Goal types

### Lose

User selects:

- Gentle: 0.25% body weight per week
- Moderate: 0.50%
- Fast: 0.75%
- Custom: up to 1.00%

The default is Moderate.

CDC describes gradual loss of approximately one to two pounds per week as more sustainable than faster loss. CREATOR should nevertheless default to a percentage-of-body-weight approach and conservative limits rather than pushing every user toward the upper end.

### Maintain

- No intentional calorie delta.
- Weight trend is monitored.
- Adjustment suggestions aim to preserve stability.

### Gain

User selects:

- Slow: 0.10% body weight per week
- Moderate: 0.25%
- Fast: 0.50%

The default is Moderate.

### Recomposition

- Start at estimated maintenance.
- Use an elevated protein target.
- Do not make automatic weight-rate adjustments.
- Suggest changes only after longer observation.

---

# 13. Calculation Engine

## 13.1 Architecture

Calculation logic must be placed in a dedicated pure module rather than added directly to the already large food or form renderer.

Suggested logical module:

`src/lib/nutrition/targets.ts`

Or a small directory:

- `src/lib/nutrition/targets/formulas.ts`
- `src/lib/nutrition/targets/macros.ts`
- `src/lib/nutrition/targets/adjustments.ts`
- `src/lib/nutrition/targets/types.ts`

The actual location should match repository conventions.

The server calculation service is authoritative. The client may preview results, but saved values must be recalculated server-side.

Every calculation result must include:

- algorithm version
- formula name
- formula inputs
- formula outputs
- activity coefficient
- goal delta
- macro strategy
- validation warnings
- timestamp

## 13.2 BMI

Formula:

`BMI = weight_kg / height_m²`

Behavior:

- Display numeric BMI only when valid height and weight exist.
- Display adult BMI category only for users age 20 or older.
- Label it `BMI screening estimate`.
- Keep it secondary to calorie and macro planning.
- Do not use BMI alone to determine a goal.
- Do not automatically tell the user to lose weight because of BMI.
- Do not present BMI as body-fat percentage.

## 13.3 Resting estimate

Default formula:

### Mifflin–St Jeor

Male equation:

`BMR = 10 × weight_kg + 6.25 × height_cm – 5 × age + 5`

Female equation:

`BMR = 10 × weight_kg + 6.25 × height_cm – 5 × age – 161`

Mifflin–St Jeor was derived from 498 healthy subjects and should be used as the default starting equation for adult users without direct measured expenditure.

## 13.4 Future formulas

The schema should permit future values:

- `mifflin_st_jeor`
- `revised_harris_benedict`
- `cunningham`
- `manual`

Only Mifflin and Manual are required for the first release.

Cunningham should not be enabled until the app has a reliable lean-mass input.

## 13.5 Estimated maintenance

Formula:

`estimated_maintenance_kcal = BMR × activity_coefficient`

Round the displayed value to the nearest 10 kcal.

Preserve the unrounded decimal internally for calculation reproducibility.

Allow:

- manual maintenance override
- reset to calculated maintenance
- explanation of the selected activity coefficient

## 13.6 Initial goal delta

For a selected weight-change rate:

`weekly_weight_change_kg = current_weight_kg × rate_percentage`

`provisional_daily_delta = weekly_weight_change_kg × 7700 / 7`

This is only an initial estimate and must not be presented as a guaranteed linear prediction.

Apply conservative caps:

### Loss

- Maximum automatic deficit: 20% of estimated maintenance.
- Maximum automatic deficit: 750 kcal per day.
- Use whichever cap is smaller.

### Gain

- Maximum automatic surplus: 15% of estimated maintenance.
- Maximum automatic surplus: 500 kcal per day.
- Use whichever cap is smaller.

### Maintenance and recomp

- Initial delta: zero.

## 13.7 Calorie target

Lose:

`target = maintenance – accepted_deficit`

Maintain:

`target = maintenance`

Gain:

`target = maintenance + accepted_surplus`

Recomposition:

`target = maintenance`

Round final calorie targets to the nearest 10 kcal.

## 13.8 Automatic safety boundaries

These are product guardrails, not universal medical prescriptions.

The automatic system must:

- Never suggest 800 kcal per day or lower.
- Hard-block automatic recommendations below 1,200 kcal.
- Show an additional warning and explicit confirmation below 1,500 kcal.
- Avoid automatic deficits during pregnancy or breastfeeding.
- Disable automatic adaptive adjustments for under-18 users.
- Avoid adult BMI category labeling before age 20.
- Require manual targets for unsupported profiles.

NIDDK’s Body Weight Planner similarly limits its intended use to adults and excludes pregnant and breastfeeding users.

---

# 14. Macronutrient Engine

## 14.1 Energy constants

Use:

- Protein: 4 kcal per gram
- Carbohydrate: 4 kcal per gram
- Fat: 9 kcal per gram

Macro totals may differ slightly from calorie targets because food labels and stored nutrition values may use rounding.

Allow a default tolerance of:

- ±25 kcal
- or ±1% of target

## 14.2 Default macro strategy

Use gram-based protein and fat targets, then assign remaining calories to carbohydrate.

### Maintenance

- Protein: 1.6 g/kg
- Fat: greater of 0.8 g/kg or 20% of calories
- Carbohydrate: remaining calories

### Cut

- Protein: 1.8 g/kg
- User may select up to 2.2 g/kg
- Fat: greater of 0.7 g/kg or 20% of calories
- Carbohydrate: remaining calories

### Gain

- Protein: 1.6 g/kg
- User may select up to 1.8 g/kg
- Fat: greater of 0.8 g/kg or 20% of calories
- Carbohydrate: remaining calories

### Recomposition

- Protein: 1.8 g/kg
- Fat: greater of 0.8 g/kg or 20% of calories
- Carbohydrate: remaining calories

ISSN’s position statement identifies approximately 1.4–2.0 g/kg/day as sufficient for most exercising adults, with potentially higher protein intake during calorie restriction in trained individuals. CREATOR’s defaults should stay inside a moderate portion of this range and remain editable.

## 14.3 Validation

The engine must detect:

- Protein and fat calories exceeding the calorie target.
- Negative carbohydrate remainder.
- Percentage macros not adding to 100%.
- Fixed macros not matching the calorie target.
- Extreme custom protein values.
- Zero or invalid macro values.
- Missing weight for gram-per-kilogram strategies.

When fixed macros exceed calories, do not silently alter the user’s macros.

Show:

“Your macro targets add up to more calories than your daily target. Increase calories or reduce one or more macro targets.”

## 14.4 Manual macro modes

Support:

- Suggested grams
- Custom grams
- Custom percentages

Persist the selected strategy.

---

# 15. Target Versioning

## 15.1 Immutable goal versions

Changing any persistent calculation input creates a new goal version.

Examples:

- Weight changed and user recalculated.
- Activity level changed.
- Goal changed from maintain to gain.
- Formula changed.
- User accepted an adjustment.
- User replaced calculated calories with manual calories.

Do not update the old goal record in place.

## 15.2 Daily snapshots

Each Creator day receives a target snapshot.

The target used on July 22 must remain the target shown for July 22 even if the user changes their profile on July 25.

A daily target snapshot includes:

- Creator-day date
- goal version ID
- calorie target
- protein target
- carbohydrate target
- fat target
- whether it is overridden
- override reason
- source algorithm version

## 15.3 Daily override

A user may change one day without creating a new permanent goal.

Examples:

- Higher-calorie training day.
- Social meal.
- Rest day.
- Maintenance day.

The interface must distinguish:

`Daily override`

from:

`Update ongoing target`

---

# 16. Daily Progress Calculation

## 16.1 Creator-day boundaries

All daily target, planned meal, and consumed meal calculations must follow the CREATOR day boundary:

**4:00 AM local time to 3:59:59 AM the next calendar day**

Do not use midnight as the implicit boundary.

Store:

- canonical timestamps
- user timezone
- derived Creator-day date

## 16.2 Consumed totals

Consumed nutrition must be derived from the authoritative existing Nutrition entries.

Totals:

- calories
- protein
- carbohydrates
- fat

Do not calculate consumed totals from planned meals.

## 16.3 Planned totals

Planned totals are calculated independently.

The UI should display:

- Logged
- Planned
- Projected
- Remaining

## 16.4 Progress bar behavior

Primary calorie bar:

`logged_calories / calorie_target`

Macro bars:

`logged_macro / macro_target`

Display may exceed 100%, but the filled visual track should cap safely while the numerical text shows the true value.

Example:

`2,510 / 2,300 kcal · 210 over`

Do not display negative remaining values as confusing negative numbers.

Use:

- `420 remaining`
- `Target met`
- `210 over`

Reaching exactly 100% is not required for completion. Default “target met” tolerance:

- Calories: within ±5%
- Protein: at least 90%
- Fat and carbohydrate: informational, not required for completion

---

# 17. Meal Plan Data Model

The implementation must first inspect the existing Grocery Meal Plan records and extend them rather than create a duplicate model.

The logical shared model must support the following.

## 17.1 Meal plan day

Fields:

- `id`
- `user_id`
- `creator_day_date`
- `timezone`
- `daily_target_id`
- `planning_mode`
- `notes`
- `created_at`
- `updated_at`

Planning modes:

- `flexible`
- future `scheduled`

## 17.2 Meal plan item

Fields:

- `id`
- `meal_plan_day_id`
- `position`
- `label`
- `meal_type`
- `planned_time`
- `status`
- `servings`
- `food_id`
- `saved_meal_id`
- future `recipe_id`
- `nutrition_snapshot`
- `source_surface`
- `logged_nutrition_entry_id`
- `created_at`
- `updated_at`

Statuses:

- Planned
- Logged
- Partially Logged
- Skipped

Do not use backend lifecycle terminology as product-facing labels.

## 17.3 Nutrition snapshot

A plan item’s displayed nutrition must not change unexpectedly when the underlying recipe or catalog food changes.

Store a snapshot containing:

- calories
- protein
- carbohydrates
- fat
- serving quantity
- serving unit
- ingredient or component references

The user may explicitly refresh the planned item from the latest source data.

---

# 18. Profile and Goal Data Model

Exact table names may follow existing Supabase conventions, but the logical entities must remain separate.

## 18.1 Nutrition profile

Suggested fields:

- `user_id`
- `age_years`
- `formula_sex`
- `height_cm`
- `current_weight_kg`
- `preferred_units`
- `activity_level`
- `activity_coefficient`
- `body_fat_pct`
- `pregnancy_status`
- `adjustments_enabled`
- `created_at`
- `updated_at`

Prefer age in years over date of birth unless CREATOR already has a user-controlled birthdate field.

## 18.2 Nutrition goal version

Suggested fields:

- `id`
- `user_id`
- `effective_from`
- `effective_to`
- `algorithm_version`
- `goal_type`
- `goal_weight_kg`
- `target_rate_pct_per_week`
- `bmr_formula`
- `bmr_kcal`
- `activity_coefficient`
- `estimated_maintenance_kcal`
- `calorie_delta_kcal`
- `calorie_target_kcal`
- `protein_strategy`
- `protein_target_g`
- `carb_strategy`
- `carb_target_g`
- `fat_strategy`
- `fat_target_g`
- `is_manual`
- `change_reason`
- `calculation_inputs`
- `created_at`

## 18.3 Daily nutrition target

Suggested fields:

- `id`
- `user_id`
- `creator_day_date`
- `timezone`
- `goal_version_id`
- `calorie_target_kcal`
- `protein_target_g`
- `carb_target_g`
- `fat_target_g`
- `is_daily_override`
- `override_reason`
- `created_at`
- `updated_at`

Unique constraint:

`user_id + creator_day_date`

## 18.4 Weight check-in

Suggested fields:

- `id`
- `user_id`
- `measured_at`
- `creator_day_date`
- `weight_kg`
- `source`
- `note`
- `created_at`

Sources:

- Manual
- future Apple Health
- future connected device

## 18.5 Adjustment review

Suggested fields:

- `id`
- `user_id`
- `goal_version_id`
- `window_start`
- `window_end`
- `data_quality`
- `observed_rate_pct`
- `target_rate_pct`
- `recommendation`
- `suggested_delta_kcal`
- `reason_codes`
- `status`
- `reviewed_at`
- `created_at`

Statuses:

- Suggested
- Accepted
- Dismissed
- Expired

---

# 19. API Requirements

Final paths should match existing API conventions.

## 19.1 Profile

`GET /api/nutrition/profile`

Returns current profile and active goal summary.

`PUT /api/nutrition/profile`

Updates profile inputs but does not silently change the active goal.

## 19.2 Target preview

`POST /api/nutrition/targets/preview`

Input:

- profile inputs
- goal
- target rate
- formula
- macro strategy

Returns:

- BMI context
- BMR
- estimated maintenance
- calorie target
- macro targets
- warnings
- algorithm version

Does not persist.

## 19.3 Goal creation

`POST /api/nutrition/goals`

Server recalculates and saves an immutable goal version.

Do not accept client-calculated outputs as authoritative.

## 19.4 Daily target

`GET /api/nutrition/targets?date=YYYY-MM-DD`

Returns the snapshot for the selected Creator day.

`PATCH /api/nutrition/targets/:id`

Applies a one-day override only.

## 19.5 Meal plan

`GET /api/nutrition/meal-plan?date=YYYY-MM-DD`

Returns the same plan to Grocery and Nutrition.

`PUT /api/nutrition/meal-plan`

Creates or updates the plan day.

`POST /api/nutrition/meal-plan/items`

Adds a planned item.

`PATCH /api/nutrition/meal-plan/items/:id`

Updates servings, status, or ordering.

`DELETE /api/nutrition/meal-plan/items/:id`

Removes the planned item.

## 19.6 Weight

`GET /api/nutrition/weight?range=`

Returns check-ins and derived trend values.

`POST /api/nutrition/weight`

Creates a check-in.

Sensitive health values should be sent in authenticated request bodies rather than URL query parameters wherever practical.

## 19.7 Adjustment preview

`POST /api/nutrition/adjustments/preview`

Returns a suggestion without modifying the target.

`POST /api/nutrition/adjustments/:id/accept`

Creates a new goal version.

`POST /api/nutrition/adjustments/:id/dismiss`

Preserves the current goal.

---

# 20. Weight Trend Engine

## 20.1 Trend calculation

Use daily weight check-ins.

For days with multiple weigh-ins:

- Preserve every raw entry.
- Use the latest valid entry for the day’s default trend calculation.
- Allow the user to remove erroneous entries.

Calculate:

- current seven-day rolling average
- previous seven-day rolling average
- change in kilograms or pounds
- percentage body-weight change per week

## 20.2 Minimum evidence

Do not issue a persistent calorie-change suggestion unless:

- At least 14 calendar days have passed since the active goal began or last adjustment.
- At least eight valid weight check-ins exist in the 14-day window.
- At least ten days are marked as sufficiently logged.
- No persistent adjustment has been accepted in the past 14 days.
- The current target is not paused.
- The user is not in an unsupported profile state.

## 20.3 Nutrition-day completeness

The system cannot determine adherence reliably from calories alone.

Add an explicit lightweight action:

`Finish nutrition day`

Finishing a day means:

- The user believes their food log is substantially complete.
- The day is eligible for adaptive analysis.
- The user may reopen the day later.

Do not equate finishing with hitting the calorie target.

---

# 21. Adaptive Target Suggestions

## 21.1 General rules

The engine provides suggestions only.

A suggestion must include:

- What was observed.
- What target was expected.
- Whether data quality is sufficient.
- The proposed calorie change.
- The earliest date it would take effect.
- How macros would change.
- A clear Accept or Keep Current action.

## 21.2 Adjustment increments

Default step:

- 100 kcal per day

Permitted suggested step:

- 100–150 kcal per day

Hard maximum per review:

- 250 kcal per day

Protein remains fixed unless the user’s weight or protein strategy changes.

Preserve fat minimum.

Adjust carbohydrate first.

## 21.3 Loss goal

### Hold

Recommend Hold when observed loss is within an acceptable tolerance of the target.

Default tolerance:

- ±0.15% body weight per week

### Reduce target

Consider reducing calories when:

- Loss is more than 0.25 percentage points per week slower than target.
- This occurs across two valid analysis windows.
- Nutrition logging is sufficiently complete.
- The resulting target remains inside guardrails.

Suggested change:

- 100 to 150 kcal lower

### Increase target

Consider increasing calories when:

- Loss is more than 0.50 percentage points per week faster than target.
- Or the user records sustained fatigue or poor training performance through a future feedback input.

Suggested change:

- 100 to 150 kcal higher

## 21.4 Gain goal

### Increase target

Consider increasing calories when:

- Gain is more than 0.15 percentage points per week below target.
- This persists across two valid windows.

Suggested change:

- 100 to 150 kcal higher

### Reduce target

Consider reducing calories when:

- Gain is more than 0.25 percentage points per week above target.

Suggested change:

- 100 kcal lower

## 21.5 Maintenance goal

Suggest change only when:

- The seven-day average moves outside the selected maintenance band.
- The trend persists for at least two analysis windows.

Default maintenance band:

- ±1% of the user’s reference weight

## 21.6 Recomposition goal

Do not make routine calorie-change suggestions based on weight rate.

Show:

- weight stability
- protein adherence
- optional body measurements in a future release
- training-performance integration in a future release

## 21.7 Maintenance break

A Maintenance Break is optional and never automatically applied.

It may be suggested when:

- The user has been in a deficit for at least six weeks.
- Progress has slowed.
- Data quality is sufficient.
- The user has already accepted multiple reductions.
- The current target is approaching the automatic lower guardrail.

Suggested duration:

- 7 or 14 days

Suggested target:

- Current estimated maintenance or manually chosen maintenance.

Evidence concerning diet breaks is promising but population-specific; for example, the MATADOR trial studied intermittent restriction in men with obesity. CREATOR should therefore present maintenance breaks as optional planning tools rather than universally superior treatment.

---

# 22. Manual Control Requirements

Users must be able to:

- Enter a fully manual calorie target.
- Enter manual macro targets.
- Override maintenance calories.
- Select a different supported formula.
- Change activity coefficient.
- Apply a one-day override.
- Disable adaptive suggestions.
- Pause suggestions for 14 or 30 days.
- Dismiss an individual suggestion.
- Restore the latest calculated recommendation.
- Review target-change history.

When a manual target is active, display:

`Manual target`

Do not continue presenting it as calculated.

---

# 23. Grocery Integration

## 23.1 Shared plans

Any planned meal added from Nutrition must appear in Grocery Meal Plan.

Any planned meal added from Grocery must appear in Nutrition Meal Plan.

## 23.2 Inventory projection

Planning a meal may calculate:

- available ingredients
- missing ingredients
- projected remaining inventory

It must not alter actual inventory.

## 23.3 Actual depletion

Inventory depletion occurs only when:

- The meal is logged through Nutrition.
- The user confirms the existing save action.
- Existing compatible Grocery depletion logic succeeds.

## 23.4 Missing ingredients

Future supported action:

`Add missing to Grocery`

This action should add only missing quantities and preserve existing inventory merge rules.

It is not required for the first Nutrition Meal Plan release unless already supported by the Grocery tab.

---

# 24. Recipe and Chef Compatibility

Meal plan items must be designed to support future recipe references without forcing recipe implementation into this release.

A recipe-linked plan item should eventually provide:

- recipe ID
- serving count
- ingredients
- nutrition per serving
- Grocery availability
- missing ingredients
- preparation information

The Meal Plan schema must therefore support nullable `recipe_id` now, even if no recipe picker is shipped in the first phase.

This prevents rebuilding Meal Plan when the Chef recipe system expands.

---

# 25. Schedule Integration

Future MEAL Events may open the Nutrition form directly to Meal Plan.

Potential behavior:

- Open the current Creator day.
- Highlight the next planned meal.
- Show remaining calories and macros.
- Allow `Log meal`.
- Preserve the distinction between the MEAL Time Block container and the scheduled Event.

This is a future integration and must not block the first release.

---

# 26. Loading, Empty, and Error States

## 26.1 Loading

Use compact skeletons for:

- daily target
- logged totals
- planned meals
- weight trend

Avoid blocking the entire Nutrition form when only one section is loading.

## 26.2 No active target

Show profile setup empty state.

## 26.3 No planned meals

Show:

“No meals planned. Use your remaining targets to decide as you go.”

Actions:

- Add food
- Add saved meal

## 26.4 No logged food

Show:

“Nothing logged for this Creator day.”

Do not label the user as behind.

## 26.5 Missing nutrition values

Show:

“Some foods are missing complete nutrition information. Totals may be incomplete.”

Identify affected foods when expanded.

## 26.6 Calculation error

Show:

“We could not calculate a target from the current profile. Review your height, weight, age, and calculation settings.”

## 26.7 Adjustment data insufficient

Show:

“More completed days and weight check-ins are needed before CREATOR can evaluate this target.”

---

# 27. Accessibility

Requirements:

- All progress indicators have accessible names and numerical text.
- Progress meaning cannot rely only on color.
- Target and macro controls are keyboard accessible.
- Touch targets meet mobile usability expectations.
- Collapsible sections expose expanded state.
- Form errors are associated with their fields.
- Dynamic target recalculation is announced through a restrained status region.
- Unit labels remain visible.
- Screen readers can distinguish Logged, Planned, and Projected values.
- Reduced-motion preferences are respected.

---

# 28. Privacy and Security

Nutrition profile, weight, goal, and meal data are sensitive health-adjacent information.

The FTC specifically includes diet, fitness, and wellness tracking applications within mobile health privacy considerations, even when HIPAA does not apply.

Requirements:

- All new tables use user-scoped Row Level Security.
- Users may only read and modify their own records.
- Do not place weight, BMI, pregnancy status, calorie target, or macro values in analytics payloads.
- Do not log raw profile request bodies.
- Do not expose sensitive fields in URLs.
- Do not send nutrition data to advertising systems.
- Use first-party persistence.
- Include profile, goal, target, and weight records in user data deletion.
- Include them in future data export.
- Document health-data handling in the privacy policy before broad release.
- Avoid storing date of birth when age-in-years is sufficient.
- Preserve an audit trail for goal changes without exposing it publicly.

---

# 29. Analytics

Permitted product events:

- `nutrition_meal_plan_opened`
- `nutrition_target_setup_started`
- `nutrition_target_setup_completed`
- `nutrition_goal_created`
- `nutrition_daily_override_created`
- `nutrition_weight_checkin_created`
- `nutrition_adjustment_viewed`
- `nutrition_adjustment_accepted`
- `nutrition_adjustment_dismissed`
- `meal_plan_item_added`
- `meal_plan_item_logged`

Do not include:

- weight
- BMI
- age
- formula sex
- pregnancy status
- calorie amount
- macro amount
- goal weight
- food details

Useful aggregate metrics:

- Meal Plan tab adoption.
- Setup completion rate.
- Percentage of users using manual targets.
- Planned-to-logged conversion.
- Adjustment acceptance rate.
- Adjustment dismissal rate.
- Error rate.
- Target-history creation rate.
- Number of users with enough data for suggestions.

---

# 30. Likely Implementation Areas

These are probable locations and must be verified against the current worktree before editing.

## Existing integration surface

- `src/components/notes/NoteSlashTextarea.tsx`
- Existing Grocery Meal Plan renderer
- Existing Nutrition tab renderer
- Existing Nutrition meal-save flow
- Existing Grocery depletion flow

## New narrow modules

- nutrition target formulas
- macro allocation
- target types
- weight-trend analysis
- adjustment suggestions
- API validation schemas

## API areas

- nutrition profile
- goal versions
- daily targets
- meal plan
- weight check-ins
- adjustment review

## Persistence

- Supabase migrations
- generated Supabase types
- Row Level Security policies

The implementation should mount new focused components into the current large form surface rather than adding thousands of additional lines directly to one renderer.

No broad refactor of `NoteSlashTextarea.tsx` is required, but the new Meal Plan UI should preferably be isolated in a dedicated component with narrow props.

---

# 31. Release Phases

## Phase 0 — Repository audit

Deliverables:

- Identify the current Grocery Meal Plan tab renderer.
- Identify its state and persistence model.
- Identify the Nutrition tab system.
- Identify the authoritative Nutrition daily totals.
- Identify existing profile, body-weight, or fitness data that may be reused.
- Confirm Creator-day handling.
- Produce an implementation map without edits.

## Phase 1 — Shared Meal Plan tab parity

Deliverables:

- Add Meal Plan tab to Nutrition.
- Read the existing shared Grocery plan.
- Add and remove planned foods or saved meals.
- Display planned nutrition totals.
- Log a planned item through the existing Nutrition path.
- Preserve Grocery depletion only on actual logging.

No target calculator is required to validate tab parity.

## Phase 2 — Profile and target engine

Deliverables:

- Nutrition profile persistence.
- Target preview endpoint.
- Mifflin–St Jeor calculation.
- Activity coefficient.
- Lose, maintain, gain, and recomp modes.
- Macro calculations.
- Manual target support.
- Immutable goal versions.
- Daily target snapshots.
- Calculation explanation.

## Phase 3 — Daily progress

Deliverables:

- Calorie progress.
- Macro progress.
- Logged, planned, projected, and remaining values.
- Creator-day behavior.
- Daily override.
- Incomplete nutrition warnings.

## Phase 4 — Weight trends

Deliverables:

- Weight check-ins.
- Seven-day averages.
- Fourteen-day comparison.
- Nutrition-day completion.
- Trend display.

## Phase 5 — Adjustment suggestions

Deliverables:

- Hold, increase, reduce, and maintenance-break suggestions.
- Data-quality gate.
- Confirmation flow.
- Adjustment history.
- Target-version creation after acceptance.
- Pause and dismiss controls.

## Phase 6 — Recipes and inventory intelligence

Deliverables:

- Recipe plan items.
- Meal suggestions from available Grocery inventory.
- Ingredient gaps.
- Add missing ingredients.
- Future Chef integration.

---

# 32. Testing Requirements

## 32.1 Formula unit tests

Test:

- BMI metric calculation.
- Mifflin male equation.
- Mifflin female equation.
- Activity coefficients.
- Maintenance calculation.
- Loss caps.
- Gain caps.
- Rounding.
- Manual override.
- Macro allocation.
- Negative carb detection.
- Macro calorie reconciliation.
- Age gating.
- Unsupported profile states.

Use fixed known inputs and exact expected outputs.

## 32.2 Property tests

Verify:

- Calculated macro calories remain within tolerance of target calories.
- Fat floor is not violated.
- Protein strategy remains deterministic.
- Deficit never exceeds configured caps.
- Surplus never exceeds configured caps.
- An adjustment cannot cross a hard automatic floor.
- Old goal versions remain immutable.
- Daily overrides do not mutate the active goal.

## 32.3 API integration tests

Test:

- Create profile.
- Preview target.
- Create goal version.
- Fetch daily snapshot.
- Change profile without rewriting the active target.
- Recalculate and create a new version.
- Create daily override.
- Add weight check-in.
- Create adjustment preview.
- Accept adjustment.
- Reject unauthorized cross-user access.

## 32.4 Meal Plan integration tests

Test:

- Grocery and Nutrition read the same plan.
- A Nutrition-added item appears in Grocery.
- A Grocery-added item appears in Nutrition.
- Planning does not deplete inventory.
- Logging does deplete inventory through the existing path.
- Planned servings are preserved.
- Removed plan items do not affect logged entries.
- Creator-day date is consistent across forms.

## 32.5 UI tests

Test:

- Meal Plan tab appears in Nutrition.
- First-use setup state.
- Manual-target path.
- Calculated-target path.
- Macro errors.
- Loading states.
- Progress over 100%.
- Daily override indicator.
- Mobile scrolling.
- Keyboard navigation.
- Collapse state.
- iPhone safe areas.
- Capacitor sheet behavior.

## 32.6 Adjustment tests

Test:

- No suggestion before enough data.
- No suggestion with incomplete logs.
- Hold when inside tolerance.
- Reduce on persistently slow loss.
- Increase on overly rapid loss.
- Increase on persistently slow gain.
- Reduce on overly rapid gain.
- No repeat adjustment inside 14 days.
- Paused adjustments remain paused.
- Accepted suggestion creates a new goal version.
- Dismissed suggestion preserves the current goal.

---

# 33. Acceptance Criteria

The complete feature is accepted when:

1. The Nutrition form contains a functioning Meal Plan tab.

2. Grocery and Nutrition display the same meal plan data.

3. Planned meals are distinct from consumed meals.

4. Planning a meal does not alter Grocery inventory.

5. Logging a planned meal uses the existing Nutrition and Grocery-depletion behavior.

6. Users can create a calculated or manual calorie target.

7. The calculated target shows the inputs, formula, maintenance estimate, and goal adjustment.

8. Users can set protein, carbohydrate, and fat targets.

9. Daily progress follows the 4:00 AM Creator-day boundary.

10. Historical target values do not change after a new goal is created.

11. Weight check-ins produce a smoothed trend.

12. Adjustment suggestions require sufficient data.

13. No adjustment is automatically applied.

14. Users can pause, dismiss, accept, or override recommendations.

15. The feature works on iPhone-sized screens and through Capacitor.

16. Sensitive health values are excluded from product analytics and ordinary server logs.

17. Focused unit, integration, UI, RLS, and regression tests pass.

---

# 34. Success Metrics

Initial success should be measured by:

- Percentage of Nutrition users opening Meal Plan.
- Percentage completing target setup.
- Percentage choosing calculated versus manual targets.
- Planned meals logged from the plan.
- Reduction in repeated Nutrition-form navigation.
- Percentage of active users completing at least seven Nutrition days.
- Percentage entering enough weight data for a trend.
- Adjustment acceptance and dismissal rates.
- Number of support reports concerning confusing targets.
- Number of users overriding the initial maintenance estimate.
- Error-free Grocery depletion after logging planned meals.

Do not optimize for:

- Maximum calorie logging.
- Maximum weigh-in frequency.
- Maximum deficit size.
- Maximum adjustment acceptance.

---

# 35. Risks and Mitigations

## Risk: Formula presented as truth

Mitigation:

- Use estimated language.
- Show calculation details.
- Support manual maintenance.
- Adapt from trends.

## Risk: Nutrition form becomes too bulky

Mitigation:

- Use a dedicated Meal Plan component.
- Keep profile settings collapsed.
- Show summary first.
- Use progressive disclosure.
- Avoid rendering every calculation input permanently.

## Risk: Grocery and Nutrition drift apart

Mitigation:

- Shared APIs.
- Shared plan IDs.
- Shared target snapshots.
- Shared types.
- Cross-surface integration tests.

## Risk: Aggressive repeated calorie reductions

Mitigation:

- 14-day minimum.
- Data-quality checks.
- Small increments.
- Hard floors.
- Explicit acceptance.
- Maintenance-break option.

## Risk: Inaccurate activity coefficient

Mitigation:

- Behavior-based descriptions.
- Store exact coefficient.
- Manual maintenance override.
- Trend calibration.
- Explain uncertainty.

## Risk: Weight noise causes false recommendations

Mitigation:

- Seven-day averages.
- Two-window confirmation.
- Minimum weigh-in count.
- No single-day reactions.

## Risk: Sensitive data leakage

Mitigation:

- RLS.
- Data minimization.
- No health values in analytics.
- No raw profile logs.
- User deletion and export support.

## Risk: Overbuilding before recipe infrastructure is ready

Mitigation:

- Support nullable recipe references.
- Ship foods and saved meals first.
- Add Chef integration later.

---

# 36. Product Decisions Established by This PRD

The following should be treated as approved defaults unless deliberately changed before implementation:

1. Nutrition receives a Meal Plan tab.

2. Grocery and Nutrition share one plan.

3. Flexible planning is the default.

4. Planning does not equal logging.

5. Mifflin–St Jeor is the default resting equation.

6. Manual calories are always supported.

7. BMI is contextual and secondary.

8. Adult BMI labels begin at age 20.

9. Initial targets are estimates.

10. Targets and goals are versioned.

11. Creator day begins at 4:00 AM.

12. Calories use the primary progress bar.

13. Macros use secondary progress rows.

14. Protein and fat are set first; carbohydrates receive remaining calories.

15. Adaptive changes are suggestions only.

16. Accepted changes create a new goal version.

17. Adjustments occur no more frequently than every 14 days.

18. Adjustment increments are normally 100–150 kcal.

19. Grocery inventory changes only after actual Nutrition logging.

20. Recipes are supported structurally but are not required for the first release.

---

# 37. Implementation Sequence

The recommended implementation sequence is:

1. Run an ask-only repository audit.

2. Mirror the existing Grocery Meal Plan tab into Nutrition using shared data.

3. Establish the profile, goal-version, and daily-target schema.

4. Implement pure calculation functions and tests.

5. Implement server-side preview and save APIs.

6. Add target onboarding and manual override UI.

7. Connect daily Nutrition totals to target progress.

8. Add planned-versus-logged projections.

9. Add weight check-ins and smoothed trends.

10. Add suggestion-only adaptive adjustments.

11. Add recipe and inventory intelligence after the shared recipe system is authoritative.

This sequence prevents the target engine, Meal Plan UI, and Grocery integration from being built as one oversized untestable change.
