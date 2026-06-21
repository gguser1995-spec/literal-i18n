const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  buildSourceArtifacts,
  flattenRecordsByFile,
  normalizeOptions,
} = require('../extract-core.cjs');
const { isRecord, normalizeSlash, readJson } = require('./write-json.cjs');

const DEFAULT_CONFIG_FILES = [
  'literal-i18n.config.mjs',
  'literal-i18n.config.js',
  'literal-i18n.config.cjs',
  'literal-i18n.config.ts',
  'literal-i18n.config.json',
];

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const allowedKeys = /^(LITERAL_I18N_|NEXT_PUBLIC_LITERAL_I18N_|NEXT_PUBLIC_LOCALES$|DEEPSEEK_)/;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const match = trimmedLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || !allowedKeys.test(match[1])) continue;
    if (process.env[match[1]] !== undefined) continue;

    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function loadLiteralI18nEnv(cwd) {
  const mode = process.env.NODE_ENV || 'development';
  for (const envFile of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    loadEnvFile(path.join(cwd, envFile));
  }
}

function resolveConfigPath(cwd, configPath) {
  if (configPath) {
    const absolutePath = path.isAbsolute(configPath) ? configPath : path.resolve(cwd, configPath);
    return fs.existsSync(absolutePath) ? absolutePath : undefined;
  }

  for (const fileName of DEFAULT_CONFIG_FILES) {
    const absolutePath = path.resolve(cwd, fileName);
    if (fs.existsSync(absolutePath)) return absolutePath;
  }

  return undefined;
}

async function loadTypeScriptConfig(configPath, cwd) {
  const ts = require('typescript');
  const Module = require('node:module').Module;
  const source = fs.readFileSync(configPath, 'utf8');
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
    ...Module._nodeModulePaths(cwd),
  ];
  const originalRequire = configModule.require.bind(configModule);
  configModule.require = (specifier) => {
    if (specifier.startsWith('literal-i18n/')) return require(specifier);
    return originalRequire(specifier);
  };
  configModule._compile(transpiled, configPath);
  return configModule.exports.default || configModule.exports;
}

async function loadConfig(cwd, configPath) {
  const resolvedPath = resolveConfigPath(cwd, configPath);
  if (!resolvedPath) return { config: {}, configPath: undefined };

  const extension = path.extname(resolvedPath);
  if (extension === '.json') {
    return {
      config: JSON.parse(fs.readFileSync(resolvedPath, 'utf8')),
      configPath: resolvedPath,
    };
  }

  if (extension === '.cjs') {
    const configModule = require(resolvedPath);
    return {
      config: configModule.default || configModule,
      configPath: resolvedPath,
    };
  }

  if (extension === '.ts') {
    return {
      config: await loadTypeScriptConfig(resolvedPath, cwd),
      configPath: resolvedPath,
    };
  }

  const configModule = await import(pathToFileURL(resolvedPath).href);
  return {
    config: configModule.default || configModule,
    configPath: resolvedPath,
  };
}

function normalizeGuiOptions(cwd, config) {
  const sourceLocale = config.sourceLocale || 'en';
  const locales = Array.isArray(config.locales) && config.locales.length > 0
    ? config.locales
    : [sourceLocale, 'zh'];
  return normalizeOptions({
    ...config,
    cwd,
    sourceLocale,
    locales,
    sourceMapOutput: config.sourceMapOutput || 'src/messages/source-map.json',
    localeDir: config.localeDir || 'src/messages',
  });
}

function localeOutputPath(options, locale) {
  return path.resolve(options.localeOutput(locale));
}

function readAstArtifacts(options) {
  const cache = readJson(options.cacheFile, { files: {} });
  const files = isRecord(cache.files) ? cache.files : {};
  const hasAstCache = Object.keys(files).length > 0;
  const records = hasAstCache ? flattenRecordsByFile(files) : [];
  const artifacts = buildSourceArtifacts(records, options);
  return {
    cache: { files },
    hasAstCache,
    records,
    ...artifacts,
  };
}

async function loadProject(input = {}) {
  const cwd = path.resolve(input.cwd || process.cwd());
  loadLiteralI18nEnv(cwd);
  const { config, configPath } = await loadConfig(cwd, input.configPath);
  const options = normalizeGuiOptions(cwd, config);
  const ast = readAstArtifacts(options);
  const sourceFileMessages = readJson(options.sourceOutput, {});
  const sourceMessages = {
    ...(isRecord(sourceFileMessages) ? sourceFileMessages : {}),
    ...ast.sourceMessages,
  };
  const sourceMap = readJson(options.sourceMapOutput, ast.sourceMap);
  const manifest = readJson(options.manifestOutput, { version: 1, files: {}, routes: {} });

  return {
    cwd,
    config,
    configPath,
    options,
    ast: {
      ...ast,
      sourceMessages,
      sourceMap: isRecord(sourceMap) ? sourceMap : ast.sourceMap,
      manifest: isRecord(manifest) ? manifest : { version: 1, files: {}, routes: {} },
      validKeys: new Set(Object.keys(ast.sourceMessages)),
    },
    paths: {
      cacheFile: options.cacheFile,
      localeDir: options.localeDir,
      manifestOutput: options.manifestOutput,
      sourceMapOutput: options.sourceMapOutput,
      sourceOutput: options.sourceOutput,
    },
  };
}

function projectPublicInfo(project) {
  return {
    sourceLocale: project.options.sourceLocale,
    locales: project.options.locales,
    localeDir: normalizeSlash(path.relative(project.cwd, project.options.localeDir)),
    keyMode: project.options.keyMode,
    hasAstCache: project.ast.hasAstCache,
    validKeyCount: project.ast.validKeys.size,
    sourceOutput: normalizeSlash(path.relative(project.cwd, project.options.sourceOutput)),
    sourceMapOutput: project.options.sourceMapOutput
      ? normalizeSlash(path.relative(project.cwd, project.options.sourceMapOutput))
      : undefined,
    manifestOutput: project.options.manifestOutput
      ? normalizeSlash(path.relative(project.cwd, project.options.manifestOutput))
      : undefined,
  };
}

module.exports = {
  loadConfig,
  loadProject,
  loadLiteralI18nEnv,
  localeOutputPath,
  projectPublicInfo,
  resolveConfigPath,
};
