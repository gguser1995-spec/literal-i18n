#!/usr/bin/env node

import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync, watch } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

loadLiteralI18nEnv();
const require = createRequire(import.meta.url);
const { LiteralI18nExtractor } = require('../src/extract-core.cjs');

const DEFAULT_CONFIG_FILES = [
  'literal-i18n.config.mjs',
  'literal-i18n.config.js',
  'literal-i18n.config.cjs',
  'literal-i18n.config.ts',
  'literal-i18n.config.json',
];

function loadEnvFile(envPath) {
  if (!existsSync(envPath)) return;
  const allowedKeys = /^(LITERAL_I18N_|NEXT_PUBLIC_LITERAL_I18N_|NEXT_PUBLIC_LOCALES$|DEEPSEEK_)/;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const match = trimmedLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || !allowedKeys.test(match[1])) continue;

    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function loadLiteralI18nEnv() {
  const cwd = process.cwd();
  const mode = process.env.NODE_ENV || 'development';
  const envFiles = [
    '.env',
    '.env.local',
    `.env.${mode}`,
    `.env.${mode}.local`,
  ];

  for (const envFile of envFiles) {
    loadEnvFile(path.join(cwd, envFile));
  }
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  const flags = new Set(['--watch', '-w', '--help', '-h']);
  const valueOptions = new Map([
    ['--config', 'config'],
    ['-c', 'config'],
    ['--out', 'sourceOutput'],
    ['--source-map-out', 'sourceMapOutput'],
    ['--key-mode', 'keyMode'],
    ['--id-prefix', 'idPrefix'],
    ['--id-length', 'idLength'],
    ['--locale-dir', 'localeDir'],
    ['--source-locale', 'sourceLocale'],
    ['--locales', 'locales'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (flags.has(arg)) {
      if (arg === '--watch' || arg === '-w') options.watch = true;
      if (arg === '--help' || arg === '-h') options.help = true;
      continue;
    }

    if (valueOptions.has(arg)) {
      const key = valueOptions.get(arg);
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`[literal-i18n] Missing value for ${arg}.`);
      }
      options[key] = key === 'locales' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`[literal-i18n] Unknown option: ${arg}.`);
    }

    positionals.push(arg);
  }

  if (positionals[0]) {
    options.sourceDir = positionals[0];
  }

  return options;
}

function printHelp() {
  console.log(`literal-i18n-extract [sourceDir] [options]

Options:
  -c, --config <path>          Config file path. Defaults to literal-i18n.config.*
  -w, --watch                  Watch source files and re-extract on changes
      --out <path>             Source locale JSON output
      --source-map-out <path>  Source map output
      --key-mode <source|hash> Message key mode
      --id-prefix <prefix>     Hash id prefix
      --id-length <number>     Hash id length
      --locale-dir <path>      Locale JSON directory
      --source-locale <locale> Source locale, default en
      --locales <list>         Comma-separated locales, e.g. en,zh,de
  -h, --help                   Show help
`);
}

function resolveConfigPath(cwd, configPath) {
  if (configPath) {
    const absolutePath = path.isAbsolute(configPath) ? configPath : path.resolve(cwd, configPath);
    return existsSync(absolutePath) ? absolutePath : undefined;
  }

  for (const fileName of DEFAULT_CONFIG_FILES) {
    const absolutePath = path.resolve(cwd, fileName);
    if (existsSync(absolutePath)) return absolutePath;
  }

  return undefined;
}

async function loadTypeScriptConfig(configPath) {
  const ts = require('typescript');
  const source = readFileSync(configPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    },
    fileName: configPath,
  }).outputText;
  const tempDir = path.join(os.tmpdir(), 'literal-i18n-config');
  const tempPath = path.join(
    tempDir,
    `${path.basename(configPath).replace(/[^a-zA-Z0-9_.-]/g, '_')}.${Date.now()}.mjs`,
  );

  await mkdir(tempDir, { recursive: true });
  await writeFile(tempPath, transpiled, 'utf8');
  return import(pathToFileURL(tempPath).href);
}

async function loadConfig(cwd, configPath) {
  const resolvedPath = resolveConfigPath(cwd, configPath);
  if (!resolvedPath) return {};

  const extension = path.extname(resolvedPath);
  if (extension === '.json') {
    return JSON.parse(readFileSync(resolvedPath, 'utf8'));
  }

  if (extension === '.cjs') {
    const configModule = require(resolvedPath);
    return configModule.default || configModule;
  }

  const configModule = extension === '.ts'
    ? await loadTypeScriptConfig(resolvedPath)
    : await import(pathToFileURL(resolvedPath).href);

  return configModule.default || configModule;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

function normalizeCliOptions(parsedArgs, config) {
  const envOptions = compactObject({
    keyMode: process.env.NEXT_PUBLIC_LITERAL_I18N_KEY_MODE,
    idPrefix: process.env.NEXT_PUBLIC_LITERAL_I18N_ID_PREFIX,
    idLength: process.env.NEXT_PUBLIC_LITERAL_I18N_ID_LENGTH,
  });
  const cliOptions = compactObject({
    sourceDir: parsedArgs.sourceDir,
    sourceOutput: parsedArgs.sourceOutput,
    sourceMapOutput: parsedArgs.sourceMapOutput,
    keyMode: parsedArgs.keyMode,
    idPrefix: parsedArgs.idPrefix,
    idLength: parsedArgs.idLength,
    localeDir: parsedArgs.localeDir,
    sourceLocale: parsedArgs.sourceLocale,
    locales: parsedArgs.locales,
  });

  return {
    ...config,
    ...envOptions,
    ...cliOptions,
    sourceDir: cliOptions.sourceDir ?? config.sourceDir ?? config.sourceDirs ?? 'src',
    sourceMapOutput:
      cliOptions.sourceMapOutput ??
      config.sourceMapOutput ??
      'src/messages/source-map.json',
  };
}

function watchSourceDirs(extractor, onChange) {
  const watchers = [];

  for (const sourceDir of extractor.getWatchDirs()) {
    try {
      const watcher = watch(sourceDir, { recursive: true }, (eventType, fileName) => {
        const changedFile = fileName ? path.join(sourceDir, fileName.toString()) : undefined;
        onChange(changedFile ? [changedFile] : undefined, eventType);
      });
      watchers.push(watcher);
    } catch (error) {
      console.warn(
        `[literal-i18n] watch unavailable for ${sourceDir}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return () => {
    for (const watcher of watchers) watcher.close();
  };
}

async function runWatch(extractor) {
  await extractor.fullScan('watch-start');

  let timer;
  let pendingFiles = new Set();
  let pendingFullScan = false;
  const flush = async () => {
    const files = Array.from(pendingFiles);
    pendingFiles = new Set();
    const shouldFullScan = pendingFullScan;
    pendingFullScan = false;

    try {
      if (shouldFullScan) {
        await extractor.fullScan('watch');
        return;
      }
      await extractor.scanChanged({ reason: 'watch', modifiedFiles: files });
    } catch (error) {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
    }
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
  const closeWatchers = watchSourceDirs(extractor, schedule);

  console.log('[literal-i18n] watching source files. Press Ctrl+C to stop.');
  process.on('SIGINT', () => {
    clearTimeout(timer);
    closeWatchers();
    process.exit(0);
  });
}

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (parsedArgs.help) {
    printHelp();
    return;
  }

  const config = await loadConfig(process.cwd(), parsedArgs.config);
  const extractor = new LiteralI18nExtractor(normalizeCliOptions(parsedArgs, config));

  if (parsedArgs.watch) {
    await runWatch(extractor);
    return;
  }

  await extractor.fullScan('cli');
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
