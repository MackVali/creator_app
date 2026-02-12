-- Seed file for user data
-- Replace :my_uid with your actual user ID from Supabase Auth
-- Run this in the Supabase SQL Editor after getting your UID

-- Sample Categories (cats)
INSERT INTO cats (id, user_id, name, created_at) VALUES
('cc0e8400-e29b-41d4-a716-446655440001', :my_uid, 'Creative', NOW()),
('cc0e8400-e29b-41d4-a716-446655440002', :my_uid, 'Music', NOW()),
('cc0e8400-e29b-41d4-a716-446655440003', :my_uid, 'Fitness', NOW()),
('cc0e8400-e29b-41d4-a716-446655440004', :my_uid, 'Language', NOW()),
('cc0e8400-e29b-41d4-a716-446655440005', :my_uid, 'Business', NOW()),
('cc0e8400-e29b-41d4-a716-446655440006', :my_uid, 'Productivity', NOW()),
('cc0e8400-e29b-41d4-a716-446655440007', :my_uid, 'Communication', NOW()),
('cc0e8400-e29b-41d4-a716-446655440008', :my_uid, 'Lifestyle', NOW()),
('cc0e8400-e29b-41d4-a716-446655440009', :my_uid, 'Technical', NOW());

-- Sample Goals
INSERT INTO goals (id, user_id, name, why, energy, priority, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440001', :my_uid, 'Complete Book Manuscript', 'Finish writing the first draft of my novel about time travel', 'HIGH', 'HIGH', NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440002', :my_uid, 'Learn Guitar', 'Master basic chords and play 5 songs proficiently', 'MEDIUM', 'HIGH', NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440003', :my_uid, 'Run Marathon', 'Complete a full marathon in under 4 hours', 'HIGH', 'HIGH', NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440004', :my_uid, 'Start Business', 'Launch my consulting business and get first 3 clients', 'HIGH', 'CRITICAL', NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440005', :my_uid, 'Learn Spanish', 'Achieve conversational fluency in Spanish', 'MEDIUM', 'HIGH', NOW(), NOW());

-- Sample Projects
INSERT INTO projects (id, user_id, name, description, energy, priority, stage, created_at, updated_at) VALUES
('660e8400-e29b-41d4-a716-446655440001', :my_uid, 'Novel Writing Project', 'Complete the first draft of my time travel novel', 'HIGH', 'HIGH', 'BUILD', NOW(), NOW()),
('660e8400-e29b-41d4-a716-446655440002', :my_uid, 'Guitar Learning Journey', 'Learn guitar from beginner to intermediate level', 'MEDIUM', 'HIGH', 'BUILD', NOW(), NOW()),
('660e8400-e29b-41d4-a716-446655440003', :my_uid, 'Marathon Training', '16-week training program for marathon', 'HIGH', 'HIGH', 'BUILD', NOW(), NOW()),
('660e8400-e29b-41d4-a716-446655440004', :my_uid, 'Business Launch', 'Setup consulting business infrastructure', 'HIGH', 'CRITICAL', 'RESEARCH', NOW(), NOW()),
('660e8400-e29b-41d4-a716-446655440005', :my_uid, 'Spanish Learning', 'Complete Duolingo course and practice with native speakers', 'MEDIUM', 'HIGH', 'BUILD', NOW(), NOW());

-- Sample Tasks
INSERT INTO tasks (id, user_id, name, description, energy, priority, stage, created_at, updated_at) VALUES
('770e8400-e29b-41d4-a716-446655440001', :my_uid, 'Write Chapter 1', 'Complete the opening chapter of the novel', 'HIGH', 'HIGH', 'PRODUCE', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440002', :my_uid, 'Research Time Travel Physics', 'Study quantum mechanics and relativity for novel accuracy', 'MEDIUM', 'MEDIUM', 'PREPARE', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440003', :my_uid, 'Practice Basic Chords', 'Master C, G, D, A, E major chords', 'MEDIUM', 'HIGH', 'PRODUCE', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440004', :my_uid, 'Learn "Wonderwall"', 'Practice and memorize Oasis song', 'MEDIUM', 'MEDIUM', 'PRODUCE', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440005', :my_uid, '5K Training Run', 'Complete 5K run at moderate pace', 'HIGH', 'HIGH', 'PRODUCE', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440006', :my_uid, '10K Training Run', 'Complete 10K run at moderate pace', 'HIGH', 'HIGH', 'PRODUCE', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440007', :my_uid, 'Business Plan Draft', 'Write initial business plan outline', 'HIGH', 'HIGH', 'PREPARE', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440008', :my_uid, 'Complete Lesson 1', 'Finish first Spanish lesson on Duolingo', 'MEDIUM', 'MEDIUM', 'PRODUCE', NOW(), NOW()),
('770e8400-e29b-41d4-a716-446655440009', :my_uid, 'Practice with Language Partner', 'Have 30-minute conversation in Spanish', 'MEDIUM', 'HIGH', 'PRODUCE', NOW(), NOW());

-- Sample Windows
INSERT INTO windows (id, user_id, label, days, start_local, end_local, energy, created_at)
VALUES
('99de8400-e29b-41d4-a716-446655440001', :my_uid, 'Morning Focus', ARRAY[1, 2, 3, 4, 5], '06:00', '08:00', 'HIGH', NOW()),
('99de8400-e29b-41d4-a716-446655440002', :my_uid, 'Midday Momentum', ARRAY[1, 2, 3, 4, 5], '12:00', '14:00', 'MEDIUM', NOW()),
('99de8400-e29b-41d4-a716-446655440003', :my_uid, 'Evening Recharge', ARRAY[0, 6], '19:00', '21:00', 'LOW', NOW());

-- Sample Habits
INSERT INTO habits (id, user_id, name, description, habit_type, recurrence, duration_minutes, window_id, skill_id, created_at, updated_at)
VALUES
('880e8400-e29b-41d4-a716-446655440001', :my_uid, 'Morning Reading', 'Read for 30 minutes every morning', 'HABIT', 'daily', 30, '99de8400-e29b-41d4-a716-446655440001', '990e8400-e29b-41d4-a716-446655440001', NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440002', :my_uid, 'Exercise', 'Workout for at least 45 minutes', 'HABIT', 'daily', 45, '99de8400-e29b-41d4-a716-446655440002', '990e8400-e29b-41d4-a716-446655440003', NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440003', :my_uid, 'Guitar Practice', 'Practice guitar for 20 minutes', 'HABIT', 'daily', 20, '99de8400-e29b-41d4-a716-446655440003', '990e8400-e29b-41d4-a716-446655440002', NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440004', :my_uid, 'Spanish Study', 'Study Spanish for 15 minutes', 'HABIT', 'daily', 15, '99de8400-e29b-41d4-a716-446655440003', '990e8400-e29b-41d4-a716-446655440004', NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440005', :my_uid, 'Meditation', 'Meditate for 10 minutes', 'HABIT', 'daily', 10, '99de8400-e29b-41d4-a716-446655440001', NULL, NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440006', :my_uid, 'Writing', 'Write 500 words', 'HABIT', 'daily', 40, '99de8400-e29b-41d4-a716-446655440001', '990e8400-e29b-41d4-a716-446655440001', NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440007', :my_uid, 'Water Intake', 'Drink 8 glasses of water', 'HABIT', 'daily', 5, NULL, NULL, NOW(), NOW()),
('880e8400-e29b-41d4-a716-446655440008', :my_uid, 'Evening Walk', 'Take a 20-minute walk after dinner', 'HABIT', 'daily', 20, '99de8400-e29b-41d4-a716-446655440003', '990e8400-e29b-41d4-a716-446655440003', NOW(), NOW());

-- Sample Skills
INSERT INTO skills (id, user_id, name, icon, level, sort_order, cat_id, created_at, updated_at) VALUES
('990e8400-e29b-41d4-a716-446655440001', :my_uid, 'Writing', '⚓', 65, 1, 'cc0e8400-e29b-41d4-a716-446655440001', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440002', :my_uid, 'Guitar', '⚓', 35, 2, 'cc0e8400-e29b-41d4-a716-446655440002', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440003', :my_uid, 'Running', '⚓', 55, 3, 'cc0e8400-e29b-41d4-a716-446655440003', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440004', :my_uid, 'Spanish', '⚓', 25, 4, 'cc0e8400-e29b-41d4-a716-446655440004', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440005', :my_uid, 'Business Planning', '⚓', 40, 5, 'cc0e8400-e29b-41d4-a716-446655440005', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440006', :my_uid, 'Time Management', '⚓', 60, 6, 'cc0e8400-e29b-41d4-a716-446655440006', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440007', :my_uid, 'Public Speaking', '⚓', 45, 7, 'cc0e8400-e29b-41d4-a716-446655440007', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440008', :my_uid, 'Cooking', '⚓', 70, 8, 'cc0e8400-e29b-41d4-a716-446655440008', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440009', :my_uid, 'Photography', '⚓', 30, 9, 'cc0e8400-e29b-41d4-a716-440001', NOW(), NOW()),
('990e8400-e29b-41d4-a716-446655440010', :my_uid, 'Programming', '⚓', 55, 10, 'cc0e8400-e29b-41d4-a716-440009', NOW(), NOW());

-- Sample Monuments
INSERT INTO monuments (id, user_id, name, description, created_at, updated_at) VALUES
('aa0e8400-e29b-41d4-a716-446655440001', :my_uid, 'First Novel Chapter', 'Completed the first chapter of my debut novel', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440002', :my_uid, 'Guitar Performance', 'Performed "Wonderwall" at open mic night', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440003', :my_uid, '5K Race Completion', 'Finished my first 5K race in 25 minutes', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440004', :my_uid, 'Spanish Conversation', 'Had a 30-minute conversation entirely in Spanish', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440005', :my_uid, 'Business Plan Approval', 'Received positive feedback on business plan from mentor', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440006', :my_uid, '30-Day Habit Streak', 'Maintained daily reading habit for 30 consecutive days', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440007', :my_uid, 'Public Speaking Success', 'Delivered presentation to 50+ people without notes', NOW(), NOW()),
('aa0e8400-e29b-41d4-a716-446655440008', :my_uid, 'Cooking Masterpiece', 'Prepared a 5-course meal for family celebration', NOW(), NOW());

-- Note: monument_skills and schedule_items tables may need separate setup
-- depending on your current database schema

-- Success message
SELECT 'Seed data inserted successfully! You now have sample categories, goals, projects, tasks, habits, skills, and monuments.' as message;
