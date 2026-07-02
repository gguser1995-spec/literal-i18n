const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildRuntimeManifest,
  buildSourceArtifacts,
  extractFromSource,
} = require('../src/extract-core.cjs');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createTempProject(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `literal-i18n-${name}-`));
}

function recordsByText(records) {
  return new Set(records.map((record) => record.text));
}

async function testPropTranslatorExtraction() {
  const source = `import { T } from 'literal-i18n';

export function ComposerSidebar({ tr }) {
  const lyricPlaceholder = tr("[Verse]\\nThis is where you write your rhymes or give AI a structured idea.\\n\\n[Chorus]\\nKeep the hook short, memorable, and emotional.");
  const stylePlaceholder = tr('r&b funk, emo rap, optimistic, calm voice, bright guitar, warm bass');
  const titlePlaceholder = tr('Song Title (Optional)');

  return <textarea placeholder={lyricPlaceholder} aria-label={tr('Clear draft')} />;
}
`;
  const result = extractFromSource('src/app/[locale]/create/_components/studio-composer-sidebar.tsx', source, {
    importSources: ['literal-i18n'],
  });
  const texts = recordsByText(result.records);
  assert.equal(texts.has('[Verse]\nThis is where you write your rhymes or give AI a structured idea.\n\n[Chorus]\nKeep the hook short, memorable, and emotional.'), true);
  assert.equal(texts.has('r&b funk, emo rap, optimistic, calm voice, bright guitar, warm bass'), true);
  assert.equal(texts.has('Song Title (Optional)'), true);
  assert.equal(texts.has('Clear draft'), true);
}

