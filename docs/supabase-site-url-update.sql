-- Update Supabase auth redirect configuration for Vercel previews.
--
-- Replace https://your-preview.vercel.app with either the exact preview URL
-- you want to allow or a wildcard domain (requires the Supabase Pro plan)
-- such as https://*.vercel.app. Running this will do two things:
--   1. Set auth.config.site_url so email confirmations link back to the preview.
--   2. Append the same domain to auth.config.additional_redirect_urls so
--      Supabase accepts the preview URL when the client sends redirect_to.
--
-- You can run this from the Supabase SQL editor or with the supabase CLI.
UPDATE auth.config
SET
  site_url = 'https://your-preview.vercel.app',
  additional_redirect_urls = (
    SELECT ARRAY(
      SELECT DISTINCT url
      FROM (
        SELECT UNNEST(COALESCE(additional_redirect_urls, '{}')) AS url
        UNION ALL
        SELECT 'https://your-preview.vercel.app'
      ) AS urls
    )
  );
