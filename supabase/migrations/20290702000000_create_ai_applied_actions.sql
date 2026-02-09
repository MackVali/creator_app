CREATE TABLE IF NOT EXISTS public.ai_applied_actions (
    user_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    intent_type text NOT NULL,
    created_ids text[] NOT NULL DEFAULT '{}',
    message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, idempotency_key)
);

ALTER TABLE public.ai_applied_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_applied_actions_select_own" ON public.ai_applied_actions
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "ai_applied_actions_insert_own" ON public.ai_applied_actions
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

GRANT ALL ON public.ai_applied_actions TO anon, authenticated, service_role;
