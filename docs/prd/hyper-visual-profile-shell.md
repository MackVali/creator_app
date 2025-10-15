# Mini Codex PRD Prompts — Hyper-Visual Profile Shell

The cinematic profile shell concept is broad, so break the work into the following three prompts. Each prompt is tight enough for Codex to handle without context confusion while still covering the full hero experience.

---

## Prompt A — "Cinematic Hero Background & Motion"
**Goal**: Replace the static banner with an edge-to-edge hero that supports gradients, imagery, and short looping video while delivering a smooth parallax scroll experience.

**Use this prompt**:
> "Draft a PRD for `Cinematic Hero Background & Motion` that defines gradient presets, custom media uploads (image/video), autoplay/loop rules, parallax depth ranges, and fallback behaviors. Include performance budgets, lazy loading strategy, accessibility accommodations for reduced motion, and loading skeleton expectations."

**Primary outcomes**
- Gradient/video background system with ambient theming and parallax.
- Motion choreography that scales and fades hero media as users scroll.
- Skeleton and fallback states that preserve LCP/CLS targets on 4G networks.

**Dependencies**
- Requires theme tokens/media handling groundwork.
- Can run alongside Prompt B once shared spacing tokens ship.

---

## Prompt B — "Floating Identity & Trust Layer"
**Goal**: Introduce a floating identity card that centers the creator’s avatar, pronouns, location, tagline, and trust badges without sacrificing readability over cinematic media.

**Use this prompt**:
> "Draft a PRD for `Floating Identity & Trust Layer` covering avatar framing options (circle, rounded-square, halo), verification and partner badges, pronoun/location chips, and quick action badges (e.g., Watch, Read). Document contrast management, assistive text/ARIA, tooltip semantics, and skeleton/empty states."

**Primary outcomes**
- Floating identity card with avatar treatments and trust signals.
- Chips/badges that remain legible over dynamic backgrounds.
- Accessibility coverage for screen readers, keyboard focus, and alt text.

**Dependencies**
- Needs theme tokens and parallax anchors from Prompt A.
- Can progress parallel to Prompt C once CTA component spec exists.

---

## Prompt C — "Sticky Action Row & Contact Pill"
**Goal**: Deliver a persistent, mobile-friendly CTA row that keeps contact, book, and shop actions within thumb reach while respecting accessibility and embeddable webviews.

**Use this prompt**:
> "Draft a PRD for `Sticky Action Row & Contact Pill` that specifies sticky behavior thresholds, button states (available, disabled, external), haptic/micro-interactions, and overflow actions. Include accessibility (focus order, aria-labels), performance safeguards, and handling for hosted in-app browsers."

**Primary outcomes**
- Sticky CTA row that animates in after hero load and stays docked on scroll.
- State-aware buttons with overflow sheet for secondary actions.
- Accessibility and motion guidance aligned with mobile web best practices.

**Dependencies**
- Consumes CTA configuration data from profile data model work.
- Should ship after Prompt A confirms hero load performance budgets.

---

These three prompts cover the full Hyper-Visual Profile Shell scope with minimal context while remaining executable as standalone Codex requests.
