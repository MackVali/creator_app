import { describe, expect, it } from "vitest";

import {
  changeSectionVariant,
  createSiteSection,
  SITE_SECTION_DEFINITIONS,
} from "@/lib/site-builder/sectionRegistry";

describe("site builder section registry", () => {
  it("defines a default variant that exists for every registered section type", () => {
    for (const definition of SITE_SECTION_DEFINITIONS) {
      expect(definition.defaultLayout.variant).toBeTruthy();
      expect(
        definition.variants.some(
          (variant) => variant.id === definition.defaultLayout.variant,
        ),
      ).toBe(true);
    }
  });

  it("creates sections with registry defaults", () => {
    const section = createSiteSection({
      pageId: "home",
      type: "products",
      variant: "featured",
    });

    expect(section.type).toBe("products");
    expect(section.label).toBe("Products");
    expect(section.visible).toBe(true);
    expect(section.layout?.variant).toBe("featured");
    expect(section.source).toEqual({
      kind: "source",
      listingType: "product",
      mode: "selected",
      listingIds: [],
    });
    expect(section.style?.showPrice).toBe(true);
    expect(section.style?.showDescription).toBe(true);
  });

  it("creates split sections with media and an action", () => {
    const section = createSiteSection({
      pageId: "about",
      type: "split",
      variant: "media-left",
    });

    expect(section.type).toBe("split");
    expect(section.layout?.variant).toBe("media-left");
    expect(section.content).toHaveProperty("heading");
    expect(section.content).toHaveProperty("mediaUrl");
    expect(section.content).toHaveProperty("buttonLabel");
  });

  it("creates repeatable stats sections", () => {
    const section = createSiteSection({
      pageId: "home",
      type: "stats",
      variant: "editorial",
    });

    expect(section.type).toBe("stats");
    expect(section.layout?.variant).toBe("editorial");
    expect(Array.isArray(section.content.items)).toBe(true);
  });

  it("creates FAQ sections with editable questions", () => {
    const section = createSiteSection({
      pageId: "home",
      type: "faq",
    });

    expect(section.type).toBe("faq");
    expect(section.layout?.variant).toBe("accordion");
    expect(Array.isArray(section.content.items)).toBe(true);
  });

  it("creates testimonial sections with presentation variants", () => {
    const section = createSiteSection({
      pageId: "home",
      type: "testimonials",
      variant: "featured",
    });

    expect(section.type).toBe("testimonials");
    expect(section.layout?.variant).toBe("featured");
    expect(Array.isArray(section.content.items)).toBe(true);
  });

  it("changes only layout variant when switching variants", () => {
    const section = createSiteSection({
      pageId: "home",
      type: "products",
      variant: "grid",
    });
    const withContent = {
      ...section,
      content: {
        heading: "Shop",
        intro: "Selected things",
      },
      source: {
        kind: "source" as const,
        listingType: "product" as const,
        mode: "selected" as const,
        listingIds: ["prod_1", "prod_2"],
      },
      style: {
        ...section.style,
        showPrice: false,
      },
    };

    const changed = changeSectionVariant(withContent, "list");

    expect(changed.layout?.variant).toBe("list");
    expect(changed.content).toEqual(withContent.content);
    expect(changed.source).toEqual(withContent.source);
    expect(changed.style).toEqual(withContent.style);
    expect(withContent.layout?.variant).toBe("grid");
  });

  it("keeps inserted section ids unique", () => {
    const first = createSiteSection({
      pageId: "home",
      type: "hero",
    });
    const second = createSiteSection({
      pageId: "home",
      type: "hero",
      existingIds: [first.id],
    });

    expect(second.id).not.toBe(first.id);
  });
});
