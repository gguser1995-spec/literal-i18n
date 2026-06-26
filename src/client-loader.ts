import type { TranslationMessages } from './translator';

export const DEFAULT_MESSAGE_ENDPOINT = '/api/literal-i18n/messages';

export interface RouteMessagesPayload {
  locale?: string;
  messages?: TranslationMessages | null;
}

export interface LoadMessagesHook {
  (locale: string | undefined, pathname: string): Promise<TranslationMessages | RouteMessagesPayload | null | undefined>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeEndpoint(endpoint: string | undefined): string {
  return endpoint || DEFAULT_MESSAGE_ENDPOINT;
}

export function normalizeLoadedMessages(
  payload: TranslationMessages | RouteMessagesPayload | null | undefined,
): TranslationMessages | null {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.messages)) return payload.messages;
  return payload;
}

export async function loadMessages(
  locale: string | undefined,
  pathname: string,
): Promise<RouteMessagesPayload | null> {
  return loadMessagesFromEndpoint(locale, pathname, DEFAULT_MESSAGE_ENDPOINT);
}

export async function loadMessagesFromEndpoint(
  locale: string | undefined,
  pathname: string,
  endpoint: string | undefined,
): Promise<RouteMessagesPayload | null> {
  if (typeof fetch === 'undefined') return null;

  const baseUrl = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const url = new URL(normalizeEndpoint(endpoint), baseUrl);
  if (locale) url.searchParams.set('locale', locale);
  url.searchParams.set('pathname', pathname);

  const response = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
    },
  });
  if (!response.ok) return null;

  const payload = await response.json();
  return isRecord(payload) ? payload as RouteMessagesPayload : null;
}
