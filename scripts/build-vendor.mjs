import { build } from 'esbuild';
import { readFile, readdir, writeFile } from 'node:fs/promises';

const result = await build({
  stdin: { contents: 'export { createClient } from "@supabase/supabase-js";', resolveDir: process.cwd() },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/assets/supabase.mjs',
  minify: true,
  legalComments: 'inline',
  metafile: true,
});

const packageRoots = new Set(Object.keys(result.metafile.inputs)
  .map(file => file.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)?.[1])
  .filter(Boolean));
const notices = [];
for (const root of packageRoots) {
  const metadata = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  const licenseFile = (await readdir(root)).find(name => /^licen[sc]e(?:\.|$)/i.test(name));
  if (!licenseFile) throw new Error(`Licença não encontrada para ${metadata.name}.`);
  const license = (await readFile(`${root}/${licenseFile}`, 'utf8')).replace(/\r\n/g, '\n');
  notices.push(`${metadata.name} ${metadata.version}\n\n${license}`);
}
await writeFile('dist/assets/supabase-LICENSES.txt', notices.join('\n\n'), 'utf8');
