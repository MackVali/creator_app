# Nested Sub-Note Specification

## Objective
Enable each skill note to host a single level of nested sub-notes—similar to Notion pages within a page—while keeping the Supabase-backed storage model and React-based UI responsive on mobile devices.

## Scope & Constraints
- **Hierarchy depth:** Only one level of nesting is supported in the initial release. Sub-notes cannot contain additional sub-notes.
- **Mobile-first:** Interaction models (creation, navigation, drag-to-reorder) must be optimized for touch-first devices. Desktop affordances should remain usable but secondary.
- **Permissions:** Sub-notes inherit their parent skill's sharing/visibility settings; no additional ACL layers are introduced.

## Data Model
1. **Parent linkage:** Add a nullable `parent_note_id` foreign key on `public.notes` to point to another note within the same skill. Null indicates a top-level note.
2. **Skill integrity:** Guard against cross-skill parentage and loops by validating `skill_id` matches the parent and disallowing a note from referencing itself.
3. **Ordering:** Introduce a `sibling_order` integer column scoped by `(skill_id, parent_note_id)` to support manual ordering of sub-notes.
4. **Memo parent container:** Create or designate a top-level note per memo habit (title mirrors the habit name). Memo notes automatically use that note as their `parent_note_id` so they appear under the designated container.
5. **Template overrides:** Attach a parent-level configuration document (e.g., JSON stored alongside the note) that defines default property overrides for its immediate sub-notes, allowing each parent to tailor fields, templates, or view presets for its children without affecting unrelated notes.

## API & Service Updates
- **Creation:** `createSkillNote` accepts an optional `parentNoteId` and optional `siblingOrder`. Default to `null` for top-level notes.
- **Update:** `updateSkillNote` can change the parent (for moves) and adjust order. Enforce the one-level depth rule by blocking any request that assigns a parent which itself has a `parent_note_id`.
- **Retrieval:** Extend `getNotes` with a `parentNoteId` filter to fetch only immediate children. Add `getNoteWithChildren` helper returning the note plus a sorted child list and the applicable parent template overrides.
- **Memo flows:** Update memo-specific helpers so they resolve or create the memo habit container before inserting the memo note with that container as parent.

## UI/UX Requirements
1. **Note page layout:** When viewing a note, show:
   - Breadcrumbs reflecting `Skill → Parent note (if any) → Current note`.
   - A child-note section displaying immediate sub-notes with creation date, owner, and drag handles for ordering.
   - A prominent "Add sub-page" action that defaults to creating a child note.
2. **Hierarchy navigation:** From the skill notes list, indicate which notes have sub-notes (e.g., chevron, child count). Tapping drills into the parent note.
3. **Creation affordances:** Provide inline commands (e.g., "+" button or slash command) to create sub-notes within a parent. For mobile, ensure large touch targets and avoid reliance on hover.
4. **Reordering & moving:** Support drag-and-drop reordering within the child list on mobile via long-press. Moving a sub-note to a different parent is done through a "Move to" action sheet listing eligible top-level notes and applies the target parent's template overrides when the move completes.
5. **Empty state:** If a note has no sub-notes, show contextual guidance and an "Add your first sub-page" button.

## Search & Filtering
- Update skill-level search to include sub-notes (matching title/content) and expose a filter to limit results to top-level or sub-notes.
- Saved views should treat memo containers as regular notes, allowing filters/sorts on both levels.

## Migration Plan
1. **Schema migration:** Add `parent_note_id` and `sibling_order` columns with indices on `(skill_id, parent_note_id, sibling_order)`.
2. **Memo backfill:** For each memo habit, create/find its container note and set `parent_note_id` on associated memo notes.
3. **Data backfill:** Set all existing notes' `parent_note_id` to null and assign default `sibling_order` based on creation time.

## Open Questions
- What analytics or telemetry are required to observe sub-note adoption and hierarchy usage?

