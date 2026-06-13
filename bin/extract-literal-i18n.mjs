#!/usr/bin/env node

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true, console, true);
loadLiteralI18nDevelopmentEnv();
const require = createRequire(import.meta.url);
const { LiteralI18nExtractor } = require('../src/extract-core.cjs');

function loadLiteralI18nDevelopmentEnv() {
  const envPath = '.env.development';
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

async function main() {
  const outputArgIndex = process.argv.findIndex((arg) => arg === '--out');
  const sourceMapOutputArgIndex = process.argv.findIndex((arg) => arg === '--source-map-out');
  const keyModeArgIndex = process.argv.findIndex((arg) => arg === '--key-mode');
  const sourceDir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'src';
  const sourceOutput = outputArgIndex >= 0 ? process.argv[outputArgIndex + 1] : undefined;
  const extractor = new LiteralI18nExtractor({
    sourceDir,
    sourceOutput,
    sourceMapOutput: sourceMapOutputArgIndex >= 0
      ? process.argv[sourceMapOutputArgIndex + 1]
      : 'src/messages/source-map.json',
    keyMode: keyModeArgIndex >= 0
      ? process.argv[keyModeArgIndex + 1]
      : process.env.NEXT_PUBLIC_LITERAL_I18N_KEY_MODE,
    idPrefix: process.env.NEXT_PUBLIC_LITERAL_I18N_ID_PREFIX,
    idLength: process.env.NEXT_PUBLIC_LITERAL_I18N_ID_LENGTH,
  });

  await extractor.fullScan('cli');
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
