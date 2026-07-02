'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { T, useTranslate } from 'literal-i18n';
import { LangSwitcher } from './lang-switcher';

export function LayoutShell({ children }: { children: ReactNode }) {
  const { locale } = useTranslate();

  return (
    <>
      <nav style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: '1rem 1rem 0' }}>
        <Link href={`/${locale}`}><T text="Home" /></Link>
        <Link href={`/${locale}/create`}><T text="Create" /></Link>
      </nav>
      <LangSwitcher />
      {children}
    </>
  );
}
