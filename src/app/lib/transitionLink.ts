import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context';

export function transitionLink(router: AppRouterInstance, href: string) {
  const navigate = () => router.push(href);
  // @ts-expect-error experimental API
  if (typeof document !== 'undefined' && document.startViewTransition) {
    // @ts-expect-error experimental API
    document.startViewTransition(() => navigate());
  } else {
    navigate();
  }
}

