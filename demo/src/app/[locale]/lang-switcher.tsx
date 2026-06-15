'use client';

import { useTranslate } from 'literal-i18n';
import { usePathname, useRouter } from 'next/navigation';

const locales = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
];

export function LangSwitcher() {
  const { locale } = useTranslate();
  const router = useRouter();
  const pathname = usePathname();

  const switchTo = locales.find((l) => l.code !== locale)?.code ?? 'en';

  return (
    <div style={{ textAlign: 'center', padding: '1rem' }}>
      {locales.map((l) => (
        <button
          key={l.code}
          onClick={() => router.push(pathname.replace(`/${locale}`, `/${l.code}`))}
          style={{
            marginLeft: 8,
            fontWeight: locale === l.code ? 'bold' : 'normal',
            cursor: 'pointer',
            border: 'none',
            background: locale === l.code ? '#0070f3' : '#eee',
            color: locale === l.code ? '#fff' : '#333',
            padding: '4px 12px',
            borderRadius: 4,
            fontSize: 14,
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
