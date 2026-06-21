#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const EXTRACT_BIN = path.join(__dirname, 'extract-literal-i18n.mjs');
const CONFIG_FILES = [
  'literal-i18n.config.ts',
  'literal-i18n.config.mjs',
  'literal-i18n.config.js',
  'literal-i18n.config.cjs',
  'literal-i18n.config.json',
];
const NEXT_CONFIG_FILES = [
  'next.config.ts',
  'next.config.mjs',
  'next.config.js',
  'next.config.cjs',
];

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'help';
  const rest = command === 'help' ? argv : argv.slice(1);
  const options = {
    _: [],
    command,
    dryRun: false,
    yes: false,
    force: false,
  };

  const valueOptions = new Set([
    '--locales',
    '--source-locale',
    '--key-mode',
    '--source-dir',
    '--config',
    '--port',
  ]);

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--yes' || arg === '-y') {
      options.yes = true;
      continue;
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (valueOptions.has(arg)) {
      const value = rest[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`[literal-i18n] Missing value for ${arg}.`);
      }
      options[toCamelCase(arg.slice(2))] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`[literal-i18n] Unknown option: ${arg}.`);
    }
    options._.push(arg);
  }

  return options;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function printHelp() {
  console.log(`literal-i18n <command> [options]

Commands:
  init       Initialize literal-i18n in the current project
  extract    Run the extractor (alias for literal-i18n-extract)
  gui        Start the local translation manager

Init options:
  --dry-run                 Print planned changes without writing files
  -y, --yes                 Accept the default non-interactive choices
  --force                   Overwrite generated files when safe
  --locales <list>          Comma-separated locales, default en,zh
  --source-locale <locale>  Source locale, default en
  --key-mode <source|hash>  Message key mode, default hash
  --source-dir <dir>        Source directory, default src when present

GUI options:
  --port <number>           Local GUI port, default 3699
  --config <path>           Config file path. Defaults to literal-i18n.config.*

Examples:
  npx literal-i18n init --yes
  npx literal-i18n init --dry-run
  npx literal-i18n init --yes --locales en,zh,de
  npx literal-i18n extract --watch
  npx literal-i18n gui
`);
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relativeImportPath(fromFile, toFile) {
  let relativePath = path.relative(path.dirname(fromFile), toFile).split(path.sep).join('/');
  if (!relativePath.startsWith('.')) relativePath = `./${relativePath}`;
  return relativePath.replace(/\.(ts|mts|cts|mjs|js|cjs)$/, '');
}

function detectNextMajor(cwd, packageJson) {
  const versionRange = packageJson.dependencies?.next ?? packageJson.devDependencies?.next;
  if (typeof versionRange === 'string') {
    const match = versionRange.match(/(\d+)(?:\.\d+)?(?:\.\d+)?/);
    if (match) return Number(match[1]);
  }

  try {
    const nextPackageJsonPath = path.join(cwd, 'node_modules/next/package.json');
    const nextPackageJson = readJson(nextPackageJsonPath, {});
    const major = Number(String(nextPackageJson.version || '').split('.')[0]);
    return Number.isFinite(major) ? major : undefined;
  } catch {
    return undefined;
  }
}

function findFirstExisting(cwd, files) {
  return files.find((file) => existsSync(path.join(cwd, file)));
}

function detectProject(cwd) {
  const packageJsonPath = path.join(cwd, 'package.json');
  const packageJson = readJson(packageJsonPath, {});
  const hasSrc = existsSync(path.join(cwd, 'src'));
  const appDir = existsSync(path.join(cwd, 'src/app'))
    ? 'src/app'
    : existsSync(path.join(cwd, 'app'))
      ? 'app'
      : undefined;
  const sourceDir = hasSrc ? 'src' : appDir ? appDir.split('/')[0] : 'src';
  const nextMajor = detectNextMajor(cwd, packageJson);
  const configFile = findFirstExisting(cwd, CONFIG_FILES);
  const nextConfigFile = findFirstExisting(cwd, NEXT_CONFIG_FILES);
  const proxyOrMiddlewareBaseDir = appDir?.startsWith('src/') || hasSrc ? 'src' : '.';
  const middlewareFile = findFirstExisting(cwd, [
    'src/middleware.ts',
    'src/middleware.js',
    'middleware.ts',
    'middleware.js',
  ]);
  const proxyFile = findFirstExisting(cwd, [
    'src/proxy.ts',
    'src/proxy.js',
    'proxy.ts',
    'proxy.js',
  ]);

  return {
    packageJson,
    packageJsonPath,
    isNext: Boolean(nextMajor || nextConfigFile || packageJson.dependencies?.next || packageJson.devDependencies?.next),
    nextMajor,
    appDir,
    sourceDir,
    configFile,
    nextConfigFile,
    middlewareFile,
    proxyFile,
    proxyOrMiddlewareBaseDir,
    packageManager: detectPackageManager(cwd),
  };
}

function detectPackageManager(cwd) {
  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(cwd, 'bun.lockb')) || existsSync(path.join(cwd, 'bun.lock'))) return 'bun';
  return 'npm';
}

