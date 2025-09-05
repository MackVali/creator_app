"use client";

import { LayoutGroup } from 'framer-motion';
import React from 'react';

export default function DashboardLayout({
  children,
  overlay,
}: {
  children: React.ReactNode;
  overlay: React.ReactNode;
}) {
  return (
    <LayoutGroup id="monuments">
      {children}
      {overlay}
    </LayoutGroup>
  );
}
