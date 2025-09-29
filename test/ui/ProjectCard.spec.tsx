import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ProjectCard } from "@/components/ProjectCard";

vi.mock("canvas-confetti", () => {
  const factory = () => Promise.resolve();
  const create = vi.fn(() => () => Promise.resolve());
  return {
    __esModule: true,
    default: Object.assign(factory, {
      create,
      shapeFromPath: vi.fn(() => ({})),
      shapeFromText: vi.fn(() => ({})),
    }),
  };
});

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

if (typeof window !== "undefined" && !window.requestAnimationFrame) {
  window.requestAnimationFrame = callback => window.setTimeout(() => callback(Date.now()), 0);
}

describe("ProjectCard", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  it("marks the project as completed when the checkbox is toggled", async () => {
    const handleComplete = vi.fn();

    render(
      <ProjectCard id="card-1" title="Write summary" onComplete={handleComplete} />
    );

    const checkbox = screen.getByRole("checkbox", {
      name: /mark write summary complete/i,
    });

    fireEvent.click(checkbox);

    const card = screen.getByTestId("project-card");

    await waitFor(() => {
      expect(card).toHaveAttribute("data-completed", "true");
    });

    expect(handleComplete).toHaveBeenCalledWith("card-1");
  });

  it("skips particle canvas when reduced motion is preferred", async () => {
    mockMatchMedia(true);

    render(<ProjectCard id="card-2" title="Deep work" />);

    const checkbox = screen.getByRole("checkbox", {
      name: /mark deep work complete/i,
    });

    fireEvent.click(checkbox);

    const card = screen.getByTestId("project-card");

    await waitFor(() => {
      expect(card).toHaveAttribute("data-completed", "true");
    });

    expect(card.querySelector("canvas")).toBeNull();
  });
});
