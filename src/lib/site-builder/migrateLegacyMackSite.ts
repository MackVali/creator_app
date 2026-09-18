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

const largeMackSectionIds = new Set([
  "home-software",
  "home-clothing",
  "home-visual",
]);

function migrateLegacySection(
  site: SiteDocument,
  section: SiteSection,
): SiteSection {
  if (
    largeMackSectionIds.has(section.id) &&
    !section.layout?.size &&
    !section.content.templateKind
  ) {
    return {
      ...section,
      layout: {
        ...section.layout,
        size: "large",
      },
    };
  }

  const templateKind =
    section.content.templateKind;

  if (templateKind === "software") {
    return {
      ...section,
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
      ...section,
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
      ...section,
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
      ...section,
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

  return section;
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

  if (!changed) {
    return site;
  }

  return {
    ...site,
    pages,
  };
}
