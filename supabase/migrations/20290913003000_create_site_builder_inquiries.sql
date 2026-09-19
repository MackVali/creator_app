CREATE TABLE IF NOT EXISTS public.site_builder_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_handle text NOT NULL,
  page_id text NOT NULL,
  section_id text NOT NULL,
  sender_name text NOT NULL,
  sender_email text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_builder_inquiries_status_check
    CHECK (status IN ('new', 'read', 'archived')),

  CONSTRAINT site_builder_inquiries_name_length_check
    CHECK (
      char_length(sender_name) BETWEEN 1 AND 120
    ),

  CONSTRAINT site_builder_inquiries_email_length_check
    CHECK (
      char_length(sender_email) BETWEEN 3 AND 254
    ),

  CONSTRAINT site_builder_inquiries_message_length_check
    CHECK (
      char_length(message) BETWEEN 1 AND 5000
    )
);

CREATE INDEX IF NOT EXISTS site_builder_inquiries_owner_created_idx
  ON public.site_builder_inquiries(site_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS site_builder_inquiries_owner_status_idx
  ON public.site_builder_inquiries(site_user_id, status);

DROP TRIGGER IF EXISTS site_builder_inquiries_set_updated_at
  ON public.site_builder_inquiries;

CREATE TRIGGER site_builder_inquiries_set_updated_at
  BEFORE UPDATE ON public.site_builder_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.site_builder_inquiries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.site_builder_inquiries
  FROM anon, authenticated;

GRANT SELECT, UPDATE, DELETE
  ON public.site_builder_inquiries
  TO authenticated;

GRANT ALL
  ON public.site_builder_inquiries
  TO service_role;

DROP POLICY IF EXISTS site_builder_inquiries_select_own
  ON public.site_builder_inquiries;

CREATE POLICY site_builder_inquiries_select_own
  ON public.site_builder_inquiries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = site_user_id);

DROP POLICY IF EXISTS site_builder_inquiries_update_own
  ON public.site_builder_inquiries;

CREATE POLICY site_builder_inquiries_update_own
  ON public.site_builder_inquiries
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = site_user_id)
  WITH CHECK (auth.uid() = site_user_id);

DROP POLICY IF EXISTS site_builder_inquiries_delete_own
  ON public.site_builder_inquiries;

CREATE POLICY site_builder_inquiries_delete_own
  ON public.site_builder_inquiries
  FOR DELETE
  TO authenticated
  USING (auth.uid() = site_user_id);

COMMENT ON TABLE public.site_builder_inquiries IS
  'Messages submitted through published CREATOR Site contact forms.';
