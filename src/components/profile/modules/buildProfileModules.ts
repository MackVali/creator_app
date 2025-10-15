import {
  ContentCard,
  Profile,
  ProfileCTAButton,
  ProfileModule,
  ProfileModuleEmbeddedMediaAccordion,
  ProfileModuleFeaturedCarousel,
  ProfileModuleLinkCards,
  ProfileModuleSocialProofStrip,
  ProfileModuleType,
  ProfileOffer,
  ProfileTestimonial,
  ProfileAvailabilityWindow,
  SocialLink,
} from "@/lib/types";

function getMediaTypeFromUrl(url?: string | null): "video" | "audio" | "article" | "gallery" | null {
  if (!url) return null;
  const normalized = url.toLowerCase();
  if (/(youtube|vimeo|loom|m3u8|mp4|webm)/.test(normalized)) return "video";
  if (/(spotify|soundcloud|apple\.com\/podcasts|anchor\.fm)/.test(normalized)) return "audio";
  if (/(gallery|carousel)/.test(normalized)) return "gallery";
  return "article";
}

function formatCurrency(amountCents?: number | null, currency?: string | null) {
  if (amountCents === null || amountCents === undefined) {
    return null;
  }

  const resolvedCurrency = currency || "USD";

  try {
    const locale =
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : "en-US";

    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: resolvedCurrency,
      maximumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch {
    return `${resolvedCurrency} ${(amountCents / 100).toFixed(2)}`;
  }
}

function formatAvailabilitySlot(window: ProfileAvailabilityWindow) {
  try {
    const start = new Date(window.start_time);
    const end = new Date(window.end_time);
    const locale =
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : "en-US";

    const timeZone = window.timezone || undefined;

    const dateFormatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone,
    });
    const timeFormatter = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });

    const dateLabel = dateFormatter.format(start);
    const startLabel = timeFormatter.format(start);
    const endLabel = timeFormatter.format(end);

    const subtitleParts = [
      window.is_virtual ? "Virtual session" : "In-person session",
      window.timezone,
    ].filter(Boolean);

    return {
      title: `${dateLabel} • ${startLabel} – ${endLabel}`,
      subtitle: subtitleParts.join(" • ") || null,
      statsLabel: window.capacity > 1 ? "Spots" : "Spot",
      statsValue: `${window.capacity}`,
    } as const;
  } catch {
    return {
      title: `${window.start_time} → ${window.end_time}`,
      subtitle: window.timezone ?? null,
      statsLabel: window.capacity > 1 ? "Spots" : "Spot",
      statsValue: `${window.capacity}`,
    } as const;
  }
}

interface DeriveContentCardsArgs {
  contentCards?: ContentCard[];
  ctas?: ProfileCTAButton[];
  offers?: ProfileOffer[];
  availability?: ProfileAvailabilityWindow[];
}

