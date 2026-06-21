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
      assert.equal(props.messages[aboutKey], 'zh:About only');
      assert.equal(props.messages[createKey], 'zh:Create only');
      assert.equal(props.messages[adminKey], undefined);

      const routeOnlyProps = await server.getI18nProviderProps('zh', {
        pathname: '/zh',
        payloadScope: 'route',
      });
      assert.equal(routeOnlyProps.messages[pageKey], 'zh:Page title');
      assert.equal(routeOnlyProps.messages[headerKey], 'zh:Ailume Music');
      assert.equal(routeOnlyProps.messages[createKey], undefined);
    } finally {
      process.chdir(previousCwd);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

(async () => {
  await testPropTranslatorExtraction();
  console.log('[literal-i18n] runtime acceptance 1/3 passed: prop translator extraction');
  await testAliasImportRouteManifest();
  console.log('[literal-i18n] runtime acceptance 2/3 passed: alias import route manifest');
  await testHashRuntimeContract();
  console.log('[literal-i18n] runtime acceptance 3/3 passed: hash runtime contract');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
