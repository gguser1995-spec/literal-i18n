const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const DEFAULT_IMPORT_SOURCES = ['literal-i18n'];
const DEFAULT_SERVER_IMPORT_SOURCES = ['literal-i18n/server'];
const DEFAULT_SOURCE_DIR = 'src';
const DEFAULT_SOURCE_OUTPUT = 'src/messages/en.json';
const DEFAULT_MANIFEST_FILE = 'manifest.json';
const DEFAULT_ID_PREFIX = 'm_';
const DEFAULT_ID_LENGTH = 16;
const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function resolveFrom(cwd, filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonIfChanged(filePath, value) {
  const nextContent = `${JSON.stringify(value, null, 2)}\n`;
  const currentContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;

  if (currentContent === nextContent) {
    return false;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextContent);
  return true;
}

const localeOutputQueues = new Map();

function enqueueLocaleOutput(outputPath, task) {
  const previousTask = localeOutputQueues.get(outputPath) || Promise.resolve();
  const currentTask = previousTask.catch(() => {}).then(task);
  localeOutputQueues.set(outputPath, currentTask);
  currentTask.finally(() => {
    if (localeOutputQueues.get(outputPath) === currentTask) {
      localeOutputQueues.delete(outputPath);
    }
  }).catch(() => {});
  return currentTask;
}

function normalizeIdLength(length) {
  const numericLength = Number(length);
  if (!Number.isFinite(numericLength)) return DEFAULT_ID_LENGTH;
  return Math.min(16, Math.max(8, Math.floor(numericLength)));
}

function hashText(text) {
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

function createMessageId(text, options = {}) {
  const id = normalizeMessageContextId(options.id);
  const hashInput = id ? `${text}\u0000${id}` : text;
  return `${options.idPrefix || DEFAULT_ID_PREFIX}${hashText(hashInput).slice(0, options.idLength || DEFAULT_ID_LENGTH)}`;
}

function getMessageKey(text, options = {}) {
  const id = normalizeMessageContextId(options.id);
  if (options.keyMode === 'hash') return createMessageId(text, options);
  return id ? `${text}_${id}` : text;
}

function normalizeMessageContextId(id) {
  if (typeof id !== 'string') return undefined;
  const normalizedId = id.trim();
  return normalizedId || undefined;
}

function getSourceMapKey(record) {
  return record.id ? `${record.text}_${record.id}` : record.text;
}

function normalizeOptions(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const sourceDirs = uniq(toArray(options.sourceDir || options.sourceDirs || DEFAULT_SOURCE_DIR))
    .map((sourceDir) => path.resolve(cwd, sourceDir));
  const sourceOutput = path.resolve(cwd, options.sourceOutput || DEFAULT_SOURCE_OUTPUT);
  const sourceMapOutput = options.sourceMapOutput
    ? path.resolve(cwd, options.sourceMapOutput)
    : undefined;
  const localeDir = path.resolve(cwd, options.localeDir || 'src/messages');
  const manifestOutput = options.manifestOutput === false
    ? undefined
    : path.resolve(cwd, options.manifestOutput || path.join(localeDir, DEFAULT_MANIFEST_FILE));
  const importSources = uniq(toArray(options.importSource || options.importSources || DEFAULT_IMPORT_SOURCES));
  const serverImportSources = uniq(
    toArray(options.serverImportSource || options.serverImportSources || DEFAULT_SERVER_IMPORT_SOURCES),
  );
  const locales = uniq(toArray(options.locales));
  const sourceLocale = options.sourceLocale || 'en';
  const cacheFile = path.resolve(
    cwd,
    options.cacheFile || '.next/cache/literal-i18n/extracted-by-file.json',
  );

  return {
    cwd,
    sourceDirs,
    sourceOutput,
    sourceMapOutput,
    manifestOutput,
    localeDir,
    importSources,
    serverImportSources,
    locales,
    sourceLocale,
    cacheFile,
    keepStale: options.keepStale !== false,
    keyMode: options.keyMode === 'hash' ? 'hash' : 'source',
    idPrefix: options.idPrefix || DEFAULT_ID_PREFIX,
    idLength: normalizeIdLength(options.idLength),
    pruneLegacySourceKeys: options.pruneLegacySourceKeys !== false,
    treatSourceAsMissing: options.treatSourceAsMissing === true,
    progress: options.progress !== false,
    silent: Boolean(options.silent),
    translateHook: options.translateHook,
    translateJsonHook: options.translateJsonHook,
    localeOutput:
      options.localeOutput ||
      ((locale) => path.join(localeDir, `${locale}.json`)),
    onExtract: options.onExtract,
  };
}

function isMissingTranslation(value, sourceText, options) {
  if (typeof value !== 'string' || !value.trim()) return true;
  return options.treatSourceAsMissing && value === sourceText;
}

function shouldSkipPath(filePath, options) {
  const absolutePath = path.resolve(filePath);
  if (!SUPPORTED_EXTENSIONS.has(path.extname(absolutePath))) return true;
  if (absolutePath.includes(`${path.sep}node_modules${path.sep}`)) return true;
  if (absolutePath.includes(`${path.sep}.next${path.sep}`)) return true;
  if (absolutePath === options.sourceOutput) return true;
  if (options.sourceMapOutput && absolutePath === options.sourceMapOutput) return true;

  for (const locale of options.locales) {
    if (absolutePath === path.resolve(options.localeOutput(locale))) return true;
  }

  return !options.sourceDirs.some((sourceDir) => {
    return absolutePath === sourceDir || absolutePath.startsWith(`${sourceDir}${path.sep}`);
  });
}

function collectFiles(targetPath, options) {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);

  if (stat.isFile()) {
    return shouldSkipPath(targetPath, options) ? [] : [path.resolve(targetPath)];
  }

  const files = [];
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const entryPath = path.join(targetPath, entry.name);

    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath, options));
      continue;
    }

    if (entry.isFile() && !shouldSkipPath(entryPath, options)) {
      files.push(path.resolve(entryPath));
    }
  }

  return files;
}

