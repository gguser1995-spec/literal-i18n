const { LiteralI18nExtractor } = require('./extract-core.cjs');

const PLUGIN_NAME = 'LiteralI18nNextPlugin';

class LiteralI18nNextPlugin {
  constructor(options = {}) {
    this.options = options;
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

function withLiteralI18n(nextConfig = {}, options = {}) {
  const userWebpack = nextConfig.webpack;
  let pluginAdded = false;

  return {
    ...nextConfig,
    webpack(config, context) {
      config.plugins = config.plugins || [];
      if (!pluginAdded) {
        config.plugins.push(new LiteralI18nNextPlugin({ ...options, cwd: context.dir }));
        pluginAdded = true;
      }

      if (typeof userWebpack === 'function') {
        return userWebpack(config, context);
      }

      return config;
    },
  };
}

module.exports = withLiteralI18n;
module.exports.LiteralI18nNextPlugin = LiteralI18nNextPlugin;
module.exports.withLiteralI18n = withLiteralI18n;
module.exports.SourceI18nNextPlugin = LiteralI18nNextPlugin;
module.exports.withSourceI18n = withLiteralI18n;
