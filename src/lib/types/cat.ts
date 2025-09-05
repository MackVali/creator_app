export type CatRow = {
  id: string;
  user_id: string;
  name: string;
  color_hex?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
};
