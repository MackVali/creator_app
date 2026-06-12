"use client";

const FAB_KEYBOARD_OWNERS_KEY = "__CREATOR_FAB_KEYBOARD_ACTIVE_OWNERS__";
const FAB_PANEL_OWNERS_KEY = "__CREATOR_FAB_PANEL_ACTIVE_OWNERS__";

type FabOwnerSetsWindow = Window &
  Record<typeof FAB_KEYBOARD_OWNERS_KEY | typeof FAB_PANEL_OWNERS_KEY, unknown>;

type FabViewportTeardownOptions = {
  keyboardOwnerId?: string;
  panelOwnerId?: string;
  force?: boolean;
  blurActiveElement?: boolean;
};

const isTextEntryElement = (element: Element | null): element is HTMLElement => {
  if (!element) return false;
  const htmlElement = element as HTMLElement;
  if (htmlElement.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return !["button", "submit", "reset", "checkbox", "radio"].includes(
      element.type,
    );
  }
  return false;
};

const getOwnerSet = (key: typeof FAB_KEYBOARD_OWNERS_KEY | typeof FAB_PANEL_OWNERS_KEY) => {
  if (typeof window === "undefined") return null;
  const value = (window as unknown as FabOwnerSetsWindow)[key];
  return value instanceof Set ? value : null;
};

const hasActiveFabOverlay = () => {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector("[data-fab-overlay]"));
};

export function teardownFabViewportState({
  keyboardOwnerId,
  panelOwnerId,
  force = false,
  blurActiveElement = true,
}: FabViewportTeardownOptions = {}) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  if (blurActiveElement && isTextEntryElement(document.activeElement)) {
    document.activeElement.blur();
  }

  const canClearGlobalFabState = force || !hasActiveFabOverlay();
  const keyboardOwners = getOwnerSet(FAB_KEYBOARD_OWNERS_KEY);
  const panelOwners = getOwnerSet(FAB_PANEL_OWNERS_KEY);

  if (keyboardOwners) {
    if (keyboardOwnerId) {
      keyboardOwners.delete(keyboardOwnerId);
    } else if (canClearGlobalFabState) {
      keyboardOwners.clear();
    }
    document.body.classList.toggle(
      "fab-keyboard-active",
      keyboardOwners.size > 0,
    );
  } else if (canClearGlobalFabState) {
    document.body.classList.remove("fab-keyboard-active");
  }

  if (panelOwners) {
    if (panelOwnerId) {
      panelOwners.delete(panelOwnerId);
    } else if (canClearGlobalFabState) {
      panelOwners.clear();
    }
    document.body.classList.toggle("fab-panel-active", panelOwners.size > 0);
  } else if (canClearGlobalFabState) {
    document.body.classList.remove("fab-panel-active");
  }

  if (!canClearGlobalFabState) return;

  window.requestAnimationFrame(() => {
    window.scrollTo({
      top: window.scrollY,
      left: window.scrollX,
      behavior: "auto",
    });
  });
}
