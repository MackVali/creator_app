# Supabase auth user creation troubleshooting

Run these checks inside the **SQL editor** for the Supabase project where sign-ups are failing. Supabase executes statements as
the `postgres` role by default, so start every session by elevating to `supabase_admin` for full access:

```sql
set role supabase_admin;
```

All of the queries below run unmodified in the hosted Supabase database once that role change is applied.

## 1. Confirm email sign-ups are allowed and redirects are valid

```sql
with cfg as (
  select to_jsonb(c) as data
  from auth.config as c
  limit 1
)
select
  data->>'site_url' as site_url,
  data->>'additional_redirect_urls' as additional_redirect_urls,
  (data->>'enable_signup')::boolean as enable_signup,
  (coalesce(data->>'enable_email_confirmations', data->>'is_email_confirm_required'))::boolean as email_confirmation_required,
  (data->>'double_confirm')::boolean as double_confirm,
  coalesce(data->>'minimum_password_length', data->>'password_min_length') as minimum_password_length
from cfg;
```

* `enable_signup` must be `true` or Supabase will reject every new user until you toggle it on under **Authentication → Providers → Email**.
* `email_confirmation_required` shows whether Supabase waits for email confirmations before activating accounts.
* `site_url` and any `additional_redirect_urls` must include the production or preview domains you expect in confirmation links.

## 2. Inspect the auth audit log for failures

```sql
select
  created_at,
  payload->>'event_type' as event_type,
  payload->'data'->>'status' as status,
  coalesce(payload->'data'->>'error_message', payload->'data'->>'error') as error_message,
  coalesce(payload->'data'->>'email', payload->'data'->>'user_email') as email,
  payload->'data'->>'redirect_to' as redirect_to
from auth.audit_log_entries
where payload->>'event_type' like 'user.create%'
order by created_at desc
limit 20;
```

Rows with `status = 'error'` show the exact failure (invalid redirect, disabled provider, rate limit, etc.). If no row appears,
confirm you are querying the correct Supabase project.

## 3. Check the current auth rate limits

```sql
with cfg as (
  select to_jsonb(c) as data
  from auth.config as c
  limit 1
)
select
  (data->>'rate_limit_email_sent')::int as rate_limit_email_sent,
  (data->>'rate_limit_invites')::int as rate_limit_invites,
  (data->>'rate_limit_token_refresh')::int as rate_limit_token_refresh,
  (data->>'rate_limit_signups')::int as rate_limit_signups,
  (coalesce(data->>'rate_limit_retries', data->>'rate_limit_retries_per_request'))::int as rate_limit_retries
from cfg;
```

Compare each value with the quotas under **Authentication → Rate Limits**. If `rate_limit_email_sent` is still `2`, confirmation emails stop after the second attempt in one hour until you raise the limit here or in the dashboard UI.

## 4. Look for row-level security or trigger errors on `auth.users`

```sql
select
  t.tgname,
  p.proname,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass
  and t.tgenabled != 'D';
```

If the audit log reports a Postgres error, this list reveals custom triggers that may be rejecting inserts. Disable or update any trigger that should not run during user creation.

## 5. Verify the email provider configuration

```sql
with cfg as (
  select to_jsonb(c) as data
  from auth.config as c
  limit 1
)
select
  data->>'smtp_admin_email' as smtp_admin_email,
  data->>'smtp_sender_name' as smtp_sender_name,
  data->>'smtp_host' as smtp_host,
  (data->>'smtp_port')::int as smtp_port,
  data->>'smtp_user' as smtp_user,
  (data->>'smtp_enabled')::boolean as smtp_enabled
from cfg;
```

All SMTP fields must be populated and `smtp_enabled` must be `true` for Supabase to deliver confirmation emails. Missing entries mean you need to re-enter provider credentials under **Authentication → Providers → Email**.

## 6. Retry and capture the raw error

After making changes, attempt to create a user again from the Supabase dashboard. If it still fails, copy the error string together with the outputs from steps 1–5. Sharing that bundle quickly pinpoints the configuration issue for the rest of the team.

## Optional: reset redirect URLs with the helper script

Need to wipe and replace the allowed redirect list? Run [`docs/supabase-site-url-update.sql`](./supabase-site-url-update.sql) after substituting your preview or production domain in the script.

Keep this guide next to the preview checklist so you can separate Supabase-side configuration problems from issues inside the web app.
