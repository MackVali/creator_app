# Profile Data Model Expansion

## Objective
Upgrade the Supabase schema so cinematic profiles can persist premium visuals, monetization modules, and scheduling metadata without sacrificing performance or privacy. The expanded model unlocks theming presets, configurable CTAs, product and service merchandising, testimonial blocks, verified business context, and availability-driven booking flows.

## Schema Additions

### `profile_theme_settings`
- **Purpose:** Stores a profile's active preset, gradient, and motion preferences separate from reusable `profile_themes` definitions.
- **Key columns:** `theme_id`, `hero_background_mode`, `gradient_preset`, `custom_colors`, `motion_level`, `typography_scale`, `is_public`.
- **Notes:** One-to-one with `profiles` (unique `profile_id`). Public read gate respects `is_public` to avoid leaking unreleased presets.

### `profile_cta_buttons`
- **Purpose:** Drives floating identity quick actions and sticky CTAs with ordering and analytics metadata.
- **Key columns:** `label`, `href`, `intent`, `icon`, `analytics_event`, `sort_order`, `is_primary`, `is_active`.
- **Notes:** Limited to 12 active CTAs per profile. Policies expose only active rows to anonymous visitors.

### `profile_offers`
- **Purpose:** Normalizes both products and services that feed modular commerce blocks.
- **Key columns:** `offer_type` (`product` | `service`), `price_cents`, `currency`, `media_url`, `inventory_status`, `duration_minutes`, `position`, `tags`, `analytics_event`.
- **Notes:** Capped at 60 active rows per profile to keep bundle payloads <50 KB compressed.

### `profile_testimonials`
- **Purpose:** Stores social proof quotes used in hero and module strips.
- **Key columns:** `quote`, `author_name`, `author_title`, `source_url`, `rating`, `highlight`, `sort_order`, `is_active`.
- **Notes:** Public policy returns only active testimonials to safeguard private feedback drafts.

### `profile_business_info`
- **Purpose:** Captures regulated business metadata for disclosures, contact details, and policies.
- **Key columns:** `legal_name`, `display_name`, `tagline`, `industry`, `website_url`, `contact_email`, `contact_phone`, `address*`, `timezone`, `booking_policy`, `privacy_notice`, `is_public`.
- **Notes:** One-to-one with `profiles`; `is_public` gate prevents accidental disclosure of private contact info.

### `profile_availability_windows`
- **Purpose:** Surfaces bookable schedule slots for services and tours.
- **Key columns:** `start_time`, `end_time`, `timezone`, `status` (`available` | `booked` | `blocked`), `capacity`, `booking_url`, `external_id`, `is_virtual`, `is_public`.
- **Notes:** Indexed by `profile_id` and `start_time` with a `<50` row query ceiling to keep booking payloads snappy.

### `profiles` table extensions
- **New columns:** `tagline`, `business_name`, `business_industry`, `hero_primary_cta_label`, `hero_primary_cta_url`, `hero_secondary_cta_label`, `hero_secondary_cta_url`, `scheduling_provider`, `scheduling_link`, `contact_email_public`, `contact_phone_public`, `availability_last_synced_at`, `active_theme_settings_id`, `hero_background_overlay`, `hero_video_autoplay`, `hero_video_loop`.
- **Notes:** `active_theme_settings_id` back-references `profile_theme_settings` for quick lookups during SSR hydration.

## Migration Strategy
1. **Phase 1 – additive schema:** ship the new tables, enums, indexes, and columns via forward-only migration (`20260311000000_profile_data_model_expansion.sql`). RLS defaults restrict writes to profile owners while exposing only public/active rows to anonymous traffic.
2. **Phase 2 – backfill:** background job populates `profile_theme_settings` from existing hero metadata, seeds CTA buttons from `quick_action_badges`, and migrates commerce/testimonial seeds from feature flags. Backfill runs in idempotent batches to respect row caps.
3. **Phase 3 – cutover:** once data is hydrated, flip UI feature flags so new modules query the normalized tables, then remove deprecated JSON blobs in a future cleanup migration.

## Caching & Read Models
- Introduced `lib/profile/public-profile.ts` with `getPublicProfileReadModel`, a server-only helper that aggregates profile, theme, CTA, offer, testimonial, business, and availability data in one cached payload.【F:lib/profile/public-profile.ts†L1-L194】
- Uses Next.js `unstable_cache` (120 s revalidation) and `revalidateTag` invalidation hook so mutations can purge cached responses after publish events.【F:lib/profile/public-profile.ts†L164-L194】
- Query fan-out leverages dedicated indexes and per-collection limits (CTAs≤12, offers≤60, testimonials≤24, availability≤50) to keep worst-case response generation under ~35 ms on Supabase.

## Public API Read Model
- `PublicProfileReadModel` (see `lib/types.ts`) standardizes the payload for SSR, CDN caching, and third-party API exposure with derived arrays for CTAs, offers, testimonials, and availability windows plus the hydrated `Profile` base record.【F:lib/types.ts†L18-L86】【F:lib/types.ts†L120-L189】
- Future REST/GraphQL endpoints can serialize the read model directly, ensuring consistent privacy filters (`is_public`, `is_active`) regardless of client.

## Performance Limits
- Hard caps outlined above plus server-side filtering to current/future availability keep response sizes predictable (<150 KB JSON before gzip).
- New indexes on `profile_id`, `position`, and `start_time` maintain O(log n) scans even as creators scale inventory.
- `availability_last_synced_at` allows schedulers to detect stale syncs; jobs can throttle ingestion for profiles that exceed 200 windows/day.

## Privacy & Compliance
- Every new table enforces owner-only writes via RLS `WITH CHECK (auth.uid() = user_id)` while anonymous reads require `is_public`/`is_active` gates, preventing leakage of drafts or internal contact info.【F:supabase/migrations/20260311000000_profile_data_model_expansion.sql†L1-L205】
- Contact fields duplicated on `profiles` (`contact_email_public`, `contact_phone_public`) give creators explicit control over what is exposed publicly versus stored privately in `profile_business_info`.
- Testimonial ratings and availability slots respect retention by allowing authors to toggle `is_active`/`is_public` off, immediately hiding data through cached model invalidation.

## Rollout Considerations
- Ship behind an “Expanded Profile Data Model” feature flag. UI continues to read legacy fields until the backfill reaches 100%.
- Coordinate with analytics to update funnels to the new CTA/offer identifiers before turning off the legacy `content_cards` schema.
- Document mutation endpoints so partner integrations (e.g., booking providers) call cache revalidation after updating availability or offers.