function deriveContentCards({
  contentCards,
  ctas,
  offers,
  availability,
}: DeriveContentCardsArgs): ContentCard[] {
  if (contentCards && contentCards.length > 0) {
    return [...contentCards];
  }

  const offerCards: ContentCard[] = (offers ?? [])
    .filter((offer) => offer.is_active !== false)
    .map((offer, index) => {
      const formattedPrice = formatCurrency(offer.price_cents, offer.currency);
      const durationLabel =
        offer.duration_minutes && offer.duration_minutes > 0
          ? `${offer.duration_minutes} min`
          : null;

      const descriptionParts = [offer.description ?? null];
      if (durationLabel) {
        descriptionParts.push(`Duration: ${durationLabel}`);
      }
      if (offer.inventory_status) {
        descriptionParts.push(`Status: ${offer.inventory_status}`);
      }

      const statsLabel = formattedPrice ? "Starting at" : durationLabel ? "Length" : null;
      const statsValue = formattedPrice ?? durationLabel ?? null;

      return {
        id: `offer-${offer.id}`,
        user_id: offer.user_id,
        title: offer.title,
        description: descriptionParts.filter(Boolean).join(" • ") || null,
        url: offer.cta_url || offer.media_url || "",
        thumbnail_url: offer.media_url ?? null,
        category: offer.offer_type,
        position: offer.position ?? index,
        is_active: offer.is_active !== false,
        media_type: getMediaTypeFromUrl(offer.media_url ?? null),
        embed_url: offer.media_url ?? null,
        embed_html: null,
        poster_url: null,
        cta_label: offer.cta_label ?? (offer.cta_url ? "Learn more" : null),
        accent_color: null,
        stats_label: statsLabel,
        stats_value: statsValue,
        tags: offer.tags ?? null,
        analytics_event: offer.analytics_event ?? null,
        created_at: offer.created_at,
        updated_at: offer.updated_at,
      } satisfies ContentCard;
    });

  const ctaCards: ContentCard[] = (ctas ?? []).map((cta, index) => ({
    id: `cta-${cta.id}`,
    user_id: cta.user_id,
    title: cta.label,
    description: cta.intent ?? null,
    url: cta.href,
    thumbnail_url: null,
    category: cta.intent ?? "cta",
    position: cta.sort_order ?? index + 100,
    is_active: cta.is_active !== false,
    media_type: null,
    embed_url: null,
    embed_html: null,
    poster_url: null,
    cta_label: cta.label,
    accent_color: null,
    stats_label: cta.is_primary ? "Primary" : null,
    stats_value: null,
    tags: null,
    analytics_event: cta.analytics_event ?? null,
    created_at: cta.created_at,
    updated_at: cta.updated_at,
  }));

  const availabilityCards: ContentCard[] = (availability ?? []).map(
    (window, index) => {
      const slot = formatAvailabilitySlot(window);

      return {
        id: `availability-${window.id}`,
        user_id: window.user_id,
        title: slot.title,
        description: slot.subtitle,
        url: window.booking_url || "",
        thumbnail_url: null,
        category: "availability",
        position: index + 200,
        is_active: window.status === "available",
        media_type: null,
        embed_url: null,
        embed_html: null,
        poster_url: null,
        cta_label: window.booking_url ? "Reserve spot" : null,
        accent_color: null,
        stats_label: slot.statsLabel,
        stats_value: slot.statsValue,
        tags: null,
        analytics_event: `profile.availability.click.${window.id}`,
        created_at: window.created_at,
        updated_at: window.updated_at,
      } satisfies ContentCard;
    },
  );

  const combined = [...offerCards, ...ctaCards, ...availabilityCards];

  return combined.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function extractHandleFromUrl(url?: string | null) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return parsed.hostname.replace(/^www\./, "");
    }
    return segments[segments.length - 1];
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
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
  contentCards?: ContentCard[];
  socialLinks?: SocialLink[];
  ctas?: ProfileCTAButton[];
  offers?: ProfileOffer[];
  testimonials?: ProfileTestimonial[];
  availability?: ProfileAvailabilityWindow[];
}

export function buildProfileModules({
  profile,
  contentCards,
  socialLinks,
  ctas,
  offers,
  testimonials,
  availability,
}: BuildProfileModulesArgs): ProfileModule[] {
  const modules: ProfileModule[] = [];

  const derivedCards = deriveContentCards({ contentCards, ctas, offers, availability });
  const activeCards = derivedCards.filter((card) => card.is_active !== false);

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

  const socialLinkItems = (socialLinks || [])
    .filter((link) => link.is_active && !!link.url)
    .map((link) => ({
      id: `social-${link.id}`,
      label: link.platform,
      value: extractHandleFromUrl(link.url) || link.platform,
      platform: link.platform,
      url: link.url,
      analytics_event: `profile.social_proof.click.${link.platform.toLowerCase()}`,
    }));

  const testimonialItems = (testimonials ?? [])
    .filter((testimonial) => testimonial.is_active !== false)
    .map((testimonial) => {
      const rawQuote = testimonial.quote || "";
      const trimmedQuote = rawQuote.length > 140 ? `${rawQuote.slice(0, 137)}…` : rawQuote;

      return {
        id: `testimonial-${testimonial.id}`,
        label: testimonial.author_name,
        value: trimmedQuote,
        platform: testimonial.author_title ?? undefined,
        url: testimonial.source_url ?? undefined,
        analytics_event: testimonial.source_url
          ? `profile.testimonials.click.${testimonial.id}`
          : undefined,
      };
    });

  const socialProofItems = [...socialLinkItems, ...testimonialItems];

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
