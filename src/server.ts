import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createTranslator, type TranslateHook, type TranslationMessages } from './translator';
import { getEnvMessageIdOptions, type MessageIdOptions } from './id';
import type { I18nProviderProps } from './context';

const NEXT_INTL_LOCALE_HEADER = 'X-NEXT-INTL-LOCALE';
const DEFAULT_LOCALE_DIR = 'src/messages';
const CONFIG_FILES = [
  'literal-i18n.config.mjs',
  'literal-i18n.config.js',
  'literal-i18n.config.cjs',
  'literal-i18n.config.ts',
  'literal-i18n.config.json',
];

export interface LocaleTranslator {
  locale: string;
  messages: TranslationMessages;
  tr: TranslateHook;
}

export interface ServerTranslatorOptions extends MessageIdOptions {
  localeDir?: string;
  sourceMap?: TranslationMessages | null;
}

export interface GetTranslatorInput extends ServerTranslatorOptions {
  locale?: string;
  messages?: TranslationMessages | null;
}

export interface LiteralI18nRuntimeConfig extends MessageIdOptions {
  localeDir?: string;
}

export type I18nProviderRuntimeProps = Omit<I18nProviderProps, 'children' | 'translate'>;

function normalizeConfigOptions(config: Record<string, unknown> | null | undefined): LiteralI18nRuntimeConfig {
  return {
    localeDir: typeof config?.localeDir === 'string' ? config.localeDir : undefined,
    keyMode: config?.keyMode === 'hash' ? 'hash' : 'source',
    idPrefix: typeof config?.idPrefix === 'string' ? config.idPrefix : undefined,
    idLength: typeof config?.idLength === 'number' ? config.idLength : undefined,
  };
}

function resolveConfigPath(cwd = process.cwd()): string | undefined {
  for (const fileName of CONFIG_FILES) {
    const configPath = path.join(cwd, fileName);
    if (existsSync(configPath)) return configPath;
  }

  return undefined;
}

export async function loadLiteralI18nConfig(cwd = process.cwd()): Promise<LiteralI18nRuntimeConfig> {
  const configPath = resolveConfigPath(cwd);
  if (!configPath) return {};

  try {
    if (configPath.endsWith('.json')) {
      return normalizeConfigOptions(JSON.parse(await readFile(configPath, 'utf8')));
    }

    const configModule = await import(pathToFileURL(configPath).href);
    return normalizeConfigOptions(configModule.default ?? configModule);
  } catch {
    return {};
  }
}

function mergeRuntimeOptions(
  config: LiteralI18nRuntimeConfig,
  options: ServerTranslatorOptions = {},
): ServerTranslatorOptions {
  return {
    ...getEnvMessageIdOptions(),
    ...config,
    ...options,
  };
}

function resolveLocaleDir(localeDir?: string): string {
  return path.resolve(process.cwd(), localeDir ?? DEFAULT_LOCALE_DIR);
}

export async function loadMessages(
  locale: string,
  localeDir?: string,
): Promise<TranslationMessages> {
  const config = localeDir ? {} : await loadLiteralI18nConfig();
  const resolvedLocaleDir = resolveLocaleDir(localeDir ?? config.localeDir);

  try {
    const content = await readFile(path.join(resolvedLocaleDir, `${locale}.json`), 'utf8');
    return JSON.parse(content) as TranslationMessages;
  } catch {
    return {};
  }
}

export async function loadSourceMap(
  localeDir?: string,
): Promise<TranslationMessages> {
  const config = localeDir ? {} : await loadLiteralI18nConfig();
  const resolvedLocaleDir = resolveLocaleDir(localeDir ?? config.localeDir);

  try {
    const content = await readFile(path.join(resolvedLocaleDir, 'source-map.json'), 'utf8');
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
  input?: GetTranslatorInput,
): Promise<LocaleTranslator> {
  const locale = input?.locale ?? (await getRequestLocaleFromHeaders()) ?? 'en';
  const config = await loadLiteralI18nConfig();
  const runtimeOptions = mergeRuntimeOptions(config, input);
  const localeDir = runtimeOptions.localeDir;
  const messages = input?.messages ?? await loadMessages(locale, localeDir);
  const sourceMap = input?.sourceMap ?? await loadSourceMap(localeDir);

  return {
    locale,
    messages,
    tr: createTranslator({
      ...runtimeOptions,
      locale,
      messages,
      sourceMap,
    }),
  };
}

export async function getLocaleTranslator(
  locale: string,
  options: ServerTranslatorOptions = {},
): Promise<LocaleTranslator> {
  const config = await loadLiteralI18nConfig();
  const runtimeOptions = mergeRuntimeOptions(config, options);
  const messages = await loadMessages(locale, runtimeOptions.localeDir);
  const sourceMap = runtimeOptions.sourceMap ?? await loadSourceMap(runtimeOptions.localeDir);

  return {
    locale,
    messages,
    tr: createTranslator({
      ...runtimeOptions,
      locale,
      messages,
      sourceMap,
    }),
  };
}

export async function getI18nProviderProps(
  locale: string,
  options: ServerTranslatorOptions = {},
): Promise<I18nProviderRuntimeProps> {
  const config = await loadLiteralI18nConfig();
  const runtimeOptions = mergeRuntimeOptions(config, options);
  const messages = await loadMessages(locale, runtimeOptions.localeDir);
  const sourceMap = runtimeOptions.sourceMap ?? await loadSourceMap(runtimeOptions.localeDir);

  return {
    locale,
    messages,
    sourceMap,
    keyMode: runtimeOptions.keyMode,
    idPrefix: runtimeOptions.idPrefix,
    idLength: runtimeOptions.idLength,
  };
}