function collectI18nImports(sourceFile, importSources, serverImportSources) {
  const components = new Set();
  const functions = new Set();
  const translatorFactories = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const source = statement.moduleSpecifier.text;
    const isRuntimeSource = importSources.includes(source);
    const isServerSource = serverImportSources.includes(source);
    if (!isRuntimeSource && !isServerSource) continue;

    const namedBindings = statement.importClause && statement.importClause.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;

    for (const specifier of namedBindings.elements) {
      const importedName = (specifier.propertyName || specifier.name).text;
      const localName = specifier.name.text;

      if (isRuntimeSource && importedName === 'T') components.add(localName);
      if (isRuntimeSource && importedName === 'createTranslator') translatorFactories.add(localName);
      if (isRuntimeSource && importedName === 'useTranslate') translatorFactories.add(localName);
      if (isServerSource && (importedName === 'getTranslator' || importedName === 'getLocaleTranslator')) {
        translatorFactories.add(localName);
      }
    }
  }

  return { components, functions, translatorFactories };
}

function getStaticString(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  return undefined;
}

function getJsxStaticStringAttribute(node, name) {
  const attribute = node.attributes.properties.find((property) => {
    return ts.isJsxAttribute(property) && property.name.text === name;
  });

  if (!attribute || !ts.isJsxAttribute(attribute)) return { attribute: undefined, value: undefined };
  if (!attribute.initializer) return { attribute, value: undefined };
  if (ts.isStringLiteral(attribute.initializer)) {
    return { attribute, value: attribute.initializer.text };
  }

  return { attribute, value: undefined };
}

