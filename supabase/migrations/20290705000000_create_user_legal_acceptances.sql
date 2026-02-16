-- Record Terms & Privacy acceptances for each user.
-- Ensures acceptance decisions stay up-to-date with a reusable trigger.

CREATE TABLE IF NOT EXISTS public.user_legal_acceptances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_accepted_at timestamptz NOT NULL,
  privacy_accepted_at timestamptz NOT NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  terms_url text NOT NULL,
  privacy_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS user_legal_acceptances_set_updated_at
  ON public.user_legal_acceptances;
CREATE TRIGGER user_legal_acceptances_set_updated_at
  BEFORE UPDATE ON public.user_legal_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_legal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_legal_acceptances_select_own" ON public.user_legal_acceptances;
CREATE POLICY "user_legal_acceptances_select_own" ON public.user_legal_acceptances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_legal_acceptances_insert_own" ON public.user_legal_acceptances;
CREATE POLICY "user_legal_acceptances_insert_own" ON public.user_legal_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_legal_acceptances_update_own" ON public.user_legal_acceptances;
CREATE POLICY "user_legal_acceptances_update_own" ON public.user_legal_acceptances
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_legal_acceptances TO authenticated;
