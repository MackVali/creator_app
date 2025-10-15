ALTER TABLE public.source_integrations
  ADD COLUMN IF NOT EXISTS auth_header text;

UPDATE public.source_integrations
SET auth_header = 'X-API-Key'
WHERE auth_mode = 'api_key' AND (auth_header IS NULL OR length(trim(auth_header)) = 0);
