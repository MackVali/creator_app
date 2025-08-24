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

export interface Profile {
  id: number;
  user_id: string;
  username: string;
  name?: string | null; // Made optional since column doesn't exist yet
  dob?: string | null; // Made optional since column doesn't exist yet
  city?: string | null; // Made optional since column doesn't exist yet
  bio?: string | null; // Made optional since column doesn't exist yet
  avatar_url?: string | null; // Made optional since column doesn't exist yet
  created_at: string;
  updated_at?: string; // Made optional since column doesn't exist yet
}

export interface ProfileFormData {
  name: string;
  username: string;
  dob: string;
  city: string;
  bio: string;
  avatar?: File;
}

export interface ProfileUpdateResult {
  success: boolean;
  error?: string;
  profile?: Profile;
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
    };
  };
}
