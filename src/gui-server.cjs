const http = require('node:http');
const { LiteralI18nExtractor } = require('./extract-core.cjs');
const { loadProject, localeOutputPath, projectPublicInfo } = require('./gui/project.cjs');
const { queryProject } = require('./gui/query.cjs');
const { retranslateKey } = require('./gui/retranslate.cjs');
const { renderStaticPage } = require('./gui/static-page.cjs');
const { deleteUnusedItem, deleteUnusedItems, listUnused } = require('./gui/unused.cjs');
const { isRecord, mergeJsonFile } = require('./gui/write-json.cjs');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3699;

function jsonResponse(response, statusCode, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

function htmlResponse(response, body) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

function sendOk(response, data) {
  jsonResponse(response, 200, { ok: true, data });
}

function sendError(response, error) {
  const statusCode = error.statusCode || statusCodeForError(error);
  jsonResponse(response, statusCode, {
    ok: false,
    error: error.code || 'INTERNAL_ERROR',
    message: error.message || 'Internal error',
  });
}

function statusCodeForError(error) {
  if (error.code === 'PATH_OUTSIDE_LOCALE_DIR') return 400;
  if (error.code === 'INVALID_JSON_FILE') return 400;
  if (error.code === 'UNKNOWN_LOCALE') return 400;
  if (error.code === 'SOURCE_LOCALE_READONLY') return 403;
  if (error.code === 'KEY_NOT_IN_AST') return 403;
  if (error.code === 'KEY_STILL_IN_AST') return 403;
  if (error.code === 'AST_CACHE_MISSING') return 409;
  if (error.code === 'TRANSLATE_JSON_HOOK_MISSING') return 422;
  if (error.code === 'TRANSLATION_MISSING') return 422;
  return 500;
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        const error = new Error('Request body is too large.');
        error.code = 'BODY_TOO_LARGE';
        reject(error);
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        const error = new Error('Request body must be valid JSON.');
        error.code = 'INVALID_JSON_BODY';
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function assertLocale(project, locale) {
  if (!project.options.locales.includes(locale)) {
    const error = new Error('Unknown locale.');
    error.code = 'UNKNOWN_LOCALE';
    throw error;
  }
}

function assertTargetLocale(project, locale) {
  assertLocale(project, locale);
  if (locale === project.options.sourceLocale) {
    const error = new Error('Source locale is readonly.');
    error.code = 'SOURCE_LOCALE_READONLY';
    throw error;
  }
}

function assertAstKey(project, key) {
  if (!project.ast.validKeys.has(key)) {
    const error = new Error('Key is not present in AST.');
    error.code = 'KEY_NOT_IN_AST';
    throw error;
  }
}

function saveLocaleEntries(project, input) {
  const locale = String(input.locale || '');
  const entries = isRecord(input.entries) ? input.entries : {};
  assertTargetLocale(project, locale);

  const normalizedEntries = {};
  for (const [key, value] of Object.entries(entries)) {
    assertAstKey(project, key);
    normalizedEntries[key] = typeof value === 'string' ? value : String(value ?? '');
  }

  const outputPath = localeOutputPath(project.options, locale);
  const result = mergeJsonFile(outputPath, (next) => {
    for (const [key, value] of Object.entries(normalizedEntries)) {
      next[key] = value;
    }
    return next;
  });

  return {
    locale,
    changed: result.changed,
    updatedKeys: Object.keys(normalizedEntries),
  };
}

function clearLocaleKey(project, input) {
  const locale = String(input.locale || '');
  const key = String(input.key || '');
  assertTargetLocale(project, locale);
  assertAstKey(project, key);

  const outputPath = localeOutputPath(project.options, locale);
  const result = mergeJsonFile(outputPath, (next) => {
    next[key] = '';
    return next;
  });

  return {
    locale,
    key,
    changed: result.changed,
  };
}

async function extractProject(project) {
  const extractor = new LiteralI18nExtractor(project.options);
  const result = await extractor.fullScan('gui');
  return {
    count: result.count,
    sourceChanged: result.sourceChanged,
    sourceMapChanged: result.sourceMapChanged,
    manifestChanged: result.manifestChanged,
    localeResults: result.localeResults,
    warnings: result.warnings,
  };
}

async function handleApi(request, response, url, options) {
  if (request.method === 'GET' && url.pathname === '/api/project') {
    const project = await loadProject(options);
    sendOk(response, projectPublicInfo(project));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/query') {
    const project = await loadProject(options);
    const input = Object.fromEntries(url.searchParams.entries());
    if (input.locale) assertLocale(project, input.locale);
    sendOk(response, queryProject(project, input));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/unused') {
    const project = await loadProject(options);
    sendOk(response, listUnused(project));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/locale/save') {
    const project = await loadProject(options);
    sendOk(response, saveLocaleEntries(project, await parseBody(request)));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/locale/clear') {
    const project = await loadProject(options);
    sendOk(response, clearLocaleKey(project, await parseBody(request)));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/locale/retranslate') {
    const project = await loadProject(options);
    sendOk(response, await retranslateKey(project, await parseBody(request)));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/unused/delete') {
    const project = await loadProject(options);
    sendOk(response, deleteUnusedItem(project, await parseBody(request)));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/unused/delete-selected') {
    const project = await loadProject(options);
    const body = await parseBody(request);
    sendOk(response, deleteUnusedItems(project, body.items));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/extract') {
    const project = await loadProject(options);
    sendOk(response, await extractProject(project));
    return;
  }

  const error = new Error('API route not found.');
  error.code = 'NOT_FOUND';
  error.statusCode = 404;
  throw error;
}

function createGuiServer(options = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${DEFAULT_HOST}`);
      if (url.pathname === '/' && request.method === 'GET') {
        htmlResponse(response, renderStaticPage());
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        await handleApi(request, response, url, options);
        return;
      }

      const error = new Error('Route not found.');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    } catch (error) {
      sendError(response, error);
    }
  });
}

function startGuiServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port ?? DEFAULT_PORT);
  const server = createGuiServer(options);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve({
        server,
        host,
        port: server.address().port,
        url: `http://${host}:${server.address().port}`,
      });
    });
  });
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  clearLocaleKey,
  createGuiServer,
  saveLocaleEntries,
  startGuiServer,
};
