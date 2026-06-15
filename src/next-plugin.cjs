const { watch } = require('node:fs');
const path = require('node:path');
const { LiteralI18nExtractor } = require('./extract-core.cjs');

const PLUGIN_NAME = 'LiteralI18nNextPlugin';
const devWatcherByCwd = new Map();

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
  return process.env.NODE_ENV !== 'production' && process.argv.some((arg) => arg === 'dev');
}

function isWebpackCommand() {
  return process.argv.some((arg) => arg === '--webpack' || arg === 'webpack');
}

function startDevExtractorWatch(options = {}) {
  const cwd = options.cwd || process.cwd();
  if (devWatcherByCwd.has(cwd)) return;

  const extractor = new LiteralI18nExtractor({ ...options, cwd });
  let running = Promise.resolve();
  let timer;
  let pendingFiles = new Set();
  let pendingFullScan = false;
  const watchers = [];

  const enqueue = (task) => {
    running = running.then(task, task);
    return running;
  };
  const flush = async () => {
    const files = Array.from(pendingFiles);
    const shouldFullScan = pendingFullScan;
    pendingFiles = new Set();
    pendingFullScan = false;

    await enqueue(async () => {
      if (shouldFullScan) {
        await extractor.fullScan('dev-watch');
        return;
      }
      await extractor.scanChanged({ reason: 'dev-watch', modifiedFiles: files });
    }).catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
    });
  };
  const schedule = (files) => {
    if (!files) {
      pendingFullScan = true;
    } else {
      for (const file of files) pendingFiles.add(file);
    }
    clearTimeout(timer);
    timer = setTimeout(flush, 120);
  };

  enqueue(() => extractor.fullScan('dev-start')).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
  });

  for (const sourceDir of extractor.getWatchDirs()) {
    try {
      watchers.push(
        watch(sourceDir, { recursive: true }, (_eventType, fileName) => {
          const changedFile = fileName ? path.join(sourceDir, fileName.toString()) : undefined;
          schedule(changedFile ? [changedFile] : undefined);
        }),
      );
    } catch (error) {
      console.warn(
        `[literal-i18n] dev watch unavailable for ${sourceDir}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  devWatcherByCwd.set(cwd, {
    close() {
      clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    },
  });

  if (!options.silent) {
    console.log('[literal-i18n] dev watcher started for Turbopack mode.');
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

function shouldStartInternalDevWatch({ options, nextMajor }) {
  if (!isNextDevCommand() || isWebpackCommand()) return false;
  if (options.devWatch === true) return true;
  if (options.devWatch === false) return false;
  return Boolean(nextMajor && nextMajor >= 16);
}

function withLiteralI18n(nextConfig = {}, options = {}) {
  const userWebpack = nextConfig.webpack;
  const outputConfig = { ...nextConfig };
  const nextMajor = getInstalledNextMajor(options.cwd || process.cwd());
  let pluginAdded = false;
  const isDevCommand = isNextDevCommand();
  const shouldStartDevWatch = shouldStartInternalDevWatch({ options, nextMajor });
  const shouldSkipWebpackWatchExtraction =
    shouldStartDevWatch || (isDevCommand && options.devWatch === false);

  if (nextMajor && nextMajor >= 16 && outputConfig.turbopack === undefined) {
    outputConfig.turbopack = {};
  }

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
          skipWebpackWatchExtraction: shouldSkipWebpackWatchExtraction,
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
