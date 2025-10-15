# Supabase auth user creation troubleshooting

Run these checks inside the Supabase SQL editor that belongs to the same project where sign-ups are failing. Every query is compatible with Supabase’s managed Postgres instance.

## 1. Confirm email sign-ups are allowed and redirects are valid

```sql
select
  site_url,
  additional_redirect_urls,
  enable_signup,
  is_email_confirm_required,
  double_confirm,
  password_min_length
from auth.config
limit 1;
```

* `enable_signup` must be `true` or Supabase will reject every new user until the toggle is turned back on under **Authentication → Providers → Email**.
* The `site_url` and any entries in `additional_redirect_urls` must cover the preview or production domains you are testing so Supabase accepts the confirmation redirect.

## 2. Inspect the auth audit log for failures

```sql
select
  created_at,
  event_type,
  status,
  error_message,
  coalesce(metadata->>'email', user_email) as email,
  metadata->>'redirect_to' as redirect_to
from auth.audit_log_entries
where event_type like 'user.create%'
order by created_at desc
limit 20;
```

Rows with `status = 'error'` show the exact failure message that the dashboard also surfaces (for example: invalid redirect, disabled email provider, rate limit). If the attempt is missing entirely you may be looking at the wrong project.

## 3. Check the current auth rate limits

```sql
select
  rate_limit_email_sent,
  rate_limit_invites,
  rate_limit_token_refresh,
  rate_limit_signups,
  rate_limit_retries
from auth.config
limit 1;
```

Compare each value with the quotas you expect from **Authentication → Rate Limits**. If `rate_limit_email_sent` is still the default `2`, confirmation emails will stop after the second attempt within an hour until you raise the number here or in the dashboard UI.

## 4. Look for row-level security or trigger errors on `auth.users`

```sql
select
  tgname,
  proname,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass
  and t.tgenabled != 'D';
```

If Supabase reports a Postgres error in the audit log, this list highlights custom triggers that may be rejecting new inserts. Disable or update any trigger that should not run during user creation.

## 5. Verify the email provider configuration

```sql
select
  smtp_admin_email,
  smtp_sender_name,
  smtp_host,
  smtp_port,
  smtp_user,
  smtp_enabled
from auth.config
limit 1;
```

All of the SMTP fields must be populated and `smtp_enabled` must be `true` for Supabase to deliver confirmation emails. If anything is missing, re-enter the provider credentials under **Authentication → Providers → Email**.

## 6. Retry and capture the raw error

After making changes, attempt to create a user again from the Supabase dashboard. If it still fails, copy the error string that appears together with the outputs from steps 1–5. Sharing that bundle pinpoints the configuration issue quickly so the team can recommend the next fix.

## Optional: reset redirect URLs with the helper script

Need to wipe and replace your redirect allow-list? Run [`docs/supabase-site-url-update.sql`](./supabase-site-url-update.sql) after swapping in the preview or production domain that should receive confirmation emails.

Keep this guide next to the preview checklist so you can separate Supabase-side configuration problems from issues inside the web app.
