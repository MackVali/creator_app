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
export interface Profile {
  id: number;
  user_id: string;
  username: string;
  name?: string | null;
  dob?: string | null;
  city?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  verified?: boolean;
  theme_color?: string;
  font_family?: string;
  accent_color?: string;
  timezone?: string | null;
  created_at: string;
  updated_at?: string;
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

// Content Cards
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
  created_at: string;
  updated_at: string;
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
  timezone?: string;
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
