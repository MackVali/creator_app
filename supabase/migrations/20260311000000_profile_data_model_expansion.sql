-- Expand profile data model to support premium modules and commerce metadata
-- Themes, CTA buttons, offers, testimonials, business information, scheduling

create type if not exists public.profile_offer_type as enum ('product', 'service');
create type if not exists public.profile_availability_status as enum ('available', 'booked', 'blocked');

create table if not exists public.profile_theme_settings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null,
  theme_id uuid references public.profile_themes(id) on delete set null,
  gradient_preset text,
  hero_background_mode text default 'dynamic',
  custom_colors jsonb,
  ambient_glow_strength text,
  motion_level text,
  typography_scale text,
  is_public boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_theme_settings_profile_unique unique (profile_id)
);

create index if not exists profile_theme_settings_profile_idx on public.profile_theme_settings(profile_id);

alter table public.profile_theme_settings enable row level security;

create table if not exists public.profile_cta_buttons (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null,
  label text not null,
  href text not null,
  intent text default 'primary',
  icon text,
  analytics_event text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_cta_buttons_profile_idx on public.profile_cta_buttons(profile_id);
create index if not exists profile_cta_buttons_sort_idx on public.profile_cta_buttons(profile_id, sort_order);

alter table public.profile_cta_buttons enable row level security;

create table if not exists public.profile_offers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null,
  offer_type public.profile_offer_type not null,
  title text not null,
  description text,
  price_cents integer,
  currency text default 'USD',
  media_url text,
  cta_label text,
  cta_url text,
  inventory_status text default 'in_stock',
  duration_minutes integer,
  position integer not null default 0,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  tags text[],
  analytics_event text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_offers_profile_idx on public.profile_offers(profile_id);
create index if not exists profile_offers_type_idx on public.profile_offers(offer_type);
create index if not exists profile_offers_position_idx on public.profile_offers(profile_id, position);

alter table public.profile_offers enable row level security;

create table if not exists public.profile_testimonials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null,
  quote text not null,
  author_name text not null,
  author_title text,
  source_url text,
  rating numeric(2,1),
  highlight boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_testimonials_profile_idx on public.profile_testimonials(profile_id);
create index if not exists profile_testimonials_sort_idx on public.profile_testimonials(profile_id, sort_order);

alter table public.profile_testimonials enable row level security;

create table if not exists public.profile_business_info (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null,
  legal_name text,
  display_name text,
  tagline text,
  industry text,
  website_url text,
  contact_email text,
  contact_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  timezone text,
  booking_policy text,
  privacy_notice text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_business_info_profile_unique unique (profile_id)
);

alter table public.profile_business_info enable row level security;

create table if not exists public.profile_availability_windows (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  timezone text not null,
  status public.profile_availability_status not null default 'available',
  capacity integer not null default 1,
  booking_url text,
  external_id text,
  is_virtual boolean not null default true,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_availability_time_check check (end_time > start_time)
);

create index if not exists profile_availability_profile_idx on public.profile_availability_windows(profile_id);
create index if not exists profile_availability_time_idx on public.profile_availability_windows(start_time);

alter table public.profile_availability_windows enable row level security;

alter table public.profiles
  add column if not exists tagline text,
  add column if not exists business_name text,
  add column if not exists business_industry text,
  add column if not exists hero_primary_cta_label text,
  add column if not exists hero_primary_cta_url text,
  add column if not exists hero_secondary_cta_label text,
  add column if not exists hero_secondary_cta_url text,
  add column if not exists scheduling_provider text,
  add column if not exists scheduling_link text,
  add column if not exists contact_email_public text,
  add column if not exists contact_phone_public text,
  add column if not exists availability_last_synced_at timestamptz,
  add column if not exists active_theme_settings_id uuid,
  add column if not exists hero_background_overlay text,
  add column if not exists hero_video_autoplay boolean not null default true,
  add column if not exists hero_video_loop boolean not null default true;

create index if not exists profiles_active_theme_settings_idx on public.profiles(active_theme_settings_id);

alter table public.profiles
  add constraint profiles_active_theme_settings_fk
  foreign key (active_theme_settings_id)
  references public.profile_theme_settings(id)
  on delete set null;

create policy if not exists "profile_theme_settings_select_public" on public.profile_theme_settings
  for select using (is_public = true or auth.uid() = user_id);
create policy if not exists "profile_theme_settings_manage_own" on public.profile_theme_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "profile_cta_buttons_public_read" on public.profile_cta_buttons
  for select using (is_active = true or auth.uid() = user_id);
create policy if not exists "profile_cta_buttons_manage_own" on public.profile_cta_buttons
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "profile_offers_public_read" on public.profile_offers
  for select using (is_active = true or auth.uid() = user_id);
create policy if not exists "profile_offers_manage_own" on public.profile_offers
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "profile_testimonials_public_read" on public.profile_testimonials
  for select using (is_active = true or auth.uid() = user_id);
create policy if not exists "profile_testimonials_manage_own" on public.profile_testimonials
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "profile_business_info_public_read" on public.profile_business_info
  for select using (is_public = true or auth.uid() = user_id);
create policy if not exists "profile_business_info_manage_own" on public.profile_business_info
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "profile_availability_public_read" on public.profile_availability_windows
  for select using ((is_public = true and status = 'available') or auth.uid() = user_id);
create policy if not exists "profile_availability_manage_own" on public.profile_availability_windows
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on public.profile_theme_settings to anon, authenticated, service_role;
grant all on public.profile_cta_buttons to anon, authenticated, service_role;
grant all on public.profile_offers to anon, authenticated, service_role;
grant all on public.profile_testimonials to anon, authenticated, service_role;
grant all on public.profile_business_info to anon, authenticated, service_role;
grant all on public.profile_availability_windows to anon, authenticated, service_role;
