# Fix Plan: Auth Page Sign-Up Failures

## 1. Reproduce and Observe
- [ ] Launch the Next.js dev server with a Supabase project configured through `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Attempt to create a new account via `components/auth/AuthForm.tsx` to capture the exact Supabase error payload surfaced by `parseSupabaseError`.
- [ ] Enable browser network logging to confirm the `/auth/v1/signup` response status and message.

## 2. Instrument Error Handling
- [ ] Temporarily add structured logging around the `supabase.auth.signUp` call in `AuthForm` to record `error.code`, `error.message`, and request context (role, full name presence) while stripping sensitive values.
- [ ] Verify that rate-limiting state (`attempts`, `lockoutTime`) is not blocking legitimate sign-up attempts.

## 3. Identify Root Cause
- [ ] Inspect Supabase project settings for sign-up restrictions (email confirmations, domain allowlists, or disabled sign-ups).
- [ ] Cross-check metadata payload (`data: { full_name, role }`) with database policies to ensure Row-Level Security or triggers are not rejecting inserts for new users.
- [ ] Validate redirect target `emailRedirectTo` matches the deployed domain or add environment-driven configuration.

## 4. Implement Fix
- [ ] Update `components/auth/AuthForm.tsx` to handle the identified failure, e.g., adjust `signUp` options, relax/clarify validation, or surface configuration guidance based on the error code.
- [ ] If policy-related, add the necessary Supabase SQL migration (under `/supabase` or root SQL scripts) to permit user profile inserts for new accounts.
- [ ] Provide user-facing messaging in the UI when sign-up is blocked by configuration (e.g., disabled email confirmations, domain allowlists).

## 5. Verification
- [ ] Add or update integration/unit tests that cover successful and failure scenarios for `AuthForm` using Supabase client mocks.
- [ ] Manually sign up a new user in dev and confirm automatic redirect or confirmation messaging works as expected.
- [ ] Document any configuration requirements in `README.md`.
