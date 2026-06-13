import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { headers } from 'next/headers';
import { createTranslator, type TranslateHook, type TranslationMessages } from './translator';
import { getEnvMessageIdOptions, type MessageIdOptions } from './id';

const NEXT_INTL_LOCALE_HEADER = 'X-NEXT-INTL-LOCALE';

export interface LocaleTranslator {
  locale: string;
  messages: TranslationMessages;
  tr: TranslateHook;
}

export async function loadMessages(
  locale: string,
  localeDir = path.join(process.cwd(), 'src/messages'),
): Promise<TranslationMessages> {
  try {
    const content = await readFile(path.join(localeDir, `${locale}.json`), 'utf8');
    return JSON.parse(content) as TranslationMessages;
  } catch {
    return {};
  }
}

export async function getTranslator(
  input?: {
    locale?: string;
    messages?: TranslationMessages | null;
  } & MessageIdOptions,
): Promise<TranslateHook> {
  const locale = input?.locale ?? (await headers()).get(NEXT_INTL_LOCALE_HEADER) ?? 'en';
  const messages = input?.messages ?? await loadMessages(locale);

  return createTranslator({
    ...getEnvMessageIdOptions(),
    ...input,
    locale,
    messages,
  });
}

export async function getLocaleTranslator(
  locale: string,
  options: MessageIdOptions = {},
): Promise<LocaleTranslator> {
  const messages = await loadMessages(locale);

  return {
    locale,
    messages,
    tr: createTranslator({
      ...getEnvMessageIdOptions(),
      ...options,
      locale,
      messages,
    }),
  };
}
