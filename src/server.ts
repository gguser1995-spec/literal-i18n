import path from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createTranslator, type TranslateHook, type TranslationMessages } from './translator';
import type { MessageIdOptions } from './id';
import type { I18nProviderProps } from './context';

const NEXT_INTL_LOCALE_HEADER = 'X-NEXT-INTL-LOCALE';
const LITERAL_I18N_PATHNAME_HEADER = 'x-literal-i18n-pathname';
const DEFAULT_LOCALE_DIR = 'src/messages';
const DEFAULT_MANIFEST_FILE = 'manifest.json';
const CONFIG_FILES = [
  'literal-i18n.config.mjs',
  'literal-i18n.config.js',
  'literal-i18n.config.cjs',
  'literal-i18n.config.ts',
  'literal-i18n.config.json',
];

export interface LocaleTranslator {
  locale: string;
  messages: TranslationMessages;
  tr: TranslateHook;
}

export interface ServerTranslatorOptions extends MessageIdOptions {
  localeDir?: string;
  sourceMap?: TranslationMessages | null;
}

export interface I18nProviderRuntimeOptions extends ServerTranslatorOptions {
  includeSourceMap?: boolean;
  optimizePayload?: boolean;
  payloadScope?: 'navigation' | 'route';
  pathname?: string | null;
}

export interface GetTranslatorInput extends ServerTranslatorOptions {
  locale?: string;
  messages?: TranslationMessages | null;
}

export interface LiteralI18nRuntimeConfig extends MessageIdOptions {
  localeDir?: string;
}

export type I18nProviderRuntimeProps = Omit<I18nProviderProps, 'children' | 'translate'>;

export interface LiteralI18nManifestRoute {
  pattern: string;
  kind: string;
}

export interface LiteralI18nManifestFile {
  keys: string[];
  route?: LiteralI18nManifestRoute;
}

export interface LiteralI18nManifest {
  version?: number;
  files?: Record<string, string[] | LiteralI18nManifestFile>;
  routes?: Record<string, string[]>;
}

interface JsonCacheEntry<T> {
  signature: string;
  value: T;
}

const messageStores = new Map<string, MessageStore>();
const require = createRequire(import.meta.url);

function normalizeConfigOptions(config: Record<string, unknown> | null | undefined): LiteralI18nRuntimeConfig {
  const normalized: LiteralI18nRuntimeConfig = {};

  if (typeof config?.localeDir === 'string') normalized.localeDir = config.localeDir;
  if (config?.keyMode === 'hash' || config?.keyMode === 'source') normalized.keyMode = config.keyMode;
  if (typeof config?.idPrefix === 'string') normalized.idPrefix = config.idPrefix;
  if (typeof config?.idLength === 'number' && Number.isFinite(config.idLength)) {
    normalized.idLength = config.idLength;
  }

  return normalized;
}

function getRuntimeEnvMessageIdOptions(): MessageIdOptions {
  const options: MessageIdOptions = {};
  const keyMode = process.env.NEXT_PUBLIC_LITERAL_I18N_KEY_MODE;
  const idLength = Number(process.env.NEXT_PUBLIC_LITERAL_I18N_ID_LENGTH);

  if (keyMode === 'hash' || keyMode === 'source') options.keyMode = keyMode;
  if (process.env.NEXT_PUBLIC_LITERAL_I18N_ID_PREFIX) {
    options.idPrefix = process.env.NEXT_PUBLIC_LITERAL_I18N_ID_PREFIX;
  }
  if (Number.isFinite(idLength)) options.idLength = idLength;

  return options;
}

function resolveConfigPath(cwd = process.cwd()): string | undefined {
  for (const fileName of CONFIG_FILES) {
    const configPath = path.join(cwd, fileName);
    if (existsSync(configPath)) return configPath;
  }

  return undefined;
}

