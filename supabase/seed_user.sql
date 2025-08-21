-- Seed file for user data
-- Replace :my_uid with your actual user ID from Supabase Auth
-- Run this in the Supabase SQL Editor after getting your UID

-- Sample Goals
INSERT INTO goals (id, user_id, title, description, status, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440001', :my_uid, 'Complete Book Manuscript', 'Finish writing the first draft of my novel about time travel', 'active', NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440002', :my_uid, 'Learn Guitar', 'Master basic chords and play 5 songs proficiently', 'active', NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440003', :my_uid, 'Run Marathon', 'Complete a full marathon in under 4 hours', 'active', NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440004', :my_uid, 'Start Business', 'Launch my consulting business and get first 3 clients', 'active', NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440005', :my_uid, 'Learn Spanish', 'Achieve conversational fluency in Spanish', 'active', NOW(), NOW());

-- Sample Projects
INSERT INTO projects (id, user_id, title, description, status, goal_id, start_date, end_date, created_at, updated_at) VALUES
('660e8400-e29b-41d4-a716-446655440001', :my_uid, 'Novel Writing Project', 'Complete the first draft of my time travel novel', 'in_progress', '550e8400-e29b-41d4-a716-446655440001', '2024-01-01', '2024-12-31', NOW(), NOW()),
('660e8400-e29b-41d4-a716-446655440002', :my_uid, 'Guitar Learning Journey', 'Learn guitar from beginner to intermediate level', 'in_progress', '550e8400-e29b-41d4-a716-446655440002', '2024-01-01', '2024-06-30', NOW(), NOW()),
('660e8400-e29b-41d4-a716-446655440003', :my_uid, 'Marathon Training', '16-week training program for marathon', 'in_progress', '550e8400-e29b-41d4-a716-446655440003', '2024-01-01', '2024-04-15', NOW(), NOW()),
('660e8400-e29b-41d4-a716-446655440004', :my_uid, 'Business Launch', 'Setup consulting business infrastructure', 'planning', '550e8400-e29b-41d4-a716-446655440004', '2024-03-01', '2024-08-31', NOW(), NOW()),
('660e8400-e29b-41d4-a716-446655440005', :my_uid, 'Spanish Learning', 'Complete Duolingo course and practice with native speakers', 'in_progress', '550e8400-e29b-41d4-a716-446655440005', '2024-01-01', '2024-12-31', NOW(), NOW());

-- Sample Tasks
INSERT INTO tasks (id, user_id, title, description, status, priority, project_id, due_date, created_at, updated_at) VALUES
('770e8400-e29b-41d4-a716-446655440001', :my_uid, 'Write Chapter 1', 'Complete the opening chapter of the novel', 'in_progress', 'high', '660e8400-e29b-41d4-a716-446655440001', '2024-01-15', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440002', :my_uid, 'Research Time Travel Physics', 'Study quantum mechanics and relativity for novel accuracy', 'todo', 'medium', '660e8400-e29b-41d4-a716-446655440001', '2024-01-20', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440003', :my_uid, 'Practice Basic Chords', 'Master C, G, D, A, E major chords', 'in_progress', 'high', '660e8400-e29b-41d4-a716-446655440002', '2024-01-10', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440004', :my_uid, 'Learn "Wonderwall"', 'Practice and memorize Oasis song', 'todo', 'medium', '660e8400-e29b-41d4-a716-446655440002', '2024-01-25', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440005', :my_uid, '5K Training Run', 'Complete 5K run at moderate pace', 'completed', 'high', '660e8400-e29b-41d4-a716-446655440003', '2024-01-05', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440006', :my_uid, '10K Training Run', 'Complete 10K run at moderate pace', 'in_progress', 'high', '660e8400-e29b-41d4-a716-446655440003', '2024-01-12', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440007', :my_uid, 'Business Plan Draft', 'Write initial business plan outline', 'todo', 'high', '660e8400-e29b-41d4-a716-446655440004', '2024-03-15', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440008', :my_uid, 'Complete Lesson 1', 'Finish first Spanish lesson on Duolingo', 'completed', 'medium', '660e8400-e29b-41d4-a716-446655440005', '2024-01-03', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440009', :my_uid, 'Practice with Language Partner', 'Have 30-minute conversation in Spanish', 'todo', 'high', '660e8400-e29b-41d4-a716-446655440005', '2024-01-18', NOW(), NOW());

-- Sample Habits
INSERT INTO habits (id, user_id, title, description, frequency, target_count, current_streak, longest_streak, created_at, updated_at) VALUES
('880e8400-e29b-41d4-a716-446655440001', :my_uid, 'Morning Reading', 'Read for 30 minutes every morning', 'daily', 1, 12, 45, NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440002', :my_uid, 'Exercise', 'Workout for at least 45 minutes', 'daily', 1, 8, 23, NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440003', :my_uid, 'Guitar Practice', 'Practice guitar for 20 minutes', 'daily', 1, 15, 67, NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440004', :my_uid, 'Spanish Study', 'Study Spanish for 15 minutes', 'daily', 1, 22, 89, NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440005', :my_uid, 'Meditation', 'Meditate for 10 minutes', 'daily', 1, 5, 12, NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440006', :my_uid, 'Writing', 'Write 500 words', 'daily', 1, 3, 18, NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440007', :my_uid, 'Water Intake', 'Drink 8 glasses of water', 'daily', 8, 7, 31, NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440008', :my_uid, 'Evening Walk', 'Take a 20-minute walk after dinner', 'daily', 1, 4, 15, NOW(), NOW());

-- Sample Skills
INSERT INTO skills (id, user_id, name, description, current_level, target_level, category, created_at, updated_at) VALUES
('990e8400-e29b-41d4-a716-446655440001', :my_uid, 'Writing', 'Creative writing and storytelling', 65, 85, 'creative', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440002', :my_uid, 'Guitar', 'Acoustic and electric guitar playing', 35, 70, 'music', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440003', :my_uid, 'Running', 'Long-distance running and endurance', 55, 80, 'fitness', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440004', :my_uid, 'Spanish', 'Spanish language proficiency', 25, 75, 'language', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440005', :my_uid, 'Business Planning', 'Strategic business planning and execution', 40, 75, 'business', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440006', :my_uid, 'Time Management', 'Productivity and time organization', 60, 85, 'productivity', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440007', :my_uid, 'Public Speaking', 'Confident public presentation skills', 45, 80, 'communication', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440008', :my_uid, 'Cooking', 'Home cooking and meal preparation', 70, 85, 'lifestyle', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440009', :my_uid, 'Photography', 'Digital photography and composition', 30, 65, 'creative', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440010', :my_uid, 'Programming', 'Web development and coding', 55, 80, 'technical', NOW(), NOW());

-- Sample Monuments
INSERT INTO monuments (id, user_id, title, description, achievement_date, category, impact_level, created_at, updated_at) VALUES
('aa0e8400-e29b-41d4-a716-446655440001', :my_uid, 'First Novel Chapter', 'Completed the first chapter of my debut novel', '2024-01-10', 'creative', 'high', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440002', :my_uid, 'Guitar Performance', 'Performed "Wonderwall" at open mic night', '2024-01-08', 'music', 'medium', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440003', :my_uid, '5K Race Completion', 'Finished my first 5K race in 25 minutes', '2024-01-05', 'fitness', 'medium', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440004', :my_uid, 'Spanish Conversation', 'Had a 30-minute conversation entirely in Spanish', '2024-01-06', 'language', 'high', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440005', :my_uid, 'Business Plan Approval', 'Received positive feedback on business plan from mentor', '2024-01-12', 'business', 'high', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440006', :my_uid, '30-Day Habit Streak', 'Maintained daily reading habit for 30 consecutive days', '2024-01-15', 'productivity', 'medium', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440007', :my_uid, 'Public Speaking Success', 'Delivered presentation to 50+ people without notes', '2024-01-14', 'communication', 'high', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440008', :my_uid, 'Cooking Masterpiece', 'Prepared a 5-course meal for family celebration', '2024-01-13', 'lifestyle', 'medium', NOW(), NOW());

-- Sample Monument Skills (linking monuments to skills)
INSERT INTO monument_skills (id, monument_id, skill_id, skill_level_at_time, created_at) VALUES
('bb0e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440001', '990e8400-e29b-41d4-a716-446655440001', 65, NOW()),
('bb0e8400-e29b-41d4-a716-446655440002', 'aa0e8400-e29b-41d4-a716-446655440002', '990e8400-e29b-41d4-a716-446655440002', 35, NOW()),
('bb0e8400-e29b-41d4-a716-446655440003', 'aa0e8400-e29b-41d4-a716-446655440003', '990e8400-e29b-41d4-a716-446655440003', 55, NOW()),
('bb0e8400-e29b-41d4-a716-446655440004', 'aa0e8400-e29b-41d4-a716-446655440004', '990e8400-e29b-41d4-a716-446655440005', 25, NOW()),
('bb0e8400-e29b-41d4-a716-446655440005', 'aa0e8400-e29b-41d4-a716-446655440005', '990e8400-e29b-41d4-a716-446655440005', 40, NOW()),
('bb0e8400-e29b-41d4-a716-446655440006', 'aa0e8400-e29b-41d4-a716-446655440006', '990e8400-e29b-41d4-a716-446655440006', 60, NOW()),
('bb0e8400-e29b-41d4-a716-446655440007', 'aa0e8400-e29b-41d4-a716-446655440007', '990e8400-e29b-41d4-a716-446655440007', 45, NOW()),
('bb0e8400-e29b-41d4-a716-446655440008', 'aa0e8400-e29b-41d4-a716-446655440008', '990e8400-e29b-41d4-a716-446655440008', 70, NOW());

-- Sample Schedule Items (for the schedule page)
INSERT INTO schedule_items (id, user_id, title, description, start_time, end_time, category, priority, created_at, updated_at) VALUES
('cc0e8400-e29b-41d4-a716-446655440001', :my_uid, 'Morning Reading', 'Read novel for 30 minutes', '2024-01-16 07:00:00', '2024-01-16 07:30:00', 'personal', 'medium', NOW(), NOW()),
('cc0e8400-e29b-41d4-a716-446655440002', :my_uid, 'Guitar Practice', 'Practice basic chords and songs', '2024-01-16 18:00:00', '2024-01-16 18:30:00', 'learning', 'high', NOW(), NOW()),
('cc0e8400-e29b-41d4-a716-446655440003', :my_uid, 'Evening Run', '5K training run', '2024-01-16 19:00:00', '2024-01-16 19:45:00', 'fitness', 'high', NOW(), NOW()),
('cc0e8400-e29b-41d4-a716-446655440004', :my_uid, 'Spanish Study', 'Duolingo lesson and vocabulary review', '2024-01-16 20:00:00', '2024-01-16 20:15:00', 'learning', 'medium', NOW(), NOW()),
('cc0e8400-e29b-41d4-a716-446655440005', :my_uid, 'Writing Session', 'Work on novel chapter', '2024-01-16 21:00:00', '2024-01-16 22:00:00', 'creative', 'high', NOW(), NOW()),
('cc0e8400-e29b-41d4-a716-446655440006', :my_uid, 'Business Planning', 'Work on business plan and strategy', '2024-01-17 09:00:00', '2024-01-17 11:00:00', 'work', 'high', NOW(), NOW()),
('cc0e8400-e29b-41d4-a716-446655440007', :my_uid, 'Team Meeting', 'Weekly team sync and planning', '2024-01-17 14:00:00', '2024-01-17 15:00:00', 'work', 'medium', NOW(), NOW()),
('cc0e8400-e29b-41d4-a716-446655440008', :my_uid, 'Gym Workout', 'Strength training and cardio', '2024-01-17 17:00:00', '2024-01-17 18:30:00', 'fitness', 'high', NOW(), NOW());

-- Success message
SELECT 'Seed data inserted successfully! You now have sample goals, projects, tasks, habits, skills, monuments, and schedule items.' as message;
