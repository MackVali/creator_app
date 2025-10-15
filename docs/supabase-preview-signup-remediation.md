# Guaranteeing Supabase preview sign-ups work

Use this checklist to lock in the Supabase configuration needed for the beta deployment at `https://creator-app-mu.vercel.app/`. It combines dashboard steps with SQL you can paste into the Supabase SQL editor so every new user can register, receive a confirmation email, and sign in from Vercel previews.

## 1. Enable email sign-ups and confirmations

1. Open the Supabase dashboard → **Authentication → Providers → Email**.
2. Turn on **Enable email signups**.
3. Turn on **Confirm email** so new accounts must verify the message Supabase sends.
4. Save the form.

These toggles align with the values the SQL script below enforces. Flipping them in the UI first prevents later merges from overriding your intent.

## 2. Update redirect allow-lists and rate limits via SQL

Run [`docs/supabase-preview-signup-remediation.sql`](./supabase-preview-signup-remediation.sql) in the Supabase SQL editor.

* Before executing, edit the `params` CTE:
  * `primary_domain` → the domain that should appear in confirmation emails (for previews use `https://creator-app-mu.vercel.app`).
  * `redirect_domains` → every host that is allowed to receive auth redirects. Include both the preview host and any production domain you already use.
  * Adjust the email and sign-in rate limits if you need values above `60`.
* The script updates the current `auth.instances.raw_base_config` row so Supabase:
  * trusts your preview domain when it sends confirmation links;
  * keeps sign-ups enabled;
  * requires email confirmations;
  * raises the email rate limit so you do not hit the two-per-hour default while testing.
* If your project still uses the legacy `auth.config` table, uncomment the fallback block inside the script and run it as well.

Re-run the diagnostics query in [`docs/supabase-auth-user-debug.md`](./supabase-auth-user-debug.md) step #1 to confirm `site_url`, `additional_redirect_urls`, and the rate limits now reflect the updated values.

## 3. Verify SMTP credentials

1. In the Supabase dashboard go to **Authentication → Providers → Email**.
2. Check that **SMTP** is enabled and all fields (sender email, host, port, username, password) are filled in.
3. Use the "Send test email" button to confirm Supabase can deliver messages.

Without SMTP credentials Supabase cannot deliver confirmation emails, so new users will remain unverified.

## 4. Redeploy the Vercel preview with matching env vars

1. In Vercel open **Settings → Environment Variables** for your project.
2. Under the **Preview** scope confirm:
   * `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are populated.
   * `NEXT_PUBLIC_SUPABASE_REDIRECT_URL` (or `NEXT_PUBLIC_SITE_URL`) matches the same domain you saved in Supabase.
3. Trigger a new deployment so the preview inherits the updated variables.

## 5. Test the full sign-up loop

1. Visit the latest preview deployment.
2. Use an email address that has not been registered in the last hour.
3. Submit the sign-up form and wait for the confirmation email.
4. Click the link in the email. It should land back on the same preview domain and finalize the account.
5. Return to the preview and sign in with the new credentials to confirm everything works end-to-end.

If any step fails, open the auth form debugging toggle in the preview and copy the redirect/env diagnostics together with the exact Supabase error message. Pair those details with the audit log query in the troubleshooting guide so we can isolate the next blocker quickly.
