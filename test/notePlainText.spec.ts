import { describe, expect, it } from "vitest";

import { getFirstPlainNoteContentLine, getNoteContentPlainText } from "@/lib/notes/plainText";

describe("getNoteContentPlainText", () => {
  it.each([
    ["plain text", "Hello world", "Hello world"],
    ["bold", "**Hello world**", "Hello world"],
    ["italic", "*Hello world*", "Hello world"],
    ["underline", "<u>Hello world</u>", "Hello world"],
    ["strikethrough", "~~Hello world~~", "Hello world"],
    ["preset text color", '<span data-note-color="red">Hello world</span>', "Hello world"],
    ["custom hex text color", '<span data-note-color="#ff0000">Hello world</span>', "Hello world"],
    ["preset highlight", '<mark data-note-highlight="yellow">Hello world</mark>', "Hello world"],
    ["custom hex highlight", '<mark data-note-highlight="#ffee00">Hello world</mark>', "Hello world"],
    [
      "nested formatting",
      '<mark data-note-highlight="#ffee00">Hello **<u>bright</u>** *world*</mark>',
      "Hello bright world",
    ],
    ["no formatting", "A regular note with no formatting.", "A regular note with no formatting."],
    ["unmatched asterisk", "Use * as a wildcard", "Use * as a wildcard"],
    ["unmatched angle bracket", "Check x < y before saving", "Check x < y before saving"],
    [
      "invalid note color marker",
      '<span data-note-color="chartreuse">Keep tags</span>',
      '<span data-note-color="chartreuse">Keep tags</span>',
    ],
    ["heading 1", "# Grocery ideas", "Grocery ideas"],
    ["heading 2", "## Training", "Training"],
    ["quote", "> Important thought", "Important thought"],
    ["unchecked checklist", "- [ ] Buy food", "Buy food"],
    ["checked checklist", "- [x] Pay rent", "Pay rent"],
    ["bullet list", "• Research", "Research"],
    ["ordered list", "1. First step", "First step"],
    ["dash list", "- Simple row", "Simple row"],
    ["divider", "---", ""],
    ["formatted heading text", "# **Important** thought", "Important thought"],
  ])("returns readable text for %s", (_label, content, expected) => {
    expect(getNoteContentPlainText(content)).toBe(expected);
  });

  it("does not mutate the original content value", () => {
    const content = "**Hello world**";

    getNoteContentPlainText(content);

    expect(content).toBe("**Hello world**");
  });
});

describe("getFirstPlainNoteContentLine", () => {
  it("uses the first meaningful non-empty line after formatting is removed", () => {
    expect(getFirstPlainNoteContentLine("\n  \n**Hello world**\nSecond line")).toBe("Hello world");
  });

  it("skips lines that become empty after formatting is removed", () => {
    expect(getFirstPlainNoteContentLine("**   **\n<u>Readable</u>")).toBe("Readable");
  });

  it("returns null when no readable line exists", () => {
    expect(getFirstPlainNoteContentLine(" \n\t")).toBeNull();
  });
});
