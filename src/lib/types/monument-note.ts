export type MonumentNote = {
  id: string;
  monumentId: string;
  title: string;
  content: string;
  pinned?: boolean;
  tags?: string[];
  updatedAt: string;
  synced?: boolean;
};
