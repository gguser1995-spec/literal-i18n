import type { TranslateJsonHook } from './hooks';

export interface LocalTranslateJsonHookOptions {
  endpoint: string;
  batchSize?: number;
  timeoutMs?: number;
  prompt?: string;
  failOnError?: boolean;
  progress?: boolean;
}

export interface OpenAICompatibleTranslateJsonHookOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  batchSize?: number;
  timeoutMs?: number;
  temperature?: number;
  thinking?: unknown;
  prompt?: string;
  failOnError?: boolean;
  progress?: boolean;
}

export declare function createLocalTranslateJsonHook(
  options: LocalTranslateJsonHookOptions,
): TranslateJsonHook;

export declare function createOpenAICompatibleTranslateJsonHook(
  options: OpenAICompatibleTranslateJsonHookOptions,
): TranslateJsonHook;

export declare function createDeepSeekTranslateJsonHook(
  options: OpenAICompatibleTranslateJsonHookOptions,
): TranslateJsonHook;
