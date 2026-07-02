const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { LiteralI18nExtractor } = require('./extract-core.cjs');

const PLUGIN_NAME = 'LiteralI18nNextPlugin';
const devWatcherByCwd = new Map();
const WATCH_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const DEV_WATCH_POLL_INTERVAL_MS = 800;
const DEFAULT_LOCALE_DIR = 'src/messages';
const DEFAULT_PUBLIC_RUNTIME_DIR = 'literal-i18n/messages';
const DEFAULT_CONFIG_FILES = [
  'literal-i18n.config.mjs',
  'literal-i18n.config.js',
  'literal-i18n.config.cjs',
  'literal-i18n.config.ts',
  'literal-i18n.config.json',
];

function normalizeSlash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function resolveTracePattern(targetPath, cwd) {
  const normalized = normalizeSlash(targetPath || DEFAULT_LOCALE_DIR);
  const absolutePath = path.isAbsolute(normalized)
    ? normalized
    : path.resolve(cwd, normalized);
  const relativePath = normalizeSlash(path.relative(cwd, absolutePath));

  if (!relativePath || relativePath.startsWith('..')) {
    return `${normalizeSlash(absolutePath)}/**/*.json`;
  }

  return `./${relativePath}/**/*.json`;
}

function resolveTraceFilePattern(targetPath, cwd) {
  const normalized = normalizeSlash(targetPath);
  const absolutePath = path.isAbsolute(normalized)
    ? normalized
    : path.resolve(cwd, normalized);
  const relativePath = normalizeSlash(path.relative(cwd, absolutePath));

  if (!relativePath || relativePath.startsWith('..')) {
    return normalizeSlash(absolutePath);
  }

  return `./${relativePath}`;
}

function resolveConfigTracePatterns(options, cwd) {
  const configuredPath = options.configPath || options.configFile;
  if (configuredPath) return [resolveTraceFilePattern(configuredPath, cwd)];

  return DEFAULT_CONFIG_FILES
    .map((fileName) => path.join(cwd, fileName))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => resolveTraceFilePattern(filePath, cwd));
}

function mergeOutputFileTracingIncludes(nextConfig, options) {
  const cwd = options.cwd || process.cwd();
  const localeDirPattern = resolveTracePattern(options.localeDir || DEFAULT_LOCALE_DIR, cwd);
  const configPatterns = resolveConfigTracePatterns(options, cwd);
  const currentIncludes = nextConfig.outputFileTracingIncludes || {};
  const rootIncludes = currentIncludes['/*'];

  return {
    ...currentIncludes,
    '/*': unique([
      ...(Array.isArray(rootIncludes) ? rootIncludes : []),
      localeDirPattern,
      ...configPatterns,
    ]),
  };
}

function resolveProjectPath(cwd, targetPath) {
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(cwd, targetPath);
}

function shouldSyncPublicRuntime(options) {
  return options.publicRuntime !== false;
}

function resolvePublicRuntimeDir(cwd, options) {
  const publicRuntimeDir = normalizeSlash(options.publicRuntimeDir || DEFAULT_PUBLIC_RUNTIME_DIR).replace(/^\/+/, '');
  return path.resolve(cwd, 'public', publicRuntimeDir);
}

function collectJsonFiles(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }

  return files;
}

function addRuntimeJsonFile(files, cwd, filePath, fallbackName) {
  if (!filePath || filePath === false) return;
  const absolutePath = resolveProjectPath(cwd, filePath);
  try {
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile() || !absolutePath.endsWith('.json')) return;
    files.set(fallbackName || path.basename(absolutePath), absolutePath);
  } catch {
    // Missing optional runtime files are ignored until extraction creates them.
  }
}