function getObjectLiteralStaticStringProperty(node, name) {
  if (!node || !ts.isObjectLiteralExpression(node)) return { found: false, value: undefined, node };

  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;

    const propertyName = property.name;
    const isTargetName =
      (ts.isIdentifier(propertyName) && propertyName.text === name) ||
      (ts.isStringLiteral(propertyName) && propertyName.text === name);

    if (!isTargetName) continue;

    return {
      found: true,
      value: getStaticString(property.initializer),
      node: property.initializer,
    };
  }

  return { found: false, value: undefined, node };
}

function getLineAndColumn(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: position.line + 1,
    column: position.character + 1,
  };
}

function unwrapExpression(node) {
  if (ts.isAwaitExpression(node)) return unwrapExpression(node.expression);
  if (ts.isParenthesizedExpression(node)) return unwrapExpression(node.expression);
  return node;
}

function getFactoryCallName(node) {
  const expression = unwrapExpression(node);
  if (!ts.isCallExpression(expression)) return undefined;
  return ts.isIdentifier(expression.expression) ? expression.expression.text : undefined;
}

function getObjectBindingIdentifier(bindingElement) {
  if (!ts.isIdentifier(bindingElement.name)) return undefined;

  if (!bindingElement.propertyName) {
    return bindingElement.name.text === 'tr' ? bindingElement.name.text : undefined;
  }

  if (ts.isIdentifier(bindingElement.propertyName) && bindingElement.propertyName.text === 'tr') {
    return bindingElement.name.text;
  }

  if (ts.isStringLiteral(bindingElement.propertyName) && bindingElement.propertyName.text === 'tr') {
    return bindingElement.name.text;
  }

  return undefined;
}

function resolveRelativeImport(fromFile, specifier, options = {}) {
  if (typeof specifier !== 'string') return undefined;
  if (!specifier.startsWith('.')) return undefined;

  const basePath = normalizePath(path.join(path.dirname(fromFile), specifier));
  const extension = path.extname(basePath);
  if (SUPPORTED_EXTENSIONS.has(extension)) return basePath;

  const candidates = [];
  for (const supportedExtension of SUPPORTED_EXTENSIONS) {
    candidates.push(`${basePath}${supportedExtension}`);
  }

  for (const supportedExtension of SUPPORTED_EXTENSIONS) {
    candidates.push(normalizePath(path.join(basePath, `index${supportedExtension}`)));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(path.resolve(options.cwd || process.cwd(), candidate))) {
      return candidate;
    }
  }

  return candidates[0];
}

function collectRelativeImports(sourceFile, filePath, options = {}) {
  const imports = [];

  for (const statement of sourceFile.statements) {
    const moduleSpecifier = ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
      ? statement.moduleSpecifier
      : undefined;
    if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue;

    const resolvedImport = resolveRelativeImport(filePath, moduleSpecifier.text, options);
    if (resolvedImport) imports.push(resolvedImport);
  }

  return uniq(imports);
}

