import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { I18nProvider } from 'literal-i18n';
import { getI18nProviderProps } from 'literal-i18n/server';
import { LayoutShell } from './layout-shell';
import '../globals.css';

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export const metadata: Metadata = {
  title: 'Literal I18n Demo (Next.js 16)',
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  const i18n = await getI18nProviderProps(locale);

  return (
    <html lang={locale}>
      <body>
        <I18nProvider {...i18n}>
          <LayoutShell>{children}</LayoutShell>
        </I18nProvider>
      </body>
    </html>
  );
}

export async function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'zh' }];
}
