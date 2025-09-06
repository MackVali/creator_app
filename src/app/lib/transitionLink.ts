import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

export function transitionLink(router: AppRouterInstance, href: string) {
  const navigate = () => router.push(href);
  if (typeof document !== 'undefined' && 'startViewTransition' in document) {
    (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(() => navigate());
  } else {
    navigate();
  }
}