function collectRuntimeJsonFiles(options, cwd, localeDir) {
  const files = new Map();
  for (const filePath of collectJsonFiles(localeDir)) {
    files.set(path.relative(localeDir, filePath), filePath);
  }

  addRuntimeJsonFile(files, cwd, options.sourceOutput, path.basename(options.sourceOutput || ''));
  addRuntimeJsonFile(files, cwd, options.sourceMapOutput, 'source-map.json');
  addRuntimeJsonFile(files, cwd, options.manifestOutput, 'manifest.json');

  if (typeof options.localeOutput === 'function' && Array.isArray(options.locales)) {
    for (const locale of options.locales) {
      addRuntimeJsonFile(files, cwd, options.localeOutput(locale), `${locale}.json`);
    }
  }

  return files;
}

function syncPublicRuntimeMessages(options = {}, cwd = process.cwd()) {
  if (!shouldSyncPublicRuntime(options)) return;

  const localeDir = resolveProjectPath(cwd, options.localeDir || DEFAULT_LOCALE_DIR);
  const publicRuntimeDir = resolvePublicRuntimeDir(cwd, options);
  if (localeDir === publicRuntimeDir) return;

  const jsonFiles = collectRuntimeJsonFiles(options, cwd, localeDir);
  if (jsonFiles.size === 0) return;

  fs.rmSync(publicRuntimeDir, { recursive: true, force: true });
  for (const [relativePath, filePath] of jsonFiles) {
    const targetPath = path.join(publicRuntimeDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(filePath, targetPath);
  }
}

function isProcessAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireDevWatcherLock(cwd) {
  const cwdHash = crypto.createHash('sha1').update(cwd).digest('hex');
  const lockPath = path.join(os.tmpdir(), `literal-i18n-dev-watcher-${cwdHash}.lock`);

  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  } catch {
    return undefined;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      return () => {
        try {
          if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf8') === String(process.pid)) {
            fs.unlinkSync(lockPath);
          }
        } catch {
          // Best-effort cleanup only.
        }
      };
    } catch (error) {
      if (error && error.code === 'EEXIST') {
        const lockPid = Number(fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8') : NaN);
        if (isProcessAlive(lockPid)) return undefined;
        try {
          fs.unlinkSync(lockPath);
        } catch {
          return undefined;
        }
        continue;
      }

      return undefined;
    }
  }

  return undefined;
}

function getInstalledNextMajor(cwd) {
  try {
    const packageJsonPath = require.resolve('next/package.json', { paths: [cwd] });
    const packageJson = require(packageJsonPath);
    const major = Number(String(packageJson.version || '').split('.')[0]);
    return Number.isFinite(major) ? major : undefined;
  } catch {
    return undefined;
  }
}

function isNextDevCommand() {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.NODE_ENV === 'development') return true;
  return process.argv.some((arg) => arg === 'dev');
}

function isWebpackCommand() {
  return process.argv.some((arg) => arg === '--webpack' || arg === 'webpack');
}

function collectWatchFiles(targetPath) {
  if (!targetPath) return [];
  let stat;
  try {
    stat = fs.statSync(targetPath);
  } catch {
    return [];
  }

  if (stat.isFile()) {
    return WATCH_EXTENSIONS.has(path.extname(targetPath)) ? [path.resolve(targetPath)] : [];
  }

  if (!stat.isDirectory()) return [];

  const files = [];
  let entries = [];
  try {
    entries = fs.readdirSync(targetPath, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;

    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectWatchFiles(entryPath));
      continue;
    }

    if (entry.isFile() && WATCH_EXTENSIONS.has(path.extname(entryPath))) {
      files.push(path.resolve(entryPath));
    }
  }

  return files;
}

function createWatchSnapshot(extractor) {
  const files = extractor.filterSourceFiles(
    extractor.getWatchDirs().flatMap((sourceDir) => collectWatchFiles(sourceDir)),
  );
  const snapshot = new Map();

  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      snapshot.set(file, `${stat.mtimeMs}:${stat.size}`);
    } catch {
      // Ignore files that disappear between directory listing and stat.
    }
  }

  return snapshot;
}

