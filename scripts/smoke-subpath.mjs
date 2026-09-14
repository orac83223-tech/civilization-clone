import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve('dist'); const prefix = '/civilization-clone/';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (!path.startsWith(prefix)) { response.writeHead(404); response.end(); return; }
    const file = resolve(root, path.slice(prefix.length) || 'index.html');
    if (!file.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); const url = `http://127.0.0.1:${address.port}${prefix}`;
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; const assets = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/assets/')) assets.push({ url: response.url().replace(url, prefix), status: response.status() }); if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const response = await page.goto(url);
  if (response?.status() !== 200) throw new Error(`Subpath HTTP ${response?.status()}`);
  await page.getByTestId('start-game').click();
  await page.getByTestId('found-city').click();
  await page.getByText('새벽정원', { exact: true }).first().waitFor();
  await page.waitForFunction(() => new Promise(resolve => {
    const request = indexedDB.open('hex-empires-dawn-saves-v1', 1);
    request.onsuccess = () => { const db = request.result; const saved = db.transaction('saves', 'readonly').objectStore('saves').get('auto'); saved.onsuccess = () => { const ok = saved.result?.state?.cities?.some(city => city.owner === 0); db.close(); resolve(ok); }; };
  }));
  await mkdir('artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots/subpath-game.png', fullPage: true });
  await page.reload();
  await page.getByTestId('continue-game').click();
  await page.getByText('새벽정원', { exact: true }).first().waitFor();
  if (!assets.length || errors.length) throw new Error(`Subpath assets/errors: ${JSON.stringify({ assets, errors })}`);
  const report = { measuredAt: new Date().toISOString(), environment: `${process.platform} / ${await browser.version()}`, basePath: prefix, http: 200, newGame: true, foundedCity: true, savedReload: true, assets, errors, note: 'Local production artifact under a project subpath; this is not a deployed public URL.' };
  await writeFile('artifacts/subpath-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
