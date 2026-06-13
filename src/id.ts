export type TranslationKeyMode = 'source' | 'hash';

export interface MessageIdOptions {
  keyMode?: TranslationKeyMode;
  idPrefix?: string;
  idLength?: number;
}

const DEFAULT_ID_PREFIX = 'm_';
const DEFAULT_ID_LENGTH = 16;

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

export function createMessageId(text: string, options: MessageIdOptions = {}): string {
  const prefix = options.idPrefix ?? DEFAULT_ID_PREFIX;
  const length = normalizeIdLength(options.idLength);

  return `${prefix}${hashText(text).slice(0, length)}`;
}

export function getMessageKey(text: string, options: MessageIdOptions = {}): string {
  return options.keyMode === 'hash' ? createMessageId(text, options) : text;
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
