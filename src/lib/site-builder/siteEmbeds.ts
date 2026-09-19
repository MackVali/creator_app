export type ResolvedSiteEmbed = {
  kind: "iframe" | "video";
  provider:
    | "youtube"
    | "vimeo"
    | "spotify"
    | "video";
  src: string;
};

function cleanHost(hostname: string) {
  return hostname
    .toLowerCase()
    .replace(/^www\./, "");
}

function validYouTubeId(value: string | null) {
  if (!value) return null;

  return /^[a-zA-Z0-9_-]{6,}$/.test(value)
    ? value
    : null;
}

export function resolveSiteEmbedUrl(
  rawValue: string,
): ResolvedSiteEmbed | null {
  const raw = rawValue.trim();

  if (!raw) return null;

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    return null;
  }

  const host = cleanHost(url.hostname);
  const segments = url.pathname
    .split("/")
    .filter(Boolean);

  // -----------------------------
  // YouTube
  // -----------------------------

  if (host === "youtu.be") {
    const id = validYouTubeId(
      segments[0] ?? null,
    );

    if (!id) return null;

    return {
      kind: "iframe",
      provider: "youtube",
      src: `https://www.youtube-nocookie.com/embed/${id}`,
    };
  }

  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    const queryId = validYouTubeId(
      url.searchParams.get("v"),
    );

    const pathId =
      segments[0] === "shorts" ||
      segments[0] === "embed" ||
      segments[0] === "live"
        ? validYouTubeId(
            segments[1] ?? null,
          )
        : null;

    const id = queryId ?? pathId;

    if (!id) return null;

    return {
      kind: "iframe",
      provider: "youtube",
      src: `https://www.youtube-nocookie.com/embed/${id}`,
    };
  }

  // -----------------------------
  // Vimeo
  // -----------------------------

  if (
    host === "vimeo.com" ||
    host === "player.vimeo.com"
  ) {
    const id = [...segments]
      .reverse()
      .find((segment) =>
        /^\d+$/.test(segment),
      );

    if (!id) return null;

    return {
      kind: "iframe",
      provider: "vimeo",
      src: `https://player.vimeo.com/video/${id}`,
    };
  }

  // -----------------------------
  // Spotify
  // -----------------------------

  if (host === "open.spotify.com") {
    const allowedTypes = new Set([
      "track",
      "album",
      "playlist",
      "episode",
      "show",
      "artist",
    ]);

    const typeIndex = segments.findIndex(
      (segment) =>
        allowedTypes.has(segment),
    );

    if (
      typeIndex < 0 ||
      !segments[typeIndex + 1]
    ) {
      return null;
    }

    const type = segments[typeIndex];
    const id = segments[typeIndex + 1];

    if (!/^[a-zA-Z0-9]+$/.test(id)) {
      return null;
    }

    return {
      kind: "iframe",
      provider: "spotify",
      src: `https://open.spotify.com/embed/${type}/${id}`,
    };
  }

  // -----------------------------
  // Direct video
  // -----------------------------

  const pathname =
    url.pathname.toLowerCase();

  if (
    pathname.endsWith(".mp4") ||
    pathname.endsWith(".webm") ||
    pathname.endsWith(".ogg") ||
    pathname.endsWith(".ogv")
  ) {
    return {
      kind: "video",
      provider: "video",
      src: url.toString(),
    };
  }

  return null;
}
