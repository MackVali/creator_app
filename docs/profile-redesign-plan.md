# Premium Profile Experience — Mini Codex PRD Prompts

The following prompts refine the vision for a premium, mobile-first profile experience inspired by the provided references. Each prompt is scoped so it can be handed to a feature team (or model) to generate a detailed PRD or implementation plan without ambiguity.

---

## Prompt 1 — "Hyper-Visual Profile Shell"
**Goal**: Deliver a cinematic, mobile-first profile layout that instantly communicates brand personality and social proof.

**Use this prompt**:
> "Draft a PRD for a `Hyper-Visual Profile Shell` that replaces the current profile hero with an immersive background, floating avatar, and action badges. Include requirements for gradients/video backgrounds, avatar treatments, trust badges, and sticky contact buttons. Document accessibility, performance budgets, and loading skeleton expectations."

**Primary outcomes**
- Edge-to-edge hero with gradient/video support and parallax scroll.
- Floating identity card with verified badge, pronouns/location chips, and one-tap contact buttons.
- Sticky action row that keeps core CTAs in view during scroll.

**Dependencies**
- Needs theme tokens and media handling groundwork (from Prompt 2).
- Can run in parallel with module redesigns once shared spacing/typography tokens exist.

**Deliverable**
- [PRD — Hyper-Visual Profile Shell](prd/hyper-visual-profile-shell.md)

---

## Prompt 2 — "Profile Themes & Visual System"
**Goal**: Establish a theming foundation so users can choose premium presets without sacrificing performance or accessibility.

**Use this prompt**:
> "Create a PRD for `Profile Themes & Visual System` covering Tailwind/CSS variable tokens, gradient libraries, glassmorphism layers, and motion guidelines. Include editor controls for selecting themes, previewing changes, and saving presets. Detail how the system supports future premium upsells."

**Primary outcomes**
- Theme tokens (colors, typography scales, spacing) stored per user.
- Ambient effects (blurs, glows, grain) applied consistently across modules.
- Live preview inside profile editor with instant theme switching.

**Dependencies**
- Blocks all other visual refresh work; must land before shell/modules to avoid rework.
- Can run concurrently with analytics/instrumentation planning.

---

## Prompt 3 — "Modular Link & Media Blocks"
**Goal**: Transform the link list into swipeable, reorderable modules for links, products, media, and testimonials.

**Use this prompt**:
> "Write a PRD for `Modular Link & Media Blocks` that defines content modules (featured carousel, link cards, social proof strip, embedded media accordions). Specify data contracts, drag-and-drop ordering, and responsive behaviors. Include empty states, loading skeletons, and analytics events."

**Primary outcomes**
- Config-driven module renderer supporting reorderable sections.
- Swipeable product/service cards with pricing and CTA buttons.
- Collapsible media embeds to manage page length on mobile.

**Dependencies**
- Requires theme tokens (Prompt 2) for consistent styling.
- Requires data model updates (Prompt 4) for storing module configuration.
- Can be developed in parallel with scheduling/ticketing once schemas exist.

---

## Prompt 4 — "Profile Data Model Expansion"
**Goal**: Update Supabase schemas and APIs to persist new modules, theme selections, and commerce-ready metadata.

**Use this prompt**:
> "Produce a PRD for `Profile Data Model Expansion` covering new fields/tables for themes, CTA buttons, product/service listings, testimonials, business info, and scheduling availability. Detail migration strategy, caching, and public API read models. Include performance limits and privacy considerations."

**Primary outcomes**
- Extended `profiles` table for theme + CTA metadata.
- New relational tables for products/services, testimonials, events, and availability slots.
- Optimized public profile query with caching layer for fast global loads.

**Dependencies**
- Must precede feature work that surfaces new modules (Prompts 3, 5, 6).
- Can be staged ahead of visual work; migrations can happen first while UI remains unchanged.

---

## Prompt 5 — "Ticketing & Event Showcase"
**Goal**: Launch tour date and ticket modules resembling the provided reference, optimized for mobile scanning and conversion.

**Use this prompt**:
> "Draft a PRD for `Ticketing & Event Showcase` including horizontal and vertical variants, time zone handling, ticket CTA states, and deep links to third-party ticketing providers. Capture analytics requirements and fallback states when events sell out."

**Primary outcomes**
- Scrollable tour date cards with localized date/time formatting.
- Prominent ticket buttons with status badges (Available, Low stock, Sold out).
- Optional countdown timer for upcoming shows.

