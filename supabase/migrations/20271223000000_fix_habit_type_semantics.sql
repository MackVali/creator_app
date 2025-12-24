-- Fix habit type semantics for overlap-allowed habits
-- SYNC habits are overlap-allowed, ASYNC habits are blocking

-- Update the two specific habits to SYNC type
UPDATE habits
SET habit_type = 'SYNC'
WHERE id IN (
  '8e6db16c-ffa4-47ef-923e-59437dd608eb', -- 'POST STORY (1)'
  '91b6b298-b496-4683-bdaf-69374e281938'  -- 'RECORD CONTENT'
);

-- Verify the changes
SELECT id, name, habit_type
FROM habits
WHERE id IN (
  '8e6db16c-ffa4-47ef-923e-59437dd608eb',
  '91b6b298-b496-4683-bdaf-69374e281938'
);
