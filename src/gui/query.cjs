const path = require('node:path');
const { isRecord, normalizeSlash, readJson } = require('./write-json.cjs');
const { localeOutputPath } = require('./project.cjs');

function toStringValue(value) {
  return typeof value === 'string' ? value : '';
}

function includesText(value, needle) {
  if (!needle) return true;
  return String(value || '').toLowerCase().includes(needle.toLowerCase());
}

function extractSourceNeedle(sourceInput) {
  const source = String(sourceInput || '').trim();
  if (!source) return '';

  const match = source.match(/<T\b[^>]*\btext\s*=\s*(["'])(.*?)\1/);
  return match ? match[2] : source;
}

function detectLiteralLanguage(text) {
  const value = String(text || '');
  const hasCjk = /[\u3400-\u9fff]/.test(value);
  const hasAsciiLetters = /[A-Za-z]/.test(value);
  if (hasCjk && hasAsciiLetters) return 'mixed';
  if (hasCjk) return 'chinese';
  if (hasAsciiLetters) return 'english';
  return 'unknown';
}

function normalizePathname(urlInput) {
  const raw = String(urlInput || '').trim();
  if (!raw) return '';

  try {
    return new URL(raw, 'http://literal-i18n.local').pathname;
  } catch {
    return raw.startsWith('/') ? raw.split(/[?#]/)[0] : `/${raw.split(/[?#]/)[0]}`;
  }
}

function patternMatchesPathname(pattern, pathname) {
  if (!pattern || !pathname) return false;
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;

  return patternParts.every((part, index) => {
    if (part.startsWith('[') && part.endsWith(']')) return Boolean(pathParts[index]);
    return part === pathParts[index];
  });
}

function patternIsLayoutPrefix(layoutPattern, matchedPattern) {
  if (!layoutPattern || !matchedPattern) return false;
  const layoutParts = layoutPattern.split('/').filter(Boolean);
  const matchedParts = matchedPattern.split('/').filter(Boolean);
  if (layoutParts.length > matchedParts.length) return false;

  return layoutParts.every((part, index) => {
    if (part.startsWith('[') && part.endsWith(']')) return true;
    return part === matchedParts[index];
  });
}

function routeKeysFromManifest(manifest, urlInput) {
  const pathname = normalizePathname(urlInput);
  if (!pathname) return undefined;
  if (!isRecord(manifest) || !isRecord(manifest.routes)) {
    return { matched: false, keys: new Set(), pattern: undefined };
  }

  const matchedPattern = Object.keys(manifest.routes).find((pattern) => {
    return patternMatchesPathname(pattern, pathname);
  });
  if (!matchedPattern) return { matched: false, keys: new Set(), pattern: undefined };

  const keys = new Set(Array.isArray(manifest.routes[matchedPattern]) ? manifest.routes[matchedPattern] : []);
  if (isRecord(manifest.files)) {
    for (const fileInfo of Object.values(manifest.files)) {
      if (!isRecord(fileInfo) || !isRecord(fileInfo.route)) continue;
      if (fileInfo.route.kind !== 'layout') continue;
      if (!patternIsLayoutPrefix(fileInfo.route.pattern, matchedPattern)) continue;
      for (const key of Array.isArray(fileInfo.keys) ? fileInfo.keys : []) keys.add(key);
    }
  }

  return { matched: true, keys, pattern: matchedPattern };
}

function createSourceMapReverse(sourceMap) {
  const reverse = {};
  for (const [sourceMapKey, messageKey] of Object.entries(sourceMap || {})) {
    if (typeof messageKey === 'string' && reverse[messageKey] === undefined) {
      reverse[messageKey] = sourceMapKey;
    }
  }
  return reverse;
}

function sourceTextForKey(key, sourceMessages, sourceMapReverse) {
  return toStringValue(sourceMessages[key]) || toStringValue(sourceMapReverse[key]);
}

function getLocaleMessages(project, locale) {
  const filePath = localeOutputPath(project.options, locale);
  const messages = readJson(filePath, {});
  return isRecord(messages) ? messages : {};
}

function getLocaleRowStatus({ key, locale, project, sourceText, targetValue }) {
  if (!project.ast.validKeys.has(key)) return 'unused';
  if (locale === project.options.sourceLocale) return 'source';
  if (typeof targetValue !== 'string' || !targetValue.trim()) return 'missing';
  if (targetValue === sourceText) return 'same-as-source';
  return 'translated';
}

function applyRowFilters(row, filters) {
  if (filters.routeKeys && !filters.routeKeys.has(row.key) && !filters.routeKeys.has(row.messageKey)) {
    return false;
  }
  if (filters.sourceNeedle) {
    const values = [row.source, row.sourceMapKey, row.messageKey, row.key];
    if (!values.some((value) => includesText(value, filters.sourceNeedle))) return false;
  }
  if (filters.copyNeedle) {
    const values = [row.target];
    if (!values.some((value) => includesText(value, filters.copyNeedle))) return false;
  }
  if (filters.keyNeedle) {
    const values = [row.key, row.messageKey, row.sourceMapKey];
    if (!values.some((value) => includesText(value, filters.keyNeedle))) return false;
  }
  return true;
}

function queryProject(project, input = {}) {
  const locale = input.locale || project.options.locales[0] || project.options.sourceLocale;
  const sourceNeedle = extractSourceNeedle(input.source);
  const copyNeedle = String(input.copy || '').trim();
  const keyNeedle = String(input.key || '').trim();
  const routeFilter = routeKeysFromManifest(project.ast.manifest, input.url);
  const routeKeys = routeFilter && routeFilter.matched ? routeFilter.keys : undefined;
  const sourceMap = project.ast.sourceMap || {};
  const sourceMapReverse = createSourceMapReverse(sourceMap);
  const sourceMessages = project.ast.sourceMessages || {};
  const sourceMeta = project.ast.sourceMeta || {};
  const localeMessages = locale === project.options.sourceLocale
    ? sourceMessages
    : getLocaleMessages(project, locale);
  const filters = {
    copyNeedle,
    keyNeedle,
    routeKeys,
    sourceNeedle,
  };

  if (routeFilter && !routeFilter.matched) {
    return {
      locale,
      route: {
        requested: normalizePathname(input.url),
        matched: false,
      },
      sourceMapRows: [],
      localeRows: [],
    };
  }

  const sourceMapRows = Object.entries(sourceMap)
    .map(([sourceMapKey, messageKey]) => {
      const source = sourceTextForKey(messageKey, sourceMessages, sourceMapReverse) || sourceMapKey;
      const target = locale === project.options.sourceLocale
        ? source
        : toStringValue(localeMessages[messageKey]);
      return {
        sourceMapKey,
        messageKey,
        key: messageKey,
        id: toStringValue(sourceMeta[messageKey]?.id),
        source,
        target,
        astStatus: project.ast.validKeys.has(messageKey) ? 'used' : 'unused',
        canDelete: project.ast.hasAstCache && !project.ast.validKeys.has(messageKey),
      };
    })
    .filter((row) => applyRowFilters(row, filters))
    .sort((left, right) => left.sourceMapKey.localeCompare(right.sourceMapKey));

  const allKeys = new Set([
    ...Object.keys(sourceMessages),
    ...Object.keys(localeMessages),
    ...Object.values(sourceMap).filter((value) => typeof value === 'string'),
  ]);

  const localeRows = Array.from(allKeys)
    .sort()
    .map((key) => {
      const source = sourceTextForKey(key, sourceMessages, sourceMapReverse);
      const target = locale === project.options.sourceLocale
        ? source
        : toStringValue(localeMessages[key]);
      const status = getLocaleRowStatus({ key, locale, project, sourceText: source, targetValue: target });
      const isSourceLocale = locale === project.options.sourceLocale;
      const isUsed = project.ast.validKeys.has(key);

      return {
        key,
        id: toStringValue(sourceMeta[key]?.id),
        source,
        target,
        status,
        file: normalizeSlash(path.relative(project.cwd, localeOutputPath(project.options, locale))),
        canClear: !isSourceLocale && isUsed,
        canDelete: project.ast.hasAstCache && !isUsed,
        canRetranslate: !isSourceLocale && isUsed && typeof project.config.translateJsonHook === 'function',
        canSave: !isSourceLocale && isUsed,
      };
    })
    .filter((row) => applyRowFilters(row, filters));

  return {
    locale,
    route: routeFilter
      ? {
          requested: normalizePathname(input.url),
          matched: true,
          pattern: routeFilter.pattern,
          keyCount: routeFilter.keys.size,
        }
      : undefined,
    sourceMapRows,
    localeRows,
  };
}

module.exports = {
  createSourceMapReverse,
  detectLiteralLanguage,
  extractSourceNeedle,
  queryProject,
  routeKeysFromManifest,
  sourceTextForKey,
};
