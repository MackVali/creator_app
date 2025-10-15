# Manager Subscription Role Implementation Plan

## Overview
The "Manager" role expands on the existing "Creator" free tier to unlock richer team and workflow management features. The goal is to introduce a paid subscription tier that layers premium capabilities on top of Creator while preserving backwards compatibility for current users.

## Guiding Principles
- **Incremental adoption** – allow existing Creator accounts to upgrade seamlessly without breaking current flows.
- **Feature gating** – all premium functionality must be guarded by role checks so future tiers can be added with minimal code churn.
- **Shared infrastructure** – reuse existing billing, authentication, and authorization primitives wherever possible.

## Functional Requirements
1. **Role definition**
   - Add `manager` to the canonical list of roles. Ensure the enum or lookup lives in a single source of truth (e.g., `types/roles.ts`).
   - Make role metadata (name, price, limits, feature flags) available to both the app and backend services.

2. **Subscription lifecycle**
   - Extend billing provider (Stripe) plans/products with a Manager SKU.
   - Support upgrade from Creator to Manager with proration.
   - Provide downgrade path back to Creator while preserving data but hiding gated features.

3. **Access control**
   - Audit all feature checks currently hardcoded for Creator. Introduce centralized helper (e.g., `hasFeature(user, featureFlag)`).
   - Map Manager role to additional feature flags such as team analytics, advanced scheduling, bulk content operations, and priority support.
   - Update API routes, RPCs, and Supabase policies to respect the new role.

4. **Data model updates**
   - If roles are stored in `profiles` or `teams` tables, add migration to allow new value.
   - Store subscription metadata (plan id, renewal date, status) in an accessible location for both frontend and backend.

5. **Onboarding & UX**
   - Design upgrade CTA surfaces: settings > billing, upsell modals, feature paywalls.
   - Provide role-specific dashboards or navigation items; hide Manager-only elements for Creator users.
   - Communicate benefits (tooltips, comparison table) and show current plan status.

6. **Analytics & telemetry**
   - Track upgrade/downgrade funnel events (view paywall, start checkout, complete checkout, churn reason).
   - Monitor feature adoption for Manager-exclusive tools.

## Technical Tasks
1. **Role constants & types**
   - Update shared enums/interfaces (TypeScript types, Supabase row types).
   - Regenerate types if using `supabase gen types`.

2. **Database migration**
   - Create migration (SQL) to insert `manager` into lookup tables or update constraints.
   - Ensure row-level security and Supabase policies include new role in allowed sets.

3. **Backend services**
   - Expand any edge functions or API routes handling subscription webhooks to recognize `manager` SKU.
   - Update webhook handlers to set the correct role and feature entitlements on checkout success/cancel events.

4. **Frontend updates**
   - Add Manager plan card with pricing, features, and CTA.
   - Update billing settings page to show upgrade/downgrade controls and plan status.
   - Implement feature flag utility consumed by components to toggle Manager capabilities.

5. **Testing & QA**
   - Unit tests for role helper functions and gating logic.
   - Integration tests simulating upgrade/downgrade flows and verifying UI updates.
   - Manual regression for billing flows in staging.

## Rollout Strategy
1. **Feature flag** the new role to internal accounts first.
2. **Seed test accounts** with Manager subscriptions to validate end-to-end flow.
3. **Soft launch** with marketing and support prepared to handle questions.
4. **Monitor metrics** (conversion, churn, support tickets) and iterate on onboarding.

## Open Questions
- Pricing strategy and billing interval (monthly vs annual discounts).
- Whether Manager adds seats or is still a single-seat plan with team collaboration features.
- Migration plan for any beta users already testing Manager capabilities.

