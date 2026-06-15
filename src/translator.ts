import { formatMessage, type TranslateParams } from './format';
import { getMessageKey, type MessageIdOptions } from './id';

export type TranslationMessages = Record<string, unknown>;

export interface TranslateOptions {
  locale?: string;
  id?: string;
}

export interface TranslateHook {
  (text: string, params?: TranslateParams, options?: string | TranslateOptions): string;
}

export interface CreateTranslatorOptions extends MessageIdOptions {
  locale?: string;
  messages?: TranslationMessages | null;
  onMissing?: (text: string, locale?: string, id?: string) => void;
}

function normalizeTranslateOptions(options?: string | TranslateOptions): TranslateOptions {
  if (typeof options === 'string') return { locale: options };
  return options ?? {};
}

function lookupMessage(
  messages: TranslationMessages | null | undefined,
  text: string,
  options: MessageIdOptions & { id?: string },
): string | undefined {
  const value = messages?.[getMessageKey(text, options)];
  return typeof value === 'string' ? value : undefined;
}

export const defaultTranslate: TranslateHook = (text, params) => formatMessage(text, params);

export function createTranslator(options: CreateTranslatorOptions = {}): TranslateHook {
  const { locale, messages, onMissing } = options;

  return (text, params, callOptions) => {
    const { locale: overrideLocale, id } = normalizeTranslateOptions(callOptions);
    const translated = lookupMessage(messages, text, { ...options, id });

    if (translated === undefined) {
      onMissing?.(text, overrideLocale ?? locale, id);
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

export function tr(text: string, params?: TranslateParams, options?: string | TranslateOptions): string {
  return translateHook(text, params, options);
}

export type { TranslateParams, TranslateParamValue } from './format';