export async function loadLiteralI18nConfig(cwd = process.cwd()): Promise<LiteralI18nRuntimeConfig> {
  const configPath = resolveConfigPath(cwd);
  if (!configPath) return {};

  try {
    if (configPath.endsWith('.json')) {
      return normalizeConfigOptions(JSON.parse(readFileSync(configPath, 'utf8')));
    }

    const configModule = configPath.endsWith('.ts')
      ? loadTypeScriptConfig(configPath)
      : await import(pathToFileURL(configPath).href);
    return normalizeConfigOptions(configModule.default ?? configModule);
  } catch {
    // import() 在 webpack 打包环境下会被拦截。
    // 回退到从源文件中 regex 提取运行时配置（只有简单字段，不含 hook）。
    return extractConfigFromSource(cwd);
  }
}

function loadTypeScriptConfig(configPath: string): Record<string, unknown> {
  const ts = require('typescript') as typeof import('typescript');
  const Module = require('node:module').Module;
  const source = readFileSync(configPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: configPath,
  }).outputText;
  const configModule = new Module(configPath);
  configModule.filename = configPath;
  configModule.paths = [
    ...Module._nodeModulePaths(path.dirname(configPath)),
    ...Module._nodeModulePaths(process.cwd()),
  ];
  const moduleRequire = configModule.require.bind(configModule);
  configModule.require = (specifier: string) => {
    if (specifier.startsWith('literal-i18n/')) {
      return require(specifier);
    }

    return moduleRequire(specifier);
  };
  configModule._compile(transpiled, configPath);
  return configModule.exports as Record<string, unknown>;
}

/** 当动态 import 不可用时（webpack 环境），用正则从源文件提取简单配置字段。 */
function extractConfigFromSource(cwd: string): LiteralI18nRuntimeConfig {
  const configPath = resolveConfigPath(cwd);
  if (!configPath) return {};

  try {
    const src = readFileSync(configPath, 'utf8');
    const config: Record<string, unknown> = {};

    const localeDir = src.match(/localeDir\s*[=:]\s*['"]([^'"]+)['"]/);
    if (localeDir) config.localeDir = localeDir[1];

    const keyMode = src.match(/keyMode\s*[=:]\s*['"]([^'"]+)['"]/);
    if (keyMode && keyMode[1] === 'hash') config.keyMode = 'hash';

    const idPrefix = src.match(/idPrefix\s*[=:]\s*['"]([^'"]+)['"]/);
    if (idPrefix) config.idPrefix = idPrefix[1];

    const idLength = src.match(/idLength\s*[=:]\s*(\d+)/);
    if (idLength) config.idLength = Number(idLength[1]);

    return normalizeConfigOptions(config);
  } catch {
    return {};
  }
}

function mergeRuntimeOptions<T extends ServerTranslatorOptions>(
  config: LiteralI18nRuntimeConfig,
  options: T = {} as T,
): T & ServerTranslatorOptions {
  return {
    ...config,
    ...getRuntimeEnvMessageIdOptions(),
    ...options,
  };
}

function resolveLocaleDir(localeDir?: string): string {
  return path.resolve(process.cwd(), localeDir ?? DEFAULT_LOCALE_DIR);
}

