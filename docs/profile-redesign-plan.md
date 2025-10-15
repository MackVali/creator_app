# Profile Page Redesign Implementation Plan

## 1. Objectives & Audience Alignment
- Deliver a mobile-first, premium experience that mirrors modern link-in-bio products (e.g., Linktree, link.me) while showcasing individual creators and small-business owners.
- Prioritize quick scanning, personality-driven visuals, and clear CTAs for promoting services, products, and social content.
- Maintain accessibility (WCAG 2.1 AA) and fast load times despite high visual polish.

## 2. Current Experience Audit (Key Files)
- `src/app/(app)/profile/LinkMeProfile.tsx`: Primary profile rendering logic, currently mixing data fetching, layout, and UI state.
- `src/app/(app)/profile/ProfileContent.tsx`: Secondary layout for content cards and social links.
- `src/app/(app)/u/[username]/PublicProfileContent.tsx`: Public view used for discovery/SEO, needs parity with redesigned visuals.
- `src/components/profile/ProfileSkeleton.tsx`: Loading state; must match the redesigned skeleton shimmer.

## 3. Information Architecture (Mobile-First)
1. **Hero Stack**
   - Edge-to-edge banner with gradient overlays and optional video loop.
   - Floating avatar card with verified badge, pronouns, city, and tap-to-call/email CTAs.
2. **Primary Action Row**
   - Sticky row of customizable buttons ("Book a Call", "Shop Collection", "Join Newsletter") with icons.
3. **Content Modules** (user-reorderable)
   - Featured carousel for product cards/services (swipeable, 3D tilt).
   - Link list using tiered emphasis (Primary highlight cards, secondary compact chips).
   - Social proof strip (testimonials, follower counts).
   - Embedded media (Reels/TikTok, Spotify, YouTube) in collapsible accordions to control page length.
4. **Trust & Conversion Footer**
   - Newsletter capture, location badge, business hours, and compliance/legal links.

## 4. Visual Design System
- Introduce a **"Profile Themes"** config (gradient backgrounds, typography presets, button radii, ambient shadows).
- Use Tailwind `@layer` utilities to add glassmorphism (blurred cards), neon glows, and subtle grain textures.
- Leverage CSS variables for dynamic theming (e.g., `--profile-accent`, `--profile-surface`).
- Motion: micro-interactions via `framer-motion` for button press, card hover (tap) depth, and sticky CTA transitions.

## 5. Component Refactors & New Modules
| Area | Actions |
| --- | --- |
| `LinkMeProfile.tsx` | Split into container (`LinkMeProfile`) and presentation components: `ProfileHero`, `ProfileActionRow`, `ProfileModules`. Use Suspense/React Query for async data. |
| `ProfileContent.tsx` | Replace with modular renderer that accepts a `modules` config describing layout order and card types. |
| New components | `ProfileThemeProvider`, `ProfileCarousel`, `ProfileLinkCard`, `SocialProofStrip`, `ProfileFooter`. |
| Customization UI | Extend `/profile/edit` to include theme selector, button styles, module toggles, and preview. |
| Analytics hooks | Add click tracking via `useProfileAnalytics` (sends events to Supabase or Segment). |

## 6. Data Model & API Updates
- Extend `profiles` table to store `theme`, `accent_color`, `module_order`, `cta_links`, `testimonials`, `business_info` JSON fields.
- Create new tables for `profile_products` and `profile_services` to allow curated items with pricing, URLs, media.
- Update Supabase RPC/queries in `@/lib/db` to hydrate new modules efficiently.
- Introduce caching layer (Edge-friendly) for public profile fetches to ensure fast global loads.

## 7. Customization Experience Enhancements
- Live preview mode on `/profile/edit` using a split-view mobile frame component.
- Drag-and-drop ordering for modules (use `@dnd-kit/core`), inline editing of CTA text and URLs.
- Theme presets (e.g., "Luxury", "Vibrant Creator", "Wellness") plus advanced custom controls for power users.
- Asset management: integrate with existing upload pipeline for high-res banner/video and avatar, auto-generate blurhash placeholders.

## 8. Progressive Rollout Strategy
1. Build new theming + module components behind a feature flag (`profile_v2`).
2. Enable opt-in for beta testers; gather qualitative feedback.
3. Ship analytics instrumentation to measure click-through and completion rates vs. current design.
4. When metrics improve, migrate remaining users and deprecate legacy layout.

## 9. Quality Assurance Checklist
- Responsive snapshots at 360px, 414px, and 768px widths.
- Accessibility: color contrast, focus states, screen reader labels for action buttons and module titles.
- Performance budgets (<2.5s LCP on 4G); audit via Lighthouse.
- Cross-browser verification (iOS Safari, Chrome Android, desktop fallback).
- Regression tests: add Storybook visual regression or Percy snapshots for key components.

## 10. Delivery Timeline (Aggressive 3-sprint outline)
- **Sprint 1:** Data model updates, theming system foundation, refactor `LinkMeProfile` container.
- **Sprint 2:** Build hero/action row/modules, integrate customization UI, launch beta flag.
- **Sprint 3:** Polish animations, analytics, QA/lighthouse runs, rollout + documentation.

## 11. Success Metrics
- +20% increase in CTA click-through rates vs. baseline.
- +15% increase in profile completion rate during onboarding.
- Retention: 80% of beta users adopt at least one premium theme or CTA module.

## 12. Open Questions & Next Steps
- Confirm backend capacity for storing larger media (video banners) and CDN strategy.
- Decide on monetization toggles (e.g., premium themes behind paywall?).
- Validate legal requirements for international businesses (address display, VAT IDs).
- Schedule design review with brand team to finalize gradients, iconography, and typography pairings.

