import { formatMessage, type TranslateParams } from './format';
import { getMessageKey, type MessageIdOptions } from './id';

export type TranslationMessages = Record<string, unknown>;

export interface TranslateHook {
  (text: string, params?: TranslateParams, locale?: string): string;
}

export interface CreateTranslatorOptions extends MessageIdOptions {
  locale?: string;
  messages?: TranslationMessages | null;
  onMissing?: (text: string, locale?: string) => void;
}

function lookupMessage(
  messages: TranslationMessages | null | undefined,
  text: string,
  options: MessageIdOptions,
): string | undefined {
  const value = messages?.[getMessageKey(text, options)];
  return typeof value === 'string' ? value : undefined;
}

export const defaultTranslate: TranslateHook = (text, params) => formatMessage(text, params);

export function createTranslator(options: CreateTranslatorOptions = {}): TranslateHook {
  const { locale, messages, onMissing } = options;

  return (text, params, overrideLocale) => {
    const translated = lookupMessage(messages, text, options);

    if (translated === undefined) {
      onMissing?.(text, overrideLocale ?? locale);
      return formatMessage(text, params);
    }

    return formatMessage(translated, params);
  };
}

let translateHook: TranslateHook = defaultTranslate;

export function setTranslateHook(hook: TranslateHook): void {
  translateHook = hook;
}

export function resetTranslateHook(): void {
  translateHook = defaultTranslate;
}

export function tr(text: string, params?: TranslateParams, locale?: string): string {
  return translateHook(text, params, locale);
}

export type { TranslateParams, TranslateParamValue } from './format';
