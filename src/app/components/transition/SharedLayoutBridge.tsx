'use client';

import type { ReactNode } from 'react';
import { LayoutGroup } from 'framer-motion';

/**
 * SharedLayoutBridge wraps children with a framer-motion LayoutGroup
 * so elements that share the same `layoutId` can animate seamlessly
 * across different routes. All monument related transitions use the
 * `monuments` group id so they can morph from dashboard cards to the
 * monument detail header and back.
 */
export function SharedLayoutBridge({ children }: { children: ReactNode }) {
  return <LayoutGroup id="monuments">{children}</LayoutGroup>;
}

export default SharedLayoutBridge;

