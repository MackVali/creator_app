ALTER TABLE public.daily_schedule_analytics_observed_instances
ALTER COLUMN id SET DEFAULT gen_random_uuid();
