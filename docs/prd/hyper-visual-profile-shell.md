# PRD — Hyper-Visual Profile Shell

## Overview
The Hyper-Visual Profile Shell reimagines the profile hero as a cinematic, mobile-first stage that immediately communicates a creator's brand personality and credibility. It replaces the legacy static banner with an edge-to-edge background, introduces a floating identity card, and keeps mission-critical calls-to-action (CTAs) persistently available as visitors scroll.

## Goals & Success Metrics
- **Increase profile engagement:** +20% lift in hero interaction rate (background toggles, CTA taps) within 30 days of launch.
- **Improve conversion:** +15% increase in clicks on primary CTAs (contact, book, shop) versus control profiles.
- **Elevate perceived trust:** >75% of surveyed users rate profiles as "premium" or "trustworthy" in post-launch UX studies.
- **Performance guardrails:** Maintain <2.5s Largest Contentful Paint (LCP) on 4G connections and <75 CLS.

## Target Users & Use Cases
- **Creators & entrepreneurs** configuring their link-in-bio presence to express brand identity and drive conversions.
- **Fans and customers** discovering services, upcoming events, or merchandise and needing quick access to CTAs.
- **Potential partners/press** evaluating credibility based on social proof and professional presentation.

Primary journeys include profile viewing on mobile, quick contact initiation, browsing offerings, and scanning trust signals (verification, testimonials, partnerships).

## Assumptions
- Theme tokens, media handling, and asset optimization pipelines exist per "Profile Themes & Visual System" work.
- Profiles already surface modular content blocks lower on the page (links, merch, events) and expose analytics instrumentation hooks.
- User-uploaded media complies with content guidelines and has fallbacks for unsupported formats.

## Dependencies
- **Blocking:** Theme token system (colors, typography, spacing) and media processing/CDN capabilities to deliver gradient presets, animated/video backgrounds, and responsive imagery.
- **Parallel:** Module redesigns can progress simultaneously once shell spacing/typography tokens are defined. Analytics instrumentation updates can be implemented alongside shell development.

## Out of Scope
- New monetization paywalls, subscription gating, or premium upsell flows (handled by Monetization PRD).
- Editor rearchitecture beyond controls needed to configure shell backgrounds, badges, and CTAs.
- Desktop-specific enhancements beyond ensuring responsive behavior scales gracefully to tablet/desktop widths.

## Experience Principles
1. **Cinematic first impression:** immersive visuals with smooth motion and subtle depth cues.
2. **Always actionable:** primary CTAs remain visible without obstructing content.
3. **Trust-forward:** verification, accolades, and social proof are prominent yet tasteful.
4. **Accessible premium:** high contrast, motion sensitivity controls, and assistive semantics are first-class.

## Functional Requirements
### A. Hero Background System
- **Media support:** Users select from gradient presets, upload custom imagery (PNG/JPG/WebP), or loop-friendly video clips (MP4/WebM up to 15s). Videos autoplay muted, loop, and pause when offscreen.
- **Parallax layers:** Foreground content (avatar card) floats above background with configurable parallax depth (0–24px shift) responding to scroll.
- **Adaptive theming:** Background choice drives ambient glow overlays and complementary text/icon colors via theme tokens.
- **Fallbacks:** If media fails to load, display gradient fallback with matching dominant colors extracted from last successful asset.

### B. Floating Identity Card
- **Avatar treatments:** Support circular, rounded-square, and full-bleed frame options. Avatar overlaps hero background with soft drop shadow and optional halo ring derived from theme colors.
- **Verification & trust badges:** Display verified badge, partner logos, accolade chips, and follower counts. Badges accept icons + short labels and include tooltips for assistive text.
- **Identity metadata:** Surface display name, pronouns, location chips, and tagline. Chips use pill styling with subtle glassmorphism to contrast background.
- **Action badges:** Offer configurable quick-action pills (e.g., "Watch Latest", "Read Press Kit") linking to internal modules or external URLs.