function diffWatchSnapshots(previousSnapshot, nextSnapshot) {
  const modifiedFiles = [];
  const removedFiles = [];

  for (const [file, signature] of nextSnapshot) {
    if (previousSnapshot.get(file) !== signature) {
      modifiedFiles.push(file);
    }
  }

  for (const file of previousSnapshot.keys()) {
    if (!nextSnapshot.has(file)) {
      removedFiles.push(file);
    }
  }

  return { modifiedFiles, removedFiles };
}

function startDevExtractorWatch(options = {}) {
  const cwd = options.cwd || process.cwd();
  if (devWatcherByCwd.has(cwd)) return;

  const releaseLock = acquireDevWatcherLock(cwd);
  if (!releaseLock) return;
  process.once('exit', releaseLock);

  const extractor = new LiteralI18nExtractor({ ...options, cwd });
  let running = Promise.resolve();
  let timer;
  let pendingFiles = new Set();
  let pendingRemovedFiles = new Set();
  let pendingFullScan = false;
  let pollTimer;
  let lastSnapshot;
  let hasSuccessfulScan = false;
  let isScanning = false;

  const enqueue = (task) => {
    running = running.then(async () => {
      const result = await task();
      syncPublicRuntimeMessages(options, cwd);
      return result;
    }, async () => {
      const result = await task();
      syncPublicRuntimeMessages(options, cwd);
      return result;
    });
    return running;
  };
  const flush = async () => {
    const files = Array.from(pendingFiles);
    const removedFiles = Array.from(pendingRemovedFiles);
    const shouldFullScan = pendingFullScan;
    pendingFiles = new Set();
    pendingRemovedFiles = new Set();
    pendingFullScan = false;

    await enqueue(async () => {
      isScanning = true;
      if (shouldFullScan || !hasSuccessfulScan) {
        try {
          await extractor.fullScan('dev-watch');
          lastSnapshot = createWatchSnapshot(extractor);
          hasSuccessfulScan = true;
          return;
        } finally {
          isScanning = false;
        }
      }
      try {
        await extractor.scanChanged({ reason: 'dev-watch', modifiedFiles: files, removedFiles });
        lastSnapshot = createWatchSnapshot(extractor);
        hasSuccessfulScan = true;
      } finally {
        isScanning = false;
      }
    }).catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
    });
  };
  const schedule = (input) => {
    if (!input) {
      pendingFullScan = true;
    } else {
      for (const file of input.modifiedFiles || []) pendingFiles.add(file);
      for (const file of input.removedFiles || []) pendingRemovedFiles.add(file);
    }
    clearTimeout(timer);
    timer = setTimeout(flush, 120);
  };

  lastSnapshot = createWatchSnapshot(extractor);
  enqueue(async () => {
    isScanning = true;
    try {
      await extractor.fullScan('dev-start');
      lastSnapshot = createWatchSnapshot(extractor);
      hasSuccessfulScan = true;
    } finally {
      isScanning = false;
    }
  }).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
  });

  pollTimer = setInterval(() => {
    if (isScanning) return;

    const nextSnapshot = createWatchSnapshot(extractor);
    const diff = diffWatchSnapshots(lastSnapshot, nextSnapshot);

    if (diff.modifiedFiles.length > 0 || diff.removedFiles.length > 0) {
      schedule(diff);
    }
  }, DEV_WATCH_POLL_INTERVAL_MS);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();

  devWatcherByCwd.set(cwd, {
    close() {
      clearTimeout(timer);
      clearInterval(pollTimer);
      releaseLock();
    },
  });

  if (!options.silent) {
    console.log('[literal-i18n] dev watcher started.');
  }
}

class LiteralI18nNextPlugin {
  constructor(options = {}) {
    const { skipWebpackWatchExtraction = false, ...extractorOptions } = options;
    this.options = extractorOptions;
    this.skipWebpackWatchExtraction = skipWebpackWatchExtraction;
    this.extractorByCwd = new Map();
    this.hasInitialWatchScan = false;
    this.running = Promise.resolve();
    this.ignoreWatchUntil = 0;
  }

  getExtractor(cwd) {
    if (!this.extractorByCwd.has(cwd)) {
      this.extractorByCwd.set(cwd, new LiteralI18nExtractor({ ...this.options, cwd }));
    }

    return this.extractorByCwd.get(cwd);
  }