function createConfigContent(options) {
  const sourceLocale = options.sourceLocale || 'en';
  const locales = normalizeLocales(options.locales, sourceLocale);
  const keyMode = options.keyMode === 'source' ? 'source' : 'hash';
  const sourceDir = options.sourceDir || 'src';

  return `import { defineLiteralI18nConfig } from 'literal-i18n/next';
import { createDeepSeekTranslateJsonHook } from 'literal-i18n/local-translate-api';

const apiKey = process.env.LITERAL_I18N_API_KEY?.trim();

const translateJsonHook = apiKey
  ? createDeepSeekTranslateJsonHook({
      apiKey,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      batchSize: 20,
      timeoutMs: 120000,
      temperature: 0.1,
      prompt: '你是一位专业的网站 UI 本地化翻译人员。保持译文简洁自然。保留所有占位符不变。',
    })
  : () => ({});

export default defineLiteralI18nConfig({
  sourceDir: '${sourceDir}',
  sourceOutput: '${sourceDir}/messages/${sourceLocale}.json',
  sourceMapOutput: '${sourceDir}/messages/source-map.json',
  localeDir: '${sourceDir}/messages',
  locales: ${JSON.stringify(locales)},
  sourceLocale: '${sourceLocale}',
  keyMode: '${keyMode}',
  idPrefix: 'm_',
  idLength: 16,
  translateJsonHook,
});
`;
}

function normalizeLocales(localesInput, sourceLocale) {
  const locales = String(localesInput || `${sourceLocale},zh`)
    .split(',')
    .map((locale) => locale.trim())
    .filter(Boolean);
  return Array.from(new Set([sourceLocale, ...locales]));
}

function createMiddlewareContent(kind) {
  const fnName = kind === 'proxy' ? 'proxy' : 'middleware';

  return `import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { literalI18nMiddleware } from 'literal-i18n/middleware';

export function ${fnName}(request: NextRequest) {
  return literalI18nMiddleware(request, NextResponse);
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
};
`;
}

function maybeWrapNextConfig(content, nextConfigPath, configPath) {
  if (content.includes('withLiteralI18n(')) {
    return { status: 'skip', content, reason: 'next.config already uses withLiteralI18n.' };
  }

  if (path.extname(nextConfigPath) === '.cjs' || content.includes('module.exports')) {
    return {
      status: 'manual',
      content,
      reason: 'CommonJS next.config detected. Automatic wrapping is skipped to avoid generating invalid TS config imports.',
    };
  }

  const importLines = [
    "import withLiteralI18n from 'literal-i18n/next';",
    `import literalI18nConfig from '${relativeImportPath(nextConfigPath, configPath)}';`,
  ];
  const missingImports = importLines.filter((line) => !content.includes(line));
  let nextContent = `${missingImports.join('\n')}${missingImports.length > 0 ? '\n' : ''}${content}`;

  const defaultExportMatch = nextContent.match(/export\s+default\s+([^;\n]+);?/);
  if (defaultExportMatch) {
    const expression = defaultExportMatch[1].trim();
    if (expression.includes('withLiteralI18n(')) {
      return { status: 'skip', content, reason: 'next.config already uses withLiteralI18n.' };
    }

    nextContent = nextContent.replace(
      defaultExportMatch[0],
      `export default withLiteralI18n(${expression}, literalI18nConfig);`,
    );
    return { status: 'update', content: nextContent };
  }

  return {
    status: 'manual',
    content,
    reason: 'Could not find a simple default export or module.exports assignment.',
  };
}

function createManualNextConfigPatch(configPath) {
  const importPath = `./${path.basename(configPath)}`.replace(/\.(ts|mts|cts|mjs|js|cjs)$/, '');
  return `import withLiteralI18n from 'literal-i18n/next';
import literalI18nConfig from '${importPath}';

export default withLiteralI18n(existingNextConfig, literalI18nConfig);`;
}

