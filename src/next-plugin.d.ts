import type { NextConfig } from 'next';
import type { AfterExtractHook, TranslateJsonHook, TranslateTextHook } from './hooks';
import type { MessageIdOptions } from './id';

export interface LiteralI18nPluginOptions extends MessageIdOptions {
  cwd?: string;
  sourceDir?: string | string[];
  sourceDirs?: string | string[];
  sourceOutput?: string;
  sourceMapOutput?: string;
  localeDir?: string;
  importSource?: string | string[];
  importSources?: string | string[];
  serverImportSource?: string | string[];
  serverImportSources?: string | string[];
  locales?: string[];
  sourceLocale?: string;
  cacheFile?: string;
  keepStale?: boolean;
  pruneLegacySourceKeys?: boolean;
  treatSourceAsMissing?: boolean;
  progress?: boolean;
  silent?: boolean;
  translateHook?: TranslateTextHook;
  translateJsonHook?: TranslateJsonHook;
  localeOutput?: (locale: string) => string;
  onExtract?: AfterExtractHook;
}

export declare class LiteralI18nNextPlugin {
  constructor(options?: LiteralI18nPluginOptions);
  apply(compiler: unknown): void;
}

export declare function withLiteralI18n(
  nextConfig?: NextConfig,
  options?: LiteralI18nPluginOptions,
): NextConfig;

export declare function defineLiteralI18nConfig(
  options?: LiteralI18nPluginOptions,
): LiteralI18nPluginOptions;

export declare const withSourceI18n: typeof withLiteralI18n;
export declare const SourceI18nNextPlugin: typeof LiteralI18nNextPlugin;

export default withLiteralI18n;
