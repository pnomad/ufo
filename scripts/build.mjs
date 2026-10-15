// Bundles src/ into one self-contained index.html (works offline, double-click to open).
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const out = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = await readFile('src/index.html', 'utf8');
const result = html.replace('<script>/*__BUNDLE__*/</script>', () => `<script>${js}</script>`);
await writeFile('index.html', result);
console.log(`index.html written (${(result.length / 1024).toFixed(0)} KB)`);
