PRD — Profile Page & Profile Features
1) Objective
Add a profile system with:
TopNav avatar circle (right side) → click opens Profile.
Profile page shows: name, username, DOB, city, profile picture, bio.
Edit Profile action for the signed-in user (others see read-only).
2) Scope
View own profile (/profile) and edit it.
(Optional, phase 2) Public read-only route for others: /u/[username].
Image upload to Supabase Storage for avatar.
Unique usernames; soft validations on fields.
Out of scope (for now): Follow system, badges, posts/feed, privacy granular controls, multi-image galleries.
3) IA / Routes
TopNav
Right-aligned avatar circle (24–32px). Placeholder initials if no image.
Click → navigate to /profile.
Pages
/profile (owner view; shows Edit Profile button).
/profile/edit (or modal on /profile).
(Phase 2) /u/[username] public view (no edit button).
4) Data Model (Supabase)
Table: profiles
user_id uuid PK (FK → auth.users.id)
name text
username text UNIQUE
dob date (nullable)
city text
bio text
avatar_url text
created_at timestamptz default now()
updated_at timestamptz default now()
Storage bucket: avatars
Public read, authenticated write (RLS-equivalent via policies).
5) RLS Policies (summary)
ENABLE RLS on profiles.
READ: anyone can read public profiles (or restrict to self only if you prefer).
For public: using (true)
For private: using (auth.uid() = user_id)
INSERT: only self: with check (auth.uid() = user_id)
UPDATE: only self: using (auth.uid() = user_id) with check (auth.uid() = user_id)
(We can drop exact SQL if you want it ready-to-paste.)
6) UX / UI Requirements
TopNav Avatar
Circular, click target ≥ 40px; shows image or initials.
Hover: subtle ring.
Profile Page Layout
Header: large avatar (96px), Name, @username, city.
Meta row: DOB (MM/DD/YYYY), city (optional if empty), joined date (nice to have).
Bio: multiline, links auto-detected.
Edit Profile button visible only to owner.
Edit Form
Fields: name, username, dob (date), city, bio, avatar upload.
Username: live uniqueness check (debounced).
Avatar: upload → store file → save avatar_url → show preview.
Buttons: Save (primary), Cancel (secondary).
Success toast; disable Save while submitting.
Validation
Name: 1–80 chars.
Username: 3–20, [a-z0-9_]+, unique, lowercased.
Bio: up to 300 chars.
DOB: must be a valid date; (no age gating now).
City: up to 80 chars.
7) Security / Edge Cases
Only owner can update their row.
Strip HTML from bio; escape on render.
Reject external redirect after save (stay within app).
Handle avatar upload failure gracefully (keep previous image).
Username collisions → inline error.
8) Telemetry (nice to have)
Profile view/edit events; avatar upload success/failure.
9) Accessibility
Avatar has alt text with user’s name.
Form labels + error messages associated with inputs.
Focus management on open/close edit.
10) Acceptance Criteria (tests)
TopNav shows avatar or initials; clicking it navigates to /profile.
/profile shows the signed-in user’s profile data.
Non-owner visiting /u/[username] sees read-only (when phase 2 enabled).
Owner sees Edit Profile; non-owner does not.
Editing and saving updates the row and the UI reflects changes.
Username uniqueness validation blocks duplicates with a clear error.
Avatar upload updates avatar_url and renders in TopNav and /profile.
RLS: another user cannot update my profile (403).
Empty optional fields hide cleanly (no “undefined”).
Refresh after edit shows persisted values.