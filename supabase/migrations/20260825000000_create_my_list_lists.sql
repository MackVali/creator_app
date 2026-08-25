CREATE TABLE public.my_list_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT my_list_lists_name_nonblank CHECK (length(btrim(name)) > 0),
  CONSTRAINT my_list_lists_name_length CHECK (char_length(name) <= 80),
  CONSTRAINT my_list_lists_user_id_id_unique UNIQUE (user_id, id)
);

CREATE INDEX my_list_lists_user_sort_idx
  ON public.my_list_lists (user_id, sort_order, created_at, name);

ALTER TABLE public.my_list_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own my list lists"
  ON public.my_list_lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own my list lists"
  ON public.my_list_lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own my list lists"
  ON public.my_list_lists FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own my list lists"
  ON public.my_list_lists FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.my_list_items
  ADD COLUMN list_id uuid NULL,
  ADD CONSTRAINT my_list_items_owned_list_fkey
    FOREIGN KEY (user_id, list_id)
    REFERENCES public.my_list_lists(user_id, id)
    ON DELETE SET NULL (list_id);

CREATE INDEX my_list_items_user_list_idx
  ON public.my_list_items (user_id, list_id, sort_order);
