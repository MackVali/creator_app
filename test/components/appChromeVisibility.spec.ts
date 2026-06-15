import { describe, expect, it } from "vitest";
import {
  isIndividualInboxThreadRoute,
  isIndividualNoteRoute,
  isPriorityEditorRoute,
  isScheduleRoute,
  shouldHideBottomChrome,
  shouldUseFocusedEditorSpacing,
} from "../../components/appChromeVisibility";

describe("appChromeVisibility", () => {
  it("keeps individual skill and monument notes in the normal app chrome flow", () => {
    for (const pathname of [
      "/skills/skill-1/notes/note-1",
      "/skills/skill-1/notes/new",
      "/monuments/monument-1/notes/note-1",
      "/monuments/monument-1/notes/new",
    ]) {
      expect(isIndividualNoteRoute(pathname)).toBe(true);
      expect(shouldHideBottomChrome(pathname)).toBe(false);
      expect(shouldUseFocusedEditorSpacing(pathname)).toBe(false);
    }
  });

  it("does not treat note collection pages as individual note editors", () => {
    for (const pathname of ["/skills/skill-1/notes", "/monuments/monument-1/notes"]) {
      expect(isIndividualNoteRoute(pathname)).toBe(false);
      expect(shouldUseFocusedEditorSpacing(pathname)).toBe(false);
    }
  });

  it("treats individual inbox threads as focused full-screen routes", () => {
    for (const pathname of ["/inbox/user-1", "/inbox/user-1/"]) {
      expect(isIndividualInboxThreadRoute(pathname)).toBe(true);
      expect(shouldHideBottomChrome(pathname)).toBe(true);
      expect(shouldUseFocusedEditorSpacing(pathname)).toBe(true);
    }
  });

  it("keeps the inbox list in the normal app chrome flow", () => {
    expect(isIndividualInboxThreadRoute("/inbox")).toBe(false);
    expect(shouldUseFocusedEditorSpacing("/inbox")).toBe(false);
  });

  it("keeps Priority Editor in the normal app chrome flow", () => {
    for (const pathname of ["/schedule/priorities", "/schedule/priorities/"]) {
      expect(isPriorityEditorRoute(pathname)).toBe(true);
      expect(isScheduleRoute(pathname)).toBe(false);
      expect(shouldHideBottomChrome(pathname)).toBe(false);
      expect(shouldUseFocusedEditorSpacing(pathname)).toBe(false);
    }
  });

  it("keeps schedule workspace routes in hidden bottom chrome", () => {
    for (const pathname of ["/schedule", "/schedule/day-types/new"]) {
      expect(isScheduleRoute(pathname)).toBe(true);
      expect(shouldHideBottomChrome(pathname)).toBe(true);
    }
  });
});