async function testAliasImportRouteManifest() {
  const cwd = createTempProject('alias-route');
  try {
    fs.mkdirSync(path.join(cwd, 'src/components/layout'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src/components/layout/site-header.tsx'), '');

    const page = extractFromSource(
      'src/app/[locale]/page.tsx',
      `import { T } from 'literal-i18n';
import { SiteHeader } from '@/components/layout/site-header';

export default function Page() {
  return <><SiteHeader /><T text="Page title" /></>;
}
`,
      {
        cwd,
        sourceDirs: [path.join(cwd, 'src')],
        importSources: ['literal-i18n'],
      },
    );
    const header = extractFromSource(
      'src/components/layout/site-header.tsx',
      `import { T } from 'literal-i18n';

export function SiteHeader() {
  return <nav><T text="Ailume Music" /><T text="Workflow" /></nav>;
}
`,
      {
        cwd,
        sourceDirs: [path.join(cwd, 'src')],
        importSources: ['literal-i18n'],
      },
    );
    assert.deepEqual(page.imports, ['src/components/layout/site-header.tsx']);

    const manifest = buildRuntimeManifest({
      'src/app/[locale]/page.tsx': page,
      'src/components/layout/site-header.tsx': header,
    }, { keyMode: 'source' });
    assert.deepEqual(manifest.routes['/[locale]'], ['Ailume Music', 'Page title', 'Workflow']);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

async function testHashRuntimeContract() {
  const cwd = createTempProject('hash-runtime');
  try {
    const recordsByFile = {
      'src/app/[locale]/page.tsx': {
        records: [
          { text: 'Page title', kind: 'component', file: 'src/app/[locale]/page.tsx', line: 1, column: 1 },
        ],
        imports: ['src/components/layout/site-header.tsx'],
      },
      'src/components/layout/site-header.tsx': {
        records: [
          { text: 'Ailume Music', kind: 'component', file: 'src/components/layout/site-header.tsx', line: 1, column: 1 },
        ],
        imports: [],
      },
      'src/app/[locale]/about/page.tsx': {
        records: [
          { text: 'About only', kind: 'component', file: 'src/app/[locale]/about/page.tsx', line: 1, column: 1 },
        ],
        imports: [],
      },
      'src/app/[locale]/create/page.tsx': {
        records: [
          { text: 'Create only', kind: 'component', file: 'src/app/[locale]/create/page.tsx', line: 1, column: 1 },
        ],
        imports: [],
      },
      'src/app/admin/page.tsx': {
        records: [
          { text: 'Admin only', kind: 'component', file: 'src/app/admin/page.tsx', line: 1, column: 1 },
        ],
        imports: [],
      },
    };
    const options = {
      cwd,
      keyMode: 'hash',
      idPrefix: 'm_',
      idLength: 16,
    };
    const records = Object.values(recordsByFile).flatMap((entry) => entry.records);
    const artifacts = buildSourceArtifacts(records, options);
    const manifest = buildRuntimeManifest(recordsByFile, options);

    fs.mkdirSync(path.join(cwd, 'src/messages'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, 'literal-i18n.config.cjs'),
      `module.exports = {
  localeDir: 'src/messages',
  keyMode: 'source',
  idPrefix: 'm_',
  idLength: 16,
};
`,
    );
    writeJson(path.join(cwd, 'src/messages/zh.json'), Object.fromEntries(
      Object.entries(artifacts.sourceMessages).map(([key, value]) => [key, `zh:${value}`]),
    ));
    writeJson(path.join(cwd, 'src/messages/source-map.json'), artifacts.sourceMap);
    writeJson(path.join(cwd, 'src/messages/manifest.json'), manifest);

    const previousCwd = process.cwd();
    process.chdir(cwd);
    try {
      const server = await import(`../dist/server.js?test=${Date.now()}`);
      const props = await server.getI18nProviderProps('zh', { pathname: '/zh' });
      const pageKey = artifacts.sourceMap['Page title'];
      const headerKey = artifacts.sourceMap['Ailume Music'];
      const aboutKey = artifacts.sourceMap['About only'];
      const createKey = artifacts.sourceMap['Create only'];
      const adminKey = artifacts.sourceMap['Admin only'];

      assert.equal(props.keyMode, 'hash');
      assert.equal(props.idPrefix, 'm_');
      assert.equal(props.idLength, 16);
      assert.equal(props.sourceMap, undefined);
      assert.equal(props.messages[pageKey], 'zh:Page title');
      assert.equal(props.messages[headerKey], 'zh:Ailume Music');
      assert.equal(props.messages[aboutKey], undefined);
      assert.equal(props.messages[createKey], undefined);
      assert.equal(props.messages[adminKey], undefined);

      const explicitRouteProps = await server.getI18nProviderProps('zh', {
        pathname: '/zh',
        payloadScope: 'route',
      });
      assert.equal(explicitRouteProps.messages[pageKey], 'zh:Page title');
      assert.equal(explicitRouteProps.messages[headerKey], 'zh:Ailume Music');
      assert.equal(explicitRouteProps.messages[createKey], undefined);

      const navigationProps = await server.getI18nProviderProps('zh', {
        pathname: '/zh',
        payloadScope: 'navigation',
      });
      assert.equal(navigationProps.messages[pageKey], 'zh:Page title');
      assert.equal(navigationProps.messages[headerKey], 'zh:Ailume Music');
      assert.equal(navigationProps.messages[aboutKey], 'zh:About only');
      assert.equal(navigationProps.messages[createKey], 'zh:Create only');
      assert.equal(navigationProps.messages[adminKey], undefined);

      const routeResponse = await server.literalI18nMessagesGET(
        new Request('http://localhost/api/literal-i18n/messages?locale=zh&pathname=/zh/create'),
      );
      const routePayload = await routeResponse.json();
      assert.equal(routeResponse.status, 200);
      assert.equal(routeResponse.headers.get('cache-control'), 'no-store');
      assert.equal(routePayload.locale, 'zh');
      assert.equal(routePayload.messages[createKey], 'zh:Create only');
      assert.equal(routePayload.messages[pageKey], undefined);
      assert.equal(routePayload.messages[adminKey], undefined);
    } finally {
      process.chdir(previousCwd);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

async function testClientKeysWithoutNavigationPayload() {
  const cwd = createTempProject('client-keys');
  try {
    const recordsByFile = {
      'src/app/[locale]/page.tsx': {
        records: [
          { text: 'Home server title', kind: 'component', file: 'src/app/[locale]/page.tsx', line: 1, column: 1 },
        ],
        imports: [],
      },
      'src/app/[locale]/create/page.tsx': {
        records: [
          { text: 'Create server title', kind: 'component', file: 'src/app/[locale]/create/page.tsx', line: 1, column: 1 },
        ],
        imports: ['src/app/[locale]/create/client-panel.tsx'],
      },
      'src/app/[locale]/create/client-panel.tsx': {
        client: true,
        records: [
          { text: 'Create client action', kind: 'component', file: 'src/app/[locale]/create/client-panel.tsx', line: 1, column: 1 },
        ],
        imports: ['src/components/shared-client.tsx'],
      },
      'src/components/shared-client.tsx': {
        records: [
          { text: 'Shared client label', kind: 'component', file: 'src/components/shared-client.tsx', line: 1, column: 1 },
        ],
        imports: [],
      },
    };
    const options = {
      cwd,
      keyMode: 'hash',
      idPrefix: 'm_',
      idLength: 16,
    };
    const records = Object.values(recordsByFile).flatMap((entry) => entry.records);
    const artifacts = buildSourceArtifacts(records, options);
    const manifest = buildRuntimeManifest(recordsByFile, options);
    const translatedMessages = Object.fromEntries(
      Object.entries(artifacts.sourceMessages).map(([key, value]) => [key, `zh:${value}`]),
    );

    fs.mkdirSync(path.join(cwd, 'src/messages'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, 'literal-i18n.config.cjs'),
      `module.exports = {
  localeDir: 'src/messages',
  keyMode: 'hash',
  idPrefix: 'm_',
  idLength: 16,
};
`,
    );
    writeJson(path.join(cwd, 'src/messages/zh.json'), translatedMessages);
    writeJson(path.join(cwd, 'src/messages/source-map.json'), artifacts.sourceMap);
    writeJson(path.join(cwd, 'src/messages/manifest.json'), manifest);

    assert.deepEqual(manifest.clientKeys.sort(), [
      artifacts.sourceMap['Create client action'],
      artifacts.sourceMap['Shared client label'],
    ].sort());

    const previousCwd = process.cwd();
    process.chdir(cwd);
    try {
      const server = await import(`../dist/server.js?clientKeys=${Date.now()}`);
      const homeProps = await server.getI18nProviderProps('zh', { pathname: '/zh' });
      assert.equal(homeProps.messages[artifacts.sourceMap['Home server title']], 'zh:Home server title');
      assert.equal(homeProps.messages[artifacts.sourceMap['Create client action']], 'zh:Create client action');
      assert.equal(homeProps.messages[artifacts.sourceMap['Shared client label']], 'zh:Shared client label');
      assert.equal(homeProps.messages[artifacts.sourceMap['Create server title']], undefined);
    } finally {
      process.chdir(previousCwd);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

async function testClientRouteMessagesLoader() {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const requests = [];

  try {
    globalThis.window = {
      location: {
        origin: 'http://example.test',
      },
    };
    globalThis.fetch = async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        async json() {
          return {
            locale: 'zh',
            messages: {
              hello: '你好',
            },
          };
        },
      };
    };

    const client = await import(`../dist/client-loader.js?loader=${Date.now()}`);
    const payload = await client.loadMessages('zh', '/zh/create');

    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].url,
      'http://example.test/api/literal-i18n/messages?locale=zh&pathname=%2Fzh%2Fcreate',
    );
    assert.equal(requests[0].init.headers.accept, 'application/json');
    assert.deepEqual(payload, {
      locale: 'zh',
      messages: {
        hello: '你好',
      },
    });
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
    if (previousFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = previousFetch;
    }
  }
}

async function testPublicRuntimeFallback() {
  const cwd = createTempProject('public-runtime');
  try {
    const recordsByFile = {
      'src/app/[locale]/page.tsx': {
        records: [
          { text: 'Public title', kind: 'component', file: 'src/app/[locale]/page.tsx', line: 1, column: 1 },
        ],
        imports: [],
      },
    };
    const options = {
      cwd,
      keyMode: 'hash',
      idPrefix: 'm_',
      idLength: 16,
    };
    const records = Object.values(recordsByFile).flatMap((entry) => entry.records);
    const artifacts = buildSourceArtifacts(records, options);
    const manifest = buildRuntimeManifest(recordsByFile, options);
    const publicRuntimeDir = path.join(cwd, 'public/literal-i18n/messages');

    writeJson(path.join(publicRuntimeDir, 'zh.json'), Object.fromEntries(
      Object.entries(artifacts.sourceMessages).map(([key, value]) => [key, `zh:${value}`]),
    ));
    writeJson(path.join(publicRuntimeDir, 'source-map.json'), artifacts.sourceMap);
    writeJson(path.join(publicRuntimeDir, 'manifest.json'), manifest);

    const previousCwd = process.cwd();
    process.chdir(cwd);
    try {
      const server = await import(`../dist/server.js?publicRuntime=${Date.now()}`);
      const props = await server.getI18nProviderProps('zh', { pathname: '/zh' });
      const titleKey = artifacts.sourceMap['Public title'];
      assert.equal(props.messages[titleKey], 'zh:Public title');
    } finally {
      process.chdir(previousCwd);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

async function testProductionPublicRuntimePriority() {
  const cwd = createTempProject('public-runtime-priority');
  const previousEnv = process.env.NODE_ENV;
  try {
    const sourceMap = { 'Runtime title': 'm_runtime_title' };
    const manifest = {
      version: 1,
      files: {
        'src/app/[locale]/page.tsx': {
          keys: ['m_runtime_title'],
          route: { pattern: '/[locale]', kind: 'page' },
        },
      },
      routes: {
        '/[locale]': ['m_runtime_title'],
      },
    };

    writeJson(path.join(cwd, 'src/messages/zh.json'), {
      m_runtime_title: 'src:Runtime title',
    });
    writeJson(path.join(cwd, 'src/messages/source-map.json'), sourceMap);
    writeJson(path.join(cwd, 'src/messages/manifest.json'), manifest);
    writeJson(path.join(cwd, 'public/literal-i18n/messages/zh.json'), {
      m_runtime_title: 'public:Runtime title',
    });
    writeJson(path.join(cwd, 'public/literal-i18n/messages/source-map.json'), sourceMap);
    writeJson(path.join(cwd, 'public/literal-i18n/messages/manifest.json'), manifest);

    const previousCwd = process.cwd();
    process.chdir(cwd);
    try {
      const server = await import(`../dist/server.js?publicRuntimePriority=${Date.now()}`);

      process.env.NODE_ENV = 'development';
      const devProps = await server.getI18nProviderProps('zh', { pathname: '/zh' });
      assert.equal(devProps.messages.m_runtime_title, 'src:Runtime title');

      process.env.NODE_ENV = 'production';
      const productionProps = await server.getI18nProviderProps('zh', { pathname: '/zh' });
      assert.equal(productionProps.messages.m_runtime_title, 'public:Runtime title');
    } finally {
      process.chdir(previousCwd);
    }
  } finally {
    if (previousEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousEnv;
    }
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function createMockCompiler(context) {
  return {
    context,
    hooks: {
      beforeRun: {
        handler: undefined,
        tapPromise(_name, handler) {
          this.handler = handler;
        },
      },
      watchRun: {
        tapPromise() {},
      },
      afterCompile: {
        tap(_name, handler) {
          handler({ contextDependencies: new Set() });
        },
      },
    },
  };
}

async function testNextPluginDevWatchFallback() {
  const watcherCwd = createTempProject('dev-watch-intended');
  const compilerCwd = createTempProject('dev-watch-compiler');
  const originalArgv = process.argv.slice();
  try {
    process.argv.push('dev');
    fs.mkdirSync(path.join(watcherCwd, 'src'), { recursive: true });
    fs.mkdirSync(path.join(compilerCwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(watcherCwd, 'literal-i18n.config.cjs'), 'module.exports = {};\n');
    writeJson(path.join(watcherCwd, 'src/messages/en.json'), {
      copied_from_config_load: 'Copied from config load',
    });
    writeJson(path.join(watcherCwd, 'artifacts/source-map.json'), {
      'Copied from config load': 'copied_from_config_load',
    });
    writeJson(path.join(watcherCwd, 'artifacts/manifest.json'), {
      version: 1,
      routes: {},
      files: {},
    });

    const withLiteralI18n = require('../src/next-plugin.cjs');
    const config = withLiteralI18n({
      outputFileTracingIncludes: {
        '/*': ['./existing/**/*.json'],
        '/api/custom': ['./custom/**/*.txt'],
      },
    }, {
      cwd: watcherCwd,
      devWatch: true,
      keyMode: 'hash',
      locales: ['en'],
      silent: true,
      sourceDir: 'src',
      sourceLocale: 'en',
      sourceMapOutput: 'artifacts/source-map.json',
      manifestOutput: 'artifacts/manifest.json',
      sourceOutput: 'src/messages/en.json',
    });
    assert.deepEqual(config.outputFileTracingIncludes['/*'], [
      './existing/**/*.json',
    ]);
    assert.deepEqual(config.outputFileTracingIncludes['/api/custom'], ['./custom/**/*.txt']);
    assert.equal(
      fs.existsSync(path.join(watcherCwd, 'public/literal-i18n/messages/en.json')),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(watcherCwd, 'public/literal-i18n/messages/source-map.json')),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(watcherCwd, 'public/literal-i18n/messages/manifest.json')),
      true,
    );

    const webpackConfig = config.webpack({ plugins: [] }, { dir: compilerCwd });
    assert.equal(webpackConfig.plugins.length, 1);
    assert.equal(webpackConfig.plugins[0].skipWebpackWatchExtraction, false);
    const compiler = createMockCompiler(compilerCwd);
    webpackConfig.plugins[0].apply(compiler);
    await compiler.hooks.beforeRun.handler();
    assert.equal(
      fs.existsSync(path.join(compilerCwd, 'public/literal-i18n/messages/en.json')),
      true,
    );

    const disabledConfig = withLiteralI18n({}, {
      cwd: compilerCwd,
      configPath: 'config/literal-i18n.runtime.cjs',
      devWatch: false,
      localeDir: 'app/i18n',
      publicRuntime: false,
      sourceDir: 'src',
      sourceLocale: 'en',
      locales: ['en'],
    });
    assert.deepEqual(disabledConfig.outputFileTracingIncludes['/*'], [
      './app/i18n/**/*.json',
      './config/literal-i18n.runtime.cjs',
    ]);

    const disabledWebpackConfig = disabledConfig.webpack({ plugins: [] }, { dir: compilerCwd });
    assert.equal(disabledWebpackConfig.plugins[0].skipWebpackWatchExtraction, true);
  } finally {
    process.argv.length = 0;
    process.argv.push(...originalArgv);
    fs.rmSync(watcherCwd, { recursive: true, force: true });
    fs.rmSync(compilerCwd, { recursive: true, force: true });
  }
}

(async () => {
  await testPropTranslatorExtraction();
  console.log('[literal-i18n] runtime acceptance 1/8 passed: prop translator extraction');
  await testAliasImportRouteManifest();
  console.log('[literal-i18n] runtime acceptance 2/8 passed: alias import route manifest');
  await testHashRuntimeContract();
  console.log('[literal-i18n] runtime acceptance 3/8 passed: hash runtime contract');
  await testClientKeysWithoutNavigationPayload();
  console.log('[literal-i18n] runtime acceptance 4/8 passed: client keys without navigation payload');
  await testClientRouteMessagesLoader();
  console.log('[literal-i18n] runtime acceptance 5/8 passed: client route messages loader');
  await testPublicRuntimeFallback();
  console.log('[literal-i18n] runtime acceptance 6/8 passed: public runtime fallback');
  await testProductionPublicRuntimePriority();
  console.log('[literal-i18n] runtime acceptance 7/8 passed: production public runtime priority');
  await testNextPluginDevWatchFallback();
  console.log('[literal-i18n] runtime acceptance 8/8 passed: dev watch webpack fallback');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
