import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, beforeEach, afterEach, vi, it } from "vitest";

import ProjectCard from "@/components/ProjectCard";

const { overlayMock, confettiMock } = vi.hoisted(() => {
  return {
    overlayMock: {
      playCrack: vi.fn(async () => {}),
      explode: vi.fn(async () => {}),
      teardown: vi.fn(() => {}),
    },
    confettiMock: vi.fn(async () => {}),
  };
});

vi.mock("@/components/effects/LavaCrackOverlay", () => {
  const React = require("react");
  const MockOverlay = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => overlayMock);
    return <div data-testid="mock-lava-overlay" {...props} />;
  });
  MockOverlay.displayName = "MockLavaCrackOverlay";
  return {
    __esModule: true,
    default: MockOverlay,
  };
});

vi.mock("@/components/effects/ConfettiBurst", () => ({
  __esModule: true,
  default: confettiMock,
}));

const prefersReducedMotionMock = vi.fn(() => false);

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  __esModule: true,
  default: () => prefersReducedMotionMock(),
  usePrefersReducedMotion: () => prefersReducedMotionMock(),
}));

describe("ProjectCard", () => {
  beforeEach(() => {
    prefersReducedMotionMock.mockReturnValue(false);
    overlayMock.playCrack.mockClear();
    overlayMock.explode.mockClear();
    overlayMock.teardown.mockClear();
    confettiMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("respects reduced motion preference", async () => {
    prefersReducedMotionMock.mockReturnValue(true);

    render(<ProjectCard id="test" title="Test project" />);

    const card = screen.getByTestId("project-card");
    const checkbox = screen.getByRole("checkbox");

    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(card).toHaveAttribute("data-completed", "true")
    );

    expect(screen.queryByTestId("mock-lava-overlay")).not.toBeInTheDocument();
    expect(overlayMock.playCrack).not.toHaveBeenCalled();
    expect(overlayMock.explode).not.toHaveBeenCalled();
  });

  it("completes animation sequence when motion is allowed", async () => {
    render(<ProjectCard id="anim" title="Animated project" />);

    const card = screen.getByTestId("project-card");
    const checkbox = screen.getByRole("checkbox");

    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(overlayMock.playCrack).toHaveBeenCalledTimes(1)
    );

    await waitFor(() =>
      expect(card).toHaveAttribute("data-completed", "true")
    );

    expect(overlayMock.explode).toHaveBeenCalledTimes(1);
  });

  it("tears down overlay on unmount", () => {
    const { unmount } = render(
      <ProjectCard id="cleanup" title="Cleanup" />
    );

    expect(screen.getByTestId("mock-lava-overlay")).toBeInTheDocument();

    unmount();

    expect(overlayMock.teardown).toHaveBeenCalledTimes(1);
  });
});
