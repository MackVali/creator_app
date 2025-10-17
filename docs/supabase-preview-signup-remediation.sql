-- Update Supabase auth settings so preview sign-ups work consistently.
--
-- Replace the values in the params CTE before running the script:
--   primary_domain: the domain that should appear in confirmation links
--   redirect_domains: every allowed domain (preview + production)
--   email_sent_per_hour: how many confirmation emails can be sent each hour
--   sign_in_sign_ups_per_5m: combined sign-in/sign-up limit for a 5 minute window
WITH params AS (
  SELECT
    'https://creator-app-mu.vercel.app'::text AS primary_domain,
    ARRAY[
      'https://creator-app-mu.vercel.app'
      -- Add your production domain here if different, e.g. 'https://app.creator.com'
    ]::text[] AS redirect_domains,
    60::int AS email_sent_per_hour,
    60::int AS sign_in_sign_ups_per_5m
),
latest AS (
  SELECT id, raw_base_config
  FROM auth.instances
  ORDER BY updated_at DESC NULLS LAST, inserted_at DESC NULLS LAST
  LIMIT 1
),
merged AS (
  SELECT
    l.id,
    p.primary_domain,
    p.email_sent_per_hour,
    p.sign_in_sign_ups_per_5m,
    ARRAY(
      SELECT DISTINCT url
      FROM (
        SELECT jsonb_array_elements_text(
          COALESCE(l.raw_base_config->'auth'->'additional_redirect_urls', '[]'::jsonb)
        ) AS url
        UNION ALL
        SELECT unnest(p.redirect_domains)
      ) urls
      WHERE url IS NOT NULL AND btrim(url) <> ''
      ORDER BY url
    ) AS redirect_allowlist,
    l.raw_base_config
  FROM latest l
  CROSS JOIN params p
),
patched AS (
  SELECT
    m.id,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  m.raw_base_config,
                  '{auth,site_url}',
                  to_jsonb(m.primary_domain),
                  true
                ),
                '{auth,additional_redirect_urls}',
                to_jsonb(m.redirect_allowlist),
                true
              ),
              '{auth,enable_signup}',
              'true'::jsonb,
              true
            ),
            '{auth,email,enable_confirmations}',
            'true'::jsonb,
            true
          ),
          '{auth,email,is_email_confirm_required}',
          'true'::jsonb,
          true
        ),
        '{auth,rate_limit,email_sent}',
        to_jsonb(m.email_sent_per_hour),
        true
      ),
      '{auth,rate_limit,sign_in_sign_ups}',
      to_jsonb(m.sign_in_sign_ups_per_5m),
      true
    ) AS config
  FROM merged m
)
UPDATE auth.instances i
SET raw_base_config = p.config
FROM patched p
WHERE i.id = p.id;

-- Legacy projects may still use auth.config. If the statement above has no effect
-- (check by re-running the diagnostics query), remove the leading comment markers
-- from the block below and execute it separately.
--
-- WITH params AS (
--   SELECT
--     'https://creator-app-mu.vercel.app'::text AS primary_domain,
--     ARRAY[
--       'https://creator-app-mu.vercel.app'
--     ]::text[] AS redirect_domains,
--     60::int AS email_sent_per_hour,
--     60::int AS sign_in_sign_ups_per_5m
-- )
-- UPDATE auth.config
-- SET
--   site_url = p.primary_domain,
--   additional_redirect_urls = (
--     SELECT ARRAY(
--       SELECT DISTINCT url
--       FROM (
--         SELECT UNNEST(COALESCE(c.additional_redirect_urls, '{}')) AS url
--         UNION ALL
--         SELECT UNNEST(p.redirect_domains)
--       ) urls
--       WHERE url IS NOT NULL AND btrim(url) <> ''
--       ORDER BY url
--     )
--   ),
--   enable_signup = true,
--   email_confirm = true,
--   double_confirm_changes = true,
--   email_rate_limit = p.email_sent_per_hour
-- FROM auth.config c, params p
-- WHERE auth.config.id = c.id;