**Dependencies**
- Requires data model support for events (Prompt 4).
- Requires modular renderer (Prompt 3) to place event blocks.
- Can run concurrently with merch/services module (Prompt 6) once schemas are ready.

---

## Prompt 6 — "Merch & Services Commerce Modules"
**Goal**: Provide monetization blocks for physical merch and bookable services with high-impact visuals.

**Use this prompt**:
> "Compose a PRD for `Merch & Services Commerce Modules` that outlines product card layouts, price display rules, inventory badges, and CTA behaviors (add to cart, external checkout, book now). Include support for appointment duration/price and integration hooks for payment providers."

**Primary outcomes**
- Carousel/grid cards for merch with pricing and stock messaging.
- Services block with duration, price, and booking CTA linking to scheduler or in-app flow.
- Analytics events for impressions, clicks, and conversions.

**Dependencies**
- Requires product/service schemas (Prompt 4).
- Shares theming tokens (Prompt 2) and module renderer (Prompt 3).
- Can run in parallel with scheduling integration (Prompt 7) if API contracts are defined.

---

## Prompt 7 — "Scheduling & Availability Integration"
**Goal**: Enable creators to surface bookable appointments directly on the profile, aligned with the provided design references.

**Use this prompt**:
> "Prepare a PRD for `Scheduling & Availability Integration` specifying availability data ingestion, booking CTA behavior, confirmation flows, and third-party calendar sync. Include safeguards for double-booking and fallback when no slots are available."

**Primary outcomes**
- Availability widget showing upcoming slots with quick book buttons.
- Integration with external scheduling APIs (Calendly, Acuity) or internal booking service.
- Confirmation and reminder touchpoints (email/SMS triggers).

**Dependencies**
- Depends on data model expansion (Prompt 4) for storing availability and bookings.
- Can develop alongside merch/services if API provider differs, but UI depends on module renderer (Prompt 3).

---

## Prompt 8 — "Monetization & Premium Upsell Strategy"
**Goal**: Define how premium themes and advanced modules are packaged, priced, and surfaced to drive revenue.

**Use this prompt**:
> "Author a PRD for `Monetization & Premium Upsell Strategy` detailing paywall logic, upgrade flows, free vs. premium feature gating, and analytics to measure conversion. Include lifecycle messaging (email, in-app nudges) and success metrics."

**Primary outcomes**
- Clear delineation of free vs. premium modules/themes.
- Upgrade CTA placement within profile editor and public profile.
- Telemetry dashboards tracking adoption and revenue per user.

**Dependencies**
- Can proceed after foundational theming/data model work is scoped (Prompts 2 & 4) since it references their outputs.
- Should inform prioritization of modules developed in Prompts 3, 5, 6, and 7.

---

## Prompt 9 — "Analytics & Experimentation Framework"
**Goal**: Ensure every new module/action is instrumented and comparable to the legacy profile performance.

**Use this prompt**:
> "Generate a PRD for `Analytics & Experimentation Framework` capturing event schemas, click-through funnels, A/B test setup, and dashboards. Document success metrics aligned with premium profile goals."

**Primary outcomes**
- Unified event taxonomy for profile interactions (CTA clicks, module impressions, conversions).
- Experimentation plan for testing new themes/modules against control groups.
- Reporting dashboards for marketing and product teams.

**Dependencies**
- Can kick off in parallel with Prompts 2 and 4.
- Must be completed before GA launch to capture baseline metrics.

---

## Sequencing & Parallelization Overview
1. **Foundational Phase** (Prompts 2, 4, 9)
   - Run themes/system (2) and analytics planning (9) concurrently.
   - Start data model expansion (4) immediately; ship migrations behind feature flags.
2. **Experience Core** (Prompts 1, 3)
   - Once theme tokens exist, tackle shell (1) and modular blocks (3) together, sharing design reviews.
3. **Commercial Modules** (Prompts 5, 6, 7)
   - Kick off event showcase (5) and merch/services (6) concurrently after module renderer is stable.
   - Scheduling integration (7) follows data model completion but can overlap with merch/services if API contracts are ready.
4. **Monetization Layer** (Prompt 8)
   - Begin after core experience is feature-complete enough to define paywall tiers; depends on outputs from 1–7.
5. **Rollout & Measurement**
   - Use analytics framework (9) to run controlled rollouts; ensure monetization strategy (8) informs beta and GA gates.

This structure clarifies scope, sequencing, and interdependencies so each mini PRD can be generated and executed with minimal ambiguity.
