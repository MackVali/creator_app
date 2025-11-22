// Base interface for all tables
export interface BaseTable {
  id: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Core tables
export interface Goals extends BaseTable {
  is_current: boolean;
  priority_id: number;
  energy_id: number;
  stage_id: number;
  monument_id: number;
  Title: string;
}

export interface Projects extends BaseTable {
  energy_id: number | null;
  priority_id: number | null;
  goal_id: number | null;
  stage_id: number;
  Title: string;
}

export interface Tasks extends BaseTable {
  energy_id: number | null;
  priority_id: number | null;
  project_id: number | null;
  stage_id: number;
  Title: string;
}

export interface Habits extends BaseTable {
  recurrence: number | null;
  Title: string | null;
  type_id: number;
  window_id?: string | null;
  skill_id?: string | null;
  energy?: string | null;
}

export interface Skills extends BaseTable {
  Title: string | null;
  cat_id: number | null;
}

export interface Monuments extends BaseTable {
  Title: string | null;
  description: string | null;
}

// Junction table
export interface MonumentSkills {
  user_id: string;
  monument_id: number | null;
  skill_id: number | null;
}

// Lookup tables
export interface Energy {
  id: number;
  name: string;
  order_index: number;
}

export interface GoalStage {
  id: number;
  name: string | null;
  order_index: number | null;
}

export interface HabitTypes {
  id: number;
  name: string | null;
}

export interface Priority {
  id: number;
  name: string;
  order_index: number;
}

export interface ProjectStage {
  id: number;
  name: string | null;
  order_index: number | null;
}

export interface TaskStage {
  id: number;
  name: string | null;
  order_index: number | null;
}

export interface SkillCategories {
  id: number;
  name: string | null;
}

// Enhanced Profile interface
export interface ProfilePartnerBadge {
  id: string;
  label: string;
  description?: string | null;
  icon?: string | null;
  url?: string | null;
}

export interface ProfileQuickActionBadge {
  id: string;
  label: string;
  href?: string | null;
  icon?: string | null;
  aria_label?: string | null;
  analytics_event?: string | null;
}

export interface ContentCard {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  url: string;
  thumbnail_url?: string | null;
  category?: string | null;
  position: number;
  is_active: boolean;
  media_type?: "video" | "audio" | "article" | "livestream" | "gallery" | null;
  embed_url?: string | null;
  embed_html?: string | null;
  poster_url?: string | null;
  cta_label?: string | null;
  accent_color?: string | null;
  stats_label?: string | null;
  stats_value?: string | null;
  tags?: string[] | null;
  analytics_event?: string | null;
  created_at: string;
  updated_at: string;
}

export type ProfileModuleType =
  | "featured_carousel"
  | "link_cards"
  | "social_proof_strip"
  | "embedded_media_accordion";

export interface ProfileModuleBase {
  id: string;
  type: ProfileModuleType;
  title?: string | null;
  subtitle?: string | null;
  position: number;
  is_active?: boolean | null;
  analytics_event_prefix?: string | null;
  layout_variant?: "default" | "compact" | "expanded" | "immersive" | null;
  settings?: Record<string, unknown> | null;
}

export interface ProfileModuleFeaturedSlide {
  id: string;
  title: string;
  description?: string | null;
  media_url?: string | null;
  media_type?: "image" | "video" | "gradient" | null;
  href?: string | null;
  cta_label?: string | null;
  accent_color?: string | null;
  analytics_event?: string | null;
}

export interface ProfileModuleFeaturedCarousel extends ProfileModuleBase {
  type: "featured_carousel";
  slides: ProfileModuleFeaturedSlide[];
  autoplay?: boolean;
  loop?: boolean;
  interval_ms?: number | null;
}

export interface ProfileModuleLinkCards extends ProfileModuleBase {
  type: "link_cards";
  cards: ContentCard[];
  layout?: "stacked" | "grid" | "list" | null;
}

export interface ProfileModuleSocialProofItem {
  id: string;
  label: string;
  value: string;
  platform?: string | null;
  url?: string | null;
  icon?: string | null;
  aria_label?: string | null;
  analytics_event?: string | null;
}

export interface ProfileModuleSocialProofStrip extends ProfileModuleBase {
  type: "social_proof_strip";
  items: ProfileModuleSocialProofItem[];
  display_mode?: "row" | "grid" | "marquee" | null;
}

export interface ProfileModuleEmbeddedSection {
  id: string;
  title: string;
  description?: string | null;
  media_url?: string | null;
  media_type?: "video" | "audio" | "article" | "gallery" | null;
  embed_html?: string | null;
  poster_url?: string | null;
  cta_label?: string | null;
  cta_href?: string | null;
  analytics_event?: string | null;
}

export interface ProfileModuleEmbeddedMediaAccordion extends ProfileModuleBase {
  type: "embedded_media_accordion";
  sections: ProfileModuleEmbeddedSection[];
  allow_multiple_open?: boolean | null;
}

export type ProfileModule =
  | ProfileModuleFeaturedCarousel
  | ProfileModuleLinkCards
  | ProfileModuleSocialProofStrip
  | ProfileModuleEmbeddedMediaAccordion;

export interface Profile {
  id: number;
  user_id: string;
  username: string;
  name?: string | null;
  tagline?: string | null;
  dob?: string | null;
  city?: string | null;
  location_display?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  hero_background_type?: "gradient" | "image" | "video" | null;
  hero_gradient_preset?: string | null;
  hero_media_url?: string | null;
  hero_media_type?: "image" | "video" | null;
  hero_media_size_bytes?: number | null;
  hero_media_duration_seconds?: number | null;
  hero_parallax_intensity?: number | null;
  hero_motion_enabled?: boolean | null;
  hero_background_overlay?: string | null;
  hero_video_autoplay?: boolean | null;
  hero_video_loop?: boolean | null;
  hero_primary_cta_label?: string | null;
  hero_primary_cta_url?: string | null;
  hero_secondary_cta_label?: string | null;
  hero_secondary_cta_url?: string | null;
  verified?: boolean;
  avatar_frame_style?: "circle" | "rounded-square" | "halo" | null;
  partner_badges?: ProfilePartnerBadge[] | null;
  quick_action_badges?: ProfileQuickActionBadge[] | null;
  modules?: ProfileModule[] | null;
  theme_color?: string;
  font_family?: string;
  accent_color?: string;
  business_name?: string | null;
  business_industry?: string | null;
  scheduling_provider?: string | null;
  scheduling_link?: string | null;
  contact_email_public?: string | null;
  contact_phone_public?: string | null;
  timezone?: string | null;
  availability_last_synced_at?: string | null;
  active_theme_settings_id?: string | null;
  prefers_dark_mode?: boolean;
  notifications_enabled?: boolean;
  created_at: string;
  updated_at?: string;
  theme_settings?: ProfileThemeSettings | null;
  cta_buttons?: ProfileCTAButton[] | null;
  offers?: ProfileOffer[] | null;
  testimonials?: ProfileTestimonial[] | null;
  business_info?: ProfileBusinessInfo | null;
  availability?: ProfileAvailabilityWindow[] | null;
}

// Social Links
export interface LinkedAccount {
  id: string;
  user_id: string;
  platform: string;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface SocialLink {
  id: string;
  user_id: string;
  platform: string;
  url: string;
  icon?: string | null;
  color?: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileModuleAnalyticsEvent {
  moduleId: string;
  moduleType: ProfileModuleType;
  action: string;
  label?: string;
  value?: string | number;
  metadata?: Record<string, unknown>;
}

// Profile Themes
export interface ProfileTheme {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_gradient?: string | null;
  font_family: string;
  is_premium: boolean;
  created_at: string;
}

export type ProfileOfferType = "product" | "service";

export type ProfileAvailabilityStatus = "available" | "booked" | "blocked";

export interface ProfileThemeSettings {
  id: string;
  profile_id: string;
  user_id: string;
  theme_id?: string | null;
  gradient_preset?: string | null;
  hero_background_mode?: string | null;
  custom_colors?: Record<string, string> | null;
  ambient_glow_strength?: string | null;
  motion_level?: string | null;
  typography_scale?: string | null;
  is_public?: boolean | null;
  created_at: string;
  updated_at: string;
  theme?: ProfileTheme | null;
}

export interface ProfileCTAButton {
  id: string;
  profile_id: string;
  user_id: string;
  label: string;
  href: string;
  intent?: string | null;
  icon?: string | null;
  analytics_event?: string | null;
  sort_order: number;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileOffer {
  id: string;
  profile_id: string;
  user_id: string;
  offer_type: ProfileOfferType;
  title: string;
  description?: string | null;
  price_cents?: number | null;
  currency?: string | null;
  media_url?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  inventory_status?: string | null;
  duration_minutes?: number | null;
  position: number;
  is_featured: boolean;
  is_active: boolean;
  tags?: string[] | null;
  analytics_event?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileTestimonial {
  id: string;
  profile_id: string;
  user_id: string;
  quote: string;
  author_name: string;
  author_title?: string | null;
  source_url?: string | null;
  rating?: number | null;
  highlight: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProfileBusinessInfo {
  id: string;
  profile_id: string;
  user_id: string;
  legal_name?: string | null;
  display_name?: string | null;
  tagline?: string | null;
  industry?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  timezone?: string | null;
  booking_policy?: string | null;
  privacy_notice?: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileAvailabilityWindow {
  id: string;
  profile_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  timezone: string;
  status: ProfileAvailabilityStatus;
  capacity: number;
  booking_url?: string | null;
  external_id?: string | null;
  is_virtual: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicProfileReadModel {
  profile: Profile;
  theme: ProfileThemeSettings | null;
  ctas: ProfileCTAButton[];
  offers: ProfileOffer[];
  testimonials: ProfileTestimonial[];
  businessInfo: ProfileBusinessInfo | null;
  availability: ProfileAvailabilityWindow[];
  generated_at: string;
}

// Profile Form Data
export interface ProfileFormData {
  name: string;
  username: string;
  dob: string;
  city: string;
  bio: string;
  avatar?: File;
  banner?: File;
  theme_color?: string;
  font_family?: string;
  accent_color?: string;
}

// Linked Account Form Data
export interface LinkedAccountFormData {
  platform: string;
  url: string;
}

// Social Link Form Data
export interface SocialLinkFormData {
  platform: string;
  url: string;
  icon?: string;
  color?: string;
  position?: number;
}

// Content Card Form Data
export interface ContentCardFormData {
  title: string;
  description?: string;
  url: string;
  thumbnail?: File;
  category?: string;
  position?: number;
}

// Profile Update Result
export interface ProfileUpdateResult {
  success: boolean;
  error?: string;
  profile?: Profile;
}

// Linked Account Update Result
export interface LinkedAccountUpdateResult {
  success: boolean;
  error?: string;
  account?: LinkedAccount;
}

// Social Link Update Result
export interface SocialLinkUpdateResult {
  success: boolean;
  error?: string;
  socialLink?: SocialLink;
}

// Content Card Update Result
export interface ContentCardUpdateResult {
  success: boolean;
  error?: string;
  contentCard?: ContentCard;
}

// Database schema type
export interface Database {
  public: {
    Tables: {
      goals: {
        Row: Goals;
        Insert: Omit<Goals, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Goals, "id" | "created_at" | "updated_at">>;
      };
      projects: {
        Row: Projects;
        Insert: Omit<Projects, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Projects, "id" | "created_at" | "updated_at">>;
      };
      tasks: {
        Row: Tasks;
        Insert: Omit<Tasks, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Tasks, "id" | "created_at" | "updated_at">>;
      };
      habits: {
        Row: Habits;
        Insert: Omit<Habits, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Habits, "id" | "created_at" | "updated_at">>;
      };
      skills: {
        Row: Skills;
        Insert: Omit<Skills, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Skills, "id" | "created_at" | "updated_at">>;
      };
      monuments: {
        Row: Monuments;
        Insert: Omit<Monuments, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Monuments, "id" | "created_at" | "updated_at">>;
      };
      monument_skills: {
        Row: MonumentSkills;
        Insert: MonumentSkills;
        Update: Partial<MonumentSkills>;
      };
      energy: {
        Row: Energy;
        Insert: Omit<Energy, "id">;
        Update: Partial<Omit<Energy, "id">>;
      };
      goal_stage: {
        Row: GoalStage;
        Insert: Omit<GoalStage, "id">;
        Update: Partial<Omit<GoalStage, "id">>;
      };
      habit_types: {
        Row: HabitTypes;
        Insert: Omit<HabitTypes, "id">;
        Update: Partial<Omit<HabitTypes, "id">>;
      };
      priority: {
        Row: Priority;
        Insert: Omit<Priority, "id">;
        Update: Partial<Omit<Priority, "id">>;
      };
      project_stage: {
        Row: ProjectStage;
        Insert: Omit<ProjectStage, "id">;
        Update: Partial<Omit<ProjectStage, "id">>;
      };
      task_stage: {
        Row: TaskStage;
        Insert: Omit<TaskStage, "id">;
        Update: Partial<Omit<TaskStage, "id">>;
      };
      skill_categories: {
        Row: SkillCategories;
        Insert: Omit<SkillCategories, "id">;
        Update: Partial<Omit<SkillCategories, "id">>;
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id" | "created_at" | "updated_at">>;
      };
      linked_accounts: {
        Row: LinkedAccount;
        Insert: Omit<LinkedAccount, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<LinkedAccount, "id" | "created_at" | "updated_at">>;
      };
      social_links: {
        Row: SocialLink;
        Insert: Omit<SocialLink, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<SocialLink, "id" | "created_at" | "updated_at">>;
      };
      content_cards: {
        Row: ContentCard;
        Insert: Omit<ContentCard, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ContentCard, "id" | "created_at" | "updated_at">>;
      };
      profile_themes: {
        Row: ProfileTheme;
        Insert: Omit<ProfileTheme, "id" | "created_at">;
        Update: Partial<Omit<ProfileTheme, "id" | "created_at">>;
      };
    };
  };
}
