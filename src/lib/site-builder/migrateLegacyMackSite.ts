import { mackValiPortfolio } from "@/lib/portfolio/mackValiPortfolio";
import type {
  SiteDocument,
  SiteSection,
} from "@/lib/site-builder/types";

function resolveProjectPageId(
  site: SiteDocument,
  slug: string,
) {
  return (
    site.pages.find(
      (page) =>
        page.id === slug ||
        page.slug === slug,
    )?.id ?? ""
  );
}

function projectCard(
  site: SiteDocument,
  project: (typeof mackValiPortfolio.software)[number],
) {
  const pageId = resolveProjectPageId(
    site,
    project.slug,
  );

  return {
    id: `project-${project.slug}`,
    eyebrow: project.eyebrow ?? "",
    title: project.title,
    body: project.description ?? "",
    imageUrl: project.imageSrc ?? "",
    imagePath: "",
    imageAlt: project.title,
    linkLabel: pageId
      ? "View project"
      : "",
    linkHref: "",
    linkPageId: pageId,
  };
}

function clothingCard(
  site: SiteDocument,
  project: (typeof mackValiPortfolio.clothing)[number],
) {
  const pageId = resolveProjectPageId(
    site,
    project.slug,
  );

  return {
    id: `clothing-${project.slug}`,
    eyebrow: project.eyebrow ?? "",
    title: project.title,
    body: project.description ?? "",
    imageUrl: "",
    imagePath: "",
    imageAlt: project.title,
    linkLabel: pageId
      ? "View project"
      : "",
    linkHref: "",
    linkPageId: pageId,
  };
}

function visualCard(
  project: (typeof mackValiPortfolio.visual)[number],
) {
  return {
    id: `visual-${project.slug}`,
    eyebrow: project.eyebrow ?? "",
    title: project.title,
    body: project.description ?? "",
    imageUrl: "",
    imagePath: "",
    imageAlt: project.title,
    linkLabel: "",
    linkHref: "",
    linkPageId: "",
  };
}

function repairMigratedSoftwareCards(
  section: SiteSection,
): SiteSection {
  if (
    section.id !== "home-software" ||
    section.type !== "cards" ||
    !Array.isArray(section.content.items)
  ) {
    return section;
  }

  const projectsById = new Map(
    mackValiPortfolio.software.map(
      (project) => [
        `project-${project.slug}`,
        project,
      ],
    ),
  );

  let changed = false;

  const items = section.content.items.map(
    (item) => {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item)
      ) {
        return item;
      }

      const record =
        item as Record<string, unknown>;

      const id =
        typeof record.id === "string"
          ? record.id
          : "";

      const project =
        projectsById.get(id);

      if (!project?.imageSrc) {
        return item;
      }

      const hasImage =
        typeof record.imageUrl ===
          "string" &&
        record.imageUrl.trim().length > 0;

      if (hasImage) {
        return item;
      }

      changed = true;

      return {
        ...record,
        imageUrl: project.imageSrc,
        imageAlt:
          typeof record.imageAlt ===
            "string" &&
          record.imageAlt.trim()
            ? record.imageAlt
            : project.title,
      };
    },
  );

  if (!changed) {
    return section;
  }

  return {
    ...section,
    content: {
      ...section.content,
      items,
    },
  };
}

const largeMackSectionIds = new Set([
  "home-software",
  "home-clothing",
  "home-visual",
]);

