const fs = require('node:fs');

function preserveUseClient(file) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.startsWith("'use client';")) {
    fs.writeFileSync(file, `"use client";${content.slice("'use client';".length)}`);
    return;
  }
  if (!content.startsWith('"use client";')) {
    fs.writeFileSync(file, `"use client";\n${content}`);
  }
}

preserveUseClient('dist/index.js');

for (const file of fs.readdirSync('dist')) {
  if (!file.endsWith('.js')) continue;
  const filePath = `dist/${file}`;
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('// src/context.tsx')) {
    preserveUseClient(filePath);
  }
}
