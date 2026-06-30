type GraphemeSegment = { segment: string };

type SegmenterLike = {
  segment(input: string): Iterable<GraphemeSegment>;
};

type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locales?: string | string[],
    options?: { granularity?: "grapheme" },
  ) => SegmenterLike;
};

const emojiLikeGraphemePattern =
  /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Presentation}|\uFE0F)/u;
const fallbackEmojiSequencePattern =
  /^(?:\p{Regional_Indicator}{2}|(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})\uFE0F?\p{Emoji_Modifier}?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})\uFE0F?\p{Emoji_Modifier}?)*|\p{Emoji}\uFE0F)/u;

function getFirstGraphemeCluster(value: string): string {
  const Segmenter = (Intl as IntlWithSegmenter).Segmenter;
  if (Segmenter) {
    const segmenter = new Segmenter(undefined, { granularity: "grapheme" });
    const first = segmenter.segment(value)[Symbol.iterator]().next();
    return first.done ? "" : first.value.segment;
  }

  return value.match(fallbackEmojiSequencePattern)?.[0] ?? Array.from(value)[0] ?? "";
}

function isEmojiLikeGrapheme(value: string): boolean {
  return emojiLikeGraphemePattern.test(value);
}

export function normalizeMonumentIconInput(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "";
  }

  const firstGrapheme = getFirstGraphemeCluster(trimmedValue);
  return isEmojiLikeGrapheme(firstGrapheme) ? firstGrapheme : trimmedValue;
}

export function getMonumentIconOrDefault(value: string | null | undefined): string {
  return normalizeMonumentIconInput(value ?? "") || "🏛️";
}
