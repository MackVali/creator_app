export function transitionLink(cb: () => void) {
  if (typeof document !== 'undefined' && (document as any).startViewTransition) {
    // @ts-ignore - startViewTransition is experimental
    (document as any).startViewTransition(() => cb());
  } else {
    cb();
  }
}
