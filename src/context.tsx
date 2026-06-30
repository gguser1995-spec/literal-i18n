'use client';

import {
  createContext,
  Fragment,
  isValidElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PLACEHOLDER_PATTERN, stringifyParam, type TranslateParamValue } from './format';
import {
  createTranslator,
  defaultTranslate,
  type TranslateHook,
  type TranslationMessages,
} from './translator';
import type { MessageIdOptions } from './id';
import {
  loadMessagesFromEndpoint,
  normalizeLoadedMessages,
  type LoadMessagesHook,
} from './client-loader';

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
  loadMessages?: LoadMessagesHook | false;
  messageEndpoint?: string;
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

const LOCATION_CHANGE_EVENT = 'literal-i18n:location-change';
let historyPatched = false;
let locationChangeTimer: number | undefined;

function getCurrentPathname(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location.pathname || '/';
}

function dispatchLocationChange(): void {
  window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
}

function scheduleLocationChange(): void {
  if (locationChangeTimer !== undefined) {
    window.clearTimeout(locationChangeTimer);
  }

  locationChangeTimer = window.setTimeout(() => {
    locationChangeTimer = undefined;
    dispatchLocationChange();
  }, 0);
}

function patchHistoryOnce(): void {
  if (historyPatched || typeof window === 'undefined') return;
  historyPatched = true;

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method];
    window.history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      scheduleLocationChange();
      return result;
    };
  }
}

function subscribePathnameChange(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  patchHistoryOnce();
  window.addEventListener(LOCATION_CHANGE_EVENT, callback);
  window.addEventListener('popstate', callback);
  window.addEventListener('hashchange', callback);

  return () => {
    window.removeEventListener(LOCATION_CHANGE_EVENT, callback);
    window.removeEventListener('popstate', callback);
    window.removeEventListener('hashchange', callback);
  };
}

export function I18nProvider({
  children,
  locale,
  messages,
  sourceMap,
  translate,
  keyMode,
  idPrefix,
  idLength,
  loadMessages: routeMessagesLoader,
  messageEndpoint,
}: I18nProviderProps) {
  const [runtimeMessages, setRuntimeMessages] = useState<TranslationMessages | null | undefined>(messages);
  const [pathname, setPathname] = useState<string | undefined>(() => getCurrentPathname());
  const lastLoadedPathnameRef = useRef<string | undefined>(pathname);

  useEffect(() => {
    setRuntimeMessages(messages);
  }, [messages]);

  useEffect(() => {
    return subscribePathnameChange(() => setPathname(getCurrentPathname()));
  }, []);

  useEffect(() => {
    if (routeMessagesLoader === false || !pathname) return;
    if (lastLoadedPathnameRef.current === pathname) return;

    lastLoadedPathnameRef.current = pathname;
    const loader = routeMessagesLoader ?? ((nextLocale, nextPathname) => (
      loadMessagesFromEndpoint(nextLocale, nextPathname, messageEndpoint)
    ));
    let cancelled = false;

    loader(locale, pathname)
      .then((payload) => {
        if (cancelled) return;
        const loadedMessages = normalizeLoadedMessages(payload);
        if (!loadedMessages) return;
        setRuntimeMessages((currentMessages) => ({
          ...(currentMessages ?? {}),
          ...loadedMessages,
        }));
      })
      .catch(() => {
        // Route message loading is a progressive enhancement. Existing messages
        // keep rendering if the endpoint is missing or the network fails.
      });

    return () => {
      cancelled = true;
    };
  }, [locale, messageEndpoint, pathname, routeMessagesLoader]);

  const contextValue = useMemo<I18nContextValue>(() => {
    return {
      locale,
      translate: translate ?? createTranslator({ locale, messages: runtimeMessages, sourceMap, keyMode, idPrefix, idLength }),
    };
  }, [idLength, idPrefix, keyMode, locale, runtimeMessages, sourceMap, translate]);

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
