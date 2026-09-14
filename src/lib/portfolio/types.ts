export type PortfolioVisualKey =
  | "creator"
  | "business"
  | "yump"
  | "abyssal"
  | "visual-one"
  | "visual-two"
  | "visual-three"
  | "studio";

export type PortfolioCategory =
  | "software"
  | "clothing"
  | "visual"
  | "studio";

export interface PortfolioProject {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  category: PortfolioCategory;
  visual: PortfolioVisualKey;
  year?: string;
  role?: string;
  stack?: string[];
  featured?: boolean;
  detail?: {
    intro: string;
    sections: Array<{
      eyebrow: string;
      title: string;
      body: string;
      visual?: PortfolioVisualKey;
    }>;
  };
}

export interface PortfolioSiteData {
  handle: string;
  name: string;
  headline: string;
  intro: string;
  note: string;
  software: PortfolioProject[];
  clothing: PortfolioProject[];
  visual: PortfolioProject[];
  studio: {
    title: string;
    description: string;
    equipment: string[];
    visual: PortfolioVisualKey;
  };
}
