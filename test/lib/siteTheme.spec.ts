import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createDefaultSiteTheme,
  getSiteThemeColors,
  getSiteThemePreset,
  getSiteThemeStyle,
} from "@/lib/site-builder/siteTheme";

describe("site theme", () => {
  it("resolves preset colors", () => {
    const theme =
      createDefaultSiteTheme();

    expect(
      getSiteThemeColors(
        theme,
      ).background,
    ).toBe(
      getSiteThemePreset(
        "graphite",
      ).background,
    );
  });

  it("lets explicit colors override the preset", () => {
    const theme = {
      ...createDefaultSiteTheme(),
      colors: {
        background:
          "#ff00ff",
      },
    };

    expect(
      getSiteThemeStyle(theme)[
        "--site-bg"
      ],
    ).toBe("#ff00ff");
  });

  it("uses real layout values", () => {
    const theme = {
      ...createDefaultSiteTheme(),
      sectionSpacing: 72,
      pagePadding: 84,
    };

    const style =
      getSiteThemeStyle(theme);

    expect(
      style[
        "--site-section-y"
      ],
    ).toBe("72px");

    expect(
      style[
        "--site-page-x"
      ],
    ).toContain("84px");
  });

  it("paper is actually light", () => {
    const preset =
      getSiteThemePreset(
        "paper",
      );

    expect(
      preset.background,
    ).toBe("#f4f0e8");

    expect(
      preset.text,
    ).toBe("#1b1814");
  });
});
