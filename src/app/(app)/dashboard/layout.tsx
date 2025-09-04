'use client';

import type { ReactNode } from 'react';
import { LayoutGroup } from 'framer-motion';

export default function DashboardLayout({
  children,
  overlay,
}: {
  children: ReactNode;
  overlay: ReactNode;
}) {
  return (
    <LayoutGroup id="monuments">
      {children}
      {overlay}
    </LayoutGroup>
  );
}

