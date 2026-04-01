import {
  ContentCard,
  Profile,
  ProfileModule,
  ProfileModuleEmbeddedMediaAccordion,
  ProfileModuleFeaturedCarousel,
  ProfileModuleLinkCards,
  ProfileModuleSocialProofItem,
  ProfileModuleSocialProofStrip,
  ProfileModuleType,
  SocialLink,
} from "@/lib/types";
import { resolveSocialLink } from "@/lib/profile/socialLinks";

function getMediaTypeFromUrl(url?: string | null): "video" | "audio" | "article" | "gallery" | null {
  if (!url) return null;
  const normalized = url.toLowerCase();
  if (/(youtube|vimeo|loom|m3u8|mp4|webm)/.test(normalized)) return "video";
  if (/(spotify|soundcloud|apple\.com\/podcasts|anchor\.fm)/.test(normalized)) return "audio";
  if (/(gallery|carousel)/.test(normalized)) return "gallery";
  return "article";
}

function baseModule<T extends ProfileModuleType>(
  type: T,
  position: number,
  overrides: Partial<ProfileModule> = {},
): ProfileModuleBaseForType<T> {
  return {
    id: overrides.id ?? `${type}-${position}`,
    type,
    title: overrides.title ?? null,
    subtitle: overrides.subtitle ?? null,
    position,
    is_active: overrides.is_active ?? true,
    analytics_event_prefix: overrides.analytics_event_prefix ?? `profile.${type}`,
    layout_variant: overrides.layout_variant ?? null,
    settings: overrides.settings ?? null,
  } as ProfileModuleBaseForType<T>;
}

type ProfileModuleBaseForType<T extends ProfileModuleType> = Extract<ProfileModule, { type: T }>;

export interface BuildProfileModulesArgs {
  profile: Profile;
  contentCards: ContentCard[];
  socialLinks: SocialLink[];
}

export function buildProfileModules({
  profile,
  contentCards,
  socialLinks,
}: BuildProfileModulesArgs): ProfileModule[] {
  const modules: ProfileModule[] = [];

  const activeCards = (contentCards || []).filter((card) => card.is_active !== false);

  const featuredSlides = activeCards
    .filter((card) => !!card.thumbnail_url || card.media_type === "video")
    .slice(0, 6)
    .map((card) => ({
      id: `featured-${card.id}`,
      title: card.title,
      description: card.description,
      media_url: card.thumbnail_url ?? card.embed_url ?? card.url,
      media_type: card.media_type ?? getMediaTypeFromUrl(card.embed_url ?? card.url),
      href: card.url,
      cta_label: card.cta_label ?? "View",
      accent_color: card.accent_color ?? null,
      analytics_event: card.analytics_event ?? null,
    }));

  const featuredCarousel: ProfileModuleFeaturedCarousel = {
    ...baseModule("featured_carousel", modules.length, {
      id: "featured-carousel",
      title:
        profile?.name ? `${profile.name}'s spotlight` : "Spotlight moments",
      subtitle: "Swipe through marquee drops, launches, or campaigns.",
    }),
    slides: featuredSlides,
    autoplay: true,
    loop: true,
    interval_ms: 6000,
  };

  modules.push(featuredCarousel);

  const linkCardsModule: ProfileModuleLinkCards = {
    ...baseModule("link_cards", modules.length, {
      id: "link-cards",
      title: "Link cards",
      subtitle: "Stacked call-to-action tiles visitors can tap through.",
    }),
    cards: activeCards.sort((a, b) => a.position - b.position),
    layout: "stacked",
  };

  modules.push(linkCardsModule);

  const socialProofItems = (socialLinks || []).reduce<ProfileModuleSocialProofItem[]>(
    (items, link) => {
      if (!link.is_active) {
        return items;
      }
      const resolved = resolveSocialLink(link);
      if (!resolved.url) {
        return items;
      }
      items.push({
        id: `social-${link.id}`,
        label: link.platform,
        value: resolved.display || link.platform,
        platform: link.platform,
        url: resolved.url,
        analytics_event: `profile.social_proof.click.${link.platform.toLowerCase()}`,
      });
      return items;
    },
    [],
  );

  const socialProofModule: ProfileModuleSocialProofStrip = {
    ...baseModule("social_proof_strip", modules.length, {
      id: "social-proof-strip",
      title: "Social proof",
      subtitle: "Surface key platforms, testimonials, or milestones.",
    }),
    items: socialProofItems,
    display_mode: "row",
  };

  modules.push(socialProofModule);

  const mediaSections = activeCards
    .filter((card) => {
      if (card.media_type) return card.media_type !== "article";
      return /(youtube|vimeo|spotify|soundcloud|twitch|loom|\.mp4|\.mp3|\.wav)/i.test(
        card.embed_url || card.url || "",
      );
    })
    .map((card) => ({
      id: `embedded-${card.id}`,
      title: card.title,
      description: card.description,
      media_url: card.embed_url ?? card.url,
      media_type: card.media_type ?? getMediaTypeFromUrl(card.embed_url ?? card.url),
      embed_html: card.embed_html ?? null,
      poster_url: card.poster_url ?? card.thumbnail_url ?? null,
      cta_label: card.cta_label ?? "Open",
      cta_href: card.url,
      analytics_event: card.analytics_event ?? null,
    }));

  const embeddedMediaModule: ProfileModuleEmbeddedMediaAccordion = {
    ...baseModule("embedded_media_accordion", modules.length, {
      id: "embedded-media-accordion",
      title: "Media vault",
      subtitle: "Expandable embeds for podcasts, videos, and long-form drops.",
    }),
    sections: mediaSections,
    allow_multiple_open: false,
  };

  modules.push(embeddedMediaModule);

  return modules.map((module, index) => ({ ...module, position: index }));
}
