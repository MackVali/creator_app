-- This version works with Supabase projects that store auth settings in
-- auth.instances.raw_base_config (all new projects as of 2024+).
-- It safely rewrites the SITE_URL value and merges the preview domain into the
-- additional_redirect_urls array without dropping any existing domains.

-- 👇 Edit this single line before running the script.
-- You can paste the exact preview domain (e.g. https://creator-app-mu.vercel.app)
-- or a wildcard domain if your Supabase plan supports it (e.g. https://*.vercel.app).
WITH params AS (
  SELECT 'https://your-preview.vercel.app'::text AS new_domain
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
    jsonb_set(
      jsonb_set(
        l.raw_base_config,
        '{auth,site_url}',
        to_jsonb(p.new_domain),
        true
      ),
      '{auth,additional_redirect_urls}',
      to_jsonb(
        (
          SELECT ARRAY(
            SELECT DISTINCT url
            FROM (
              SELECT jsonb_array_elements_text(
                COALESCE(l.raw_base_config->'auth'->'additional_redirect_urls', '[]'::jsonb)
              ) AS url
              UNION ALL
              SELECT p.new_domain
            ) urls
            WHERE url IS NOT NULL AND btrim(url) <> ''
            ORDER BY url
          )
        )
      ),
      true
    ) AS config
  FROM latest l
  CROSS JOIN params p
)
UPDATE auth.instances i
SET raw_base_config = m.config
FROM merged m
WHERE i.id = m.id;

-- Older Supabase projects may still expose auth.config. If the update above
-- does nothing, fall back to this version instead (remove the leading comment
-- markers before running):
--
-- UPDATE auth.config
-- SET
--   site_url = 'https://your-preview.vercel.app',
--   additional_redirect_urls = (
--     SELECT ARRAY(
--       SELECT DISTINCT url
--       FROM (
--         SELECT UNNEST(COALESCE(additional_redirect_urls, '{}')) AS url
--         UNION ALL
--         SELECT 'https://your-preview.vercel.app'
--       ) AS urls
--     )
--   );
