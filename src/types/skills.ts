export type Skill = {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  monument_id: string | null;
  level: number; // fixed 1 for now
  created_at: string;
};

export type Monument = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};
