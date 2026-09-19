import { describe, expect, it } from "vitest";

import { toPublicSourceListing } from "@/lib/site-builder/publicListingProjection";

describe("public Site Builder Source listing projection", () => {
  it("removes internal publishing data and arbitrary metadata", () => {
    const listing = toPublicSourceListing({
      id: "listing-1",
      type: "product",
      title: "Public product",
      description: "Description",
      price: 25,
      currency: "USD",
      status: "published",
      metadata: {
        coverImage: "https://example.com/cover.jpg",
        duration_minutes: 90,
        media: [
          {
            url: "https://example.com/alternate.jpg",
            type: "image",
            internal_note: "do not expose",
          },
        ],
        private_note: "internal only",
        access_token: "never public",
      },
      published_at: "2026-09-18T00:00:00.000Z",
      created_at: "2026-09-17T00:00:00.000Z",
      updated_at: "2026-09-18T00:00:00.000Z",
    });

    expect(listing.publish_results).toBeNull();

    expect(listing.metadata).toEqual({
      coverImage: "https://example.com/cover.jpg",
      duration_minutes: 90,
      media: [
        {
          url: "https://example.com/alternate.jpg",
          type: "image",
        },
      ],
    });

    expect(listing.metadata).not.toHaveProperty(
      "private_note",
    );
    expect(listing.metadata).not.toHaveProperty(
      "access_token",
    );
  });
});
