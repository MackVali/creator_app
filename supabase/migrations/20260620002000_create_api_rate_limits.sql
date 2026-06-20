-- Durable fixed-window API rate limits for server/admin routes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_updated_at'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.set_updated_at()
      RETURNS trigger AS $body$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql
    $fn$;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  window_seconds integer NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_rate_limits_action_not_blank CHECK (length(btrim(action)) > 0),
  CONSTRAINT api_rate_limits_window_seconds_positive CHECK (window_seconds > 0),
  CONSTRAINT api_rate_limits_request_count_nonnegative CHECK (request_count >= 0),
  CONSTRAINT api_rate_limits_unique_window UNIQUE (
    user_id,
    action,
    window_start,
    window_seconds
  )
);

CREATE INDEX IF NOT EXISTS api_rate_limits_action_window_start_idx
  ON public.api_rate_limits(action, window_start);

CREATE INDEX IF NOT EXISTS api_rate_limits_window_start_idx
  ON public.api_rate_limits(window_start);

DROP TRIGGER IF EXISTS api_rate_limits_set_updated_at ON public.api_rate_limits;
CREATE TRIGGER api_rate_limits_set_updated_at
  BEFORE UPDATE ON public.api_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;
GRANT ALL ON public.api_rate_limits TO service_role;

COMMENT ON TABLE public.api_rate_limits IS
  'Durable fixed-window API rate limit counters. Rows older than their largest active window can be safely deleted by a manual or scheduled cleanup.';

CREATE OR REPLACE FUNCTION public.check_api_rate_limit(
  p_user_id uuid,
  p_action text,
  p_window_seconds integer,
  p_max_requests integer
)
RETURNS TABLE (
  allowed boolean,
  remaining integer,
  reset_at timestamptz,
  request_count integer
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_action text := btrim(p_action);
  v_window_start timestamptz;
  v_reset_at timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF v_action IS NULL OR length(v_action) = 0 THEN
    RAISE EXCEPTION 'p_action must be non-empty'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_action) > 200 THEN
    RAISE EXCEPTION 'p_action must be 200 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 2592000 THEN
    RAISE EXCEPTION 'p_window_seconds must be between 1 and 2592000'
      USING ERRCODE = '22023';
  END IF;

  IF p_max_requests IS NULL OR p_max_requests < 1 OR p_max_requests > 100000 THEN
    RAISE EXCEPTION 'p_max_requests must be between 1 and 100000'
      USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );
  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);

  RETURN QUERY
  WITH upserted AS (
    INSERT INTO public.api_rate_limits (
      user_id,
      action,
      window_start,
      window_seconds,
      request_count
    )
    VALUES (
      p_user_id,
      v_action,
      v_window_start,
      p_window_seconds,
      1
    )
    ON CONFLICT (user_id, action, window_start, window_seconds)
    DO UPDATE SET
      request_count = public.api_rate_limits.request_count + 1,
      updated_at = now()
    WHERE public.api_rate_limits.request_count < p_max_requests
    RETURNING public.api_rate_limits.request_count
  )
  SELECT
    true AS allowed,
    greatest(p_max_requests - upserted.request_count, 0) AS remaining,
    v_reset_at AS reset_at,
    upserted.request_count
  FROM upserted
  UNION ALL
  SELECT
    false AS allowed,
    0 AS remaining,
    v_reset_at AS reset_at,
    public.api_rate_limits.request_count
  FROM public.api_rate_limits
  WHERE public.api_rate_limits.user_id = p_user_id
    AND public.api_rate_limits.action = v_action
    AND public.api_rate_limits.window_start = v_window_start
    AND public.api_rate_limits.window_seconds = p_window_seconds
    AND NOT EXISTS (SELECT 1 FROM upserted)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.check_api_rate_limit(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_api_rate_limit(uuid, text, integer, integer)
  TO service_role;