  enqueue(task) {
    this.running = this.running.then(async () => {
      const result = await task();
      syncPublicRuntimeMessages(this.options, this.currentCwd || process.cwd());
      const localeChanged = result?.localeResults?.some((localeResult) => localeResult.changed);
      if (result?.sourceChanged || localeChanged) {
        this.ignoreWatchUntil = Date.now() + 1000;
      }
      return result;
    }, task);
    return this.running;
  }

  apply(compiler) {
    const cwd = compiler.context || process.cwd();
    this.currentCwd = cwd;
    const extractor = this.getExtractor(cwd);

    compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, async () => {
      await this.enqueue(() => extractor.fullScan('build'));
    });

    compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async (watchCompiler) => {
      if (this.skipWebpackWatchExtraction) return;

      const modifiedFiles = Array.from(watchCompiler.modifiedFiles || []);
      const removedFiles = Array.from(watchCompiler.removedFiles || []);
      const modifiedSourceFiles = extractor.filterSourceFiles(modifiedFiles);

      if (!this.hasInitialWatchScan) {
        this.hasInitialWatchScan = true;
        await this.enqueue(() => extractor.fullScan('watch-start'));
        return;
      }

      if (modifiedSourceFiles.length === 0 && removedFiles.length === 0) {
        if (Date.now() < this.ignoreWatchUntil) return;
        return;
      }

      await this.enqueue(() => extractor.scanChanged({
        reason: 'watch',
        modifiedFiles: modifiedSourceFiles,
        removedFiles,
      }));
    });

    compiler.hooks.afterCompile.tap(PLUGIN_NAME, (compilation) => {
      for (const sourceDir of extractor.getWatchDirs()) {
        compilation.contextDependencies.add(sourceDir);
      }
    });
  }
}

function shouldStartInternalDevWatch({ options }) {
  if (!isNextDevCommand()) return false;
  if (options.devWatch === true) return true;
  if (options.devWatch === false) return false;
  if (isWebpackCommand()) return false;
  return true;
}

function withLiteralI18n(nextConfig = {}, options = {}) {
  const userWebpack = nextConfig.webpack;
  const outputConfig = { ...nextConfig };
  const nextMajor = getInstalledNextMajor(options.cwd || process.cwd());
  let pluginAdded = false;
  const isDevCommand = isNextDevCommand();
  const shouldStartDevWatch = shouldStartInternalDevWatch({ options });
  const shouldDisableWatchExtraction = isDevCommand && options.devWatch === false;

  if (nextMajor && nextMajor >= 16 && outputConfig.turbopack === undefined) {
    outputConfig.turbopack = {};
  }

  if (options.publicRuntime === false) {
    outputConfig.outputFileTracingIncludes = mergeOutputFileTracingIncludes(outputConfig, options);
  }

  syncPublicRuntimeMessages(options, options.cwd || process.cwd());

  if (shouldStartDevWatch) {
    startDevExtractorWatch(options);
  }

  return {
    ...outputConfig,
    webpack(config, context) {
      config.plugins = config.plugins || [];
      if (!pluginAdded) {
        config.plugins.push(new LiteralI18nNextPlugin({
          ...options,
          cwd: context.dir,
          skipWebpackWatchExtraction: shouldDisableWatchExtraction || devWatcherByCwd.has(context.dir),
        }));
        pluginAdded = true;
      }

      if (typeof userWebpack === 'function') {
        return userWebpack(config, context);
      }

      return config;
    },
  };
}

function defineLiteralI18nConfig(options = {}) {
  return options;
}

module.exports = withLiteralI18n;
module.exports.LiteralI18nNextPlugin = LiteralI18nNextPlugin;
module.exports.withLiteralI18n = withLiteralI18n;
module.exports.defineLiteralI18nConfig = defineLiteralI18nConfig;
module.exports.SourceI18nNextPlugin = LiteralI18nNextPlugin;
module.exports.withSourceI18n = withLiteralI18n;
