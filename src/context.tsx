'use client';

import {
  createContext,
  Fragment,
  isValidElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';
import { PLACEHOLDER_PATTERN, stringifyParam, type TranslateParamValue } from './format';
import {
  createTranslator,
  defaultTranslate,
  type TranslateHook,
  type TranslationMessages,
} from './translator';
import type { MessageIdOptions } from './id';

interface I18nContextValue {
  locale?: string;
  translate: TranslateHook;
}

export interface UseTranslateResult {
  locale?: string;
  tr: TranslateHook;
}

export interface I18nProviderProps extends MessageIdOptions {
  children: ReactNode;
  locale?: string;
  messages?: TranslationMessages | null;
  sourceMap?: TranslationMessages | null;
  translate?: TranslateHook;
}

export type TProps = {
  text: string;
  id?: string;
  params?: TranslateNodeParams;
};

type TranslateNodeParamValue = TranslateParamValue | ReactNode;
type TranslateNodeParams = Record<string, TranslateNodeParamValue>;

const I18nContext = createContext<I18nContextValue>({
  translate: defaultTranslate,
});

export function I18nProvider({
  children,
  locale,
  messages,
  sourceMap,
  translate,
  keyMode,
  idPrefix,
  idLength,
}: I18nProviderProps) {
  const contextValue = useMemo<I18nContextValue>(() => {
    return {
      locale,
      translate: translate ?? createTranslator({ locale, messages, sourceMap, keyMode, idPrefix, idLength }),
    };
  }, [idLength, idPrefix, keyMode, locale, messages, sourceMap, translate]);

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useTranslate(): UseTranslateResult {
  const { locale, translate } = useContext(I18nContext);

  return useMemo(() => {
    return { locale, tr: translate };
  }, [locale, translate]);
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function T({
  text,
  id,
  params,
  ...inlineParams
}: TProps & Record<string, unknown>) {
  const { locale, translate } = useI18n();
  const mergedParams = {
    ...params,
    ...inlineParams,
  } as TranslateNodeParams;
  const translated = translate(text, undefined, id ? { locale, id } : locale);

  return <>{formatReactMessage(translated, mergedParams)}</>;
}

function isRenderableNode(value: unknown): value is ReactNode {
  return isValidElement(value) || Array.isArray(value);
}

function toTextNode(value: TranslateNodeParamValue): ReactNode {
  if (isRenderableNode(value)) return value;
  return stringifyParam(value as TranslateParamValue) ?? '';
}

function formatReactMessage(text: string, params?: TranslateNodeParams): ReactNode {
  if (!params) return text;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  PLACEHOLDER_PATTERN.lastIndex = 0;

  while ((match = PLACEHOLDER_PATTERN.exec(text))) {
    const [placeholder, name] = match;
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (Object.prototype.hasOwnProperty.call(params, name)) {
      nodes.push(
        <Fragment key={`${name}-${match.index}`}>
          {toTextNode(params[name])}
        </Fragment>,
      );
    } else {
      nodes.push(placeholder);
    }

    lastIndex = match.index + placeholder.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}
