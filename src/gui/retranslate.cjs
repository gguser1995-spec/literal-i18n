const { localeOutputPath } = require('./project.cjs');
const { sourceTextForKey, createSourceMapReverse } = require('./query.cjs');
const { isRecord, mergeJsonFile, readJson } = require('./write-json.cjs');

async function retranslateKey(project, input = {}) {
  const locale = String(input.locale || '');
  const key = String(input.key || '');

  if (!locale || !project.options.locales.includes(locale)) {
    const error = new Error('Unknown locale.');
    error.code = 'UNKNOWN_LOCALE';
    throw error;
  }
  if (locale === project.options.sourceLocale) {
    const error = new Error('Source locale cannot be retranslated.');
    error.code = 'SOURCE_LOCALE_READONLY';
    throw error;
  }
  if (!project.ast.validKeys.has(key)) {
    const error = new Error('Cannot retranslate a key that is not present in AST.');
    error.code = 'KEY_NOT_IN_AST';
    throw error;
  }
  if (typeof project.config.translateJsonHook !== 'function') {
    const error = new Error('Current config does not define translateJsonHook.');
    error.code = 'TRANSLATE_JSON_HOOK_MISSING';
    throw error;
  }

  const sourceMapReverse = createSourceMapReverse(project.ast.sourceMap);
  const sourceText = sourceTextForKey(key, project.ast.sourceMessages, sourceMapReverse);
  if (!sourceText) {
    const error = new Error('Source text was not found for this key.');
    error.code = 'SOURCE_TEXT_MISSING';
    throw error;
  }

  const localeFile = localeOutputPath(project.options, locale);
  const existingMessages = readJson(localeFile, {});
  const hookResult = await project.config.translateJsonHook({
    locale,
    sourceLocale: project.options.sourceLocale,
    sourceMessages: project.ast.sourceMessages,
    existingMessages: isRecord(existingMessages) ? existingMessages : {},
    missingTexts: [sourceText],
    missingMessages: [{ key, text: sourceText }],
  });

  const translated = isRecord(hookResult)
    ? hookResult[key] ?? hookResult[sourceText]
    : undefined;
  if (typeof translated !== 'string') {
    const error = new Error('translateJsonHook did not return a string for this key.');
    error.code = 'TRANSLATION_MISSING';
    throw error;
  }

  const result = mergeJsonFile(localeFile, (next) => {
    next[key] = translated;
    return next;
  });

  return {
    locale,
    key,
    translated,
    changed: result.changed,
  };
}

module.exports = {
  retranslateKey,
};
