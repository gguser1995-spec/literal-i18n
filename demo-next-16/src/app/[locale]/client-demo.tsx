'use client';

import { T, useTranslate } from 'literal-i18n';
import { useState } from 'react';

export function ClientDemo() {
  const { locale, tr } = useTranslate();
  const [count, setCount] = useState(0);

  return (
    <div>
      <p><T text="Hello {name}" name="Visitor" /></p>
      <p>{tr('Items count: {count}', { count: String(count) })}</p>

      <button onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>

      <p style={{ marginTop: '1rem', color: '#666' }}>
        {tr('Language')}: {locale === 'zh' ? '中文' : 'English'}
      </p>
    </div>
  );
}