function createManualMiddlewarePatch(kind) {
  const fnName = kind === 'proxy' ? 'proxy' : 'middleware';
  return `import { NextRequest, NextResponse } from 'next/server';
import { LITERAL_I18N_PATHNAME_HEADER } from 'literal-i18n/middleware';

export function ${fnName}(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LITERAL_I18N_PATHNAME_HEADER, request.nextUrl.pathname);
  const requestWithLiteralI18nPathname = new NextRequest(request, {
    headers: requestHeaders,
  });

  return existing${fnName[0].toUpperCase()}${fnName.slice(1)}(requestWithLiteralI18nPathname, NextResponse);
}`;
}

function packageRunCommand(packageManager) {
  if (packageManager === 'pnpm') return 'pnpm';
  if (packageManager === 'yarn') return 'yarn';
  if (packageManager === 'bun') return 'bun run';
  return 'npm run';
}

function updatePackageJsonScripts(packageJson, packageManager) {
  const scripts = { ...(packageJson.scripts || {}) };
  const changed = [];
  if (!scripts['i18n:extract']) {
    scripts['i18n:extract'] = 'literal-i18n extract';
    changed.push('i18n:extract');
  }
  if (!scripts['i18n:watch']) {
    scripts['i18n:watch'] = 'literal-i18n extract --watch';
    changed.push('i18n:watch');
  }
  if (scripts.build === 'next build') {
    scripts.build = `${packageRunCommand(packageManager)} i18n:extract && next build`;
    changed.push('build');
  }
  return {
    changed,
    packageJson: {
      ...packageJson,
      scripts,
    },
  };
}

function planInit(cwd, options) {
  const project = detectProject(cwd);
  const actions = [];
  const warnings = [];
  const sourceDir = options.sourceDir || project.sourceDir || 'src';
  const configPath = path.join(cwd, options.config || project.configFile || 'literal-i18n.config.ts');
  const configRelative = path.relative(cwd, configPath) || path.basename(configPath);

  if (!project.isNext) {
    warnings.push('Next.js was not detected. init will create config and scripts, but Next integration is skipped.');
  }
  if (!project.appDir && project.isNext) {
    warnings.push('App Router directory was not detected. Route-level runtime pruning still needs App Router pages.');
  }

  if (project.configFile && !options.force) {
    actions.push({
      type: 'skip',
      title: `Keep existing ${project.configFile}`,
    });
  } else {
    actions.push({
      type: 'write',
      title: `${project.configFile ? 'Overwrite' : 'Create'} ${configRelative}`,
      filePath: configPath,
      content: createConfigContent({ ...options, sourceDir }),
      overwrite: Boolean(project.configFile && options.force),
    });
  }

  const messagesDir = path.join(cwd, sourceDir, 'messages');
  actions.push({
    type: 'mkdir',
    title: `Ensure ${path.relative(cwd, messagesDir)} directory`,
    dirPath: messagesDir,
  });

  actions.push({
    type: 'write-if-missing',
    title: 'Create .env.example',
    filePath: path.join(cwd, '.env.example'),
    content: 'LITERAL_I18N_API_KEY=\n',
  });

  if (project.packageJsonPath && existsSync(project.packageJsonPath)) {
    const packageUpdate = updatePackageJsonScripts(project.packageJson, project.packageManager);
    if (packageUpdate.changed.length > 0) {
      actions.push({
        type: 'write-json',
        title: `Update package.json scripts: ${packageUpdate.changed.join(', ')}`,
        filePath: project.packageJsonPath,
        value: packageUpdate.packageJson,
      });
    } else {
      actions.push({ type: 'skip', title: 'package.json scripts already include literal-i18n commands' });
    }
  }

  if (project.isNext) {
    const middlewareKind = project.nextMajor && project.nextMajor >= 16 ? 'proxy' : 'middleware';
    const existingMiddleware = middlewareKind === 'proxy'
      ? project.proxyFile || project.middlewareFile
      : project.middlewareFile || project.proxyFile;
    const middlewareFile = path.join(
      cwd,
      project.proxyOrMiddlewareBaseDir === '.'
        ? `${middlewareKind}.ts`
        : path.join(project.proxyOrMiddlewareBaseDir, `${middlewareKind}.ts`),
    );
    if (existingMiddleware && !options.force) {
      actions.push({
        type: 'manual',
        title: `Existing ${existingMiddleware} detected; review middleware composition`,
        suggestion: createManualMiddlewarePatch(middlewareKind),
      });
    } else {
      actions.push({
        type: 'write',
        title: `${existingMiddleware ? 'Overwrite' : 'Create'} ${path.relative(cwd, middlewareFile)}`,
        filePath: middlewareFile,
        content: createMiddlewareContent(middlewareKind),
        overwrite: Boolean(existingMiddleware && options.force),
      });
    }

    if (project.nextConfigFile) {
      const nextConfigPath = path.join(cwd, project.nextConfigFile);
      const currentContent = readFileSync(nextConfigPath, 'utf8');
      const wrapResult = maybeWrapNextConfig(currentContent, nextConfigPath, configPath);
      if (wrapResult.status === 'update') {
        actions.push({
          type: 'write',
          title: `Wrap ${project.nextConfigFile} with withLiteralI18n`,
          filePath: nextConfigPath,
          content: wrapResult.content,
          overwrite: true,
        });
      } else if (wrapResult.status === 'skip') {
        actions.push({ type: 'skip', title: wrapResult.reason });
      } else {
        actions.push({
          type: 'manual',
          title: `Review ${project.nextConfigFile} manually`,
          suggestion: createManualNextConfigPatch(configPath),
          reason: wrapResult.reason,
        });
      }
    } else {
      const nextConfigPath = path.join(cwd, 'next.config.ts');
      actions.push({
        type: 'write',
        title: 'Create next.config.ts with withLiteralI18n',
        filePath: nextConfigPath,
        content: `import type { NextConfig } from 'next';
import withLiteralI18n from 'literal-i18n/next';
import literalI18nConfig from './literal-i18n.config';

const nextConfig: NextConfig = {};

export default withLiteralI18n(nextConfig, literalI18nConfig);
`,
      });
    }
  }

  return { project, actions, warnings };
}