function normalizePathname(pathname: string | null | undefined): string | undefined {
  if (typeof pathname !== 'string') return undefined;
  const [withoutQuery] = pathname.split(/[?#]/);
  const normalized = withoutQuery.trim();
  if (!normalized) return undefined;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function splitRouteSegments(routePath: string): string[] {
  return normalizePathname(routePath)?.split('/').filter(Boolean) ?? [];
}

function isDynamicSegment(segment: string): boolean {
  return /^\[\[?\.{3}.+\]?\]$/.test(segment) || /^\[[^/]+\]$/.test(segment);
}

function segmentMatches(patternSegment: string, pathnameSegment: string): boolean {
  if (patternSegment === pathnameSegment) return true;
  if (isDynamicSegment(patternSegment)) return true;
  return false;
}

function routePatternMatches(pattern: string, pathname: string): boolean {
  const patternSegments = splitRouteSegments(pattern);
  const pathnameSegments = splitRouteSegments(pathname);

  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const isCatchAll = /^\[\.{3}.+\]$/.test(patternSegment);
    const isOptionalCatchAll = /^\[\[\.{3}.+\]\]$/.test(patternSegment);
    if (isCatchAll) return pathnameSegments.length > index;
    if (isOptionalCatchAll) return true;
    if (!pathnameSegments[index] || !segmentMatches(patternSegment, pathnameSegments[index])) {
      return false;
    }
  }

  return patternSegments.length === pathnameSegments.length;
}

function routePatternPrefixesPathname(pattern: string, pathname: string): boolean {
  const patternSegments = splitRouteSegments(pattern);
  const pathnameSegments = splitRouteSegments(pathname);
  if (patternSegments.length > pathnameSegments.length) return false;

  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    if (/^\[\[?\.{3}.+\]?\]$/.test(patternSegment)) return true;
    if (!segmentMatches(patternSegment, pathnameSegments[index])) return false;
  }

  return true;
}

function normalizeManifestFileEntry(entry: string[] | LiteralI18nManifestFile): LiteralI18nManifestFile {
  if (Array.isArray(entry)) return { keys: entry };
  return {
    keys: Array.isArray(entry.keys) ? entry.keys : [],
    route: entry.route,
  };
}

function inferHashOptionsFromKey(key: string): MessageIdOptions | undefined {
  const match = key.match(/^(.+?)([a-f0-9]{8,16})$/);
  if (!match) return undefined;

  return {
    keyMode: 'hash',
    idPrefix: match[1],
    idLength: match[2].length,
  };
}

function inferMessageIdOptions(input: {
  messages?: TranslationMessages | null;
  sourceMap?: TranslationMessages | null;
}): MessageIdOptions {
  for (const value of Object.values(input.sourceMap ?? {})) {
    if (typeof value !== 'string') continue;
    const inferred = inferHashOptionsFromKey(value);
    if (inferred) return inferred;
  }

  const topLevelKeys = Object.keys(input.messages ?? {});
  const inferredKeys = topLevelKeys
    .map((key) => inferHashOptionsFromKey(key))
    .filter((options): options is MessageIdOptions => Boolean(options));

  if (inferredKeys.length > 0 && inferredKeys.length >= Math.ceil(topLevelKeys.length / 2)) {
    return inferredKeys[0];
  }

  return {};
}

type PayloadScope = NonNullable<I18nProviderRuntimeOptions['payloadScope']>;

function routeSharesNavigationScope(pattern: string, pathname: string, locale?: string): boolean {
  const patternSegments = splitRouteSegments(pattern);
  const pathnameSegments = splitRouteSegments(pathname);
  const pathnameRoot = pathnameSegments[0];
  const patternRoot = patternSegments[0];

  if (!patternRoot) return true;
  if (!pathnameRoot) return routePatternMatches(pattern, pathname) || routePatternPrefixesPathname(pattern, pathname);

  if (locale && pathnameRoot === locale) {
    return patternRoot === locale || isDynamicSegment(patternRoot);
  }

  if (segmentMatches(patternRoot, pathnameRoot)) return true;

  // Non-locale apps usually mount the provider in the root layout. In that shape
  // the safe client-navigation scope is the full manifest rather than one page.
  return !locale || pathnameRoot !== locale;
}

function selectManifestKeys(
  manifest: LiteralI18nManifest,
  pathname: string,
  payloadScope: PayloadScope = 'navigation',
  locale?: string,
): Set<string> {
  const keys = new Set<string>();
  const routeEntries = Object.entries(manifest.routes ?? {});
  let hasRouteMatch = false;

  for (const [pattern, routeKeys] of routeEntries) {
    if (routePatternMatches(pattern, pathname)) {
      hasRouteMatch = true;
    }
  }

  for (const entry of Object.values(manifest.files ?? {})) {
    const file = normalizeManifestFileEntry(entry);
    const route = file.route;
    if (route && route.kind !== 'layout' && routePatternMatches(route.pattern, pathname)) {
      hasRouteMatch = true;
    }
  }

  if (!hasRouteMatch) return keys;

  for (const [pattern, routeKeys] of routeEntries) {
    const shouldInclude = payloadScope === 'navigation'
      ? routeSharesNavigationScope(pattern, pathname, locale)
      : routePatternMatches(pattern, pathname);
    if (Array.isArray(routeKeys) && shouldInclude) {
      for (const key of routeKeys) keys.add(key);
    }
  }

  for (const entry of Object.values(manifest.files ?? {})) {
    const file = normalizeManifestFileEntry(entry);
    const route = file.route;
    if (!route) continue;

    const shouldInclude = payloadScope === 'navigation'
      ? routeSharesNavigationScope(route.pattern, pathname, locale)
      : route.kind === 'layout'
        ? routePatternPrefixesPathname(route.pattern, pathname)
        : routePatternMatches(route.pattern, pathname);

    if (shouldInclude) {
      for (const key of file.keys) keys.add(key);
    }
  }

  return keys;
}

function pickMessages(messages: TranslationMessages, keys: Set<string>): TranslationMessages {
  const picked: TranslationMessages = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(messages, key)) {
      picked[key] = messages[key];
    }
  }
  return picked;
}