function extractFromSource(filePath, sourceText, options = {}) {
  const importSources = options.importSources || DEFAULT_IMPORT_SOURCES;
  const serverImportSources = options.serverImportSources || DEFAULT_SERVER_IMPORT_SOURCES;
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = collectI18nImports(sourceFile, importSources, serverImportSources);
  const runtimeTranslators = new Set();
  const records = [];
  const warnings = [];
  const localImports = collectRelativeImports(sourceFile, filePath, options);

  function addRecord(text, node, kind, id) {
    records.push({
      text,
      ...(id ? { id } : {}),
      kind,
      file: filePath,
      ...getLineAndColumn(sourceFile, node),
    });
  }

  function addWarning(message, node) {
    warnings.push({
      message,
      file: filePath,
      ...getLineAndColumn(sourceFile, node),
    });
  }

  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = node.tagName.getText(sourceFile);

      if (imports.components.has(tagName)) {
        const { attribute: textAttribute, value: text } = getJsxStaticStringAttribute(node, 'text');
        const { attribute: idAttribute, value: id } = getJsxStaticStringAttribute(node, 'id');

        if (!textAttribute || !textAttribute.initializer) {
          addWarning('<T /> requires a static text attribute.', node);
        } else if (text !== undefined) {
          if (idAttribute && id === undefined) {
            addWarning('<T id={...} /> cannot be extracted. Use <T id="..." />.', idAttribute);
          }
          addRecord(text, textAttribute.initializer, 'component', id);
        } else {
          addWarning('<T text={...} /> cannot be extracted. Use <T text="..." />.', textAttribute);
        }
      }
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;

      if (imports.functions.has(callee) || runtimeTranslators.has(callee)) {
        const text = node.arguments[0] ? getStaticString(node.arguments[0]) : undefined;

        if (text === undefined) {
          addWarning('tr(...) requires a static string as the first argument.', node);
        } else {
          const idOption = getObjectLiteralStaticStringProperty(node.arguments[2], 'id');
          if (idOption.found && idOption.value === undefined) {
            addWarning('tr(...) id option must be a static string. Use { id: "..." }.', idOption.node || node);
          }
          addRecord(text, node.arguments[0], 'function', idOption.value);
        }
      }
    }

    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.initializer)) {
      if (imports.functions.has(node.initializer.text)) {
        addWarning('Do not alias tr with const fn = tr; import it with an alias instead.', node);
      }
    }

    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const factoryName = getFactoryCallName(node.initializer);
      if (factoryName && imports.translatorFactories.has(factoryName)) {
        runtimeTranslators.add(node.name.text);
      }
    }

    if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name)) {
      const factoryName = getFactoryCallName(node.initializer);
      if (factoryName && imports.translatorFactories.has(factoryName)) {
        for (const element of node.name.elements) {
          const localName = getObjectBindingIdentifier(element);
          if (localName) runtimeTranslators.add(localName);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { records, warnings, imports: localImports };
}

function toSourceMap(records, options = {}) {
  return records.reduce((sourceMap, record) => {
    sourceMap[getSourceMapKey(record)] = getMessageKey(record.text, { ...options, id: record.id });
    return sourceMap;
  }, {});
}

function buildSourceArtifacts(records, options = {}) {
  const sourceMessages = {};
  const sourceMap = {};
  const sourceMeta = {};
  const idToText = {};

  for (const record of records) {
    const key = getMessageKey(record.text, { ...options, id: record.id });
    const sourceMapKey = getSourceMapKey(record);

    if (idToText[key] && idToText[key] !== sourceMapKey) {
      throw new Error(
        `[literal-i18n] Message id collision: "${idToText[key]}" and "${sourceMapKey}" both map to "${key}". Increase idLength or change idPrefix.`,
      );
    }

    idToText[key] = sourceMapKey;
    sourceMessages[key] = record.text;
    sourceMap[sourceMapKey] = key;
    sourceMeta[key] = {
      text: record.text,
      ...(record.id ? { id: record.id } : {}),
    };
  }

  return { sourceMessages, sourceMap, sourceMeta };
}

function flattenRecordsByFile(recordsByFile) {
  return Object.values(recordsByFile).flatMap((entry) => entry.records || []);
}

function sortKeys(keys) {
  return Array.from(new Set(keys)).sort();
}

function getNextAppRouteInfo(filePath) {
  const normalizedPath = normalizePath(filePath);
  const extension = path.extname(normalizedPath);
  if (!SUPPORTED_EXTENSIONS.has(extension)) return undefined;

  const withoutExtension = normalizedPath.slice(0, -extension.length);
  const parts = withoutExtension.split('/');
  const appIndex = parts.lastIndexOf('app');
  if (appIndex < 0) return undefined;

  const kind = parts[parts.length - 1];
  const routeFileKinds = new Set([
    'page',
    'layout',
    'template',
    'loading',
    'error',
    'global-error',
    'not-found',
    'default',
  ]);
  if (!routeFileKinds.has(kind)) return undefined;

  const routeSegments = parts.slice(appIndex + 1, -1).filter((segment) => {
    if (!segment) return false;
    if (segment.startsWith('(') && segment.endsWith(')')) return false;
    if (segment.startsWith('@')) return false;
    return true;
  });
  const pattern = routeSegments.length > 0 ? `/${routeSegments.join('/')}` : '/';

  return { pattern, kind };
}

function buildRuntimeManifest(recordsByFile, options = {}) {
  const files = {};
  const routes = {};
  const directKeysByFile = new Map();
  const importsByFile = new Map();

  for (const [filePath, entry] of Object.entries(recordsByFile)) {
    const records = entry.records || [];
    directKeysByFile.set(
      filePath,
      sortKeys(records.map((record) => getMessageKey(record.text, { ...options, id: record.id }))),
    );
    importsByFile.set(filePath, Array.isArray(entry.imports) ? entry.imports : []);
  }

  const collectKeysForFile = (filePath, seen = new Set()) => {
    if (seen.has(filePath)) return [];
    seen.add(filePath);

    const keys = [...(directKeysByFile.get(filePath) || [])];
    for (const importedFile of importsByFile.get(filePath) || []) {
      keys.push(...collectKeysForFile(importedFile, seen));
    }

    return sortKeys(keys);
  };

  for (const [filePath, entry] of Object.entries(recordsByFile)) {
    const route = getNextAppRouteInfo(filePath);
    const keys = route ? collectKeysForFile(filePath) : directKeysByFile.get(filePath) || [];
    if (keys.length === 0) continue;

    files[filePath] = {
      keys,
      ...(route ? { route } : {}),
    };

    if (route && route.kind !== 'layout') {
      routes[route.pattern] = sortKeys([...(routes[route.pattern] || []), ...keys]);
    }
  }

  return {
    version: 1,
    files,
    routes,
  };
}

class LiteralI18nExtractor {
  constructor(options = {}) {
    this.options = normalizeOptions(options);
  }

  getWatchDirs() {
    return this.options.sourceDirs;
  }

  filterSourceFiles(files) {
    return uniq(toArray(files))
      .map((file) => resolveFrom(this.options.cwd, file))
      .filter((file) => !shouldSkipPath(file, this.options));
  }

  loadCache() {
    const cache = readJson(this.options.cacheFile, { files: {} });
    return isRecord(cache.files) ? cache : { files: {} };
  }

  saveCache(cache) {
    writeJsonIfChanged(this.options.cacheFile, cache);
  }

  extractFile(filePath) {
    const absolutePath = path.resolve(filePath);
    const relativePath = normalizePath(path.relative(this.options.cwd, absolutePath));
    const sourceText = fs.readFileSync(absolutePath, 'utf8');
    return extractFromSource(relativePath, sourceText, this.options);
  }

  async fullScan(reason = 'build') {
    const files = this.options.sourceDirs.flatMap((sourceDir) => collectFiles(sourceDir, this.options));
    const cache = { files: {} };
    const warnings = [];

    for (const file of files) {
      const relativePath = normalizePath(path.relative(this.options.cwd, file));
      const result = this.extractFile(file);
      cache.files[relativePath] = { records: result.records, imports: result.imports };
      warnings.push(...result.warnings);
    }

    this.saveCache(cache);
    return this.writeOutputs(cache, { reason, changedFiles: files, warnings });
  }

  async scanChanged(input = {}) {
    const cache = this.loadCache();
    const modifiedFiles = this.filterSourceFiles(input.modifiedFiles);
    const removedFiles = uniq(toArray(input.removedFiles)).map((file) => resolveFrom(this.options.cwd, file));
    const warnings = [];
    const changedFiles = [];

    if (Object.keys(cache.files).length === 0 && modifiedFiles.length === 0 && removedFiles.length === 0) {
      return this.fullScan(input.reason || 'watch-start');
    }

    for (const file of removedFiles) {
      const relativePath = normalizePath(path.relative(this.options.cwd, file));
      if (cache.files[relativePath]) {
        delete cache.files[relativePath];
        changedFiles.push(file);
      }
    }

    for (const file of modifiedFiles) {
      if (shouldSkipPath(file, this.options)) continue;

      const relativePath = normalizePath(path.relative(this.options.cwd, file));
      if (!fs.existsSync(file)) {
        delete cache.files[relativePath];
        changedFiles.push(file);
        continue;
      }

      const result = this.extractFile(file);
      cache.files[relativePath] = { records: result.records, imports: result.imports };
      warnings.push(...result.warnings);
      changedFiles.push(file);
    }

    if (changedFiles.length === 0) {
      return this.writeOutputs(cache, { reason: input.reason || 'watch', changedFiles, warnings });
    }

    this.saveCache(cache);
    return this.writeOutputs(cache, { reason: input.reason || 'watch', changedFiles, warnings });
  }

  async writeOutputs(cache, meta) {
    const records = flattenRecordsByFile(cache.files);
    const { sourceMessages, sourceMap, sourceMeta } = buildSourceArtifacts(records, this.options);
    const manifest = buildRuntimeManifest(cache.files, this.options);
    const sourceChanged = writeJsonIfChanged(this.options.sourceOutput, sourceMessages);
    const sourceMapChanged = this.options.sourceMapOutput
      ? writeJsonIfChanged(this.options.sourceMapOutput, sourceMap)
      : false;
    const manifestChanged = this.options.manifestOutput
      ? writeJsonIfChanged(this.options.manifestOutput, manifest)
      : false;
    const localeResults = await this.writeLocaleOutputs(sourceMessages, sourceMeta);
    const result = {
      ...meta,
      sourceMessages,
      sourceMap,
      sourceMeta,
      manifest,
      records,
      sourceChanged,
      sourceMapChanged,
      manifestChanged,
      localeResults,
      count: Object.keys(sourceMessages).length,
    };

    this.printResult(result);
    if (typeof this.options.onExtract === 'function') {
      await this.options.onExtract(result);
    }

    return result;
  }

  async writeLocaleOutputs(sourceMessages, sourceMeta = {}) {
    const results = [];

    for (const locale of this.options.locales) {
      if (locale === this.options.sourceLocale) continue;

      const outputPath = path.resolve(this.options.localeOutput(locale));
      const result = await enqueueLocaleOutput(outputPath, () => {
        return this.writeLocaleOutput(locale, outputPath, sourceMessages, sourceMeta);
      });
      results.push(result);
    }

    return results;
  }

  async writeLocaleOutput(locale, outputPath, sourceMessages, sourceMeta = {}) {
      const existingMessages = readJson(outputPath, {});
      const sourceEntries = Object.entries(sourceMessages);
      const getExistingValue = (key, sourceText) => {
        const directValue = existingMessages[key];
        if (this.options.keyMode === 'hash') {
          const legacySourceValue = existingMessages[sourceText];
          if (
            typeof legacySourceValue === 'string' &&
            (!this.options.treatSourceAsMissing || directValue === sourceText || typeof directValue !== 'string')
          ) {
            return legacySourceValue;
          }
        }

        if (typeof directValue === 'string') return directValue;
        return undefined;
      };
      const baseMessages = this.options.keepStale
        ? { ...existingMessages }
        : {};
      if (this.options.keyMode === 'hash' && this.options.pruneLegacySourceKeys) {
        for (const [, sourceText] of sourceEntries) {
          delete baseMessages[sourceText];
        }
      }
      const missingEntries = sourceEntries.filter(([key, sourceText]) => {
        return isMissingTranslation(getExistingValue(key, sourceText), sourceText, this.options);
      });
      const missingKeys = new Set(missingEntries.map(([key]) => key));
      for (const key of missingKeys) {
        delete baseMessages[key];
      }
      const missingMessages = missingEntries.map(([key, sourceText]) => {
        const meta = sourceMeta[key] || {};
        return {
          key,
          text: sourceText,
          ...(meta.id ? { id: meta.id } : {}),
        };
      });
      const missingTexts = missingEntries.map(([, sourceText]) => sourceText);

      let translatedMessages = {};
      if (this.options.progress && !this.options.silent && missingTexts.length > 0) {
        console.log(`[literal-i18n] ${locale}: ${missingTexts.length} missing messages found.`);
      }

      if (missingTexts.length > 0 && typeof this.options.translateJsonHook === 'function') {
        const hookResult = await this.options.translateJsonHook({
          locale,
          sourceLocale: this.options.sourceLocale,
          sourceMessages,
          existingMessages,
          missingTexts,
          missingMessages,
        });
        if (isRecord(hookResult)) {
          translatedMessages = missingEntries.reduce((messages, [key, sourceText]) => {
            const translated = hookResult[key] ?? hookResult[sourceText];
            if (typeof translated === 'string') {
              messages[key] = translated;
            }
            return messages;
          }, {});
        }
      } else if (missingTexts.length > 0 && typeof this.options.translateHook === 'function') {
        let translatedCount = 0;
        for (const [key, text] of missingEntries) {
          const translated = await this.options.translateHook({
            text,
            key,
            id: sourceMeta[key]?.id,
            locale,
            sourceLocale: this.options.sourceLocale,
          });
          if (typeof translated === 'string') {
            translatedMessages[key] = translated;
            translatedCount += 1;
          }
          if (this.options.progress && !this.options.silent) {
            console.log(
              `[literal-i18n] ${locale}: ${translatedCount}/${missingTexts.length} translated.`,
            );
          }
        }
      }

      const nextMessages = {
        ...baseMessages,
        ...Object.fromEntries(sourceEntries.flatMap(([key, sourceText]) => {
          const existingValue = getExistingValue(key, sourceText);
          return isMissingTranslation(existingValue, sourceText, this.options)
            ? []
            : [[key, existingValue]];
        })),
        ...translatedMessages,
      };
      const changed = writeJsonIfChanged(outputPath, nextMessages);
      const translatedCount = Object.keys(translatedMessages).filter((key) => {
        return typeof translatedMessages[key] === 'string' && translatedMessages[key].trim();
      }).length;

      if (this.options.progress && !this.options.silent && missingTexts.length > 0) {
        console.log(
          `[literal-i18n] ${locale}: wrote ${translatedCount}/${missingTexts.length} translated messages to ${normalizePath(path.relative(this.options.cwd, outputPath))}.`,
        );
      }

      return {
        locale,
        outputPath,
        missingCount: missingTexts.length,
        translatedCount,
        changed,
      };
  }

  printResult(result) {
    if (this.options.silent) return;

    for (const warning of result.warnings || []) {
      console.warn(
        `[literal-i18n] ${warning.file}:${warning.line}:${warning.column} ${warning.message}`,
      );
    }

    const changedLabel = result.sourceChanged || result.sourceMapChanged || result.manifestChanged ? 'updated' : 'unchanged';
    console.log(`[literal-i18n] ${result.reason}: ${changedLabel}, ${result.count} messages.`);

    for (const localeResult of result.localeResults || []) {
      if (localeResult.missingCount > 0) {
        console.log(
          `[literal-i18n] ${localeResult.locale}: ${localeResult.translatedCount}/${localeResult.missingCount} missing messages translated, ${localeResult.changed ? 'file updated' : 'file unchanged'}.`,
        );
      }
    }
  }
}

module.exports = {
  DEFAULT_IMPORT_SOURCES,
  DEFAULT_SERVER_IMPORT_SOURCES,
  DEFAULT_SOURCE_DIR,
  DEFAULT_SOURCE_OUTPUT,
  LiteralI18nExtractor,
  SourceI18nExtractor: LiteralI18nExtractor,
  buildSourceArtifacts,
  buildRuntimeManifest,
  collectFiles,
  createMessageId,
  extractFromSource,
  flattenRecordsByFile,
  getMessageKey,
  normalizeOptions,
  toSourceMap,
};
