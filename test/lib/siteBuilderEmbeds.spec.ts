import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveSiteEmbedUrl,
} from "@/lib/site-builder/siteEmbeds";

describe("site builder embeds", () => {
  it("resolves YouTube watch links", () => {
    expect(
      resolveSiteEmbedUrl(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      ),
    ).toEqual({
      kind: "iframe",
      provider: "youtube",
      src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });

  it("resolves Spotify links", () => {
    expect(
      resolveSiteEmbedUrl(
        "https://open.spotify.com/track/123ABCxyz",
      ),
    ).toEqual({
      kind: "iframe",
      provider: "spotify",
      src: "https://open.spotify.com/embed/track/123ABCxyz",
    });
  });

  it("resolves direct video files", () => {
    expect(
      resolveSiteEmbedUrl(
        "https://cdn.example.com/demo.mp4",
      ),
    ).toEqual({
      kind: "video",
      provider: "video",
      src: "https://cdn.example.com/demo.mp4",
    });
  });

  it("rejects arbitrary iframe destinations", () => {
    expect(
      resolveSiteEmbedUrl(
        "https://example.com/random-page",
      ),
    ).toBeNull();
  });
});
