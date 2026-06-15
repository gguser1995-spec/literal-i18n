'use client';

import type { ReactNode } from 'react';
import { LangSwitcher } from './lang-switcher';

export function LayoutShell({ children }: { children: ReactNode }) {
  return (
    <>
      <LangSwitcher />
      {children}
    </>
  );
}
