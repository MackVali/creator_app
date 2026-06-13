import { describe, expect, it } from "vitest";
import {
  isIndividualNoteRoute,
  shouldHideBottomChrome,
  shouldUseFocusedEditorSpacing,
} from "../../components/appChromeVisibility";

describe("appChromeVisibility", () => {
  it("treats individual skill and monument notes as focused editor routes", () => {
    for (const pathname of [
      "/skills/skill-1/notes/note-1",
      "/skills/skill-1/notes/new",
      "/monuments/monument-1/notes/note-1",
      "/monuments/monument-1/notes/new",
    ]) {
      expect(isIndividualNoteRoute(pathname)).toBe(true);
      expect(shouldHideBottomChrome(pathname)).toBe(true);
      expect(shouldUseFocusedEditorSpacing(pathname)).toBe(true);
    }
  });

  it("does not treat note collection pages as individual note editors", () => {
    for (const pathname of ["/skills/skill-1/notes", "/monuments/monument-1/notes"]) {
      expect(isIndividualNoteRoute(pathname)).toBe(false);
      expect(shouldUseFocusedEditorSpacing(pathname)).toBe(false);
    }
  });
});