async function getHeaderValue(name: string): Promise<string | undefined> {
  try {
    const nextHeaders = await import('next/headers') as {
      headers?: () => Promise<{ get(name: string): string | null }> | { get(name: string): string | null };
    };
    const getHeaders = nextHeaders.headers as
      | undefined
      | (() => Promise<{ get(name: string): string | null }> | { get(name: string): string | null });
    const headerStore = await getHeaders?.();
    return headerStore?.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

export class MessageStore {
  readonly localeDir: string;
  private readonly jsonCache = new Map<string, JsonCacheEntry<TranslationMessages | LiteralI18nManifest>>();

  constructor(localeDir?: string) {
    this.localeDir = resolveLocaleDir(localeDir);
  }

  private readJson<T extends TranslationMessages | LiteralI18nManifest>(
    filePath: string,
    fallback: T,
  ): T {
    try {
      const fileStat = statSync(filePath);
      const signature = `${fileStat.mtimeMs}:${fileStat.size}`;
      const cached = this.jsonCache.get(filePath);
      if (cached?.signature === signature) return cached.value as T;

      const content = readFileSync(filePath, 'utf8');
      const value = JSON.parse(content) as T;
      this.jsonCache.set(filePath, { signature, value });
      return value;
    } catch {
      return fallback;
    }
  }

  loadMessages(locale: string): Promise<TranslationMessages> {
    return Promise.resolve(this.readJson(path.join(this.localeDir, `${locale}.json`), {}));
  }

  loadSourceMap(): Promise<TranslationMessages> {
    return Promise.resolve(this.readJson(path.join(this.localeDir, 'source-map.json'), {}));
  }

  loadManifest(): Promise<LiteralI18nManifest> {
    return Promise.resolve(this.readJson(path.join(this.localeDir, DEFAULT_MANIFEST_FILE), {}));
  }

  async loadMessagesForPathname(
    locale: string,
    pathname?: string | null,
    payloadScope: PayloadScope = 'navigation',
  ): Promise<TranslationMessages> {
    const messages = await this.loadMessages(locale);
    const normalizedPathname = normalizePathname(pathname);
    if (!normalizedPathname) return messages;

    const manifest = await this.loadManifest();
    const keys = selectManifestKeys(manifest, normalizedPathname, payloadScope, locale);
    if (keys.size === 0) return messages;

    const picked = pickMessages(messages, keys);
    return Object.keys(picked).length > 0 ? picked : messages;
  }
}

export function getMessageStore(localeDir?: string): MessageStore {
  const resolvedLocaleDir = resolveLocaleDir(localeDir);
  const existing = messageStores.get(resolvedLocaleDir);
  if (existing) return existing;

  const store = new MessageStore(localeDir);
  messageStores.set(resolvedLocaleDir, store);
  return store;
}

export async function loadMessages(
  locale: string,
  localeDir?: string,
): Promise<TranslationMessages> {
  const config = localeDir ? {} : await loadLiteralI18nConfig();
  return getMessageStore(localeDir ?? config.localeDir).loadMessages(locale);
}

export async function loadSourceMap(
  localeDir?: string,
): Promise<TranslationMessages> {
  const config = localeDir ? {} : await loadLiteralI18nConfig();
  return getMessageStore(localeDir ?? config.localeDir).loadSourceMap();
}

export async function loadLiteralI18nManifest(
  localeDir?: string,
): Promise<LiteralI18nManifest> {
  const config = localeDir ? {} : await loadLiteralI18nConfig();
  return getMessageStore(localeDir ?? config.localeDir).loadManifest();
}

async function getRequestLocaleFromHeaders(): Promise<string | undefined> {
  return getHeaderValue(NEXT_INTL_LOCALE_HEADER);
}

async function getRequestPathnameFromHeaders(): Promise<string | undefined> {
  return normalizePathname(await getHeaderValue(LITERAL_I18N_PATHNAME_HEADER));
}

export async function getTranslator(
  input?: GetTranslatorInput,
): Promise<LocaleTranslator> {
  const locale = input?.locale ?? (await getRequestLocaleFromHeaders()) ?? 'en';
  const config = await loadLiteralI18nConfig();
  const runtimeOptions = mergeRuntimeOptions(config, input);
  const localeDir = runtimeOptions.localeDir;
  const messages = input?.messages ?? await loadMessages(locale, localeDir);
  const sourceMap = input?.sourceMap ?? await loadSourceMap(localeDir);

  return {
    locale,
    messages,
    tr: createTranslator({
      ...runtimeOptions,
      locale,
      messages,
      sourceMap,
    }),
  };
}

export async function getLocaleTranslator(
  locale: string,
  options: ServerTranslatorOptions = {},
): Promise<LocaleTranslator> {
  const config = await loadLiteralI18nConfig();
  const runtimeOptions = mergeRuntimeOptions(config, options);
  const messages = await loadMessages(locale, runtimeOptions.localeDir);
  const sourceMap = runtimeOptions.sourceMap ?? await loadSourceMap(runtimeOptions.localeDir);

  return {
    locale,
    messages,
    tr: createTranslator({
      ...runtimeOptions,
      locale,
      messages,
      sourceMap,
    }),
  };
}

export async function getI18nProviderProps(
  locale: string,
  options: I18nProviderRuntimeOptions = {},
): Promise<I18nProviderRuntimeProps> {
  const config = await loadLiteralI18nConfig();
  const runtimeOptions = mergeRuntimeOptions(config, options);
  const store = getMessageStore(runtimeOptions.localeDir);
  const pathname = options.pathname ?? await getRequestPathnameFromHeaders();
  const payloadScope = runtimeOptions.payloadScope ?? 'navigation';
  const messages = runtimeOptions.optimizePayload === false
    ? await store.loadMessages(locale)
    : await store.loadMessagesForPathname(locale, pathname, payloadScope);
  const sourceMap = runtimeOptions.includeSourceMap === true || options.sourceMap !== undefined
    ? runtimeOptions.sourceMap ?? await store.loadSourceMap()
    : undefined;
  const inferredOptions = inferMessageIdOptions({
    messages,
    sourceMap: sourceMap ?? await store.loadSourceMap(),
  });

  const providerProps: I18nProviderRuntimeProps = {
    locale,
    messages,
    keyMode: inferredOptions.keyMode ?? runtimeOptions.keyMode,
    idPrefix: runtimeOptions.idPrefix ?? inferredOptions.idPrefix,
    idLength: runtimeOptions.idLength ?? inferredOptions.idLength,
  };
  if (sourceMap !== undefined) providerProps.sourceMap = sourceMap;

  return providerProps;
}
