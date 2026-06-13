import type { AfterExtractHook, TranslateJsonHook, TranslateTextHook } from './hooks';
import type { MessageIdOptions } from './id';

export interface ExtractRecord {
  text: string;
  kind: 'component' | 'function';
  file: string;
  line: number;
  column: number;
}

export interface ExtractWarning {
  message: string;
  file: string;
  line: number;
  column: number;
}

export interface LiteralI18nExtractorOptions extends MessageIdOptions {
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

export interface ExtractResult {
  reason: string;
  changedFiles: string[];
  warnings: ExtractWarning[];
  sourceMessages: Record<string, string>;
  sourceMap: Record<string, string>;
  records: ExtractRecord[];
  sourceChanged: boolean;
  sourceMapChanged: boolean;
  localeResults: Array<{
    locale: string;
    outputPath: string;
    missingCount: number;
    translatedCount: number;
    changed: boolean;
  }>;
  count: number;
}

export declare class LiteralI18nExtractor {
  constructor(options?: LiteralI18nExtractorOptions);
  getWatchDirs(): string[];
  filterSourceFiles(files: string[]): string[];
  fullScan(reason?: string): Promise<ExtractResult>;
  scanChanged(input?: {
    reason?: string;
    modifiedFiles?: string[];
    removedFiles?: string[];
  }): Promise<ExtractResult>;
}

export declare const SourceI18nExtractor: typeof LiteralI18nExtractor;

export declare function createMessageId(text: string, options?: MessageIdOptions): string;
export declare function getMessageKey(text: string, options?: MessageIdOptions): string;
export declare function extractFromSource(
  filePath: string,
  sourceText: string,
  options?: LiteralI18nExtractorOptions,
): { records: ExtractRecord[]; warnings: ExtractWarning[] };
