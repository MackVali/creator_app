# Supabase auth user creation troubleshooting

Use this checklist to figure out why you cannot create users even directly from the Supabase dashboard. Each step includes an SQL snippet you can paste into the Supabase SQL editor. Copy the results when you ask for help so the team can see exactly what Supabase is reporting.

## 1. Confirm sign-ups are enabled

```sql
select
  site_url,
  additional_redirect_urls,
  enable_signup,
  is_email_confirm_required,
  double_confirm,
  email_otp_exp,
  sms_otp_exp,
  password_min_length
from auth.config;
```

* **enable_signup** must be `true`. If it is `false`, Supabase will reject every new user until the setting is flipped in **Authentication → Providers → Email**.
* Verify the `site_url` and `additional_redirect_urls` match your production and preview domains so email confirmations are allowed to redirect back.

## 2. Check the audit log for rejected sign-ups

```sql
select
  created_at,
  event_type,
  status,
  error_message,
  metadata->>'email' as email,
  metadata->>'redirect_to' as redirect_to
from auth.audit_log_entries
where event_type like 'user.create%'
order by created_at desc
limit 20;
```

* Rows with `status = 'error'` include Supabase’s reason (for example: invalid redirect, rate limit, disabled email provider). Those errors bubble up to the dashboard too, so this is the quickest way to see why inserts are failing.
* If the log does not show the attempt, you may be running the query against a different project.

## 3. Inspect rate limit counters

```sql
select
  name,
  value,
  comment
from auth.rate_limits
where name in (
  'email_sent',
  'sms_sent',
  'token_verifications',
  'sign_in_sign_ups'
);
```

* Compare the values with the limits configured in the Supabase dashboard (**Authentication → Rate Limits**). If the limit is lower than you expect (for example `email_sent = 2`), increase it to match your preview testing needs.

## 4. Look for row-level security or trigger errors

If Supabase reports a Postgres error in step 2, run this to see the failing trigger or constraint:

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

* Custom triggers on `auth.users` sometimes reject inserts (for example, enforcing domains or external sync). Disable or adjust them if they are not supposed to run for new sign-ups.

## 5. Verify email provider configuration

```sql
select
  (auth.email_provider() is not null) as email_provider_configured,
  (auth.external_email_providers_enabled()) as external_provider_enabled;
```

* Both values must be `true` to deliver confirmation emails. If the provider is missing, go to **Authentication → Providers → Email** and supply valid SMTP credentials.

## 6. Retry and capture the raw error

After making adjustments, try to create a user again in the Supabase dashboard. If it still fails, copy the exact error message shown in the UI together with the outputs from steps 1–5. That bundle of information uniquely identifies the configuration issue so we can guide the next fix quickly.

## Optional: reset misconfigured redirect URLs

If you need to reset the redirect allow-list entirely, run the SQL script in [`docs/supabase-site-url-update.sql`](./supabase-site-url-update.sql) after replacing the placeholder domain with your preview hostname.

Keep this document next to the preview checklist so you can differentiate between Supabase configuration errors and issues inside the web app itself.
