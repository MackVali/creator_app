import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "../../components/SettingsPage";
import { useProfile } from "../../lib/hooks/useProfile";

vi.mock("../../lib/hooks/useProfile");
vi.mock("../../components/auth/AuthProvider", () => ({
  useAuth: () => ({ session: null, isReady: true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

type UseProfileResult = ReturnType<typeof useProfile>;

const mockedUseProfile = vi.mocked(useProfile);

const createUseProfileValue = (
  overrides: Partial<UseProfileResult>,
): UseProfileResult => ({
  profile: null,
  userId: null,
  loading: false,
  error: null,
  refreshProfile: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("SettingsPage fallback states", () => {
  beforeEach(() => {
    mockedUseProfile.mockReset();
  });

  it("renders a loading placeholder", () => {
    mockedUseProfile.mockReturnValue(
      createUseProfileValue({
        loading: true,
      }),
    );

    const html = renderToStaticMarkup(<SettingsPage />);
    expect(html).toContain("Loading your settings");
  });

  it("renders an error message when profile lookup fails", () => {
    mockedUseProfile.mockReturnValue(
      createUseProfileValue({
        error: "Failed to load profile",
      }),
    );

    const html = renderToStaticMarkup(<SettingsPage />);
    expect(html).toContain("Failed to load profile");
    expect(html).toContain("Try again");
  });
});
