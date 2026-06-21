const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildRuntimeManifest,
  buildSourceArtifacts,
  extractFromSource,
} = require('../src/extract-core.cjs');
const { loadProject } = require('../src/gui/project.cjs');
const { queryProject } = require('../src/gui/query.cjs');
const { retranslateKey } = require('../src/gui/retranslate.cjs');
const { deleteUnusedItem, deleteUnusedItems, listUnused } = require('../src/gui/unused.cjs');
const { clearLocaleKey, saveLocaleEntries, startGuiServer } = require('../src/gui-server.cjs');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createFixture(keyMode = 'hash') {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `literal-i18n-gui-${keyMode}-`));
  const recordsByFile = {
    'src/app/[locale]/layout.tsx': {
      records: [
        { text: 'Layout label', kind: 'component', file: 'src/app/[locale]/layout.tsx', line: 1, column: 1 },
      ],
      imports: [],
    },
    'src/components/shared.tsx': {
      records: [
        { text: 'Shared component', kind: 'component', file: 'src/components/shared.tsx', line: 2, column: 3 },
      ],
      imports: [],
    },
    'src/app/[locale]/page.tsx': {
      records: [
        { text: 'Hello World', kind: 'component', file: 'src/app/[locale]/page.tsx', line: 3, column: 5 },
        { text: '你好 Name', kind: 'component', file: 'src/app/[locale]/page.tsx', line: 4, column: 5 },
      ],
      imports: ['src/components/shared.tsx'],
    },
  };
  const options = {
    cwd,
    keyMode,
    idPrefix: 'm_',
    idLength: 16,
    sourceLocale: 'en',
    locales: ['en', 'zh'],
  };
  const records = Object.values(recordsByFile).flatMap((entry) => entry.records);
  const artifacts = buildSourceArtifacts(records, options);
  const manifest = buildRuntimeManifest(recordsByFile, options);
  const helloKey = artifacts.sourceMap['Hello World'];
  const layoutKey = artifacts.sourceMap['Layout label'];
  const sharedKey = artifacts.sourceMap['Shared component'];
  const mixedKey = artifacts.sourceMap['你好 Name'];

  fs.mkdirSync(path.join(cwd, 'src/messages'), { recursive: true });
  writeJson(path.join(cwd, '.next/cache/literal-i18n/extracted-by-file.json'), { files: recordsByFile });
  writeJson(path.join(cwd, 'src/messages/en.json'), {
    ...artifacts.sourceMessages,
    stale_en: 'Old English',
  });
  writeJson(path.join(cwd, 'src/messages/source-map.json'), {
    ...artifacts.sourceMap,
    'Old source': 'stale_source_map_key',
  });
  writeJson(path.join(cwd, 'src/messages/manifest.json'), manifest);
  writeJson(path.join(cwd, 'src/messages/zh.json'), {
    [helloKey]: '你好世界',
    [layoutKey]: 'Layout label',
    [sharedKey]: '',
    [mixedKey]: '你好 Name',
    stale_zh: '旧值',
  });
  fs.writeFileSync(
    path.join(cwd, 'literal-i18n.config.cjs'),
    `module.exports = {
  sourceDir: 'src',
  sourceOutput: 'src/messages/en.json',
  sourceMapOutput: 'src/messages/source-map.json',
  localeDir: 'src/messages',
  locales: ['en', 'zh'],
  sourceLocale: 'en',
  keyMode: '${keyMode}',
  idPrefix: 'm_',
  idLength: 16,
  translateJsonHook: async ({ missingMessages }) => {
    return Object.fromEntries(missingMessages.map((item) => [item.key, 'translated:' + item.text]));
  },
};
`,
  );

  return {
    cwd,
    keys: { helloKey, layoutKey, mixedKey, sharedKey },
  };
}

async function roundOneDataCorrectness() {
  const aliasCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'literal-i18n-alias-'));
  fs.mkdirSync(path.join(aliasCwd, 'src/components/layout'), { recursive: true });
  fs.writeFileSync(path.join(aliasCwd, 'src/components/layout/site-header.tsx'), '');
  const aliasResult = extractFromSource(
    'src/app/[locale]/page.tsx',
    `import { T } from 'literal-i18n';
import { SiteHeader } from '@/components/layout/site-header';

export default function Page() {
  return <><SiteHeader /><T text="Page" /></>;
}
`,
    {
      cwd: aliasCwd,
      sourceDirs: [path.join(aliasCwd, 'src')],
      importSources: ['literal-i18n'],
    },
  );
  assert.deepEqual(aliasResult.imports, ['src/components/layout/site-header.tsx']);
  fs.rmSync(aliasCwd, { recursive: true, force: true });

  const hashFixture = createFixture('hash');
  const project = await loadProject({ cwd: hashFixture.cwd });
  assert.equal(project.ast.validKeys.has(hashFixture.keys.helloKey), true);

  const routeQuery = queryProject(project, { locale: 'zh', url: '/zh' });
  const routeKeys = new Set(routeQuery.localeRows.map((row) => row.key));
  assert.equal(routeKeys.has(hashFixture.keys.helloKey), true);
  assert.equal(routeKeys.has(hashFixture.keys.sharedKey), true);
  assert.equal(routeKeys.has(hashFixture.keys.layoutKey), true);

  const sourceQuery = queryProject(project, { locale: 'zh', source: '<T text="Hello World" />' });
  assert.deepEqual(sourceQuery.localeRows.map((row) => row.key), [hashFixture.keys.helloKey]);

  const mixedQuery = queryProject(project, { locale: 'zh', literalLanguage: 'mixed' });
  assert.equal(mixedQuery.localeRows.some((row) => row.key === hashFixture.keys.mixedKey), true);

  const unused = listUnused(project);
  assert.equal(unused.items.some((item) => item.type === 'sourceMap' && item.key === 'Old source'), true);
  assert.equal(unused.items.some((item) => item.type === 'sourceLocale' && item.key === 'stale_en'), true);
  assert.equal(unused.items.some((item) => item.type === 'targetLocale' && item.key === 'stale_zh'), true);
  assert.equal(unused.items.some((item) => item.key === hashFixture.keys.sharedKey), false);

  const sourceFixture = createFixture('source');
  const sourceProject = await loadProject({ cwd: sourceFixture.cwd });
  const sourceModeQuery = queryProject(sourceProject, { locale: 'zh', key: 'Hello World' });
  assert.equal(sourceModeQuery.localeRows.length, 1);
  assert.equal(sourceModeQuery.localeRows[0].key, 'Hello World');
  fs.rmSync(hashFixture.cwd, { recursive: true, force: true });
  fs.rmSync(sourceFixture.cwd, { recursive: true, force: true });
}