function migrateLegacySection(
  site: SiteDocument,
  section: SiteSection,
): SiteSection {
  const repairedSection =
    repairMigratedSoftwareCards(
      section,
    );

  if (
    largeMackSectionIds.has(
      repairedSection.id,
    ) &&
    !repairedSection.layout?.size &&
    !repairedSection.content.templateKind
  ) {
    return {
      ...repairedSection,
      layout: {
        ...repairedSection.layout,
        size: "large",
      },
    };
  }

  const templateKind =
    repairedSection.content.templateKind;

  if (templateKind === "software") {
    return {
      ...repairedSection,
      type: "cards",
      content: {
        heading:
          section.label || "Software",
        intro: "",
        items:
          mackValiPortfolio.software.map(
            (project) =>
              projectCard(
                site,
                project,
              ),
          ),
      },
      layout: {
        variant: "featured",
        columns: 2,
        width: "wide",
        spacing: "spacious",
        size: "large",
      },
      style: {
        background: "default",
        divider: "none",
      },
    };
  }

  if (templateKind === "clothing") {
    return {
      ...repairedSection,
      type: "cards",
      content: {
        heading:
          section.label || "Clothing",
        intro: "",
        items:
          mackValiPortfolio.clothing.map(
            (project) =>
              clothingCard(
                site,
                project,
              ),
          ),
      },
      layout: {
        variant: "grid",
        columns: 2,
        width: "wide",
        spacing: "spacious",
        size: "large",
      },
      style: {
        background: "default",
        divider: "none",
      },
    };
  }

  if (templateKind === "visual") {
    return {
      ...repairedSection,
      type: "cards",
      content: {
        heading:
          section.label || "Visual",
        intro: "",
        items:
          mackValiPortfolio.visual.map(
            visualCard,
          ),
      },
      layout: {
        variant: "grid",
        columns: 3,
        width: "wide",
        spacing: "spacious",
        size: "large",
      },
      style: {
        background: "default",
        divider: "none",
      },
    };
  }

  if (templateKind === "studio") {
    const equipment =
      mackValiPortfolio.studio
        .equipment ?? [];

    const equipmentText =
      equipment.length > 0
        ? `\n\n${equipment.join(
            " · ",
          )}`
        : "";

    return {
      ...repairedSection,
      type: "content",
      content: {
        heading:
          mackValiPortfolio.studio
            .title,
        body: `${
          mackValiPortfolio.studio
            .description
        }${equipmentText}`,
      },
      layout: {
        variant: "standard",
        alignment: "left",
        width: "wide",
        spacing: "spacious",
        size: "large",
      },
      style: {
        background: "default",
        divider: "none",
      },
    };
  }

  return repairedSection;
}

