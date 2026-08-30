ALTER TABLE public.my_list_lists
  ADD COLUMN IF NOT EXISTS system_key text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'my_list_lists_system_key_normalized'
      AND conrelid = 'public.my_list_lists'::regclass
  ) THEN
    ALTER TABLE public.my_list_lists
      ADD CONSTRAINT my_list_lists_system_key_normalized
      CHECK (
      system_key IS NULL OR
      (
        length(btrim(system_key)) > 0 AND
        system_key = lower(btrim(system_key))
      )
    );
  END IF;
END $$;

WITH grocery_candidates AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY sort_order ASC, created_at ASC, id ASC
    ) AS candidate_rank
  FROM public.my_list_lists
  WHERE system_key IS NULL
    AND lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = 'grocery list'
)
UPDATE public.my_list_lists lists
SET
  name = 'Grocery List',
  system_key = 'grocery',
  updated_at = now()
FROM grocery_candidates candidates
WHERE lists.id = candidates.id
  AND candidates.candidate_rank = 1;

INSERT INTO public.my_list_lists (user_id, name, system_key)
SELECT users.id, 'Grocery List', 'grocery'
FROM auth.users users
WHERE NOT EXISTS (
  SELECT 1
  FROM public.my_list_lists lists
  WHERE lists.user_id = users.id
    AND lists.system_key = 'grocery'
);

CREATE UNIQUE INDEX IF NOT EXISTS my_list_lists_user_system_key_unique_idx
  ON public.my_list_lists (user_id, system_key)
  WHERE system_key IS NOT NULL;
