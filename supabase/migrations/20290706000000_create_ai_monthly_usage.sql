CREATE TABLE IF NOT EXISTS public.ai_monthly_usage (
    user_id uuid NOT NULL,
    month_start date NOT NULL,
    model text NOT NULL,
    input_tokens bigint NOT NULL DEFAULT 0,
    output_tokens bigint NOT NULL DEFAULT 0,
    cost_usd numeric NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, month_start, model)
);

ALTER TABLE public.ai_monthly_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_monthly_usage_select_own" ON public.ai_monthly_usage
    FOR SELECT
    USING (user_id = auth.uid());

GRANT SELECT ON public.ai_monthly_usage TO authenticated;
GRANT ALL ON public.ai_monthly_usage TO service_role;

CREATE OR REPLACE FUNCTION public.increment_ai_monthly_usage(
    p_user_id uuid,
    p_month_start date,
    p_model text,
    p_input_tokens bigint,
    p_output_tokens bigint,
    p_cost_usd numeric
)
RETURNS public.ai_monthly_usage
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    INSERT INTO public.ai_monthly_usage (
        user_id,
        month_start,
        model,
        input_tokens,
        output_tokens,
        cost_usd,
        updated_at
    )
    VALUES (
        p_user_id,
        p_month_start,
        p_model,
        p_input_tokens,
        p_output_tokens,
        p_cost_usd,
        now()
    )
    ON CONFLICT (user_id, month_start, model)
    DO UPDATE SET
        input_tokens = public.ai_monthly_usage.input_tokens + EXCLUDED.input_tokens,
        output_tokens = public.ai_monthly_usage.output_tokens + EXCLUDED.output_tokens,
        cost_usd = public.ai_monthly_usage.cost_usd + EXCLUDED.cost_usd,
        updated_at = now()
    RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ai_monthly_usage TO service_role;
