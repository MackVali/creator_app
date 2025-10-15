# Supabase auth user creation troubleshooting

Run these checks inside the **SQL editor** for the Supabase project where sign-ups are failing. The hosted editor connects as the
`postgres` role, which already has the permissions needed to inspect auth metadata, so you can run the statements exactly as
written—no role switching required.

## 1. Confirm email sign-ups are allowed and redirects are valid

```sql
with raw as (
  select raw_base_config
  from auth.instances
  order by created_at desc
  limit 1
),
parsed as (
  select
    nullif(regexp_replace(raw_base_config, '(?ms).*\[auth\].*site_url\s*=\s*"([^"]+)".*', '\1'), raw_base_config) as site_url,
    nullif(regexp_replace(raw_base_config, '(?ms).*\[auth\].*additional_redirect_urls\s*=\s*\[(.*?)\].*', '\1'), raw_base_config) as additional_redirect_urls_block,
    nullif(regexp_replace(raw_base_config, '(?ms).*\[auth\].*enable_signup\s*=\s*(true|false).*', '\1'), raw_base_config)::boolean as enable_signup,
    nullif(regexp_replace(raw_base_config, '(?ms).*\[auth.email\].*(enable_confirmations|is_email_confirm_required)\s*=\s*(true|false).*', '\2'), raw_base_config)::boolean as email_confirmation_required,
    nullif(regexp_replace(raw_base_config, '(?ms).*\[auth.email\].*double_confirm_changes\s*=\s*(true|false).*', '\1'), raw_base_config)::boolean as double_confirm,
    coalesce(
      nullif(regexp_replace(raw_base_config, '(?ms).*\[auth.password\].*min_length\s*=\s*(\d+).*', '\1'), raw_base_config),
      nullif(regexp_replace(raw_base_config, '(?ms).*\[auth\].*minimum_password_length\s*=\s*(\d+).*', '\1'), raw_base_config)
    )::int as minimum_password_length
  from raw
),
urls as (
  select coalesce(array_agg(match[1]) filter (where match[1] is not null), '{}') as additional_redirect_urls
  from parsed
  left join lateral regexp_matches(additional_redirect_urls_block, '"([^"]+)"', 'g') as match on true
)
select
  site_url,
  additional_redirect_urls,
  enable_signup,
  email_confirmation_required,
  double_confirm,
  minimum_password_length
from parsed
cross join urls;
```

* `enable_signup` must be `true` or Supabase will reject every new user until you toggle it on under **Authentication → Providers → Email**.
* `email_confirmation_required` shows whether Supabase waits for email confirmations before activating accounts.
* `site_url` and any `additional_redirect_urls` must include the production or preview domains you expect in confirmation links. The query parses both values directly from the live config stored in `auth.instances`.

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
with raw as (
  select raw_base_config
  from auth.instances
  order by created_at desc
  limit 1
)
select
  nullif(regexp_replace(raw_base_config, '(?ms).*rate_limit_email_sent\s*=\s*(\d+).*', '\1'), raw_base_config)::int as rate_limit_email_sent,
  nullif(regexp_replace(raw_base_config, '(?ms).*rate_limit_invites\s*=\s*(\d+).*', '\1'), raw_base_config)::int as rate_limit_invites,
  nullif(regexp_replace(raw_base_config, '(?ms).*rate_limit_token_refresh\s*=\s*(\d+).*', '\1'), raw_base_config)::int as rate_limit_token_refresh,
  nullif(regexp_replace(raw_base_config, '(?ms).*rate_limit_signups\s*=\s*(\d+).*', '\1'), raw_base_config)::int as rate_limit_signups,
  nullif(regexp_replace(raw_base_config, '(?ms).*(rate_limit_retries|rate_limit_retries_per_request)\s*=\s*(\d+).*', '\2'), raw_base_config)::int as rate_limit_retries
from raw;
```

Compare each value with the quotas under **Authentication → Rate Limits**. If `rate_limit_email_sent` is still `2`, confirmation
 emails stop after the second attempt in one hour until you raise the limit here or in the dashboard UI.

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
with raw as (
  select raw_base_config
  from auth.instances
  order by created_at desc
  limit 1
)
select
  nullif(regexp_replace(raw_base_config, '(?ms).*smtp_admin_email\s*=\s*"([^"]+)".*', '\1'), raw_base_config) as smtp_admin_email,
  nullif(regexp_replace(raw_base_config, '(?ms).*smtp_sender_name\s*=\s*"([^"]+)".*', '\1'), raw_base_config) as smtp_sender_name,
  nullif(regexp_replace(raw_base_config, '(?ms).*smtp_host\s*=\s*"([^"]+)".*', '\1'), raw_base_config) as smtp_host,
  nullif(regexp_replace(raw_base_config, '(?ms).*smtp_port\s*=\s*(\d+).*', '\1'), raw_base_config)::int as smtp_port,
  nullif(regexp_replace(raw_base_config, '(?ms).*smtp_user\s*=\s*"([^"]+)".*', '\1'), raw_base_config) as smtp_user,
  nullif(regexp_replace(raw_base_config, '(?ms).*smtp_enabled\s*=\s*(true|false).*', '\1'), raw_base_config)::boolean as smtp_enabled
from raw;
```

All SMTP fields must be populated and `smtp_enabled` must be `true` for Supabase to deliver confirmation emails. Missing entries mean you need to re-enter provider credentials under **Authentication → Providers → Email**.

## 6. Retry and capture the raw error

After making changes, attempt to create a user again from the Supabase dashboard. If it still fails, copy the error string together with the outputs from steps 1–5. Sharing that bundle quickly pinpoints the configuration issue for the rest of the team.

## Optional: reset redirect URLs with the helper script

Need to wipe and replace the allowed redirect list? Run [`docs/supabase-site-url-update.sql`](./supabase-site-url-update.sql) after substituting your preview or production domain in the script.

Keep this guide next to the preview checklist so you can separate Supabase-side configuration problems from issues inside the web app.
