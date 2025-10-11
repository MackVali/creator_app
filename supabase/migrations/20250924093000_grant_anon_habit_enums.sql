-- Grant anon role access to habit enums so browser clients can insert records
GRANT USAGE ON TYPE public.habit_type_enum TO anon;
GRANT USAGE ON TYPE public.recurrence_enum TO anon;
