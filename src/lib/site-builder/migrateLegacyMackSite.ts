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
