export type Note = {
  id: string;
  skillId: string;
  title: string | null;
  content: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};