function printPlan(plan, options) {
  console.log(`[literal-i18n] init ${options.dryRun ? 'dry run' : 'plan'}`);
  console.log(`[literal-i18n] project: ${plan.project.isNext ? `Next.js${plan.project.nextMajor ? ` ${plan.project.nextMajor}` : ''}` : 'unknown'}`);
  if (plan.project.appDir) console.log(`[literal-i18n] app dir: ${plan.project.appDir}`);
  for (const warning of plan.warnings) console.warn(`[literal-i18n] warning: ${warning}`);
  for (const action of plan.actions) {
    const label = action.type === 'manual' ? 'manual' : action.type === 'skip' ? 'skip' : 'write';
    console.log(`[literal-i18n] ${label}: ${action.title}`);
    if (action.reason) console.log(`  reason: ${action.reason}`);
    if (action.suggestion) console.log(indent(action.suggestion));
  }
}

function indent(text) {
  return text.split('\n').map((line) => `  ${line}`).join('\n');
}

function applyAction(action, options) {
  if (action.type === 'skip' || action.type === 'manual') return;
  if (action.type === 'mkdir') {
    if (!options.dryRun) mkdirSync(action.dirPath, { recursive: true });
    return;
  }
  if (action.type === 'write-json') {
    if (!options.dryRun) writeJson(action.filePath, action.value);
    return;
  }

  const exists = existsSync(action.filePath);
  const canWrite = action.type === 'write-if-missing'
    ? !exists
    : !exists || action.overwrite || options.force;
  if (!canWrite) return;

  if (!options.dryRun) {
    mkdirSync(path.dirname(action.filePath), { recursive: true });
    writeFileSync(action.filePath, action.content);
  }
}

async function runInit(options) {
  const cwd = process.cwd();
  const plan = planInit(cwd, options);
  printPlan(plan, options);

  if (!options.yes && !options.dryRun) {
    console.log('[literal-i18n] no files written. Re-run with --yes to apply this plan.');
    console.log('[literal-i18n] recommended command: npx literal-i18n init --yes');
    return;
  }

  for (const action of plan.actions) {
    applyAction(action, options);
  }

  if (options.dryRun) {
    console.log('[literal-i18n] dry run complete. No files were written.');
  } else {
    console.log('[literal-i18n] init complete.');
  }
}

function runExtract(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [EXTRACT_BIN, ...args], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code) {
        reject(new Error(`literal-i18n extract exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function runGui(options) {
  if (options.port !== undefined) {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error('[literal-i18n] --port must be a number between 0 and 65535.');
    }
  }

  const { startGuiServer } = require('../src/gui-server.cjs');
  const result = await startGuiServer({
    cwd: process.cwd(),
    configPath: options.config,
    port: options.port,
  });
  console.log(`[literal-i18n] gui ready: ${result.url}`);

  await new Promise((resolve) => {
    const close = () => {
      result.server.close(() => resolve());
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'extract') {
    const extractArgs = process.argv.slice(3);
    await runExtract(extractArgs);
    return;
  }

  if (options.command === 'gui') {
    if (options.help) {
      printHelp();
      return;
    }
    await runGui(options);
    return;
  }

  if (options.help || options.command === 'help') {
    printHelp();
    return;
  }

  if (options.command === 'init') {
    await runInit(options);
    return;
  }

  throw new Error(`[literal-i18n] Unknown command: ${options.command}`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
