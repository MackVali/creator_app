const NOTE_HIGHLIGHT_COLORS = [
  "yellow",
  "amber",
  "orange",
  "red",
  "pink",
  "purple",
  "blue",
  "cyan",
  "green",
  "mint",
  "gray",
] as const;

const NOTE_TEXT_COLORS = [
  "default",
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "mint",
  "cyan",
  "blue",
  "purple",
  "pink",
] as const;

type AttributeMarkerMatch = {
  start: number;
  end: number;
  prefix: string;
  suffix: string;
};

type InlineMarkerMatch = AttributeMarkerMatch & {
  markerType: "bold" | "italic" | "underline" | "strikethrough" | "highlight" | "color";
};

function isNoteHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function isNoteHighlightColor(value: string) {
  return NOTE_HIGHLIGHT_COLORS.includes(value as (typeof NOTE_HIGHLIGHT_COLORS)[number]) || isNoteHexColor(value);
}

function isNoteTextColor(value: string) {
  return NOTE_TEXT_COLORS.includes(value as (typeof NOTE_TEXT_COLORS)[number]) || isNoteHexColor(value);
}

function findSingleAsterisk(text: string, startIndex: number) {
  for (let index = startIndex; index < text.length; index += 1) {
    if (text[index] === "*" && text[index - 1] !== "*" && text[index + 1] !== "*") {
      return index;
    }
  }

  return -1;
}

function findSimpleMarker(
  text: string,
  startIndex: number,
  markerType: InlineMarkerMatch["markerType"],
  prefix: string,
  suffix: string,
) {
  const start = text.indexOf(prefix, startIndex);
  if (start === -1) return null;

  const end = text.indexOf(suffix, start + prefix.length);
  if (end === -1) return null;

  return { markerType, start, end, prefix, suffix };
}

function findItalicMarker(text: string, startIndex: number) {
  const start = findSingleAsterisk(text, startIndex);
  if (start === -1) return null;

  const end = findSingleAsterisk(text, start + 1);
  if (end === -1) return null;

  return {
    markerType: "italic" as const,
    start,
    end,
    prefix: "*",
    suffix: "*",
  };
}

function findAttributeMarker(
  text: string,
  startIndex: number,
  markerType: "highlight" | "color",
  tagName: "mark" | "span",
  attributeName: "data-note-highlight" | "data-note-color",
): InlineMarkerMatch | null {
  const openPattern = `<${tagName} ${attributeName}="`;
  const start = text.indexOf(openPattern, startIndex);
  if (start === -1) return null;

  const valueStart = start + openPattern.length;
  const valueEnd = text.indexOf('">', valueStart);
  if (valueEnd === -1) return null;

  const color = text.slice(valueStart, valueEnd);
  const isValidColor =
    markerType === "highlight" ? isNoteHighlightColor(color) : isNoteTextColor(color);
  if (!isValidColor) return null;

  const prefix = text.slice(start, valueEnd + 2);
  const suffix = `</${tagName}>`;
  let end = -1;
  let depth = 1;
  let searchIndex = start + prefix.length;

  while (searchIndex < text.length) {
    const nextOpen = text.indexOf(openPattern, searchIndex);
    const nextClose = text.indexOf(suffix, searchIndex);
    if (nextClose === -1) return null;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      const nestedValueStart = nextOpen + openPattern.length;
      const nestedValueEnd = text.indexOf('">', nestedValueStart);
      if (nestedValueEnd === -1) return null;

      const nestedColor = text.slice(nestedValueStart, nestedValueEnd);
      const nestedIsValidColor =
        markerType === "highlight"
          ? isNoteHighlightColor(nestedColor)
          : isNoteTextColor(nestedColor);

      if (nestedIsValidColor) {
        depth += 1;
        searchIndex = nestedValueEnd + 2;
      } else {
        searchIndex = nextOpen + openPattern.length;
      }
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      end = nextClose;
      break;
    }
    searchIndex = nextClose + suffix.length;
  }

  if (end === -1) return null;

  return { markerType, start, end, prefix, suffix };
}

function findNextInlineFormattingMatch(text: string, startIndex: number) {
  const candidates: InlineMarkerMatch[] = [];

  const bold = findSimpleMarker(text, startIndex, "bold", "**", "**");
  if (bold) candidates.push(bold);

  const underline = findSimpleMarker(text, startIndex, "underline", "<u>", "</u>");
  if (underline) candidates.push(underline);

  const italic = findItalicMarker(text, startIndex);
  if (italic) candidates.push(italic);

  const strikethrough = findSimpleMarker(text, startIndex, "strikethrough", "~~", "~~");
  if (strikethrough) candidates.push(strikethrough);

  const highlight = findAttributeMarker(
    text,
    startIndex,
    "highlight",
    "mark",
    "data-note-highlight",
  );
  if (highlight) candidates.push(highlight);

  const color = findAttributeMarker(text, startIndex, "color", "span", "data-note-color");
  if (color) candidates.push(color);

  return (
    candidates
      .filter((candidate) => candidate.end > candidate.start)
      .sort((first, second) => first.start - second.start || second.prefix.length - first.prefix.length)[0] ??
    null
  );
}

export function getNoteContentPlainText(content: string | null | undefined): string {
  if (!content) return "";

  let result = "";
  let index = 0;

  while (index < content.length) {
    const match = findNextInlineFormattingMatch(content, index);

    if (!match) {
      result += content.slice(index);
      break;
    }

    result += content.slice(index, match.start);

    const contentStart = match.start + match.prefix.length;
    result += getNoteContentPlainText(content.slice(contentStart, match.end));
    index = match.end + match.suffix.length;
  }

  return result
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "---") return "";

      return line
        .replace(/^\s*#{1,2}\s+/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/^\s*-\s+\[[ xX]\]\s?/, "")
        .replace(/^\s*•\s?/, "")
        .replace(/^\s*\d+\.\s+/, "")
        .replace(/^\s*-\s+(?!\[[ xX]\])/, "");
    })
    .join("\n");
}

export function getFirstPlainNoteContentLine(content: string | null | undefined): string | null {
  return (
    getNoteContentPlainText(content)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? null
  );
}
