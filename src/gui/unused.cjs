const path = require('node:path');
const {
  assertJsonFileInside,
  isRecord,
  mergeJsonFile,
  normalizeSlash,
  readJson,
} = require('./write-json.cjs');
const { localeOutputPath } = require('./project.cjs');

function relativeFile(project, filePath) {
  return normalizeSlash(path.relative(project.cwd, filePath));
}

function sourceMapRelativePath(project) {
  return project.options.sourceMapOutput
    ? relativeFile(project, project.options.sourceMapOutput)
    : undefined;
}

function localeType(project, locale) {
  return locale === project.options.sourceLocale ? 'sourceLocale' : 'targetLocale';
}

function listUnused(project) {
  if (!project.ast.hasAstCache) {
    return {
      validKeyCount: 0,
      astCacheMissing: true,
      items: [],
    };
  }

  const items = [];
  for (const locale of project.options.locales) {
    const filePath = localeOutputPath(project.options, locale);
    const messages = readJson(filePath, {});
    if (!isRecord(messages)) continue;

    for (const [key, value] of Object.entries(messages)) {
      if (project.ast.validKeys.has(key)) continue;
      items.push({
        file: relativeFile(project, filePath),
        type: localeType(project, locale),
        locale,
        key,
        value: typeof value === 'string' ? value : String(value),
        canDelete: true,
      });
    }
  }

  if (project.options.sourceMapOutput) {
    const sourceMap = readJson(project.options.sourceMapOutput, {});
    if (isRecord(sourceMap)) {
      for (const [key, value] of Object.entries(sourceMap)) {
        if (typeof value !== 'string' || project.ast.validKeys.has(value)) continue;
        items.push({
          file: sourceMapRelativePath(project),
          type: 'sourceMap',
          key,
          value,
          canDelete: true,
        });
      }
    }
  }

  return {
    validKeyCount: project.ast.validKeys.size,
    astCacheMissing: false,
    items,
  };
}

function resolveProjectJsonFile(project, file) {
  const filePath = path.isAbsolute(file) ? file : path.resolve(project.cwd, file);
  return assertJsonFileInside(filePath, project.options.localeDir);
}

function isSourceMapFile(project, filePath) {
  return project.options.sourceMapOutput && path.resolve(filePath) === path.resolve(project.options.sourceMapOutput);
}

function deleteUnusedItem(project, item) {
  if (!project.ast.hasAstCache) {
    const error = new Error('AST cache is missing. Run extract before deleting unused keys.');
    error.code = 'AST_CACHE_MISSING';
    throw error;
  }

  const key = String(item.key || '');
  if (!key) {
    const error = new Error('Missing key.');
    error.code = 'MISSING_KEY';
    throw error;
  }

  const filePath = resolveProjectJsonFile(project, item.file || '');
  const sourceMapFile = isSourceMapFile(project, filePath);
  const current = readJson(filePath, {});
  if (!isRecord(current) || !(key in current)) {
    return {
      deleted: false,
      skipped: true,
      reason: 'KEY_NOT_FOUND',
      file: relativeFile(project, filePath),
      key,
    };
  }

  if (sourceMapFile) {
    const value = current[key];
    if (typeof value === 'string' && project.ast.validKeys.has(value)) {
      const error = new Error('Cannot delete a source-map entry whose message key exists in AST.');
      error.code = 'KEY_STILL_IN_AST';
      throw error;
    }
  } else if (project.ast.validKeys.has(key)) {
    const error = new Error('Cannot delete a message key that exists in AST.');
    error.code = 'KEY_STILL_IN_AST';
    throw error;
  }

  const result = mergeJsonFile(filePath, (next) => {
    delete next[key];
    return next;
  });

  return {
    deleted: true,
    changed: result.changed,
    file: relativeFile(project, filePath),
    key,
  };
}

function deleteUnusedItems(project, items) {
  const deleted = [];
  const skipped = [];

  for (const item of Array.isArray(items) ? items : []) {
    try {
      const result = deleteUnusedItem(project, item);
      if (result.deleted) {
        deleted.push(result);
      } else {
        skipped.push(result);
      }
    } catch (error) {
      skipped.push({
        file: item && item.file,
        key: item && item.key,
        skipped: true,
        reason: error.code || 'DELETE_FAILED',
        message: error.message,
      });
    }
  }

  return { deleted, skipped };
}

module.exports = {
  deleteUnusedItem,
  deleteUnusedItems,
  listUnused,
};
