export type MonumentNote = {
  id: string;
  monumentId: string;
  title: string | null;
  content: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  parentNoteId?: string | null;
  siblingOrder?: number | null;
  isBookmarked?: boolean;
  icon?: string | null;
};
