import { ArrowLeft, X } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import PortfolioSite from "@/components/portfolio/PortfolioSite";
import type { PortfolioSiteData } from "@/lib/portfolio/types";
import type {
  SiteDocument,
  SiteSection,
} from "@/lib/site-builder/types";
import type { SourceListing } from "@/types/source";

import {
  SECTION_CATEGORIES,
  SITE_SECTION_DEFINITIONS,
  createSiteSection,
  type AddableSiteSectionType,
  type SiteSectionDefinition,
} from "@/lib/site-builder/sectionRegistry";

const SECTION_PREVIEW_MEDIA = {
  hero:
    "/images/site-builder/previews/hero.jpg",
  split:
    "/images/site-builder/previews/split.jpg",

  cards: [
    "/images/site-builder/previews/card-1.jpg",
    "/images/site-builder/previews/card-2.jpg",
    "/images/site-builder/previews/card-3.jpg",
  ],

  products: [
    "/images/site-builder/previews/product-1.jpg",
    "/images/site-builder/previews/product-2.jpg",
    "/images/site-builder/previews/product-3.jpg",
  ],

  gallery: [
    "/images/site-builder/previews/gallery-1.jpg",
    "/images/site-builder/previews/card-2.jpg",
    "/images/site-builder/previews/split.jpg",
  ],
} as const;

const SECTION_PREVIEW_SITE:
  PortfolioSiteData = {
    handle: "section-preview",
    name: "Studio",
    headline:
      "Make something worth remembering.",
    intro:
      "A clear introduction with space for a strong idea, image, or action.",
    note: "",
    software: [],
    clothing: [],
    visual: [],
    studio: {
      title: "Studio",
      description: "",
      equipment: [],
      visual: "studio",
    },
  };

const SECTION_PREVIEW_DOCUMENT:
  SiteDocument = {
    id: "section-preview-site",
    name: "Studio",
    handle: "section-preview",
    homePageId:
      "section-preview-page",

    theme: {
      palette: "paper",
      accentColor: "#1c1c1a",
      typography: "sans",
      width: "standard",
      spacing: "normal",
      sectionSpacing: 40,
      pagePadding: 42,
      radius: "soft",
    },

    catalog: {
      collections: [
        {
          id: "preview-collection",
          title: "Objects",
          slug: "objects",
          description: "",
          sortOrder: 0,
        },
      ],

      items: [
        {
          id: "preview-product-1",
          title: "Object 01",
          imageUrl:
            SECTION_PREVIEW_MEDIA.products[0],
          imagePath: "",
          imageAlt: "",
          collectionId:
            "preview-collection",
          subtitle:
            "A considered everyday object.",
          priceLabel: "$48",
          status: "available",
          href: "#",
          visible: true,
          sortOrder: 0,
        },
        {
          id: "preview-product-2",
          title: "Object 02",
          imageUrl:
            SECTION_PREVIEW_MEDIA.products[1],
          imagePath: "",
          imageAlt: "",
          collectionId:
            "preview-collection",
          subtitle:
            "Simple form, useful purpose.",
          priceLabel: "$64",
          status: "available",
          href: "#",
          visible: true,
          sortOrder: 1,
        },
        {
          id: "preview-product-3",
          title: "Object 03",
          imageUrl:
            SECTION_PREVIEW_MEDIA.products[2],
          imagePath: "",
          imageAlt: "",
          collectionId:
            "preview-collection",
          subtitle:
            "Made to live with.",
          priceLabel: "$72",
          status: "available",
          href: "#",
          visible: true,
          sortOrder: 2,
        },
      ],
    },

    pages: [
      {
        id: "section-preview-page",
        title: "Preview",
        slug: "",
        sections: [],
      },
    ],
  };

