import path from 'node:path';
import { readFile } from 'node:fs/promises';
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

async function getRequestLocaleFromHeaders(): Promise<string | undefined> {
  try {
    const importNextHeaders = new Function('specifier', 'return import(specifier)') as (
      specifier: string,
    ) => Promise<{ headers?: () => Promise<{ get(name: string): string | null }> | { get(name: string): string | null } }>;
    const nextHeaders = await importNextHeaders('next/headers');
    const getHeaders = nextHeaders.headers as
      | undefined
      | (() => Promise<{ get(name: string): string | null }> | { get(name: string): string | null });
    const headerStore = await getHeaders?.();
    return headerStore?.get(NEXT_INTL_LOCALE_HEADER) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function getTranslator(
  input?: {
    locale?: string;
    messages?: TranslationMessages | null;
  } & MessageIdOptions,
): Promise<LocaleTranslator> {
  const locale = input?.locale ?? (await getRequestLocaleFromHeaders()) ?? 'en';
  const messages = input?.messages ?? await loadMessages(locale);

  return {
    locale,
    messages,
    tr: createTranslator({
      ...getEnvMessageIdOptions(),
      ...input,
      locale,
      messages,
    }),
  };
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