async function roundTwoWriteSafety() {
  const fixture = createFixture('hash');
  let project = await loadProject({ cwd: fixture.cwd });

  assert.throws(
    () => deleteUnusedItem(project, { file: 'src/messages/zh.json', key: fixture.keys.helloKey }),
    /Cannot delete/,
  );

  const clearResult = clearLocaleKey(project, { locale: 'zh', key: fixture.keys.helloKey });
  assert.equal(clearResult.changed, true);
  assert.equal(readJson(path.join(fixture.cwd, 'src/messages/zh.json'))[fixture.keys.helloKey], '');

  const saveResult = saveLocaleEntries(project, {
    locale: 'zh',
    entries: { [fixture.keys.helloKey]: '保存后的值' },
  });
  assert.deepEqual(saveResult.updatedKeys, [fixture.keys.helloKey]);
  assert.equal(readJson(path.join(fixture.cwd, 'src/messages/zh.json'))[fixture.keys.helloKey], '保存后的值');

  assert.throws(
    () => saveLocaleEntries(project, { locale: 'en', entries: { [fixture.keys.helloKey]: 'x' } }),
    /readonly/,
  );

  assert.throws(
    () => deleteUnusedItem(project, { file: '../secret.json', key: 'stale_zh' }),
    /outside localeDir/,
  );

  const deleted = deleteUnusedItem(project, { file: 'src/messages/zh.json', key: 'stale_zh' });
  assert.equal(deleted.deleted, true);
  assert.equal('stale_zh' in readJson(path.join(fixture.cwd, 'src/messages/zh.json')), false);

  const batch = deleteUnusedItems(project, [
    { file: 'src/messages/en.json', key: 'stale_en' },
    { file: 'src/messages/source-map.json', key: 'Old source' },
    { file: 'src/messages/zh.json', key: fixture.keys.layoutKey },
  ]);
  assert.equal(batch.deleted.length, 2);
  assert.equal(batch.skipped.length, 1);

  project = await loadProject({ cwd: fixture.cwd });
  const translated = await retranslateKey(project, { locale: 'zh', key: fixture.keys.helloKey });
  assert.equal(translated.translated, 'translated:Hello World');

  project.config.translateJsonHook = async () => ({});
  await assert.rejects(
    () => retranslateKey(project, { locale: 'zh', key: fixture.keys.helloKey }),
    /did not return/,
  );
  assert.equal(readJson(path.join(fixture.cwd, 'src/messages/zh.json'))[fixture.keys.helloKey], 'translated:Hello World');

  fs.rmSync(fixture.cwd, { recursive: true, force: true });
}

async function roundThreeHttpGui() {
  const fixture = createFixture('hash');
  const started = await startGuiServer({ cwd: fixture.cwd, port: 0 });

  try {
    const rootResponse = await fetch(started.url);
    assert.equal(rootResponse.status, 200);
    const rootHtml = await rootResponse.text();
    assert.match(rootHtml, /source-map\.json/);
    assert.match(rootHtml, /compact-table/);
    assert.match(rootHtml, /compact-textarea/);
    assert.match(rootHtml, /data-collapse-target="localeSection"/);

    const projectResponse = await fetch(`${started.url}/api/project`);
    const projectJson = await projectResponse.json();
    assert.equal(projectJson.ok, true);
    assert.equal(JSON.stringify(projectJson).includes('translated:'), false);

    const queryResponse = await fetch(`${started.url}/api/query?locale=zh&source=${encodeURIComponent('<T text="Hello World" />')}`);
    const queryJson = await queryResponse.json();
    assert.equal(queryJson.ok, true);
    assert.equal(queryJson.data.localeRows.length, 1);
    assert.equal(queryJson.data.localeRows[0].key, fixture.keys.helloKey);

    const forgedDelete = await fetch(`${started.url}/api/unused/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: 'src/messages/zh.json', key: fixture.keys.helloKey }),
    });
    assert.equal(forgedDelete.status, 403);

    const clearResponse = await fetch(`${started.url}/api/locale/clear`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'zh', key: fixture.keys.helloKey }),
    });
    assert.equal(clearResponse.status, 200);
    assert.equal(readJson(path.join(fixture.cwd, 'src/messages/zh.json'))[fixture.keys.helloKey], '');
  } finally {
    await new Promise((resolve) => started.server.close(resolve));
    fs.rmSync(fixture.cwd, { recursive: true, force: true });
  }
}

(async () => {
  await roundOneDataCorrectness();
  console.log('[literal-i18n] gui acceptance 1/3 passed: data correctness');
  await roundTwoWriteSafety();
  console.log('[literal-i18n] gui acceptance 2/3 passed: write safety');
  await roundThreeHttpGui();
  console.log('[literal-i18n] gui acceptance 3/3 passed: http gui');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