const SECTION_PREVIEW_LISTINGS:
  SourceListing[] = [
    {
      id: "preview-service-1",
      type: "service",
      title: "Creative direction",
      description:
        "Focused direction for a brand, product, or visual system.",
      price: 1200,
      currency: "USD",
      status: "published",
      metadata: {
        duration_minutes: 90,
        duration_minutes: 90,
      },
      publish_results: null,
      published_at: null,
      created_at:
        "2026-01-01T00:00:00.000Z",
      updated_at:
        "2026-01-01T00:00:00.000Z",
    },
    {
      id: "preview-service-2",
      type: "service",
      title: "Website design",
      description:
        "A clear, thoughtful website built around the work.",
      price: 1800,
      currency: "USD",
      status: "published",
      metadata: {
        duration_minutes: 90,
        duration_minutes: 120,
      },
      publish_results: null,
      published_at: null,
      created_at:
        "2026-01-01T00:00:00.000Z",
      updated_at:
        "2026-01-01T00:00:00.000Z",
    },
    {
      id: "preview-service-3",
      type: "service",
      title: "Identity system",
      description:
        "A visual foundation with enough flexibility to grow.",
      price: 2400,
      currency: "USD",
      status: "published",
      metadata: {
        duration_minutes: 90,
        duration_minutes: 120,
      },
      publish_results: null,
      published_at: null,
      created_at:
        "2026-01-01T00:00:00.000Z",
      updated_at:
        "2026-01-01T00:00:00.000Z",
    },
  ];

function buildSectionPreview(
  type: SiteSectionDefinition["type"],
): SiteSection {
  const section =
    createSiteSection({
      pageId:
        "section-preview-page",
      type:
        type as AddableSiteSectionType,
      existingIds: [],
    });

  section.id =
    `section-preview-${type}`;

  if (type === "banner") {
    section.content = {
      ...section.content,
      message:
        "New work is now available.",
      buttonLabel:
        "View project",
      buttonHref: "#",
    };

    section.layout = {
      ...section.layout,
      placement: "top",
    };

    section.style = {
      ...section.style,
      background: "contrast",
    };
  }

  if (type === "hero") {
    section.content = {
      ...section.content,
      eyebrow: "Independent studio",
      headline:
        "Make something worth remembering.",
      intro:
        "Thoughtful work with space for a strong idea, image, and point of view.",
      primaryCtaLabel:
        "View the work",
      primaryCtaHref: "#",
      mediaUrl:
        SECTION_PREVIEW_MEDIA.hero,
      mediaPath: "",
      mediaAlt: "",
      mediaFit: "cover",
      mediaRatio: "3:2",
      mediaZoom: 100,
      mediaPositionX: 50,
      mediaPositionY: 50,
      mediaFrame: "none",
      mediaRadius: 0,
    };

    section.layout = {
      ...section.layout,
      variant: "split",
      mediaShare: 56,
      gap: 44,
    };
  }

  if (type === "split") {
    section.content = {
      ...section.content,
      eyebrow: "",
      heading:
        "A strong visual with room to explain it.",
      body:
        "Use image and copy together without wrapping either one in unnecessary interface chrome.",
      buttonLabel:
        "Read more",
      buttonHref: "#",
      mediaUrl:
        SECTION_PREVIEW_MEDIA.split,
      mediaPath: "",
      mediaAlt: "",
      mediaFit: "cover",
      mediaRatio: "4:3",
      mediaZoom: 100,
      mediaPositionX: 50,
      mediaPositionY: 50,
      mediaFrame: "none",
      mediaRadius: 0,
    };
  }

  if (type === "cards") {
    section.content = {
      ...section.content,
      heading: "Selected work",
      intro: "",
      items: [
        {
          id: "preview-card-1",
          eyebrow: "",
          title: "First project",
          body:
            "A short explanation of the work.",
          imageUrl:
            SECTION_PREVIEW_MEDIA.cards[0],
          imagePath: "",
          imageAlt: "",
          linkLabel: "View project",
          linkHref: "#",
          linkPageId: "",
        },
        {
          id: "preview-card-2",
          eyebrow: "",
          title: "Second project",
          body:
            "Another piece of selected work.",
          imageUrl:
            SECTION_PREVIEW_MEDIA.cards[1],
          imagePath: "",
          imageAlt: "",
          linkLabel: "View project",
          linkHref: "#",
          linkPageId: "",
        },
        {
          id: "preview-card-3",
          eyebrow: "",
          title: "Third project",
          body:
            "A third item in the collection.",
          imageUrl:
            SECTION_PREVIEW_MEDIA.cards[2],
          imagePath: "",
          imageAlt: "",
          linkLabel: "View project",
          linkHref: "#",
          linkPageId: "",
        },
      ],
    };
  }

  if (type === "products") {
    section.content = {
      ...section.content,
      heading: "New collection",
      intro: "",
    };

    section.source = {
      kind: "catalog",
      mode: "all",
    };
  }

  if (type === "services") {
    section.content = {
      ...section.content,
      heading: "Services",
      intro: "",
    };

    section.source = {
      kind: "source",
      listingType: "service",
      mode: "latest",
    };
  }

  if (type === "gallery") {
    section.content = {
      ...section.content,
      heading: "Gallery",
      items: [
        {
          id: "preview-image-1",
          url:
            SECTION_PREVIEW_MEDIA.gallery[0],
          path: "",
          alt: "",
        },
        {
          id: "preview-image-2",
          url:
            SECTION_PREVIEW_MEDIA.gallery[1],
          path: "",
          alt: "",
        },
        {
          id: "preview-image-3",
          url:
            SECTION_PREVIEW_MEDIA.gallery[2],
          path: "",
          alt: "",
        },
      ],
    };
  }

  if (type === "media") {
    section.content = {
      ...section.content,
      mediaUrl:
        SECTION_PREVIEW_MEDIA.hero,
      mediaPath: "",
      mediaAlt: "",
      mediaFit: "cover",
      mediaRatio: "3:2",
      mediaHeight: 320,
      mediaZoom: 100,
      mediaPositionX: 50,
      mediaPositionY: 50,
      mediaFrame: "none",
      mediaRadius: 0,
    };
  }

  return section;
}

