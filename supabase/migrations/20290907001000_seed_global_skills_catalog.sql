-- Seed the first official CREATOR global/community skill catalog.
-- This migration intentionally does not backfill or mutate user-owned skills.

WITH category_seed(slug, name, icon, description, sort_order) AS (
  VALUES
    ('music', 'Music', '🎧', 'Music creation, discovery, recording, and production.', 10),
    ('craft', 'Craft', '🧵', 'Hands-on making, apparel, production, and materials.', 20),
    ('content', 'Content', '🎭', 'Creation, editing, media production, and audience growth.', 30),
    ('art', 'Art', '🎨', 'Visual design, drawing, illustration, and digital art.', 40),
    ('tech', 'Tech', '💠', 'Software, systems, automation, electronics, and games.', 50),
    ('mind', 'Mind', '🧠', 'Learning, discipline, focus, and mental mastery.', 60),
    ('body', 'Body', '🦾', 'Training, recovery, nutrition, and physical health.', 70),
    ('soul', 'Soul', '👁️', 'Inner work, nature, lifestyle, and spiritual practice.', 80),
    ('business', 'Business', '📈', 'Money, sales, operations, and entrepreneurial skills.', 90)
)
INSERT INTO public.global_skill_categories (
  slug,
  name,
  icon,
  description,
  sort_order,
  is_active
)
SELECT
  slug,
  name,
  icon,
  description,
  sort_order,
  true
FROM category_seed
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

WITH subcategory_seed(category_slug, slug, name, description, sort_order) AS (
  VALUES
    ('music', 'discovery', 'Music Discovery', 'Find, study, and organize music inspiration.', 10),
    ('music', 'writing', 'Writing', 'Rap, songwriting, lyrics, and written music ideas.', 20),
    ('music', 'studio', 'Studio', 'Recording, beat making, production, and mixing.', 30),
    ('craft', 'apparel', 'Apparel', 'Sewing, screen printing, fashion, and garment work.', 10),
    ('craft', 'production', 'Production', 'Manufacturing, decals, and production services.', 20),
    ('craft', 'product-making', 'Product Making', 'Product sampling, materials, and physical goods.', 30),
    ('content', 'creation', 'Creation', 'Content, videography, photography, and media capture.', 10),
    ('content', 'editing', 'Editing', 'Editing and short form video workflows.', 20),
    ('content', 'growth', 'Growth', 'Outreach, strategy, and audience building.', 30),
    ('art', 'visual-design', 'Visual Design', 'Design, graphic design, and brand design.', 10),
    ('art', 'drawing', 'Drawing', 'Drawing, illustration, and visual studies.', 20),
    ('art', 'digital-art', 'Digital Art', '3D sculpting, image generation, and digital artwork.', 30),
    ('tech', 'software', 'Software', 'Coding, web design, and web development.', 10),
    ('tech', 'systems', 'Systems', 'Systems, AI automation, and electronics.', 20),
    ('tech', 'interactive', 'Interactive', 'Video games, game design, and interactive media.', 30),
    ('mind', 'learning', 'Learning', 'Notes, reading, language, and study habits.', 10),
    ('mind', 'discipline', 'Discipline', 'Mind mastery, productivity, and focus.', 20),
    ('mind', 'combat', 'Combat', 'Martial arts and combat training.', 30),
    ('body', 'training', 'Training', 'Exercise, fitness, and strength training.', 10),
    ('body', 'recovery', 'Recovery', 'Sleep, mobility, and recovery practices.', 20),
    ('body', 'nutrition', 'Nutrition', 'Health, cooking, and nutrition.', 30),
    ('soul', 'inner-work', 'Inner Work', 'Spirituality, meditation, and yoga.', 10),
    ('soul', 'nature', 'Nature', 'Horticulture, growing, and care for living systems.', 20),
    ('soul', 'lifestyle', 'Lifestyle', 'Lifestyle, vibe, and personal atmosphere.', 30),
    ('business', 'money', 'Money', 'Investing and personal finance.', 10),
    ('business', 'sales', 'Sales', 'Sales, reselling, and outreach.', 20),
    ('business', 'operations', 'Operations', 'Security, charisma, systems, and operating discipline.', 30)
),
category_lookup AS (
  SELECT id, slug
  FROM public.global_skill_categories
)
INSERT INTO public.global_skill_subcategories (
  category_id,
  slug,
  name,
  description,
  sort_order,
  is_active
)
SELECT
  c.id,
  s.slug,
  s.name,
  s.description,
  s.sort_order,
  true
