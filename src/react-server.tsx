import * as React from 'react';
import { getTranslator } from './server';
import { type TProps } from './react-format';
import { formatServerReactMessage, type ServerTranslateNodeParams } from './react-server-format';

const getRequestTranslator = typeof React.cache === 'function'
  ? React.cache(getTranslator)
  : getTranslator;

export {
  createMessageId,
  getEnvMessageIdOptions,
  getMessageKey,
} from './id';
export type {
  MessageIdOptions,
  MessageKeyOptions,
  TranslationKeyMode,
} from './id';
export {
  createTranslator,
  defaultTranslate,
} from './translator';
export type {
  TranslateHook,
  TranslateOptions,
  TranslateParamValue,
  TranslateParams,
  TranslationMessages,
} from './translator';
export {
  DEFAULT_MESSAGE_ENDPOINT,
  loadMessages,
} from './client-loader';
export type {
  LoadMessagesHook,
  RouteMessagesPayload,
} from './client-loader';
export {
  I18nProvider,
  useI18n,
  useTranslate,
} from './context';
export type {
  I18nProviderProps,
  UseTranslateResult,
} from './context';
export type { TProps } from './react-format';
export type {
  AfterExtractHook,
  ExtractHookResult,
  MaybePromise,
  TranslateJsonMessage,
  TranslateJsonHook,
  TranslateJsonHookInput,
  TranslateTextHook,
  TranslateTextHookInput,
} from './hooks';

export async function T({
  text,
  id,
  params,
  ...inlineParams
}: TProps & Record<string, unknown>) {
  const { locale, tr } = await getRequestTranslator();
  const mergedParams = {
    ...params,
    ...inlineParams,
  } as ServerTranslateNodeParams;
  const translated = tr(text, undefined, id ? { locale, id } : locale);

  return <>{formatServerReactMessage(translated, mergedParams)}</>;
}
