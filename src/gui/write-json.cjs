const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath, fallback = {}) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSlash(filePath) {
  return filePath.split(path.sep).join('/');
}

function assertJsonFileInside(filePath, baseDir) {
  const absoluteFile = path.resolve(filePath);
  const absoluteBase = path.resolve(baseDir);
  const relative = path.relative(absoluteBase, absoluteFile);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('File path is outside localeDir.');
    error.code = 'PATH_OUTSIDE_LOCALE_DIR';
    throw error;
  }

  if (path.extname(absoluteFile) !== '.json') {
    const error = new Error('Only JSON files can be modified.');
    error.code = 'INVALID_JSON_FILE';
    throw error;
  }

  return absoluteFile;
}

function writeJsonStableAtomic(filePath, value) {
  const nextContent = `${JSON.stringify(value, null, 2)}\n`;
  const currentContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : undefined;
  if (currentContent === nextContent) return false;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(tempPath, nextContent);
  fs.renameSync(tempPath, filePath);
  return true;
}

function mergeJsonFile(filePath, updater) {
  const current = readJson(filePath, {});
  const base = isRecord(current) ? current : {};
  const next = updater({ ...base }, base);
  if (!isRecord(next)) {
    const error = new Error('JSON updater must return an object.');
    error.code = 'INVALID_JSON_UPDATE';
    throw error;
  }

  return {
    changed: writeJsonStableAtomic(filePath, next),
    value: next,
  };
}

module.exports = {
  assertJsonFileInside,
  isRecord,
  mergeJsonFile,
  normalizeSlash,
  readJson,
  writeJsonStableAtomic,
};
