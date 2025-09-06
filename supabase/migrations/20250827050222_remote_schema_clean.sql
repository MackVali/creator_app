-- Cleaned version of remote schema migration
-- Removes problematic identity drop statements since tables are already created with UUIDs

drop extension if exists "pg_net";

create type "public"."energy_enum" as enum ('NO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'EXTREME');

create type "public"."habit_type_enum" as enum ('HABIT', 'CHORE');

create type "public"."priority_enum" as enum ('NO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'ULTRA-CRITICAL');

create type "public"."project_stage_enum" as enum ('RESEARCH', 'TEST', 'BUILD', 'REFINE', 'RELEASE');

create type "public"."recurrence_enum" as enum ('daily', 'weekly', 'bi-weekly', 'monthly', 'bi-monthly', 'yearly', 'every x days');

create type "public"."task_stage_enum" as enum ('PREPARE', 'PRODUCE', 'PERFECT');

-- Create cats table (already exists in base schema, but recreate to ensure consistency)
DROP TABLE IF EXISTS public.cats CASCADE;
create table "public"."cats" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "name" text not null,
  "created_at" timestamp with time zone not null default now(),
  "color_hex" text default '#000000'::text,
  "sort_order" integer
);

alter table "public"."cats" enable row level security;

-- Create content_cards table
create table "public"."content_cards" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "title" text not null,
  "description" text,
  "url" text not null,
  "thumbnail_url" text,
  "category" text,
  "position" integer not null default 0,
  "is_active" boolean default true,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now()
);

alter table "public"."content_cards" enable row level security;

-- Create profile_themes table
create table "public"."profile_themes" (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "primary_color" text not null,
  "secondary_color" text not null,
  "accent_color" text not null,
  "background_gradient" text,
  "font_family" text default 'Inter'::text,
  "is_premium" boolean default false,
  "created_at" timestamp with time zone not null default now()
);

-- Create project_skills table
create table "public"."project_skills" (
  "project_id" uuid not null,
  "skill_id" uuid not null
);

alter table "public"."project_skills" enable row level security;

-- Create social_links table
create table "public"."social_links" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "platform" text not null,
  "url" text not null,
  "icon" text,
  "color" text,
  "position" integer not null default 0,
  "is_active" boolean default true,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now()
);

alter table "public"."social_links" enable row level security;

-- Modify goals table (remove problematic columns and add new ones)
alter table "public"."goals" drop column if exists "energy_id";
alter table "public"."goals" drop column if exists "is_current";
alter table "public"."goals" drop column if exists "priority_id";
alter table "public"."goals" drop column if exists "stage_id";
alter table "public"."goals" drop column if exists "Title";

alter table "public"."goals" add column "energy" energy_enum not null default 'NO'::energy_enum;
alter table "public"."goals" add column "name" text not null;
alter table "public"."goals" add column "priority" priority_enum not null default 'NO'::priority_enum;
alter table "public"."goals" add column "updated_at" timestamp with time zone not null default now();
alter table "public"."goals" add column "why" text;

alter table "public"."goals" alter column "created_at" drop not null;

-- Modify habits table
alter table "public"."habits" drop column if exists "recurrence";
alter table "public"."habits" drop column if exists "Title";
alter table "public"."habits" drop column if exists "type_id";

alter table "public"."habits" add column "name" text not null;
alter table "public"."habits" add column "habit_type" habit_type_enum not null default 'HABIT'::habit_type_enum;
alter table "public"."habits" add column "recurrence" recurrence_enum;
alter table "public"."habits" add column "updated_at" timestamp with time zone not null default now();

-- Modify monuments table
alter table "public"."monuments" drop column if exists "Title";
alter table "public"."monuments" add column "name" text not null;
alter table "public"."monuments" add column "updated_at" timestamp with time zone not null default now();