### C. Sticky Contact Row
- **Persistent CTAs:** Primary buttons (Contact, Book, Shop) remain docked at bottom of viewport on mobile once user scrolls past hero fold. On initial load they animate in after hero assets stabilize (<600ms delay).
- **State awareness:** Buttons reflect availability (e.g., Book button disables when no slots). Provide optional secondary actions via overflow sheet.
- **Haptic & motion feedback:** Trigger light haptic feedback (where supported) and micro-interactions on tap while adhering to motion settings.

### D. Interaction & Motion
- **Scroll choreography:** As users scroll, hero background subtly scales (1.05 → 1.0) and opacity eases to 90%. Identity card transitions from centered to pinned near top with reduced scale (0.9) to maintain presence.
- **Editor preview parity:** Profile editor displays real-time preview mirroring public experience, including parallax and sticky behaviors.

## Accessibility Requirements
- Provide semantic landmarks (`header`, `nav`, `main`) and ensure floating card information is reachable via logical tab order.
- Maintain text contrast ratios ≥ 4.5:1 over backgrounds by dynamically sampling colors and applying contrast overlays.
- Offer "Reduce Motion" respect: disable parallax, video autoplay, and complex transitions when user prefers reduced motion.
- Supply alt text for background imagery and descriptive captions for videos; include aria-labels for badges and CTAs.
- Ensure sticky action row is accessible via keyboard and screen readers, with focus outlines and skip links.

## Performance & Reliability
- **Performance budgets:**
  - Hero bundle budget: ≤120KB compressed (excluding shared libraries).
  - Video backgrounds transcoded into 720p max, ≤2.5MB, served via CDN with adaptive streaming.
  - LCP target <2.5s on 4G, <1.2s on Wi-Fi; CLS <0.075.
- **Lazy loading:** Defer heavy media until hero intersects viewport; show skeleton and gradient placeholder during fetch.
- **Caching:** Utilize CDN caching headers and hashed asset URLs. Provide offline fallback (static gradient) when network fails.
- **Error handling:** Graceful degradation to static gradient and non-sticky CTAs if JavaScript disabled.

## Loading Skeletons & Empty States
- Display shimmering skeleton for avatar card (avatar circle, text lines, badge pills) while data resolves (<400ms target).
- Background placeholder uses animated gradient matching selected theme palette until media available.
- Sticky action row shows muted buttons with progress indicator; actions activate once data loads.
- Empty state for missing badges encourages creators to add trust signals via editor CTA.

## Editor & Configuration Requirements
- **Background picker:** Offer tabs for gradients, images, videos with preview thumbnails, upload progress, and validation messaging.
- **Avatar styling controls:** Toggle between frame options, adjust halo intensity, and reorder badges via drag handles.
- **CTA management:** Configure up to three primary buttons with labels, icons, destinations, and state rules (e.g., requires schedule module active).
- **Preview testing:** Provide device frame preview for small, medium, large screen widths and dark/light theme simulation.

## Analytics & Telemetry
- Log hero media impressions, background type selection, badge taps, CTA clicks, and sticky row engagement duration.
- Emit performance metrics (LCP, CLS, TTI) tagged to shell version for experiment tracking.
- Instrument editor usage: background uploads, CTA configuration changes, badge additions.

## Rollout Plan
1. **Alpha (internal creators):** Enable for staff profiles, gather performance data, validate motion/accessibility toggles.
2. **Beta (invite cohort):** Offer opt-in to 5% of verified creators, monitor engagement, run A/B test against legacy hero.
3. **GA:** Gradually roll out to all users with guardrails; provide migration guide and fallback to legacy shell if metrics regress >5%.

## Open Questions
- Should we auto-generate hero themes based on uploaded media dominant colors or rely on manual selection?
- Do we need integrations with external trust providers (e.g., Yotpo reviews) for badges in v1?
- How will sticky CTA row coexist with platform-level nav bars on embedded browsers (Instagram, TikTok)?

## Risks & Mitigations
- **Performance regressions from video backgrounds:** enforce strict upload limits, transcode, and provide static fallback.
- **Accessibility concerns with heavy motion:** respect system settings, provide toggle to disable animations.
- **Editor complexity:** chunk UI into progressive disclosure steps to avoid overwhelming users.

