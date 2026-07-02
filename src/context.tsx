'use client';

import {
  createContext,
  type Context,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { formatReactMessage, type TProps, type TranslateNodeParams } from './react-format';

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
  onRouteMessagesLoadingChange?: (loading: boolean) => void;
  routeMessagesFallback?: ReactNode;
  routeMessagesFallbackCloseDelayMs?: number;
}

const I18N_CONTEXT_GLOBAL_KEY = '__literal_i18n_context__';

type LiteralI18nGlobal = typeof globalThis & {
  [I18N_CONTEXT_GLOBAL_KEY]?: Context<I18nContextValue>;
};

const literalI18nGlobal = globalThis as LiteralI18nGlobal;
const I18nContext =
  literalI18nGlobal[I18N_CONTEXT_GLOBAL_KEY] ??
  (literalI18nGlobal[I18N_CONTEXT_GLOBAL_KEY] = createContext<I18nContextValue>({
    translate: defaultTranslate,
  }));

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
  onRouteMessagesLoadingChange,
  routeMessagesFallback,
  routeMessagesFallbackCloseDelayMs = 0,
}: I18nProviderProps) {
  const [supplementState, setSupplementState] = useState<{
    locale?: string;
    messages: TranslationMessages;
  }>({ locale, messages: {} });
  const [pathname, setPathname] = useState<string | undefined>(() => getCurrentPathname());
  const [routeMessagesLoading, setRouteMessagesLoading] = useState(false);
  const lastLoadedPathnameRef = useRef<string | undefined>(pathname);
  const loadedPathnamesRef = useRef<Set<string>>(new Set(pathname ? [pathname] : []));
  const activeRouteLoadRef = useRef<symbol | null>(null);
  const closeFallbackTimerRef = useRef<number | undefined>(undefined);

  function clearCloseFallbackTimer() {
    if (closeFallbackTimerRef.current === undefined) return;
    window.clearTimeout(closeFallbackTimerRef.current);
    closeFallbackTimerRef.current = undefined;
  }

  function closeRouteMessagesLoading() {
    clearCloseFallbackTimer();
    const delayMs = Math.max(0, routeMessagesFallbackCloseDelayMs);
    if (delayMs === 0 || typeof window === 'undefined') {
      setRouteMessagesLoading(false);
      return;
    }

    closeFallbackTimerRef.current = window.setTimeout(() => {
      closeFallbackTimerRef.current = undefined;
      setRouteMessagesLoading(false);
    }, delayMs);
  }

  useEffect(() => {
    loadedPathnamesRef.current = new Set(pathname ? [pathname] : []);
    activeRouteLoadRef.current = null;
    closeRouteMessagesLoading();
  }, [messages]);

  useEffect(() => {
    return subscribePathnameChange(() => setPathname(getCurrentPathname()));
  }, []);

  useEffect(() => {
    return () => clearCloseFallbackTimer();
  }, []);

  useEffect(() => {
    onRouteMessagesLoadingChange?.(routeMessagesLoading);
  }, [onRouteMessagesLoadingChange, routeMessagesLoading]);

  useEffect(() => {
    if (
      routeMessagesLoader === false ||
      !pathname ||
      lastLoadedPathnameRef.current === pathname ||
      loadedPathnamesRef.current.has(pathname)
    ) {
      activeRouteLoadRef.current = null;
      closeRouteMessagesLoading();
      return;
    }

    lastLoadedPathnameRef.current = pathname;
    const loadId = Symbol(pathname);
    activeRouteLoadRef.current = loadId;
    const loader = routeMessagesLoader ?? ((nextLocale, nextPathname) => (
      loadMessagesFromEndpoint(nextLocale, nextPathname, messageEndpoint)
    ));
    let cancelled = false;

    clearCloseFallbackTimer();
    setRouteMessagesLoading(true);
    loader(locale, pathname)
      .then((payload) => {
        if (cancelled || activeRouteLoadRef.current !== loadId) return;
        const loadedMessages = normalizeLoadedMessages(payload);
        if (!loadedMessages) return;
        loadedPathnamesRef.current.add(pathname);
        setSupplementState((current) => ({
          locale,
          messages: {
            ...(current.locale === locale ? current.messages : {}),
            ...loadedMessages,
          },
        }));
      })
      .catch(() => {
        // Route message loading is a progressive enhancement. Existing messages
        // keep rendering if the endpoint is missing or the network fails.
      })
      .finally(() => {
        if (cancelled || activeRouteLoadRef.current !== loadId) return;
        activeRouteLoadRef.current = null;
        closeRouteMessagesLoading();
      });

    return () => {
      cancelled = true;
    };
  }, [locale, messageEndpoint, pathname, routeMessagesLoader]);

  const effectiveMessages = useMemo<TranslationMessages | null | undefined>(() => {
    const supplementMessages = supplementState.locale === locale ? supplementState.messages : {};
    if (!messages && Object.keys(supplementMessages).length === 0) return messages;

    return {
      ...supplementMessages,
      ...(messages ?? {}),
    };
  }, [locale, messages, supplementState]);

  const contextValue = useMemo<I18nContextValue>(() => {
    return {
      locale,
      translate: translate ?? createTranslator({ locale, messages: effectiveMessages, sourceMap, keyMode, idPrefix, idLength }),
    };
  }, [effectiveMessages, idLength, idPrefix, keyMode, locale, sourceMap, translate]);

  const renderedChildren = routeMessagesLoading && routeMessagesFallback !== undefined
    ? routeMessagesFallback
    : children;

  return <I18nContext.Provider value={contextValue}>{renderedChildren}</I18nContext.Provider>;
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

export type { TProps } from './react-format';
