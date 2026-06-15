export type TranslationKeyMode = 'source' | 'hash';

export interface MessageIdOptions {
  keyMode?: TranslationKeyMode;
  idPrefix?: string;
  idLength?: number;
}

export interface MessageKeyOptions extends MessageIdOptions {
  id?: string;
}

const DEFAULT_ID_PREFIX = 'm_';
const DEFAULT_ID_LENGTH = 16;
const MESSAGE_ID_SEPARATOR = '\u0000';

function normalizeIdLength(length?: number): number {
  if (typeof length !== 'number' || !Number.isFinite(length)) return DEFAULT_ID_LENGTH;
  return Math.min(16, Math.max(8, Math.floor(length)));
}

function hashText(text: string): string {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

function normalizeMessageContextId(id?: string): string | undefined {
  if (typeof id !== 'string') return undefined;
  const normalizedId = id.trim();
  return normalizedId || undefined;
}

function getHashInput(text: string, id?: string): string {
  const contextId = normalizeMessageContextId(id);
  return contextId ? `${text}${MESSAGE_ID_SEPARATOR}${contextId}` : text;
}

export function createMessageId(text: string, options: MessageKeyOptions = {}): string {
  const prefix = options.idPrefix ?? DEFAULT_ID_PREFIX;
  const length = normalizeIdLength(options.idLength);

  return `${prefix}${hashText(getHashInput(text, options.id)).slice(0, length)}`;
}

export function getMessageKey(text: string, options: MessageKeyOptions = {}): string {
  const contextId = normalizeMessageContextId(options.id);

  if (options.keyMode === 'hash') {
    return createMessageId(text, options);
  }

  return contextId ? `${text}_${contextId}` : text;
}

export function getEnvMessageIdOptions(): MessageIdOptions {
  return {
    keyMode: process.env.NEXT_PUBLIC_LITERAL_I18N_KEY_MODE === 'hash' ? 'hash' : 'source',
    idPrefix: process.env.NEXT_PUBLIC_LITERAL_I18N_ID_PREFIX || undefined,
    idLength: Number(
      process.env.NEXT_PUBLIC_LITERAL_I18N_ID_LENGTH ||
        DEFAULT_ID_LENGTH,
    ),
  };
}