function SectionTypePreview({
  type,
  variant,
}: {
  type: SiteSectionDefinition["type"];
  variant?: string;
}) {
  const section =
    buildSectionPreview(type);

  if (variant) {
    section.layout = {
      ...section.layout,
      variant,
    };
  }

  const previewDocument:
    SiteDocument = {
      ...SECTION_PREVIEW_DOCUMENT,
      pages: [
        {
          id:
            "section-preview-page",
          title: "Preview",
          slug: "",
          sections: [section],
        },
      ],
    };

  const previewScale = 0.72;

  const previewContentRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [
    measuredHeight,
    setMeasuredHeight,
  ] = useState(320);

  useLayoutEffect(() => {
    const element =
      previewContentRef.current;

    if (!element) {
      return;
    }

    const measure = () => {
      const naturalHeight =
        element.scrollHeight;

      if (
        !Number.isFinite(
          naturalHeight,
        ) ||
        naturalHeight <= 0
      ) {
        return;
      }

      setMeasuredHeight(
        Math.ceil(
          naturalHeight *
            previewScale,
        ),
      );
    };

    measure();

    const frame =
      window.requestAnimationFrame(
        measure,
      );

    const observer =
      new ResizeObserver(
        measure,
      );

    observer.observe(
      element,
    );

    return () => {
      window.cancelAnimationFrame(
        frame,
      );

      observer.disconnect();
    };
  }, [
    type,
    variant,
  ]);

  return (
    <div
      className="relative overflow-hidden rounded-[10px] bg-[#f7f5f0] transition-[height] duration-200"
      style={{
        height:
          `${measuredHeight}px`,
      }}
    >
      <div
        ref={
          previewContentRef
        }
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0"
        style={{
          width:
            `${100 / previewScale}%`,
          transform:
            `scale(${previewScale})`,
          transformOrigin:
            "top left",
        }}
      >
        <PortfolioSite
          site={
            SECTION_PREVIEW_SITE
          }
          siteDocument={
            previewDocument
          }
          sections={[section]}
          sourceListings={
            SECTION_PREVIEW_LISTINGS
          }
          sectionOnly
        />
      </div>
    </div>
  );
}

