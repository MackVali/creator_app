# Supabase auth user creation troubleshooting

Run these checks inside the **SQL editor** for the Supabase project where sign-ups are failing. The hosted editor connects as the
`postgres` role, which already has the permissions needed to inspect auth metadata, so you can run the statements exactly as
written—no role switching required.

## 1. Confirm email sign-ups are allowed and redirects are valid

```sql
with latest as (
  select raw_base_config::text as raw
  from auth.instances
  order by updated_at desc nulls last, inserted_at desc nulls last
  limit 1
),
redirect_block as (
  select substring(raw from '(?ms)\[auth\][^\[]*?additional_redirect_urls\s*=\s*\[(.*?)\]') as block
  from latest
),
redirects as (
  select coalesce(
    (
      select array_agg(elem)
      from jsonb_array_elements_text(
        case
          when rb.block is null or btrim(rb.block) = '' then '[]'::jsonb
          else ('[' || rb.block || ']')::jsonb
        end
      ) as elem
    ),
    '{}'::text[]
  ) as additional_redirect_urls
  from redirect_block rb
)
select
  substring(raw from '(?ms)\[auth\][^\[]*?site_url\s*=\s*"([^"]+)"') as site_url,
  redirects.additional_redirect_urls,
  substring(raw from '(?ms)\[auth\][^\[]*?enable_signup\s*=\s*(true|false)')::boolean as enable_signup,
  coalesce(
    substring(raw from '(?ms)\[auth.email\][^\[]*?enable_confirmations\s*=\s*(true|false)')::boolean,
    substring(raw from '(?ms)\[auth.email\][^\[]*?is_email_confirm_required\s*=\s*(true|false)')::boolean
  ) as email_confirmation_required,
  coalesce(
    substring(raw from '(?ms)\[auth.email\][^\[]*?double_confirm_changes\s*=\s*(true|false)')::boolean,
    substring(raw from '(?ms)\[auth.email\][^\[]*?double_confirm\s*=\s*(true|false)')::boolean
  ) as double_confirm,
  coalesce(
    substring(raw from '(?ms)\[auth\][^\[]*?minimum_password_length\s*=\s*(\d+)'),
    substring(raw from '(?ms)\[auth.password\][^\[]*?min_length\s*=\s*(\d+)')
  )::int as minimum_password_length
from latest
cross join redirects;
```

* `enable_signup` must be `true` or Supabase will reject every new user until you toggle it on under **Authentication → Providers → Email**.
* `email_confirmation_required` shows whether Supabase waits for email confirmations before activating accounts.
* `site_url` and any `additional_redirect_urls` must include the production or preview domains you expect in confirmation links. The query reads the live TOML config stored in `auth.instances` and surfaces just the auth settings you need to confirm.
* `additional_redirect_urls` is returned as a Postgres `text[]`, so each element needs to match an allowed domain exactly—add or edit entries in Supabase until this array lines up with your preview and production hosts.

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
with latest as (
  select raw_base_config::text as raw
  from auth.instances
  order by updated_at desc nulls last, inserted_at desc nulls last
  limit 1
)
select
  substring(raw from '(?ms)\[auth.rate_limit\][^\[]*?email_sent\s*=\s*(\d+)')::int as email_sent_per_hour,
  substring(raw from '(?ms)\[auth.rate_limit\][^\[]*?sign_in_sign_ups\s*=\s*(\d+)')::int as sign_in_sign_ups_per_5m,
  substring(raw from '(?ms)\[auth.rate_limit\][^\[]*?token_refresh\s*=\s*(\d+)')::int as token_refresh_per_5m,
  substring(raw from '(?ms)\[auth.rate_limit\][^\[]*?token_verifications\s*=\s*(\d+)')::int as token_verifications_per_5m,
  substring(raw from '(?ms)\[auth.rate_limit\][^\[]*?anonymous_users\s*=\s*(\d+)')::int as anonymous_users_per_hour
from latest;
```

Compare each value with the quotas under **Authentication → Rate Limits**. If `email_sent_per_hour` is still `2`, confirmation emails stop after the second attempt in one hour until you raise the limit here or in the dashboard UI.

## 4. Look for row-level security or trigger errors on `auth.users`

```sql
select
  t.tgname,
  p.proname,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass
  and t.tgenabled != 'D'
  and not t.tgisinternal
  and p.proname not like 'RI_FKey%'
order by t.tgname;
```

Built-in foreign-key triggers (the ones whose function names start with `RI_FKey`) are filtered out so you can focus on custom logic like `trg_upsert_empty_profile`. If you need to inspect the full list, remove the `p.proname not like 'RI_FKey%'` predicate temporarily.

If you see a custom trigger in the results, grab its function definition to make sure it cannot raise errors while Supabase inserts a new user:

```sql
select pg_get_functiondef('upsert_empty_profile'::regproc);
```

Replace `upsert_empty_profile` with any other function name that appears in the previous query. Confirm each function is marked `SECURITY DEFINER` (so it can bypass row-level security) and handles missing related rows without throwing an exception. Any error inside these triggers will block new account creation.

## 5. Verify the email provider configuration

```sql
with latest as (
  select raw_base_config::text as raw
  from auth.instances
  order by updated_at desc nulls last, inserted_at desc nulls last
  limit 1
)
select
  substring(raw from '(?ms)smtp_admin_email\s*=\s*"([^"]+)"') as smtp_admin_email,
  substring(raw from '(?ms)smtp_sender_name\s*=\s*"([^"]+)"') as smtp_sender_name,
  substring(raw from '(?ms)smtp_host\s*=\s*"([^"]+)"') as smtp_host,
  substring(raw from '(?ms)smtp_port\s*=\s*(\d+)')::int as smtp_port,
  substring(raw from '(?ms)smtp_user\s*=\s*"([^"]+)"') as smtp_user,
  substring(raw from '(?ms)smtp_enabled\s*=\s*(true|false)')::boolean as smtp_enabled
from latest;
```

All SMTP fields must be populated and `smtp_enabled` must be `true` for Supabase to deliver confirmation emails. Missing entries mean you need to re-enter provider credentials under **Authentication → Providers → Email**.

## 6. Retry and capture the raw error

After making changes, attempt to create a user again from the Supabase dashboard. If it still fails, copy the error string together with the outputs from steps 1–5. Sharing that bundle quickly pinpoints the configuration issue for the rest of the team.

## Optional: reset redirect URLs with the helper script

Need to wipe and replace the allowed redirect list? Run [`docs/supabase-site-url-update.sql`](./supabase-site-url-update.sql) after substituting your preview or production domain in the script.

Keep this guide next to the preview checklist so you can separate Supabase-side configuration problems from issues inside the web app.
