export type SkillRow = {
  id: string; 
  user_id: string; 
  name: string; 
  icon: string | null;
  cat_id: string | null; 
  monument_id: string | null;
  level: number | null; 
  sort_order?: number | null;
  created_at?: string | null; 
  updated_at?: string | null;
  is_default?: boolean | null;
  is_locked?: boolean | null;
};

export type SkillDisplay = {
  id: string;
  name: string;
  icon: string;
  level: number;
  percent: number;
};

export type SkillCategory = {
  id: string;
  name: string;
  skill_count: number;
  skills: SkillDisplay[];
};