-- Modify profiles table
alter table "public"."profiles" drop column if exists "username";
alter table "public"."profiles" add column "name" text;
alter table "public"."profiles" add column "dob" text;
alter table "public"."profiles" add column "city" text;
alter table "public"."profiles" add column "bio" text;
alter table "public"."profiles" add column "avatar_url" text;
alter table "public"."profiles" add column "banner_url" text;
alter table "public"."profiles" add column "verified" boolean default false;
alter table "public"."profiles" add column "theme_color" text;
alter table "public"."profiles" add column "font_family" text;
alter table "public"."profiles" add column "accent_color" text;
alter table "public"."profiles" add column "updated_at" timestamp with time zone not null default now();

-- Modify projects table
alter table "public"."projects" drop column if exists "energy_id";
alter table "public"."projects" drop column if exists "priority_id";
alter table "public"."projects" drop column if exists "goal_id";
alter table "public"."projects" drop column if exists "stage_id";
alter table "public"."projects" drop column if exists "Title";

alter table "public"."projects" add column "name" text not null;
alter table "public"."projects" add column "description" text;
alter table "public"."projects" add column "energy" energy_enum not null default 'NO'::energy_enum;
alter table "public"."projects" add column "priority" priority_enum not null default 'NO'::priority_enum;
alter table "public"."projects" add column "stage" project_stage_enum not null default 'RESEARCH'::project_stage_enum;
alter table "public"."projects" add column "updated_at" timestamp with time zone not null default now();

-- Modify skills table
alter table "public"."skills" drop column if exists "Title";
alter table "public"."skills" add column "name" text not null;
alter table "public"."skills" add column "icon" text not null;
alter table "public"."skills" add column "level" integer not null default 1;
alter table "public"."skills" add column "monument_id" uuid;
alter table "public"."skills" add column "updated_at" timestamp with time zone not null default now();

-- Modify tasks table
alter table "public"."tasks" drop column if exists "priority_id";
alter table "public"."tasks" drop column if exists "energy_id";
alter table "public"."tasks" drop column if exists "stage_id";
alter table "public"."tasks" drop column if exists "project_id";
alter table "public"."tasks" drop column if exists "Title";

alter table "public"."tasks" add column "name" text not null;
alter table "public"."tasks" add column "description" text;
alter table "public"."tasks" add column "energy" energy_enum not null default 'NO'::energy_enum;
alter table "public"."tasks" add column "priority" priority_enum not null default 'NO'::priority_enum;
alter table "public"."tasks" add column "stage" task_stage_enum not null default 'PREPARE'::task_stage_enum;
alter table "public"."tasks" add column "updated_at" timestamp with time zone not null default now();

-- Create RLS policies for new tables
CREATE POLICY "cats_select_own" ON public.cats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cats_insert_own" ON public.cats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cats_update_own" ON public.cats FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cats_delete_own" ON public.cats FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "content_cards_select_own" ON public.content_cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "content_cards_insert_own" ON public.content_cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "content_cards_update_own" ON public.content_cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "content_cards_delete_own" ON public.content_cards FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "profile_themes_select_own" ON public.profile_themes FOR SELECT USING (true);
CREATE POLICY "profile_themes_insert_own" ON public.profile_themes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profile_themes_update_own" ON public.profile_themes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "profile_themes_delete_own" ON public.profile_themes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "project_skills_select_own" ON public.project_skills FOR SELECT USING (true);
CREATE POLICY "project_skills_insert_own" ON public.project_skills FOR INSERT WITH CHECK (true);
CREATE POLICY "project_skills_update_own" ON public.project_skills FOR UPDATE USING (true);
CREATE POLICY "project_skills_delete_own" ON public.project_skills FOR DELETE USING (true);

CREATE POLICY "social_links_select_own" ON public.social_links FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "social_links_insert_own" ON public.social_links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "social_links_update_own" ON public.social_links FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "social_links_delete_own" ON public.social_links FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON public.cats TO anon, authenticated, service_role;
GRANT ALL ON public.content_cards TO anon, authenticated, service_role;
GRANT ALL ON public.profile_themes TO anon, authenticated, service_role;
GRANT ALL ON public.project_skills TO anon, authenticated, service_role;
GRANT ALL ON public.social_links TO anon, authenticated, service_role;
