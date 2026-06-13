const fs = require('node:fs');
const file = 'dist/index.js';
const content = fs.readFileSync(file, 'utf8');
if (!content.startsWith('"use client";') && !content.startsWith("'use client';")) {
  fs.writeFileSync(file, `'use client';\n${content}`);
}
