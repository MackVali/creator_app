export function transitionLink(cb: () => void) {
  if (typeof document !== 'undefined' && 'startViewTransition' in document) {
    document.startViewTransition(cb);
  } else {
    cb();
  }
}