function SectionCard({
  definition,
}: {
  definition: SiteSectionDefinition;
}) {
  return (
    <div className="block w-full">
      <div className="mb-2 flex items-end justify-between gap-5 px-1">
        <div>
          <span className="block text-[13px] font-medium text-zinc-200">
            {definition.label}
          </span>

          <span className="mt-0.5 block text-[10px] leading-4 text-zinc-600">
            {definition.description}
          </span>
        </div>

        <span className="shrink-0 text-[10px] text-zinc-700 transition-colors group-hover:text-zinc-400">
          Add →
        </span>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-white/[0.07] bg-[#0d0e10] p-2 transition-all duration-150 group-hover:border-white/[0.16]">
        <SectionTypePreview
          type={definition.type}
        />
      </div>
    </div>
  );
}


export function SectionLibrary({
  open,
  insertionLabel,
  onClose,
  onInsert,
}: {
  open: boolean;
  insertionLabel: string;
  onClose: () => void;
  onInsert: (type: AddableSiteSectionType, variant: string) => void;
}) {
  const [selectedDefinition, setSelectedDefinition] =
    useState<SiteSectionDefinition | null>(null);

  const [selectedVariantId, setSelectedVariantId] =
    useState("");

  const defaultVariant =
    selectedDefinition?.defaultLayout.variant ??
    selectedDefinition?.variants[0]?.id ??
    "";

  const selectedVariant =
    selectedDefinition?.variants.some(
      (variant) =>
        variant.id ===
        selectedVariantId,
    )
      ? selectedVariantId
      : defaultVariant;

  const activeVariant =
    selectedDefinition?.variants.find(
      (variant) =>
        variant.id ===
        selectedVariant,
    ) ??
    selectedDefinition?.variants[0] ??
    null;

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex min-h-0 flex-col bg-[#0c0d0e]">
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0c0d0e]">
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.065] px-5 py-3">
          <div>
            <p className="text-[15px] font-medium text-zinc-100">
              Add section
            </p>
            <p className="mt-1 text-[11px] leading-4 text-zinc-500">
              {selectedDefinition
                ? "Choose a starting layout."
                : insertionLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedDefinition(null);
              setSelectedVariantId("");
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-5">
          {selectedDefinition ? (
            <div className="mx-auto w-full max-w-[980px]">
              <button
                type="button"
                onClick={() => {
                  setSelectedDefinition(null);
                  setSelectedVariantId("");
                }}
                className="inline-flex h-8 items-center gap-1.5 text-[11px] text-zinc-500 transition hover:text-zinc-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Sections
              </button>

              <div className="mt-3">
                <p className="text-[24px] font-semibold tracking-[-0.04em] text-zinc-100">
                  {selectedDefinition.label}
                </p>

                <p className="mt-1 max-w-[520px] text-[11px] leading-5 text-zinc-600">
                  {selectedDefinition.description}
                </p>
              </div>

              <div className="mt-6 overflow-x-auto border-b border-white/[0.06]">
                <div className="flex min-w-max items-end gap-6">
                  {selectedDefinition.variants.map(
                    (variant) => {
                      const selected =
                        selectedVariant ===
                        variant.id;

                      return (
                        <button
                          key={
                            variant.id
                          }
                          type="button"
                          onClick={() =>
                            setSelectedVariantId(
                              variant.id,
                            )
                          }
                          className={`relative pb-3 text-[12px] font-medium transition ${
                            selected
                              ? "text-zinc-100"
                              : "text-zinc-600 hover:text-zinc-300"
                          }`}
                        >
                          {
                            variant.label
                          }

                          {selected ? (
                            <span className="absolute inset-x-0 bottom-0 h-px bg-zinc-200" />
                          ) : null}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-[14px] border border-white/[0.065] bg-[#090a0b] p-2">
                <SectionTypePreview
                  type={
                    selectedDefinition.type
                  }
                  variant={
                    selectedVariant
                  }
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-zinc-300">
                    {
                      activeVariant?.label
                    }
                  </p>

                  {activeVariant?.description ? (
                    <p className="mt-1 max-w-[540px] text-[10px] leading-4 text-zinc-600">
                      {
                        activeVariant.description
                      }
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onInsert(
                      selectedDefinition.type as AddableSiteSectionType,
                      selectedVariant,
                    );

                    setSelectedDefinition(
                      null,
                    );

                    setSelectedVariantId(
                      "",
                    );
                  }}
                  className="h-9 shrink-0 rounded-[8px] bg-zinc-100 px-4 text-[11px] font-medium text-black transition hover:bg-white"
                >
                  Add {
                    selectedDefinition.label
                  }
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              {SECTION_CATEGORIES.map((category) => {
                const definitions = SITE_SECTION_DEFINITIONS.filter(
                  (definition) => definition.category === category,
                );

                return (
                  <section key={category}>
                    <p className="mb-3 text-[11px] font-medium text-zinc-500">
                      {category}
                    </p>
                    <div className="space-y-8">
                      {definitions.map((definition) => (
                        <div
                          key={definition.type}
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            setSelectedDefinition(
                              definition,
                            )
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key ===
                                "Enter" ||
                              event.key === " "
                            ) {
                              event.preventDefault();
                              setSelectedDefinition(
                                definition,
                              );
                            }
                          }}
                          className="group block w-full cursor-pointer text-left outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                        >
                          <SectionCard
                            definition={
                              definition
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
