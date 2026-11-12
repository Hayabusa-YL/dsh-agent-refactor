import fs from 'node:fs';
const code = fs.readFileSync('tmp/corpus/unplugin-auto-import/examples/vite-svelte/vite.config.ts', 'utf8');
const re = /['"`]([^'"`\n]{1,120})['"`]/g;
const toks = [...code.matchAll(re)].map((m) => m[1].trim());
console.log('tokens:', toks);
console.log('hit:', toks.includes('detect-browser-es'));
