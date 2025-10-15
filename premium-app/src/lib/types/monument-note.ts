export type MonumentNote = {
  id: string;
  monumentId: string;
  title: string | null;
  content: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};
