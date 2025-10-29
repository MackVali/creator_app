-- Add HABIT variant to schedule_instance_source_type enum for habit schedule instances
ALTER TYPE public.schedule_instance_source_type
ADD VALUE IF NOT EXISTS 'HABIT';
