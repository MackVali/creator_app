import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import ProgressBarGradient from "../../src/components/skills/ProgressBarGradient";

describe("ProgressBarGradient", () => {
  it("renders 0%", () => {
    const html = renderToStaticMarkup(<ProgressBarGradient value={0} />);
    expect(html).toContain("width:0%");
  });

  it("renders 50%", () => {
    const html = renderToStaticMarkup(<ProgressBarGradient value={50} />);
    expect(html).toContain("width:50%");
  });

  it("renders 100%", () => {
    const html = renderToStaticMarkup(<ProgressBarGradient value={100} />);
    expect(html).toContain("width:100%");
  });
});