function createMackHomeStudyPage(
  site: SiteDocument,
): SiteDocument["pages"][number] {
  const placeholder =
    "/images/portfolio/wireframe/block.svg";

  const creatorPageId =
    resolveProjectPageId(
      site,
      "creator",
    );

  const yumpPageId =
    resolveProjectPageId(
      site,
      "yump",
    );

  const abyssalPageId =
    resolveProjectPageId(
      site,
      "abyssal-insight",
    );

  const projectCard = (
    id: string,
    title: string,
    eyebrow: string,
    linkPageId = "",
    options?: {
      span?:
        | "one"
        | "two"
        | "full";
      mediaPosition?:
        | "top"
        | "left"
        | "right";
      mediaShare?: number;
      minHeight?: number;
      titleSize?: number;
      padding?: number;
    },
  ) => ({
    id,
    eyebrow,
    title,
    body: "",
    imageUrl:
      placeholder,
    imagePath: "",
    imageAlt: "",
    linkLabel:
      linkPageId
        ? "View"
        : "",
    linkHref: "",
    linkPageId,

    span:
      options?.span ??
      "one",

    mediaPosition:
      options?.mediaPosition ??
      "top",

    mediaFit:
      "cover" as const,

    mediaRatio:
      "4:3" as const,

    mediaShare:
      options?.mediaShare ??
      50,

    mediaZoom: 100,
    mediaPositionX: 50,
    mediaPositionY: 50,

    minHeight:
      options?.minHeight ??
      320,

    padding:
      options?.padding ??
      20,

    titleSize:
      options?.titleSize ??
      28,

    bodySize: 13,
    textWidth: 520,
  });

  return {
    id:
      "home-study",

    title:
      "Home Study",

    slug:
      "home-study",

    sections: [
      {
        id:
          "study-hero",

        label:
          "Hero",

        type:
          "hero",

        visible:
          true,

        source: {
          kind:
            "manual",
        },

        content: {
          eyebrow:
            "MACK VALI",

          headline:
            "Portfolio structure study",

          intro:
            "Product · Design · Creative work",

          primaryCtaLabel:
            "",

          primaryCtaHref:
            "",

          mediaUrl:
            placeholder,

          mediaPath:
            "",

          mediaAlt:
            "",

          mediaFit:
            "cover",

          mediaRatio:
            "4:3",

          mediaHeight:
            620,

          mediaZoom:
            100,

          mediaPositionX:
            50,

          mediaPositionY:
            50,

          mediaFrame:
            "none",

          mediaRadius:
            0,
        },

        layout: {
          variant:
            "split",

          alignment:
            "left",

          width:
            "wide",

          spacing:
            "spacious",

          contentWidth:
            1320,

          heightMode:
            "minimum",

          minHeight:
            720,

          paddingTopPx:
            72,

          paddingRightPx:
            48,

          paddingBottomPx:
            96,

          paddingLeftPx:
            48,

          gap:
            56,

          mediaShare:
            56,

          headingSize:
            72,

          headingWidth:
            620,

          bodySize:
            15,

          bodyWidth:
            440,

          textGap:
            20,
        },

        style: {
          background:
            "default",

          divider:
            "none",
        },
      },

      {
        id:
          "study-selected-work",

        label:
          "Selected Work",

        type:
          "cards",

        visible:
          true,

        source: {
          kind:
            "manual",
        },

        content: {
          heading:
            "Selected Work",

          intro:
            "",

          items: [
            projectCard(
              "study-creator",
              "CREATOR",
              "Primary project",
              creatorPageId,
              {
                span:
                  "full",

                mediaPosition:
                  "left",

                mediaShare:
                  64,

                minHeight:
                  560,

                titleSize:
                  52,

                padding:
                  32,
              },
            ),

            projectCard(
              "study-project-02",
              "Project 02",
              "Secondary project",
            ),

            projectCard(
              "study-project-03",
              "Project 03",
              "Secondary project",
            ),
          ],
        },

        layout: {
          variant:
            "featured",

          columns:
            2,

          width:
            "wide",

          spacing:
            "spacious",

          contentWidth:
            1320,

          paddingTopPx:
            112,

          paddingRightPx:
            48,

          paddingBottomPx:
            112,

          paddingLeftPx:
            48,

          gap:
            24,

          headingSize:
            54,

          headingWidth:
            760,

          bodySize:
            14,

          bodyWidth:
            620,

          textGap:
            16,
        },

        style: {
          background:
            "default",

          divider:
            "none",

          itemFrame:
            "none",

          itemRadius:
            0,

          itemPadding:
            0,
        },
      },

      {
        id:
          "study-clothing",

        label:
          "Clothing / Objects",

        type:
          "cards",

        visible:
          true,

        source: {
          kind:
            "manual",
        },

        content: {
          heading:
            "Clothing / Objects",

          intro:
            "",

          items: [
            projectCard(
              "study-yump",
              "Yump.",
              "Collection",
              yumpPageId,
              {
                minHeight:
                  400,

                padding:
                  16,
              },
            ),

            projectCard(
              "study-abyssal",
              "Abyssal Insight",
              "Collection",
              abyssalPageId,
              {
                minHeight:
                  400,

                padding:
                  16,
              },
            ),

            projectCard(
              "study-object",
              "Collection 03",
              "Object / Product",
              "",
              {
                minHeight:
                  400,

                padding:
                  16,
              },
            ),
          ],
        },

        layout: {
          variant:
            "grid",

          columns:
            3,

          width:
            "wide",

          spacing:
            "spacious",

          contentWidth:
            1320,

          paddingTopPx:
            96,

          paddingRightPx:
            48,

          paddingBottomPx:
            112,

          paddingLeftPx:
            48,

          gap:
            20,

          headingSize:
            48,

          headingWidth:
            760,

          bodySize:
            14,

          bodyWidth:
            620,

          textGap:
            16,
        },

        style: {
          background:
            "default",

          divider:
            "none",

          itemFrame:
            "none",

          itemRadius:
            0,

          itemPadding:
            0,
        },
      },

      {
        id:
          "study-visual",

        label:
          "Visual Archive",

        type:
          "gallery",

        visible:
          true,

        source: {
          kind:
            "manual",
        },

        content: {
          heading:
            "Visual Archive",

          intro:
            "",

          items: [
            {
              id:
                "study-visual-01",
              url:
                placeholder,
              path:
                "",
              alt:
                "",
            },
            {
              id:
                "study-visual-02",
              url:
                placeholder,
              path:
                "",
              alt:
                "",
            },
            {
              id:
                "study-visual-03",
              url:
                placeholder,
              path:
                "",
              alt:
                "",
            },
            {
              id:
                "study-visual-04",
              url:
                placeholder,
              path:
                "",
              alt:
                "",
            },
            {
              id:
                "study-visual-05",
              url:
                placeholder,
              path:
                "",
              alt:
                "",
            },
          ],
        },

        layout: {
          variant:
            "grid",

          columns:
            3,

          width:
            "wide",

          spacing:
            "spacious",

          contentWidth:
            1320,

          paddingTopPx:
            96,

          paddingRightPx:
            48,

          paddingBottomPx:
            112,

          paddingLeftPx:
            48,

          gap:
            16,
        },

        style: {
          background:
            "default",

          divider:
            "none",

          itemFrame:
            "none",

          itemRadius:
            0,

          itemMediaFit:
            "cover",

          itemMediaRatio:
            "4:3",
        },
      },

      {
        id:
          "study-about",

        label:
          "About",

        type:
          "content",

        visible:
          true,

        source: {
          kind:
            "manual",
        },

        content: {
          heading:
            "About",

          body:
            "Identity · disciplines · interests",
        },

        layout: {
          variant:
            "split",

          alignment:
            "left",

          width:
            "wide",

          spacing:
            "spacious",

          contentWidth:
            1180,

          paddingTopPx:
            120,

          paddingRightPx:
            48,

          paddingBottomPx:
            120,

          paddingLeftPx:
            48,

          gap:
            72,

          headingSize:
            54,

          headingWidth:
            520,

          bodySize:
            16,

          bodyWidth:
            520,

          textGap:
            18,
        },

        style: {
          background:
            "default",

          divider:
            "none",
        },
      },

      {
        id:
          "study-contact",

        label:
          "Contact",

        type:
          "cta",

        visible:
          true,

        source: {
          kind:
            "manual",
        },

        content: {
          heading:
            "Contact",

          body:
            "",

          buttonLabel:
            "Get in touch",

          buttonHref:
            "#contact",
        },

        layout: {
          variant:
            "minimal",

          alignment:
            "left",

          width:
            "wide",

          spacing:
            "spacious",

          contentWidth:
            1180,

          paddingTopPx:
            96,

          paddingRightPx:
            48,

          paddingBottomPx:
            120,

          paddingLeftPx:
            48,

          gap:
            32,

          headingSize:
            44,

          headingWidth:
            680,

          bodySize:
            14,

          bodyWidth:
            520,

          textGap:
            14,
        },

        style: {
          background:
            "default",

          divider:
            "none",
        },
      },
    ],
  };
}


export function migrateLegacyMackSite(
  site: SiteDocument,
): SiteDocument {
  let changed = false;

  const pages = site.pages.map(
    (page) => {
      const sections =
        page.sections.map(
          (section) => {
            const migrated =
              migrateLegacySection(
                site,
                section,
              );

            if (
              migrated !== section
            ) {
              changed = true;
            }

            return migrated;
          },
        );

      return changed
        ? {
            ...page,
            sections,
          }
        : page;
    },
  );

  let nextPages =
    pages;

  const isMackSite =
    site.id ===
      "mackvali-site" ||
    site.handle ===
      "mackvali";

  const hasHomeStudy =
    pages.some(
      (page) =>
        page.id ===
          "home-study" ||
        page.slug ===
          "home-study",
    );

  if (
    isMackSite &&
    !hasHomeStudy
  ) {
    nextPages = [
      ...pages,
      createMackHomeStudyPage(
        site,
      ),
    ];

    changed = true;
  }

  if (!changed) {
    return site;
  }

  return {
    ...site,
    pages: nextPages,
  };
}
