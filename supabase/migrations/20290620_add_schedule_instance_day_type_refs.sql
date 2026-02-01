-- Migration to add day_type_time_block_id and time_block_id columns to schedule_instances
-- This fixes the foreign key constraint issue where day-type scheduling was incorrectly
-- writing time_block.id values into the window_id column (which should only contain windows.id)

ALTER TABLE public.schedule_instances
ADD COLUMN IF NOT EXISTS day_type_time_block_id uuid NULL REFERENCES public.day_type_time_blocks(id) ON DELETE SET NULL;

ALTER TABLE public.schedule_instances
ADD COLUMN IF NOT EXISTS time_block_id uuid NULL REFERENCES public.time_blocks(id) ON DELETE SET NULL;

-- Create indexes for the new columns to support querying
CREATE INDEX IF NOT EXISTS schedule_instances_day_type_time_block_idx
ON public.schedule_instances (day_type_time_block_id);

CREATE INDEX IF NOT EXISTS schedule_instances_time_block_idx
ON public.schedule_instances (time_block_id);

-- Add comments for documentation
COMMENT ON COLUMN public.schedule_instances.day_type_time_block_id IS 'References day_type_time_blocks.id for day-type scheduled instances';
COMMENT ON COLUMN public.schedule_instances.time_block_id IS 'References time_blocks.id for day-type scheduled instances';