export type MaybePromise<T> = T | Promise<T>;

export interface TranslateTextHookInput {
  text: string;
  key?: string;
  id?: string;
  locale: string;
  sourceLocale: string;
}

export interface TranslateJsonMessage {
  key: string;
  text: string;
  id?: string;
}

export interface TranslateJsonHookInput {
  locale: string;
  sourceLocale: string;
  sourceMessages?: Record<string, string>;
  existingMessages?: Record<string, unknown>;
  missingTexts: string[];
  missingMessages?: TranslateJsonMessage[];
}

export interface ExtractHookResult {
  reason: string;
  count: number;
  sourceMessages: Record<string, string>;
  sourceMeta?: Record<string, { text: string; id?: string }>;
  records: Array<{
    text: string;
    id?: string;
    kind: 'component' | 'function';
    file: string;
    line: number;
    column: number;
  }>;
}

export type TranslateTextHook = (input: TranslateTextHookInput) => MaybePromise<string | undefined>;
export type TranslateJsonHook = (
  input: TranslateJsonHookInput,
) => MaybePromise<Record<string, string> | undefined>;
export type AfterExtractHook = (result: ExtractHookResult) => MaybePromise<void>;