FROM subcategory_seed s
JOIN category_lookup c ON c.slug = s.category_slug
ON CONFLICT ON CONSTRAINT global_skill_subcategories_category_slug_key DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

WITH skill_seed(
  category_slug,
  subcategory_slug,
  slug,
  name,
  icon,
  description,
  sort_order,
  is_popular,
  popular_order,
  feature_key
) AS (
  VALUES
    ('music', 'discovery', 'music-discovery', 'Music Discovery', '🎧', 'Discover, organize, and study new music inspiration.', 10, true, 10, null),
    ('music', 'writing', 'rap', 'Rap', '🎤', 'Write, practice, and perform rap.', 20, true, 20, null),
    ('music', 'writing', 'writing', 'Writing', '✍️', 'Build a writing practice across lyrics, ideas, and drafts.', 30, true, 30, 'writing'),
    ('music', 'writing', 'songwriting', 'Songwriting', '🎼', 'Write melodies, lyrics, hooks, and full songs.', 40, false, null, null),
    ('music', 'writing', 'lyrics', 'Lyrics', '📝', 'Develop lyrical ideas, verses, hooks, and revisions.', 50, false, null, null),
    ('music', 'studio', 'studio-recording', 'Studio Recording', '🎙️', 'Record vocals, instruments, and sessions.', 60, false, null, null),
    ('music', 'studio', 'music-production', 'Music Production', '🎛️', 'Make beats, produce tracks, and shape finished records.', 70, true, 50, 'music-production'),
    ('music', 'studio', 'beat-making', 'Beat Making', '🥁', 'Create drums, loops, samples, and instrumentals.', 80, false, null, null),
    ('music', 'studio', 'mixing', 'Mixing', '🎚️', 'Balance, process, and polish recorded music.', 90, false, null, null),
    ('craft', 'production', 'manufacturing', 'Manufacturing', '🏭', 'Plan and produce physical goods at repeatable quality.', 10, false, null, null),
    ('craft', 'production', 'decal-service', 'Decal Service', '🏷️', 'Design, produce, and fulfill decal work.', 20, false, null, null),
    ('craft', 'apparel', 'screen-printing', 'Screen Printing', '🖨️', 'Print apparel, posters, and physical merchandise.', 30, true, 70, null),
    ('craft', 'apparel', 'sewing', 'Sewing', '🪡', 'Sew, repair, sample, and construct soft goods.', 40, true, 80, null),
    ('craft', 'apparel', 'fashion', 'Fashion', '🧥', 'Design, style, and develop apparel ideas.', 50, true, 90, null),
    ('craft', 'product-making', 'product-sampling', 'Product Sampling', '🧪', 'Prototype, test, and refine physical products.', 60, false, null, null),
    ('craft', 'product-making', 'materials', 'Materials', '🧱', 'Study, source, and work with production materials.', 70, false, null, null),
    ('content', 'creation', 'content-creation', 'Content Creation', '🎬', 'Create media, posts, and stories for an audience.', 10, true, 100, 'content-creation'),
    ('content', 'editing', 'editing', 'Editing', '✂️', 'Cut, revise, and polish media or written work.', 20, true, 110, null),
    ('content', 'growth', 'outreach', 'Outreach', '📣', 'Contact people, build relationships, and create opportunities.', 30, true, 120, null),
    ('content', 'creation', 'videography', 'Videography', '📹', 'Shoot video with intentional framing, motion, and story.', 40, true, 130, null),
    ('content', 'creation', 'photography', 'Photography', '📷', 'Capture, select, and process strong photos.', 50, false, null, null),
    ('content', 'editing', 'short-form-video', 'Short Form Video', '📱', 'Create short videos for social platforms.', 60, false, null, null),
    ('content', 'growth', 'content-strategy', 'Content Strategy', '🗺️', 'Plan repeatable content systems and campaigns.', 70, false, null, null),
    ('art', 'digital-art', '3d-sculpting', '3D Sculpting', '🗿', 'Model and sculpt digital 3D forms.', 10, true, 140, null),
    ('art', 'drawing', 'drawing', 'Drawing', '✏️', 'Practice line, form, observation, and visual expression.', 20, true, 150, null),
    ('art', 'visual-design', 'design', 'Design', '🎨', 'Shape visual systems, layouts, and creative direction.', 30, true, 160, null),
    ('art', 'visual-design', 'graphic-design', 'Graphic Design', '🖼️', 'Create visual communication for brands, products, and media.', 40, false, null, null),
    ('art', 'visual-design', 'brand-design', 'Brand Design', '🏷️', 'Develop identity, visual language, and brand systems.', 50, false, null, null),
    ('art', 'drawing', 'illustration', 'Illustration', '🖌️', 'Create expressive drawings and finished illustrative work.', 60, false, null, null),
    ('art', 'digital-art', 'image-generation', 'Image Generation', '🌌', 'Use AI tools to create and refine image concepts.', 70, true, 170, null),
    ('tech', 'software', 'coding', 'Coding', '💻', 'Build software, scripts, apps, and technical systems.', 10, true, 180, 'coding'),
    ('tech', 'systems', 'electronics', 'Electronics', '🔌', 'Work with circuits, devices, sensors, and hardware.', 20, true, 190, null),
    ('tech', 'interactive', 'game-design', 'Game Design', '🎮', 'Design games, mechanics, levels, and interactive systems.', 30, true, 200, null),
    ('tech', 'software', 'web-design', 'Web Design', '🧭', 'Design clear, useful web pages and interfaces.', 40, true, 210, null),
    ('tech', 'software', 'web-development', 'Web Development', '🌐', 'Build websites and web applications.', 50, false, null, null),
    ('tech', 'systems', 'systems', 'Systems', '⚙️', 'Create repeatable operating systems and technical workflows.', 60, true, 220, null),
    ('tech', 'systems', 'ai-automation', 'AI Automation', '🤖', 'Use AI and automation to improve workflows.', 70, false, null, null),
    ('mind', 'learning', 'language-learning', 'Language Learning', '🗣️', 'Study, practice, and retain new languages.', 10, true, 230, null),
    ('mind', 'combat', 'martial-arts', 'Martial Arts', '🥋', 'Train skill, discipline, movement, and combat practice.', 20, true, 240, null),
    ('mind', 'discipline', 'mind-mastery', 'Mind Mastery', '🧠', 'Develop focus, emotional control, and mental discipline.', 30, true, 250, null),
    ('mind', 'learning', 'notes', 'Notes', '📓', 'Capture, organize, and use ideas effectively.', 40, false, null, null),
    ('mind', 'learning', 'reading', 'Reading', '📚', 'Read, understand, and apply books or references.', 50, true, 260, null),
    ('mind', 'discipline', 'productivity', 'Productivity', '✅', 'Improve planning, execution, and follow-through.', 60, true, 270, 'productivity'),
    ('body', 'nutrition', 'health', 'Health', '🩺', 'Maintain and improve overall health.', 10, false, null, null),
    ('body', 'nutrition', 'cooking', 'Cooking', '🍳', 'Prepare meals and build practical kitchen skill.', 20, false, null, null),
    ('body', 'training', 'exercise', 'Exercise', '🏃', 'Build a consistent movement and exercise practice.', 30, false, null, null),
    ('body', 'recovery', 'sleep', 'Sleep', '🛌', 'Improve sleep habits, timing, and recovery.', 40, false, null, null),
    ('body', 'training', 'fitness', 'Fitness', '💪', 'Train strength, conditioning, and physical capacity.', 50, true, 290, 'fitness'),
    ('body', 'nutrition', 'nutrition', 'Nutrition', '🥗', 'Improve food choices, energy, and fueling habits.', 60, true, 300, null),
    ('body', 'training', 'strength-training', 'Strength Training', '🏋️', 'Develop strength through progressive training.', 70, false, null, null),
    ('body', 'recovery', 'mobility', 'Mobility', '🤸', 'Improve range of motion, control, and recovery.', 80, false, null, null),
    ('soul', 'nature', 'horticulture', 'Horticulture', '🌱', 'Grow, tend, and study plants.', 10, false, null, null),
    ('soul', 'nature', 'grow', 'Grow', '🪴', 'Practice growing plants and living systems.', 20, false, null, null),
    ('soul', 'inner-work', 'spirituality', 'Spirituality', '👁️', 'Explore meaning, presence, and spiritual practice.', 30, false, null, null),
    ('soul', 'lifestyle', 'vibe', 'Vibe', '✨', 'Develop taste, atmosphere, and personal energy.', 40, false, null, null),
    ('soul', 'inner-work', 'yoga', 'Yoga', '🧘', 'Practice yoga for body, breath, and attention.', 50, false, null, null),
    ('soul', 'lifestyle', 'lifestyle', 'Lifestyle', '🌇', 'Shape daily life, routines, style, and environment.', 60, false, null, null),
    ('soul', 'inner-work', 'meditation', 'Meditation', '🕯️', 'Practice attention, breath, stillness, and awareness.', 70, true, 310, 'meditation'),
    ('business', 'money', 'investing', 'Investing', '📈', 'Study markets, assets, and long-term capital allocation.', 10, false, null, null),
    ('business', 'operations', 'security', 'Security', '🛡️', 'Build awareness, protection, and operational security.', 20, false, null, null),
    ('business', 'operations', 'charisma', 'Charisma', '🤝', 'Improve presence, communication, and social confidence.', 30, false, null, null),
    ('business', 'sales', 'reselling', 'Reselling', '🛍️', 'Source, price, sell, and fulfill resale opportunities.', 40, false, null, null),
    ('business', 'sales', 'sales', 'Sales', '💬', 'Sell products, services, ideas, and opportunities.', 50, true, 320, null),
    ('business', 'money', 'personal-finance', 'Personal Finance', '💵', 'Manage money, budgets, saving, and financial decisions.', 60, true, 330, null)
),
category_lookup AS (
  SELECT id, slug
  FROM public.global_skill_categories
),
subcategory_lookup AS (
  SELECT sc.id, sc.slug, sc.category_id
  FROM public.global_skill_subcategories sc
)
INSERT INTO public.global_skills (
  category_id,
  subcategory_id,
  name,
  slug,
  icon,
  description,
  popular_order,
  sort_order,
  is_popular,
  is_active,
  feature_key,
  metadata
)
SELECT
  c.id,
  sc.id,
  s.name,
  s.slug,
  s.icon,
  s.description,
  s.popular_order,
  s.sort_order,
  s.is_popular,
  true,
  s.feature_key,
  '{}'::jsonb
FROM skill_seed s
JOIN category_lookup c ON c.slug = s.category_slug
JOIN subcategory_lookup sc
  ON sc.category_id = c.id
  AND sc.slug = s.subcategory_slug
ON CONFLICT (slug) DO UPDATE
SET
  category_id = EXCLUDED.category_id,
  subcategory_id = EXCLUDED.subcategory_id,
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  popular_order = EXCLUDED.popular_order,
  sort_order = EXCLUDED.sort_order,
  is_popular = EXCLUDED.is_popular,
  is_active = EXCLUDED.is_active,
  feature_key = EXCLUDED.feature_key,
  metadata = EXCLUDED.metadata,
  updated_at = now();
