import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
}
const rows = await Promise.all((await files('dist')).map(async path => {
  const buffer = await readFile(path);
  return { file: relative('dist', path).replaceAll('\\', '/'), bytes: buffer.byteLength, gzipBytes: gzipSync(buffer).byteLength };
}));
const report = { measuredAt: new Date().toISOString(), methodology: 'All dist files separately gzip compressed; includes notices and HTML. Transfer depends on host compression.', files: rows, bytes: rows.reduce((sum, row) => sum + row.bytes, 0), gzipBytes: rows.reduce((sum, row) => sum + row.gzipBytes, 0), budgetBytes: 5 * 1024 * 1024 };
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/build-metrics.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.gzipBytes > report.budgetBytes) process.exitCode = 1;
